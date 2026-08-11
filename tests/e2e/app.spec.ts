import { expect, test, type Page, type Route } from '@playwright/test';
import { buildTeamBalancerCompositionKey } from '../../src/lib/team-balancer-diff';

const BASE_TIME = Date.parse('2026-04-04T12:00:00.000Z');
const REDIRECT_TARGET_URL = 'http://127.0.0.1:4173/redirect-target';
const VANGUARD_ALPHA_PLAYERS = [
  { matchKey: 'steam:vanguard-cmd' },
  { matchKey: 'steam:vanguard-alpha-2' }
];
const VANGUARD_ALPHA_COMPOSITION_KEY = buildTeamBalancerCompositionKey(VANGUARD_ALPHA_PLAYERS);

const runtimeConfig = {
  app: {
    title: 'BSS AutoConnect 2026',
    debugLogLimit: 80
  },
  policy: {
    timezone: 'Europe/Moscow',
    nightWindowStart: '00:00',
    nightWindowEnd: '08:00',
    nightPriorityOrder: [3, 2, 1],
    maxSeedPlayers: 80,
    priorityOrder: [1, 2, 3],
    cooldownMs: 600000,
    periodicReconnectMs: 600000
  },
  exporters: [
    {
      name: 'squadjs1',
      baseUrl: 'http://127.0.0.1:4173/mock/squadjs1'
    },
    {
      name: 'squadjs2',
      baseUrl: 'http://127.0.0.1:4173/mock/squadjs2'
    }
  ]
};

const testModeRuntimeConfig = {
  ...runtimeConfig,
  app: {
    ...runtimeConfig.app,
    testMode: {
      sequenceServerIds: [1, 2],
      delayMs: 1000,
      cooldownMs: 50
    }
  }
};

const vipShopRuntimeConfig = {
  ...runtimeConfig,
  app: {
    ...runtimeConfig.app,
    vipShopUrl: 'https://vip.example.test/shop'
  }
};

const siteRuntimeConfig = {
  ...runtimeConfig,
  app: {
    ...runtimeConfig.app,
    siteUrl: 'https://squad.leo-land.ru/'
  }
};

const leaderboardsRuntimeConfig = {
  ...runtimeConfig,
  leaderboards: {
    url: 'http://127.0.0.1:4173/mock/leaderboards'
  }
};

const singleJournalServerRuntimeConfig = {
  ...runtimeConfig,
  exporters: runtimeConfig.exporters.filter((exporter) => exporter.name === 'squadjs2')
};

const productionSwitchRuntimeConfig = {
  ...runtimeConfig,
  policy: {
    ...runtimeConfig.policy,
    nightWindowStart: '00:00',
    nightWindowEnd: '00:00',
    cooldownMs: 50,
    periodicReconnectMs: 0
  }
};

const priorityRuntimeConfig = {
  ...runtimeConfig,
  exporters: [
    {
      name: 'mix',
      baseUrl: 'http://127.0.0.1:4173/mock/mix'
    },
    {
      name: 'specops',
      baseUrl: 'http://127.0.0.1:4173/mock/specops'
    },
    {
      name: 'invasion',
      baseUrl: 'http://127.0.0.1:4173/mock/invasion'
    }
  ]
};

const SQUADJS2_SELECTION_KEY = 'http://127.0.0.1:4173/mock/squadjs2/snapshot::2::squadjs2';
const NARVA_SESSION_ID = 'session-narva-20260706-1200';
const GORODOK_SESSION_ID = 'session-gorodok-20260706-1100';

const JULY_RAFFLE_CAMPAIGN = {
  startsAt: '2026-07-01T00:00:00+03:00',
  endsAt: '2026-08-01T00:00:00+03:00',
  autoStartEnabled: true,
  autoPrizes: ['1000 рублей', 'VIP 7 дней'],
  primeTimeStartHour: 18,
  primeTimeEndHour: 20,
  timezoneOffsetMinutes: 180,
  minimumPrimePlayers: 90,
  minimumAnnouncementPlayers: 1,
  durationSeconds: 1200,
  progress: 0
};

const CANCELLED_RAFFLE_CAMPAIGN = {
  ...JULY_RAFFLE_CAMPAIGN,
  cancelled: true,
  cancelledAt: '2026-07-05T00:00:00+03:00',
  autoStartEnabled: false
};

const AUGUST_RAFFLE_CAMPAIGN = {
  ...JULY_RAFFLE_CAMPAIGN,
  startsAt: '2026-08-01T00:00:00+03:00',
  endsAt: '2026-09-01T00:00:00+03:00',
  autoPrizes: ['VIP 14 дней']
};

function buildTeam(id: number, name: string, totalPlaytimeHours: number) {
  return {
    id,
    name,
    playerCount: 20,
    playersWithHours: 18,
    totalPlaytimeSeconds: totalPlaytimeHours * 3600,
    totalPlaytimeHours,
    leaderPlaytimeSeconds: 7200,
    leaderPlaytimeHours: 2,
    commanderPlaytimeSeconds: 10800,
    commanderPlaytimeHours: 3,
    squads: [
      {
        id: id * 10,
        name: `${name} Alpha`,
        playerCount: 9,
        totalPlaytimeSeconds: 32400,
        totalPlaytimeHours: 9,
        leaderName: `${name} Lead`,
        leaderPlaytimeSeconds: 7200,
        leaderPlaytimeHours: 2
      }
    ],
    players: [
      {
        eosId: `${name.toLowerCase()}-cmd`,
        steamId: `${id}001`,
        matchKey: `steam:${name.toLowerCase()}-cmd`,
        name: `${name} Commander`,
        teamId: id,
        teamName: name,
        squadId: id * 10,
        squadName: `${name} Alpha`,
        role: 'Commander',
        isLeader: true,
        isCommander: true,
        playtimeSeconds: 10800,
        playtimeHours: 3,
        playtimeSource: 'test'
      },
      {
        eosId: `${name.toLowerCase()}-alpha-2`,
        steamId: `${id}002`,
        matchKey: `steam:${name.toLowerCase()}-alpha-2`,
        name: `${name} Rifleman`,
        teamId: id,
        teamName: name,
        squadId: id * 10,
        squadName: `${name} Alpha`,
        role: 'Rifleman',
        isLeader: false,
        isCommander: false,
        playtimeSeconds: 3600,
        playtimeHours: 1,
        playtimeSource: 'test'
      }
    ]
  };
}

function buildSnapshot({
  id,
  code,
  name,
  playerCount,
  maxPlayers,
  queueLength,
  online,
  isSeedCandidate = true,
  timestamp = BASE_TIME,
  raffles = null,
  teamBalancer = null,
  activity = null
}: {
  id: number;
  code: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  queueLength: number;
  online: boolean;
  isSeedCandidate?: boolean;
  timestamp?: number;
  raffles?: unknown;
  teamBalancer?: unknown;
  activity?: unknown;
}) {
  return {
    success: true,
    timestamp,
    generatedAt: new Date(timestamp).toISOString(),
    version: 3,
    servers: [
      {
        id,
        code,
        name,
        playerCount,
        maxPlayers,
        queueLength,
        currentLayer: 'Narva RAAS v2',
        gameMode: 'RAAS',
        isSeedCandidate,
        online,
        teams: [buildTeam(1, 'Vanguard', 342.6), buildTeam(2, 'Nomad', 287.4)],
        players: [],
        raffles,
        teamBalancer,
        activity,
        updatedAt: BASE_TIME
      }
    ]
  };
}

function buildTeamBalancerProposalSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    version: 2,
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
      triggerReason: 'scramble_dry_run',
      teamSize: {
        before: { 1: 6, 2: 2 },
        after: { 1: 4, 2: 4 },
        diffBefore: 4,
        diffAfter: 0
      },
      winStreak: null,
      ticketDiff: null,
      recentRoundSeverity: null
    },
    summary: 'Team Balancer dry-run proposal.',
    cohorts: [
      {
        type: 'squad',
        cohortKey: 'squad:1:alpha',
        fromTeamID: '1',
        toTeamID: '2',
        currentTeamID: '1',
        expectedTeamID: '2',
        squadID: 'alpha',
        squadName: 'Vanguard Alpha',
        compositionKey: VANGUARD_ALPHA_COMPOSITION_KEY,
        playerCount: 2,
        status: 'move_pending',
        confidence: null,
        score: null
      }
    ],
    players: [
      {
        name: 'Vanguard Commander',
        matchKey: 'steam:vanguard-cmd',
        fromTeamID: '1',
        toTeamID: '2',
        currentTeamID: '1',
        expectedTeamID: '2',
        squadID: 'alpha',
        squadName: 'Vanguard Alpha',
        status: 'move_pending',
        confidence: null,
        score: null
      },
      {
        name: 'Vanguard Rifleman',
        matchKey: 'steam:vanguard-alpha-2',
        fromTeamID: '1',
        toTeamID: '2',
        currentTeamID: '1',
        expectedTeamID: '2',
        squadID: 'alpha',
        squadName: 'Vanguard Alpha',
        status: 'move_pending',
        confidence: null,
        score: null
      }
    ],
    control: {
      enabled: false,
      updatedAt: '2026-07-06T11:58:00.000Z',
      activeVote: null
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
        summary: 'Team Balancer dry-run proposal.',
        execution: null,
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
        players: [
          {
            name: 'Vanguard Commander',
            matchKey: 'steam:vanguard-cmd',
            fromTeamID: '1',
            toTeamID: '2',
            squadName: 'Vanguard Alpha',
            status: 'move_pending'
          }
        ]
      }
    ],
    ...overrides
  };
}

function buildActivitySnapshot() {
  return {
    version: 3,
    generatedAt: '2026-07-06T12:01:00.000Z',
    teamBalancerHistory: [
      {
        decisionId: 'activity-decision-1',
        createdAt: '2026-07-06T12:00:00.000Z',
        mode: 'dry-run',
        status: 'evaluated',
        trigger: 'UPDATED_PLAYER_INFORMATION',
        plannedMoves: 1,
        plannedPlayers: 2,
        summary: 'Team Balancer dry-run proposal.',
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
        players: [],
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
                status: 'evaluated'
              }
            ],
            players: []
          }
        }
      },
      {
        decisionId: 'activity-decision-2',
        createdAt: '2026-07-06T12:01:00.000Z',
        mode: 'execute',
        action: 'execute',
        result: 'executed',
        status: 'executed',
        trigger: 'ROUND_ENDED',
        plannedMoves: 1,
        plannedPlayers: 2,
        summary: 'Team Balancer execute completed.',
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
          completedAt: '2026-07-06T12:01:30.000Z'
        },
        moves: [
          {
            type: 'squad',
            fromTeamID: '1',
            toTeamID: '2',
            squadName: 'Vanguard Alpha',
            playerCount: 2,
            status: 'executed'
          }
        ],
        players: []
      }
    ],
    sessions: [
      {
        sessionId: NARVA_SESSION_ID,
        journalAvailable: true,
        journalComplete: true,
        endedAt: '2026-07-06T12:00:00.000Z',
        layer: 'Narva RAAS v2',
        winner: { team: '1', faction: 'Winner', tickets: 123 },
        loser: { team: '2', faction: 'Loser', tickets: 20 },
        playerCount: 80,
        totals: { kills: 42, deaths: 40, revives: 7, knockdowns: 61 },
        eventCounts: { kills: 1, damage: 105, knockdowns: 1, revives: 1, vehicles: 1 }
      },
      {
        sessionId: GORODOK_SESSION_ID,
        journalAvailable: true,
        journalComplete: true,
        endedAt: '2026-07-06T11:00:00.000Z',
        layer: 'Gorodok Invasion v1',
        winner: { team: '2', faction: 'Winner', tickets: 88 },
        loser: { team: '1', faction: 'Loser', tickets: 0 },
        playerCount: 76,
        totals: { kills: 38, deaths: 37, revives: 9, knockdowns: 55 },
        eventCounts: { kills: 1, damage: 0, knockdowns: 0, revives: 0, vehicles: 1 }
      }
    ],
    recentRounds: [
      {
        sessionId: NARVA_SESSION_ID,
        endedAt: '2026-07-06T12:00:00.000Z',
        layer: 'Narva RAAS v2',
        winner: { team: '1', faction: 'Winner', tickets: 123 },
        loser: { team: '2', faction: 'Loser', tickets: 20 },
        playerCount: 80,
        totals: { kills: 42, deaths: 40, revives: 7, knockdowns: 61 },
        eventCounts: { kills: 1, damage: 105, knockdowns: 1, revives: 1, vehicles: 1 }
      },
      {
        sessionId: GORODOK_SESSION_ID,
        endedAt: '2026-07-06T11:00:00.000Z',
        layer: 'Gorodok Invasion v1',
        winner: { team: '2', faction: 'Winner', tickets: 88 },
        loser: { team: '1', faction: 'Loser', tickets: 0 },
        playerCount: 76,
        totals: { kills: 38, deaths: 37, revives: 9, knockdowns: 55 },
        eventCounts: { kills: 1, damage: 0, knockdowns: 0, revives: 0, vehicles: 1 }
      }
    ],
    topWindow: {
      roundLimit: 10,
      roundCount: 10,
      qualificationPercent: 30,
      requiredParticipation: 3,
      entries: [
        {
          rank: 1,
          name: 'Qualified A',
          roundsPlayed: 3,
          kills: 15,
          deaths: 2,
          revives: 4,
          knockdowns: 21,
          kdRatio: 7.5
        }
      ]
    },
    killfeed: {
      version: 3,
      generatedAt: '2026-07-06T12:01:00.000Z',
      rounds: [
        {
          sessionId: NARVA_SESSION_ID,
          endedAt: '2026-07-06T12:00:00.000Z',
          playerCount: 80,
          totals: { kills: 42, knockdowns: 61 },
          eventCounts: { kills: 1, damage: 105, knockdowns: 1, revives: 1, vehicles: 1 }
        }
      ],
      events: []
    }
  };
}

function buildActivitySnapshotWithTenSessions() {
  const activity = buildActivitySnapshot();
  const originalSessions = activity.sessions;
  const sessions = Array.from({ length: 10 }, (_, index) => {
    const original = originalSessions[index] || originalSessions[0];
    return {
      ...original,
      sessionId: index === 0 ? NARVA_SESSION_ID : `session-scroll-${index + 1}`,
      endedAt: new Date(Date.parse('2026-07-06T12:00:00.000Z') - index * 60 * 60 * 1000).toISOString(),
      layer: `Карта для прокрутки ${index + 1}`
    };
  });

  return { ...activity, sessions, recentRounds: sessions };
}

