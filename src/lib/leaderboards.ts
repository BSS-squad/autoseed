import type {
  LeaderboardEntry,
  LeaderboardPeriod,
  LeaderboardResponse,
  LeaderboardsEndpointConfig,
  RoleLeaderboardAchievement,
  RoleLeaderboardEntry,
  RoleLeaderboardMethodology,
  RoleLeaderboardMethodologyAchievement,
  RoleLeaderboardMethodologyFormula,
  RoleLeaderboardMethodologyMetric,
  RoleLeaderboardMetricGroup,
  RoleLeaderboardPendingEntry,
  RoleLeaderboardPeriod,
  RoleLeaderboardResponse,
  RoleLeaderboardRole,
  RoleLeaderboardSelection,
  RoleLeaderboardSquadSize,
  RoleLeaderboardStatus
} from '../types';

export const LEADERBOARD_PERIODS: Array<{
  value: LeaderboardPeriod;
  label: string;
  description: string;
}> = [
  { value: 'overall', label: 'Общий', description: 'за всё время' },
  { value: 'week', label: 'Неделя', description: 'последние 7 дней' },
  { value: 'month', label: 'Месяц', description: 'последние 30 дней' }
];

const LEADERBOARD_HEADERS = {
  Accept: 'application/json'
} as const;

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toNumberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRank(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function normalizeLeaderboardEntry(value: unknown, index: number): LeaderboardEntry {
  const entry = getRecord(value) || {};

  return {
    rank: normalizeRank(entry.rank ?? entry.position ?? entry.place, index + 1),
    name:
      toStringOrNull(entry.name) ||
      toStringOrNull(entry.playerName) ||
      toStringOrNull(entry.nickname) ||
      'Игрок',
    score: toNumberOrNull(entry.score ?? entry.points),
    kills: toNumberOrNull(entry.kills),
    deaths: toNumberOrNull(entry.deaths),
    kd: toNumberOrNull(entry.kd ?? entry.kdr),
    playtimeHours: toNumberOrNull(entry.playtimeHours ?? entry.hours)
  };
}

function getPayloadEntries(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;

  const record = getRecord(payload);
  if (!record) return [];

  if (Array.isArray(record.entries)) return record.entries;
  if (Array.isArray(record.players)) return record.players;
  if (Array.isArray(record.items)) return record.items;

  return [];
}

function sortLeaderboardEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return entries.slice().sort((left, right) => {
    if (left.rank !== right.rank) return left.rank - right.rank;
    return (right.score || 0) - (left.score || 0);
  });
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
      if (detail) return `${statusText}: ${detail}`;
    } catch {
      // Fall back to text/status below.
    }
  }

  return statusText;
}

function buildLeaderboardUrl(baseUrl: string, period: LeaderboardPeriod): string {
  const url = new URL(baseUrl, window.location.href);
  url.searchParams.set('period', period);
  return url.toString();
}

export async function fetchLeaderboard(
  baseUrl: string,
  period: LeaderboardPeriod
): Promise<LeaderboardResponse> {
  const response = await fetch(buildLeaderboardUrl(baseUrl, period), {
    headers: LEADERBOARD_HEADERS,
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await buildHttpError(response));
  }

  const payload = await response.json();
  const record = getRecord(payload);
  const entries = sortLeaderboardEntries(
    getPayloadEntries(payload).map(normalizeLeaderboardEntry)
  );

  return {
    period,
    generatedAt: toStringOrNull(record?.generatedAt) || null,
    entries
  };
}

export const ROLE_LEADERBOARD_PERIODS: Array<{
  value: RoleLeaderboardPeriod;
  label: string;
  description: string;
}> = [
  { value: 'day', label: 'День', description: 'от 2 матчей' },
  { value: 'week', label: 'Неделя', description: 'от 9 матчей' },
  { value: 'month', label: 'Месяц', description: 'от 50 матчей' }
];

export const ROLE_LEADERBOARD_ROLES: Array<{
  value: RoleLeaderboardRole;
  label: string;
}> = [
  { value: 'player', label: 'Игроки' },
  { value: 'squad_leader', label: 'Сквадные' },
  { value: 'commander', label: 'Командиры' }
];

