import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  PageHeader,
  PageShell,
  type AppRoute
} from '../components/PageShell';
import {
  EmptyState,
  SegmentedControl
} from '../components/Primitives';
import { resolveAchievementIconUrl } from '../lib/achievement-icons';
import {
  buildRoleLeaderboardHash,
  fetchRoleLeaderboard,
  getCurrentRolePeriodId,
  readRoleLeaderboardSelection,
  resolveRoleLeaderboardUrl,
  roleLeaderboardUsesGrowingMonthThreshold,
  ROLE_LEADERBOARD_LEGACY_MONTH_THRESHOLD_NOTE,
  ROLE_LEADERBOARD_MONTH_THRESHOLD_NOTE,
  ROLE_LEADERBOARD_PERIODS,
  ROLE_LEADERBOARD_ROLES,
  ROLE_LEADERBOARD_SQUAD_SIZES,
  roleLeaderboardHasIncompleteFacts,
  roleLeaderboardUsesSquadSize,
  shiftRolePeriodId
} from '../lib/leaderboards';
import {
  getAchievementCopy,
  getRoleMetricCopy,
  ROLE_LEADERBOARD_GUIDES
} from '../lib/role-leaderboard-copy';
import { classNames, getSafeHttpUrl } from '../lib/ui';
import {
  formatCompactTimestamp,
  formatLeaderboardDecimal,
  formatLeaderboardNumber
} from '../lib/ui-format';
import { USER_STATE_COPY } from '../lib/ui-copy';
import type {
  AppConfig,
  RoleLeaderboardAchievement,
  RoleLeaderboardEntry,
  RoleLeaderboardMethodology,
  RoleLeaderboardPendingEntry,
  RoleLeaderboardResponse,
  RoleLeaderboardRole,
  RoleLeaderboardSelection
} from '../types';

type RoleLeaderboardDisplayEntry =
  | RoleLeaderboardEntry
  | RoleLeaderboardPendingEntry;

type LeaderboardsPageProps = {
  config: AppConfig;
  route: AppRoute;
  vipShopUrl: string | null;
};

type LeaderboardLoadState = 'unavailable' | 'loading' | 'ready' | 'error';

const ROLE_PRIMARY_METRICS: Record<RoleLeaderboardRole, string[]> = {
  player: ['resourceSwingPer90', 'resourceSwing', 'temporaryPressurePer90'],
  squad_leader: ['kd', 'knockdownsPer100PersonHours', 'revivesPer100PersonHours'],
  commander: ['winRate', 'averageSurprise', 'averageHoursGap']
};

function roleMetricValue(
  entry: RoleLeaderboardDisplayEntry,
  key: string
): number | boolean | null {
  const groups = [entry.indicators, entry.totals, entry.style, entry.dataQuality];
  for (const group of groups) {
    if (key in group) return group[key] ?? null;
  }
  return null;
}

function formatRoleMetric(key: string, value: number | boolean | null | undefined): string {
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (key === 'winRate' || key === 'combatConversion') {
    return `${formatLeaderboardDecimal(value * 100)}%`;
  }
  if (key === 'averageSurprise') {
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${formatLeaderboardDecimal(value * 100)} п.п.`;
  }
  if (key === 'averageHoursGap') {
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${formatLeaderboardNumber(value)} ч`;
  }
  if (
    key === 'kd' ||
    key.includes('Per') ||
    key === 'resourceSwing' ||
    key.startsWith('average')
  ) {
    return formatLeaderboardDecimal(value);
  }
  return formatLeaderboardNumber(value);
}

function formatCoverage(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function formatRolePeriodRange(response: RoleLeaderboardResponse | null): string {
  if (!response?.startAt || !response?.endAt) return response?.periodId || 'Текущий период';
  const start = new Date(response.startAt);
  const end = new Date(new Date(response.endAt).getTime() - 1);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return response.periodId;
  }
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    timeZone: response.timeZone,
    day: 'numeric',
    month: 'short',
    year: response.period === 'month' ? 'numeric' : undefined
  });
  if (response.period === 'day') return formatter.format(start);
  return `${formatter.format(start)} — ${formatter.format(end)}`;
}

