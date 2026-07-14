import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTimeline,
  buildTimelineIntensity,
  findTimelineEventIndex,
  getPageCount,
  getPageForEventIndex,
  getPageRange
} from '../../src/journal/event-navigation.ts';

test('calculates page ranges including the complete journal option', () => {
  assert.equal(getPageCount(105, 25), 5);
  assert.deepEqual(getPageRange(105, 3, 25), { page: 3, start: 50, end: 75 });
  assert.deepEqual(getPageRange(105, 7, 25), { page: 5, start: 100, end: 105 });
  assert.deepEqual(getPageRange(105, 4, 'all'), { page: 1, start: 0, end: 105 });
  assert.equal(getPageForEventIndex(104, 105, 25), 5);
  assert.equal(getPageForEventIndex(104, 105, 'all'), 1);
});

test('finds the first event at the selected timeline minute', () => {
  const events = [
    { occurredAt: '2026-07-06T10:00:12.000Z' },
    { occurredAt: '2026-07-06T10:03:00.000Z' },
    { occurredAt: '2026-07-06T10:06:48.000Z' }
  ];
  const timeline = buildTimeline(events);

  assert.deepEqual(timeline, {
    startAt: Date.parse('2026-07-06T10:00:12.000Z'),
    endAt: Date.parse('2026-07-06T10:06:48.000Z'),
    durationMinutes: 7
  });
  assert.equal(findTimelineEventIndex(events, timeline!, 2), 1);
  assert.equal(findTimelineEventIndex(events, timeline!, 6), 2);
  assert.equal(findTimelineEventIndex(events, timeline!, 7), 2);
});

test('builds a compact intensity diagram from per-second events', () => {
  const events = [
    { occurredAt: '2026-07-06T10:00:00.000Z' },
    { occurredAt: '2026-07-06T10:00:00.000Z' },
    { occurredAt: '2026-07-06T10:00:01.000Z' },
    { occurredAt: '2026-07-06T10:00:04.000Z' }
  ];
  const timeline = buildTimeline(events);
  const intensity = buildTimelineIntensity(events, timeline!, 4);

  assert.equal(intensity.length, 4);
  assert.deepEqual(
    intensity.map((bucket) => bucket.eventCount),
    [2, 1, 0, 1]
  );
  assert.equal(intensity[0]?.eventsPerSecond, 2);
  assert.equal(intensity[0]?.relativeIntensity, 1);
  assert.equal(intensity[1]?.relativeIntensity, 0.5);
  assert.equal(intensity[2]?.relativeIntensity, 0);
});
