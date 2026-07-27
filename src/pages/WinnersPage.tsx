import projectLogo from '../../image.png';

import {
  APP_DISPLAY_NAME,
  PageHeader,
  PageShell,
  type AppRoute
} from '../components/PageShell';
import {
  EmptyState,
  MetricCard
} from '../components/Primitives';
import {
  formatCampaignCancellation,
  formatCampaignRange,
  formatCompactTimestamp,
  formatCountdown,
  formatCurrencyRubles,
  formatDateTime,
  formatParticipantCount,
  formatPrimeWindow,
  formatRaffleSource
} from '../lib/ui-format';
import { formatServerDisplayName } from '../lib/ui-copy';
import type {
  CombinedSnapshot,
  ExporterRaffleActiveSnapshot,
  ExporterRaffleCampaignSnapshot,
  ExporterRaffleHistoryEntrySnapshot,
  ExporterRaffleSnapshot,
  ExporterServerSnapshot
} from '../types';

type RaffleServerSnapshot = {
  server: ExporterServerSnapshot;
  raffles: ExporterRaffleSnapshot;
};

type ActiveRaffleView = {
  server: ExporterServerSnapshot;
  active: ExporterRaffleActiveSnapshot;
};

type RaffleHistoryView = {
  server: ExporterServerSnapshot;
  entry: ExporterRaffleHistoryEntrySnapshot;
};

type RaffleBudgetView = {
  limitRubles: number;
  spentRubles: number;
  remainingRubles: number;
};

type RaffleCampaignView = {
  campaign: ExporterRaffleCampaignSnapshot;
  budget: RaffleBudgetView;
};

type WinnersPageProps = {
  snapshot: CombinedSnapshot;
  now: number;
  route: AppRoute;
  vipShopUrl: string | null;
};

const EMPTY_RAFFLE_BUDGET: RaffleBudgetView = {
  limitRubles: 0,
  spentRubles: 0,
  remainingRubles: 0
};

function getRaffleServers(snapshot: CombinedSnapshot): RaffleServerSnapshot[] {
  return snapshot.servers.flatMap((server) =>
    server.raffles ? [{ server, raffles: server.raffles }] : []
  );
}

function getActiveRaffles(raffleServers: RaffleServerSnapshot[]): ActiveRaffleView[] {
  return raffleServers.flatMap(({ server, raffles }) =>
    raffles.active ? [{ server, active: raffles.active }] : []
  );
}

function getRaffleHistory(raffleServers: RaffleServerSnapshot[]): RaffleHistoryView[] {
  return raffleServers
    .flatMap(({ server, raffles }) =>
      raffles.history.map((entry) => ({
        server,
        entry
      }))
    )
    .sort((left, right) => {
      const leftTime = Date.parse(left.entry.endedAt || left.entry.startedAt || '') || 0;
      const rightTime = Date.parse(right.entry.endedAt || right.entry.startedAt || '') || 0;
      return rightTime - leftTime;
    });
}

function getRaffleCampaignKey(campaign: ExporterRaffleCampaignSnapshot): string {
  return JSON.stringify([
    campaign.startsAt,
    campaign.endsAt,
    campaign.cancelled,
    campaign.cancelledAt,
    campaign.autoStartEnabled,
    campaign.autoPrizes,
    campaign.primeTimeStartHour,
    campaign.primeTimeEndHour,
    campaign.timezoneOffsetMinutes,
    campaign.minimumPrimePlayers,
    campaign.durationSeconds
  ]);
}

function getRaffleCampaigns(raffleServers: RaffleServerSnapshot[]): RaffleCampaignView[] {
  const campaigns = new Map<string, RaffleCampaignView>();

  for (const { raffles } of raffleServers) {
    for (const campaign of raffles.campaigns) {
      const key = getRaffleCampaignKey(campaign);
      if (!campaigns.has(key)) {
        campaigns.set(key, { campaign, budget: raffles.budget });
      }
    }
  }

  return [...campaigns.values()].sort((left, right) => {
    const leftStart = Date.parse(left.campaign.startsAt || '') || Number.MAX_SAFE_INTEGER;
    const rightStart = Date.parse(right.campaign.startsAt || '') || Number.MAX_SAFE_INTEGER;
    return leftStart - rightStart;
  });
}

function isPlannedCampaign(campaign: ExporterRaffleCampaignSnapshot, now: number): boolean {
  if (campaign.cancelled) return false;
  const startsAt = Date.parse(campaign.startsAt || '');
  return Number.isFinite(startsAt) && startsAt > now;
}

