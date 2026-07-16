import type {
  CombinedSnapshot,
  ExporterEndpointConfig,
  ExporterActivityKillfeedEventSnapshot,
  ExporterActivityKillfeedSnapshot,
  ExporterActivityEventCountsSnapshot,
  ExporterActivityRecentRoundSnapshot,
  ExporterActivityRoundTotalsSnapshot,
  ExporterActivityScoreboardPlayerSnapshot,
  ExporterActivityScoreboardSnapshot,
  ExporterActivityScoreboardTeamSnapshot,
  ExporterActivitySessionEventsSnapshot,
  ExporterActivitySessionResponse,
  ExporterActivitySnapshot,
  ExporterActivityTeamResultSnapshot,
  ExporterActivityTopEntrySnapshot,
  ExporterActivityTopWindowSnapshot,
  ExporterJoinLinkResponse,
  ExporterPlayerSnapshot,
  ExporterRaffleActiveSnapshot,
  ExporterRaffleBudgetSnapshot,
  ExporterRaffleCampaignSnapshot,
  ExporterRaffleHistoryEntrySnapshot,
  ExporterRaffleParticipantSnapshot,
  ExporterRaffleSnapshot,
  ExporterServerSnapshot,
  ExporterTeamBalancerRecentRoundSeveritySignal,
  ExporterSnapshotPlayerResponse,
  ExporterSnapshotResponse,
  ExporterSnapshotServerResponse,
  ExporterSnapshotSquadResponse,
  ExporterSnapshotTeamResponse,
  ExporterSquadSnapshot,
  ExporterTeamBalancerCohortSnapshot,
  ExporterTeamBalancerControlSnapshot,
  ExporterTeamBalancerExecutionSnapshot,
  ExporterTeamBalancerHistoryEntrySnapshot,
  ExporterTeamBalancerMetricSnapshot,
  ExporterTeamBalancerModeSnapshot,
  ExporterTeamBalancerModeratorDecisionSnapshot,
  ExporterTeamBalancerPlayerSnapshot,
  ExporterTeamBalancerSignalsSnapshot,
  ExporterTeamBalancerSnapshot,
  ExporterTeamBalancerTicketDiffSignal,
  ExporterTeamBalancerVoteGateSnapshot,
  ExporterTeamBalancerWinStreakSignal,
  ExporterTeamSnapshot,
  TeamBalancerProposalMode
} from '../types';

const MAX_TERMINAL_VEHICLE_PAIR_DELTA_MS = 100;

type ExporterSnapshotState = {
  name: string;
  snapshotUrl: string;
  joinLinkUrl: string;
  eventsUrl: string;
  initialized: boolean;
  servers: ExporterServerSnapshot[];
  timestamp: number;
  generatedAt: string;
  error: string | null;
};

type ExporterStreamSubscription = {
  state: ExporterSnapshotState;
  eventSource: EventSource | null;
  pollTimerId: number | null;
  reconnectTimerId: number | null;
  reconnectAttempt: number;
};