function buildActivitySessionDetail(sessionId = NARVA_SESSION_ID) {
  if (sessionId === GORODOK_SESSION_ID) {
    return {
      ok: true,
      version: 1,
      generatedAt: '2026-07-06T12:02:00.000Z',
      server: { id: 2, code: 'squadjs2', name: '[RU] BSS Spec Ops' },
      session: {
        sessionId: GORODOK_SESSION_ID,
        journalAvailable: true,
        journalComplete: true,
        endedAt: '2026-07-06T11:00:00.000Z',
        layer: 'Gorodok Invasion v1',
        winner: { team: '2', faction: 'Winner', tickets: 88 },
        loser: { team: '1', faction: 'Loser', tickets: 0 },
        playerCount: 76,
        totals: { kills: 38, deaths: 37, revives: 9, knockdowns: 55 },
        eventCounts: { kills: 1, damage: 0, knockdowns: 0, revives: 0, vehicles: 1 },
        scoreboard: {
          teams: [
            {
              teamID: '2',
              name: 'Gorodok Winner',
              result: 'winner',
              totals: { kills: 38, deaths: 37, revives: 9, knockdowns: 55 },
              players: [
                {
                  name: 'Gorodok Player',
                  squad: 'Blue',
                  role: 'Medic',
                  kills: 7,
                  deaths: 3,
                  revives: 6,
                  knockdowns: 9,
                  eosID: 'private-gorodok-player'
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
            occurredAt: '2026-07-06T10:59:30.000Z',
            attackerName: 'Gorodok Killer',
            victimName: 'Gorodok Victim',
            weapon: 'BP_SVDM_C',
            damage: 100,
            attackerEosID: 'private-gorodok-attacker'
          }
        ],
        damage: [],
        knockdowns: [],
        revives: [],
        vehicles: [
          {
            type: 'vehicle-destroyed',
            occurredAt: '2026-07-06T10:58:00.000Z',
            attackerName: 'Gorodok LAT',
            vehicleName: 'BTR82A',
            weapon: 'RPG26',
            damage: 300,
            healthRemaining: 0,
            destroyed: true
          }
        ]
      }
    };
  }

  return {
    ok: true,
    version: 1,
    generatedAt: '2026-07-06T12:02:00.000Z',
    server: { id: 2, code: 'squadjs2', name: '[RU] BSS Spec Ops' },
    session: {
      sessionId: NARVA_SESSION_ID,
      journalAvailable: true,
      journalComplete: true,
      endedAt: '2026-07-06T12:00:00.000Z',
      layer: 'Narva RAAS v2',
      winner: { team: '1', faction: 'Winner', tickets: 123 },
      loser: { team: '2', faction: 'Loser', tickets: 20 },
      playerCount: 80,
      matchExportAvailable: true,
      totals: { kills: 42, deaths: 40, revives: 7, knockdowns: 61 },
      eventCounts: { kills: 1, damage: 105, knockdowns: 1, revives: 1, vehicles: 4 },
      scoreboard: {
        teams: [
          {
            teamID: '1',
            name: 'Winner',
            result: 'winner',
            totals: {
              kills: 30,
              deaths: 20,
              revives: 5,
              knockdowns: 41,
              teamkills: 2,
              vehicleKills: 3,
              vehicleDamage: 1250.5
            },
            players: [
              {
                name: 'Winner Player',
                squad: 'Orange',
                role: 'Rifleman',
                kills: 8,
                deaths: 2,
                revives: 3,
                knockdowns: 5,
                teamkills: 1,
                vehicleKills: 2,
                vehicleDamage: 750.5,
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
      }
    },
    events: {
      kills: [
        {
          type: 'kill',
          occurredAt: '2026-07-06T11:59:50.000Z',
          attackerName: 'Killer Alpha',
          victimName: 'Victim Bravo',
          weapon: 'BP_AK74_C',
          damage: 100,
          attackerEosID: 'private-killer-alpha'
        }
      ],
      damage: Array.from({ length: 105 }, (_, index) => {
        const offsetSeconds =
          index < 34
            ? index % 4
            : index < 68
              ? 240 + (index % 6)
              : 480 + (index - 68) * 4;
        return {
          type: 'damage',
          occurredAt: new Date(
            Date.parse('2026-07-06T11:50:00.000Z') + offsetSeconds * 1_000
          ).toISOString(),
          attackerName: `Damage Attacker ${index}`,
          victimName: `Damage Target ${index}`,
          weapon: index === 0 ? 'BP_PKM_C' : 'BP_AK74_C',
          damage: index === 0 ? 31.5 : 10,
          internalEventId: `private-damage-${index}`
        };
      }),
      knockdowns: [
        {
          type: 'knockdown',
          occurredAt: '2026-07-06T11:57:00.000Z',
          attackerName: 'Knockdown Charlie',
          victimName: 'Knockdown Delta',
          weapon: 'BP_M240B_C',
          damage: 75
        }
      ],
      revives: [
        {
          type: 'revive',
          occurredAt: '2026-07-06T11:58:00.000Z',
          attackerName: 'Medic Echo',
          victimName: 'Patient Foxtrot',
          weapon: 'Field_Dressing'
        }
      ],
      vehicles: [
        {
          type: 'vehicle-damage',
          occurredAt: '2026-07-06T11:56:00.000Z',
          attackerName: 'Vehicle Hunter',
          vehicleName: 'T72B3',
          weapon: 'TOW',
          damage: 420,
          healthRemaining: 80,
          destroyed: false,
          attackerSteamID: '76561198000000001'
        },
        {
          type: 'vehicle-damage',
          occurredAt: '2026-07-06T11:56:10.000Z',
          attackerName: null,
          vehicleName: 'BP_minsk_C_2146128567',
          weapon: 'FragmentationDamageType',
          damage: 250,
          healthRemaining: null,
          destroyed: false
        },
        {
          type: 'vehicle-destroyed',
          occurredAt: '2026-07-06T11:56:15.000Z',
          attackerName: null,
          vehicleName: 'BP_M1151_Woodland_C_2145676702',
          weapon: 'BP_RPG28_Tandem_Proj_C_2145594143',
          damage: 700,
          healthRemaining: 0,
          destroyed: true
        },
        {
          type: 'vehicle-damage',
          occurredAt: '2026-07-06T11:56:16.000Z',
          attackerName: null,
          vehicleName: 'BP_M1151_Woodland_C_2145676688',
          weapon: 'BP_BTR82A_RUS_2A72_AP_C_2145664355',
          damage: 25.83,
          healthRemaining: 262.84,
          destroyed: false
        },
        {
          type: 'vehicle-damage',
          occurredAt: '2026-07-06T11:56:20.000Z',
          attackerName: null,
          vehicleName: 'BP_CPV_Transport_Blue_C_2147481862',
          weapon: 'BP_Explosives_Damagetype_C',
          damage: 500,
          healthRemaining: null,
          destroyed: false
        },
        {
          type: 'vehicle-destroyed',
          occurredAt: '2026-07-06T11:56:20.000Z',
          attackerName: null,
          vehicleName: 'BP_CPV_Transport_Blue_C_2147481862',
          weapon: 'BP_Deployable_TNT_600g_Explosive_Timed_C_2146147035',
          damage: 500,
          healthRemaining: 0,
          destroyed: true
        }
      ]
    }
  };
}

function buildActivitySessionDetailWithPlayers(totalPlayers: number) {
  const response = buildActivitySessionDetail();
  const teams = response.session.scoreboard.teams;
  const firstTeamSize = Math.ceil(totalPlayers / 2);
  const teamSizes = [firstTeamSize, totalPlayers - firstTeamSize];

  teams.forEach((team, teamIndex) => {
    team.players = Array.from({ length: teamSizes[teamIndex] || 0 }, (_, index) => ({
      name: `Игрок ${teamIndex + 1}-${String(index + 1).padStart(2, '0')}`,
      squad: `Отряд ${Math.floor(index / 9) + 1}`,
      role: index % 3 === 0 ? 'Medic' : 'Rifleman',
      kills: teamSizes[teamIndex] - index,
      deaths: index % 8,
      revives: index % 5,
      knockdowns: teamSizes[teamIndex] - index + 2,
      teamkills: index % 17 === 0 ? 1 : 0,
      vehicleKills: index % 13 === 0 ? 1 : 0,
      vehicleDamage: index * 25
    }));
  });
  response.session.playerCount = totalPlayers;
  return response;
}

function buildRaffleSnapshot(
  overrides: {
    active?: unknown;
    history?: unknown[];
    campaign?: unknown;
    campaigns?: unknown[];
  } = {}
) {
  return {
    active:
      overrides.active === undefined
        ? {
            serverID: 2,
            prize: '1000 рублей',
            amountRubles: 1000,
            startedAt: '2026-07-15T15:00:00.000Z',
            endsAt: '2026-07-15T15:20:00.000Z',
            source: 'auto',
            participantCount: 17
          }
        : overrides.active,
    history: overrides.history || [
      {
        id: 12,
        serverID: 2,
        prize: 'VIP 7 дней',
        amountRubles: 0,
        startedAt: '2026-07-14T18:00:00.000Z',
        endedAt: '2026-07-14T18:20:00.000Z',
        participants: [
          {
            eosID: 'winner-eos',
            steamID: '76561198000000001',
            discordID: 'discord-user-42',
            name: 'Winner One',
            joinedAt: '2026-07-14T18:05:00.000Z'
          },
          {
            eosID: 'runner-eos',
            steamID: '76561198000000002',
            discordID: 'discord-user-43',
            name: 'Runner_Up_With_An_Extremely_Long_Squad_Nickname_Without_Breaks',
            joinedAt: '2026-07-14T18:06:00.000Z'
          }
        ],
        winner: {
          eosID: 'winner-eos',
          steamID: '76561198000000001',
          discordID: 'discord-user-42',
          name: 'Winner One',
          joinedAt: '2026-07-14T18:05:00.000Z'
        },
        startedBy: null,
        source: 'manual'
      },
      {
        id: 11,
        serverID: 2,
        prize: '500 рублей',
        amountRubles: 500,
        startedAt: '2026-07-13T19:00:00.000Z',
        endedAt: '2026-07-13T19:20:00.000Z',
        participants: [],
        winner: null,
        startedBy: null,
        source: 'auto'
      }
    ],
    budget: {
      limitRubles: 20000,
      spentRubles: 1500,
      remainingRubles: 18500
    },
    campaign:
      overrides.campaign === undefined ? JULY_RAFFLE_CAMPAIGN : overrides.campaign,
    ...(overrides.campaigns === undefined ? {} : { campaigns: overrides.campaigns })
  };
}

async function fulfillJson(route: Route, payload: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

async function expectPlayerFriendlyLanguage(page: Page) {
  const visibleText = await page.locator('body').innerText();
  expect(visibleText).not.toMatch(
    /\b(snapshot|raffle|exporter|endpoint|autoconnect|diff|dry-run|sl|cmd|squadjs\d*)\b|снимок|экспортер|коннектор|текущая цель|боевой режим|mdj/i
  );
}

async function mockAutoseedApi(
  page: Page,
  counters?: { joinLinkRequests: number },
  config = runtimeConfig,
  options: {
    squadjs2TeamBalancer?: unknown;
    squadjs2Activity?: unknown;
    squadjs2ActivitySessions?: Record<string, unknown>;
    squadjs2ActivitySessionRequests?: string[];
    matchExportRequests?: Array<{
      sessionId: string;
      format: 'json' | 'csv';
      authorization: string | null;
    }>;
  } = {}
) {
  await page.route('**/runtime-config.json', (route) => fulfillJson(route, config));
  await page.route('**/mock/**/events', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'text/plain; charset=utf-8',
      body: 'sse unavailable in test'
    })
  );
  await page.route('**/mock/squadjs1/snapshot', (route) =>
    fulfillJson(
      route,
      buildSnapshot({
        id: 1,
        code: 'squadjs1',
        name: '[RU] BSS Classic',
        playerCount: 24,
        maxPlayers: 100,
        queueLength: 0,
        online: false
      })
    )
  );
  await page.route('**/mock/squadjs2/snapshot', (route) =>
    fulfillJson(
      route,
      buildSnapshot({
        id: 2,
        code: 'squadjs2',
        name: '[RU] BSS Spec Ops',
        playerCount: 56,
        maxPlayers: 100,
        queueLength: 2,
        online: true,
        teamBalancer: options.squadjs2TeamBalancer ?? null,
        activity: options.squadjs2Activity ?? null
      })
    )
  );
  await page.route('**/mock/squadjs2/activity/sessions/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const pathParts = requestUrl.pathname.split('/').filter(Boolean);
    const isExport = pathParts.at(-1) === 'export';
    const sessionId = decodeURIComponent(pathParts.at(isExport ? -2 : -1) || '');

    if (isExport) {
      const format = requestUrl.searchParams.get('format') === 'csv' ? 'csv' : 'json';
      const authorization = route.request().headers().authorization || null;
      options.matchExportRequests?.push({ sessionId, format, authorization });
      if (authorization !== 'Bearer test-export-password') {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'Unauthorized' })
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: format === 'csv' ? 'text/csv' : 'application/json',
        headers: {
          'Content-Disposition': `attachment; filename="match-${sessionId}.${format}"`
        },
        body:
          format === 'csv'
            ? '"SteamID","Nickname"\r\n"76561190000000001","Winner Player"\r\n'
            : JSON.stringify({
                ok: true,
                players: [{ steamID: '76561190000000001', name: 'Winner Player' }],
                events: { kills: [], damage: [], knockdowns: [], revives: [], vehicles: [] }
              })
      });
      return;
    }

    options.squadjs2ActivitySessionRequests?.push(sessionId);
    const payload = options.squadjs2ActivitySessions?.[sessionId];
    if (!payload) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Session not found' })
      });
      return;
    }
    await fulfillJson(route, payload);
  });
  await page.route('**/mock/squadjs1/join-link', (route) =>
    fulfillJson(route, {
      ok: true,
      timestamp: BASE_TIME,
      serverId: 1,
      serverCode: 'squadjs1',
      serverName: '[RU] BSS Classic',
      joinLink: REDIRECT_TARGET_URL
    })
  );
  await page.route('**/mock/squadjs2/join-link', async (route) => {
    if (counters) counters.joinLinkRequests += 1;
    await fulfillJson(route, {
      ok: true,
      timestamp: BASE_TIME,
      serverId: 2,
      serverCode: 'squadjs2',
      serverName: '[RU] BSS Spec Ops',
      joinLink: REDIRECT_TARGET_URL
    });
  });
  await page.route('**/redirect-target', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html><body><main data-testid="redirect-target">Точка перехода</main></body></html>'
    })
  );
}

