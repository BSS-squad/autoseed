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
    nightWindowStart: '23:00',
    nightWindowEnd: '08:00',
    nightPreferredServerId: 2,
    maxSeedPlayers: 80,
    priorityOrder: [1, 2, 3],
    switchDelta: 10,
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

const leaderboardsRuntimeConfig = {
  ...runtimeConfig,
  leaderboards: {
    url: 'http://127.0.0.1:4173/mock/leaderboards'
  }
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
        isSeedCandidate: true,
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
    version: 1,
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
        trigger: 'MODERATOR_APPROVED',
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
    recentRounds: [
      {
        endedAt: '2026-07-06T12:00:00.000Z',
        layer: 'Narva RAAS v2',
        winner: { team: '1', faction: 'Winner', tickets: 123 },
        loser: { team: '2', faction: 'Loser', tickets: 20 },
        playerCount: 80,
        totals: { kills: 42, deaths: 40, revives: 7, knockdowns: 61 }
      },
      {
        endedAt: '2026-07-06T11:00:00.000Z',
        layer: 'Gorodok Invasion v1',
        winner: { team: '2', faction: 'Winner', tickets: 88 },
        loser: { team: '1', faction: 'Loser', tickets: 0 },
        playerCount: 76,
        totals: { kills: 38, deaths: 37, revives: 9, knockdowns: 55 }
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
      version: 1,
      generatedAt: '2026-07-06T12:01:00.000Z',
      rounds: [{ endedAt: '2026-07-06T12:00:00.000Z', totals: { kills: 3, knockdowns: 4 } }],
      events: [
        {
          type: 'kill',
          attackerName: 'Attacker',
          victimName: 'Victim',
          count: 2,
          roundEndedAt: '2026-07-06T12:00:00.000Z'
        }
      ]
    }
  };
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
    /\b(snapshot|raffle|exporter|endpoint|autoconnect)\b|снимок|экспортер|коннектор|текущая цель|боевой режим/i
  );
}

