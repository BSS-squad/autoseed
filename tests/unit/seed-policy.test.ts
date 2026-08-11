import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SEED_POLICY,
  determineTargetServer,
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

test('always uses strict squadjs1 -> squadjs2 -> squadjs3 order', () => {
  const currentSnapshot = snapshot([server(1, 70), server(2, 40), server(3, 5)]);

  assert.equal(determineTargetServer(currentSnapshot, DEFAULT_SEED_POLICY)?.id, 1);

  currentSnapshot.servers[0] = server(1, 70, { online: false });
  assert.equal(determineTargetServer(currentSnapshot, DEFAULT_SEED_POLICY)?.id, 2);

  currentSnapshot.servers[1] = server(2, 40, { playerCount: 80 });
  assert.equal(determineTargetServer(currentSnapshot, DEFAULT_SEED_POLICY)?.id, 3);
});

test('uses the strongest suitable unknown server only when known servers cannot seed', () => {
  const currentSnapshot = snapshot([
    server(1, 80),
    server(2, 40, { online: false }),
    server(3, 5, { isSeedCandidate: false }),
    server(7, 12),
    server(8, 33)
  ]);

  assert.equal(determineTargetServer(currentSnapshot, DEFAULT_SEED_POLICY)?.id, 8);
});

test('ignores legacy schedules and configurable priority fields', () => {
  const legacyScheduledPolicy = {
    timezone: 'Europe/Moscow',
    nightWindowStart: '00:00',
    nightWindowEnd: '08:00',
    nightPriorityOrder: [3, 2, 1],
    priorityOrder: [3, 2, 1],
    maxSeedPlayers: 75,
    cooldownMs: 120000,
    periodicReconnectMs: 240000
  } as unknown as Partial<SeedPolicy>;
  const resolved = resolveSeedPolicy(legacyScheduledPolicy);
  const allServers = snapshot([server(1, 5), server(2, 30), server(3, 70)]);

  assert.deepEqual(resolved, {
    maxSeedPlayers: 75,
    cooldownMs: 120000,
    periodicReconnectMs: 240000
  });
  assert.equal(determineTargetServer(allServers, resolved)?.id, 1);
});