async function mockLeaderboardApi(
  page: Page,
  options: {
    status?: 'ok' | 'partial' | 'empty';
    stale?: boolean;
    empty?: boolean;
    factsCoverage?: number | null;
    minimumMatches?: number;
    rulesVersion?: string;
  } = {}
) {
  await mockAutoseedApi(page, undefined, leaderboardsRuntimeConfig);
  await page.route('**/mock/leaderboards**', (route) => {
    const requestUrl = new URL(route.request().url());
    const period = requestUrl.searchParams.get('period') || 'day';
    const role = requestUrl.searchParams.get('role') || 'player';
    const squadSize = role === 'squad_leader' || role === 'player'
      ? requestUrl.searchParams.get('squadSize') || 'full'
      : null;
    const defaultPeriodIds = {
      day: '2026-07-26',
      week: '2026-07-20',
      month: '2026-07'
    };
    const periodId =
      requestUrl.searchParams.get('periodId') ||
      defaultPeriodIds[period as keyof typeof defaultPeriodIds] ||
      '2026-07-26';
    const playerNames =
      period === 'week'
        ? [
            'Weekly Hero',
            'Weekly Medic',
            'Weekly Anchor',
            'Weekly Scout',
            'Weekly Driver',
            'Weekly Sapper',
            'Weekly Rifleman'
          ]
        : [
            'Top Fragger',
            'Helpful Medic',
            'Steady Rifleman',
            'Armor Hunter',
            'Patient Sapper',
            'Fast Driver',
            'Careful Scout'
          ];
    const names =
      role === 'commander'
        ? [
            'Commander Atlas',
            'Commander Nova',
            'Commander Mira',
            'Commander Fox',
            'Commander Wolf',
            'Commander Eagle',
            'Commander Raven'
          ]
        : role === 'squad_leader'
          ? [
              'Squad Lead Alpha',
              'Squad Lead Bravo',
              'Squad Lead Charlie',
              'Squad Lead Delta',
              'Squad Lead Echo',
              'Squad Lead Foxtrot',
              'Squad Lead Golf'
            ]
          : playerNames;
    const achievements =
      role === 'commander'
        ? [
            {
              code: 'no_wins_today',
              title: 'Не сегодня',
              description: 'Провёл дневной порог матчей без побед.',
              reason: 'За день сыграно 3 зачётных матча, побед — 0.',
              value: 0,
              threshold: 0,
              comparison: 'eq'
            }
          ]
        : [
            {
              code: 'against_odds',
              title: 'Вопреки',
              description: 'Высокий результат на более слабой стороне.',
              reason: 'Разрыв часов −380, вклад 5,4 за 90 минут.',
              value: 5.4,
              threshold: 4.8,
              comparison: 'gte'
            }
          ];
    const minimumMatches =
      options.minimumMatches ?? (period === 'month' ? 50 : period === 'week' ? 9 : 2);
    const rulesVersion = options.rulesVersion ?? 'observed-impact-v5';
    const entries = names.map((name, index) => ({
      rank: index + 1,
      name,
      matches: period === 'month' ? 52 + index : period === 'week' ? 10 + index : 4 + index,
      activeMinutes: role === 'player' ? 240 + index * 20 : null,
      personHours: role === 'squad_leader' ? 40 + index * 5 : null,
      indicators:
        role === 'commander'
          ? {
              winRate: 0.75 - index * 0.05,
              averageSurprise: 0.18 - index * 0.02,
              averageHoursGap: -430 + index * 100
            }
          : role === 'squad_leader'
            ? {
                kd: 2.29 - index * 0.1,
                knockdownsPer100PersonHours: 34 - index,
                revivesPer100PersonHours: 12 - index
              }
            : {
                resourceSwingPer90: 5.4 - index * 0.3,
                resourceSwing: 18 - index,
                temporaryPressurePer90: 2.2 - index * 0.1,
                combatConversion: 0.78 - index * 0.02
              },
      totals:
        role === 'commander'
          ? { wins: 3, losses: 1, strengthMatches: 4 }
          : {
              confirmedEnemyDeaths: 22 - index,
              successfulRevives: 8 + index,
              ownDeaths: 12 + index,
              teamkills: 0,
              knockdowns: 28 - index,
              vehicleDamage: 120 * index,
              vehicleKills: index === 3 ? 1 : 0
            },
      style:
        role === 'commander'
          ? {
              averageTeamKd: 1.2,
              averageDeaths: 104,
              averageWinningTicketMargin: 64,
              combinations: 3
            }
          : {},
      dataQuality: { strengthMatches: 4 },
      achievements: index === 0 ? achievements : []
    }));
    const startAt =
      period === 'month'
        ? '2026-06-30T21:00:00.000Z'
        : period === 'week'
          ? '2026-07-19T21:00:00.000Z'
          : '2026-07-25T21:00:00.000Z';
    const endAt =
      period === 'month'
        ? '2026-07-31T21:00:00.000Z'
        : period === 'week'
          ? '2026-07-26T21:00:00.000Z'
          : '2026-07-26T21:00:00.000Z';
    const sortKeys =
      role === 'commander'
        ? ['winRate', 'averageSurprise', 'weakSideHoursGap', 'matches', 'name']
        : role === 'squad_leader'
          ? [
              'kd',
              'knockdownsPer100PersonHours',
              'revivesPer100PersonHours',
              'matches',
              'name'
            ]
          : [
              'resourceSwingPer90',
              'resourceSwing',
              'temporaryPressurePer90',
              'combatConversion',
              'matches',
              'name'
            ];
    const metricLabels: Record<string, string> = {
      resourceSwingPer90: 'Полезный размен за 90 минут',
      resourceSwing: 'Полезный размен за период',
      temporaryPressurePer90: 'Ноки без убийства за 90 минут',
      combatConversion: 'Засчитанные убийства к нокам',
      kd: 'K/D отряда',
      knockdownsPer100PersonHours: 'Ноки на 100 человеко-часов',
      revivesPer100PersonHours: 'Поднятия на 100 человеко-часов',
      winRate: 'Процент побед',
      averageSurprise: 'Результат сверх ожидания',
      averageHoursGap: 'Разница среднего числа часов в Squad у игроков сторон',
      weakSideHoursGap: 'Игра менее опытной стороной',
      matches: 'Число зачётных матчей',
      name: 'Имя участника'
    };
    const methodologyAchievements =
      role === 'player'
        ? [
            {
              code: 'against_odds',
              title: 'Вопреки',
              description:
                'Показывает сильный результат на стороне, у игроков которой в среднем меньше часов в Squad, чем у соперника.',
              criteria:
                'У игроков стороны в среднем было меньше часов в Squad, чем у соперника, а полезный размен вошёл в лучшие 20%.'
            },
            {
              code: 'locomotive',
              title: 'Локомотив',
              description:
                'Даёт одну из самых больших долей засчитанных убийств и поднятий своей стороны.',
              criteria: 'Доля вошла в лучшие 10% сопоставимой группы.'
            },
            {
              code: 'armor_piercer',
              title: 'Бронебойщик',
              description:
                'Входит в число лучших по подтверждённому урону или уничтожениям техники.',
              criteria:
                'Урон вошёл в лучшие 10% при не менее чем 50 событиях и 80% подтверждённых источников либо уничтожения вошли в лучшие 10% при не менее чем 20 случаях и таком же покрытии.'
            }
          ]
        : [];

    const responseEntries = options.empty ? [] : entries;
    const pendingEntries = options.empty
      ? []
      : [
          {
            rank: null,
            name: 'Almost Qualified',
            matches: Math.max(0, minimumMatches - 1),
            qualified: false,
            matchesNeeded: 1,
            indicators: entries[0]?.indicators || {},
            totals: {},
            style: {},
            dataQuality: {},
            achievements: []
          }
        ];
    return fulfillJson(route, {
      status: options.status || 'ok',
      available: true,
      stale: options.stale === true,
      rulesVersion,
      revision: 'e2e-role-snapshot',
      scope: 'public',
      period,
      periodId,
      role,
      squadSize,
      timeZone: 'Europe/Moscow',
      startAt,
      endAt,
      minimumMatches,
      generatedAt: '2026-07-26T11:55:00.000Z',
      dataThrough: '2026-07-26T11:50:00.000Z',
      dataQuality: {
        sourceMatches: 64,
        achievementHistoryMatches: 180,
        factsCoverage: options.factsCoverage === undefined ? 1 : options.factsCoverage,
        hoursCoverage: 0.88,
        hoursCoverageThreshold: 0.8,
        vehicleAttribution: {
          eventCoverage: 0.84,
          destructionCoverage: 0.82,
          damageAvailable: true,
          killsAvailable: true
        }
      },
      progress: {
        candidates: 24,
        qualified: responseEntries.length,
        minimumMatches
      },
      ranking: {
        sortKeys
      },
      methodology: {
        rulesVersion,
        role,
        roleTitle:
          role === 'commander'
            ? 'Командиры'
            : role === 'squad_leader'
              ? 'Сквадные'
              : 'Игроки',
        summary:
          role === 'player'
            ? 'Личные показатели сравниваются внутри выбранного размера отряда.'
            : 'Место строится только по наблюдаемым событиям выбранной роли.',
        participation:
          role === 'player'
            ? [
                'Время и события остаются в той размерности отряда, где были набраны.'
              ]
            : ['Матч должен пройти условия зачёта роли.'],
        achievementRules: [
          'Ачивки не дают очков и не меняют место в топе.'
        ],
        limitations: [
          'Логистика, строительство и связь пока не измеряются.',
          'Техника не влияет на место в основном топе. Для урона нужно не меньше 50 событий, для уничтожений — не меньше 20 случаев; источник должен быть подтверждён минимум у 80% событий.'
        ],
        ranking: sortKeys.map((key) => ({
          key,
          label: metricLabels[key] || 'Дополнительный показатель',
          description:
            key === 'resourceSwingPer90'
              ? 'Засчитанные убийства и поднятия минус смерти и тимкиллы.'
              : 'Следующий показатель при равенстве предыдущего.'
        })),
        formulas:
          role === 'player'
            ? [
                {
                  label: 'Полезный размен',
                  expression:
                    'засчитанные убийства + поднятия − смерти − тимкиллы',
                  description: 'Нок и смерть считаются одним эпизодом.'
                }
              ]
            : [
                {
                  label: 'Порядок сравнения',
                  expression: 'показатели сравниваются слева направо',
                  description: 'Следующий нужен только при равенстве.'
                }
              ],
        achievements: methodologyAchievements
      },
      achievements: {
        comparisonGroupSize: 42,
        minimumComparisonGroup: 10
      },
      totalEntries: responseEntries.length,
      truncated: false,
      entries: responseEntries,
      totalPendingEntries: pendingEntries.length,
      pendingTruncated: false,
      pendingEntries
    });
  });
}

async function mockRaffleAutoseedApi(
  page: Page,
  overrides: {
    squad1Raffles?: unknown;
    squad2Raffles?: unknown;
  } = {}
) {
  await page.route('**/runtime-config.json', (route) => fulfillJson(route, runtimeConfig));
  await page.route('**/mock/**/events', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'text/plain; charset=utf-8',
      body: 'sse unavailable in test'
    })
  );
  await page.route('**/mock/squadjs1/snapshot', (route) =>
    fulfillJson(
      route,
      buildSnapshot({
        id: 1,
        code: 'squadjs1',
        name: '[RU] BSS Classic',
        playerCount: 24,
        maxPlayers: 100,
        queueLength: 0,
        online: false,
        raffles:
          overrides.squad1Raffles === undefined
            ? buildRaffleSnapshot({
                active: null,
                history: [],
                campaign: null,
                campaigns: [JULY_RAFFLE_CAMPAIGN, AUGUST_RAFFLE_CAMPAIGN]
              })
            : overrides.squad1Raffles
      })
    )
  );
  await page.route('**/mock/squadjs2/snapshot', (route) =>
    fulfillJson(
      route,
      buildSnapshot({
        id: 2,
        code: 'squadjs2',
        name: '[RU] BSS Spec Ops',
        playerCount: 56,
        maxPlayers: 100,
        queueLength: 2,
        online: true,
        raffles:
          overrides.squad2Raffles === undefined
            ? buildRaffleSnapshot()
            : overrides.squad2Raffles
      })
    )
  );
  await page.route('**/mock/squadjs1/join-link', (route) =>
    fulfillJson(route, {
      ok: true,
      timestamp: BASE_TIME,
      serverId: 1,
      serverCode: 'squadjs1',
      serverName: '[RU] BSS Classic',
      joinLink: REDIRECT_TARGET_URL
    })
  );
  await page.route('**/mock/squadjs2/join-link', (route) =>
    fulfillJson(route, {
      ok: true,
      timestamp: BASE_TIME,
      serverId: 2,
      serverCode: 'squadjs2',
      serverName: '[RU] BSS Spec Ops',
      joinLink: REDIRECT_TARGET_URL
    })
  );
}

async function mockTestModeAutoseedApi(
  page: Page,
  counters: { firstJoinLinkRequests: number; secondJoinLinkRequests: number }
) {
  let currentTimestamp = BASE_TIME;
  const nextTimestamp = () => {
    currentTimestamp += 1000;
    return currentTimestamp;
  };

  await page.route('**/runtime-config.json', (route) => fulfillJson(route, testModeRuntimeConfig));
  await page.route('**/mock/**/events', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'text/plain; charset=utf-8',
      body: 'sse unavailable in test'
    })
  );
  await page.route('**/mock/squadjs1/snapshot', (route) =>
    fulfillJson(
      route,
      buildSnapshot({
        id: 1,
        code: 'squadjs1',
        name: '[RU] BSS Classic',
        playerCount: 24,
        maxPlayers: 100,
        queueLength: 0,
        online: true,
        timestamp: nextTimestamp()
      })
    )
  );
  await page.route('**/mock/squadjs2/snapshot', (route) =>
    fulfillJson(
      route,
      buildSnapshot({
        id: 2,
        code: 'squadjs2',
        name: '[RU] BSS Spec Ops',
        playerCount: 56,
        maxPlayers: 100,
        queueLength: 2,
        online: true,
        timestamp: nextTimestamp()
      })
    )
  );
  await page.route('**/mock/squadjs1/join-link', async (route) => {
    counters.firstJoinLinkRequests += 1;
    await fulfillJson(route, {
      ok: true,
      timestamp: BASE_TIME,
      serverId: 1,
      serverCode: 'squadjs1',
      serverName: '[RU] BSS Classic',
      joinLink: REDIRECT_TARGET_URL
    });
  });
  await page.route('**/mock/squadjs2/join-link', async (route) => {
    counters.secondJoinLinkRequests += 1;
    await fulfillJson(route, {
      ok: true,
      timestamp: BASE_TIME,
      serverId: 2,
      serverCode: 'squadjs2',
      serverName: '[RU] BSS Spec Ops',
      joinLink: REDIRECT_TARGET_URL
    });
  });
  await page.route('**/redirect-target', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html><body><main data-testid="redirect-target">Точка перехода</main></body></html>'
    })
  );
}

async function mockProductionSwitchAutoseedApi(
  page: Page,
  counters: { serverOneJoinLinkRequests: number; serverTwoJoinLinkRequests: number },
  snapshotState: { serverOnePlayers: number; serverTwoPlayers: number }
) {
  let currentTimestamp = Date.now();
  const nextTimestamp = () => {
    currentTimestamp += 1000;
    return currentTimestamp;
  };

  await page.route('**/runtime-config.json', (route) =>
    fulfillJson(route, productionSwitchRuntimeConfig)
  );
  await page.route('**/mock/**/events', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'text/plain; charset=utf-8',
      body: 'sse unavailable in test'
    })
  );
  await page.route('**/mock/squadjs1/snapshot', (route) =>
    fulfillJson(
      route,
      buildSnapshot({
        id: 1,
        code: 'squadjs1',
        name: '[RU] BSS Classic',
        playerCount: snapshotState.serverOnePlayers,
        maxPlayers: 100,
        queueLength: 0,
        online: true,
        timestamp: nextTimestamp()
      })
    )
  );
  await page.route('**/mock/squadjs2/snapshot', (route) =>
    fulfillJson(
      route,
      buildSnapshot({
        id: 2,
        code: 'squadjs2',
        name: '[RU] BSS Spec Ops',
        playerCount: snapshotState.serverTwoPlayers,
        maxPlayers: 100,
        queueLength: 2,
        online: true,
        timestamp: nextTimestamp()
      })
    )
  );
  await page.route('**/mock/squadjs1/join-link', async (route) => {
    counters.serverOneJoinLinkRequests += 1;
    await fulfillJson(route, {
      ok: true,
      timestamp: BASE_TIME,
      serverId: 1,
      serverCode: 'squadjs1',
      serverName: '[RU] BSS Classic',
      joinLink: REDIRECT_TARGET_URL
    });
  });
  await page.route('**/mock/squadjs2/join-link', async (route) => {
    counters.serverTwoJoinLinkRequests += 1;
    await fulfillJson(route, {
      ok: true,
      timestamp: BASE_TIME,
      serverId: 2,
      serverCode: 'squadjs2',
      serverName: '[RU] BSS Spec Ops',
      joinLink: REDIRECT_TARGET_URL
    });
  });
  await page.route('**/redirect-target', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html><body><main data-testid="redirect-target">Точка перехода</main></body></html>'
    })
  );
}

async function mockPriorityAutoseedApi(
  page: Page,
  snapshotState: { mixPlayers: number; specOpsPlayers: number; invasionPlayers: number }
) {
  let currentTimestamp = Date.now();
  const nextTimestamp = () => {
    currentTimestamp += 1000;
    return currentTimestamp;
  };

  await page.route('**/runtime-config.json', (route) => fulfillJson(route, priorityRuntimeConfig));
  await page.route('**/mock/**/events', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'text/plain; charset=utf-8',
      body: 'sse unavailable in test'
    })
  );
  await page.route('**/mock/mix/snapshot', (route) =>
    fulfillJson(
      route,
      buildSnapshot({
        id: 1,
        code: 'mix',
        name: '[RU] BSS Mix',
        playerCount: snapshotState.mixPlayers,
        maxPlayers: 100,
        queueLength: 0,
        online: true,
        timestamp: nextTimestamp()
      })
    )
  );
  await page.route('**/mock/specops/snapshot', (route) =>
    fulfillJson(
      route,
      buildSnapshot({
        id: 2,
        code: 'specops',
        name: '[RU] BSS Spec Ops',
        playerCount: snapshotState.specOpsPlayers,
        maxPlayers: 100,
        queueLength: 0,
        online: true,
        timestamp: nextTimestamp()
      })
    )
  );
  await page.route('**/mock/invasion/snapshot', (route) =>
    fulfillJson(
      route,
      buildSnapshot({
        id: 3,
        code: 'invasion',
        name: '[RU] BSS Invasion',
        playerCount: snapshotState.invasionPlayers,
        maxPlayers: 100,
        queueLength: 0,
        online: true,
        timestamp: nextTimestamp()
      })
    )
  );
  await page.route('**/mock/**/join-link', (route) =>
    fulfillJson(route, {
      ok: true,
      timestamp: Date.now(),
      joinLink: REDIRECT_TARGET_URL
    })
  );
}