export const ROLE_LEADERBOARD_SQUAD_SIZES: Array<{
  value: RoleLeaderboardSquadSize;
  label: string;
  description: string;
}> = [
  { value: 'small', label: 'Малый', description: '1–3' },
  { value: 'medium', label: 'Средний', description: '4–6' },
  { value: 'full', label: 'Полный', description: '7–9' }
];

const ROLE_PERIOD_VALUES = new Set(ROLE_LEADERBOARD_PERIODS.map(({ value }) => value));
const ROLE_VALUES = new Set(ROLE_LEADERBOARD_ROLES.map(({ value }) => value));
const SQUAD_SIZE_VALUES = new Set(ROLE_LEADERBOARD_SQUAD_SIZES.map(({ value }) => value));
const ROLE_STATUS_VALUES = new Set<RoleLeaderboardStatus>(['ok', 'partial', 'empty']);

const METRIC_FIELDS = new Set([
  'resourceSwingPer90',
  'resourceSwing',
  'temporaryPressurePer90',
  'combatConversion',
  'kd',
  'knockdownsPer100PersonHours',
  'revivesPer100PersonHours',
  'winRate',
  'averageSurprise',
  'averageHoursGap',
  'confirmedEnemyDeaths',
  'successfulRevives',
  'ownDeaths',
  'teamkills',
  'knockdowns',
  'temporaryPressure',
  'vehicleDamage',
  'vehicleKills',
  'wins',
  'losses',
  'strengthMatches',
  'underdogMatches',
  'underdogWins',
  'averageTeamKd',
  'averageDeaths',
  'averageWinningTicketMargin',
  'combinations',
  'squadHoursMatches',
  'vehicleDamageAvailable',
  'vehicleKillsAvailable',
  'hoursCoverageSufficient',
  'events',
  'attributedEvents',
  'eventCoverage',
  'destructions',
  'attributedDestructions',
  'destructionCoverage',
  'damageAvailable',
  'killsAvailable'
]);

const DEFAULT_ROLE_SELECTION: RoleLeaderboardSelection = {
  period: 'day',
  role: 'player',
  squadSize: 'full',
  periodId: null
};

