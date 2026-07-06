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
  ExporterSnapshotPlayerResponse,
  ExporterSnapshotResponse,
  ExporterSnapshotServerResponse,
  ExporterSnapshotSquadResponse,
  ExporterSnapshotTeamResponse,
  ExporterSquadSnapshot,
  ExporterTeamBalancerCohortSnapshot,
  ExporterTeamBalancerPlayerSnapshot,
  ExporterTeamBalancerSignalsSnapshot,
  ExporterTeamBalancerSnapshot,
  ExporterTeamSnapshot
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

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFiniteNumberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
    winStreak: signals.winStreak ?? null,
    ticketDiff: signals.ticketDiff ?? null,
    recentRoundSeverity: signals.recentRoundSeverity ?? null
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
    squadID:
      typeof cohort.squadID === 'number' || typeof cohort.squadID === 'string'
        ? cohort.squadID
        : null,
    playerCount: Math.max(0, Math.round(toNumber(cohort.playerCount))),
    status: toStringOrNull(cohort.status) || 'noop',
    confidence: toFiniteNumberOrNull(cohort.confidence),
    score: toFiniteNumberOrNull(cohort.score)
  };
}

function mapTeamBalancerPlayer(value: unknown): ExporterTeamBalancerPlayerSnapshot | null {
  const player = getRecord(value);
  if (!player) return null;

  return {
    name: toStringOrNull(player.name) || 'Игрок',
    fromTeamID: toStringOrNull(player.fromTeamID),
    toTeamID: toStringOrNull(player.toTeamID),
    squadID:
      typeof player.squadID === 'number' || typeof player.squadID === 'string'
        ? player.squadID
        : null,
    status: toStringOrNull(player.status) || 'noop',
    confidence: toFiniteNumberOrNull(player.confidence),
    score: toFiniteNumberOrNull(player.score)
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

  return {
    version: Math.max(1, Math.round(toNumber(snapshot.version, 1))),
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
    players
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