async function mockSuccessfulPermissionCheck(page: Page) {
  await page.addInitScript(() => {
    const createPopup = () => {
      let closed = false;

      return {
        document: {
          open() {},
          write() {},
          close() {}
        },
        location: {
          href: ''
        },
        close() {
          closed = true;
        },
        focus() {},
        get closed() {
          return closed;
        }
      };
    };

    window.open = () =>
      createPopup() as unknown as Window;

    const originalCreateElement = Document.prototype.createElement;
    Document.prototype.createElement = function (
      tagName: string,
      options?: ElementCreationOptions
    ) {
      const element = originalCreateElement.call(this, tagName, options);

      if (tagName.toLowerCase() === 'iframe') {
        let currentSrc = '';

        Object.defineProperty(element, 'src', {
          configurable: true,
          get() {
            return currentSrc;
          },
          set(value) {
            currentSrc = String(value);
            window.setTimeout(() => {
              window.dispatchEvent(new Event('blur'));
            }, 0);
          }
        });
      }

      return element;
    };
  });
}

async function captureConnectorWindowMarkup(page: Page) {
  await page.addInitScript(() => {
    let markup = '';
    const popup = {
      document: {
        open() {
          markup = '';
        },
        write(value: string) {
          markup += value;
          (window as Window & { __connectorWindowMarkup?: string }).__connectorWindowMarkup = markup;
        },
        close() {}
      },
      location: { href: '' },
      closed: false,
      close() {},
      focus() {}
    };

    window.open = () => popup as unknown as Window;
  });
}

async function seedStoredAutoconnectState(
  page: Page,
  overrides?: {
    enabled?: boolean;
    mode?: 'production' | 'test';
    testSequenceDelayMs?: number;
    lastProcessedTimestamp?: number;
    cooldownUntil?: number;
    activeRedirectServerKey?: string;
  }
) {
  const storedState = {
    enabled: true,
    mode: 'production' as const,
    testSequenceDelayMs: 0,
    lastProcessedTimestamp: 0,
    cooldownUntil: 0,
    activeRedirectServerKey: '',
    permissions: {
      popupAllowed: true,
      steamProtocolReady: true,
      checkedAt: BASE_TIME
    },
    ...overrides
  };

  await page.addInitScript((state) => {
    window.localStorage.setItem('steam-auto-enabled', String(state.enabled));
    window.localStorage.setItem('steam-auto-mode', state.mode);
    window.localStorage.setItem(
      'steam-auto-test-sequence-delay-ms',
      String(state.testSequenceDelayMs)
    );
    window.localStorage.setItem(
      'steam-auto-last-timestamp',
      String(state.lastProcessedTimestamp)
    );
    window.localStorage.setItem('steam-auto-cooldown-until', String(state.cooldownUntil));
    if (state.activeRedirectServerKey) {
      window.localStorage.setItem(
        'steam-auto-active-redirect-server-key',
        state.activeRedirectServerKey
      );
    } else {
      window.localStorage.removeItem('steam-auto-active-redirect-server-key');
    }
    window.localStorage.setItem('steam-auto-permissions', JSON.stringify(state.permissions));
  }, storedState);
}

test('renders the localized control room from exporter snapshots', async ({ page }) => {
  await mockAutoseedApi(page);

  await page.goto('./');

  await expect(page.getByTestId('hero-title')).toHaveText('Автосид BSS');
  await expect(page.getByTestId('hero-glance-grid')).toBeVisible();
  await expect(page.getByTestId('overview-target')).toContainText('SPEC OPS');
  await expect(page.locator('.overview-grid')).toHaveCount(0);
  await expect(page.getByTestId('server-card-1')).toContainText('MIX');
  await expect(page.getByTestId('server-card-2')).toContainText('SPEC OPS');
  await expect(page.getByTestId('active-server-board')).toContainText('вход по запросу');
  await expect(page.getByText('Как запустить')).toBeVisible();
  await expect(page.getByText('Выбор сервера')).toBeVisible();
});

test('keeps a private event server in the journal but out of autoseed controls', async ({
  page
}) => {
  const matchExportRequests: Array<{
    sessionId: string;
    format: 'json' | 'csv';
    authorization: string | null;
  }> = [];
  const privateEventRuntimeConfig = {
    ...runtimeConfig,
    exporters: [
      ...runtimeConfig.exporters,
      {
        name: 'squadjs6',
        baseUrl: 'http://127.0.0.1:4173/mock/squadjs6'
      }
    ]
  };

  await mockAutoseedApi(page, undefined, privateEventRuntimeConfig);
  await page.route('**/mock/squadjs6/snapshot', (route) =>
    fulfillJson(
      route,
      buildSnapshot({
        id: 6,
        code: 'squadjs6',
        name: 'MDC Custom',
        playerCount: 0,
        maxPlayers: 100,
        queueLength: 0,
        online: true,
        isSeedCandidate: false,
        activity: buildActivitySnapshot()
      })
    )
  );
  await page.route('**/mock/squadjs6/activity/sessions/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const pathParts = requestUrl.pathname.split('/').filter(Boolean);
    const isExport = pathParts.at(-1) === 'export';
    const sessionId = decodeURIComponent(pathParts.at(isExport ? -2 : -1) || '');
    if (!isExport) {
      await fulfillJson(route, buildActivitySessionDetail(sessionId));
      return;
    }

    const format = requestUrl.searchParams.get('format') === 'csv' ? 'csv' : 'json';
    const authorization = route.request().headers().authorization || null;
    matchExportRequests.push({ sessionId, format, authorization });
    if (authorization !== 'Bearer test-export-password') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Unauthorized' })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: format === 'csv' ? 'text/csv' : 'application/json',
      headers: {
        'Content-Disposition': `attachment; filename="match-${sessionId}.${format}"`
      },
      body:
        format === 'csv'
          ? '"SteamID","Nickname"\r\n"76561190000000001","Winner Player"\r\n'
          : JSON.stringify({
              ok: true,
              players: [{ steamID: '76561190000000001', name: 'Winner Player' }],
              events: { kills: [], damage: [], knockdowns: [], revives: [], vehicles: [] }
            })
    });
  });

  await page.goto('./');

  await expect(page.getByTestId('server-card-6')).toHaveCount(0);
  await expect(page.getByTestId('overview-target')).toContainText('SPEC OPS');

  await page.goto('./#journal?server=squadjs6');

  await expect(page.getByTestId('journal-server-6')).toBeVisible();
  await expect(page.getByTestId('journal-server-6')).toContainText('MDC CUSTOM');
  await expect(page.getByTestId('journal-match-export')).toContainText(
    'SteamID доступен только в защищённых файлах'
  );
  await page.getByTestId('journal-match-export-password').fill('test-export-password');

  const csvDownloadPromise = page.waitForEvent('download');
  await page.getByTestId('journal-match-export-csv').click();
  const csvDownload = await csvDownloadPromise;
  expect(csvDownload.suggestedFilename()).toBe(`match-${NARVA_SESSION_ID}.csv`);

  const jsonDownloadPromise = page.waitForEvent('download');
  await page.getByTestId('journal-match-export-json').click();
  const jsonDownload = await jsonDownloadPromise;
  expect(jsonDownload.suggestedFilename()).toBe(`match-${NARVA_SESSION_ID}.json`);
  expect(matchExportRequests).toEqual([
    {
      sessionId: NARVA_SESSION_ID,
      format: 'csv',
      authorization: 'Bearer test-export-password'
    },
    {
      sessionId: NARVA_SESSION_ID,
      format: 'json',
      authorization: 'Bearer test-export-password'
    }
  ]);
});

test('shows the MDC export waiting state before the first completed match', async ({ page }) => {
  const privateEventRuntimeConfig = {
    ...runtimeConfig,
    exporters: [
      ...runtimeConfig.exporters,
      {
        name: 'squadjs6',
        baseUrl: 'http://127.0.0.1:4173/mock/squadjs6'
      }
    ]
  };
  const emptyActivity = buildActivitySnapshot();
  emptyActivity.sessions = [];
  emptyActivity.recentRounds = [];
  emptyActivity.topWindow = {
    ...emptyActivity.topWindow,
    roundCount: 0,
    requiredParticipation: 0,
    entries: []
  };
  emptyActivity.killfeed = {
    ...emptyActivity.killfeed,
    rounds: [],
    events: []
  };

  await mockAutoseedApi(page, undefined, privateEventRuntimeConfig);
  await page.route('**/mock/squadjs6/snapshot', (route) =>
    fulfillJson(
      route,
      buildSnapshot({
        id: 6,
        code: 'squadjs6',
        name: 'MDC Custom',
        playerCount: 0,
        maxPlayers: 100,
        queueLength: 0,
        online: true,
        isSeedCandidate: false,
        activity: emptyActivity
      })
    )
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#journal?server=squadjs6');

  const exportPanel = page.getByTestId('journal-match-export');
  await expect(exportPanel).toBeVisible();
  await expect(exportPanel).toHaveAttribute('data-export-state', 'waiting-for-match');
  await expect(exportPanel).toContainText('Выгрузка матчей MDC');
  await expect(exportPanel).toContainText('После первого завершённого матча');
  await expect(page.getByTestId('journal-match-export-password')).toHaveCount(0);
  await expect(page.getByTestId('journal-match-export-csv')).toHaveCount(0);
  await expect(page.getByTestId('journal-match-export-json')).toHaveCount(0);
});

test('hides the VIP purchase link when the runtime config does not provide a URL', async ({
  page
}) => {
  await mockAutoseedApi(page);

  await page.goto('./');

  await expect(page.getByTestId('vip-shop-nav-link')).toHaveCount(0);
});

test('hides the main site link when the runtime config does not provide a URL', async ({
  page
}) => {
  await mockAutoseedApi(page);

  await page.goto('./');

  await expect(page.getByTestId('site-nav-link')).toHaveCount(0);
});

test('renders a safe responsive link to the main site from runtime config', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockAutoseedApi(page, undefined, siteRuntimeConfig);

  await page.goto('./');

  const siteLink = page.getByRole('link', { name: 'Сайт BSS' });
  await expect(siteLink).toBeVisible();
  await expect(siteLink).toHaveAttribute('href', 'https://squad.leo-land.ru/');
  await expect(siteLink).toHaveAttribute('target', '_blank');
  await expect(siteLink).toHaveAttribute('rel', /noopener/);
  await expect(siteLink).toHaveAttribute('rel', /noreferrer/);

  const pageFitsViewport = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );
  expect(pageFitsViewport).toBe(true);
});

test('renders the VIP purchase link from runtime config', async ({ page }) => {
  await mockAutoseedApi(page, undefined, vipShopRuntimeConfig);

  await page.goto('./');

  const vipLink = page.getByRole('link', { name: 'VIP' });
  await expect(vipLink).toBeVisible();
  await expect(vipLink).toHaveAttribute('href', 'https://vip.example.test/shop');
  await expect(vipLink).toHaveAttribute('target', '_blank');
  await expect(vipLink).toHaveAttribute('rel', /noreferrer/);
});

test('normalizes exporter v3 fixtures and follows Mix Spec Ops Invasion priority', async ({
  page
}) => {
  await page.clock.setFixedTime('2026-07-15T12:00:00.000Z');
  await mockPriorityAutoseedApi(page, {
    mixPlayers: 40,
    specOpsPlayers: 45,
    invasionPlayers: 49
  });

  await page.goto('./');

  await expect(page.getByTestId('overview-target')).toContainText('MIX');
  await expect(page.getByTestId('server-card-1')).toContainText('MIX');
  await expect(page.getByTestId('server-card-2')).toContainText('SPEC OPS');
  await expect(page.getByTestId('server-card-3')).toContainText('INVASION');
});

test('keeps strict priority even when a later server is stronger', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-15T12:00:00.000Z');
  const snapshotState = {
    mixPlayers: 60,
    specOpsPlayers: 70,
    invasionPlayers: 20
  };
  await mockPriorityAutoseedApi(page, snapshotState);

  await page.goto('./');
  await expect(page.getByTestId('overview-target')).toContainText('MIX');

  snapshotState.specOpsPlayers = 71;
  await page.getByTestId('refresh-snapshot-button').click();

  await expect(page.getByTestId('overview-target')).toContainText('MIX');
});

test('skips a priority server that has reached the seed limit', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-15T12:00:00.000Z');
  await mockPriorityAutoseedApi(page, {
    mixPlayers: 80,
    specOpsPlayers: 25,
    invasionPlayers: 10
  });

  await page.goto('./');

  await expect(page.getByTestId('overview-target')).toContainText('SPEC OPS');
});

test('ignores the legacy night schedule and keeps Mix first at night', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-14T22:30:00.000Z');
  await mockPriorityAutoseedApi(page, {
    mixPlayers: 20,
    specOpsPlayers: 10,
    invasionPlayers: 5
  });

  await page.goto('./');

  await expect(page.getByTestId('overview-target')).toContainText('MIX');
});

test('renders an empty Team Balancer state when no fresh report exists', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-06T12:01:00.000Z');
  await mockAutoseedApi(page);

  await page.goto('./#balance');

  const panel = page.getByTestId('balance-server-2').getByTestId('team-balancer-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Баланс сторон');
  await expect(panel).toContainText('Расчёт баланса пока не получен');
  await expect(panel).toContainText('Данные управления ещё не получены');
  await expect(panel).not.toContainText('!автобаланс');
  await expect(panel).not.toContainText('snapshot');
  await expect(panel).not.toContainText('7656119');
  await expect(page.getByTestId('team-balancer-round-signals')).toHaveCount(0);
  await expectPlayerFriendlyLanguage(page);
});

test('renders healthy Team Balancer state without proposal rows', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-06T12:01:00.000Z');
  await mockAutoseedApi(page, undefined, runtimeConfig, {
    squadjs2TeamBalancer: buildTeamBalancerProposalSnapshot({
      action: 'noop',
      result: 'balanced',
      reasonCodes: ['team_size_within_tolerance'],
      signals: {
        triggerReason: 'team_size_within_tolerance',
        teamSize: {
          before: { 1: 40, 2: 39 },
          after: { 1: 40, 2: 39 },
          diffBefore: 1,
          diffAfter: 1
        },
        winStreak: null,
        ticketDiff: null,
        recentRoundSeverity: null
      },
      cohorts: [],
      players: []
    })
  });

  await page.goto('./#balance');

  const panel = page.getByTestId('balance-server-2').getByTestId('team-balancer-panel');
  await expect(panel).toContainText('Без изменений');
  await expect(panel).toContainText('сейчас 40:39 · по расчёту 40:39');
  await expect(panel).not.toContainText('Импакт');
  await expect(panel).not.toContainText('Сила сторон');
  await expect(page.getByTestId('team-balancer-round-signals')).toHaveCount(0);
  await expect(page.getByTestId('team-balancer-diff-row')).toHaveCount(0);
  await expectPlayerFriendlyLanguage(page);
});

test('does not imply a future operation while automatic balancing is disabled', async ({
  page
}) => {
  await page.clock.setFixedTime('2026-07-06T12:01:00.000Z');
  await mockAutoseedApi(page, undefined, runtimeConfig, {
    squadjs2TeamBalancer: buildTeamBalancerProposalSnapshot({
      mode: 'execute',
      action: 'blocked',
      result: 'blocked',
      reasonCodes: ['auto_balance_disabled'],
      control: {
        enabled: false,
        updatedAt: '2026-07-06T11:58:00.000Z',
        activeVote: null
      },
      execution: {
        enabled: true,
        status: 'pending',
        plannedMoves: 1,
        plannedPlayers: 2,
        attemptedPlayers: 0,
        succeededPlayers: 0,
        failedPlayers: 0,
        totalRconAttempts: 0,
        maxAttemptsPerPlayer: 1,
        completedAt: null
      }
    })
  });

  await page.goto('./#balance');

  const panel = page.getByTestId('balance-server-2').getByTestId('team-balancer-panel');
  const execution = panel.getByTestId('team-balancer-safety-execution');
  await expect(panel.getByTestId('team-balancer-control')).toContainText(
    'Автобаланс выключен'
  );
  await expect(execution).toContainText('Не запланировано');
  await expect(execution).toContainText('Автобаланс выключен');
  await expect(execution).not.toContainText('Ожидает');
});