async function mockAutoseedApi(
  page: Page,
  counters?: { joinLinkRequests: number },
  config = runtimeConfig,
  options: { squadjs2TeamBalancer?: unknown; squadjs2Activity?: unknown } = {}
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

async function mockLeaderboardApi(page: Page) {
  await mockAutoseedApi(page, undefined, leaderboardsRuntimeConfig);
  await page.route('**/mock/leaderboards**', (route) => {
    const requestUrl = new URL(route.request().url());
    const period = requestUrl.searchParams.get('period') || 'overall';
    const entriesByPeriod = {
      overall: [
        {
          rank: 1,
          name: 'Top Fragger',
          score: 4200,
          kills: 320,
          deaths: 140,
          kd: 2.29,
          playtimeHours: 186.5
        },
        {
          rank: 2,
          name: 'Helpful Medic',
          score: 3950,
          kills: 120,
          deaths: 80,
          kd: 1.5,
          playtimeHours: 142
        }
      ],
      week: [
        {
          rank: 1,
          name: 'Weekly Hero',
          score: 680,
          kills: 62,
          deaths: 28,
          kd: 2.21,
          playtimeHours: 22.4
        }
      ],
      month: [
        {
          rank: 1,
          name: 'Monthly Leader',
          score: 2100,
          kills: 180,
          deaths: 72,
          kd: 2.5,
          playtimeHours: 74.8
        }
      ]
    } as const;

    return fulfillJson(route, {
      generatedAt: new Date(BASE_TIME).toISOString(),
      entries: entriesByPeriod[period as keyof typeof entriesByPeriod] || []
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

  await page.goto('/');

  await expect(page.getByTestId('hero-title')).toHaveText('Автосид BSS');
  await expect(page.getByTestId('hero-glance-grid')).toBeVisible();
  await expect(page.getByTestId('overview-target')).toContainText('[RU] BSS Spec Ops');
  await expect(page.getByTestId('server-card-1')).toContainText('[RU] BSS Classic');
  await expect(page.getByTestId('server-card-2')).toContainText('[RU] BSS Spec Ops');
  await expect(page.getByTestId('active-server-board')).toContainText('вход по запросу');
  await expect(page.getByText('Как запустить')).toBeVisible();
  await expect(page.getByText('Выбор сервера')).toBeVisible();
});

test('hides the VIP purchase link when the runtime config does not provide a URL', async ({
  page
}) => {
  await mockAutoseedApi(page);

  await page.goto('/');

  await expect(page.getByTestId('vip-shop-nav-link')).toHaveCount(0);
});

test('renders the VIP purchase link from runtime config', async ({ page }) => {
  await mockAutoseedApi(page, undefined, vipShopRuntimeConfig);

  await page.goto('/');

  const vipLink = page.getByRole('link', { name: 'VIP' });
  await expect(vipLink).toBeVisible();
  await expect(vipLink).toHaveAttribute('href', 'https://vip.example.test/shop');
  await expect(vipLink).toHaveAttribute('target', '_blank');
  await expect(vipLink).toHaveAttribute('rel', /noreferrer/);
});

test('normalizes exporter v3 fixtures and follows Mix Spec Ops Invasion day priority', async ({
  page
}) => {
  await page.clock.setFixedTime('2026-07-15T12:00:00.000Z');
  await mockPriorityAutoseedApi(page, {
    mixPlayers: 40,
    specOpsPlayers: 45,
    invasionPlayers: 49
  });

  await page.goto('/');

  await expect(page.getByTestId('overview-target')).toContainText('[RU] BSS Mix');
  await expect(page.getByTestId('server-card-1')).toContainText('[RU] BSS Mix');
  await expect(page.getByTestId('server-card-2')).toContainText('[RU] BSS Spec Ops');
  await expect(page.getByTestId('server-card-3')).toContainText('[RU] BSS Invasion');
});

test('switches to a stronger server only when switchDelta is exceeded', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-15T12:00:00.000Z');
  const snapshotState = {
    mixPlayers: 60,
    specOpsPlayers: 70,
    invasionPlayers: 20
  };
  await mockPriorityAutoseedApi(page, snapshotState);

  await page.goto('/');
  await expect(page.getByTestId('overview-target')).toContainText('[RU] BSS Mix');

  snapshotState.specOpsPlayers = 71;
  await page.getByTestId('refresh-snapshot-button').click();

  await expect(page.getByTestId('overview-target')).toContainText('[RU] BSS Spec Ops');
});

test('skips a priority server that has reached the seed limit', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-15T12:00:00.000Z');
  await mockPriorityAutoseedApi(page, {
    mixPlayers: 80,
    specOpsPlayers: 25,
    invasionPlayers: 10
  });

  await page.goto('/');

  await expect(page.getByTestId('overview-target')).toContainText('[RU] BSS Spec Ops');
});

test('uses configured night preferred server over day priority order', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-14T22:30:00.000Z');
  await mockPriorityAutoseedApi(page, {
    mixPlayers: 20,
    specOpsPlayers: 10,
    invasionPlayers: 5
  });

  await page.goto('/');

  await expect(page.getByTestId('overview-target')).toContainText('[RU] BSS Spec Ops');
});

test('renders an empty Team Balancer state when no fresh report exists', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-06T12:01:00.000Z');
  await mockAutoseedApi(page);

  await page.goto('/');

  const panel = page.getByTestId('team-balancer-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Баланс сторон');
  await expect(panel).toContainText('Отчета по dry-run балансу пока нет');
  await expect(panel).not.toContainText('snapshot');
  await expect(panel).not.toContainText('7656119');
  await expect(page.getByTestId('team-balancer-round-signals')).toHaveCount(0);
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

  await page.goto('/');
  await page.getByTestId('server-card-2').locator('button').first().click();

  const panel = page.getByTestId('team-balancer-panel');
  await expect(panel).toContainText('Без изменений');
  await expect(panel).toContainText('сейчас 40:39 · dry-run 40:39');
  await expect(panel).not.toContainText('Импакт');
  await expect(panel).not.toContainText('Сила сторон');
  await expect(page.getByTestId('team-balancer-round-signals')).toHaveCount(0);
  await expect(page.getByTestId('team-balancer-diff-row')).toHaveCount(0);
});

