import type {
  ExporterPlayerSnapshot,
  ExporterTeamBalancerCohortSnapshot,
  ExporterTeamBalancerExecutionSnapshot,
  ExporterTeamBalancerModeSnapshot,
  ExporterTeamBalancerModeratorDecisionSnapshot,
  ExporterTeamBalancerPlayerSnapshot,
  ExporterTeamBalancerSnapshot,
  ExporterTeamBalancerVoteGateSnapshot,
  TeamBalancerProposalMode,
  TeamBalancerProposalStatus
} from '../types';

export const TEAM_BALANCER_FRESHNESS_MS = 20 * 60 * 1000;

export type TeamBalancerDiffTone = 'success' | 'neutral' | 'conflict';

export type TeamBalancerDiffViewState = 'missing' | 'stale' | 'healthy' | 'proposal';

export type TeamBalancerRosterMark = {
  tone: TeamBalancerDiffTone;
  label: string;
  detail: string;
};

export type TeamBalancerSafetyCard = {
  id: 'vote' | 'moderator' | 'execution';
  tone: TeamBalancerDiffTone;
  label: string;
  value: string;
  detail: string | null;
};

export type TeamBalancerRoundSignalCard = {
  id: 'severity' | 'ticketDiff' | 'winStreak';
  tone: TeamBalancerDiffTone;
  label: string;
  value: string;
  detail: string | null;
};

export type TeamBalancerDiffRow = {
  id: string;
  tone: TeamBalancerDiffTone;
  title: string;
  label: string;
  detail: string;
};

export type TeamBalancerDiffView = {
  state: TeamBalancerDiffViewState;
  tone: TeamBalancerDiffTone;
  mode: TeamBalancerProposalMode;
  modes: TeamBalancerProposalMode[];
  message: string;
  triggerLabel: string;
  assignmentSummary: string;
  teamSizeSummary: string;
  updatedAtLabel: string;
  ageMs: number;
  safetyCards: TeamBalancerSafetyCard[];
  roundSignals: TeamBalancerRoundSignalCard[];
  rows: TeamBalancerDiffRow[];
};

type TeamBalancerDiffOptions = {
  nowMs?: number;
  freshnessMs?: number;
  visibleAssignmentTones?: TeamBalancerDiffTone[];
};

type SquadIdentity = {
  squadId?: string | number | null;
  squadName?: string | null;
  name?: string | null;
  players?: ExporterPlayerSnapshot[] | null;
};

const DEFAULT_MODES: TeamBalancerProposalMode[] = ['squad', 'player'];

const TRIGGER_LABELS: Record<string, string> = {
  scramble_dry_run: 'Расчёт перестановок',
  scramble_elo: 'Расчёт перестановок',
  scramble_skill: 'Расчёт перестановок',
  scramble_size: 'Расчёт перестановок',
  impact_diff: 'Расчёт перестановок',
  team_impact_within_tolerance: 'Без изменений',
  team_size_diff: 'Разница размера сторон',
  team_size_within_tolerance: 'Размер команд в допуске',
  invalid_snapshot: 'Недостаточно данных',
  max_moves_exhausted: 'Лимит переводов исчерпан'
};

function formatTeamId(value: string | number | null | undefined): string {
  const text = String(value ?? '').trim();
  return text ? `Сторона ${text}` : 'Сторона не указана';
}