test('renders one completed session with separate full journal categories', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-06T12:02:00.000Z');
  const sessionRequests: string[] = [];
  await mockAutoseedApi(page, undefined, runtimeConfig, {
    squadjs2Activity: buildActivitySnapshot(),
    squadjs2ActivitySessions: {
      [NARVA_SESSION_ID]: buildActivitySessionDetail(),
      [GORODOK_SESSION_ID]: buildActivitySessionDetail(GORODOK_SESSION_ID)
    },
    squadjs2ActivitySessionRequests: sessionRequests
  });

  await page.goto('./#journal');

  const workspace = page.getByTestId('journal-workspace');
  const matchPanel = workspace.locator('.journal-match-panel');
  await expect(workspace).toBeVisible();
  await expect(page.locator('.ui-server-selector')).toHaveCount(1);
  await expect(page.getByTestId('journal-server-2')).toContainText('2 матчей');
  await page.getByTestId('journal-server-2').click();
  await expect(page.getByTestId('journal-server-2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('journal-server-1')).toHaveAttribute('aria-pressed', 'false');
  await expect(workspace.locator('.journal-match-panel')).toHaveCount(1);
  await expect(workspace.locator('.journal-session-button')).toHaveCount(2);
  await expect(page.getByTestId(`journal-session-${NARVA_SESSION_ID}`)).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(matchPanel.locator('h2')).toHaveText('Narva RAAS v2');
  await expect(page.getByTestId('journal-scoreboard')).toContainText('Winner Player');
  await expect(page.getByTestId('journal-scoreboard')).toContainText('Orange · Стрелок');
  await expect(page.getByTestId('journal-scoreboard')).toContainText('Победа');
  const scoreboardHeaders = [
    'Игрок',
    'Отряд / роль',
    'Поднятия',
    'Нокауты',
    'Убийства',
    'Смерти',
    'Тимкиллы'
  ];
  await expect(page.getByTestId('journal-scoreboard').locator('thead th')).toHaveText([
    ...scoreboardHeaders,
    ...scoreboardHeaders
  ]);
  await expect(page.getByTestId('journal-scoreboard')).not.toContainText('урона технике');
  await expect(page.getByTestId('journal-scoreboard')).not.toContainText('Выбито техники');
  await expect(page.getByTestId('journal-scoreboard')).toContainText(
    'Игроки этой стороны не сохранились'
  );
  await expect(page.locator('.ui-responsive-table')).toHaveCount(2);
  await expect(page.getByTestId('journal-view-scoreboard')).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.getByTestId('journal-page')).toContainText(
    'Итоги берутся из финальной таблицы Squad'
  );
  await expect(page.getByTestId('journal-match-export')).toHaveCount(0);
  await expect.poll(() => sessionRequests).toContain(NARVA_SESSION_ID);
  await expect(page).toHaveURL(
    new RegExp(`#journal\\?server=squadjs2&session=${NARVA_SESSION_ID}&tab=scoreboard$`)
  );

  await page.getByTestId('journal-view-events').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('journal-page')).toContainText(
    'число событий не равно убийствам в итогах'
  );
  const killsTab = page.getByTestId('journal-tab-kills');
  const knockdownsTab = page.getByTestId('journal-tab-knockdowns');
  await expect(killsTab.locator('strong')).toHaveText('1');
  await expect(knockdownsTab.locator('strong')).toHaveText('1');
  await killsTab.click();
  const kills = page.getByTestId('journal-events-kills');
  await expect(kills).toContainText('Killer Alpha');
  await expect(kills).toContainText('Victim Bravo');
  await expect(kills).not.toContainText('Knockdown Charlie');
  await expect(kills).not.toContainText('Knockdown Delta');
  await expect(page).toHaveURL(/tab=kills$/);

  await knockdownsTab.click();
  const knockdowns = page.getByTestId('journal-events-knockdowns');
  await expect(knockdowns).toContainText('Knockdown Charlie');
  await expect(knockdowns).toContainText('Knockdown Delta');
  await expect(knockdowns).not.toContainText('Killer Alpha');
  await expect(page).toHaveURL(/tab=knockdowns$/);

  await page.getByTestId('journal-tab-damage').click();
  const damage = page.getByTestId('journal-events-damage');
  await expect(damage.locator('.journal-event-row')).toHaveCount(10);
  await expect(damage).toContainText('Показано 1–10 из 105');
  await expect(damage).toContainText('Страница 1 из 11');
  await expect(damage).toContainText('Damage Attacker 0');
  await expect(damage).toContainText('31,5 урона');
  await expect(damage.getByTestId('journal-timeline-intensity').locator('button')).toHaveCount(60);

  const timelinePanel = damage.getByTestId('journal-timeline-panel');
  const eventList = damage.locator('.journal-event-list');
  const timelineTop = await timelinePanel.evaluate((element) => element.getBoundingClientRect().top);
  await eventList.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => eventList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await timelinePanel.evaluate((element) => element.getBoundingClientRect().top)).toBe(timelineTop);

  await damage.getByRole('button', { name: 'Вперёд' }).click();
  await expect(damage.locator('.journal-event-row')).toHaveCount(10);
  await expect(damage).toContainText('Damage Attacker 5');
  await expect(damage).not.toContainText('Damage Attacker 0');

  await damage.getByTestId('journal-page-size').selectOption('25');
  await expect(damage.locator('.journal-event-row')).toHaveCount(25);
  await expect(damage).toContainText('Показано 1–25 из 105');
  await damage.getByTestId('journal-page-size').selectOption('all');
  await expect(damage.locator('.journal-event-row')).toHaveCount(105);
  await expect(damage).toContainText('Показано 1–105 из 105 · целиком');

  await page.getByTestId('journal-tab-vehicles').click();
  const vehicles = page.getByTestId('journal-events-vehicles');
  await expect(vehicles).toContainText('Vehicle Hunter');
  await expect(vehicles).toContainText('T72B3');
  await expect(vehicles).toContainText('420 урона');
  await expect(vehicles).toContainText('осталось 80');
  await expect(
    vehicles.locator('.journal-event-row').filter({ hasText: 'Vehicle Hunter' })
  ).toContainText('Попадание');
  await expect(vehicles.locator('.journal-event-row')).toHaveCount(5);
  await expect(page.getByTestId('journal-tab-vehicles')).toContainText('5');
  await expect(vehicles).toContainText('уничтожено: 2 · попаданий: 3');
  await expect(vehicles).toContainText('Minsk');
  await expect(vehicles).toContainText('CPV Transport Blue');
  await expect(vehicles).toContainText('Deployable TNT 600g Explosive Timed');
  await expect(
    vehicles.locator('.journal-event-row').filter({ hasText: 'Minsk' })
  ).toContainText('Fragmentation');
  await expect(
    vehicles.locator('.journal-event-row').filter({ hasText: 'M1151 Woodland №1' })
  ).toContainText('RPG28 Tandem Proj');
  await expect(
    vehicles.locator('.journal-event-row').filter({ hasText: 'M1151 Woodland №2' })
  ).toContainText('BTR82A RUS 2A72 AP');
  await expect(vehicles).toContainText('игрок не указан журналом');
  await expect(
    vehicles.locator('.journal-event-row').filter({ hasText: 'CPV Transport Blue' })
  ).toContainText('Уничтожена');
  await expect(vehicles).not.toContainText('BP_');
  await expect(vehicles).not.toContainText('DamageType');
  await expect(vehicles).not.toContainText('_C_214');
  await expect(
    vehicles.locator('.journal-event-row').filter({ hasText: 'Minsk' })
  ).not.toContainText('осталось 0');

  await page.getByTestId('journal-tab-revives').click();
  const revives = page.getByTestId('journal-events-revives');
  await expect(revives).toContainText('Medic Echo');
  await expect(revives).toContainText('Patient Foxtrot');
  expect(await page.getByTestId('journal-page').innerText()).not.toMatch(
    /private-scoreboard-player|private-killer-alpha|private-damage|76561198000000001/
  );

  await page.getByTestId(`journal-session-${GORODOK_SESSION_ID}`).click();
  await expect(matchPanel.locator('h2')).toHaveText('Gorodok Invasion v1');
  await page.getByTestId('journal-tab-kills').click();
  await expect(page.getByTestId('journal-events-kills')).toContainText('Gorodok Killer');
  await expect(page.getByTestId('journal-events-kills')).not.toContainText('Killer Alpha');
  await expect.poll(() => sessionRequests).toContain(GORODOK_SESSION_ID);
  expect(await page.getByTestId('journal-page').innerText()).not.toMatch(
    /private-gorodok-player|private-gorodok-attacker/
  );
  expect(sessionRequests.filter((sessionId) => sessionId === NARVA_SESSION_ID)).toHaveLength(1);
  expect(sessionRequests.filter((sessionId) => sessionId === GORODOK_SESSION_ID)).toHaveLength(1);
  await expectPlayerFriendlyLanguage(page);
});

for (const totalPlayers of [0, 10, 100]) {
  test(`keeps ${totalPlayers} scoreboard players controlled on a narrow screen`, async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime('2026-07-06T12:02:00.000Z');
    await mockAutoseedApi(page, undefined, runtimeConfig, {
      squadjs2Activity: buildActivitySnapshot(),
      squadjs2ActivitySessions: {
        [NARVA_SESSION_ID]: buildActivitySessionDetailWithPlayers(totalPlayers)
      }
    });

    await page.goto(
      `./#journal?server=squadjs2&session=${NARVA_SESSION_ID}&tab=scoreboard`
    );
    const scoreboard = page.getByTestId('journal-scoreboard');
    await expect(scoreboard).toBeVisible({ timeout: 10_000 });

    const playerRows = scoreboard.locator('.journal-scoreboard-player-row');
    const expectedRows = totalPlayers > 20 ? 20 : totalPlayers;
    await expect(playerRows).toHaveCount(expectedRows);

    if (totalPlayers === 0) {
      await expect(scoreboard.locator('.journal-scoreboard-empty-row')).toHaveCount(2);
      await expect(scoreboard.locator('.journal-scoreboard-controls')).toHaveCount(0);
    } else if (totalPlayers === 10) {
      await expect(scoreboard.locator('.journal-scoreboard-controls')).toHaveCount(0);
    } else {
      await expect(scoreboard.locator('.journal-scoreboard-controls')).toHaveCount(2);
      await expect(scoreboard.locator('.journal-scoreboard-pagination')).toHaveCount(2);

      const firstTeam = page.getByTestId('journal-scoreboard-team-1');
      await firstTeam.getByRole('button', { name: 'Вперёд' }).click();
      await expect(firstTeam.locator('.journal-scoreboard-pagination')).toContainText(
        'Страница 2 из 5'
      );

      const table = firstTeam.locator('.journal-table-wrap');
      const firstPlayerCell = table.locator('tbody tr').first().locator('td').first();
      const leftBefore = await firstPlayerCell.evaluate(
        (element) => element.getBoundingClientRect().left
      );
      await table.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
      const leftAfter = await firstPlayerCell.evaluate(
        (element) => element.getBoundingClientRect().left
      );
      expect(Math.abs(leftAfter - leftBefore)).toBeLessThanOrEqual(1);
      await expect(page.getByTestId('journal-page')).toContainText(
        'Листайте таблицу в сторону'
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight)
      ).toBeLessThan(5000);
    }

    await page.getByTestId('journal-view-events').click();
    const eventTabs = page.locator('.journal-tabs .journal-tab');
    await expect(eventTabs).toHaveCount(5);
    const layout = await page.evaluate(() => ({
      fits: document.documentElement.scrollWidth <= window.innerWidth + 1,
      tabsFit: [...document.querySelectorAll<HTMLElement>('.journal-tabs .journal-tab')].every(
        (entry) => {
          const box = entry.getBoundingClientRect();
          return box.left >= 0 && box.right <= window.innerWidth;
        }
      )
    }));
    expect(layout.fits).toBe(true);
    expect(layout.tabsFit).toBe(true);
    if (totalPlayers === 100) {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '125%';
      });
      const enlargedLayout = await page.evaluate(() => ({
        fits: document.documentElement.scrollWidth <= window.innerWidth + 1,
        tabsFit: [...document.querySelectorAll<HTMLElement>('.journal-tabs .journal-tab')].every(
          (entry) => {
            const box = entry.getBoundingClientRect();
            return box.left >= 0 && box.right <= window.innerWidth;
          }
        )
      }));
      expect(enlargedLayout).toEqual({ fits: true, tabsFit: true });

      await page.evaluate(() => {
        document.documentElement.style.fontSize = '';
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByTestId('journal-view-scoreboard').click();
      await expect(scoreboard.locator('.journal-scoreboard-player-row')).toHaveCount(20);
      const desktopLayout = await page.evaluate(() => ({
        fits: document.documentElement.scrollWidth <= window.innerWidth + 1,
        height: document.documentElement.scrollHeight
      }));
      expect(desktopLayout.fits).toBe(true);
      expect(desktopLayout.height).toBeLessThan(4000);
    }
  });
}

const missingLayerScenarios = [
  {
    reason: 'missing_start_event',
    message: 'Событие начала матча не записано.'
  },
  {
    reason: 'missing_end_event',
    message: 'Событие завершения матча не записано.'
  },
  {
    reason: 'unmatched_session',
    message: 'События начала и завершения матча нельзя безопасно связать.'
  },
  {
    reason: 'normalization_failed',
    message: 'Название слоя не удалось распознать; его намеренно не угадываем.'
  }
] as const;

for (const scenario of missingLayerScenarios) {
  test(`explains ${scenario.reason} without guessing or showing a technical classname`, async ({
    page
  }) => {
    const activity = buildActivitySnapshot();
    const unavailableSession = {
      ...activity.sessions[0],
      layer: null,
      layerClassname: 'Technical_Layer_Classname',
      layerSource: null,
      layerMissingReason: scenario.reason
    };
    activity.sessions[0] = unavailableSession;
    activity.recentRounds[0] = unavailableSession;
    const detail = buildActivitySessionDetail();
    detail.session = {
      ...detail.session,
      layer: null,
      layerClassname: 'Technical_Layer_Classname',
      layerSource: null,
      layerMissingReason: scenario.reason
    };

    await mockAutoseedApi(page, undefined, singleJournalServerRuntimeConfig, {
      squadjs2Activity: activity,
      squadjs2ActivitySessions: { [NARVA_SESSION_ID]: detail }
    });

    await page.goto('/#journal');

    const journalPage = page.getByTestId('journal-page');
    const matchPanel = page.getByTestId('journal-workspace').locator('.journal-match-panel');
    await expect(matchPanel.locator('h2')).toHaveText('Слой матча не сохранён');
    await expect(page.getByTestId('journal-layer-status')).toHaveText(scenario.message);
    await expect(page.getByTestId(`journal-session-${NARVA_SESSION_ID}`)).toContainText(
      'Слой матча не сохранён'
    );
    await expect(journalPage).not.toContainText('Карта не записана');
    await expect(journalPage).not.toContainText('Technical_Layer_Classname');
  });
}

test('keeps every recent match reachable through the session list scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await mockAutoseedApi(page, undefined, singleJournalServerRuntimeConfig, {
    squadjs2Activity: buildActivitySnapshotWithTenSessions(),
    squadjs2ActivitySessions: {
      [NARVA_SESSION_ID]: buildActivitySessionDetail()
    }
  });

  await page.goto('./#journal');

  const sessionList = page.locator('.journal-session-list');
  const lastSession = page.getByTestId('journal-session-session-scroll-10');
  await expect(sessionList.locator('.journal-session-button')).toHaveCount(10);
  await expect(page.locator('.journal-sidebar-head strong')).toHaveText('10 матчей');
  await expect(lastSession).not.toBeInViewport();

  const scrollMetrics = await sessionList.evaluate((element) => ({
    clientHeight: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
    scrollHeight: element.scrollHeight
  }));
  expect(scrollMetrics.overflowY).toMatch(/auto|scroll/);
  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);

  await page.evaluate(() => document.fonts.ready);
  await sessionList.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const finalMetrics = await sessionList.evaluate((element) => {
    const lastButton = element.querySelector<HTMLElement>(
      '[data-testid="journal-session-session-scroll-10"]'
    );
    if (!lastButton) return null;
    const listBounds = element.getBoundingClientRect();
    const buttonBounds = lastButton.getBoundingClientRect();
    return {
      scrollTop: element.scrollTop,
      buttonTop: buttonBounds.top - listBounds.top,
      buttonBottom: buttonBounds.bottom - listBounds.top,
      clientHeight: element.clientHeight
    };
  });
  expect(finalMetrics).not.toBeNull();
  expect(finalMetrics?.scrollTop).toBeGreaterThan(0);
  expect(finalMetrics?.buttonTop).toBeGreaterThanOrEqual(0);
  expect(finalMetrics?.buttonBottom).toBeLessThanOrEqual((finalMetrics?.clientHeight || 0) + 1);
  await expect(lastSession).toBeVisible();
});