test('renders server activity history, last-10 top and killfeed journal', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-06T12:02:00.000Z');
  await mockAutoseedApi(page, undefined, runtimeConfig, {
    squadjs2Activity: buildActivitySnapshot()
  });

  await page.goto('/');
  await page.getByTestId('server-card-2').locator('button').first().click();

  const activityPanel = page.getByTestId('server-activity-panel');
  await expect(activityPanel).toBeVisible();
  await expect(activityPanel).toContainText('Журнал сервера');
  await expect(activityPanel).toContainText('10 игр');
  await expect(activityPanel).toContainText('3 игры');
  await expect(activityPanel).toContainText('Qualified A');
  await expect(activityPanel).toContainText('15');
  await expect(activityPanel).toContainText('Narva RAAS v2');
  await expect(activityPanel).toContainText('Attacker');
  await expect(activityPanel).toContainText('Victim');
  await expect(activityPanel).toContainText('Vanguard Alpha');
  await expect(activityPanel).toContainText('Боевой · выполнено 2/2');
  await expect(activityPanel).toContainText('Dry-run · рассчитано');
  await expect(activityPanel).toContainText('Сквады: 2 игрока');
  await expect(activityPanel).toContainText('Игроки: 1 игрок');
  await expect(activityPanel).toContainText('Сторона 1 в Сторона 2');
  await expect(activityPanel).not.toContainText('->');
  await expect(activityPanel).not.toContainText('snapshot');
  await expect(activityPanel).not.toContainText('7656119');
});

