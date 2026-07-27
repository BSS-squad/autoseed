import { useMemo } from 'react';

import {
  buildTeamBalancerDiffView,
  buildTeamBalancerRosterMark,
  buildTeamBalancerSquadMark,
  type TeamBalancerDiffTone
} from '../lib/team-balancer-diff';
import { classNames } from '../lib/ui';
import {
  formatBalancerHistoryStatus,
  formatBalancerModeLabel,
  formatBalancerStatusLabel,
  formatCompactTimestamp,
  formatHours,
  formatPlayerMoveCount,
  formatSideLabel,
  formatSideMoveSummary
} from '../lib/ui-format';
import {
  formatSquadDisplayName,
  formatTeamDisplayName,
  ROLE_LABELS
} from '../lib/ui-copy';
import type {
  ExporterServerSnapshot,
  ExporterSquadSnapshot,
  ExporterTeamBalancerSnapshot,
  ExporterTeamSnapshot,
  TeamBalancerProposalMode
} from '../types';

type TeamPanelProps = {
  team: ExporterTeamSnapshot;
  opponent: ExporterTeamSnapshot | null;
  teamBalancerSnapshot: ExporterTeamBalancerSnapshot | null;
  teamBalancerMode: TeamBalancerProposalMode;
};

type TeamBalancerPanelProps = {
  snapshot: ExporterTeamBalancerSnapshot | null;
  proposalMode: TeamBalancerProposalMode;
  visibleAssignmentTones: TeamBalancerDiffTone[];
  onProposalModeChange: (mode: TeamBalancerProposalMode) => void;
};

type ServerActivityPanelProps = {
  server: ExporterServerSnapshot;
};

type TeamRosterGroup = {
  key: string;
  name: string;
  squadId: number | string | null;
  squadName: string | null;
  playerCount: number;
  totalPlaytimeHours: number | null;
  players: ExporterTeamSnapshot['players'];
  isUnassigned: boolean;
};

function getTeamHours(team: ExporterTeamSnapshot | null | undefined): number {
  return typeof team?.totalPlaytimeHours === 'number' ? team.totalPlaytimeHours : 0;
}

function buildSquadGroupKey(squadId?: number | null, squadName?: string | null): string {
  if (typeof squadId === 'number' && Number.isFinite(squadId)) {
    return `id:${squadId}`;
  }

  const normalizedName = (squadName || '').trim().toLowerCase();
  return normalizedName ? `name:${normalizedName}` : 'unassigned';
}

function buildTeamRosterGroups(team: ExporterTeamSnapshot): TeamRosterGroup[] {
  const groups = new Map<
    string,
    {
      squad: ExporterSquadSnapshot | null;
      name: string;
      players: ExporterTeamSnapshot['players'];
      isUnassigned: boolean;
    }
  >();

  for (const squad of team.squads) {
    const key = buildSquadGroupKey(squad.id, squad.name);
    groups.set(key, {
      squad,
      name: formatSquadDisplayName(squad.name),
      players: [],
      isUnassigned: false
    });
  }

  for (const player of team.players) {
    const key = buildSquadGroupKey(player.squadId, player.squadName);
    const existing = groups.get(key);
    if (existing) {
      existing.players.push(player);
      continue;
    }

    groups.set(key, {
      squad: null,
      name: formatSquadDisplayName(player.squadName),
      players: [player],
      isUnassigned: !player.squadName && !player.squadId
    });
  }

  return Array.from(groups.entries())
    .map(([key, value]) => {
      const fallbackHours = value.players.reduce((sum, player) => {
        return sum + (typeof player.playtimeHours === 'number' ? player.playtimeHours : 0);
      }, 0);

      return {
        key,
        name: value.name,
        squadId: value.squad?.id ?? value.players[0]?.squadId ?? null,
        squadName: value.squad?.name ?? value.players[0]?.squadName ?? value.name,
        playerCount: value.players.length || value.squad?.playerCount || 0,
        totalPlaytimeHours:
          typeof value.squad?.totalPlaytimeHours === 'number'
            ? value.squad.totalPlaytimeHours
            : fallbackHours || null,
        players: value.players,
        isUnassigned: value.isUnassigned
      };
    })
    .filter((group) => group.playerCount > 0)
    .sort((left, right) => {
      if (left.isUnassigned !== right.isUnassigned) return left.isUnassigned ? 1 : -1;
      return left.name.localeCompare(right.name, 'ru', { numeric: true, sensitivity: 'base' });
    });
}

