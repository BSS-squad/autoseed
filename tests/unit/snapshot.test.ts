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
                },
                ticketDiff: {
                  winnerTeamID: '1',
                  loserTeamID: '2',
                  winnerTickets: 260,
                  loserTickets: 20,
                  diff: 240,
                  steamID: '76561190000000000'
                },
                winStreak: {
                  teamID: '1',
                  count: 2,
                  threshold: 2,
                  discordID: '111111111111111111'
                },
                recentRoundSeverity: {
                  level: 'severe',
                  reasons: ['ticket_diff', 'win_streak', ''],
                  ticketDiff: 240,
                  winStreak: 2,
                  playerIds: ['alpha-1', 'alpha-2']
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
              },
              history: [
                {
                  decisionId: 'decision-1',
                  createdAt: '2026-07-06T12:00:00.000Z',
                  mode: 'dry-run',
                  status: 'evaluated',
                  trigger: 'UPDATED_PLAYER_INFORMATION',
                  plannedMoves: 1,
                  plannedPlayers: 2,
                  summary: 'Public operation entry',
                  moves: [
                    {
                      type: 'squad',
                      fromTeamID: '1',
                      toTeamID: '2',
                      squadName: 'Vanguard Alpha',
                      playerCount: 2,
                      status: 'evaluated',
                      playerIds: ['alpha-1', 'alpha-2']
                    }
                  ],
                  players: [
                    {
                      name: 'Vanguard Commander',
                      matchKey: 'steam:public',
                      fromTeamID: '1',
                      toTeamID: '2',
                      status: 'move_pending',
                      steamID: '76561190000000001'
                    }
                  ]
                }
              ]
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
  assert.equal(teamBalancer?.history[0]?.plannedPlayers, 2);
  assert.equal(teamBalancer?.history[0]?.moves[0]?.squadName, 'Vanguard Alpha');
  assert.equal(teamBalancer?.history[0]?.players[0]?.name, 'Vanguard Commander');
  assert.deepEqual(teamBalancer?.signals.ticketDiff, {
    winnerTeamID: '1',
    loserTeamID: '2',
    winnerTickets: 260,
    loserTickets: 20,
    diff: 240
  });
  assert.deepEqual(teamBalancer?.signals.winStreak, {
    teamID: '1',
    count: 2,
    threshold: 2
  });
  assert.deepEqual(teamBalancer?.signals.recentRoundSeverity, {
    level: 'severe',
    reasons: ['ticket_diff', 'win_streak'],
    ticketDiff: 240,
    winStreak: 2
  });
  assert.doesNotMatch(
    JSON.stringify(teamBalancer?.signals),
    /steamID|discordID|playerIds|7656119|alpha-1|alpha-2/
  );
  assert.doesNotMatch(JSON.stringify(teamBalancer?.history), /steamID|playerIds|7656119|alpha-1/);
});