export const SNAPSHOT_POLL_INTERVAL_MS = 30_000;
const STREAM_RECONNECT_BASE_DELAY_MS = 60_000;
const STREAM_RECONNECT_MAX_DELAY_MS = 5 * 60_000;
const SNAPSHOT_HEADERS = {
  Accept: 'application/json'
} as const;

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toStringIdOrNull(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return toStringOrNull(value);
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFiniteNumberOrNull(value: unknown): number | null {
  if (
    value === null ||
    typeof value === 'undefined' ||
    (typeof value === 'string' && !value.trim())
  ) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNonNegativeIntegerOrNull(value: unknown): number | null {
  const parsed = toFiniteNumberOrNull(value);
  if (parsed === null || parsed < 0) return null;
  return Math.round(parsed);
}

function toNonNegativeNumberOrNull(value: unknown): number | null {
  const parsed = toFiniteNumberOrNull(value);
  return parsed === null || parsed < 0 ? null : parsed;
}

function toIsoStringOrNull(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseActivityEventTime(value: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isTerminalVehiclePair(
  damageEvent: ExporterActivityKillfeedEventSnapshot,
  destroyedEvent: ExporterActivityKillfeedEventSnapshot
): boolean {
  if (damageEvent.destroyed || !destroyedEvent.destroyed) return false;
  if (damageEvent.healthRemaining !== null) return false;
  if (destroyedEvent.healthRemaining !== null && destroyedEvent.healthRemaining > 0) return false;
  if (!damageEvent.vehicleName || damageEvent.vehicleName !== destroyedEvent.vehicleName) return false;
  if (
    typeof damageEvent.damage !== 'number' ||
    !Number.isFinite(damageEvent.damage) ||
    damageEvent.damage <= 0 ||
    damageEvent.damage !== destroyedEvent.damage
  ) {
    return false;
  }

  const damageTime = parseActivityEventTime(damageEvent.occurredAt);
  const destroyedTime = parseActivityEventTime(destroyedEvent.occurredAt);
  if (damageTime === null || destroyedTime === null) return false;

  const delta = destroyedTime - damageTime;
  return delta >= 0 && delta <= MAX_TERMINAL_VEHICLE_PAIR_DELTA_MS;
}

export function collapseTerminalVehicleEvents(
  events: readonly ExporterActivityKillfeedEventSnapshot[]
): ExporterActivityKillfeedEventSnapshot[] {
  const collapsed: ExporterActivityKillfeedEventSnapshot[] = [];

  for (const event of events) {
    if (event.destroyed) {
      let damageIndex = -1;
      for (let index = collapsed.length - 1; index >= 0; index -= 1) {
        if (isTerminalVehiclePair(collapsed[index], event)) {
          damageIndex = index;
          break;
        }
      }

      if (damageIndex >= 0) {
        const damageEvent = collapsed[damageIndex];
        collapsed[damageIndex] = {
          ...damageEvent,
          ...event,
          attackerName: event.attackerName || damageEvent.attackerName,
          weapon: event.weapon || damageEvent.weapon
        };
        continue;
      }
    }

    collapsed.push({ ...event });
  }

  return collapsed;
}

function buildLegacyActivitySessionId(endedAt: string | null): string {
  if (!endedAt) return '';
  const timestamp = Date.parse(endedAt);
  return Number.isFinite(timestamp) ? `legacy-${Math.floor(timestamp / 1000)}` : '';
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function mapPlayer(player: ExporterSnapshotPlayerResponse): ExporterPlayerSnapshot {
  return {
    eosId: player.eosId || null,
    steamId: player.steamId || null,
    matchKey: player.matchKey || null,
    name: player.name || 'Игрок',
    teamId: Number(player.teamId) || null,
    teamName: player.teamName || null,
    squadId: Number(player.squadId) || null,
    squadName: player.squadName || null,
    role: player.role || null,
    isLeader: Boolean(player.isLeader),
    isCommander: Boolean(player.isCommander),
    playtimeSeconds:
      typeof player.playtimeSeconds === 'number' ? player.playtimeSeconds : null,
    playtimeHours: typeof player.playtimeHours === 'number' ? player.playtimeHours : null,
    playtimeSource: player.playtimeSource || null
  };
}

function mapSquad(squad: ExporterSnapshotSquadResponse): ExporterSquadSnapshot {
  return {
    id: Number(squad.id) || null,
    name: squad.name || `Сквад ${Number(squad.id) || 0}`,
    playerCount: Number(squad.playerCount) || 0,
    totalPlaytimeSeconds:
      typeof squad.totalPlaytimeSeconds === 'number' ? squad.totalPlaytimeSeconds : null,
    totalPlaytimeHours: typeof squad.totalPlaytimeHours === 'number' ? squad.totalPlaytimeHours : null,
    leaderName: squad.leaderName || null,
    leaderPlaytimeSeconds:
      typeof squad.leaderPlaytimeSeconds === 'number' ? squad.leaderPlaytimeSeconds : null,
    leaderPlaytimeHours:
      typeof squad.leaderPlaytimeHours === 'number' ? squad.leaderPlaytimeHours : null
  };
}

function mapTeam(team: ExporterSnapshotTeamResponse): ExporterTeamSnapshot {
  return {
    id: Number(team.id) || null,
    name: team.name || `Сторона ${Number(team.id) || 0}`,
    playerCount: Number(team.playerCount) || 0,
    playersWithHours: Number(team.playersWithHours) || 0,
    totalPlaytimeSeconds:
      typeof team.totalPlaytimeSeconds === 'number' ? team.totalPlaytimeSeconds : null,
    totalPlaytimeHours: typeof team.totalPlaytimeHours === 'number' ? team.totalPlaytimeHours : null,
    leaderPlaytimeSeconds:
      typeof team.leaderPlaytimeSeconds === 'number' ? team.leaderPlaytimeSeconds : null,
    leaderPlaytimeHours:
      typeof team.leaderPlaytimeHours === 'number' ? team.leaderPlaytimeHours : null,
    commanderPlaytimeSeconds:
      typeof team.commanderPlaytimeSeconds === 'number' ? team.commanderPlaytimeSeconds : null,
    commanderPlaytimeHours:
      typeof team.commanderPlaytimeHours === 'number' ? team.commanderPlaytimeHours : null,
    squads: Array.isArray(team.squads) ? team.squads.map(mapSquad) : [],
    players: Array.isArray(team.players) ? team.players.map(mapPlayer) : []
  };
}

function mapRaffleParticipant(value: unknown): ExporterRaffleParticipantSnapshot {
  const participant = getRecord(value);

  return {
    name: toStringOrNull(participant?.name) || 'Игрок',
    joinedAt: toIsoStringOrNull(participant?.joinedAt)
  };
}

function mapRaffleActive(value: unknown): ExporterRaffleActiveSnapshot | null {
  const active = getRecord(value);
  if (!active) return null;

  return {
    serverID: Number(active.serverID) || null,
    prize: toStringOrNull(active.prize) || 'Приз',
    amountRubles: Math.max(0, Math.round(toNumber(active.amountRubles))),
    startedAt: toIsoStringOrNull(active.startedAt),
    endsAt: toIsoStringOrNull(active.endsAt),
    source: toStringOrNull(active.source) || 'manual',
    participantCount: Math.max(0, Math.round(toNumber(active.participantCount)))
  };
}

function mapRaffleHistoryEntry(value: unknown): ExporterRaffleHistoryEntrySnapshot {
  const entry = getRecord(value) || {};
  const participants = Array.isArray(entry.participants)
    ? entry.participants.map(mapRaffleParticipant)
    : [];

  return {
    id:
      typeof entry.id === 'number' || typeof entry.id === 'string'
        ? entry.id
        : null,
    serverID: Number(entry.serverID) || null,
    prize: toStringOrNull(entry.prize) || 'Приз',
    amountRubles: Math.max(0, Math.round(toNumber(entry.amountRubles))),
    startedAt: toIsoStringOrNull(entry.startedAt),
    endedAt: toIsoStringOrNull(entry.endedAt),
    participants,
    winner: entry.winner ? mapRaffleParticipant(entry.winner) : null,
    startedBy: entry.startedBy ? mapRaffleParticipant(entry.startedBy) : null,
    source: toStringOrNull(entry.source) || 'manual'
  };
}

function mapRaffleBudget(value: unknown): ExporterRaffleBudgetSnapshot {
  const budget = getRecord(value) || {};

  return {
    limitRubles: Math.max(0, Math.round(toNumber(budget.limitRubles))),
    spentRubles: Math.max(0, Math.round(toNumber(budget.spentRubles))),
    remainingRubles: Math.max(0, Math.round(toNumber(budget.remainingRubles)))
  };
}

function mapRaffleCampaign(value: unknown): ExporterRaffleCampaignSnapshot | null {
  const campaign = getRecord(value);
  if (!campaign) return null;

  return {
    startsAt: toStringOrNull(campaign.startsAt),
    endsAt: toStringOrNull(campaign.endsAt),
    cancelled: Boolean(campaign.cancelled),
    cancelledAt: toStringOrNull(campaign.cancelledAt),
    autoStartEnabled: Boolean(campaign.autoStartEnabled),
    autoPrizes: Array.isArray(campaign.autoPrizes)
      ? campaign.autoPrizes
          .map((entry) => toStringOrNull(entry))
          .filter((entry): entry is string => Boolean(entry))
      : [],
    primeTimeStartHour: toNumber(campaign.primeTimeStartHour, 12),
    primeTimeEndHour: toNumber(campaign.primeTimeEndHour, 22),
    timezoneOffsetMinutes: Math.round(toNumber(campaign.timezoneOffsetMinutes, 180)),
    minimumPrimePlayers: Math.max(0, Math.round(toNumber(campaign.minimumPrimePlayers, 90))),
    minimumAnnouncementPlayers: Math.max(
      0,
      Math.round(toNumber(campaign.minimumAnnouncementPlayers, 1))
    ),
    durationSeconds: Math.max(1, Math.round(toNumber(campaign.durationSeconds, 1200))),
    progress: Math.max(0, Math.min(1, toNumber(campaign.progress, 0)))
  };
}

function mapRaffleSnapshot(value: unknown): ExporterRaffleSnapshot | null {
  const raffles = getRecord(value);
  if (!raffles) return null;
  const campaign = mapRaffleCampaign(raffles.campaign);
  const campaigns = Array.isArray(raffles.campaigns)
    ? raffles.campaigns
        .map(mapRaffleCampaign)
        .filter((entry): entry is ExporterRaffleCampaignSnapshot => Boolean(entry))
    : [];

  return {
    active: mapRaffleActive(raffles.active),
    history: Array.isArray(raffles.history)
      ? raffles.history.map(mapRaffleHistoryEntry)
      : [],
    budget: mapRaffleBudget(raffles.budget),
    campaign,
    campaigns: campaign ? [...campaigns, campaign] : campaigns
  };
}

function mapTeamBalancerMode(value: unknown): 'squad' | 'player' | null {
  return value === 'squad' || value === 'player' ? value : null;
}

function mapTeamBalancerModes(value: unknown): Array<'squad' | 'player'> {
  if (!Array.isArray(value)) return ['squad', 'player'];
  const modes = value
    .map(mapTeamBalancerMode)
    .filter((entry): entry is 'squad' | 'player' => Boolean(entry));
  return modes.length ? modes : ['squad', 'player'];
}

function mapTeamBalancerCounts(value: unknown): Record<string, number> {
  const counts = getRecord(value);
  if (!counts) return {};

  return Object.fromEntries(
    Object.entries(counts).map(([key, item]) => [
      key,
      Math.max(0, Math.round(toNumber(item)))
    ])
  );
}

function mapTeamBalancerTicketDiff(
  value: unknown
): ExporterTeamBalancerTicketDiffSignal | null {
  const signal = getRecord(value);
  if (!signal) return null;

  const winnerTeamID = toStringIdOrNull(signal.winnerTeamID);
  const loserTeamID = toStringIdOrNull(signal.loserTeamID);
  const winnerTickets = toNonNegativeIntegerOrNull(signal.winnerTickets);
  const loserTickets = toNonNegativeIntegerOrNull(signal.loserTickets);
  const diff = toNonNegativeIntegerOrNull(signal.diff);

  if (
    !winnerTeamID ||
    !loserTeamID ||
    winnerTickets === null ||
    loserTickets === null ||
    diff === null
  ) {
    return null;
  }

  return {
    winnerTeamID,
    loserTeamID,
    winnerTickets,
    loserTickets,
    diff
  };
}

function mapTeamBalancerWinStreak(
  value: unknown
): ExporterTeamBalancerWinStreakSignal | null {
  const signal = getRecord(value);
  if (!signal) return null;

  const teamID = toStringIdOrNull(signal.teamID);
  const count = toNonNegativeIntegerOrNull(signal.count);
  const threshold = toNonNegativeIntegerOrNull(signal.threshold);

  if (!teamID || count === null || count <= 0 || threshold === null || threshold <= 0) {
    return null;
  }

  return {
    teamID,
    count,
    threshold
  };
}

function mapTeamBalancerRecentRoundSeverity(
  value: unknown
): ExporterTeamBalancerRecentRoundSeveritySignal | null {
  const signal = getRecord(value);
  if (!signal) return null;

  const level = toStringOrNull(signal.level);
  if (!level) return null;

  return {
    level,
    reasons: Array.isArray(signal.reasons)
      ? signal.reasons
          .map((entry) => toStringOrNull(entry))
          .filter((entry): entry is string => Boolean(entry))
      : [],
    ticketDiff: toNonNegativeIntegerOrNull(signal.ticketDiff),
    winStreak: toNonNegativeIntegerOrNull(signal.winStreak)
  };
}

function mapTeamBalancerMetric(value: unknown): ExporterTeamBalancerMetricSnapshot | null {
  const metric = getRecord(value);
  if (!metric) return null;

  return {
    available: Boolean(metric.available),
    metric: toStringOrNull(metric.metric) || 'playtimeSeconds',
    unit: toStringOrNull(metric.unit) || 'seconds',
    before: mapTeamBalancerCounts(metric.before),
    after: mapTeamBalancerCounts(metric.after),
    diffBefore: Math.max(0, Math.round(toNumber(metric.diffBefore))),
    diffAfter: Math.max(0, Math.round(toNumber(metric.diffAfter))),
    moved: Math.max(0, Math.round(toNumber(metric.moved)))
  };
}

function mapTeamBalancerSignals(value: unknown): ExporterTeamBalancerSignalsSnapshot {
  const signals = getRecord(value) || {};
  const teamSize = getRecord(signals.teamSize) || {};

  return {
    triggerReason: toStringOrNull(signals.triggerReason),
    teamSize: {
      before: mapTeamBalancerCounts(teamSize.before),
      after: mapTeamBalancerCounts(teamSize.after),
      diffBefore: Math.max(0, Math.round(toNumber(teamSize.diffBefore))),
      diffAfter: Math.max(0, Math.round(toNumber(teamSize.diffAfter)))
    },
    skill: mapTeamBalancerMetric(signals.skill),
    impact: mapTeamBalancerMetric(signals.impact),
    winStreak: mapTeamBalancerWinStreak(signals.winStreak),
    ticketDiff: mapTeamBalancerTicketDiff(signals.ticketDiff),
    recentRoundSeverity: mapTeamBalancerRecentRoundSeverity(signals.recentRoundSeverity)
  };
}

function mapTeamBalancerCohort(value: unknown): ExporterTeamBalancerCohortSnapshot | null {
  const cohort = getRecord(value);
  if (!cohort) return null;

  return {
    type: toStringOrNull(cohort.type) || 'squad',
    cohortKey: toStringOrNull(cohort.cohortKey) || '',
    fromTeamID: toStringOrNull(cohort.fromTeamID),
    toTeamID: toStringOrNull(cohort.toTeamID),
    currentTeamID: toStringOrNull(cohort.currentTeamID),
    expectedTeamID: toStringOrNull(cohort.expectedTeamID),
    squadID:
      typeof cohort.squadID === 'number' || typeof cohort.squadID === 'string'
        ? cohort.squadID
        : null,
    squadName: toStringOrNull(cohort.squadName),
    compositionKey: toStringOrNull(cohort.compositionKey),
    playerCount: Math.max(0, Math.round(toNumber(cohort.playerCount))),
    status: toStringOrNull(cohort.status) || 'noop',
    confidence: toFiniteNumberOrNull(cohort.confidence),
    score: toFiniteNumberOrNull(cohort.score),
    impactSeconds: toFiniteNumberOrNull(cohort.impactSeconds),
    impactHours: toFiniteNumberOrNull(cohort.impactHours)
  };
}

function mapTeamBalancerPlayer(value: unknown): ExporterTeamBalancerPlayerSnapshot | null {
  const player = getRecord(value);
  if (!player) return null;
  const reward = getRecord(player.reward);

  return {
    name: toStringOrNull(player.name) || 'Игрок',
    matchKey: toStringOrNull(player.matchKey),
    fromTeamID: toStringOrNull(player.fromTeamID),
    toTeamID: toStringOrNull(player.toTeamID),
    currentTeamID: toStringOrNull(player.currentTeamID),
    expectedTeamID: toStringOrNull(player.expectedTeamID),
    squadID:
      typeof player.squadID === 'number' || typeof player.squadID === 'string'
        ? player.squadID
        : null,
    squadName: toStringOrNull(player.squadName),
    status: toStringOrNull(player.status) || 'noop',
    confidence: toFiniteNumberOrNull(player.confidence),
    score: toFiniteNumberOrNull(player.score),
    reward: reward
      ? {
          type: toStringOrNull(reward.type),
          acceptanceMultiplier: Math.max(0, toNumber(reward.acceptanceMultiplier)),
          reason: toStringOrNull(reward.reason)
        }
      : null,
    impactSeconds: toFiniteNumberOrNull(player.impactSeconds),
    impactHours: toFiniteNumberOrNull(player.impactHours)
  };
}

function mapTeamBalancerModeSnapshot(
  value: unknown,
  fallbackMode: TeamBalancerProposalMode
): ExporterTeamBalancerModeSnapshot | null {
  const modeSnapshot = getRecord(value);
  if (!modeSnapshot) return null;

  const cohorts = Array.isArray(modeSnapshot.cohorts)
    ? modeSnapshot.cohorts
        .map(mapTeamBalancerCohort)
        .filter((entry): entry is ExporterTeamBalancerCohortSnapshot => Boolean(entry))
    : [];
  const players = Array.isArray(modeSnapshot.players)
    ? modeSnapshot.players
        .map(mapTeamBalancerPlayer)
        .filter((entry): entry is ExporterTeamBalancerPlayerSnapshot => Boolean(entry))
    : [];

  return {
    proposalMode: mapTeamBalancerMode(modeSnapshot.proposalMode) || fallbackMode,
    action: toStringOrNull(modeSnapshot.action) || 'noop',
    result: toStringOrNull(modeSnapshot.result),
    reasonCodes: Array.isArray(modeSnapshot.reasonCodes)
      ? modeSnapshot.reasonCodes
          .map((entry) => toStringOrNull(entry))
          .filter((entry): entry is string => Boolean(entry))
      : [],
    signals: mapTeamBalancerSignals(modeSnapshot.signals),
    summary: toStringOrNull(modeSnapshot.summary),
    cohorts,
    players
  };
}

function mapTeamBalancerProposalModes(
  value: unknown
): Partial<Record<TeamBalancerProposalMode, ExporterTeamBalancerModeSnapshot>> {
  const modes = getRecord(value);
  if (!modes) return {};

  return Object.fromEntries(
    (['squad', 'player'] as TeamBalancerProposalMode[])
      .map((mode) => [mode, mapTeamBalancerModeSnapshot(modes[mode], mode)] as const)
      .filter((entry): entry is readonly [TeamBalancerProposalMode, ExporterTeamBalancerModeSnapshot] =>
        Boolean(entry[1])
      )
  );
}

function mapTeamBalancerVoteGate(value: unknown): ExporterTeamBalancerVoteGateSnapshot | null {
  const voteGate = getRecord(value);
  if (!voteGate) return null;

  return {
    enabled: Boolean(voteGate.enabled),
    quorumPercent: Math.max(0, toNumber(voteGate.quorumPercent)),
    passThresholdPercent: Math.max(0, toNumber(voteGate.passThresholdPercent)),
    eligiblePlayerCount: Math.max(0, Math.round(toNumber(voteGate.eligiblePlayerCount))),
    requiredVotes: Math.max(0, Math.round(toNumber(voteGate.requiredVotes))),
    totalVotes: Math.max(0, Math.round(toNumber(voteGate.totalVotes))),
    yesVotes: Math.max(0, Math.round(toNumber(voteGate.yesVotes))),
    noVotes: Math.max(0, Math.round(toNumber(voteGate.noVotes))),
    quorumMet: Boolean(voteGate.quorumMet),
    passThresholdMet: Boolean(voteGate.passThresholdMet),
    approved: Boolean(voteGate.approved)
  };
}

function mapTeamBalancerControl(value: unknown): ExporterTeamBalancerControlSnapshot | null {
  const control = getRecord(value);
  if (!control) return null;

  const activeVote = getRecord(control.activeVote);
  return {
    enabled: Boolean(control.enabled),
    updatedAt: toIsoStringOrNull(control.updatedAt),
    activeVote: activeVote
      ? {
          targetEnabled: Boolean(activeVote.targetEnabled),
          createdAt: toIsoStringOrNull(activeVote.createdAt),
          expiresAt: toIsoStringOrNull(activeVote.expiresAt),
          voteGate: mapTeamBalancerVoteGate(activeVote.voteGate)
        }
      : null
  };
}

function mapTeamBalancerModeratorDecision(
  value: unknown
): ExporterTeamBalancerModeratorDecisionSnapshot | null {
  const decision = getRecord(value);
  if (!decision) return null;

  return {
    required: Boolean(decision.required),
    approved: Boolean(decision.approved),
    vetoed: Boolean(decision.vetoed),
    action: toStringOrNull(decision.action),
    reason: toStringOrNull(decision.reason),
    note: toStringOrNull(decision.note),
    moderatorName: toStringOrNull(decision.moderatorName),
    createdAt: toIsoStringOrNull(decision.createdAt)
  };
}

function mapTeamBalancerExecution(value: unknown): ExporterTeamBalancerExecutionSnapshot | null {
  const execution = getRecord(value);
  if (!execution) return null;
  const swapLock = getRecord(execution.swapLock);

  return {
    enabled: Boolean(execution.enabled),
    status: toStringOrNull(execution.status) || 'disabled',
    plannedMoves: Math.max(0, Math.round(toNumber(execution.plannedMoves))),
    plannedPlayers: Math.max(0, Math.round(toNumber(execution.plannedPlayers))),
    attemptedPlayers: Math.max(0, Math.round(toNumber(execution.attemptedPlayers))),
    succeededPlayers: Math.max(0, Math.round(toNumber(execution.succeededPlayers))),
    failedPlayers: Math.max(0, Math.round(toNumber(execution.failedPlayers))),
    totalRconAttempts: Math.max(0, Math.round(toNumber(execution.totalRconAttempts))),
    maxAttemptsPerPlayer: Math.max(0, Math.round(toNumber(execution.maxAttemptsPerPlayer))),
    completedAt: toIsoStringOrNull(execution.completedAt),
    swapLock: swapLock
      ? {
          enabled: Boolean(swapLock.enabled),
          durationMs: Math.max(0, Math.round(toNumber(swapLock.durationMs))),
          expiresAt: toIsoStringOrNull(swapLock.expiresAt)
        }
      : null
  };
}

function mapTeamBalancerHistoryMove(
  value: unknown
): ExporterTeamBalancerHistoryEntrySnapshot['moves'][number] | null {
  const record = getRecord(value);
  if (!record) return null;

  return {
    type: toStringOrNull(record.type) || 'move',
    fromTeamID: toStringOrNull(record.fromTeamID),
    toTeamID: toStringOrNull(record.toTeamID),
    squadName: toStringOrNull(record.squadName),
    playerCount: Math.max(0, Math.round(toNumber(record.playerCount))),
    status: toStringOrNull(record.status) || 'evaluated'
  };
}

function mapTeamBalancerHistoryPlayer(
  value: unknown
): ExporterTeamBalancerHistoryEntrySnapshot['players'][number] | null {
  const record = getRecord(value);
  if (!record) return null;

  return {
    name: toStringOrNull(record.name) || 'Игрок',
    matchKey: toStringOrNull(record.matchKey),
    fromTeamID: toStringOrNull(record.fromTeamID),
    toTeamID: toStringOrNull(record.toTeamID),
    squadName: toStringOrNull(record.squadName),
    status: toStringOrNull(record.status) || 'move_pending'
  };
}

function mapTeamBalancerHistoryMode(
  value: unknown,
  fallbackMode: TeamBalancerProposalMode
): NonNullable<ExporterTeamBalancerHistoryEntrySnapshot['proposalModes']>[TeamBalancerProposalMode] | null {
  const mode = getRecord(value);
  if (!mode) return null;
  const teamCounts = getRecord(mode.teamCounts) || {};

  return {
    proposalMode: mapTeamBalancerMode(mode.proposalMode) || fallbackMode,
    action: toStringOrNull(mode.action),
    result: toStringOrNull(mode.result),
    status: toStringOrNull(mode.status) || toStringOrNull(mode.result) || 'evaluated',
    reasonCodes: Array.isArray(mode.reasonCodes)
      ? mode.reasonCodes
          .map((reason) => toStringOrNull(reason))
          .filter((reason): reason is string => Boolean(reason))
      : [],
    plannedMoves: Math.max(0, Math.round(toNumber(mode.plannedMoves))),
    plannedPlayers: Math.max(0, Math.round(toNumber(mode.plannedPlayers))),
    summary: toStringOrNull(mode.summary),
    teamCounts: {
      before: mapTeamBalancerCounts(teamCounts.before),
      after: mapTeamBalancerCounts(teamCounts.after)
    },
    diffBefore: Math.max(0, Math.round(toNumber(mode.diffBefore))),
    diffAfter: Math.max(0, Math.round(toNumber(mode.diffAfter))),
    moves: Array.isArray(mode.moves)
      ? mode.moves
          .map(mapTeamBalancerHistoryMove)
          .filter((move): move is ExporterTeamBalancerHistoryEntrySnapshot['moves'][number] =>
            Boolean(move)
          )
      : [],
    players: Array.isArray(mode.players)
      ? mode.players
          .map(mapTeamBalancerHistoryPlayer)
          .filter((player): player is ExporterTeamBalancerHistoryEntrySnapshot['players'][number] =>
            Boolean(player)
          )
      : []
  };
}

function mapTeamBalancerHistoryProposalModes(
  value: unknown
): ExporterTeamBalancerHistoryEntrySnapshot['proposalModes'] {
  const modes = getRecord(value);
  if (!modes) return undefined;

  return Object.fromEntries(
    (['squad', 'player'] as TeamBalancerProposalMode[])
      .map((mode) => [mode, mapTeamBalancerHistoryMode(modes[mode], mode)] as const)
      .filter(
        (entry): entry is readonly [
          TeamBalancerProposalMode,
          NonNullable<ExporterTeamBalancerHistoryEntrySnapshot['proposalModes']>[TeamBalancerProposalMode]
        ] => Boolean(entry[1])
      )
  );
}

function mapTeamBalancerHistoryEntry(value: unknown): ExporterTeamBalancerHistoryEntrySnapshot | null {
  const entry = getRecord(value);
  if (!entry) return null;

  return {
    decisionId: toStringOrNull(entry.decisionId),
    createdAt: toIsoStringOrNull(entry.createdAt),
    mode: toStringOrNull(entry.mode) || 'dry-run',
    proposalMode: mapTeamBalancerMode(entry.proposalMode) || toStringOrNull(entry.proposalMode),
    action: toStringOrNull(entry.action),
    result: toStringOrNull(entry.result),
    status: toStringOrNull(entry.status) || toStringOrNull(entry.result) || 'evaluated',
    trigger: toStringOrNull(entry.trigger),
    reasonCodes: Array.isArray(entry.reasonCodes)
      ? entry.reasonCodes
          .map((reason) => toStringOrNull(reason))
          .filter((reason): reason is string => Boolean(reason))
      : [],
    plannedMoves: Math.max(0, Math.round(toNumber(entry.plannedMoves))),
    plannedPlayers: Math.max(0, Math.round(toNumber(entry.plannedPlayers))),
    summary: toStringOrNull(entry.summary),
    execution: mapTeamBalancerExecution(entry.execution),
    moves: Array.isArray(entry.moves)
      ? entry.moves
          .map(mapTeamBalancerHistoryMove)
          .filter(
            (move): move is ExporterTeamBalancerHistoryEntrySnapshot['moves'][number] =>
              Boolean(move)
          )
      : [],
    players: Array.isArray(entry.players)
      ? entry.players
          .map(mapTeamBalancerHistoryPlayer)
          .filter(
            (player): player is ExporterTeamBalancerHistoryEntrySnapshot['players'][number] =>
              Boolean(player)
          )
      : [],
    proposalModes: mapTeamBalancerHistoryProposalModes(entry.proposalModes)
  };
}

function mapTeamBalancerSnapshot(value: unknown): ExporterTeamBalancerSnapshot | null {
  const snapshot = getRecord(value);
  if (!snapshot) return null;

  const availableProposalModes = mapTeamBalancerModes(snapshot.availableProposalModes);
  const defaultProposalMode =
    mapTeamBalancerMode(snapshot.defaultProposalMode) || availableProposalModes[0] || 'squad';
  const cohorts = Array.isArray(snapshot.cohorts)
    ? snapshot.cohorts
        .map(mapTeamBalancerCohort)
        .filter((entry): entry is ExporterTeamBalancerCohortSnapshot => Boolean(entry))
    : [];
  const players = Array.isArray(snapshot.players)
    ? snapshot.players
        .map(mapTeamBalancerPlayer)
        .filter((entry): entry is ExporterTeamBalancerPlayerSnapshot => Boolean(entry))
    : [];
  const proposalModes = mapTeamBalancerProposalModes(snapshot.proposalModes);
  const history = Array.isArray(snapshot.history)
    ? snapshot.history
        .map(mapTeamBalancerHistoryEntry)
        .filter((entry): entry is ExporterTeamBalancerHistoryEntrySnapshot => Boolean(entry))
    : [];

  return {
    version: Math.max(1, Math.round(toNumber(snapshot.version, 1))),
    schemaVersion: Math.max(1, Math.round(toNumber(snapshot.schemaVersion, 1))),
    algorithm: toStringOrNull(snapshot.algorithm),
    generatedAt: toIsoStringOrNull(snapshot.generatedAt),
    decisionId: toStringOrNull(snapshot.decisionId),
    serverId:
      typeof snapshot.serverId === 'number' || typeof snapshot.serverId === 'string'
        ? snapshot.serverId
        : null,
    mode: toStringOrNull(snapshot.mode) || 'dry-run',
    action: toStringOrNull(snapshot.action) || 'noop',
    result: toStringOrNull(snapshot.result),
    trigger: toStringOrNull(snapshot.trigger),
    snapshotTimestamp: toIsoStringOrNull(snapshot.snapshotTimestamp),
    availableProposalModes,
    defaultProposalMode,
    reasonCodes: Array.isArray(snapshot.reasonCodes)
      ? snapshot.reasonCodes
          .map((entry) => toStringOrNull(entry))
          .filter((entry): entry is string => Boolean(entry))
      : [],
    signals: mapTeamBalancerSignals(snapshot.signals),
    summary: toStringOrNull(snapshot.summary),
    cohorts,
    players,
    proposalModes,
    voteGate: mapTeamBalancerVoteGate(snapshot.voteGate),
    moderatorDecision: mapTeamBalancerModeratorDecision(snapshot.moderatorDecision),
    execution: mapTeamBalancerExecution(snapshot.execution),
    control: mapTeamBalancerControl(snapshot.control),
    history
  };
}

function mapActivityTeamResult(value: unknown): ExporterActivityTeamResultSnapshot | null {
  const team = getRecord(value);
  if (!team) return null;

  return {
    team: toStringIdOrNull(team.team),
    faction: toStringOrNull(team.faction),
    subfaction: toStringOrNull(team.subfaction),
    tickets: toNonNegativeIntegerOrNull(team.tickets)
  };
}

function mapActivityRoundTotals(value: unknown): ExporterActivityRoundTotalsSnapshot {
  const totals = getRecord(value) || {};
  return {
    kills: Math.max(0, Math.round(toNumber(totals.kills))),
    deaths: Math.max(0, Math.round(toNumber(totals.deaths))),
    revives: Math.max(0, Math.round(toNumber(totals.revives))),
    knockdowns: Math.max(0, Math.round(toNumber(totals.knockdowns)))
  };
}

function mapActivityEventCounts(value: unknown): ExporterActivityEventCountsSnapshot {
  const counts = getRecord(value) || {};
  return {
    kills: Math.max(0, Math.round(toNumber(counts.kills))),
    damage: Math.max(0, Math.round(toNumber(counts.damage))),
    knockdowns: Math.max(0, Math.round(toNumber(counts.knockdowns))),
    revives: Math.max(0, Math.round(toNumber(counts.revives))),
    vehicles: Math.max(0, Math.round(toNumber(counts.vehicles)))
  };
}

function mapActivityScoreboardPlayer(
  value: unknown
): ExporterActivityScoreboardPlayerSnapshot | null {
  const player = getRecord(value);
  const name = toStringOrNull(player?.name);
  if (!name) return null;
  const totals = mapActivityRoundTotals(player);

  return {
    name,
    squad: toStringOrNull(player?.squad),
    role: toStringOrNull(player?.role),
    kills: totals.kills,
    deaths: totals.deaths ?? 0,
    revives: totals.revives ?? 0,
    knockdowns: totals.knockdowns
  };
}

function mapActivityScoreboardTeam(
  value: unknown
): ExporterActivityScoreboardTeamSnapshot | null {
  const team = getRecord(value);
  const teamID = toStringIdOrNull(team?.teamID);
  const name = toStringOrNull(team?.name);
  if (!teamID || !name) return null;

  const result = team?.result === 'winner' || team?.result === 'loser' ? team.result : null;
  return {
    teamID,
    name,
    result,
    players: Array.isArray(team?.players)
      ? team.players
          .map(mapActivityScoreboardPlayer)
          .filter((entry): entry is ExporterActivityScoreboardPlayerSnapshot => Boolean(entry))
      : [],
    totals: mapActivityRoundTotals(team?.totals)
  };
}

function mapActivityScoreboard(value: unknown): ExporterActivityScoreboardSnapshot | null {
  const scoreboard = getRecord(value);
  if (!scoreboard) return null;

  const teams = Array.isArray(scoreboard.teams)
    ? scoreboard.teams
        .map(mapActivityScoreboardTeam)
        .filter((entry): entry is ExporterActivityScoreboardTeamSnapshot => Boolean(entry))
    : [];
  return teams.length ? { teams } : null;
}

function mapActivityLayerSource(
  value: unknown
): ExporterActivityRecentRoundSnapshot['layerSource'] {
  return value === 'new_game' || value === 'round_ended' || value === 'server_snapshot'
    ? value
    : null;
}

function mapActivityLayerMissingReason(
  value: unknown
): ExporterActivityRecentRoundSnapshot['layerMissingReason'] {
  return value === 'missing_start_event' ||
    value === 'missing_end_event' ||
    value === 'unmatched_session' ||
    value === 'normalization_failed'
    ? value
    : null;
}

function mapActivityRecentRound(value: unknown): ExporterActivityRecentRoundSnapshot | null {
  const round = getRecord(value);
  if (!round) return null;
  const endedAt = toIsoStringOrNull(round.endedAt);
  if (!endedAt) return null;
  const sessionId = toStringOrNull(round.sessionId) || buildLegacyActivitySessionId(endedAt);
  if (!sessionId) return null;

  return {
    sessionId,
    journalAvailable: Boolean(round.journalAvailable),
    journalComplete: Boolean(round.journalComplete),
    endedAt,
    layer: toStringOrNull(round.layer),
    layerSource: mapActivityLayerSource(round.layerSource),
    layerMissingReason: mapActivityLayerMissingReason(round.layerMissingReason),
    winner: mapActivityTeamResult(round.winner),
    loser: mapActivityTeamResult(round.loser),
    playerCount: Math.max(0, Math.round(toNumber(round.playerCount))),
    totals: mapActivityRoundTotals(round.totals),
    eventCounts: mapActivityEventCounts(round.eventCounts),
    scoreboard: mapActivityScoreboard(round.scoreboard)
  };
}

function mapActivitySessionIndex(value: unknown): ExporterActivityRecentRoundSnapshot | null {
  const session = mapActivityRecentRound(value);
  return session ? { ...session, scoreboard: null } : null;
}

function mapActivityTopEntry(value: unknown): ExporterActivityTopEntrySnapshot | null {
  const entry = getRecord(value);
  if (!entry) return null;
  const name = toStringOrNull(entry.name);
  if (!name) return null;

  return {
    rank: Math.max(1, Math.round(toNumber(entry.rank, 1))),
    name,
    roundsPlayed: Math.max(0, Math.round(toNumber(entry.roundsPlayed))),
    kills: Math.max(0, Math.round(toNumber(entry.kills))),
    deaths: Math.max(0, Math.round(toNumber(entry.deaths))),
    revives: Math.max(0, Math.round(toNumber(entry.revives))),
    knockdowns: Math.max(0, Math.round(toNumber(entry.knockdowns))),
    kdRatio: Math.max(0, toNumber(entry.kdRatio))
  };
}

function mapActivityTopWindow(value: unknown): ExporterActivityTopWindowSnapshot | null {
  const topWindow = getRecord(value);
  if (!topWindow) return null;

  return {
    roundLimit: Math.max(1, Math.round(toNumber(topWindow.roundLimit, 10))),
    roundCount: Math.max(0, Math.round(toNumber(topWindow.roundCount))),
    qualificationPercent: Math.max(0, Math.round(toNumber(topWindow.qualificationPercent))),
    requiredParticipation: Math.max(0, Math.round(toNumber(topWindow.requiredParticipation))),
    entries: Array.isArray(topWindow.entries)
      ? topWindow.entries
          .map(mapActivityTopEntry)
          .filter((entry): entry is ExporterActivityTopEntrySnapshot => Boolean(entry))
      : []
  };
}

function mapActivityKillfeedEvent(value: unknown): ExporterActivityKillfeedEventSnapshot | null {
  const event = getRecord(value);
  if (!event) return null;
  const attackerName = toStringOrNull(event.attackerName);
  const victimName = toStringOrNull(event.victimName);
  const roundEndedAt = toIsoStringOrNull(event.roundEndedAt);
  if (!attackerName || !victimName || !roundEndedAt) return null;

  return {
    type: toStringOrNull(event.type) || 'event',
    attackerName,
    victimName,
    count: Math.max(0, Math.round(toNumber(event.count))),
    weapon: toStringOrNull(event.weapon),
    damage: toNonNegativeNumberOrNull(event.damage),
    occurredAt: toIsoStringOrNull(event.occurredAt),
    roundEndedAt,
    vehicleName: null,
    healthRemaining: null,
    destroyed: false
  };
}

function mapActivityKillfeed(value: unknown): ExporterActivityKillfeedSnapshot | null {
  const killfeed = getRecord(value);
  if (!killfeed) return null;

  return {
    version: Math.max(1, Math.round(toNumber(killfeed.version, 1))),
    generatedAt: toIsoStringOrNull(killfeed.generatedAt),
    rounds: Array.isArray(killfeed.rounds)
      ? killfeed.rounds.flatMap((round) => {
          const record = getRecord(round) || {};
          const totals = getRecord(record.totals) || {};
          const endedAt = toIsoStringOrNull(record.endedAt);
          if (!endedAt) return [];
          const sessionId =
            toStringOrNull(record.sessionId) || buildLegacyActivitySessionId(endedAt);
          if (!sessionId) return [];
          return [{
            sessionId,
            endedAt,
            playerCount: toNonNegativeIntegerOrNull(record.playerCount) ?? undefined,
            totals: {
              kills: Math.max(0, Math.round(toNumber(totals.kills))),
              knockdowns: Math.max(0, Math.round(toNumber(totals.knockdowns)))
            },
            eventCounts: mapActivityEventCounts(record.eventCounts)
          }];
        })
      : [],
    events: Array.isArray(killfeed.events)
      ? killfeed.events
          .map(mapActivityKillfeedEvent)
          .filter((entry): entry is ExporterActivityKillfeedEventSnapshot => Boolean(entry))
      : []
  };
}

function mapActivitySnapshot(value: unknown): ExporterActivitySnapshot | null {
  const activity = getRecord(value);
  if (!activity) return null;
  const recentRounds = Array.isArray(activity.recentRounds)
    ? activity.recentRounds
        .map(mapActivityRecentRound)
        .filter((entry): entry is ExporterActivityRecentRoundSnapshot => Boolean(entry))
    : [];
  const sessions = Array.isArray(activity.sessions)
    ? activity.sessions
        .map(mapActivitySessionIndex)
        .filter((entry): entry is ExporterActivityRecentRoundSnapshot => Boolean(entry))
    : recentRounds;

  return {
    version: Math.max(1, Math.round(toNumber(activity.version, 1))),
    generatedAt: toIsoStringOrNull(activity.generatedAt),
    teamBalancerHistory: Array.isArray(activity.teamBalancerHistory)
      ? activity.teamBalancerHistory
          .map(mapTeamBalancerHistoryEntry)
          .filter((entry): entry is ExporterTeamBalancerHistoryEntrySnapshot => Boolean(entry))
      : [],
    sessions,
    recentRounds,
    topWindow: sessions.length || recentRounds.length ? mapActivityTopWindow(activity.topWindow) : null,
    killfeed: mapActivityKillfeed(activity.killfeed)
  };
}

function mapActivitySessionEvent(
  value: unknown,
  fallbackType: string
): ExporterActivityKillfeedEventSnapshot | null {
  const event = getRecord(value);
  if (!event) return null;

  const type = toStringOrNull(event.type) || fallbackType;
  const vehicleName = toStringOrNull(event.vehicleName);
  const attackerName = toStringOrNull(event.attackerName);
  const victimName = toStringOrNull(event.victimName);
  if (!type || (!vehicleName && !attackerName && !victimName)) return null;

  return {
    type,
    attackerName,
    victimName,
    count: Math.max(1, Math.round(toNumber(event.count, 1))),
    weapon: toStringOrNull(event.weapon),
    damage: toNonNegativeNumberOrNull(event.damage),
    occurredAt: toIsoStringOrNull(event.occurredAt),
    roundEndedAt: null,
    vehicleName,
    healthRemaining: toNonNegativeNumberOrNull(event.healthRemaining),
    destroyed: Boolean(event.destroyed)
  };
}

function mapActivitySessionEvents(value: unknown): ExporterActivitySessionEventsSnapshot {
  const events = getRecord(value) || {};
  const mapList = (key: string, fallbackType: string) =>
    (Array.isArray(events[key]) ? events[key] : [])
      .map((event) => mapActivitySessionEvent(event, fallbackType))
      .filter((event): event is ExporterActivityKillfeedEventSnapshot => Boolean(event));

  return {
    kills: mapList('kills', 'kill'),
    damage: mapList('damage', 'damage'),
    knockdowns: mapList('knockdowns', 'knockdown'),
    revives: mapList('revives', 'revive'),
    vehicles: collapseTerminalVehicleEvents(mapList('vehicles', 'vehicle'))
  };
}

function mapActivitySessionResponse(value: unknown): ExporterActivitySessionResponse | null {
  const payload = getRecord(value);
  if (!payload || payload.ok !== true) return null;
  const session = mapActivityRecentRound(payload.session);
  if (!session) return null;
  const events = mapActivitySessionEvents(payload.events);

  return {
    generatedAt: toIsoStringOrNull(payload.generatedAt),
    session: {
      ...session,
      eventCounts: {
        ...session.eventCounts,
        vehicles: events.vehicles.length
      }
    },
    events
  };
}

function mapServer(
  server: ExporterSnapshotServerResponse,
  sourceUrl: string,
  joinLinkUrl: string
): ExporterServerSnapshot {
  return {
    id: Number(server.id) || 0,
    code: server.code || `server-${Number(server.id) || 0}`,
    name: server.name || server.code || sourceUrl,
    playerCount: Number(server.playerCount) || 0,
    maxPlayers: Number(server.maxPlayers) || 0,
    queueLength: Number(server.queueLength) || 0,
    currentLayer: server.currentLayer,
    gameMode: server.gameMode,
    isSeedCandidate: server.isSeedCandidate !== false,
    online: Boolean(server.online),
    teams: Array.isArray(server.teams) ? server.teams.map(mapTeam) : [],
    players: Array.isArray(server.players) ? server.players.map(mapPlayer) : [],
    raffles: mapRaffleSnapshot(server.raffles),
    teamBalancer: mapTeamBalancerSnapshot(server.teamBalancer),
    activity: mapActivitySnapshot(server.activity),
    updatedAt: Number(server.updatedAt) || Date.now(),
    sourceUrl,
    joinLinkUrl,
    activitySessionBaseUrl: sourceUrl.replace(/\/snapshot$/, '/activity/sessions')
  };
}

function sortServers(servers: ExporterServerSnapshot[]): ExporterServerSnapshot[] {
  return servers.slice().sort((left, right) => {
    if (left.id !== right.id) return left.id - right.id;
    return left.name.localeCompare(right.name, 'ru');
  });
}

function createExporterSnapshotState(
  exporterConfig: ExporterEndpointConfig
): ExporterSnapshotState {
  const baseUrl = normalizeBaseUrl(exporterConfig.baseUrl);

  return {
    name: exporterConfig.name,
    snapshotUrl: `${baseUrl}/snapshot`,
    joinLinkUrl: `${baseUrl}/join-link`,
    eventsUrl: `${baseUrl}/events`,
    initialized: false,
    servers: [],
    timestamp: 0,
    generatedAt: '',
    error: null
  };
}

function buildCombinedSnapshot(states: ExporterSnapshotState[]): CombinedSnapshot {
  const timestamps = states
    .map((state) => Number(state.timestamp) || 0)
    .filter((value) => value > 0);
  const latestState = states
    .filter((state) => state.timestamp > 0)
    .sort((left, right) => (Number(right.timestamp) || 0) - (Number(left.timestamp) || 0))[0];

  return {
    timestamp: timestamps.length ? Math.max(...timestamps) : Date.now(),
    generatedAt: latestState?.generatedAt || new Date().toISOString(),
    servers: sortServers(states.flatMap((state) => state.servers)),
    errors: states
      .map((state) => state.error)
      .filter((value): value is string => Boolean(value))
  };
}

function applySnapshotPayload(
  state: ExporterSnapshotState,
  payload: ExporterSnapshotResponse
): void {
  state.initialized = true;
  state.error = null;
  state.timestamp = Number(payload.timestamp) || Date.now();
  state.generatedAt = payload.generatedAt || new Date(state.timestamp).toISOString();
  state.servers = Array.isArray(payload.servers)
    ? payload.servers.map((server) => mapServer(server, state.snapshotUrl, state.joinLinkUrl))
    : [];
}

function applySnapshotError(state: ExporterSnapshotState, message: string): void {
  state.initialized = true;
  state.error = `${state.name}: ${message}`;

  if (state.timestamp > 0) {
    return;
  }

  state.servers = [];
  state.timestamp = 0;
  state.generatedAt = '';
}

function clearTimer(timerId: number | null): null {
  if (timerId !== null) {
    window.clearTimeout(timerId);
  }

  return null;
}

function getReconnectDelay(attempt: number): number {
  return Math.min(
    STREAM_RECONNECT_BASE_DELAY_MS * 2 ** attempt,
    STREAM_RECONNECT_MAX_DELAY_MS
  );
}

async function buildHttpError(response: Response): Promise<string> {
  const statusText = `HTTP ${response.status}`;
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const payload = (await response.clone().json()) as {
        error?: string;
        message?: string;
      };
      const detail = payload.error || payload.message;
      if (detail) {
        return `${statusText}: ${detail}`;
      }
    } catch {
      // Ignore invalid JSON error bodies and fall back to text/status.
    }
  }

  try {
    const text = (await response.text()).trim();
    if (text) {
      return `${statusText}: ${text}`;
    }
  } catch {
    // Ignore unreadable error bodies and fall back to status only.
  }

  return statusText;
}

async function fetchSnapshotPayload(snapshotUrl: string): Promise<ExporterSnapshotResponse> {
  const response = await fetch(snapshotUrl, {
    headers: SNAPSHOT_HEADERS,
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await buildHttpError(response));
  }

  return (await response.json()) as ExporterSnapshotResponse;
}

export async function fetchServerJoinLink(joinLinkUrl: string): Promise<string> {
  const response = await fetch(joinLinkUrl, {
    headers: SNAPSHOT_HEADERS,
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await buildHttpError(response));
  }

  const payload = (await response.json()) as ExporterJoinLinkResponse;
  const joinLink = typeof payload.joinLink === 'string' ? payload.joinLink.trim() : '';
  if (!joinLink) {
    throw new Error('Join link response is missing joinLink.');
  }

  return joinLink;
}

export async function fetchActivitySession(
  server: ExporterServerSnapshot,
  sessionId: string
): Promise<ExporterActivitySessionResponse> {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) throw new Error('Session id is required.');

  const response = await fetch(
    `${server.activitySessionBaseUrl}/${encodeURIComponent(normalizedSessionId)}`,
    {
      headers: SNAPSHOT_HEADERS,
      cache: 'no-store'
    }
  );
  if (!response.ok) throw new Error(await buildHttpError(response));

  const payload = mapActivitySessionResponse(await response.json());
  if (!payload) throw new Error('Session response is invalid.');
  return payload;
}

export async function fetchCombinedSnapshot(
  exporters: ExporterEndpointConfig[]
): Promise<CombinedSnapshot> {
  const states = exporters.map(createExporterSnapshotState);

  await Promise.all(
    states.map(async (state) => {
      try {
        const payload = await fetchSnapshotPayload(state.snapshotUrl);
        applySnapshotPayload(state, payload);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown exporter error';
        applySnapshotError(state, message);
      }
    })
  );

  return buildCombinedSnapshot(states);
}

export function subscribeCombinedSnapshot(
  exporters: ExporterEndpointConfig[],
  onSnapshot: (snapshot: CombinedSnapshot) => void
): () => void {
  const subscriptions: ExporterStreamSubscription[] = exporters.map((exporterConfig) => ({
    state: createExporterSnapshotState(exporterConfig),
    eventSource: null,
    pollTimerId: null,
    reconnectTimerId: null,
    reconnectAttempt: 0
  }));
  const states = subscriptions.map((subscription) => subscription.state);
  let closed = false;

  const emitSnapshot = () => {
    if (closed || !states.every((state) => state.initialized)) return;
    onSnapshot(buildCombinedSnapshot(states));
  };

  const stopPolling = (subscription: ExporterStreamSubscription) => {
    subscription.pollTimerId = clearTimer(subscription.pollTimerId);
  };

  const stopReconnect = (subscription: ExporterStreamSubscription) => {
    subscription.reconnectTimerId = clearTimer(subscription.reconnectTimerId);
  };

  const stopEventSource = (subscription: ExporterStreamSubscription) => {
    if (!subscription.eventSource) return;
    subscription.eventSource.close();
    subscription.eventSource = null;
  };

  const schedulePolling = (subscription: ExporterStreamSubscription, delayMs = 0) => {
    if (closed || subscription.eventSource || subscription.pollTimerId !== null) return;

    subscription.pollTimerId = window.setTimeout(() => {
      subscription.pollTimerId = null;
      void (async () => {
        try {
          const payload = await fetchSnapshotPayload(subscription.state.snapshotUrl);
          applySnapshotPayload(subscription.state, payload);
          emitSnapshot();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown exporter error';
          applySnapshotError(subscription.state, message);
          emitSnapshot();
        } finally {
          if (!closed && subscription.eventSource === null) {
            schedulePolling(subscription, SNAPSHOT_POLL_INTERVAL_MS);
          }
        }
      })();
    }, delayMs);
  };

  const openEventSource = (subscription: ExporterStreamSubscription) => {
    if (closed || subscription.eventSource) return;

    const eventSource = new EventSource(subscription.state.eventsUrl);
    subscription.eventSource = eventSource;

    eventSource.onopen = () => {
      stopPolling(subscription);
    };

    eventSource.addEventListener('snapshot', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as ExporterSnapshotResponse;
        applySnapshotPayload(subscription.state, payload);
        subscription.reconnectAttempt = 0;
        stopReconnect(subscription);
        stopPolling(subscription);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid snapshot event payload';
        stopEventSource(subscription);
        applySnapshotError(subscription.state, message);
        emitSnapshot();
        schedulePolling(subscription);

        if (subscription.reconnectTimerId === null) {
          const reconnectDelayMs = getReconnectDelay(subscription.reconnectAttempt);
          subscription.reconnectAttempt += 1;
          subscription.reconnectTimerId = window.setTimeout(() => {
            subscription.reconnectTimerId = null;
            if (closed) return;
            openEventSource(subscription);
          }, reconnectDelayMs);
        }

        return;
      }

      emitSnapshot();
    });

    eventSource.onerror = () => {
      if (closed) return;

      stopEventSource(subscription);
      applySnapshotError(subscription.state, 'event stream unavailable');
      emitSnapshot();

      schedulePolling(subscription);

      if (subscription.reconnectTimerId !== null) return;

      const reconnectDelayMs = getReconnectDelay(subscription.reconnectAttempt);
      subscription.reconnectAttempt += 1;
      subscription.reconnectTimerId = window.setTimeout(() => {
        subscription.reconnectTimerId = null;
        if (closed) return;
        openEventSource(subscription);
      }, reconnectDelayMs);
    };
  };

  subscriptions.forEach((subscription) => openEventSource(subscription));

  return () => {
    closed = true;
    subscriptions.forEach((subscription) => {
      stopEventSource(subscription);
      stopPolling(subscription);
      stopReconnect(subscription);
    });
  };
}
