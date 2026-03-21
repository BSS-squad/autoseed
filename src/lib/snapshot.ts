import type {
  CombinedSnapshot,
  ExporterEndpointConfig,
  ExporterServerSnapshot,
  ExporterSnapshotResponse
} from '../types';

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function mapServer(server: Partial<ExporterServerSnapshot>, sourceUrl: string): ExporterServerSnapshot {
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

export async function fetchCombinedSnapshot(
  exporters: ExporterEndpointConfig[]
): Promise<CombinedSnapshot> {
  const results = await Promise.all(
    exporters.map(async (exporterConfig) => {
      const sourceUrl = `${normalizeBaseUrl(exporterConfig.baseUrl)}/snapshot`;

      try {
        const response = await fetch(sourceUrl, {
          headers: {
            Accept: 'application/json'
          },
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = (await response.json()) as ExporterSnapshotResponse;
        const servers = Array.isArray(payload.servers)
          ? payload.servers.map((server) => mapServer(server, sourceUrl))
          : [];

        return {
          ok: true as const,
          servers,
          timestamp: Number(payload.timestamp) || Date.now(),
          error: null
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown exporter error';
        return {
          ok: false as const,
          servers: [] as ExporterServerSnapshot[],
          timestamp: Date.now(),
          error: `${exporterConfig.name}: ${message}`
        };
      }
    })
  );

  return {
    timestamp: Math.max(...results.map((result) => result.timestamp), Date.now()),
    generatedAt: new Date().toISOString(),
    servers: sortServers(results.flatMap((result) => result.servers)),
    errors: results
      .map((result) => result.error)
      .filter((value): value is string => Boolean(value))
  };
}