test('restores selected server, session and category from the journal URL', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-06T12:02:00.000Z');
  await mockAutoseedApi(page, undefined, singleJournalServerRuntimeConfig, {
    squadjs2Activity: buildActivitySnapshot(),
    squadjs2ActivitySessions: {
      [NARVA_SESSION_ID]: buildActivitySessionDetail(),
      [GORODOK_SESSION_ID]: buildActivitySessionDetail(GORODOK_SESSION_ID)
    }
  });

  await page.goto(
    `/#journal?server=squadjs2&session=${GORODOK_SESSION_ID}&tab=vehicles`
  );

  await expect(page.getByTestId('journal-server-2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(`journal-session-${GORODOK_SESSION_ID}`)).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByTestId('journal-tab-vehicles')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('journal-events-vehicles')).toContainText('Gorodok LAT');
  await expect(page.getByTestId('journal-events-vehicles')).toContainText('BTR82A');
  await expect(page.getByTestId('journal-page')).not.toContainText('Vehicle Hunter');
});

test('keeps the completed-game journal discoverable before session data arrives', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-06T12:02:00.000Z');
  await mockAutoseedApi(page);

  await page.goto('./#journal');

  const workspace = page.getByTestId('journal-workspace');
  await expect(workspace).toBeVisible();
  await expect(workspace).toContainText('Завершённых матчей ещё нет');
  await expect(workspace).toContainText('Выберите завершённый матч');
  await expect(workspace).toContainText(
    'Итоги и события никогда не показываются до окончания игры'
  );
  await expect(workspace).not.toContainText('snapshot');
  await expect(workspace).not.toContainText('exporter');
  await expect(workspace).not.toContainText('endpoint');
});

test('shows only round-end execution attempts without inventing successful routes', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-06T12:02:00.000Z');
  const execution = (status: 'completed' | 'failed' | 'partial_failed', succeededPlayers: number) => ({
    enabled: true,
    status,
    plannedMoves: 1,
    plannedPlayers: 4,
    attemptedPlayers: 4,
    succeededPlayers,
    failedPlayers: 4 - succeededPlayers,
    totalRconAttempts: 4,
    maxAttemptsPerPlayer: 1,
    completedAt: '2026-07-06T12:01:30.000Z'
  });
  const operation = (
    decisionId: string,
    trigger: string,
    status: 'completed' | 'failed' | 'partial_failed',
    succeededPlayers: number
  ) => ({
    decisionId,
    createdAt: '2026-07-06T12:01:00.000Z',
    mode: 'execute',
    action: status === 'completed' ? 'execute' : 'blocked',
    result: status === 'completed' ? 'executed' : 'failed',
    status,
    trigger,
    reasonCodes: [],
    plannedMoves: 1,
    plannedPlayers: 4,
    summary: 'Internal summary',
    execution: execution(status, succeededPlayers),
    moves: [
      {
        type: 'squad',
        fromTeamID: '1',
        toTeamID: '2',
        squadName: 'Не подтверждённый маршрут',
        playerCount: 4,
        status
      }
    ],
    players: []
  });

  await mockAutoseedApi(page, undefined, runtimeConfig, {
    squadjs2Activity: {
      ...buildActivitySnapshot(),
      teamBalancerHistory: [
        operation('legacy', 'MODERATOR_APPROVED', 'completed', 4),
        operation('failed', 'ROUND_ENDED', 'failed', 0),
        operation('partial', 'ROUND_ENDED', 'partial_failed', 2)
      ]
    }
  });

  await page.goto('./#balance');

  const history = page
    .getByTestId('balance-server-2')
    .getByTestId('team-balancer-history-panel');
  await expect(history.locator('.server-activity-row')).toHaveCount(2);
  await expect(history).toContainText('Не выполнено: 0 из 4');
  await expect(history).toContainText('Частично: 2 из 4');
  await expect(history).not.toContainText('Не подтверждённый маршрут');
});

test('shows the balancer and completed-game journal on separate routes', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-06T12:02:00.000Z');
  await mockAutoseedApi(page, undefined, runtimeConfig, {
    squadjs2Activity: buildActivitySnapshot(),
    squadjs2ActivitySessions: {
      [NARVA_SESSION_ID]: buildActivitySessionDetail(),
      [GORODOK_SESSION_ID]: buildActivitySessionDetail(GORODOK_SESSION_ID)
    },
    squadjs2TeamBalancer: buildTeamBalancerProposalSnapshot()
  });

  await page.goto('./#balance');

  const balancePage = page.getByTestId('balance-page');
  await expect(balancePage).toBeVisible();
  await expect(balancePage).toContainText('Балансер');
  await expect(
    balancePage.getByTestId('balance-server-2').getByTestId('team-balancer-history-panel')
  ).toContainText('Выполнено 2 из 2');
  const historyPanel = balancePage
    .getByTestId('balance-server-2')
    .getByTestId('team-balancer-history-panel');
  await expect(historyPanel.locator('.server-activity-row')).toHaveCount(1);
  await expect(historyPanel).not.toContainText('рассчитано');
  await expect(balancePage.getByTestId('journal-workspace')).toHaveCount(0);

  await page.getByTestId('journal-nav-link').click();
  const journalPage = page.getByTestId('journal-page');
  await expect(journalPage).toBeVisible();
  await expect(journalPage).toContainText('Только завершённые матчи');
  await expect(page.getByTestId('journal-server-2')).toContainText('2 матчей');
  await page.getByTestId('journal-server-2').click();
  await expect(journalPage.getByTestId('journal-workspace')).toContainText('Narva RAAS v2');
  await expect(journalPage.getByTestId('team-balancer-history-panel')).toHaveCount(0);
});

test('shows one selected balancer server instead of stacking every full panel', async ({
  page
}) => {
  await mockAutoseedApi(page);
  await page.goto('./#balance');

  const visiblePanels = page.locator(
    'section[data-testid^="balance-server-"]:not([data-testid="balance-server-selector"])'
  );
  await expect(visiblePanels).toHaveCount(1);
  await expect(page.getByTestId('balance-server-2')).toBeVisible();

  await page.getByTestId('balance-server-selector-1').click();
  await expect(visiblePanels).toHaveCount(1);
  await expect(page.getByTestId('balance-server-1')).toBeVisible();
  await expect(page.getByTestId('balance-server-2')).toHaveCount(0);
});

test('keeps all Team Balancer meta cards in one desktop row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime('2026-07-06T12:01:00.000Z');
  await mockAutoseedApi(page, undefined, runtimeConfig, {
    squadjs2TeamBalancer: buildTeamBalancerProposalSnapshot()
  });

  await page.goto('./#balance');

  const metaCards = page.getByTestId('balance-server-2').locator('.team-balancer-meta > div');
  await expect(metaCards).toHaveCount(4);

  const cardBoxes = await metaCards.evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top)
      };
    })
  );
  const firstTop = cardBoxes[0]?.top ?? 0;

  expect(cardBoxes.every((box) => Math.abs(box.top - firstTop) <= 1)).toBe(true);
  expect(cardBoxes.map((box) => box.left)).toEqual(
    [...cardBoxes].map((box) => box.left).sort((leftA, leftB) => leftA - leftB)
  );
});

test('keeps Team Balancer control copy readable on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime('2026-07-06T12:01:00.000Z');
  await mockAutoseedApi(page, undefined, runtimeConfig, {
    squadjs2TeamBalancer: buildTeamBalancerProposalSnapshot()
  });

  await page.goto('./#balance');

  const control = page
    .getByTestId('balance-server-2')
    .getByTestId('team-balancer-control');
  await expect(control).toBeVisible();
  await expect(control).toContainText('Автобаланс выключен');
  await expect(control).toContainText('Перемещения отключены');
  expect(
    await control.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)
  ).toBe(1);
});

test('renders Team Balancer diff and switches its proposal mode', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-06T12:01:00.000Z');
  const squadSignals = {
    triggerReason: 'scramble_dry_run',
    teamSize: {
      before: { 1: 6, 2: 2 },
      after: { 1: 4, 2: 4 },
      diffBefore: 4,
      diffAfter: 0
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
      reasons: ['ticket_diff', 'win_streak'],
      ticketDiff: 240,
      winStreak: 2,
      playerIds: ['alpha-1', 'alpha-2']
    }
  };
  const playerSignals = {
    ...squadSignals,
    teamSize: {
      before: { 1: 6, 2: 2 },
      after: { 1: 5, 2: 3 },
      diffBefore: 4,
      diffAfter: 2
    }
  };
  await mockAutoseedApi(page, undefined, runtimeConfig, {
    squadjs2TeamBalancer: buildTeamBalancerProposalSnapshot({
      signals: squadSignals,
      proposalModes: {
        squad: {
          proposalMode: 'squad',
          action: 'recommend',
          result: 'proposal',
          reasonCodes: [],
          signals: squadSignals,
          summary: 'Squad dry-run proposal.',
          cohorts: [
            {
              type: 'squad',
              cohortKey: 'squad:1:alpha',
              fromTeamID: '1',
              toTeamID: '2',
              currentTeamID: '1',
              expectedTeamID: '2',
              squadID: 'alpha',
              squadName: 'Vanguard Alpha',
              compositionKey: VANGUARD_ALPHA_COMPOSITION_KEY,
              playerCount: 2,
              status: 'move_pending',
              confidence: null,
              score: null
            }
          ],
          players: []
        },
        player: {
          proposalMode: 'player',
          action: 'recommend',
          result: 'proposal',
          reasonCodes: [],
          signals: playerSignals,
          summary: 'Player dry-run proposal.',
          cohorts: [
            {
              type: 'player',
              cohortKey: 'player:1:vanguard-cmd',
              fromTeamID: '1',
              toTeamID: '2',
              currentTeamID: '1',
              expectedTeamID: '2',
              squadID: 'alpha',
              squadName: 'Vanguard Alpha',
              playerCount: 1,
              status: 'move_pending',
              confidence: null,
              score: null
            }
          ],
          players: [
            {
              name: 'Vanguard Commander',
              matchKey: 'steam:vanguard-cmd',
              fromTeamID: '1',
              toTeamID: '2',
              currentTeamID: '1',
              expectedTeamID: '2',
              squadID: 'alpha',
              squadName: 'Vanguard Alpha',
              status: 'move_pending',
              confidence: null,
              score: null
            }
          ]
        }
      },
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
      }
    })
  });

  await page.goto('./#balance');

  const panel = page.getByTestId('balance-server-2').getByTestId('team-balancer-panel');
  await expect(panel.getByTestId('team-balancer-control')).toContainText('Автобаланс выключен');
  await expect(panel.getByTestId('team-balancer-control-vote')).toContainText(
    'включить автобаланс: за 2, против 0, нужно 3'
  );
  await expect(panel).toContainText('только после завершения матча');
  await expect(panel).toContainText('Нужны изменения');
  await expect(panel).toContainText('Расчёт перестановок');
  await expect(panel).toContainText('1 к смене');
  await expect(panel).toContainText('сейчас 6:2 · по расчёту 4:4');
  await expect(panel).not.toContainText('Сила сторон');
  await expect(panel).not.toContainText('Перекос импакта');
  await expect(page.getByTestId('team-balancer-round-signal-severity')).toContainText(
    'Последние раунды'
  );
  await expect(page.getByTestId('team-balancer-round-signal-severity')).toContainText(
    'Сильный перекос'
  );
  await expect(page.getByTestId('team-balancer-round-signal-severity')).toContainText(
    'разница билетов 240 · серия 2'
  );
  await expect(page.getByTestId('team-balancer-round-signal-ticketDiff')).toContainText(
    'Сторона 1 +240'
  );
  await expect(page.getByTestId('team-balancer-round-signal-ticketDiff')).toContainText(
    '260:20 против Сторона 2'
  );
  await expect(page.getByTestId('team-balancer-round-signal-winStreak')).toContainText(
    'Сторона 1 ×2'
  );
  await expect(page.getByTestId('team-balancer-round-signal-winStreak')).toContainText(
    'порог: 2'
  );
  await expect(page.getByTestId('team-balancer-safety-vote')).toContainText('Голосование');
  await expect(page.getByTestId('team-balancer-safety-vote')).toContainText('2/3');
  await expect(page.getByTestId('team-balancer-safety-vote')).toContainText('за 2 · против 1');
  await expect(page.getByTestId('team-balancer-safety-moderator')).toContainText(
    'Отклонено'
  );
  await expect(page.getByTestId('team-balancer-safety-moderator')).toContainText(
    'Техническая причина'
  );
  await expect(page.getByTestId('team-balancer-safety-execution')).toContainText('Заблокировано');
  await expect(page.getByTestId('team-balancer-safety-execution')).toContainText('игроки 0/2');
  await expect(panel).not.toContainText('->');
  await expect(panel).not.toContainText(/impact|skill|score/i);
  const squadDiffRow = page.getByTestId('team-balancer-diff-row');
  await expect(squadDiffRow).toHaveCount(1);
  await expect(squadDiffRow.first()).toContainText('Vanguard Alpha');
  await expect(squadDiffRow.first()).toContainText('2 игрока · Сторона 1 в Сторона 2');
  await expect(squadDiffRow.first()).toContainText('Нужна смена');

  await page.getByTestId('team-balancer-mode-player').click();

  const playerDiffRow = page.getByTestId('team-balancer-diff-row');
  await expect(playerDiffRow).toHaveCount(1);
  await expect(playerDiffRow.first()).toContainText('Vanguard Commander');
  await expect(playerDiffRow.first()).toContainText('Vanguard Alpha · Сторона 1 в Сторона 2');
  await expect(playerDiffRow.first()).toContainText('Нужна смена');
  await expect(panel).toContainText('сейчас 6:2 · по расчёту 5:3');
  await expect(panel).not.toContainText('steamID');
  await expect(panel).not.toContainText('discordID');
  await expect(panel).not.toContainText('playerIds');
  await expect(panel).not.toContainText('7656119');
});

test('keeps squad diff visible when the live roster has no visible marks', async ({
  page
}) => {
  await page.clock.setFixedTime('2026-07-06T12:01:00.000Z');
  const squadSignals = {
    triggerReason: 'scramble_dry_run',
    teamSize: {
      before: { 1: 6, 2: 2 },
      after: { 1: 4, 2: 4 },
      diffBefore: 4,
      diffAfter: 0
    },
    ticketDiff: null,
    winStreak: null,
    recentRoundSeverity: null
  };
  const playerSignals = {
    ...squadSignals,
    teamSize: {
      before: { 1: 6, 2: 2 },
      after: { 1: 5, 2: 3 },
      diffBefore: 4,
      diffAfter: 2
    }
  };

  await mockAutoseedApi(page, undefined, runtimeConfig, {
    squadjs2TeamBalancer: buildTeamBalancerProposalSnapshot({
      signals: squadSignals,
      proposalModes: {
        squad: {
          proposalMode: 'squad',
          action: 'recommend',
          result: 'proposal',
          reasonCodes: [],
          signals: squadSignals,
          summary: 'Squad dry-run proposal.',
          cohorts: [
            {
              type: 'squad',
              cohortKey: 'squad:1:alpha',
              fromTeamID: '1',
              toTeamID: '2',
              currentTeamID: '1',
              expectedTeamID: '2',
              squadID: 'alpha',
              squadName: 'Vanguard Alpha',
              compositionKey: 'players:2:stale',
              playerCount: 2,
              status: 'move_pending',
              confidence: null,
              score: null
            }
          ],
          players: []
        },
        player: {
          proposalMode: 'player',
          action: 'recommend',
          result: 'proposal',
          reasonCodes: [],
          signals: playerSignals,
          summary: 'Player dry-run proposal.',
          cohorts: [],
          players: [
            {
              name: 'Vanguard Commander',
              matchKey: 'steam:vanguard-cmd',
              fromTeamID: '1',
              toTeamID: '2',
              currentTeamID: '1',
              expectedTeamID: '2',
              squadID: 'alpha',
              squadName: 'Vanguard Alpha',
              status: 'move_pending',
              confidence: null,
              score: null
            }
          ]
        }
      }
    })
  });

  await page.goto('./#balance');

  const panel = page.getByTestId('balance-server-2').getByTestId('team-balancer-panel');
  await expect(panel).toContainText('Нужны изменения');
  await expect(panel).toContainText('1 к смене');
  await expect(panel).toContainText('сейчас 6:2 · по расчёту 4:4');
  const squadDiffRow = page.getByTestId('team-balancer-diff-row');
  await expect(squadDiffRow).toHaveCount(1);
  await expect(squadDiffRow.first()).toContainText('Vanguard Alpha');
  await expect(squadDiffRow.first()).toContainText('Нужна смена');
  await page.getByTestId('team-balancer-mode-player').click();

  await expect(panel).toContainText('Нужны изменения');
  await expect(panel).toContainText('1 к смене');
  await expect(panel).toContainText('сейчас 6:2 · по расчёту 5:3');
  const playerDiffRow = page.getByTestId('team-balancer-diff-row');
  await expect(playerDiffRow).toHaveCount(1);
  await expect(playerDiffRow.first()).toContainText('Vanguard Commander');
});

