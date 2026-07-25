import type {
  CombinedSnapshot,
  ExporterServerSnapshot,
  SeedPolicy,
  SelectionState
} from '../types';

export const DEFAULT_SEED_POLICY: SeedPolicy = {
  timezone: 'Europe/Moscow',
  nightWindowStart: '00:00',
  nightWindowEnd: '08:00',
  nightPriorityOrder: [3, 2, 1],
  maxSeedPlayers: 80,
  priorityOrder: [1, 2, 3],
  cooldownMs: 10 * 60 * 1000,
  periodicReconnectMs: 10 * 60 * 1000
};

function getMinutesInTimezone(timezone: string, date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0');
  return hour * 60 + minute;
}

function parseTime(value: string): number {
  const [hour, minute] = value.split(':').map((part) => Number(part));
  return hour * 60 + minute;
}

export function isNightWindow(policy: SeedPolicy, date = new Date()): boolean {
  const current = getMinutesInTimezone(policy.timezone, date);
  const start = parseTime(policy.nightWindowStart);
  const end = parseTime(policy.nightWindowEnd);

  if (start <= end) {
    return current >= start && current < end;
  }

  return current >= start || current < end;
}

function isSuitableSeedCandidate(server: ExporterServerSnapshot): boolean {
  return server.online && server.isSeedCandidate;
}

export function resolveSeedPolicy(fallbackPolicy?: Partial<SeedPolicy> | null): SeedPolicy {
  const hasCurrentPrioritySchedule = Array.isArray(fallbackPolicy?.nightPriorityOrder);

  return {
    ...DEFAULT_SEED_POLICY,
    ...(fallbackPolicy || {}),
    // До перехода на полный ночной порядок конфиг содержал один nightPreferredServerId.
    // Если нового поля нет, весь старый график игнорируется и применяется актуальная
    // политика BSS. Это не даёт старому боевому секрету вернуть окно с 23:00.
    timezone: hasCurrentPrioritySchedule
      ? fallbackPolicy?.timezone || DEFAULT_SEED_POLICY.timezone
      : DEFAULT_SEED_POLICY.timezone,
    nightWindowStart: hasCurrentPrioritySchedule
      ? fallbackPolicy?.nightWindowStart || DEFAULT_SEED_POLICY.nightWindowStart
      : DEFAULT_SEED_POLICY.nightWindowStart,
    nightWindowEnd: hasCurrentPrioritySchedule
      ? fallbackPolicy?.nightWindowEnd || DEFAULT_SEED_POLICY.nightWindowEnd
      : DEFAULT_SEED_POLICY.nightWindowEnd,
    nightPriorityOrder: hasCurrentPrioritySchedule
      ? fallbackPolicy?.nightPriorityOrder || DEFAULT_SEED_POLICY.nightPriorityOrder
      : DEFAULT_SEED_POLICY.nightPriorityOrder,
    priorityOrder: hasCurrentPrioritySchedule
      ? fallbackPolicy?.priorityOrder || DEFAULT_SEED_POLICY.priorityOrder
      : DEFAULT_SEED_POLICY.priorityOrder
  };
}

export function determineTargetServer(
  snapshot: CombinedSnapshot,
  policy: SeedPolicy,
  date = new Date()
): ExporterServerSnapshot | null {
  const candidates = snapshot.servers
    .filter((server) => isSuitableSeedCandidate(server))
    .filter((server) => server.playerCount < policy.maxSeedPlayers);

  if (!candidates.length) return null;

  const priorityOrder = isNightWindow(policy, date)
    ? policy.nightPriorityOrder
    : policy.priorityOrder;
  const priorityCandidate = priorityOrder
    .map((serverId) => candidates.find((server) => server.id === serverId) || null)
    .find(Boolean) as ExporterServerSnapshot | undefined;

  if (priorityCandidate) return priorityCandidate;

  return (
    candidates
      .slice()
      .sort((left, right) => right.playerCount - left.playerCount)[0] || null
  );
}

export function buildSelectionState(
  snapshot: CombinedSnapshot,
  policy: SeedPolicy,
  date = new Date()
): SelectionState {
  const targetServer = determineTargetServer(snapshot, policy, date);
  if (!targetServer) {
    return {
      targetServer: null,
      reason: 'no_suitable_server',
      nightMode: isNightWindow(policy, date)
    };
  }

  return {
    targetServer,
    reason: 'target_found',
    nightMode: isNightWindow(policy, date)
  };
}

export function getSelectionStatusLabel(selection: SelectionState | null): string {
  if (!selection) return 'Ожидание обновления данных';
  return selection.reason === 'target_found'
    ? 'Подходящий сервер для рассида найден'
    : 'Подходящий сервер для рассида не найден';
}
