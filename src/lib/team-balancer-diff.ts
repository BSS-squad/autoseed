import type {
  ExporterPlayerSnapshot,
  ExporterTeamBalancerCohortSnapshot,
  ExporterTeamBalancerExecutionSnapshot,
  ExporterTeamBalancerModeratorDecisionSnapshot,
  ExporterTeamBalancerPlayerSnapshot,
  ExporterTeamBalancerSnapshot,
  ExporterTeamBalancerVoteGateSnapshot,
  TeamBalancerProposalMode,
  TeamBalancerProposalStatus
} from '../types';

export const TEAM_BALANCER_FRESHNESS_MS = 5 * 60 * 1000;

export type TeamBalancerDiffTone = 'success' | 'neutral' | 'conflict';

export type TeamBalancerDiffViewState = 'missing' | 'stale' | 'healthy' | 'proposal';

export type TeamBalancerRosterMark = {
  tone: TeamBalancerDiffTone;
  label: string;
  detail: string;
  impactLabel: string | null;
};

export type TeamBalancerSafetyCard = {
  id: 'vote' | 'moderator' | 'execution';
  tone: TeamBalancerDiffTone;
  label: string;
  value: string;
  detail: string | null;
};

export type TeamBalancerDiffView = {
  state: TeamBalancerDiffViewState;
  tone: TeamBalancerDiffTone;
  mode: TeamBalancerProposalMode;
  modes: TeamBalancerProposalMode[];
  message: string;
  triggerLabel: string;
  impactSummary: string;
  teamSizeSummary: string;
  updatedAtLabel: string;
  ageMs: number;
  safetyCards: TeamBalancerSafetyCard[];
  rows: never[];
};

type TeamBalancerDiffOptions = {
  nowMs?: number;
  freshnessMs?: number;
};

const DEFAULT_MODES: TeamBalancerProposalMode[] = ['squad', 'player'];

const TRIGGER_LABELS: Record<string, string> = {
  impact_diff: 'Перекос импакта',
  team_impact_within_tolerance: 'Импакт в допуске',
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

function resolveImpactValue(value: {
  impactSeconds?: number | null;
  impactHours?: number | null;
  score?: number | null;
}): number | null {
  if (typeof value.score === 'number' && Number.isFinite(value.score)) return value.score;
  if (typeof value.impactSeconds === 'number' && Number.isFinite(value.impactSeconds)) {
    return value.impactSeconds;
  }
  if (typeof value.impactHours === 'number' && Number.isFinite(value.impactHours)) {
    return value.impactHours;
  }
  return null;
}

function normalizeModes(snapshot: ExporterTeamBalancerSnapshot | null): TeamBalancerProposalMode[] {
  const modes = snapshot?.availableProposalModes?.filter((mode) => DEFAULT_MODES.includes(mode)) || [];
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
  return `сейчас ${formatter(before)} · dry-run ${formatter(after)}`;
}

function buildTeamSizeSummary(snapshot: ExporterTeamBalancerSnapshot | null): string {
  const teamSize = snapshot?.signals?.teamSize;
  if (!teamSize) return '—';
  return buildBeforeAfterSummary(teamSize.before, teamSize.after, formatTeamCounts);
}

function formatImpactCounts(counts: Record<string, number>): string {
  const values = Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right, 'ru', { numeric: true }))
    .map(([, count]) => formatImpactValue(count));
  return values.length ? values.join(':') : '—';
}

function buildImpactSummary(snapshot: ExporterTeamBalancerSnapshot | null): string {
  const impact = snapshot?.signals?.impact;
  if (!impact?.available) return '—';
  return buildBeforeAfterSummary(impact.before, impact.after, formatImpactCounts);
}