test('uses player-friendly language on the home page', async ({ page }) => {
  await mockAutoseedApi(page);

  await page.goto('./');

  await expect(page.getByTestId('mode-production')).toHaveText('Обычный');
  await expect(page.getByTestId('power-toggle')).toContainText('Автоподключение');
  await expect(page.getByText('Выбранный сервер', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Обновлено', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Связь с серверами', { exact: true })).toBeVisible();
  await expectPlayerFriendlyLanguage(page);
});

test('uses player-friendly language on the winners page', async ({ page }) => {
  await page.clock.setFixedTime('2026-06-27T12:00:00.000Z');
  await mockRaffleAutoseedApi(page);

  await page.goto('./#winners');

  await expect(page.getByText('Розыгрыши BSS', { exact: true })).toBeVisible();
  await expect(page.locator('.ui-metric-card')).toHaveCount(4);
  await expect(page.getByText('Здесь собраны текущие розыгрыши и история победителей со всех серверов BSS.')).toBeVisible();
  await expect(page.getByTestId('planned-campaigns')).toContainText('по московскому времени');
  await expectPlayerFriendlyLanguage(page);
});

test('uses player-friendly language for the empty winners state', async ({ page }) => {
  await mockAutoseedApi(page);

  await page.goto('./#winners');

  await expect(page.getByTestId('winners-empty')).toContainText('Розыгрыши');
  await expect(page.getByTestId('winners-empty')).toContainText(
    'Данные о розыгрышах пока не поступили. Загляните позже.'
  );
  await expectPlayerFriendlyLanguage(page);
});

test('renders role leaderboards, achievements and restores controls from the link', async ({
  page
}) => {
  await page.clock.setFixedTime('2026-07-26T12:00:00.000Z');
  await mockLeaderboardApi(page);

  await page.goto('./#leaderboards');

  await expect(page.getByTestId('leaderboards-page')).toBeVisible();
  await expect(page.getByTestId('leaderboards-title')).toHaveText('Ролевые топы BSS');
  await expect(page.getByTestId('leaderboards-podium')).toContainText('Top Fragger');
  await expect(page.getByTestId('leaderboards-row-1')).toContainText('5,40');
  await expect(page.getByTestId('leaderboards-row-1')).toContainText(
    'Матчей: 4 · минимум: 2'
  );
  await expect(page.getByTestId('leaderboard-context')).toContainText('64');
  await expect(page.getByTestId('leaderboard-context')).toContainText('88%');
  await expect(page.getByTestId('leaderboards-row-6')).toHaveCount(0);
  await expect(page.getByTestId('leaderboard-squad-size-full')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page).toHaveURL(/role=player&squadSize=full/);
  await page.getByTestId('leaderboard-squad-size-small').click();
  await expect(page).toHaveURL(/role=player&squadSize=small/);
  await expect(page.getByTestId('leaderboards-podium')).toContainText('Top Fragger');
  await page.getByTestId('leaderboard-squad-size-full').click();

  const achievement = page.getByTestId('achievement-against_odds');
  const achievementIcon = achievement.locator('.achievement-badge-icon');
  await expect(achievementIcon).toBeVisible();
  await expect(achievementIcon).toHaveAttribute(
    'src',
    /\/achievements\/against-odds\.webp$/
  );
  await expect
    .poll(() => achievementIcon.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await achievement.hover();
  const achievementPreview = achievement.getByTestId('achievement-preview-against_odds');
  await expect(achievementPreview).toBeVisible();
  await expect
    .poll(() =>
      achievementPreview.evaluate(
        (image: HTMLImageElement) => image.getBoundingClientRect().width
      )
    )
    .toBeGreaterThanOrEqual(140);
  await expect(achievement.getByRole('tooltip')).toContainText(
    'Показывает сильный результат на стороне, у игроков которой в среднем меньше часов в Squad, чем у соперника.'
  );
  await expect(achievement.getByRole('tooltip')).toContainText('Разрыв часов');

  const methodology = page.getByTestId('leaderboards-methodology');
  await methodology.locator('summary').click();
  await expect(methodology).toContainText(
    'засчитанные убийства + поднятия − смерти − тимкиллы'
  );
  await expect(methodology).toContainText('Ноки без убийства за 90 минут');
  await expect(methodology).toContainText(
    'Время и события остаются в той размерности отряда, где были набраны.'
  );
  await expect(methodology).toContainText('Все ачивки этой роли');
  await expect(methodology.getByText('Локомотив', { exact: true })).toBeVisible();
  await expect(methodology.getByText('Бронебойщик', { exact: true })).toHaveCount(0);
  await expect(methodology).toContainText(
    'не становятся статистикой игрока или отряда'
  );
  await expect(methodology).not.toContainText('не меньше 50 событий');
  await expect(methodology).not.toContainText('не меньше 20 случаев');

  await page.getByTestId('leaderboards-expand').click();
  await expect(page.getByTestId('leaderboards-row-6')).toContainText('Fast Driver');
  await expect(page.getByTestId('leaderboards-pending')).toContainText('Almost Qualified');
  await expect(page.getByTestId('leaderboards-pending')).toContainText(
    'Матчей до входа: 1'
  );
  await page.getByTestId('leaderboards-expand').click();
  await expect(page.getByTestId('leaderboards-row-6')).toHaveCount(0);

  await page.getByTestId('leaderboard-period-week').click();
  await expect(page.getByTestId('leaderboards-row-1')).toContainText('Weekly Hero');

  await page.getByTestId('leaderboard-role-squad_leader').click();
  await page.getByTestId('leaderboard-squad-size-medium').click();
  await expect(page.getByTestId('leaderboards-row-1')).toContainText('Squad Lead Alpha');
  await expect(page).toHaveURL(/period=week&role=squad_leader&squadSize=medium/);

  await page.reload();
  await expect(page.getByTestId('leaderboard-role-squad_leader')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByTestId('leaderboard-squad-size-medium')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByTestId('leaderboards-row-1')).toContainText('Squad Lead Alpha');

  await page.getByTestId('leaderboard-archive-previous').click();
  await expect(page).toHaveURL(/periodId=2026-07-13/);
  await page.getByTestId('leaderboard-archive-next').click();
  await expect(page).not.toHaveURL(/periodId=/);
  await expectPlayerFriendlyLanguage(page);
});

test('keeps the selected archive period while switching role and squad size', async ({
  page
}) => {
  await page.clock.setFixedTime('2026-07-26T12:00:00.000Z');
  await mockLeaderboardApi(page);

  await page.goto('./#leaderboards?period=week&role=player&squadSize=full');
  await page.getByTestId('leaderboard-archive-previous').click();
  await expect(page).toHaveURL(/periodId=2026-07-13/);

  const roleRequestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.includes('/mock/leaderboards') &&
      url.searchParams.get('role') === 'squad_leader'
    );
  });
  await page.getByTestId('leaderboard-role-squad_leader').click();
  const roleRequest = await roleRequestPromise;
  expect(new URL(roleRequest.url()).searchParams.get('periodId')).toBe('2026-07-13');
  await expect(page).toHaveURL(/periodId=2026-07-13/);

  const sizeRequestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.includes('/mock/leaderboards') &&
      url.searchParams.get('squadSize') === 'medium'
    );
  });
  await page.getByTestId('leaderboard-squad-size-medium').click();
  const sizeRequest = await sizeRequestPromise;
  expect(new URL(sizeRequest.url()).searchParams.get('periodId')).toBe('2026-07-13');
  await expect(page).toHaveURL(/periodId=2026-07-13/);

  await page.reload();
  await expect(page.getByTestId('leaderboard-role-squad_leader')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByTestId('leaderboard-squad-size-medium')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page).toHaveURL(/periodId=2026-07-13/);

  await page.getByTestId('leaderboard-period-day').click();
  await expect(page).not.toHaveURL(/periodId=/);
});

test('loads the no-wins commander icon on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockLeaderboardApi(page);
  await page.goto('./#leaderboards?period=day&role=commander');

  const achievement = page.getByTestId('achievement-no_wins_today').first();
  const icon = achievement.locator('.achievement-badge-icon');
  await expect(achievement).toBeVisible();
  await expect(icon).toHaveAttribute(
    'src',
    /\/achievements\/no-wins-today\.webp$/
  );
  await expect
    .poll(() => icon.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);

  await achievement.click();
  const dialog = page.getByTestId('achievement-dialog');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByTestId('achievement-dialog-preview-no_wins_today')
  ).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
});

test('keeps the leaderboard filter height stable while switching roles', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockLeaderboardApi(page);
  await page.goto('./#leaderboards?period=week&role=player');

  const controls = page.locator('.leaderboard-control-stack');
  await expect(controls).toBeVisible();
  const playerBox = await controls.boundingBox();
  expect(playerBox).not.toBeNull();

  await page.getByTestId('leaderboard-role-squad_leader').click();
  await expect(page.getByTestId('leaderboard-squad-size-full')).toBeVisible();
  const squadLeaderBox = await controls.boundingBox();
  expect(squadLeaderBox).not.toBeNull();
  expect(Math.abs(squadLeaderBox!.height - playerBox!.height)).toBeLessThanOrEqual(1);
});

test('uses player-friendly language for unavailable leaderboards', async ({ page }) => {
  await mockAutoseedApi(page);

  await page.goto('./#leaderboards');

  await expect(page.getByTestId('leaderboards-empty')).toContainText(
    'Данные ещё формируются'
  );
  await expect(page.getByTestId('leaderboards-empty')).toContainText(
    'Раздел заполнится после следующих завершённых матчей'
  );
  await expect(page.getByTestId('leaderboards-empty')).toHaveClass(/ui-empty-state/);
  await expectPlayerFriendlyLanguage(page);
});

test('shows empty, partial and stale role leaderboard states without treating them as a crash', async ({
  page
}) => {
  await page.clock.setFixedTime('2026-07-26T12:00:00.000Z');
  await mockLeaderboardApi(page, { status: 'empty', empty: true });
  await page.goto('./#leaderboards?period=month&role=player');

  await expect(page.getByTestId('leaderboards-empty')).toContainText(
    'Пока никто не прошёл в топ'
  );
  await expect(page.getByTestId('leaderboards-empty')).toContainText(
    'Сейчас участвуют'
  );
});

test('explains the growing monthly threshold and keeps server progress visible on mobile', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime('2026-07-26T12:00:00.000Z');
  await mockLeaderboardApi(page, { minimumMatches: 13 });
  await page.goto('./#leaderboards?period=month&role=player&squadSize=full');

  await expect(page.getByTestId('leaderboard-period-day')).toContainText('от 2 матчей');
  await expect(page.getByTestId('leaderboard-period-week')).toContainText('от 9 матчей');
  await expect(page.getByTestId('leaderboard-period-month')).toContainText('порог растёт');
  await expect(page.getByTestId('leaderboard-period-month')).not.toContainText('50');
  await expect(page.getByTestId('leaderboard-month-threshold-note')).toContainText(
    'Месячный минимум начинается с 2 матчей и растёт по ходу месяца'
  );
  await expect(page.getByTestId('leaderboard-month-threshold-note')).toContainText(
    'учитывается число матчей пятого по активности участника'
  );

  const minimum = page
    .getByTestId('leaderboard-context')
    .locator('span')
    .filter({ hasText: 'Минимум для входа' });
  await expect(minimum).toContainText('13');
  await expect(page.getByTestId('leaderboards-row-1')).toContainText(
    'Матчей: 52 · минимум: 13'
  );

  await page.getByTestId('leaderboards-expand').click();
  await expect(page.getByTestId('leaderboards-pending')).toContainText(
    'Матчей: 12 · минимум: 13'
  );
  await expect(page.getByTestId('leaderboards-pending')).toContainText('Матчей до входа: 1');

  const geometry = await page.getByTestId('leaderboard-month-threshold-note').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
});

test('marks a compatible monthly archive that still uses the previous rules', async ({
  page
}) => {
  await page.clock.setFixedTime('2026-08-01T12:00:00.000Z');
  await mockLeaderboardApi(page, {
    minimumMatches: 50,
    rulesVersion: 'observed-impact-v4'
  });
  await page.goto('./#leaderboards?period=month&periodId=2026-06&role=player&squadSize=full');

  const note = page.getByTestId('leaderboard-month-threshold-note');
  await expect(note).toContainText('расчёт выполнен по прежним правилам');
  await expect(note).toContainText('фактический минимум указан в сводке ниже');
  await expect(note).not.toContainText('пятого по активности участника');
  await expect(page.getByTestId('leaderboard-context')).toContainText('Минимум для входа50');
});

test('does not describe a fully covered board as incomplete when nobody passed the threshold', async ({
  page
}) => {
  await page.clock.setFixedTime('2026-07-26T12:00:00.000Z');
  await mockLeaderboardApi(page, {
    status: 'partial',
    empty: true,
    factsCoverage: 1
  });
  await page.goto('./#leaderboards?period=day&role=player');

  const context = page.getByTestId('leaderboard-context');
  await expect(context).toContainText('Матчей с обеими сторонами100%');
  await expect(context).not.toContainText('Часть матчей записана неполно');
  await expect(context).not.toHaveClass(/leaderboard-context-strip-warning/);
  await expect(page.getByTestId('leaderboards-empty')).toContainText(
    'Пока никто не прошёл в топ'
  );
});

test('keeps achievement dialogs inside narrow screens and restores focus', async ({
  page
}) => {
  await page.clock.setFixedTime('2026-07-26T12:00:00.000Z');
  await mockLeaderboardApi(page, {
    status: 'partial',
    stale: true,
    factsCoverage: 0.75
  });

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('./#leaderboards');

    await expect(page.getByTestId('leaderboard-context')).toContainText(
      'Часть матчей записана неполно'
    );
    await expect(page.getByTestId('leaderboard-context')).toContainText(
      'Обновление задерживается'
    );
    const achievement = page.getByTestId('achievement-against_odds');
    await achievement.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByTestId('achievement-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Вопреки');
    await expect(dialog).toContainText('Почему выдано');
    await expect(dialog.getByTestId('achievement-dialog-preview-against_odds')).toBeVisible();
    await expect(page.getByTestId('achievement-dialog-close')).toBeFocused();

    const geometry = await dialog.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth
      };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(achievement).toBeFocused();

    await page.keyboard.press('Space');
    await expect(page.getByTestId('achievement-dialog')).toBeVisible();
    await page.getByTestId('achievement-dialog-close').click();
    await expect(page.getByTestId('achievement-dialog')).toHaveCount(0);
    await expect(achievement).toBeFocused();

    await achievement.click();
    await expect(page.getByTestId('achievement-dialog')).toBeVisible();
    await page.mouse.click(1, 1);
    await expect(page.getByTestId('achievement-dialog')).toHaveCount(0);
  }
});

