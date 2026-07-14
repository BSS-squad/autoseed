export const EVENT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200, 500] as const;

export type EventPageSize = (typeof EVENT_PAGE_SIZE_OPTIONS)[number] | 'all';

export type Timeline = {
  startAt: number;
  endAt: number;
  durationMinutes: number;
};

export type TimelineIntensityBucket = {
  startAt: number;
  endAt: number;
  eventCount: number;
  eventsPerSecond: number;
  relativeIntensity: number;
};

function parseEventTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getPageCount(total: number, pageSize: EventPageSize): number {
  if (total <= 0 || pageSize === 'all') return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

export function clampPage(page: number, total: number, pageSize: EventPageSize): number {
  return Math.min(Math.max(1, page), getPageCount(total, pageSize));
}

export function getPageRange(
  total: number,
  page: number,
  pageSize: EventPageSize
): { page: number; start: number; end: number } {
  const safePage = clampPage(page, total, pageSize);
  if (pageSize === 'all') return { page: safePage, start: 0, end: total };
  const start = (safePage - 1) * pageSize;
  return { page: safePage, start, end: Math.min(total, start + pageSize) };
}

export function getPageForEventIndex(
  eventIndex: number,
  total: number,
  pageSize: EventPageSize
): number {
  if (pageSize === 'all') return 1;
  const safeIndex = Math.min(Math.max(0, eventIndex), Math.max(0, total - 1));
  return Math.floor(safeIndex / pageSize) + 1;
}

export function buildTimeline(
  events: Array<{ occurredAt: string | null | undefined }>
): Timeline | null {
  const timestamps = events
    .map((event) => parseEventTime(event.occurredAt))
    .filter((timestamp): timestamp is number => timestamp !== null);
  if (!timestamps.length) return null;
  const startAt = Math.min(...timestamps);
  const endAt = Math.max(...timestamps);
  return {
    startAt,
    endAt,
    durationMinutes: Math.max(0, Math.ceil((endAt - startAt) / 60_000))
  };
}

export function buildTimelineIntensity(
  events: Array<{ occurredAt: string | null | undefined }>,
  timeline: Timeline,
  preferredBucketCount = 60
): TimelineIntensityBucket[] {
  const durationMs = Math.max(1_000, timeline.endAt - timeline.startAt);
  const durationSeconds = Math.max(1, Math.ceil(durationMs / 1_000));
  const bucketCount = Math.min(
    durationSeconds,
    Math.max(1, Math.floor(preferredBucketCount))
  );
  const bucketDurationMs = durationMs / bucketCount;
  const eventCounts = Array.from({ length: bucketCount }, () => 0);

  for (const event of events) {
    const timestamp = parseEventTime(event.occurredAt);
    if (timestamp === null || timestamp < timeline.startAt || timestamp > timeline.endAt) continue;
    const position = (timestamp - timeline.startAt) / durationMs;
    const bucketIndex = Math.min(bucketCount - 1, Math.floor(position * bucketCount));
    eventCounts[bucketIndex] += 1;
  }

  const rates = eventCounts.map((count) => count / (bucketDurationMs / 1_000));
  const peakRate = Math.max(...rates, 0);

  return eventCounts.map((eventCount, index) => {
    const startAt = timeline.startAt + index * bucketDurationMs;
    const endAt = Math.min(timeline.endAt, startAt + bucketDurationMs);
    const eventsPerSecond = rates[index];
    return {
      startAt,
      endAt,
      eventCount,
      eventsPerSecond,
      relativeIntensity: peakRate > 0 ? eventsPerSecond / peakRate : 0
    };
  });
}

export function findTimelineEventIndex(
  events: Array<{ occurredAt: string | null | undefined }>,
  timeline: Timeline,
  minute: number
): number | null {
  const safeMinute = Math.min(Math.max(0, minute), timeline.durationMinutes);
  const targetAt = timeline.startAt + safeMinute * 60_000;
  let lastValidIndex: number | null = null;

  for (let index = 0; index < events.length; index += 1) {
    const timestamp = parseEventTime(events[index].occurredAt);
    if (timestamp === null) continue;
    lastValidIndex = index;
    if (timestamp >= targetAt) return index;
  }

  return lastValidIndex;
}
