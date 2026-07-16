import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchActivitySession, fetchCombinedSnapshot } from '../../src/lib/snapshot.ts';

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
              control: {
                enabled: false,
                updatedAt: '2026-07-06T11:58:00.000Z',
                activeVote: {
                  targetEnabled: true,
                  createdAt: '2026-07-06T12:00:00.000Z',
                  expiresAt: '2026-07-06T12:05:00.000Z',
                  voteGate: {
                    enabled: true,
                    quorumPercent: 25,
                    passThresholdPercent: 60,
                    eligiblePlayerCount: 10,
                    requiredVotes: 3,
                    totalVotes: 2,
                    yesVotes: 2,
                    noVotes: 0,
                    quorumMet: false,
                    passThresholdMet: true,
                    approved: false
                  }
                }
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
  assert.equal(teamBalancer?.control?.enabled, false);
  assert.equal(teamBalancer?.control?.activeVote?.targetEnabled, true);
  assert.equal(teamBalancer?.control?.activeVote?.voteGate?.yesVotes, 2);
  assert.equal(teamBalancer?.control?.activeVote?.voteGate?.requiredVotes, 3);
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
                  layerSource: 'new_game',
                  layerMissingReason: null,
                  winner: { team: '1', faction: 'Winner', tickets: 123 },
                  loser: { team: '2', faction: 'Loser', tickets: 20 },
                  playerCount: 80,
                  totals: {
                    kills: 42,
                    deaths: 40,
                    revives: 7,
                    knockdowns: 61
                  },
                  scoreboard: {
                    teams: [
                      {
                        teamID: '1',
                        name: 'Winner',
                        result: 'winner',
                        totals: { kills: 30, deaths: 20, revives: 5, knockdowns: 41 },
                        players: [
                          {
                            name: 'Winner Player',
                            squad: 'Orange',
                            role: 'Rifleman',
                            kills: 8,
                            deaths: 2,
                            revives: 3,
                            knockdowns: 5,
                            eosID: 'private-scoreboard-player'
                          }
                        ]
                      },
                      {
                        teamID: '2',
                        name: 'Loser',
                        result: 'loser',
                        totals: { kills: 12, deaths: 20, revives: 2, knockdowns: 20 },
                        players: []
                      }
                    ]
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
                    weapon: 'Vehicle_Cannon',
                    damage: 45,
                    occurredAt: '2026-07-06T11:59:50.000Z',
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
  assert.equal(activity?.recentRounds[0]?.layerSource, 'new_game');
  assert.equal(activity?.recentRounds[0]?.layerMissingReason, null);
  assert.equal(activity?.recentRounds.length, 1);
  assert.equal(activity?.recentRounds[0]?.scoreboard?.teams.length, 2);
  assert.deepEqual(activity?.recentRounds[0]?.scoreboard?.teams[0]?.players[0], {
    name: 'Winner Player',
    squad: 'Orange',
    role: 'Rifleman',
    kills: 8,
    deaths: 2,
    revives: 3,
    knockdowns: 5
  });
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
  assert.equal(activity?.killfeed?.events[0]?.weapon, 'Vehicle_Cannon');
  assert.equal(activity?.killfeed?.events[0]?.damage, 45);
  assert.equal(activity?.killfeed?.events.length, 1);
  assert.doesNotMatch(
    JSON.stringify(activity),
    /eosID|steamID|playerId|playerIds|7656119|alpha-1|private-round-id|private-player-id|private-execution-player|private-scoreboard-player/
  );
});