test('keeps the public page selector and content width stable while switching sections', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockLeaderboardApi(page);

  await page.goto('./');

  const nav = page.locator('nav.app-nav');
  const shell = page.locator('.shell').first();
  await expect(page.getByTestId('app-shell')).toBeVisible();

  const homeNavBox = await nav.boundingBox();
  const homeShellBox = await shell.boundingBox();
  expect(homeNavBox).not.toBeNull();
  expect(homeShellBox).not.toBeNull();

  await page.evaluate(() => document.fonts.ready);
  const homeNavBoxAfterFonts = await nav.boundingBox();
  expect(homeNavBoxAfterFonts).not.toBeNull();
  expect(Math.abs(homeNavBoxAfterFonts!.x - homeNavBox!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(homeNavBoxAfterFonts!.width - homeNavBox!.width)).toBeLessThanOrEqual(1);

  await page.getByTestId('winners-nav-link').click();
  await expect(page.getByTestId('winners-page')).toBeVisible();

  const winnersNavBox = await nav.boundingBox();
  const winnersShellBox = await shell.boundingBox();
  expect(winnersNavBox).not.toBeNull();
  expect(winnersShellBox).not.toBeNull();

  await page.getByTestId('leaderboards-nav-link').click();
  await expect(page.getByTestId('leaderboards-page')).toBeVisible();

  const leaderboardsNavBox = await nav.boundingBox();
  const leaderboardsShellBox = await shell.boundingBox();
  expect(leaderboardsNavBox).not.toBeNull();
  expect(leaderboardsShellBox).not.toBeNull();

  for (const currentBox of [winnersNavBox, leaderboardsNavBox]) {
    expect(Math.abs(currentBox!.x - homeNavBox!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(currentBox!.width - homeNavBox!.width)).toBeLessThanOrEqual(1);
  }

  for (const currentBox of [winnersShellBox, leaderboardsShellBox]) {
    expect(Math.abs(currentBox!.x - homeShellBox!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(currentBox!.width - homeShellBox!.width)).toBeLessThanOrEqual(1);
  }
});

test('keeps all five sections visible and active at 360 and 390 pixels', async ({ page }) => {
  await mockAutoseedApi(page);
  await mockLeaderboardApi(page);

  const routes = [
    { link: 'home-nav-link', page: 'app-shell' },
    { link: 'winners-nav-link', page: 'winners-page' },
    { link: 'leaderboards-nav-link', page: 'leaderboards-page' },
    { link: 'balance-nav-link', page: 'balance-page' },
    { link: 'journal-nav-link', page: 'journal-page' }
  ];

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 800 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('./');

    for (const route of routes) {
      const link = page.getByTestId(route.link);
      await expect(link).toBeVisible();
      await link.click();
      await expect(page.getByTestId(route.page)).toBeVisible();
      await expect(link).toHaveAttribute('aria-current', 'page');
      await expect(
        page
          .getByTestId(route.page)
          .locator(':scope > .page-content > .page-header')
      ).toHaveCount(1);

      const layout = await page.evaluate(() => {
        const navigation = document.querySelector<HTMLElement>('[data-testid="app-navigation"]');
        const links = [...document.querySelectorAll<HTMLElement>('[data-testid="app-navigation"] a')];
        return {
          documentFits: document.documentElement.scrollWidth <= window.innerWidth + 1,
          navigationFits: Boolean(
            navigation &&
              navigation.getBoundingClientRect().left >= 0 &&
              navigation.getBoundingClientRect().right <= window.innerWidth
          ),
          linksFit: links.every((entry) => {
            const box = entry.getBoundingClientRect();
            return box.left >= 0 && box.right <= window.innerWidth;
          })
        };
      });

      expect(layout).toEqual({
        documentFits: true,
        navigationFits: true,
        linksFit: true
      });
    }
  }
});

test('supports Tab, Enter and Space while preserving detailed section selection', async ({
  page
}) => {
  await mockAutoseedApi(page);
  await mockLeaderboardApi(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('./#leaderboards?period=month&role=player');
  await expect(page.getByTestId('leaderboards-page')).toBeVisible();
  const detailedHash = await page.evaluate(() => window.location.hash);

  const balanceLink = page.getByTestId('balance-nav-link');
  await balanceLink.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('journal-nav-link')).toBeFocused();

  const winnersLink = page.getByTestId('winners-nav-link');
  await winnersLink.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('winners-page')).toBeVisible();

  const leaderboardsLink = page.getByTestId('leaderboards-nav-link');
  await leaderboardsLink.focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('leaderboards-page')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${detailedHash.replace(/[?]/g, '\\?')}$`));
});

test('uses player-friendly language in the autoconnect window', async ({ page }) => {
  await captureConnectorWindowMarkup(page);
  await seedStoredAutoconnectState(page, { enabled: false });
  await mockAutoseedApi(page);

  await page.goto('./');
  await expect(page.getByTestId('overview-target')).toContainText('SPEC OPS');
  await page.getByTestId('power-toggle').click();

  await expect.poll(() =>
    page.evaluate(() => (window as Window & { __connectorWindowMarkup?: string }).__connectorWindowMarkup || '')
  ).toContain('Автосид BSS');

  const popupText = await page.evaluate(() => {
    const markup = (window as Window & { __connectorWindowMarkup?: string }).__connectorWindowMarkup || '';
    return new DOMParser().parseFromString(markup, 'text/html').body.textContent || '';
  });
  expect(popupText).not.toMatch(/snapshot|raffle|exporter|endpoint|autoconnect|снимок|экспортер|коннектор/i);
});

test('renders multiple planned raffle campaigns as deduplicated notifications', async ({
  page
}) => {
  await page.clock.setFixedTime('2026-06-27T12:00:00.000Z');
  await mockRaffleAutoseedApi(page);

  await page.goto('./');
  await page.getByTestId('winners-nav-link').click();

  await expect(page).toHaveURL(/#winners$/);
  await expect(page.getByTestId('winners-page')).toBeVisible();
  await expect(page.getByTestId('winners-title')).toHaveText('Победители розыгрышей');
  await expect(page.getByTestId('winners-active-card')).toContainText('1000 рублей');
  await expect(page.getByTestId('winners-active-card')).toContainText('17 участников');
  await expect(page.getByTestId('winners-budget-card')).toContainText('18 500 ₽');
  await expect(page.getByTestId('winners-budget-card')).not.toContainText('37 000 ₽');
  await expect(page.getByTestId('planned-campaign-notification')).toHaveCount(2);
  await expect(page.getByTestId('planned-campaigns')).toContainText(
    'Планируется серия розыгрышей. Не пропустите'
  );
  await expect(page.getByTestId('planned-campaigns')).toContainText('1 июл. - 1 авг.');
  await expect(page.getByTestId('planned-campaigns')).toContainText('1 авг. - 1 сент.');
  await expect(page.getByTestId('winners-campaign-card')).toHaveCount(0);
  await expect(page.getByTestId('winners-history-list')).toContainText('Winner One');
  await expect(page.getByTestId('winners-history-list')).toContainText('VIP 7 дней');
  await expect(page.getByTestId('winners-history-list')).toContainText('без победителя');
});

test('shows raffle participant nicknames without public identifiers', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-15T12:00:00.000Z');
  await mockRaffleAutoseedApi(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('./#winners');

  const participants = page.getByTestId('winner-participants-12');
  await expect(participants).toContainText('Участники (2)');
  await participants.locator('summary').click();
  await expect(participants).toContainText('Winner One');
  await expect(participants).toContainText(
    'Runner_Up_With_An_Extremely_Long_Squad_Nickname_Without_Breaks'
  );
  await expect(page.getByTestId('winner-participants-11')).toContainText('Участников не было.');

  const body = page.locator('body');
  await expect(body).not.toContainText('76561198000000001');
  await expect(body).not.toContainText('winner-eos');
  await expect(body).not.toContainText('discord-user-42');

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});

test('limits the winners archive by default and expands it on request', async ({
  page
}) => {
  await page.clock.setFixedTime('2026-07-20T12:00:00.000Z');
  const history = Array.from({ length: 8 }, (_, index) => {
    const day = String(19 - index).padStart(2, '0');
    return {
      id: 100 + index,
      serverID: 2,
      prize: `Приз ${index + 1}`,
      amountRubles: 500,
      startedAt: `2026-07-${day}T18:00:00.000Z`,
      endedAt: `2026-07-${day}T18:20:00.000Z`,
      participants: [],
      winner: null,
      startedBy: null,
      source: 'auto'
    };
  });
  await mockRaffleAutoseedApi(page, {
    squad2Raffles: buildRaffleSnapshot({ history })
  });
  await page.goto('./#winners');

  await expect(page.getByTestId('winners-history-list').locator('.winner-row')).toHaveCount(5);
  await expect(page.getByTestId('winners-history-toggle')).toHaveText(
    'Показать весь архив (8)'
  );

  await page.getByTestId('winners-history-toggle').click();
  await expect(page.getByTestId('winners-history-list').locator('.winner-row')).toHaveCount(8);
  await expect(page.getByTestId('winners-history-toggle')).toHaveAttribute(
    'aria-expanded',
    'true'
  );
});

test('renders the series card only after its campaign has started', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-15T12:00:00.000Z');
  await mockRaffleAutoseedApi(page);

  await page.goto('./#winners');

  await expect(page.getByTestId('winners-campaign-card')).toContainText('Серия розыгрышей');
  await expect(page.getByTestId('winners-campaign-card')).toContainText('1 июл. - 1 авг.');
  await expect(page.getByTestId('planned-campaign-notification')).toHaveCount(1);
  await expect(page.getByTestId('planned-campaigns')).toContainText('1 авг. - 1 сент.');
});

test('shows cancelled raffle campaign by cancellation date', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-15T12:00:00.000Z');
  await mockRaffleAutoseedApi(page, {
    squad1Raffles: buildRaffleSnapshot({
      active: null,
      history: [],
      campaign: null,
      campaigns: []
    }),
    squad2Raffles: buildRaffleSnapshot({
      active: null,
      campaign: CANCELLED_RAFFLE_CAMPAIGN,
      campaigns: []
    })
  });

  await page.goto('./#winners');

  const campaignCard = page.getByTestId('winners-campaign-card');
  await expect(campaignCard).toContainText('Серия розыгрышей отменена');
  await expect(campaignCard).toContainText('Отменена 5 июл.');
  await expect(campaignCard).not.toContainText('1 авг.');
  await expect(page.getByTestId('planned-campaign-notification')).toHaveCount(0);
});

test('requests join-link on demand and dispatches direct joins in the current tab', async ({
  page
}) => {
  const counters = { joinLinkRequests: 0 };
  await mockAutoseedApi(page, counters);

  await page.goto('./');
  await expect(page.getByTestId('direct-join-2')).toBeVisible();
  expect(counters.joinLinkRequests).toBe(0);

  await Promise.all([
    page.waitForURL('**/redirect-target'),
    page.getByTestId('direct-join-2').click()
  ]);

  expect(counters.joinLinkRequests).toBe(1);
  await expect(page.getByTestId('redirect-target')).toHaveText('Точка перехода');
});

test('marks browser check as successful and keeps the button green', async ({ page }) => {
  await mockSuccessfulPermissionCheck(page);
  await mockAutoseedApi(page);

  await page.goto('./');

  const button = page.getByTestId('check-browser-button');
  await button.click();

  await expect(button).toContainText('Браузер проверен');
  await expect(button).toHaveClass(/button-success/);
  await expect(page.getByTestId('hero')).toContainText('Браузер готов');
});

test('keeps help popovers visible inside the viewport on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAutoseedApi(page);

  await page.goto('./');

  await page.getByTestId('hero-help-trigger').click();
  await expect(page.getByTestId('hero-help-popover')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await expect(page.getByTestId('mobile-monitor-note')).toBeVisible();
  await expect(page.getByTestId('popup-help-trigger')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('keeps the layout usable on mobile without document-level horizontal overflow', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAutoseedApi(page);

  await page.goto('./');

  await expect(page.getByTestId('mobile-monitor-note')).toBeVisible();
  await expect(page.getByTestId('power-toggle')).toBeHidden();
  await expect(page.getByTestId('server-card-2')).toBeVisible();

  const hasNoDocumentOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );

  expect(hasNoDocumentOverflow).toBe(true);
});

test('keeps the selected server card inside the mobile viewport', async ({ page }) => {
  await mockAutoseedApi(page);
  await page.route('**/mock/squadjs2/snapshot', (route) =>
    fulfillJson(
      route,
      buildSnapshot({
        id: 2,
        code: 'squadjs2',
        name: '[RU] МирДружбаЖвачка ★ BSS ★ [SPEC OPS]',
        playerCount: 56,
        maxPlayers: 100,
        queueLength: 2,
        online: true
      })
    )
  );
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('./');
  await expect(page.getByTestId('overview-target')).toContainText('SPEC OPS');

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});

test('keeps the desktop layout within the viewport', async ({ page }) => {
  await mockAutoseedApi(page);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto('./');

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});

test('accepts a fresh snapshot during the pending test sequence without regenerating the first join-link', async ({
  page
}) => {
  const counters = { firstJoinLinkRequests: 0, secondJoinLinkRequests: 0 };
  await mockSuccessfulPermissionCheck(page);
  await mockTestModeAutoseedApi(page, counters);

  await page.goto('./');
  await page.getByTestId('mode-test').click();
  await page.getByTestId('check-browser-button').click();
  await expect(page.getByTestId('check-browser-button')).toContainText('Браузер проверен');

  await page.getByTestId('power-toggle').click();
  await expect.poll(() => counters.firstJoinLinkRequests).toBe(1);
  await expect(page.getByTestId('hero-glance-grid')).toContainText('Следующий переход');

  await page.waitForTimeout(120);
  await page.getByTestId('refresh-snapshot-button').click();
  await page.waitForTimeout(120);

  expect(counters.firstJoinLinkRequests).toBe(1);
  await expect.poll(() => counters.secondJoinLinkRequests).toBe(1);
});

test('regenerates the production join-link only when the current target crosses the 80-player limit', async ({
  page
}) => {
  const counters = { serverOneJoinLinkRequests: 0, serverTwoJoinLinkRequests: 0 };
  const snapshotState = { serverOnePlayers: 60, serverTwoPlayers: 70 };
  await mockSuccessfulPermissionCheck(page);
  await mockProductionSwitchAutoseedApi(page, counters, snapshotState);

  await page.goto('./');
  await page.getByTestId('check-browser-button').click();
  await expect(page.getByTestId('check-browser-button')).toContainText('Браузер проверен');

  await page.getByTestId('power-toggle').click();
  await expect.poll(() => counters.serverOneJoinLinkRequests).toBe(1);
  expect(counters.serverTwoJoinLinkRequests).toBe(0);

  await page.waitForTimeout(120);
  await page.getByTestId('refresh-snapshot-button').click();
  await page.waitForTimeout(120);

  expect(counters.serverOneJoinLinkRequests).toBe(1);
  expect(counters.serverTwoJoinLinkRequests).toBe(0);

  snapshotState.serverOnePlayers = 81;
  await page.waitForTimeout(120);
  await page.getByTestId('refresh-snapshot-button').click();

  await expect.poll(() => counters.serverTwoJoinLinkRequests).toBe(1);
  expect(counters.serverOneJoinLinkRequests).toBe(1);
});

test('restores the current production target after reload without showing a stale cooldown timer', async ({
  page
}) => {
  const counters = { joinLinkRequests: 0 };
  await mockSuccessfulPermissionCheck(page);
  await mockAutoseedApi(page, counters);
  await seedStoredAutoconnectState(page, {
    enabled: true,
    lastProcessedTimestamp: BASE_TIME + 999_000,
    cooldownUntil: BASE_TIME + 363_000,
    activeRedirectServerKey: SQUADJS2_SELECTION_KEY
  });

  await page.goto('./');

  await expect(page.getByTestId('power-toggle')).toContainText('Включён');
  await expect(page.getByTestId('hero-next-action-value')).toHaveText('30 с');
  await expect(page.getByTestId('overview-next-action-value')).toHaveText('30 с');
  await page.waitForTimeout(300);
  expect(counters.joinLinkRequests).toBe(0);
});
