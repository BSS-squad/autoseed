import type {
  CombinedSnapshot,
  ExporterEndpointConfig,
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
  ExporterTeamBalancerExecutionSnapshot,
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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNonNegativeIntegerOrNull(value: unknown): number | null {
  const parsed = toFiniteNumberOrNull(value);
  if (parsed === null || parsed < 0) return null;
  return Math.round(parsed);
}

function toIsoStringOrNull(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
    execution: mapTeamBalancerExecution(snapshot.execution)
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
    updatedAt: Number(server.updatedAt) || Date.now(),
    sourceUrl,
    joinLinkUrl
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