function formatImpactValue(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
    .format(Math.round(value))
    .replace(/\u00a0/g, ' ');
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0%';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })
    .format(Math.max(0, value))
    .replace(/\u00a0/g, ' ')}%`;
}

function joinDetailParts(parts: Array<string | null | undefined>): string | null {
  const filtered = parts.map((part) => String(part || '').trim()).filter(Boolean);
  return filtered.length ? filtered.join(' · ') : null;
}

function formatSignedValue(value: number): string {
  const formatted = formatImpactValue(value);
  return value > 0 ? `+${formatted}` : formatted;
}

function normalizeModes(snapshot: ExporterTeamBalancerSnapshot | null): TeamBalancerProposalMode[] {
  const explicitModes =
    snapshot?.proposalModes && Object.keys(snapshot.proposalModes).length
      ? (Object.keys(snapshot.proposalModes).filter((mode) =>
          DEFAULT_MODES.includes(mode as TeamBalancerProposalMode)
        ) as TeamBalancerProposalMode[])
      : [];
  const modes =
    explicitModes.length > 0
      ? explicitModes
      : snapshot?.availableProposalModes?.filter((mode) => DEFAULT_MODES.includes(mode)) || [];
  return modes.length ? modes : DEFAULT_MODES;
}

function resolveMode(
  snapshot: ExporterTeamBalancerSnapshot | null,
  requestedMode: TeamBalancerProposalMode
): TeamBalancerProposalMode {
  const modes = normalizeModes(snapshot);
  if (modes.includes(requestedMode)) return requestedMode;
  if (snapshot?.defaultProposalMode && modes.includes(snapshot.defaultProposalMode)) {
    return snapshot.defaultProposalMode;
  }
  return modes[0] || 'squad';
}

function getReportTimestamp(snapshot: ExporterTeamBalancerSnapshot): number {
  const generatedAtMs = Date.parse(snapshot.generatedAt || '');
  if (Number.isFinite(generatedAtMs)) return generatedAtMs;
  const snapshotTimestampMs = Date.parse(snapshot.snapshotTimestamp || '');
  return Number.isFinite(snapshotTimestampMs) ? snapshotTimestampMs : 0;
}

function getReportAgeMs(snapshot: ExporterTeamBalancerSnapshot, nowMs: number): number {
  const reportTimestampMs = getReportTimestamp(snapshot);
  return reportTimestampMs ? Math.max(0, nowMs - reportTimestampMs) : Number.POSITIVE_INFINITY;
}

function formatUpdatedAt(timestampMs: number): string {
  if (!timestampMs) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestampMs));
}

function formatTeamCounts(counts: Record<string, number>): string {
  const values = Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right, 'ru', { numeric: true }))
    .map(([, count]) => String(Math.max(0, Math.round(Number(count) || 0))));
  return values.length ? values.join(':') : '—';
}

function buildBeforeAfterSummary(
  before: Record<string, number>,
  after: Record<string, number>,
  formatter: (counts: Record<string, number>) => string
): string {
  return `сейчас ${formatter(before)} · по расчёту ${formatter(after)}`;
}

function getModeSnapshot(
  snapshot: ExporterTeamBalancerSnapshot,
  mode: TeamBalancerProposalMode
): ExporterTeamBalancerSnapshot | ExporterTeamBalancerModeSnapshot {
  return snapshot.proposalModes?.[mode] || snapshot;
}

function buildModeTeamSizeSummary(
  modeSnapshot: ExporterTeamBalancerSnapshot | ExporterTeamBalancerModeSnapshot
): string {
  const teamSize = modeSnapshot.signals?.teamSize;
  if (!teamSize) return '—';
  return buildBeforeAfterSummary(teamSize.before, teamSize.after, formatTeamCounts);
}

function buildModeTriggerLabel(
  modeSnapshot: ExporterTeamBalancerSnapshot | ExporterTeamBalancerModeSnapshot
): string {
  const reason = modeSnapshot.signals?.triggerReason || modeSnapshot.reasonCodes?.[0] || '';
  return TRIGGER_LABELS[reason] || 'Плановая проверка состава';
}

function countEntriesByTone(
  entries: Array<ExporterTeamBalancerPlayerSnapshot | ExporterTeamBalancerCohortSnapshot>
): Record<TeamBalancerDiffTone, number> {
  return entries.reduce(
    (totals, entry) => {
      totals[getStatusTone(entry.status)] += 1;
      return totals;
    },
    { conflict: 0, neutral: 0, success: 0 }
  );
}

function countTonesByTone(tones: TeamBalancerDiffTone[]): Record<TeamBalancerDiffTone, number> {
  return tones.reduce(
    (totals, tone) => {
      totals[tone] += 1;
      return totals;
    },
    { conflict: 0, neutral: 0, success: 0 }
  );
}

function formatAssignmentSummaryFromTones(tones: TeamBalancerDiffTone[]): string {
  if (!tones.length) return 'Без изменений';

  const totals = countTonesByTone(tones);
  const parts = [
    totals.conflict > 0 ? `${totals.conflict} к смене` : null,
    totals.success > 0 ? `${totals.success} уже сменили` : null,
    totals.conflict === 0 && totals.success === 0 && totals.neutral > 0
      ? `${totals.neutral} на месте`
      : null
  ].filter((part): part is string => Boolean(part));

  return parts.length ? parts.join(' · ') : 'Без изменений';
}

function formatAssignmentSummary(
  entries: Array<ExporterTeamBalancerPlayerSnapshot | ExporterTeamBalancerCohortSnapshot>
): string {
  if (!entries.length) return 'Без изменений';

  const totals = countEntriesByTone(entries);
  const parts = [
    totals.conflict > 0 ? `${totals.conflict} к смене` : null,
    totals.success > 0 ? `${totals.success} уже сменили` : null,
    totals.conflict === 0 && totals.success === 0 && totals.neutral > 0
      ? `${totals.neutral} на месте`
      : null
  ].filter((part): part is string => Boolean(part));

  return parts.length ? parts.join(' · ') : 'Без изменений';
}

function formatPlayerCount(value: number | null | undefined): string {
  const count = Math.max(0, Math.round(Number(value) || 0));
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} игрок`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} игрока`;
  return `${count} игроков`;
}

function formatSideMove(entry: {
  fromTeamID: string | null;
  toTeamID: string | null;
  expectedTeamID?: string | null;
}): string {
  return `${formatTeamId(entry.fromTeamID)} в ${formatTeamId(entry.expectedTeamID || entry.toTeamID)}`;
}

function getCohortTitle(entry: ExporterTeamBalancerCohortSnapshot): string {
  const squadName = String(entry.squadName || '').trim();
  if (entry.type === 'squad') return squadName || 'Сквад';
  return squadName ? `${squadName} · игрок` : 'Игрок без сквада';
}

function getPlayerTitle(entry: ExporterTeamBalancerPlayerSnapshot): string {
  return String(entry.name || '').trim() || 'Игрок';
}

function buildDiffRow(
  entry: ExporterTeamBalancerPlayerSnapshot | ExporterTeamBalancerCohortSnapshot,
  index: number,
  mode: TeamBalancerProposalMode
): TeamBalancerDiffRow | null {
  const tone = getStatusTone(entry.status);
  if (tone === 'neutral') return null;

  const isPlayerMode = mode === 'player';
  const playerCount =
    'playerCount' in entry ? formatPlayerCount(entry.playerCount) : null;
  const squadName = String(entry.squadName || '').trim();
  const detail = isPlayerMode
    ? joinDetailParts([squadName || 'Без сквада', formatSideMove(entry)]) || formatSideMove(entry)
    : joinDetailParts([playerCount, formatSideMove(entry)]) || formatSideMove(entry);

  return {
    id: `${mode}-${entry.status}-${entry.fromTeamID || 'x'}-${entry.toTeamID || 'x'}-${
      'cohortKey' in entry ? entry.cohortKey : entry.matchKey || entry.name || index
    }`,
    tone,
    title: isPlayerMode
      ? getPlayerTitle(entry as ExporterTeamBalancerPlayerSnapshot)
      : getCohortTitle(entry as ExporterTeamBalancerCohortSnapshot),
    label: getRosterLabel(entry.status),
    detail
  };
}

function buildTeamBalancerDiffRows(
  entries: Array<ExporterTeamBalancerPlayerSnapshot | ExporterTeamBalancerCohortSnapshot>,
  mode: TeamBalancerProposalMode
): TeamBalancerDiffRow[] {
  return entries
    .map((entry, index) => buildDiffRow(entry, index, mode))
    .filter((row): row is TeamBalancerDiffRow => Boolean(row));
}

function buildVoteGateSafetyCard(
  voteGate: ExporterTeamBalancerVoteGateSnapshot | null
): TeamBalancerSafetyCard | null {
  if (!voteGate) return null;

  return {
    id: 'vote',
    tone: !voteGate.enabled ? 'neutral' : voteGate.approved ? 'success' : 'conflict',
    label: 'Голосование',
    value: voteGate.enabled ? `${voteGate.yesVotes}/${voteGate.requiredVotes}` : 'Выключено',
    detail: voteGate.enabled
      ? `за ${voteGate.yesVotes} · против ${voteGate.noVotes} · кворум ${formatPercent(
          voteGate.quorumPercent
        )} · проход ${formatPercent(voteGate.passThresholdPercent)}`
      : null
  };
}

function buildModeratorDecisionSafetyCard(
  decision: ExporterTeamBalancerModeratorDecisionSnapshot | null
): TeamBalancerSafetyCard | null {
  if (!decision) return null;

  if (decision.vetoed) {
    return {
      id: 'moderator',
      tone: 'conflict',
      label: 'Модератор',
      value: `Veto${decision.reason ? `: ${decision.reason}` : ''}`,
      detail: joinDetailParts([decision.moderatorName, decision.note])
    };
  }

  if (decision.approved) {
    return {
      id: 'moderator',
      tone: 'success',
      label: 'Модератор',
      value: 'Одобрено',
      detail: joinDetailParts([decision.moderatorName, decision.note])
    };
  }

  if (decision.required) {
    return {
      id: 'moderator',
      tone: 'conflict',
      label: 'Модератор',
      value: 'Требуется решение',
      detail: joinDetailParts([decision.reason, decision.note])
    };
  }

  return {
    id: 'moderator',
    tone: 'neutral',
    label: 'Модератор',
    value: 'Не требуется',
    detail: joinDetailParts([decision.reason, decision.note])
  };
}

function getExecutionValue(execution: ExporterTeamBalancerExecutionSnapshot): string {
  const status = execution.enabled ? execution.status : 'disabled';
  const labels: Record<string, string> = {
    disabled: 'Выключено',
    pending: 'Ожидает',
    queued: 'Ожидает',
    running: 'Выполняется',
    in_progress: 'Выполняется',
    completed: 'Выполнено',
    success: 'Выполнено',
    blocked: 'Заблокировано',
    failed: 'Ошибка',
    partial_failed: 'Ошибка',
    error: 'Ошибка'
  };
  return labels[status] || status;
}

function getExecutionTone(execution: ExporterTeamBalancerExecutionSnapshot): TeamBalancerDiffTone {
  if (!execution.enabled || execution.status === 'disabled') return 'neutral';
  if (execution.status === 'completed' || execution.status === 'success') return 'success';
  if (
    execution.status === 'blocked' ||
    execution.status === 'failed' ||
    execution.status === 'partial_failed' ||
    execution.status === 'error'
  ) {
    return 'conflict';
  }
  return 'neutral';
}

function buildExecutionSafetyCard(
  execution: ExporterTeamBalancerExecutionSnapshot | null
): TeamBalancerSafetyCard | null {
  if (!execution) return null;

  return {
    id: 'execution',
    tone: getExecutionTone(execution),
    label: 'Исполнение',
    value: getExecutionValue(execution),
    detail: `игроки ${execution.succeededPlayers}/${execution.plannedPlayers} · попытки ${execution.totalRconAttempts} · лимит ${execution.maxAttemptsPerPlayer}`
  };
}

function buildTeamBalancerSafetyCards(
  snapshot: ExporterTeamBalancerSnapshot | null
): TeamBalancerSafetyCard[] {
  if (!snapshot) return [];

  return [
    buildVoteGateSafetyCard(snapshot.voteGate),
    buildModeratorDecisionSafetyCard(snapshot.moderatorDecision),
    buildExecutionSafetyCard(snapshot.execution)
  ].filter((card): card is TeamBalancerSafetyCard => Boolean(card));
}

function getRoundSeverityValue(level: string): string {
  const normalized = level.trim().toLowerCase();
  const labels: Record<string, string> = {
    severe: 'Сильный перекос',
    high: 'Заметный перекос'
  };
  return labels[normalized] || level;
}

function getRoundSeverityTone(level: string): TeamBalancerDiffTone {
  return level.trim().toLowerCase() === 'severe' ? 'conflict' : 'neutral';
}

function formatRoundSeverityReason(reason: string): string | null {
  const labels: Record<string, string> = {
    ticket_diff: 'ticket diff',
    win_streak: 'серия побед'
  };
  return labels[reason] || reason || null;
}

function buildRoundSeveritySignalCard(
  snapshot: ExporterTeamBalancerSnapshot | ExporterTeamBalancerModeSnapshot
): TeamBalancerRoundSignalCard | null {
  const severity = snapshot.signals.recentRoundSeverity;
  if (!severity) return null;

  const detail =
    joinDetailParts([
      typeof severity.ticketDiff === 'number'
        ? `ticket diff ${formatImpactValue(severity.ticketDiff)}`
        : null,
      typeof severity.winStreak === 'number' && severity.winStreak > 0
        ? `серия ${formatImpactValue(severity.winStreak)}`
        : null
    ]) ||
    joinDetailParts(severity.reasons.map(formatRoundSeverityReason));

  return {
    id: 'severity',
    tone: getRoundSeverityTone(severity.level),
    label: 'Последние раунды',
    value: getRoundSeverityValue(severity.level),
    detail
  };
}

function buildTicketDiffSignalCard(
  snapshot: ExporterTeamBalancerSnapshot | ExporterTeamBalancerModeSnapshot
): TeamBalancerRoundSignalCard | null {
  const ticketDiff = snapshot.signals.ticketDiff;
  if (!ticketDiff) return null;

  return {
    id: 'ticketDiff',
    tone: 'neutral',
    label: 'Последний счет',
    value: `${formatTeamId(ticketDiff.winnerTeamID)} ${formatSignedValue(ticketDiff.diff)}`,
    detail: `${formatImpactValue(ticketDiff.winnerTickets)}:${formatImpactValue(
      ticketDiff.loserTickets
    )} против ${formatTeamId(ticketDiff.loserTeamID)}`
  };
}

function buildWinStreakSignalCard(
  snapshot: ExporterTeamBalancerSnapshot | ExporterTeamBalancerModeSnapshot
): TeamBalancerRoundSignalCard | null {
  const winStreak = snapshot.signals.winStreak;
  if (!winStreak) return null;

  return {
    id: 'winStreak',
    tone: 'neutral',
    label: 'Серия побед',
    value: `${formatTeamId(winStreak.teamID)} x${formatImpactValue(winStreak.count)}`,
    detail: `порог ${formatImpactValue(winStreak.threshold)}`
  };
}

function buildTeamBalancerRoundSignals(
  snapshot: ExporterTeamBalancerSnapshot | ExporterTeamBalancerModeSnapshot | null
): TeamBalancerRoundSignalCard[] {
  if (!snapshot) return [];

  return [
    buildRoundSeveritySignalCard(snapshot),
    buildTicketDiffSignalCard(snapshot),
    buildWinStreakSignalCard(snapshot)
  ].filter((card): card is TeamBalancerRoundSignalCard => Boolean(card));
}

function getStatusTone(status: TeamBalancerProposalStatus): TeamBalancerDiffTone {
  if (status === 'move_pending') return 'conflict';
  if (status === 'accepted' || status === 'moved') return 'success';
  if (status === 'recommended') return 'conflict';
  return 'neutral';
}

function getRosterLabel(status: TeamBalancerProposalStatus): string {
  if (status === 'accepted' || status === 'moved') return 'Смена учтена';
  if (status === 'already_target') return 'На месте';
  if (status === 'move_pending') return 'Нужна смена';
  if (status === 'recommended') return 'В плане баланса';
  return 'Без перестановки';
}

function resolveLiveStatus(
  entry: {
    status: TeamBalancerProposalStatus;
    fromTeamID: string | null;
    toTeamID: string | null;
    currentTeamID?: string | null;
    expectedTeamID?: string | null;
  },
  actualTeamID: string | number | null | undefined
): TeamBalancerProposalStatus {
  const expectedTeamID = entry.expectedTeamID || entry.toTeamID;
  if (!expectedTeamID || !actualTeamID) return entry.status;

  const originalTeamID = entry.fromTeamID || entry.currentTeamID;
  const plannedMove = !isSameTeamId(originalTeamID, expectedTeamID);

  if (isSameTeamId(actualTeamID, expectedTeamID)) {
    return plannedMove ? 'moved' : 'already_target';
  }

  return 'move_pending';
}

function getModeEntries(
  snapshot: ExporterTeamBalancerSnapshot | ExporterTeamBalancerModeSnapshot,
  mode: TeamBalancerProposalMode
): Array<ExporterTeamBalancerPlayerSnapshot | ExporterTeamBalancerCohortSnapshot> {
  return mode === 'player' ? snapshot.players : snapshot.cohorts;
}

function getModeStatuses(
  snapshot: ExporterTeamBalancerSnapshot | ExporterTeamBalancerModeSnapshot,
  mode: TeamBalancerProposalMode
): TeamBalancerProposalStatus[] {
  const entries = getModeEntries(snapshot, mode);
  return entries.map((entry) => entry.status);
}

function getProposalTone(
  snapshot: ExporterTeamBalancerSnapshot | ExporterTeamBalancerModeSnapshot,
  mode: TeamBalancerProposalMode
): TeamBalancerDiffTone {
  const statuses = getModeStatuses(snapshot, mode);
  if (statuses.some((status) => getStatusTone(status) === 'conflict')) return 'conflict';
  if (statuses.some((status) => getStatusTone(status) === 'success')) return 'success';
  return 'neutral';
}

function getVisibleProposalTone(tones: TeamBalancerDiffTone[]): TeamBalancerDiffTone {
  if (tones.some((tone) => tone === 'conflict')) return 'conflict';
  if (tones.some((tone) => tone === 'success')) return 'success';
  return 'neutral';
}

function hasVisibleDiff(tones: TeamBalancerDiffTone[]): boolean {
  return tones.some((tone) => tone === 'conflict' || tone === 'success');
}

function normalizeComparable(value: string | number | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function buildStableCompositionHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (const char of value) {
    hash ^= BigInt(char.codePointAt(0) || 0);
    hash = BigInt.asUintN(64, hash * prime);
  }

  return hash.toString(16).padStart(16, '0');
}

export function buildTeamBalancerCompositionKey(
  players: Array<Pick<ExporterPlayerSnapshot, 'matchKey'>> | null | undefined
): string | null {
  if (!Array.isArray(players) || players.length === 0) return null;

  const matchKeys = players.map((player) => normalizeComparable(player.matchKey));
  if (matchKeys.some((matchKey) => !matchKey)) return null;

  const signature = matchKeys.sort().join('|');
  return `players:${matchKeys.length}:${buildStableCompositionHash(signature)}`;
}

function isSameTeamId(
  left: string | number | null | undefined,
  right: string | number | null | undefined
): boolean {
  const normalizedLeft = normalizeComparable(left);
  const normalizedRight = normalizeComparable(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function getVisibleTeamIdForStatus(
  status: TeamBalancerProposalStatus,
  fromTeamID: string | null,
  toTeamID: string | null,
  currentTeamID?: string | null
): string | null {
  if (currentTeamID) return currentTeamID;
  if (status === 'move_pending') return fromTeamID;
  if (status === 'recommended') return fromTeamID;
  if (status === 'accepted' || status === 'moved' || status === 'already_target') return toTeamID;
  return null;
}

function isVisibleOnCurrentTeam(
  status: TeamBalancerProposalStatus,
  currentTeamID: string | number | null | undefined,
  fromTeamID: string | null,
  toTeamID: string | null,
  entryCurrentTeamID?: string | null
): boolean {
  const visibleTeamID = getVisibleTeamIdForStatus(status, fromTeamID, toTeamID, entryCurrentTeamID);
  return isSameTeamId(currentTeamID, visibleTeamID);
}

function matchesSquad(player: ExporterPlayerSnapshot, squadID: string | number | null): boolean {
  const target = normalizeComparable(squadID);
  if (!target) return false;

  const playerSquadID = normalizeComparable(player.squadId);
  if (playerSquadID && playerSquadID === target) return true;

  const playerSquadName = normalizeComparable(player.squadName);
  return Boolean(
    playerSquadName &&
      (playerSquadName === target ||
        playerSquadName.endsWith(` ${target}`) ||
        playerSquadName.includes(target))
  );
}

function matchesSquadIdentity(
  proposal: ExporterTeamBalancerCohortSnapshot,
  squad: SquadIdentity
): boolean {
  const proposalCompositionKey = normalizeComparable(proposal.compositionKey);
  if (proposalCompositionKey) {
    return proposalCompositionKey === normalizeComparable(buildTeamBalancerCompositionKey(squad.players));
  }

  if (proposal.type !== 'squad') return false;

  const proposalSquadId = normalizeComparable(proposal.squadID);
  const squadId = normalizeComparable(squad.squadId);
  if (proposalSquadId && squadId && proposalSquadId === squadId) return true;

  const proposalSquadName = normalizeComparable(proposal.squadName);
  const squadName = normalizeComparable(squad.squadName || squad.name);
  if (proposalSquadName && squadName && proposalSquadName === squadName) return true;

  return false;
}

function matchesRosterPlayer(
  proposal: ExporterTeamBalancerPlayerSnapshot,
  player: ExporterPlayerSnapshot
): boolean {
  const proposalMatchKey = normalizeComparable(proposal.matchKey);
  const playerMatchKey = normalizeComparable(player.matchKey);
  if (proposalMatchKey && playerMatchKey) return proposalMatchKey === playerMatchKey;

  const proposalName = normalizeComparable(proposal.name);
  const playerName = normalizeComparable(player.name);
  if (!proposalName || proposalName !== playerName) return false;
  if (proposal.squadID === null || proposal.squadID === undefined) return true;
  return matchesSquad(player, proposal.squadID);
}

function buildRosterMarkFromEntry(entry: {
  status: TeamBalancerProposalStatus;
  fromTeamID: string | null;
  toTeamID: string | null;
  currentTeamID?: string | null;
  expectedTeamID?: string | null;
}, actualTeamID?: string | number | null): TeamBalancerRosterMark {
  const expectedTeamID = entry.expectedTeamID || entry.toTeamID;
  const status = resolveLiveStatus(entry, actualTeamID);
  return {
    tone: getStatusTone(status),
    label: getRosterLabel(status),
    detail: `Предлагаемая сторона: ${formatTeamId(expectedTeamID)}`
  };
}

function compareMarkPriority(
  left: { status: TeamBalancerProposalStatus },
  right: { status: TeamBalancerProposalStatus }
): number {
  const priorities: Record<string, number> = {
    moved: 4,
    accepted: 4,
    already_target: 3,
    recommended: 2,
    move_pending: 2,
    noop: 1
  };
  return (priorities[right.status] || 0) - (priorities[left.status] || 0);
}

export function buildTeamBalancerRosterMark(
  snapshot: ExporterTeamBalancerSnapshot | null,
  requestedMode: TeamBalancerProposalMode,
  teamID: string | number | null | undefined,
  player: ExporterPlayerSnapshot,
  options: TeamBalancerDiffOptions = {}
): TeamBalancerRosterMark | null {
  if (!snapshot) return null;

  const mode = resolveMode(snapshot, requestedMode);
  if (mode !== 'player') return null;
  const modeSnapshot = getModeSnapshot(snapshot, mode);

  const nowMs = options.nowMs ?? Date.now();
  const freshnessMs = options.freshnessMs ?? TEAM_BALANCER_FRESHNESS_MS;
  const ageMs = getReportAgeMs(snapshot, nowMs);
  if (ageMs > freshnessMs) return null;

  const currentTeamID = teamID ?? player.teamId ?? null;
  const proposal = [...modeSnapshot.players]
    .filter(
      (entry) =>
        matchesRosterPlayer(entry, player)
    )
    .sort(compareMarkPriority)[0];

  return proposal ? buildRosterMarkFromEntry(proposal, currentTeamID) : null;
}

export function buildTeamBalancerSquadMark(
  snapshot: ExporterTeamBalancerSnapshot | null,
  requestedMode: TeamBalancerProposalMode,
  teamID: string | number | null | undefined,
  squad: SquadIdentity,
  options: TeamBalancerDiffOptions = {}
): TeamBalancerRosterMark | null {
  if (!snapshot) return null;

  const mode = resolveMode(snapshot, requestedMode);
  if (mode !== 'squad') return null;
  const modeSnapshot = getModeSnapshot(snapshot, mode);

  const nowMs = options.nowMs ?? Date.now();
  const freshnessMs = options.freshnessMs ?? TEAM_BALANCER_FRESHNESS_MS;
  const ageMs = getReportAgeMs(snapshot, nowMs);
  if (ageMs > freshnessMs) return null;

  const currentTeamID = teamID ?? null;
  const cohort = [...modeSnapshot.cohorts]
    .filter(
      (entry) =>
        matchesSquadIdentity(entry, squad)
    )
    .sort(compareMarkPriority)[0];
  return cohort ? buildRosterMarkFromEntry(cohort, currentTeamID) : null;
}

export function buildTeamBalancerDiffView(
  snapshot: ExporterTeamBalancerSnapshot | null,
  requestedMode: TeamBalancerProposalMode,
  options: TeamBalancerDiffOptions = {}
): TeamBalancerDiffView {
  const modes = normalizeModes(snapshot);
  const mode = resolveMode(snapshot, requestedMode);
  const nowMs = options.nowMs ?? Date.now();
  const freshnessMs = options.freshnessMs ?? TEAM_BALANCER_FRESHNESS_MS;

  if (!snapshot) {
    return {
      state: 'missing',
      tone: 'neutral',
      mode,
      modes,
      message: 'Расчёт баланса пока не получен',
      triggerLabel: 'Плановая проверка состава',
      assignmentSummary: '—',
      teamSizeSummary: '—',
      updatedAtLabel: '—',
      ageMs: Number.POSITIVE_INFINITY,
      safetyCards: [],
      roundSignals: [],
      rows: []
    };
  }

  const reportTimestampMs = getReportTimestamp(snapshot);
  const ageMs = getReportAgeMs(snapshot, nowMs);
  const modeSnapshot = getModeSnapshot(snapshot, mode);
  const triggerLabel = buildModeTriggerLabel(modeSnapshot);
  const teamSizeSummary = buildModeTeamSizeSummary(modeSnapshot);
  const modeEntries = getModeEntries(modeSnapshot, mode);
  const hasVisibleAssignmentTones = Array.isArray(options.visibleAssignmentTones);
  const visibleAssignmentTones = options.visibleAssignmentTones || [];
  const hasVisibleDiffTones = hasVisibleAssignmentTones && hasVisibleDiff(visibleAssignmentTones);
  const assignmentSummary = hasVisibleDiffTones
    ? formatAssignmentSummaryFromTones(visibleAssignmentTones)
    : formatAssignmentSummary(modeEntries);
  const updatedAtLabel = formatUpdatedAt(reportTimestampMs);
  const rows = buildTeamBalancerDiffRows(modeEntries, mode);

  if (!reportTimestampMs || ageMs > freshnessMs) {
    return {
      state: 'stale',
      tone: 'neutral',
      mode,
      modes,
      message: 'Расчёт баланса устарел',
      triggerLabel,
      assignmentSummary,
      teamSizeSummary,
      updatedAtLabel,
      ageMs,
      safetyCards: [],
      roundSignals: [],
      rows
    };
  }

  const safetyCards = buildTeamBalancerSafetyCards(snapshot);
  const roundSignals = buildTeamBalancerRoundSignals(modeSnapshot);
  const hasProposal = modeSnapshot.action === 'recommend' && (rows.length > 0 || hasVisibleDiffTones);

  if (!hasProposal) {
    return {
      state: 'healthy',
      tone: 'neutral',
      mode,
      modes,
      message: 'Без изменений',
      triggerLabel,
      assignmentSummary,
      teamSizeSummary,
      updatedAtLabel,
      ageMs,
      safetyCards,
      roundSignals,
      rows: []
    };
  }

  return {
    state: 'proposal',
    tone: hasVisibleDiffTones
      ? getVisibleProposalTone(visibleAssignmentTones)
      : getProposalTone(modeSnapshot, mode),
    mode,
    modes,
    message: 'Есть diff',
    triggerLabel,
    assignmentSummary,
    teamSizeSummary,
    updatedAtLabel,
    ageMs,
    safetyCards,
    roundSignals,
    rows
  };
}
