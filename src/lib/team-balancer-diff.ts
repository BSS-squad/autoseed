import type {
  ExporterTeamBalancerCohortSnapshot,
  ExporterTeamBalancerPlayerSnapshot,
  ExporterTeamBalancerSnapshot,
  TeamBalancerProposalMode,
  TeamBalancerProposalStatus
} from '../types';

export const TEAM_BALANCER_FRESHNESS_MS = 5 * 60 * 1000;

export type TeamBalancerDiffTone = 'success' | 'neutral' | 'conflict';

export type TeamBalancerDiffViewState = 'missing' | 'stale' | 'healthy' | 'proposal';

export type TeamBalancerDiffRow = {
  id: string;
  title: string;
  subtitle: string;
  route: string;
  tone: TeamBalancerDiffTone;
  statusLabel: string;
};

export type TeamBalancerDiffView = {
  state: TeamBalancerDiffViewState;
  tone: TeamBalancerDiffTone;
  mode: TeamBalancerProposalMode;
  modes: TeamBalancerProposalMode[];
  message: string;
  triggerLabel: string;
  teamSizeSummary: string;
  updatedAtLabel: string;
  ageMs: number;
  rows: TeamBalancerDiffRow[];
};

type TeamBalancerDiffOptions = {
  nowMs?: number;
  freshnessMs?: number;
};

const DEFAULT_MODES: TeamBalancerProposalMode[] = ['squad', 'player'];

const TRIGGER_LABELS: Record<string, string> = {
  team_size_diff: 'Разница по размеру сторон',
  team_size_within_tolerance: 'Стороны в пределах допуска',
  invalid_snapshot: 'Недостаточно данных',
  max_moves_exhausted: 'Лимит переводов исчерпан'
};

function formatTeamId(value: string | number | null | undefined): string {
  const text = String(value ?? '').trim();
  return text ? `Сторона ${text}` : 'Сторона не указана';
}

function formatRoute(fromTeamID: string | number | null, toTeamID: string | number | null): string {
  return `${formatTeamId(fromTeamID)} -> ${formatTeamId(toTeamID)}`;
}

function formatPlayerCount(value: number): string {
  const count = Math.max(0, Math.round(value));
  const mod10 = count % 10;
  const mod100 = count % 100;
  const suffix =
    mod10 === 1 && mod100 !== 11
      ? 'игрок'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'игрока'
        : 'игроков';
  return `${count} ${suffix}`;
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

function buildTeamSizeSummary(snapshot: ExporterTeamBalancerSnapshot | null): string {
  const teamSize = snapshot?.signals?.teamSize;
  if (!teamSize) return '—';
  return `${formatTeamCounts(teamSize.before)} -> ${formatTeamCounts(teamSize.after)}`;
}

function buildTriggerLabel(snapshot: ExporterTeamBalancerSnapshot | null): string {
  const reason = snapshot?.signals?.triggerReason || snapshot?.reasonCodes?.[0] || '';
  return TRIGGER_LABELS[reason] || 'Плановая проверка баланса';
}

function getStatusTone(status: TeamBalancerProposalStatus): TeamBalancerDiffTone {
  if (status === 'accepted' || status === 'moved' || status === 'already_target') return 'success';
  if (status === 'recommended') return 'conflict';
  return 'neutral';
}

function getStatusLabel(status: TeamBalancerProposalStatus): string {
  if (status === 'accepted' || status === 'moved') return 'Перевод подтвержден';
  if (status === 'already_target') return 'Уже на нужной стороне';
  if (status === 'recommended') return 'Рекомендуется перевести';
  return 'Без перестановки';
}

function buildCohortTitle(cohort: ExporterTeamBalancerCohortSnapshot): string {
  if (cohort.type === 'squad' && cohort.squadID !== null && cohort.squadID !== undefined) {
    return `Сквад ${cohort.squadID}`;
  }
  if (cohort.type === 'player') return 'Одиночные игроки';
  return 'Группа игроков';
}

function buildSquadRows(cohorts: ExporterTeamBalancerCohortSnapshot[]): TeamBalancerDiffRow[] {
  return cohorts.map((cohort) => ({
    id: cohort.cohortKey || `${cohort.fromTeamID || 'from'}-${cohort.toTeamID || 'to'}`,
    title: buildCohortTitle(cohort),
    subtitle: formatPlayerCount(cohort.playerCount),
    route: formatRoute(cohort.fromTeamID, cohort.toTeamID),
    tone: getStatusTone(cohort.status),
    statusLabel: getStatusLabel(cohort.status)
  }));
}

function buildPlayerRows(players: ExporterTeamBalancerPlayerSnapshot[]): TeamBalancerDiffRow[] {
  return players.map((player, index) => ({
    id: `${player.name}-${player.fromTeamID || 'from'}-${player.toTeamID || 'to'}-${index}`,
    title: player.name || 'Игрок',
    subtitle:
      player.squadID !== null && player.squadID !== undefined
        ? `Сквад ${player.squadID}`
        : 'Без сквада',
    route: formatRoute(player.fromTeamID, player.toTeamID),
    tone: getStatusTone(player.status),
    statusLabel: getStatusLabel(player.status)
  }));
}

function buildRows(
  snapshot: ExporterTeamBalancerSnapshot,
  mode: TeamBalancerProposalMode
): TeamBalancerDiffRow[] {
  return mode === 'player' ? buildPlayerRows(snapshot.players) : buildSquadRows(snapshot.cohorts);
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
      message: 'Отчета балансировки пока нет',
      triggerLabel: 'Плановая проверка баланса',
      teamSizeSummary: '—',
      updatedAtLabel: '—',
      ageMs: Number.POSITIVE_INFINITY,
      rows: []
    };
  }

  const reportTimestampMs = getReportTimestamp(snapshot);
  const ageMs = reportTimestampMs ? Math.max(0, nowMs - reportTimestampMs) : Number.POSITIVE_INFINITY;
  const triggerLabel = buildTriggerLabel(snapshot);
  const teamSizeSummary = buildTeamSizeSummary(snapshot);
  const updatedAtLabel = formatUpdatedAt(reportTimestampMs);

  if (!reportTimestampMs || ageMs > freshnessMs) {
    return {
      state: 'stale',
      tone: 'neutral',
      mode,
      modes,
      message: 'Отчет балансировки устарел',
      triggerLabel,
      teamSizeSummary,
      updatedAtLabel,
      ageMs,
      rows: []
    };
  }

  const rows = buildRows(snapshot, mode);
  const hasProposal = snapshot.action === 'recommend' && rows.length > 0;

  if (!hasProposal) {
    return {
      state: 'healthy',
      tone: 'neutral',
      mode,
      modes,
      message: 'Баланс в допуске',
      triggerLabel,
      teamSizeSummary,
      updatedAtLabel,
      ageMs,
      rows: []
    };
  }

  return {
    state: 'proposal',
    tone: rows.some((row) => row.tone === 'conflict') ? 'conflict' : 'success',
    mode,
    modes,
    message: 'Нужно действие',
    triggerLabel,
    teamSizeSummary,
    updatedAtLabel,
    ageMs,
    rows
  };
}