test('loads a complete journal for one finished session without exposing private ids', async () => {
  const requestedUrls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);

    if (url.endsWith('/snapshot')) {
      return new Response(
        JSON.stringify({
          success: true,
          timestamp: Date.parse('2026-07-13T18:00:00.000Z'),
          generatedAt: '2026-07-13T18:00:00.000Z',
          version: 3,
          servers: [
            {
              id: 2,
              code: 'squadjs2',
              name: '[RU] BSS Spec Ops',
              online: true,
              teams: [],
              players: [],
              activity: {
                version: 3,
                generatedAt: '2026-07-13T18:00:00.000Z',
                sessions: [
                  {
                    sessionId: 's2_0123456789abcdef01234567',
                    journalAvailable: true,
                    journalComplete: true,
                    endedAt: '2026-07-13T17:55:00.000Z',
                    layer: 'Narva RAAS v3',
                    playerCount: 91,
                    totals: { kills: 83, deaths: 87, revives: 14, knockdowns: 106 },
                    eventCounts: {
                      kills: 83,
                      damage: 512,
                      knockdowns: 106,
                      revives: 14,
                      vehicles: 9
                    },
                    scoreboard: {
                      teams: [{ teamID: 'private-live-team', name: 'Не должно попасть', players: [] }]
                    }
                  }
                ],
                recentRounds: [],
                killfeed: { version: 3, rounds: [], events: [] }
              }
            }
          ]
        })
      );
    }

    if (url.endsWith('/activity/sessions/s2_0123456789abcdef01234567')) {
      return new Response(
        JSON.stringify({
          ok: true,
          version: 1,
          generatedAt: '2026-07-13T18:01:00.000Z',
          server: { id: 2, code: 'squadjs2', name: '[RU] BSS Spec Ops' },
          session: {
            sessionId: 's2_0123456789abcdef01234567',
            journalAvailable: true,
            journalComplete: true,
            endedAt: '2026-07-13T17:55:00.000Z',
            layer: 'Narva RAAS v3',
            playerCount: 91,
            totals: { kills: 83, deaths: 87, revives: 14, knockdowns: 106 },
            eventCounts: { kills: 1, damage: 1, knockdowns: 1, revives: 1, vehicles: 4 },
            scoreboard: {
              teams: [
                {
                  teamID: '1',
                  name: 'Победители',
                  result: 'winner',
                  totals: { kills: 1, deaths: 0, revives: 1, knockdowns: 1 },
                  players: [
                    {
                      name: 'Игрок',
                      squad: 'Альфа',
                      role: 'Rifleman',
                      kills: 1,
                      deaths: 0,
                      revives: 1,
                      knockdowns: 1,
                      steamID: 'private-steam-id'
                    }
                  ]
                }
              ]
            }
          },
          events: {
            kills: [
              {
                type: 'kill',
                occurredAt: '2026-07-13T17:10:01.123Z',
                attackerName: 'Игрок',
                victimName: 'Противник',
                weapon: 'BP_Rifle_C',
                playerId: 'private-player-id'
              }
            ],
            damage: [
              {
                type: 'damage',
                occurredAt: '2026-07-13T17:10:00.100Z',
                attackerName: 'Игрок',
                victimName: 'Противник',
                weapon: 'BP_Rifle_C',
                damage: 37.5
              }
            ],
            knockdowns: [
              {
                occurredAt: '2026-07-13T17:10:00.900Z',
                attackerName: 'Игрок',
                victimName: 'Противник'
              }
            ],
            revives: [
              {
                occurredAt: '2026-07-13T17:11:00.000Z',
                attackerName: 'Медик',
                victimName: 'Игрок'
              }
            ],
            vehicles: [
              {
                type: 'vehicle',
                occurredAt: '2026-07-13T17:12:00.000Z',
                attackerName: null,
                vehicleName: 'M1A2 Abrams',
                weapon: 'Projectile_TOW',
                damage: 480.75,
                healthRemaining: 1200.25,
                destroyed: false,
                controllerId: 'private-controller-id'
              },
              {
                type: 'vehicle',
                occurredAt: '2026-07-13T17:12:01.000Z',
                attackerName: null,
                vehicleName: 'BP_minsk_C_2146128567',
                weapon: 'FragmentationDamageType',
                damage: 250,
                healthRemaining: null,
                destroyed: false
              },
              {
                type: 'vehicle',
                occurredAt: '2026-07-13T17:12:02.000Z',
                attackerName: null,
                vehicleName: 'BP_CPV_Transport_Blue_C_2147481862',
                weapon: 'BP_Explosives_Damagetype_C',
                damage: 500,
                healthRemaining: null,
                destroyed: false
              },
              {
                type: 'vehicle',
                occurredAt: '2026-07-13T17:12:02.000Z',
                attackerName: null,
                vehicleName: 'BP_CPV_Transport_Blue_C_2147481862',
                weapon: 'BP_Deployable_TNT_600g_Explosive_Timed_C_2146147035',
                damage: 500,
                healthRemaining: 0,
                destroyed: true
              }
            ]
          }
        })
      );
    }

    return new Response('not found', { status: 404 });
  };

  const snapshot = await fetchCombinedSnapshot([
    { name: 'squadjs2', baseUrl: 'https://exporter.example.test/v1/autoseed' }
  ]);
  const server = snapshot.servers[0];
  assert.ok(server);
  assert.equal(server.activitySessionBaseUrl, 'https://exporter.example.test/v1/autoseed/activity/sessions');
  assert.equal(server.activity?.sessions[0]?.sessionId, 's2_0123456789abcdef01234567');
  assert.equal(server.activity?.sessions[0]?.scoreboard, null);
  assert.equal(server.activity?.sessions[0]?.eventCounts.damage, 512);

  const detail = await fetchActivitySession(server, 's2_0123456789abcdef01234567');
  assert.equal(detail.session.scoreboard?.teams[0]?.players[0]?.name, 'Игрок');
  assert.equal(detail.events.damage[0]?.damage, 37.5);
  assert.equal(detail.events.knockdowns[0]?.type, 'knockdown');
  assert.equal(detail.events.revives[0]?.type, 'revive');
  assert.equal(detail.events.vehicles[0]?.vehicleName, 'M1A2 Abrams');
  assert.equal(detail.events.vehicles[0]?.healthRemaining, 1200.25);
  assert.equal(detail.events.vehicles[0]?.attackerName, null);
  assert.equal(detail.events.vehicles[1]?.healthRemaining, null);
  assert.equal(detail.events.vehicles[2]?.destroyed, true);
  assert.equal(
    detail.events.vehicles[2]?.weapon,
    'BP_Deployable_TNT_600g_Explosive_Timed_C_2146147035'
  );
  assert.equal(detail.events.vehicles.length, 3);
  assert.equal(detail.session.eventCounts.vehicles, 3);
  assert.match(requestedUrls[1] || '', /\/activity\/sessions\/s2_0123456789abcdef01234567$/);
  assert.doesNotMatch(
    JSON.stringify(detail),
    /steamID|playerId|controllerId|private-steam-id|private-player-id|private-controller-id/
  );
});