test('keeps all Team Balancer meta cards in one desktop row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime('2026-07-06T12:01:00.000Z');
  await mockAutoseedApi(page, undefined, runtimeConfig, {
    squadjs2TeamBalancer: buildTeamBalancerProposalSnapshot()
  });

  await page.goto('/');
  await page.getByTestId('server-card-2').locator('button').first().click();

  const metaCards = page.locator('.team-balancer-meta > div');
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

test('renders Team Balancer diff on squad headers and switches to player rows', async ({ page }) => {
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
      }
    })
  });

  await page.goto('/');
  await page.getByTestId('server-card-2').locator('button').first().click();

  const panel = page.getByTestId('team-balancer-panel');
  await expect(panel).toContainText('Есть diff');
  await expect(panel).toContainText('Scramble dry-run');
  await expect(panel).toContainText('1 к смене');
  await expect(panel).toContainText('сейчас 6:2 · dry-run 4:4');
  await expect(panel).not.toContainText('Сила сторон');
  await expect(panel).not.toContainText('Перекос импакта');
  await expect(page.getByTestId('team-balancer-round-signal-severity')).toContainText(
    'Последние раунды'
  );
  await expect(page.getByTestId('team-balancer-round-signal-severity')).toContainText(
    'Сильный перекос'
  );
  await expect(page.getByTestId('team-balancer-round-signal-severity')).toContainText(
    'ticket diff 240 · серия 2'
  );
  await expect(page.getByTestId('team-balancer-round-signal-ticketDiff')).toContainText(
    'Сторона 1 +240'
  );
  await expect(page.getByTestId('team-balancer-round-signal-ticketDiff')).toContainText(
    '260:20 против Сторона 2'
  );
  await expect(page.getByTestId('team-balancer-round-signal-winStreak')).toContainText(
    'Сторона 1 x2'
  );
  await expect(page.getByTestId('team-balancer-round-signal-winStreak')).toContainText('порог 2');
  await expect(page.getByTestId('team-balancer-safety-vote')).toContainText('Голосование');
  await expect(page.getByTestId('team-balancer-safety-vote')).toContainText('2/3');
  await expect(page.getByTestId('team-balancer-safety-vote')).toContainText('за 2 · против 1');
  await expect(page.getByTestId('team-balancer-safety-moderator')).toContainText('Veto: technical');
  await expect(page.getByTestId('team-balancer-safety-execution')).toContainText('Заблокировано');
  await expect(page.getByTestId('team-balancer-safety-execution')).toContainText('игроки 0/2');
  await expect(panel).not.toContainText('->');
  await expect(panel).not.toContainText(/impact|skill|score/i);
  const squadDiffRow = page.getByTestId('team-balancer-diff-row');
  await expect(squadDiffRow).toHaveCount(1);
  await expect(squadDiffRow.first()).toContainText('Vanguard Alpha');
  await expect(squadDiffRow.first()).toContainText('2 игрока · Сторона 1 в Сторона 2');
  await expect(squadDiffRow.first()).toContainText('Нужна смена');

  const markedSquad = page.getByTestId('team-balancer-squad-mark');
  await expect(markedSquad).toHaveCount(1);
  await expect(markedSquad.first()).toContainText('Vanguard Alpha');
  await expect(markedSquad.first()).toContainText('Нужна смена');
  await expect(markedSquad.first()).toContainText('Сторона по dry-run: Сторона 2');
  await expect(markedSquad.first()).toHaveAttribute('data-team-balancer-tone', 'conflict');
  await expect(page.getByTestId('team-balancer-roster-mark')).toHaveCount(0);

  await page.getByTestId('team-balancer-mode-player').click();

  const playerDiffRow = page.getByTestId('team-balancer-diff-row');
  await expect(playerDiffRow).toHaveCount(1);
  await expect(playerDiffRow.first()).toContainText('Vanguard Commander');
  await expect(playerDiffRow.first()).toContainText('Vanguard Alpha · Сторона 1 в Сторона 2');
  await expect(playerDiffRow.first()).toContainText('Нужна смена');
  await expect(page.getByTestId('team-balancer-squad-mark')).toHaveCount(0);
  const markedRosterRow = page.getByTestId('team-balancer-roster-mark');
  await expect(markedRosterRow).toHaveCount(1);
  await expect(markedRosterRow.first()).toContainText('Vanguard Commander');
  await expect(markedRosterRow.first()).toContainText('Нужна смена');
  await expect(markedRosterRow.first()).toContainText('Сторона по dry-run: Сторона 2');
  await expect(panel).toContainText('сейчас 6:2 · dry-run 5:3');
  await expect(markedRosterRow.first()).not.toContainText(/impact|skill|score/i);
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

  await page.goto('/');
  await page.getByTestId('server-card-2').locator('button').first().click();

  const panel = page.getByTestId('team-balancer-panel');
  await expect(panel).toContainText('Есть diff');
  await expect(panel).toContainText('1 к смене');
  await expect(panel).toContainText('сейчас 6:2 · dry-run 4:4');
  const squadDiffRow = page.getByTestId('team-balancer-diff-row');
  await expect(squadDiffRow).toHaveCount(1);
  await expect(squadDiffRow.first()).toContainText('Vanguard Alpha');
  await expect(squadDiffRow.first()).toContainText('Нужна смена');
  await expect(page.getByTestId('team-balancer-squad-mark')).toHaveCount(0);
  await expect(page.getByTestId('team-balancer-roster-mark')).toHaveCount(0);

  await page.getByTestId('team-balancer-mode-player').click();

  await expect(panel).toContainText('Есть diff');
  await expect(panel).toContainText('1 к смене');
  await expect(panel).toContainText('сейчас 6:2 · dry-run 5:3');
  const playerDiffRow = page.getByTestId('team-balancer-diff-row');
  await expect(playerDiffRow).toHaveCount(1);
  await expect(playerDiffRow.first()).toContainText('Vanguard Commander');
  await expect(page.getByTestId('team-balancer-squad-mark')).toHaveCount(0);
  const markedRosterRow = page.getByTestId('team-balancer-roster-mark');
  await expect(markedRosterRow).toHaveCount(1);
  await expect(markedRosterRow.first()).toContainText('Vanguard Commander');
  await expect(markedRosterRow.first()).toContainText('Нужна смена');
});

test('uses player-friendly language on the home page', async ({ page }) => {
  await mockAutoseedApi(page);

  await page.goto('/');

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

  await page.goto('/#winners');

  await expect(page.getByText('Розыгрыши BSS', { exact: true })).toBeVisible();
  await expect(page.getByText('Здесь собраны текущие розыгрыши и история победителей со всех серверов BSS.')).toBeVisible();
  await expect(page.getByTestId('planned-campaigns')).toContainText('по московскому времени');
  await expectPlayerFriendlyLanguage(page);
});