test('keeps public activity fields and drops private ids from exporter snapshots', async () => {
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
            activity: {
              version: 1,
              teamBalancerHistory: [
                {
                  decisionId: 'activity-decision-1',
                  createdAt: '2026-07-06T12:00:00.000Z',
                  mode: 'execute',
                  action: 'execute',
                  result: 'executed',
                  status: 'executed',
                  trigger: 'UPDATED_PLAYER_INFORMATION',
                  reasonCodes: ['vote_passed'],
                  plannedMoves: 1,
                  plannedPlayers: 2,
                  summary: 'Activity operation entry',
                  execution: {
                    enabled: true,
                    status: 'completed',
                    plannedMoves: 1,
                    plannedPlayers: 2,
                    attemptedPlayers: 2,
                    succeededPlayers: 2,
                    failedPlayers: 0,
                    totalRconAttempts: 2,
                    maxAttemptsPerPlayer: 2,
                    completedAt: '2026-07-06T12:00:30.000Z',
                    playerId: 'private-execution-player'
                  },
                  moves: [
                    {
                      type: 'squad',
                      fromTeamID: '1',
                      toTeamID: '2',
                      squadName: 'Vanguard Alpha',
                      playerCount: 2,
                      status: 'evaluated',
                      playerIds: ['alpha-1', 'alpha-2']
                    }
                  ],
                  players: [
                    {
                      name: 'Vanguard Commander',
                      matchKey: 'steam:public',
                      fromTeamID: '1',
                      toTeamID: '2',
                      status: 'move_pending',
                      steamID: '76561190000000001'
                    }
                  ],
                  proposalModes: {
                    squad: {
                      proposalMode: 'squad',
                      action: 'recommend',
                      result: 'evaluated',
                      status: 'evaluated',
                      reasonCodes: [],
                      plannedMoves: 1,
                      plannedPlayers: 2,
                      teamCounts: { before: { 1: 6, 2: 2 }, after: { 1: 4, 2: 4 } },
                      diffBefore: 4,
                      diffAfter: 0,
                      moves: [
                        {
                          type: 'squad',
                          fromTeamID: '1',
                          toTeamID: '2',
                          squadName: 'Vanguard Alpha',
                          playerCount: 2,
                          status: 'evaluated'
                        }
                      ],
                      players: []
                    },
                    player: {
                      proposalMode: 'player',
                      action: 'recommend',
                      result: 'evaluated',
                      status: 'evaluated',
                      reasonCodes: [],
                      plannedMoves: 1,
                      plannedPlayers: 1,
                      teamCounts: { before: { 1: 6, 2: 2 }, after: { 1: 5, 2: 3 } },
                      diffBefore: 4,
                      diffAfter: 2,
                      moves: [
                        {
                          type: 'player',
                          fromTeamID: '1',
                          toTeamID: '2',
                          squadName: 'Vanguard Alpha',
                          playerCount: 1,
                          status: 'evaluated',
                          playerIds: ['alpha-1']
                        }
                      ],
                      players: []
                    }
                  }
                }
              ],
              recentRounds: [
                {
                  endedAt: '2026-07-06T12:00:00.000Z',
                  layer: 'Narva RAAS v2',
                  winner: { team: '1', faction: 'Winner', tickets: 123 },
                  loser: { team: '2', faction: 'Loser', tickets: 20 },
                  playerCount: 80,
                  totals: {
                    kills: 42,
                    deaths: 40,
                    revives: 7,
                    knockdowns: 61
                  },
                  eosID: 'private-round-id'
                },
                {
                  layer: 'Current round',
                  playerCount: 80,
                  totals: {
                    kills: 99,
                    deaths: 99,
                    revives: 0,
                    knockdowns: 0
                  }
                }
              ],
              topWindow: {
                roundLimit: 10,
                roundCount: 10,
                requiredParticipation: 3,
                qualificationPercent: 30,
                entries: [
                  {
                    rank: 1,
                    name: 'Qualified A',
                    roundsPlayed: 3,
                    kills: 15,
                    deaths: 2,
                    revives: 4,
                    knockdowns: 21,
                    kdRatio: 7.5,
                    steamID: '76561190000000000'
                  }
                ]
              },
              killfeed: {
                version: 1,
                rounds: [{ endedAt: '2026-07-06T12:00:00.000Z', totals: { kills: 3, knockdowns: 4 } }],
                events: [
                  {
                    type: 'kill',
                    attackerName: 'Attacker',
                    victimName: 'Victim',
                    count: 2,
                    roundEndedAt: '2026-07-06T12:00:00.000Z',
                    playerId: 'private-player-id'
                  },
                  {
                    type: 'kill',
                    attackerName: 'Current Attacker',
                    victimName: 'Current Victim',
                    count: 99
                  }
                ]
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

  const activity = snapshot.servers[0]?.activity;

  assert.equal(activity?.recentRounds[0]?.layer, 'Narva RAAS v2');
  assert.equal(activity?.recentRounds.length, 1);
  assert.equal(activity?.teamBalancerHistory[0]?.plannedPlayers, 2);
  assert.equal(activity?.teamBalancerHistory[0]?.mode, 'execute');
  assert.equal(activity?.teamBalancerHistory[0]?.execution?.succeededPlayers, 2);
  assert.equal(activity?.teamBalancerHistory[0]?.moves[0]?.squadName, 'Vanguard Alpha');
  assert.equal(activity?.teamBalancerHistory[0]?.proposalModes?.squad?.plannedPlayers, 2);
  assert.equal(activity?.teamBalancerHistory[0]?.proposalModes?.player?.plannedPlayers, 1);
  assert.equal(activity?.teamBalancerHistory[0]?.proposalModes?.player?.moves[0]?.type, 'player');
  assert.equal(activity?.topWindow?.requiredParticipation, 3);
  assert.equal(activity?.topWindow?.entries[0]?.name, 'Qualified A');
  assert.equal(activity?.killfeed?.events[0]?.attackerName, 'Attacker');
  assert.equal(activity?.killfeed?.events.length, 1);
  assert.doesNotMatch(
    JSON.stringify(activity),
    /eosID|steamID|playerId|playerIds|7656119|alpha-1|private-round-id|private-player-id|private-execution-player/
  );
});