function isCurrentCampaign(campaign: ExporterRaffleCampaignSnapshot, now: number): boolean {
  if (campaign.cancelled) return false;
  const startsAt = Date.parse(campaign.startsAt || '');
  const endsAt = Date.parse(campaign.endsAt || '');
  const hasStarted = !Number.isFinite(startsAt) || startsAt <= now;
  const hasNotEnded = !Number.isFinite(endsAt) || endsAt > now;
  return hasStarted && hasNotEnded;
}

function getCancelledCampaign(campaigns: RaffleCampaignView[]): RaffleCampaignView | null {
  return (
    campaigns
      .filter(({ campaign }) => campaign.cancelled)
      .sort((left, right) => {
        const leftTime = Date.parse(left.campaign.cancelledAt || left.campaign.startsAt || '') || 0;
        const rightTime = Date.parse(right.campaign.cancelledAt || right.campaign.startsAt || '') || 0;
        return rightTime - leftTime;
      })[0] || null
  );
}

function getPrimaryRaffleServer(raffleServers: RaffleServerSnapshot[]): RaffleServerSnapshot | null {
  return (
    raffleServers.find(({ raffles }) => raffles.campaigns.length) ||
    raffleServers.find(({ raffles }) => raffles.active) ||
    raffleServers.find(({ raffles }) => raffles.history.length) ||
    raffleServers[0] ||
    null
  );
}