test('uses player-friendly language for the empty winners state', async ({ page }) => {
  await mockAutoseedApi(page);

  await page.goto('/#winners');

  await expect(page.getByTestId('winners-empty')).toContainText('Розыгрыши');
  await expect(page.getByTestId('winners-empty')).toContainText(
    'Данные о розыгрышах пока не поступили. Загляните позже.'
  );
  await expectPlayerFriendlyLanguage(page);
});

test('renders public leaderboards and switches periods', async ({ page }) => {
  await mockLeaderboardApi(page);

  await page.goto('/#leaderboards');

  await expect(page.getByTestId('leaderboards-page')).toBeVisible();
  await expect(page.getByTestId('leaderboards-title')).toHaveText('Топ игроков BSS');
  await expect(page.getByTestId('leaderboards-table')).toContainText('Top Fragger');
  await expect(page.getByTestId('leaderboards-row-1')).toContainText('4 200');
  await expect(page.getByTestId('leaderboards-row-1')).toContainText('2,29');

  await page.getByTestId('leaderboard-period-week').click();

  await expect(page.getByTestId('leaderboards-row-1')).toContainText('Weekly Hero');
  await expect(page.getByTestId('leaderboards-row-1')).toContainText('680');
  await expect(page.getByTestId('leaderboards-table')).not.toContainText('Top Fragger');
  await expectPlayerFriendlyLanguage(page);
});

test('uses player-friendly language for unavailable leaderboards', async ({ page }) => {
  await mockAutoseedApi(page);

  await page.goto('/#leaderboards');

  await expect(page.getByTestId('leaderboards-empty')).toContainText('Лидерборды пока недоступны');
  await expect(page.getByTestId('leaderboards-empty')).toContainText(
    'Источник статистики ещё не подключён.'
  );
  await expectPlayerFriendlyLanguage(page);
});

test('keeps the public page selector and content width stable while switching sections', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockLeaderboardApi(page);

  await page.goto('/');

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

test('uses player-friendly language in the autoconnect window', async ({ page }) => {
  await captureConnectorWindowMarkup(page);
  await seedStoredAutoconnectState(page, { enabled: false });
  await mockAutoseedApi(page);

  await page.goto('/');
  await expect(page.getByTestId('overview-target')).toContainText('[RU] BSS Spec Ops');
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

  await page.goto('/');
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

  await page.goto('/#winners');

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

test('renders the series card only after its campaign has started', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-15T12:00:00.000Z');
  await mockRaffleAutoseedApi(page);

  await page.goto('/#winners');

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

  await page.goto('/#winners');

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

  await page.goto('/');
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

  await page.goto('/');

  const button = page.getByTestId('check-browser-button');
  await button.click();

  await expect(button).toContainText('Браузер проверен');
  await expect(button).toHaveClass(/button-success/);
  await expect(page.getByTestId('hero')).toContainText('Браузер готов');
});

test('keeps help popovers visible inside the viewport on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAutoseedApi(page);

  await page.goto('/');

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

  await page.goto('/');

  await expect(page.getByTestId('mobile-monitor-note')).toBeVisible();
  await expect(page.getByTestId('power-toggle')).toBeHidden();
  await expect(page.getByTestId('server-card-2')).toBeVisible();

  const hasNoDocumentOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );

  expect(hasNoDocumentOverflow).toBe(true);
});

test('keeps a long selected server name inside the mobile viewport', async ({ page }) => {
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

  await page.goto('/');
  await expect(page.getByTestId('overview-target')).toContainText('МирДружбаЖвачка');

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});

test('keeps the desktop layout within the viewport', async ({ page }) => {
  await mockAutoseedApi(page);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto('/');

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

  await page.goto('/');
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

  await page.goto('/');
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

  await page.goto('/');

  await expect(page.getByTestId('power-toggle')).toContainText('Включён');
  await expect(page.getByTestId('hero-next-action-value')).toHaveText('30 с');
  await expect(page.getByTestId('overview-next-action-value')).toHaveText('30 с');
  await page.waitForTimeout(300);
  expect(counters.joinLinkRequests).toBe(0);
});