function buildTriggerLabel(snapshot: ExporterTeamBalancerSnapshot | null): string {
  const reason = snapshot?.signals?.triggerReason || snapshot?.reasonCodes?.[0] || '';
  return TRIGGER_LABELS[reason] || 'Плановая проверка impact';
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

function getStatusTone(status: TeamBalancerProposalStatus): TeamBalancerDiffTone {
  if (status === 'accepted' || status === 'moved') return 'success';
  if (status === 'recommended') return 'conflict';
  return 'neutral';
}

function getRosterLabel(status: TeamBalancerProposalStatus): string {
  if (status === 'accepted' || status === 'moved') return 'Свежий перенос';
  if (status === 'already_target') return 'План совпал';
  if (status === 'recommended') return 'В плане баланса';
  return 'Без перестановки';
}

function getModeEntries(
  snapshot: ExporterTeamBalancerSnapshot,
  mode: TeamBalancerProposalMode
): Array<ExporterTeamBalancerPlayerSnapshot | ExporterTeamBalancerCohortSnapshot> {
  return mode === 'player' ? snapshot.players : snapshot.cohorts;
}

function getModeStatuses(
  snapshot: ExporterTeamBalancerSnapshot,
  mode: TeamBalancerProposalMode
): TeamBalancerProposalStatus[] {
  const entries = getModeEntries(snapshot, mode);
  return entries.map((entry) => entry.status);
}

function getProposalTone(
  snapshot: ExporterTeamBalancerSnapshot,
  mode: TeamBalancerProposalMode
): TeamBalancerDiffTone {
  const statuses = getModeStatuses(snapshot, mode);
  if (statuses.some((status) => getStatusTone(status) === 'conflict')) return 'conflict';
  if (statuses.some((status) => getStatusTone(status) === 'success')) return 'success';
  return 'neutral';
}

function normalizeComparable(value: string | number | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
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
  toTeamID: string | null
): string | null {
  if (status === 'recommended') return fromTeamID;
  if (status === 'accepted' || status === 'moved' || status === 'already_target') return toTeamID;
  return null;
}

function isVisibleOnCurrentTeam(
  status: TeamBalancerProposalStatus,
  currentTeamID: string | number | null | undefined,
  fromTeamID: string | null,
  toTeamID: string | null
): boolean {
  const visibleTeamID = getVisibleTeamIdForStatus(status, fromTeamID, toTeamID);
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

function matchesRosterPlayer(
  proposal: ExporterTeamBalancerPlayerSnapshot,
  player: ExporterPlayerSnapshot
): boolean {
  const proposalName = normalizeComparable(proposal.name);
  const playerName = normalizeComparable(player.name);
  if (!proposalName || proposalName !== playerName) return false;
  if (proposal.squadID === null || proposal.squadID === undefined) return true;
  return matchesSquad(player, proposal.squadID);
}

function buildRosterMarkFromEntry(entry: {
  status: TeamBalancerProposalStatus;
  toTeamID: string | null;
  score?: number | null;
  impactSeconds?: number | null;
  impactHours?: number | null;
}): TeamBalancerRosterMark {
  const impactValue = resolveImpactValue(entry);
  return {
    tone: getStatusTone(entry.status),
    label: getRosterLabel(entry.status),
    detail: `Финальная сторона: ${formatTeamId(entry.toTeamID)}`,
    impactLabel: impactValue === null ? null : `impact ${formatImpactValue(impactValue)}`
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
  const nowMs = options.nowMs ?? Date.now();
  const freshnessMs = options.freshnessMs ?? TEAM_BALANCER_FRESHNESS_MS;
  const ageMs = getReportAgeMs(snapshot, nowMs);
  if (ageMs > freshnessMs) return null;

  const currentTeamID = teamID ?? player.teamId ?? null;

  if (mode === 'player') {
    const proposal = [...snapshot.players]
      .filter(
        (entry) =>
          isVisibleOnCurrentTeam(entry.status, currentTeamID, entry.fromTeamID, entry.toTeamID) &&
          matchesRosterPlayer(entry, player)
      )
      .sort(compareMarkPriority)[0];
    return proposal ? buildRosterMarkFromEntry(proposal) : null;
  }

  const cohort = [...snapshot.cohorts]
    .filter(
      (entry) =>
        isVisibleOnCurrentTeam(entry.status, currentTeamID, entry.fromTeamID, entry.toTeamID) &&
        matchesSquad(player, entry.squadID)
    )
    .sort(compareMarkPriority)[0];
  return cohort ? buildRosterMarkFromEntry(cohort) : null;
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
      message: 'Отчета по dry-run балансу пока нет',
      triggerLabel: 'Плановая проверка impact',
      impactSummary: '—',
      teamSizeSummary: '—',
      updatedAtLabel: '—',
      ageMs: Number.POSITIVE_INFINITY,
      safetyCards: [],
      rows: []
    };
  }

  const reportTimestampMs = getReportTimestamp(snapshot);
  const ageMs = getReportAgeMs(snapshot, nowMs);
  const triggerLabel = buildTriggerLabel(snapshot);
  const impactSummary = buildImpactSummary(snapshot);
  const teamSizeSummary = buildTeamSizeSummary(snapshot);
  const updatedAtLabel = formatUpdatedAt(reportTimestampMs);

  if (!reportTimestampMs || ageMs > freshnessMs) {
    return {
      state: 'stale',
      tone: 'neutral',
      mode,
      modes,
      message: 'Отчет по dry-run балансу устарел',
      triggerLabel,
      impactSummary,
      teamSizeSummary,
      updatedAtLabel,
      ageMs,
      safetyCards: [],
      rows: []
    };
  }

  const safetyCards = buildTeamBalancerSafetyCards(snapshot);
  const hasProposal = snapshot.action === 'recommend' && getModeEntries(snapshot, mode).length > 0;

  if (!hasProposal) {
    return {
      state: 'healthy',
      tone: 'neutral',
      mode,
      modes,
      message: snapshot.signals?.impact?.available ? 'Импакт в допуске' : 'Размер команд в допуске',
      triggerLabel,
      impactSummary,
      teamSizeSummary,
      updatedAtLabel,
      ageMs,
      safetyCards,
      rows: []
    };
  }

  return {
    state: 'proposal',
    tone: getProposalTone(snapshot, mode),
    mode,
    modes,
    message: 'Нужно действие',
    triggerLabel,
    impactSummary,
    teamSizeSummary,
    updatedAtLabel,
    ageMs,
    safetyCards,
    rows: []
  };
}