function isMetricValue(value: unknown): value is number | boolean | null {
  return (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function normalizeMetricGroup(value: unknown): RoleLeaderboardMetricGroup {
  const record = getRecord(value);
  if (!record) return {};

  const result: RoleLeaderboardMetricGroup = {};
  for (const [key, metricValue] of Object.entries(record)) {
    if (METRIC_FIELDS.has(key) && isMetricValue(metricValue)) {
      result[key] = metricValue;
    }
  }
  return result;
}

function normalizeAchievement(value: unknown): RoleLeaderboardAchievement | null {
  const record = getRecord(value);
  const code = toStringOrNull(record?.code);
  const title = toStringOrNull(record?.title);
  const description = toStringOrNull(record?.description);
  const reason = toStringOrNull(record?.reason);
  if (!code || !title || !description || !reason) return null;
  const comparisonValue = toStringOrNull(record?.comparison);
  const comparison = ['gte', 'lte', 'lt', 'gt', 'eq'].includes(comparisonValue || '')
    ? (comparisonValue as RoleLeaderboardAchievement['comparison'])
    : 'gte';

  return {
    code,
    title,
    description,
    reason,
    value: toNumberOrNull(record?.value),
    threshold: toNumberOrNull(record?.threshold),
    comparison
  };
}

function normalizeRoleEntry(value: unknown, index: number): RoleLeaderboardEntry {
  const entry = getRecord(value) || {};
  return {
    rank: normalizeRank(entry.rank, index + 1),
    qualified: entry.qualified !== false,
    matchesNeeded: Math.max(
      0,
      Math.round(toNumberOrNull(entry.matchesNeeded) || 0)
    ),
    name: (toStringOrNull(entry.name) || 'Игрок').slice(0, 96),
    matches: Math.max(0, Math.round(toNumberOrNull(entry.matches) || 0)),
    activeMinutes: toNumberOrNull(entry.activeMinutes),
    personHours: toNumberOrNull(entry.personHours),
    indicators: normalizeMetricGroup(entry.indicators),
    totals: normalizeMetricGroup(entry.totals),
    style: normalizeMetricGroup(entry.style),
    dataQuality: normalizeMetricGroup(entry.dataQuality),
    achievements: (Array.isArray(entry.achievements) ? entry.achievements : [])
      .map(normalizeAchievement)
      .filter((achievement): achievement is RoleLeaderboardAchievement => achievement !== null)
      .slice(0, 3)
  };
}

function normalizePendingRoleEntry(
  value: unknown,
  index: number
): RoleLeaderboardPendingEntry {
  const normalized = normalizeRoleEntry(value, index);
  const entry = getRecord(value) || {};
  return {
    ...normalized,
    rank: null,
    qualified: false,
    matchesNeeded: Math.max(
      0,
      Math.round(toNumberOrNull(entry.matchesNeeded) || 0)
    )
  };
}

function toRatioOrNull(value: unknown): number | null {
  const parsed = toNumberOrNull(value);
  return parsed === null ? null : Math.max(0, Math.min(1, parsed));
}

function normalizePublicText(value: unknown, maximumLength = 600): string | null {
  const text = toStringOrNull(value);
  return text ? text.slice(0, maximumLength) : null;
}

function normalizePublicTextList(
  value: unknown,
  maximumItems: number
): string[] {
  return (Array.isArray(value) ? value : [])
    .map((item) => normalizePublicText(item))
    .filter((item): item is string => item !== null)
    .slice(0, maximumItems);
}

function normalizeMethodologyMetric(
  value: unknown
): RoleLeaderboardMethodologyMetric | null {
  const record = getRecord(value);
  const key = normalizePublicText(record?.key, 64);
  const label = normalizePublicText(record?.label, 120);
  const description = normalizePublicText(record?.description);
  return key && label && description ? { key, label, description } : null;
}

function normalizeMethodologyFormula(
  value: unknown
): RoleLeaderboardMethodologyFormula | null {
  const record = getRecord(value);
  const label = normalizePublicText(record?.label, 120);
  const expression = normalizePublicText(record?.expression, 300);
  const description = normalizePublicText(record?.description);
  return label && expression && description
    ? { label, expression, description }
    : null;
}

function normalizeMethodologyAchievement(
  value: unknown
): RoleLeaderboardMethodologyAchievement | null {
  const record = getRecord(value);
  const code = normalizePublicText(record?.code, 64);
  const title = normalizePublicText(record?.title, 120);
  const description = normalizePublicText(record?.description);
  const criteria = normalizePublicText(record?.criteria);
  return code && title && description && criteria
    ? { code, title, description, criteria }
    : null;
}

function normalizeRoleMethodology(
  value: unknown,
  expectedRole: RoleLeaderboardRole,
  fallbackRulesVersion: string
): RoleLeaderboardMethodology | null {
  const record = getRecord(value);
  if (!record || record.role !== expectedRole) return null;
  const roleTitle = normalizePublicText(record.roleTitle, 120);
  const summary = normalizePublicText(record.summary);
  if (!roleTitle || !summary) return null;

  return {
    rulesVersion:
      normalizePublicText(record.rulesVersion, 80) || fallbackRulesVersion,
    role: expectedRole,
    roleTitle,
    summary,
    participation: normalizePublicTextList(record.participation, 6),
    achievementRules: normalizePublicTextList(record.achievementRules, 8),
    limitations: normalizePublicTextList(record.limitations, 8),
    ranking: (Array.isArray(record.ranking) ? record.ranking : [])
      .map(normalizeMethodologyMetric)
      .filter((item): item is RoleLeaderboardMethodologyMetric => item !== null)
      .slice(0, 8),
    formulas: (Array.isArray(record.formulas) ? record.formulas : [])
      .map(normalizeMethodologyFormula)
      .filter((item): item is RoleLeaderboardMethodologyFormula => item !== null)
      .slice(0, 6),
    achievements: (
      Array.isArray(record.achievements) ? record.achievements : []
    )
      .map(normalizeMethodologyAchievement)
      .filter(
        (item): item is RoleLeaderboardMethodologyAchievement => item !== null
      )
      .slice(0, 32)
  };
}

function normalizeRoleResponse(
  payload: unknown,
  selection: RoleLeaderboardSelection
): RoleLeaderboardResponse {
  const record = getRecord(payload) || {};
  const dataQuality = getRecord(record.dataQuality) || {};
  const progress = getRecord(record.progress) || {};
  const ranking = getRecord(record.ranking) || {};
  const achievements = getRecord(record.achievements) || {};
  const statusValue = toStringOrNull(record.status) as RoleLeaderboardStatus | null;
  const roleValue = toStringOrNull(record.role) as RoleLeaderboardRole | null;
  const squadSizeValue = toStringOrNull(record.squadSize) as RoleLeaderboardSquadSize | null;
  const periodValue = toStringOrNull(record.period) as RoleLeaderboardPeriod | null;
  const role =
    roleValue && ROLE_VALUES.has(roleValue) ? roleValue : selection.role;
  const rulesVersion = toStringOrNull(record.rulesVersion) || 'unknown';

  return {
    status: statusValue && ROLE_STATUS_VALUES.has(statusValue) ? statusValue : 'empty',
    available: record.available === true,
    stale: record.stale === true,
    rulesVersion,
    revision: toStringOrNull(record.revision),
    scope: record.scope === 'custom' ? 'custom' : 'public',
    period:
      periodValue && ROLE_PERIOD_VALUES.has(periodValue) ? periodValue : selection.period,
    periodId: toStringOrNull(record.periodId) || selection.periodId || '',
    role,
    squadSize:
      squadSizeValue && SQUAD_SIZE_VALUES.has(squadSizeValue) ? squadSizeValue : null,
    timeZone: toStringOrNull(record.timeZone) || 'Europe/Moscow',
    startAt: toStringOrNull(record.startAt) || '',
    endAt: toStringOrNull(record.endAt) || '',
    minimumMatches: Math.max(
      0,
      Math.round(toNumberOrNull(record.minimumMatches) || 0)
    ),
    generatedAt: toStringOrNull(record.generatedAt),
    dataThrough: toStringOrNull(record.dataThrough),
    dataQuality: {
      sourceMatches: Math.max(
        0,
        Math.round(toNumberOrNull(dataQuality.sourceMatches) || 0)
      ),
      factsCoverage: toRatioOrNull(dataQuality.factsCoverage),
      hoursCoverage: toRatioOrNull(dataQuality.hoursCoverage),
      hoursCoverageThreshold: toRatioOrNull(dataQuality.hoursCoverageThreshold),
      achievementHistoryMatches: Math.max(
        0,
        Math.round(toNumberOrNull(dataQuality.achievementHistoryMatches) || 0)
      ),
      vehicleAttribution: normalizeMetricGroup(dataQuality.vehicleAttribution)
    },
    progress: {
      candidates: Math.max(0, Math.round(toNumberOrNull(progress.candidates) || 0)),
      qualified: Math.max(0, Math.round(toNumberOrNull(progress.qualified) || 0)),
      minimumMatches: Math.max(
        0,
        Math.round(toNumberOrNull(progress.minimumMatches) || 0)
      )
    },
    ranking: {
      sortKeys: Array.isArray(ranking.sortKeys)
        ? ranking.sortKeys
            .map(toStringOrNull)
            .filter((key): key is string => key !== null)
            .slice(0, 8)
        : []
    },
    methodology: normalizeRoleMethodology(
      record.methodology,
      role,
      rulesVersion
    ),
    achievements: {
      comparisonGroupSize: Math.max(
        0,
        Math.round(toNumberOrNull(achievements.comparisonGroupSize) || 0)
      ),
      minimumComparisonGroup: Math.max(
        0,
        Math.round(toNumberOrNull(achievements.minimumComparisonGroup) || 10)
      )
    },
    totalEntries: Math.max(0, Math.round(toNumberOrNull(record.totalEntries) || 0)),
    truncated: record.truncated === true,
    entries: (Array.isArray(record.entries) ? record.entries : [])
      .slice(0, 500)
      .map(normalizeRoleEntry),
    totalPendingEntries: Math.max(
      0,
      Math.round(toNumberOrNull(record.totalPendingEntries) || 0)
    ),
    pendingTruncated: record.pendingTruncated === true,
    pendingEntries: (
      Array.isArray(record.pendingEntries) ? record.pendingEntries : []
    )
      .slice(0, 500)
      .map(normalizePendingRoleEntry)
  };
}

export function resolveRoleLeaderboardUrl(
  config?: LeaderboardsEndpointConfig
): string | null {
  if (config?.roleUrl) return config.roleUrl;
  if (!config?.url) return null;

  try {
    const url = new URL(config.url);
    if (!url.pathname.endsWith('/v2')) {
      url.pathname = `${url.pathname.replace(/\/$/, '')}/v2`;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function isPeriodIdValid(period: RoleLeaderboardPeriod, periodId: string): boolean {
  return period === 'month'
    ? /^\d{4}-\d{2}$/.test(periodId)
    : /^\d{4}-\d{2}-\d{2}$/.test(periodId);
}

export function readRoleLeaderboardSelection(
  hash: string
): RoleLeaderboardSelection {
  const queryIndex = hash.indexOf('?');
  if (queryIndex < 0) return { ...DEFAULT_ROLE_SELECTION };
  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  const periodValue = params.get('period') as RoleLeaderboardPeriod | null;
  const roleValue = params.get('role') as RoleLeaderboardRole | null;
  const squadSizeValue = params.get('squadSize') as RoleLeaderboardSquadSize | null;
  const period = periodValue && ROLE_PERIOD_VALUES.has(periodValue) ? periodValue : 'day';
  const periodIdValue = params.get('periodId');

  return {
    period,
    role: roleValue && ROLE_VALUES.has(roleValue) ? roleValue : 'player',
    squadSize:
      squadSizeValue && SQUAD_SIZE_VALUES.has(squadSizeValue) ? squadSizeValue : 'full',
    periodId:
      periodIdValue && isPeriodIdValid(period, periodIdValue) ? periodIdValue : null
  };
}

export function buildRoleLeaderboardHash(
  selection: RoleLeaderboardSelection
): string {
  const params = new URLSearchParams();
  params.set('period', selection.period);
  params.set('role', selection.role);
  if (selection.role === 'squad_leader') {
    params.set('squadSize', selection.squadSize);
  }
  if (selection.periodId) params.set('periodId', selection.periodId);
  return `#leaderboards?${params.toString()}`;
}

function moscowLocalDate(now: Date): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
      .formatToParts(now)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)])
  ) as { year: number; month: number; day: number };
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function getCurrentRolePeriodId(
  period: RoleLeaderboardPeriod,
  now = new Date()
): string {
  const localDate = moscowLocalDate(now);
  if (period === 'month') return isoDate(localDate).slice(0, 7);
  if (period === 'week') {
    localDate.setUTCDate(localDate.getUTCDate() - ((localDate.getUTCDay() + 6) % 7));
  }
  return isoDate(localDate);
}

export function shiftRolePeriodId(
  period: RoleLeaderboardPeriod,
  periodId: string,
  direction: -1 | 1
): string {
  if (!isPeriodIdValid(period, periodId)) return periodId;
  const date = new Date(`${period === 'month' ? `${periodId}-01` : periodId}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return periodId;
  if (period === 'month') date.setUTCMonth(date.getUTCMonth() + direction);
  else date.setUTCDate(date.getUTCDate() + direction * (period === 'week' ? 7 : 1));
  const shifted = isoDate(date);
  return period === 'month' ? shifted.slice(0, 7) : shifted;
}

function buildRoleLeaderboardUrl(
  baseUrl: string,
  selection: RoleLeaderboardSelection
): string {
  const url = new URL(
    baseUrl,
    typeof window === 'undefined' ? 'http://localhost/' : window.location.href
  );
  url.searchParams.set('period', selection.period);
  url.searchParams.set('role', selection.role);
  url.searchParams.set('scope', 'public');
  url.searchParams.set('limit', '500');
  if (selection.role === 'squad_leader') {
    url.searchParams.set('squadSize', selection.squadSize);
  }
  if (selection.periodId) url.searchParams.set('periodId', selection.periodId);
  return url.toString();
}

export async function fetchRoleLeaderboard(
  baseUrl: string,
  selection: RoleLeaderboardSelection
): Promise<RoleLeaderboardResponse> {
  const response = await fetch(buildRoleLeaderboardUrl(baseUrl, selection), {
    headers: LEADERBOARD_HEADERS
  });
  if (!response.ok) throw new Error(await buildHttpError(response));
  return normalizeRoleResponse(await response.json(), selection);
}
