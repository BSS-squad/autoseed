import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SEED_POLICY,
  determineTargetServer,
  isNightWindow,
  resolveSeedPolicy
} from '../../src/lib/seed-policy.ts';
import type {
  CombinedSnapshot,
  ExporterServerSnapshot,
  SeedPolicy
} from '../../src/types.ts';

function server(
  id: number,
  playerCount: number,
  overrides: Partial<ExporterServerSnapshot> = {}
): ExporterServerSnapshot {
  return {
    id,
    code: `squadjs${id}`,
    name: `Server ${id}`,
    playerCount,
    maxPlayers: 100,
    isSeedCandidate: true,
    online: true,
    teams: [],
    players: [],
    raffles: null,
    teamBalancer: null,
    activity: null,
    updatedAt: 0,
    sourceUrl: '',
    joinLinkUrl: '',
    activitySessionBaseUrl: '',
    ...overrides
  };
}

function snapshot(servers: ExporterServerSnapshot[]): CombinedSnapshot {
  return {
    timestamp: 0,
    generatedAt: '2026-07-26T00:00:00.000Z',
    servers,
    errors: []
  };
}

const moscowTimes = {
  midnight: new Date('2026-07-25T21:00:00.000Z'),
  beforeEight: new Date('2026-07-26T04:59:00.000Z'),
  eight: new Date('2026-07-26T05:00:00.000Z'),
  beforeMidnight: new Date('2026-07-26T20:59:00.000Z')
};

test('uses Moscow boundaries 00:00 inclusive and 08:00 exclusive', () => {
  assert.equal(isNightWindow(DEFAULT_SEED_POLICY, moscowTimes.midnight), true);
  assert.equal(isNightWindow(DEFAULT_SEED_POLICY, moscowTimes.beforeEight), true);
  assert.equal(isNightWindow(DEFAULT_SEED_POLICY, moscowTimes.eight), false);
  assert.equal(isNightWindow(DEFAULT_SEED_POLICY, moscowTimes.beforeMidnight), false);
});

test('uses strict squadjs3 -> squadjs2 -> squadjs1 order at night', () => {
  const currentSnapshot = snapshot([server(1, 70), server(2, 40), server(3, 5)]);

  assert.equal(
    determineTargetServer(currentSnapshot, DEFAULT_SEED_POLICY, moscowTimes.midnight)?.id,
    3
  );

  currentSnapshot.servers[2] = server(3, 5, { online: false });
  assert.equal(
    determineTargetServer(currentSnapshot, DEFAULT_SEED_POLICY, moscowTimes.beforeEight)?.id,
    2
  );

  currentSnapshot.servers[1] = server(2, 40, { playerCount: 80 });
  assert.equal(
    determineTargetServer(currentSnapshot, DEFAULT_SEED_POLICY, moscowTimes.beforeEight)?.id,
    1
  );
});

test('uses strict squadjs1 -> squadjs2 -> squadjs3 order during the day', () => {
  const currentSnapshot = snapshot([server(1, 1), server(2, 70), server(3, 79)]);

  assert.equal(
    determineTargetServer(currentSnapshot, DEFAULT_SEED_POLICY, moscowTimes.eight)?.id,
    1
  );

  currentSnapshot.servers[0] = server(1, 1, { isSeedCandidate: false });
  assert.equal(
    determineTargetServer(currentSnapshot, DEFAULT_SEED_POLICY, moscowTimes.beforeMidnight)?.id,
    2
  );
});

test('migrates a legacy single-night-server config to the current BSS schedule', () => {
  const legacyPolicy = {
    timezone: 'Europe/Moscow',
    nightWindowStart: '23:00',
    nightWindowEnd: '08:00',
    nightPreferredServerId: 2,
    priorityOrder: [2, 1, 3],
    switchDelta: 10
  } as unknown as Partial<SeedPolicy>;

  const resolved = resolveSeedPolicy(legacyPolicy);

  assert.equal(resolved.nightWindowStart, '00:00');
  assert.equal(resolved.nightWindowEnd, '08:00');
  assert.deepEqual(resolved.nightPriorityOrder, [3, 2, 1]);
  assert.deepEqual(resolved.priorityOrder, [1, 2, 3]);
});

test('accepts the current configurable full priority schedule', () => {
  const resolved = resolveSeedPolicy({
    timezone: 'UTC',
    nightWindowStart: '01:00',
    nightWindowEnd: '09:00',
    nightPriorityOrder: [2, 3, 1],
    priorityOrder: [3, 1, 2]
  });

  assert.equal(resolved.timezone, 'UTC');
  assert.equal(resolved.nightWindowStart, '01:00');
  assert.equal(resolved.nightWindowEnd, '09:00');
  assert.deepEqual(resolved.nightPriorityOrder, [2, 3, 1]);
  assert.deepEqual(resolved.priorityOrder, [3, 1, 2]);
});
