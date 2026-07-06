import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchCombinedSnapshot } from '../../src/lib/snapshot.ts';

const ORIGINAL_FETCH = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

test('keeps Team Balancer safety gate fields from exporter snapshots', async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        timestamp: Date.parse('2026-07-06T12:00:00.000Z'),
        generatedAt: '2026-07-06T12:00:00.000Z',
        version: 3,
        servers: [
          {
            id: 2,
            code: 'squadjs2',
            name: '[RU] BSS Spec Ops',
            playerCount: 42,
            maxPlayers: 100,
            online: true,
            teams: [],
            players: [],
            updatedAt: Date.parse('2026-07-06T12:00:00.000Z'),
            teamBalancer: {
              version: 1,
              generatedAt: '2026-07-06T12:00:00.000Z',
              decisionId: 'decision-1',
              serverId: 'squadjs2',
              mode: 'dry-run',
              action: 'recommend',
              result: 'proposal',
              trigger: 'UPDATED_PLAYER_INFORMATION',
              snapshotTimestamp: '2026-07-06T11:59:55.000Z',
              availableProposalModes: ['squad', 'player'],
              defaultProposalMode: 'squad',
              reasonCodes: [],
              signals: {
                triggerReason: 'impact_diff',
                teamSize: {
                  before: { 1: 6, 2: 2 },
                  after: { 1: 4, 2: 4 },
                  diffBefore: 4,
                  diffAfter: 0
                },
                impact: {
                  available: true,
                  metric: 'autobalancerScore',
                  unit: 'score',
                  before: { 1: 1800, 2: 900 },
                  after: { 1: 1440, 2: 1260 },
                  diffBefore: 900,
                  diffAfter: 180,
                  moved: 360
                }
              },
              cohorts: [],
              players: [],
              voteGate: {
                enabled: true,
                quorumPercent: 25,
                passThresholdPercent: 60,
                eligiblePlayerCount: 10,
                requiredVotes: 3,
                totalVotes: 3,
                yesVotes: 2,
                noVotes: 1,
                quorumMet: true,
                passThresholdMet: true,
                approved: true
              },
              moderatorDecision: {
                required: true,
                approved: false,
                vetoed: true,
                action: 'veto',
                reason: 'technical',
                note: 'wait for next round',
                moderatorName: 'Moderator',
                createdAt: '2026-07-06T12:00:30.000Z'
              },
              execution: {
                enabled: true,
                status: 'blocked',
                plannedMoves: 1,
                plannedPlayers: 2,
                attemptedPlayers: 0,
                succeededPlayers: 0,
                failedPlayers: 0,
                totalRconAttempts: 0,
                maxAttemptsPerPlayer: 2,
                completedAt: null
              }
            }
          }
        ]
      })
    );

  const snapshot = await fetchCombinedSnapshot([
    {
      name: 'squadjs2',
      baseUrl: 'https://exporter.example.test'
    }
  ]);

  const teamBalancer = snapshot.servers[0]?.teamBalancer;

  assert.equal(teamBalancer?.voteGate?.approved, true);
  assert.equal(teamBalancer?.voteGate?.requiredVotes, 3);
  assert.equal(teamBalancer?.moderatorDecision?.vetoed, true);
  assert.equal(teamBalancer?.moderatorDecision?.reason, 'technical');
  assert.equal(teamBalancer?.execution?.status, 'blocked');
  assert.equal(teamBalancer?.execution?.plannedPlayers, 2);
});