function roleMetricLabel(
  key: string,
  methodology?: RoleLeaderboardMethodology | null
): string {
  return (
    getRoleMetricCopy(key, methodology)?.label || 'Дополнительный показатель'
  );
}

function AchievementDialog({
  achievement,
  dialogId,
  iconUrl,
  title,
  description,
  onClose
}: {
  achievement: RoleLeaderboardAchievement;
  dialogId: string;
  iconUrl: string | null;
  title: string;
  description: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `${dialogId}-title`;
  const descriptionId = `${dialogId}-description`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }, []);

  const close = () => {
    const dialog = dialogRef.current;
    if (dialog?.open && typeof dialog.close === 'function') dialog.close();
    else onClose();
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      id={dialogId}
      className="achievement-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const outside =
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom;
        if (outside) close();
      }}
      data-testid="achievement-dialog"
    >
      <header className="achievement-dialog-head">
        <strong id={titleId}>{title}</strong>
        <button
          type="button"
          className="achievement-dialog-close"
          onClick={close}
          autoFocus
          data-testid="achievement-dialog-close"
        >
          Закрыть
        </button>
      </header>
      <div className="achievement-dialog-body">
        {iconUrl ? (
          <img
            className="achievement-dialog-image"
            src={iconUrl}
            alt=""
            width="180"
            height="180"
            data-testid={`achievement-dialog-preview-${achievement.code}`}
          />
        ) : null}
        <p id={descriptionId}>{description}</p>
        <p className="achievement-dialog-reason">
          <strong>Почему выдано</strong>
          <span>{achievement.reason}</span>
        </p>
      </div>
    </dialog>,
    document.body
  );
}

function AchievementBadge({
  achievement,
  tooltipId,
  methodology
}: {
  achievement: RoleLeaderboardAchievement;
  tooltipId: string;
  methodology?: RoleLeaderboardMethodology | null;
}) {
  const iconUrl = resolveAchievementIconUrl(achievement.code, import.meta.env.BASE_URL);
  const copy = getAchievementCopy(achievement.code, methodology);
  const title = copy?.title || achievement.title;
  const description = copy?.description || achievement.description;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const dialogId = `${tooltipId}-dialog`;
  const closeDialog = () => {
    setDialogOpen(false);
    window.requestAnimationFrame(() => buttonRef.current?.focus());
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="achievement-badge"
        aria-label={`${title}. Показать, за что выдана ачивка`}
        aria-describedby={tooltipId}
        aria-haspopup="dialog"
        aria-expanded={dialogOpen}
        aria-controls={dialogId}
        data-testid={`achievement-${achievement.code}`}
        onClick={() => setDialogOpen(true)}
      >
        {iconUrl ? (
          <img
            className="achievement-badge-icon"
            src={iconUrl}
            alt=""
            loading="lazy"
            width="48"
            height="48"
          />
        ) : (
          <span className="achievement-fallback" aria-hidden="true">
            ◆
          </span>
        )}
        <span className="achievement-tooltip" role="tooltip" id={tooltipId}>
          {iconUrl ? (
            <img
              className="achievement-tooltip-image"
              src={iconUrl}
              alt=""
              width="144"
              height="144"
              data-testid={`achievement-preview-${achievement.code}`}
            />
          ) : null}
          <strong>{title}</strong>
          <span>{description}</span>
          <small>Почему выдано: {achievement.reason}</small>
        </span>
      </button>
      {dialogOpen ? (
        <AchievementDialog
          achievement={achievement}
          dialogId={dialogId}
          iconUrl={iconUrl}
          title={title}
          description={description}
          onClose={closeDialog}
        />
      ) : null}
    </>
  );
}

function AchievementList({
  entry,
  prefix,
  methodology
}: {
  entry: RoleLeaderboardDisplayEntry;
  prefix: string;
  methodology?: RoleLeaderboardMethodology | null;
}) {
  if (!entry.achievements.length) {
    return <span className="achievement-empty">Ачивок пока нет</span>;
  }
  return (
    <span className="achievement-list" aria-label="Ачивки участника">
      {entry.achievements.map((achievement, index) => (
        <AchievementBadge
          key={achievement.code}
          achievement={achievement}
          tooltipId={`${prefix}-${achievement.code}-${index}`}
          methodology={methodology}
        />
      ))}
    </span>
  );
}

