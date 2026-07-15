import type {
  CombinedSnapshot,
  ExporterServerSnapshot,
  SeedPolicy,
  SelectionState
} from '../types';

export const DEFAULT_SEED_POLICY: SeedPolicy = {
  maxSeedPlayers: 80,
  priorityOrder: [1, 2, 3],
  cooldownMs: 10 * 60 * 1000,
  periodicReconnectMs: 10 * 60 * 1000
};

function isSuitableSeedCandidate(server: ExporterServerSnapshot): boolean {
  return server.online && server.isSeedCandidate;
}

export function resolveSeedPolicy(fallbackPolicy?: Partial<SeedPolicy> | null): SeedPolicy {
  return {
    ...DEFAULT_SEED_POLICY,
    ...(fallbackPolicy || {}),
    priorityOrder: fallbackPolicy?.priorityOrder || DEFAULT_SEED_POLICY.priorityOrder
  };
}

export function determineTargetServer(
  snapshot: CombinedSnapshot,
  policy: SeedPolicy
): ExporterServerSnapshot | null {
  const candidates = snapshot.servers
    .filter((server) => isSuitableSeedCandidate(server))
    .filter((server) => server.playerCount < policy.maxSeedPlayers);

  if (!candidates.length) return null;

  const priorityCandidate = policy.priorityOrder
    .map((serverId) => candidates.find((server) => server.id === serverId) || null)
    .find(Boolean) as ExporterServerSnapshot | undefined;

  const strongest = candidates
    .slice()
    .sort((left, right) => right.playerCount - left.playerCount)[0];

  if (!priorityCandidate) {
    return strongest || null;
  }

  return priorityCandidate;
}

export function buildSelectionState(
  snapshot: CombinedSnapshot,
  policy: SeedPolicy
): SelectionState {
  const targetServer = determineTargetServer(snapshot, policy);
  if (!targetServer) {
    return {
      targetServer: null,
      reason: 'no_suitable_server'
    };
  }

  return {
    targetServer,
    reason: 'target_found'
  };
}

export function getSelectionStatusLabel(selection: SelectionState | null): string {
  if (!selection) return 'Ожидание обновления данных';
  return selection.reason === 'target_found'
    ? 'Подходящий сервер для рассида найден'
    : 'Подходящий сервер для рассида не найден';
}