export function WinnersPage({ snapshot, now, route, vipShopUrl }: WinnersPageProps) {
  const raffleServers = getRaffleServers(snapshot);
  const activeRaffles = getActiveRaffles(raffleServers);
  const history = getRaffleHistory(raffleServers);
  const campaigns = getRaffleCampaigns(raffleServers);
  const plannedCampaigns = campaigns.filter(({ campaign }) => isPlannedCampaign(campaign, now));
  const currentCampaign = campaigns.find(({ campaign }) => isCurrentCampaign(campaign, now)) || null;
  const cancelledCampaign = getCancelledCampaign(campaigns);
  const summaryCampaign = currentCampaign || cancelledCampaign;
  const primaryRaffleServer = getPrimaryRaffleServer(raffleServers);
  const budget = primaryRaffleServer?.raffles.budget || EMPTY_RAFFLE_BUDGET;
  const latestWinner = history.find((item) => item.entry.winner)?.entry.winner || null;

  return (
    <PageShell
      currentRoute={route}
      vipShopUrl={vipShopUrl}
      className="winners-shell"
      testId="winners-page"
    >
      <PageHeader
        eyebrow="Розыгрыши BSS"
        title="Победители розыгрышей"
        description="Здесь собраны текущие розыгрыши и история победителей со всех серверов BSS."
        className="winners-hero"
        headingClassName="winners-hero-main"
        eyebrowClassName="eyebrow"
        descriptionClassName="hero-copy"
        titleTestId="winners-title"
        before={
          <div className="winners-hero-top">
            <div className="hero-brand">
              <div className="hero-logo-shell hero-logo-shell-compact">
                <img className="hero-logo" src={projectLogo} alt={`Логотип ${APP_DISPLAY_NAME}`} />
              </div>
              <div className="hero-brand-copy">
                <span className="hero-brand-kicker">BREAKING SQUAD</span>
                <span className="hero-brand-subtitle">розыгрыши и победители</span>
              </div>
            </div>
          </div>
        }
      >
        <div className="winners-hero-stats">
          <MetricCard label="Активно" value={activeRaffles.length} />
          <MetricCard label="История" value={history.length} />
          <MetricCard
            label="Последний победитель"
            value={latestWinner?.name || '—'}
          />
          <MetricCard
            label="Обновлено"
            value={formatCompactTimestamp(snapshot.generatedAt)}
          />
        </div>
      </PageHeader>

      {raffleServers.length ? (
        <>
          {plannedCampaigns.length ? (
            <section
              className="section-shell planned-campaigns"
              data-testid="planned-campaigns"
              aria-label="Планируемые серии розыгрышей"
            >
              {plannedCampaigns.map(({ campaign, budget: campaignBudget }) => (
                <article
                  className="planned-campaign-notification"
                  data-testid="planned-campaign-notification"
                  key={getRaffleCampaignKey(campaign)}
                >
                  <span className="planned-campaign-kicker">Анонс</span>
                  <div className="planned-campaign-copy">
                    <strong>Планируется серия розыгрышей. Не пропустите</strong>
                  </div>
                  <div className="winners-meta-row planned-campaign-meta">
                    <span>{formatCampaignRange(campaign)}</span>
                    <span>{formatPrimeWindow(campaign)}</span>
                    <span>{campaign.minimumPrimePlayers}+ игроков</span>
                    <span>Банк {formatCurrencyRubles(campaignBudget.limitRubles)}</span>
                  </div>
                </article>
              ))}
            </section>
          ) : null}

          <section className="section-shell winners-summary-grid">
            {summaryCampaign ? (
              <article className="winners-card winners-campaign-card" data-testid="winners-campaign-card">
                <span className="overview-label">Серия</span>
                <strong>
                  {summaryCampaign.campaign.cancelled ? 'Серия розыгрышей отменена' : 'Серия розыгрышей'}
                </strong>
                <p>
                  {summaryCampaign.campaign.cancelled
                    ? formatCampaignCancellation(summaryCampaign.campaign)
                    : formatCampaignRange(summaryCampaign.campaign)}
                </p>
                <div className="winners-meta-row">
                  <span>{formatPrimeWindow(summaryCampaign.campaign)}</span>
                  <span>{summaryCampaign.campaign.minimumPrimePlayers}+ игроков</span>
                  <span>Банк {formatCurrencyRubles(summaryCampaign.budget.limitRubles)}</span>
                </div>
              </article>
            ) : null}

            <article className="winners-card winners-card-active" data-testid="winners-active-card">
              <span className="overview-label">Активный розыгрыш</span>
              {activeRaffles.length ? (
                <div className="winners-active-list">
                  {activeRaffles.map(({ server, active }) => {
                    const endsAtMs = Date.parse(active.endsAt || '');
                    const countdownMs = Number.isFinite(endsAtMs) ? Math.max(0, endsAtMs - now) : 0;

                    return (
                      <div key={`${server.id}-${active.startedAt || active.prize}`} className="winners-active-item">
                        <strong>{active.prize}</strong>
                        <p>{formatServerDisplayName(server)}</p>
                        <div className="winners-meta-row">
                          <span>{formatParticipantCount(active.participantCount)}</span>
                          <span>{formatRaffleSource(active.source)}</span>
                          <span>{active.endsAt ? formatCountdown(countdownMs) : '—'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="winners-empty-copy">Активных розыгрышей сейчас нет.</p>
              )}
            </article>

            <article className="winners-card" data-testid="winners-budget-card">
              <span className="overview-label">Бюджет</span>
              <strong>{formatCurrencyRubles(budget.remainingRubles)}</strong>
              <p>
                Осталось из {formatCurrencyRubles(budget.limitRubles)}. Потрачено{' '}
                {formatCurrencyRubles(budget.spentRubles)}.
              </p>
            </article>

            <article className="winners-card">
              <span className="overview-label">Серверы с розыгрышами</span>
              <strong>{raffleServers.length}</strong>
              <p>
                {raffleServers
                  .map((item) => formatServerDisplayName(item.server))
                  .join(', ')}
              </p>
            </article>
          </section>

          <section className="section-shell">
            <div className="section-head">
              <div>
                <span className="section-eyebrow">История</span>
                <h2>Последние победители</h2>
              </div>
              <p>Завершённые розыгрыши со всех серверов.</p>
            </div>

            <div className="winners-history-list" data-testid="winners-history-list">
              {history.length ? (
                history.map(({ server, entry }) => {
                  const entryKey = `${server.id}-${entry.id || entry.startedAt || entry.prize}`;
                  const participantTestId = entry.id ?? entryKey;

                  return (
                    <article key={entryKey} className="winner-row">
                      <div className="winner-row-main">
                        <span className="winner-server">{formatServerDisplayName(server)}</span>
                        <strong>{entry.winner?.name || 'без победителя'}</strong>
                        <p>{entry.prize}</p>
                      </div>
                      <div className="winner-row-meta">
                        <span>{formatDateTime(entry.endedAt || entry.startedAt)}</span>
                        <span>{formatCurrencyRubles(entry.amountRubles)}</span>
                        <span>{formatParticipantCount(entry.participants.length)}</span>
                      </div>
                      <details
                        className="winner-participants"
                        data-testid={`winner-participants-${participantTestId}`}
                      >
                        <summary>Участники ({entry.participants.length})</summary>
                        {entry.participants.length ? (
                          <ul>
                            {entry.participants.map((participant, participantIndex) => (
                              <li
                                key={`${participant.name}-${participant.joinedAt || participantIndex}`}
                              >
                                {participant.name}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>Участников не было.</p>
                        )}
                      </details>
                    </article>
                  );
                })
              ) : (
                <div className="roster-empty">Завершённых розыгрышей пока нет.</div>
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="section-shell">
          <EmptyState
            className="winners-empty-state"
            testId="winners-empty"
            eyebrow="Розыгрыши"
            title="Данных о розыгрышах пока нет"
            description="Данные о розыгрышах пока не поступили. Загляните позже."
          />
        </section>
      )}
    </PageShell>
  );
}