function RoleMetricSet({
  entry,
  role,
  methodology,
  compact = false
}: {
  entry: RoleLeaderboardDisplayEntry;
  role: RoleLeaderboardRole;
  methodology?: RoleLeaderboardMethodology | null;
  compact?: boolean;
}) {
  return (
    <span className={classNames('role-metric-set', compact && 'role-metric-set-compact')}>
      {ROLE_PRIMARY_METRICS[role].map((key) => (
        <span className="role-metric" key={key}>
          <small>{roleMetricLabel(key, methodology)}</small>
          <strong>{formatRoleMetric(key, roleMetricValue(entry, key))}</strong>
        </span>
      ))}
    </span>
  );
}

function RoleEntryExplanation({
  entry,
  response
}: {
  entry: RoleLeaderboardDisplayEntry;
  response: RoleLeaderboardResponse;
}) {
  const detailMetrics = [
    ...Object.entries(entry.totals),
    ...Object.entries(entry.style),
    ...Object.entries(entry.dataQuality)
  ].filter(([key]) => getRoleMetricCopy(key, response.methodology));

  return (
    <details className="role-entry-explanation">
      <summary>Как получено место</summary>
      <div className="role-entry-explanation-body">
        <div>
          <span className="overview-label">Показатели сравниваются по порядку</span>
          <ol>
            {response.ranking.sortKeys.map((key) => {
              const metric = getRoleMetricCopy(key, response.methodology);
              return (
                <li key={key}>
                  <strong>{metric?.label || 'Дополнительный показатель'}</strong>
                  {metric?.explanation ? <span>{metric.explanation}</span> : null}
                </li>
              );
            })}
          </ol>
        </div>
        {detailMetrics.length ? (
          <dl>
            {detailMetrics.map(([key, value]) => {
              const metric = getRoleMetricCopy(key, response.methodology);
              return (
                <div key={key}>
                  <dt>
                    {metric?.label}
                    <small>{metric?.explanation}</small>
                  </dt>
                  <dd>{formatRoleMetric(key, value)}</dd>
                </div>
              );
            })}
          </dl>
        ) : null}
        {entry.achievements.length ? (
          <div className="role-achievement-reasons">
            <span className="overview-label">Ачивки не влияют на место</span>
            {entry.achievements.map((achievement) => {
              const copy = getAchievementCopy(
                achievement.code,
                response.methodology
              );
              return (
                <p key={achievement.code}>
                  <strong>{copy?.title || achievement.title}</strong>
                  <span>{copy?.description || achievement.description}</span>
                  <small>Почему выдано: {achievement.reason}</small>
                </p>
              );
            })}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function RoleLeaderboardMethodology({
  response
}: {
  response: RoleLeaderboardResponse;
}) {
  const guide = ROLE_LEADERBOARD_GUIDES[response.role];
  const methodology = response.methodology;
  const participation = methodology?.participation.length
    ? methodology.participation
    : [guide.admission];
  const limitations = methodology?.limitations.length
    ? methodology.limitations
    : [guide.limitation];
  const ranking = methodology?.ranking.length
    ? methodology.ranking
    : response.ranking.sortKeys.map((key) => {
        const metric = getRoleMetricCopy(key);
        return {
          key,
          label: metric?.label || 'Дополнительный показатель',
          description: metric?.explanation || ''
        };
      });
  const formulas = methodology?.formulas.length
    ? methodology.formulas
    : response.role === 'player'
      ? [
          {
            label: 'Полезный размен',
            expression: 'засчитанные убийства + поднятия − смерти − тимкиллы',
            description:
              'Нок и последующая смерть считаются одним эпизодом, а не двумя убийствами.'
          }
        ]
      : [];
  const achievementRules = methodology?.achievementRules.length
    ? methodology.achievementRules
    : [
        `Ачивки считаются по накопленной истории до конца выбранного периода и не меняют место в топе.`,
        `Для выдачи нужна группа минимум из ${response.achievements.minimumComparisonGroup} сопоставимых участников; показывается до трёх ачивок.`
      ];
  const achievementCatalog = methodology?.achievements.length
    ? methodology.achievements.map((achievement) => ({
        code: achievement.code,
        title: achievement.title,
        description: achievement.description,
        rule: achievement.criteria
      }))
    : guide.achievements.map(({ code, rule }) => {
        const copy = getAchievementCopy(code);
        return {
          code,
          title: copy?.title || 'Ачивка',
          description: copy?.description || '',
          rule
        };
      });

  return (
    <details className="role-methodology" data-testid="leaderboards-methodology">
      <summary>Как считаются места и ачивки</summary>
      <div className="role-methodology-body">
        <section>
          <span className="overview-label">
            {methodology?.roleTitle || guide.title}
          </span>
          <p>{methodology?.summary || guide.ranking}</p>
          <strong className="role-methodology-subtitle">Как матч идёт в зачёт</strong>
          <ul className="role-methodology-notes">
            {participation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <strong className="role-methodology-subtitle">
            Чего пока нет в расчёте
          </strong>
          <ul className="role-methodology-notes role-methodology-notes-muted">
            {limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section>
          <span className="overview-label">Как определяется место</span>
          <ol className="role-methodology-metrics">
            {ranking.map((metric) => (
              <li key={metric.key}>
                <strong>{metric.label}</strong>
                <span>{metric.description}</span>
              </li>
            ))}
          </ol>
          {formulas.map((formula) => (
            <p className="role-formula" key={formula.label}>
              <strong>{formula.label}</strong>
              <span>{formula.expression}</span>
              <small>{formula.description}</small>
            </p>
          ))}
        </section>

        <section>
          <span className="overview-label">Все ачивки этой роли</span>
          <ul className="role-methodology-notes">
            {achievementRules.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="role-achievement-catalog">
            {achievementCatalog.map(({ code, title, description, rule }) => {
              const iconUrl = resolveAchievementIconUrl(code, import.meta.env.BASE_URL);
              return (
                <article key={code}>
                  {iconUrl ? (
                    <img src={iconUrl} alt="" loading="lazy" width="48" height="48" />
                  ) : null}
                  <div>
                    <strong>{title}</strong>
                    <span>{description}</span>
                    <small>{rule}</small>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </details>
  );
}

function RolePodiumCard({
  entry,
  response
}: {
  entry: RoleLeaderboardEntry;
  response: RoleLeaderboardResponse;
}) {
  return (
    <article
      className={classNames('role-podium-card', `role-podium-card-${entry.rank}`)}
      data-testid={`leaderboards-row-${entry.rank}`}
    >
      <div className="role-podium-head">
        <span className="leaderboard-rank">#{entry.rank}</span>
        <AchievementList
          entry={entry}
          prefix={`podium-${entry.rank}`}
          methodology={response.methodology}
        />
      </div>
      <strong className="role-entry-name">{entry.name}</strong>
      <span className="role-match-progress">
        Матчей: {entry.matches} · минимум: {response.minimumMatches}
      </span>
      <RoleMetricSet
        entry={entry}
        role={response.role}
        methodology={response.methodology}
      />
      <RoleEntryExplanation entry={entry} response={response} />
    </article>
  );
}

export function LeaderboardsPage({ config, route, vipShopUrl }: LeaderboardsPageProps) {
  const sourceUrl = useMemo(
    () => getSafeHttpUrl(resolveRoleLeaderboardUrl(config.leaderboards)),
    [config.leaderboards]
  );
  const [selection, setSelection] = useState<RoleLeaderboardSelection>(() =>
    readRoleLeaderboardSelection(window.location.hash)
  );
  const [response, setResponse] = useState<RoleLeaderboardResponse | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loadState, setLoadState] = useState<LeaderboardLoadState>(
    sourceUrl ? 'loading' : 'unavailable'
  );

  useEffect(() => {
    const nextHash = buildRoleLeaderboardHash(selection);
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash);
    }
  }, [selection]);

  useEffect(() => {
    setExpanded(false);
  }, [
    selection.period,
    selection.periodId,
    selection.role,
    selection.squadSize
  ]);

  useEffect(() => {
    if (!sourceUrl) {
      setResponse(null);
      setLoadState('unavailable');
      return;
    }

    let cancelled = false;
    setResponse(null);
    setLoadState('loading');
    void fetchRoleLeaderboard(sourceUrl, selection)
      .then((result) => {
        if (cancelled) return;
        setResponse(result);
        setLoadState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setResponse(null);
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [selection, sourceUrl]);

  const currentPeriodId = getCurrentRolePeriodId(selection.period);
  const activePeriodId = selection.periodId || response?.periodId || currentPeriodId;
  const hasEntries = loadState === 'ready' && Boolean(response?.entries.length);
  const hasIncompleteFacts = Boolean(
    response && roleLeaderboardHasIncompleteFacts(response)
  );
  const visibleEntries =
    response?.entries.slice(0, expanded ? response.entries.length : 5) || [];
  const podiumEntries = visibleEntries.slice(0, 3);
  const tableEntries = visibleEntries.slice(3);
  const hasExpandableEntries = Boolean(
    response &&
      (response.totalEntries > 5 || response.totalPendingEntries > 0)
  );

  const updateSelection = (values: Partial<RoleLeaderboardSelection>) => {
    setSelection((current) => ({ ...current, ...values }));
  };
  const moveArchive = (direction: -1 | 1) => {
    const shifted = shiftRolePeriodId(selection.period, activePeriodId, direction);
    updateSelection({
      periodId: shifted >= currentPeriodId ? null : shifted
    });
  };

  return (
    <PageShell
      currentRoute={route}
      vipShopUrl={vipShopUrl}
      className="leaderboards-shell"
      testId="leaderboards-page"
    >
      <PageHeader
        eyebrow="Топы по ролям"
        title="Ролевые топы BSS"
        description="Место даёт статистика выбранного периода. Ачивки показывают стиль игры по накопленной истории и не дают скрытых очков."
        className="winners-hero leaderboards-hero"
        headingClassName="leaderboards-heading"
        eyebrowClassName="eyebrow"
        descriptionClassName="hero-copy"
        titleTestId="leaderboards-title"
      >
        <div className="leaderboard-control-stack">
          <SegmentedControl label="Период топа" className="leaderboard-periods">
            {ROLE_LEADERBOARD_PERIODS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                className={classNames(
                  'segment leaderboard-period-button',
                  selection.period === entry.value && 'segment-active'
                )}
                aria-pressed={selection.period === entry.value}
                data-testid={`leaderboard-period-${entry.value}`}
                onClick={() => updateSelection({ period: entry.value, periodId: null })}
              >
                <span>{entry.label}</span>
                <small>{entry.description}</small>
              </button>
            ))}
          </SegmentedControl>

          {selection.period === 'month' ? (
            <p
              className="leaderboard-month-threshold-note"
              data-testid="leaderboard-month-threshold-note"
            >
              {response?.period === 'month' &&
              !roleLeaderboardUsesGrowingMonthThreshold(response.rulesVersion)
                ? ROLE_LEADERBOARD_LEGACY_MONTH_THRESHOLD_NOTE
                : ROLE_LEADERBOARD_MONTH_THRESHOLD_NOTE}
            </p>
          ) : null}

          <SegmentedControl label="Роль" className="leaderboard-role-row">
            {ROLE_LEADERBOARD_ROLES.map((entry) => (
              <button
                key={entry.value}
                type="button"
                className={classNames(
                  'segment leaderboard-role-button',
                  selection.role === entry.value && 'segment-active'
                )}
                aria-pressed={selection.role === entry.value}
                data-testid={`leaderboard-role-${entry.value}`}
                onClick={() => updateSelection({ role: entry.value })}
              >
                {entry.label}
              </button>
            ))}
          </SegmentedControl>

          <div className="leaderboard-squad-size-slot">
            {roleLeaderboardUsesSquadSize(selection.role) ? (
              <SegmentedControl
                label="Размер отряда"
                className="leaderboard-squad-size-row"
              >
                {ROLE_LEADERBOARD_SQUAD_SIZES.map((entry) => (
                  <button
                    key={entry.value}
                    type="button"
                    className={classNames(
                      'segment leaderboard-squad-size-button',
                      selection.squadSize === entry.value && 'segment-active'
                    )}
                    aria-pressed={selection.squadSize === entry.value}
                    data-testid={`leaderboard-squad-size-${entry.value}`}
                    onClick={() => updateSelection({ squadSize: entry.value })}
                  >
                    <span>{entry.label}</span>
                    <small>{entry.description} человек</small>
                  </button>
                ))}
              </SegmentedControl>
            ) : (
              <div className="leaderboard-filter-placeholder">
                Командир оценивается по результату всей стороны, поэтому размер
                его отряда здесь не используется.
              </div>
            )}
          </div>

          <div className="leaderboard-archive-row" aria-label="Архивный период">
            <button
              type="button"
              className="leaderboard-archive-button"
              aria-label="Предыдущий период"
              data-testid="leaderboard-archive-previous"
              onClick={() => moveArchive(-1)}
            >
              ←
            </button>
            <strong data-testid="leaderboard-period-label">
              {response ? formatRolePeriodRange(response) : activePeriodId}
            </strong>
            <button
              type="button"
              className="leaderboard-archive-button"
              aria-label="Следующий период"
              data-testid="leaderboard-archive-next"
              disabled={!selection.periodId}
              onClick={() => moveArchive(1)}
            >
              →
            </button>
          </div>
        </div>
      </PageHeader>

      {response ? (
        <section
          className={classNames(
            'leaderboard-context-strip',
            hasIncompleteFacts && 'leaderboard-context-strip-warning'
          )}
          data-testid="leaderboard-context"
        >
          <span>
            <small>Матчей за период</small>
            <strong>{response.dataQuality.sourceMatches}</strong>
          </span>
          <span>
            <small>Минимум для входа</small>
            <strong>{response.minimumMatches}</strong>
          </span>
          <span>
            <small>В топе / участвуют</small>
            <strong>
              {response.progress.qualified} / {response.progress.candidates}
            </strong>
          </span>
          <span>
            <small>Матчей для ачивок</small>
            <strong>{response.dataQuality.achievementHistoryMatches}</strong>
          </span>
          <span>
            <small>Матчей с обеими сторонами</small>
            <strong>{formatCoverage(response.dataQuality.factsCoverage)}</strong>
          </span>
          <span>
            <small>Игроков с известными часами</small>
            <strong>{formatCoverage(response.dataQuality.hoursCoverage)}</strong>
          </span>
          <span>
            <small>Обновлено</small>
            <strong>{formatCompactTimestamp(response.generatedAt || undefined)}</strong>
          </span>
          {response.stale ? <em>Обновление задерживается — показан последний расчёт</em> : null}
          {hasIncompleteFacts ? (
            <em>Часть матчей записана неполно — доступные места всё равно показаны</em>
          ) : null}
        </section>
      ) : null}

      {response ? <RoleLeaderboardMethodology response={response} /> : null}

      <section className="section-shell leaderboard-section">
        {loadState === 'unavailable' ? (
          <EmptyState
            className="leaderboard-empty-state"
            testId="leaderboards-empty"
            eyebrow="Ролевые топы"
            title={USER_STATE_COPY.forming.title}
            description={USER_STATE_COPY.forming.description}
          />
        ) : null}

        {loadState === 'loading' ? (
          <EmptyState
            className="leaderboard-empty-state"
            testId="leaderboards-loading"
            eyebrow="Ролевые топы"
            title={USER_STATE_COPY.loading.title}
            description={USER_STATE_COPY.loading.description}
          />
        ) : null}

        {loadState === 'error' ? (
          <EmptyState
            className="leaderboard-empty-state"
            testId="leaderboards-error"
            eyebrow="Ролевые топы"
            title={USER_STATE_COPY.unavailable.title}
            description={USER_STATE_COPY.unavailable.description}
          />
        ) : null}

        {loadState === 'ready' && response && !response.entries.length ? (
          <EmptyState
            className="leaderboard-empty-state"
            testId="leaderboards-empty"
            eyebrow={
              response.status === 'empty' ? 'Период ещё пуст' : 'Идёт набор матчей'
            }
            title={
              response.available
                ? 'Пока никто не прошёл в топ'
                : 'Рейтинг этого периода ещё не рассчитан'
            }
            description={`Минимум для входа: ${response.minimumMatches}. Сейчас участвуют: ${response.progress.candidates}. Разверните список, чтобы увидеть, кому и сколько матчей осталось до входа.`}
          />
        ) : null}

        {hasEntries && response ? (
          <>
            <div className="role-podium" data-testid="leaderboards-podium">
              {podiumEntries.map((entry) => (
                <RolePodiumCard
                  key={`${entry.rank}-${entry.name}`}
                  entry={entry}
                  response={response}
                />
              ))}
            </div>

            {tableEntries.length ? (
              <div className="leaderboard-table-wrap" data-testid="leaderboards-table">
                <div className="leaderboard-table-head">
                  <div>
                    <span className="overview-label">Остальные места</span>
                    <strong>{formatRolePeriodRange(response)}</strong>
                  </div>
                  <span>Минимум для входа: {response.minimumMatches}</span>
                </div>
                <div className="leaderboard-table role-leaderboard-table" role="table">
                  {tableEntries.map((entry) => (
                    <article
                      className="leaderboard-row role-leaderboard-row"
                      data-testid={`leaderboards-row-${entry.rank}`}
                      role="row"
                      key={`${entry.rank}-${entry.name}`}
                    >
                      <span className="leaderboard-rank">#{entry.rank}</span>
                      <span className="role-table-person">
                        <strong>{entry.name}</strong>
                        <small>
                          Матчей: {entry.matches} · минимум: {response.minimumMatches}
                        </small>
                      </span>
                      <RoleMetricSet
                        entry={entry}
                        role={response.role}
                        methodology={response.methodology}
                        compact
                      />
                      <AchievementList
                        entry={entry}
                        prefix={`row-${entry.rank}`}
                        methodology={response.methodology}
                      />
                      <RoleEntryExplanation entry={entry} response={response} />
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {loadState === 'ready' && response && hasExpandableEntries ? (
          <button
            type="button"
            className="leaderboard-expand-button"
            aria-expanded={expanded}
            data-testid="leaderboards-expand"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded
              ? 'Свернуть до топ-5'
              : `Развернуть весь топ (${response.totalEntries}) и кандидатов (${response.totalPendingEntries})`}
          </button>
        ) : null}

        {loadState === 'ready' &&
        response &&
        expanded &&
        response.pendingEntries.length ? (
          <div
            className="leaderboard-table-wrap leaderboard-pending-wrap"
            data-testid="leaderboards-pending"
          >
            <div className="leaderboard-table-head">
              <div>
                <span className="overview-label">Ещё набирают матчи</span>
                <strong>{response.totalPendingEntries} кандидатов</strong>
              </div>
              <span>Без места до прохождения порога</span>
            </div>
            <div className="leaderboard-table role-leaderboard-table" role="table">
              {response.pendingEntries.map((entry, index) => (
                <article
                  className="leaderboard-row role-leaderboard-row role-leaderboard-row-pending"
                  data-testid={`leaderboards-pending-${index + 1}`}
                  role="row"
                  key={`${entry.name}-${entry.matches}-${index}`}
                >
                  <span className="leaderboard-rank">—</span>
                  <span className="role-table-person">
                    <strong>{entry.name}</strong>
                    <small>
                      Матчей: {entry.matches} · минимум: {response.minimumMatches}
                    </small>
                    <em>Матчей до входа: {entry.matchesNeeded}</em>
                  </span>
                  <RoleMetricSet
                    entry={entry}
                    role={response.role}
                    methodology={response.methodology}
                    compact
                  />
                  <AchievementList
                    entry={entry}
                    prefix={`pending-${index + 1}`}
                    methodology={response.methodology}
                  />
                </article>
              ))}
            </div>
            {response.pendingTruncated ? (
              <p className="leaderboard-limit-note">
                Показаны первые {response.pendingEntries.length} кандидатов.
              </p>
            ) : null}
          </div>
        ) : null}

        {loadState === 'ready' && response && expanded && response.truncated ? (
          <p className="leaderboard-limit-note">
            Показаны первые {response.entries.length} зачётных мест.
          </p>
        ) : null}
      </section>
    </PageShell>
  );
}