export function buildTeamBalancerVisibleTones(
  server: ExporterServerSnapshot,
  proposalMode: TeamBalancerProposalMode
): TeamBalancerDiffTone[] {
  const snapshot = server.teamBalancer;
  if (!snapshot) return [];

  return server.teams.flatMap((team) => {
    if (proposalMode === 'squad') {
      return buildTeamRosterGroups(team)
        .map((group) =>
          buildTeamBalancerSquadMark(snapshot, proposalMode, team.id ?? null, {
            squadId: group.squadId,
            squadName: group.squadName,
            name: group.name,
            players: group.players
          })
        )
        .filter((mark): mark is NonNullable<typeof mark> => Boolean(mark))
        .map((mark) => mark.tone);
    }

    return team.players
      .map((player) =>
        buildTeamBalancerRosterMark(
          snapshot,
          proposalMode,
          team.id ?? player.teamId ?? null,
          player
        )
      )
      .filter((mark): mark is NonNullable<typeof mark> => Boolean(mark))
      .map((mark) => mark.tone);
  });
}

export function getWeakerTeam(server: ExporterServerSnapshot | null | undefined): ExporterTeamSnapshot | null {
  if (!server) return null;
  const [left, right] = server.teams;
  if (!left || !right) return null;

  const leftHours = getTeamHours(left);
  const rightHours = getTeamHours(right);
  if (leftHours === rightHours) return null;
  return leftHours < rightHours ? left : right;
}

export function TeamPanel({ team, opponent, teamBalancerSnapshot, teamBalancerMode }: TeamPanelProps) {
  const teamHours = getTeamHours(team);
  const opponentHours = getTeamHours(opponent);
  const hoursDelta = teamHours - opponentHours;
  const isUnderdog = Boolean(opponent) && hoursDelta < 0;
  const isStronger = Boolean(opponent) && hoursDelta > 0;
  const averageHours = team.playerCount > 0 ? teamHours / team.playerCount : 0;
  const rosterGroups = buildTeamRosterGroups(team);

  let balanceLabel = 'Баланс пока ровный';
  let balanceTone = 'team-balance-neutral';
  if (isUnderdog) {
    balanceLabel = `Слабее на ${formatHours(Math.abs(hoursDelta))}`;
    balanceTone = 'team-balance-underdog';
  } else if (isStronger) {
    balanceLabel = `Сильнее на ${formatHours(Math.abs(hoursDelta))}`;
    balanceTone = 'team-balance-strong';
  }

  return (
    <section className={classNames('team-panel', isUnderdog && 'team-panel-underdog')}>
      <div className="team-panel-head">
        <div>
          <h4>{formatTeamDisplayName(team)}</h4>
          <p>{team.playerCount} игроков</p>
        </div>
        <span className={classNames('team-balance', balanceTone)}>{balanceLabel}</span>
      </div>

      <div className="team-kpis">
        <div className="team-kpi">
          <span>Всего</span>
          <strong>{formatHours(team.totalPlaytimeHours)}</strong>
        </div>
        <div className="team-kpi">
          <span>Среднее</span>
          <strong>{team.playerCount ? formatHours(averageHours) : '—'}</strong>
        </div>
        <div className="team-kpi">
          <span>{ROLE_LABELS.squadLeader}</span>
          <strong>{formatHours(team.leaderPlaytimeHours)}</strong>
        </div>
        <div className="team-kpi">
          <span>{ROLE_LABELS.commander}</span>
          <strong>{formatHours(team.commanderPlaytimeHours)}</strong>
        </div>
      </div>

      <div className="roster-list">
        {rosterGroups.length ? (
          rosterGroups.map((group) => {
            const squadBalancerMark = buildTeamBalancerSquadMark(
              teamBalancerSnapshot,
              teamBalancerMode,
              team.id ?? null,
              {
                squadId: group.squadId,
                squadName: group.squadName,
                name: group.name,
                players: group.players
              }
            );

            return (
              <section
                key={`${team.id || 0}-${group.key}`}
                className={classNames(
                  'squad-group',
                  squadBalancerMark && `squad-group-balancer-${squadBalancerMark.tone}`
                )}
                data-testid={squadBalancerMark ? 'team-balancer-squad-mark' : undefined}
                data-team-balancer-tone={squadBalancerMark?.tone}
              >
                <header className="squad-group-head">
                  <div className="squad-group-title">
                    <div className="squad-group-name-row">
                      <strong>{group.name}</strong>
                      {squadBalancerMark ? (
                        <span
                          className={classNames(
                            'roster-balance-badge',
                            `roster-balance-badge-${squadBalancerMark.tone}`
                          )}
                        >
                          {squadBalancerMark.label}
                        </span>
                      ) : null}
                    </div>
                    <p>{group.playerCount} игроков</p>
                    {squadBalancerMark ? (
                      <div className="roster-balance-detail squad-balance-detail">
                        <span>{squadBalancerMark.detail}</span>
                      </div>
                    ) : null}
                  </div>
                  <span className="squad-chip">{formatHours(group.totalPlaytimeHours)}</span>
                </header>

              <div className="squad-group-body">
                {group.players.map((player) => {
                  const teamBalancerMark = buildTeamBalancerRosterMark(
                    teamBalancerSnapshot,
                    teamBalancerMode,
                    team.id ?? player.teamId ?? null,
                    player
                  );

                  return (
                    <article
                      key={`${player.steamId || player.eosId || player.name}-${player.teamId || 0}`}
                      className={classNames(
                        'roster-row',
                        teamBalancerMark && `roster-row-balancer-${teamBalancerMark.tone}`
                      )}
                      data-testid={teamBalancerMark ? 'team-balancer-roster-mark' : undefined}
                      data-team-balancer-tone={teamBalancerMark?.tone}
                    >
                      <div className="roster-main">
                        <div className="roster-name-row">
                          <strong>{player.name}</strong>
                          {player.isCommander ? (
                            <span className="role-pill role-pill-cmd">
                              {ROLE_LABELS.commander}
                            </span>
                          ) : null}
                          {!player.isCommander && player.isLeader ? (
                            <span className="role-pill role-pill-sl">
                              {ROLE_LABELS.squadLeader}
                            </span>
                          ) : null}
                          {teamBalancerMark ? (
                            <span
                              className={classNames(
                                'roster-balance-badge',
                                `roster-balance-badge-${teamBalancerMark.tone}`
                              )}
                            >
                              {teamBalancerMark.label}
                            </span>
                          ) : null}
                        </div>
                        {teamBalancerMark ? (
                          <div className="roster-balance-detail">
                            <span>{teamBalancerMark.detail}</span>
                          </div>
                        ) : null}
                      </div>
                      <div className="roster-hours">{formatHours(player.playtimeHours)}</div>
                    </article>
                  );
                })}
              </div>
            </section>
            );
          })
        ) : (
          <div className="roster-empty">Список игроков пока пуст.</div>
        )}
      </div>
    </section>
  );
}

