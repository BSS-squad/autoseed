import type {
  LeaderboardEntry,
  LeaderboardPeriod,
  LeaderboardResponse
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
