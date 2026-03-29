import type {
  CombinedSnapshot,
  ExporterEndpointConfig,
  ExporterPlayerSnapshot,
  ExporterServerSnapshot,
  ExporterSnapshotPlayerResponse,
  ExporterSnapshotResponse,
  ExporterSnapshotServerResponse,
  ExporterSnapshotSquadResponse,
  ExporterSnapshotTeamResponse,
  ExporterSquadSnapshot,
  ExporterTeamSnapshot
} from '../types';

type ExporterSnapshotState = {
  name: string;
  snapshotUrl: string;
  eventsUrl: string;
  initialized: boolean;
  servers: ExporterServerSnapshot[];
  timestamp: number;
  generatedAt: string;
  error: string | null;
};

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function mapPlayer(player: ExporterSnapshotPlayerResponse): ExporterPlayerSnapshot {
  return {
    eosId: player.eosId || null,
    steamId: player.steamId || null,
    name: player.name || 'Unknown',
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
    name: squad.name || `Squad ${Number(squad.id) || 0}`,
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
    name: team.name || `Team ${Number(team.id) || 0}`,
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

function mapServer(server: ExporterSnapshotServerResponse, sourceUrl: string): ExporterServerSnapshot {
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
    joinLink: server.joinLink,
    teams: Array.isArray(server.teams) ? server.teams.map(mapTeam) : [],
    players: Array.isArray(server.players) ? server.players.map(mapPlayer) : [],
    updatedAt: Number(server.updatedAt) || Date.now(),
    sourceUrl
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
    ? payload.servers.map((server) => mapServer(server, state.snapshotUrl))
    : [];
}

function applySnapshotError(state: ExporterSnapshotState, message: string): void {
  state.initialized = true;
  state.servers = [];
  state.timestamp = 0;
  state.generatedAt = '';
  state.error = `${state.name}: ${message}`;
}

export async function fetchCombinedSnapshot(
  exporters: ExporterEndpointConfig[]
): Promise<CombinedSnapshot> {
  const states = exporters.map(createExporterSnapshotState);

  await Promise.all(
    states.map(async (state) => {
      try {
        const response = await fetch(state.snapshotUrl, {
          headers: {
            Accept: 'application/json'
          },
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = (await response.json()) as ExporterSnapshotResponse;
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
  const states = exporters.map(createExporterSnapshotState);
  const eventSources: EventSource[] = [];
  let closed = false;

  const emitSnapshot = () => {
    if (closed || !states.every((state) => state.initialized)) return;
    onSnapshot(buildCombinedSnapshot(states));
  };

  for (const state of states) {
    const eventSource = new EventSource(state.eventsUrl);

    eventSource.addEventListener('snapshot', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as ExporterSnapshotResponse;
        applySnapshotPayload(state, payload);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid snapshot event payload';
        applySnapshotError(state, message);
      }

      emitSnapshot();
    });

    eventSource.onerror = () => {
      const nextError = `${state.name}: event stream unavailable`;
      if (state.error === nextError && state.initialized) return;
      applySnapshotError(state, 'event stream unavailable');
      emitSnapshot();
    };

    eventSources.push(eventSource);
  }

  return () => {
    closed = true;
    eventSources.forEach((eventSource) => eventSource.close());
  };
}