export function TeamBalancerPanel({
  snapshot,
  proposalMode,
  visibleAssignmentTones,
  onProposalModeChange
}: TeamBalancerPanelProps) {
  const view = useMemo(
    () => buildTeamBalancerDiffView(snapshot, proposalMode, { visibleAssignmentTones }),
    [proposalMode, snapshot, visibleAssignmentTones]
  );
  const showModeSwitch = Boolean(snapshot && view.modes.length > 1);
  const control = snapshot?.control || null;
  const activeControlVote = control?.activeVote || null;
  const controlVoteGate = activeControlVote?.voteGate || null;
  const controlLabel = control
    ? control.enabled
      ? 'Автобаланс включён'
      : 'Автобаланс выключен'
    : 'Состояние управления не получено';
  const voteTargetLabel = activeControlVote?.targetEnabled ? 'включить' : 'выключить';

  return (
    <section
      className={classNames('team-balancer-panel', `tone-${view.tone}`)}
      data-testid="team-balancer-panel"
      aria-label="Предварительный расчёт баланса сторон"
    >
      <div className="team-balancer-head">
        <div>
          <span className="section-eyebrow">Предварительный расчёт</span>
          <h3>Баланс сторон</h3>
        </div>
        <span
          className={classNames('team-balancer-status', `team-balancer-status-${view.tone}`)}
          data-testid="team-balancer-state"
        >
          {view.message}
        </span>
      </div>

      <div
        className={classNames(
          'team-balancer-control',
          control?.enabled ? 'is-enabled' : 'is-disabled'
        )}
        data-testid="team-balancer-control"
      >
        <div>
          <span>Управление</span>
          <strong>{controlLabel}</strong>
        </div>
        {!control ? (
          <p>Данные управления ещё не получены от сервера.</p>
        ) : activeControlVote ? (
          <p data-testid="team-balancer-control-vote">
            Идёт голосование, чтобы {voteTargetLabel} автобаланс: за{' '}
            {controlVoteGate?.yesVotes || 0}, против {controlVoteGate?.noVotes || 0}, нужно{' '}
            {controlVoteGate?.requiredVotes || 0}. Голос: <code>!автобаланс за</code> или{' '}
            <code>!автобаланс против</code>.
          </p>
        ) : (
          <p>
            Голосование запускается командами <code>!автобаланс вкл</code> и{' '}
            <code>!автобаланс выкл</code>; один игрок может начать его не чаще раза в сутки.
          </p>
        )}
        <small>
          {!control
            ? 'Команды появятся после обновления серверного плагина.'
            : control.enabled
              ? 'Перемещения выполняются только после завершения матча, во время выбора следующей карты.'
              : 'Перемещения отключены. После включения они будут возможны только после завершения матча, во время выбора следующей карты.'}
        </small>
      </div>

      <div className="team-balancer-meta">
        <div>
          <span>Причина</span>
          <strong>{view.triggerLabel}</strong>
        </div>
        <div>
          <span>Изменение состава</span>
          <strong>{view.assignmentSummary}</strong>
        </div>
        <div>
          <span>Размер сторон</span>
          <strong>{view.teamSizeSummary}</strong>
        </div>
        <div>
          <span>Обновлено</span>
          <strong>{view.updatedAtLabel}</strong>
        </div>
      </div>

      {view.roundSignals.length ? (
        <div className="team-balancer-round-grid" data-testid="team-balancer-round-signals">
          {view.roundSignals.map((signal) => (
            <div
              key={signal.id}
              className={classNames('team-balancer-round-card', `tone-${signal.tone}`)}
              data-testid={`team-balancer-round-signal-${signal.id}`}
            >
              <span>{signal.label}</span>
              <strong>{signal.value}</strong>
              {signal.detail ? <p>{signal.detail}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {view.safetyCards.length ? (
        <div className="team-balancer-safety-grid" data-testid="team-balancer-safety">
          {view.safetyCards.map((card) => (
            <div
              key={card.id}
              className={classNames('team-balancer-safety-card', `tone-${card.tone}`)}
              data-testid={`team-balancer-safety-${card.id}`}
            >
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              {card.detail ? <p>{card.detail}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {showModeSwitch ? (
        <div
          className="segmented-control team-balancer-modes"
          role="group"
          aria-label="Режим предварительного расчёта баланса"
        >
          {view.modes.map((mode) => (
            <button
              key={mode}
              type="button"
              className={classNames('segment', view.mode === mode && 'segment-active')}
              onClick={() => onProposalModeChange(mode)}
              data-testid={`team-balancer-mode-${mode}`}
            >
              {mode === 'squad' ? 'Отряды' : 'Игроки'}
            </button>
          ))}
        </div>
      ) : null}

      {view.rows.length ? (
        <div className="team-balancer-diff-list" data-testid="team-balancer-diff-list">
          {view.rows.map((row) => (
            <article
              key={row.id}
              className={classNames('team-balancer-diff-row', `tone-${row.tone}`)}
              data-testid="team-balancer-diff-row"
              data-team-balancer-tone={row.tone}
            >
              <div className="team-balancer-diff-main">
                <strong>{row.title}</strong>
                <span>{row.detail}</span>
              </div>
              <span className="team-balancer-diff-status">{row.label}</span>
            </article>
          ))}
        </div>
      ) : null}

      {view.state === 'proposal' ? null : (
        <div className="team-balancer-empty">{view.message}</div>
      )}
    </section>
  );
}

export function TeamBalancerHistoryPanel({ server }: ServerActivityPanelProps) {
  const balanceHistory =
    server.activity?.teamBalancerHistory
      .filter((entry) =>
        entry.trigger === 'ROUND_ENDED' &&
        ['completed', 'failed', 'partial_failed'].includes(entry.execution?.status || '')
      )
      .slice(-10)
      .reverse() || [];

  return (
    <section className="server-activity-panel" data-testid="team-balancer-history-panel">
      <div className="server-activity-head">
        <div>
          <span className="section-eyebrow">История</span>
          <h3>Межматчевые попытки балансировки</h3>
        </div>
      </div>

      <div className="server-activity-list">
        <div className="server-activity-list-head">
          <span>Последние попытки исполнения</span>
          <strong>
            {balanceHistory.length
              ? `${balanceHistory[0].execution?.succeededPlayers || 0}/${balanceHistory[0].plannedPlayers}`
              : '—'}
          </strong>
        </div>
        {balanceHistory.length ? (
          balanceHistory.map((entry) => {
            const move = entry.moves[0];
            const execution = entry.execution;
            const succeededPlayers = execution?.succeededPlayers || 0;
            const fullyCompleted = execution?.status === 'completed';
            const moveSummary = fullyCompleted ? formatSideMoveSummary(move) : null;
            const title = fullyCompleted
              ? `Выполнено ${succeededPlayers} из ${entry.plannedPlayers}`
              : execution?.status === 'partial_failed'
                ? `Частично: ${succeededPlayers} из ${entry.plannedPlayers}`
                : `Не выполнено: 0 из ${entry.plannedPlayers}`;
            return (
              <div className="server-activity-row" key={entry.decisionId || entry.createdAt}>
                <span>{formatCompactTimestamp(entry.createdAt || undefined)}</span>
                <strong>{title}</strong>
                <p>
                  {formatBalancerHistoryStatus(entry)}
                  {moveSummary ? ` · ${moveSummary}` : ''}
                </p>
              </div>
            );
          })
        ) : (
          <div className="server-activity-empty">
            Межматчевых попыток пока не было. Балансер может исполнять расчёт только после
            завершения матча, во время выбора следующей карты.
          </div>
        )}
      </div>
    </section>
  );
}
