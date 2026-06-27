import { expect, test, type Page, type Route } from '@playwright/test';

const BASE_TIME = Date.parse('2026-04-04T12:00:00.000Z');
const REDIRECT_TARGET_URL = 'http://127.0.0.1:4173/redirect-target';

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

const productionSwitchRuntimeConfig = {
  ...runtimeConfig,
  policy: {
    ...runtimeConfig.policy,
    cooldownMs: 50,
    periodicReconnectMs: 0
  }
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
  raffles = null
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
        updatedAt: BASE_TIME
      }
    ]
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
            name: 'Winner One',
            joinedAt: '2026-07-14T18:05:00.000Z'
          },
          {
            eosID: 'runner-eos',
            steamID: '76561198000000002',
            name: 'Runner Up',
            joinedAt: '2026-07-14T18:06:00.000Z'
          }
        ],
        winner: {
          eosID: 'winner-eos',
          steamID: '76561198000000001',
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

async function mockAutoseedApi(page: Page, counters?: { joinLinkRequests: number }) {
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
        online: true
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

async function mockRaffleAutoseedApi(page: Page) {
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
        raffles: buildRaffleSnapshot({
          active: null,
          history: [],
          campaign: null,
          campaigns: [JULY_RAFFLE_CAMPAIGN, AUGUST_RAFFLE_CAMPAIGN]
        })
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
        raffles: buildRaffleSnapshot()
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
  let currentTimestamp = BASE_TIME;
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

  await expect(page.getByTestId('hero-title')).toHaveText('BSS AutoConnect 2026');
  await expect(page.getByTestId('hero-glance-grid')).toBeVisible();
  await expect(page.getByTestId('overview-target')).toContainText('[RU] BSS Spec Ops');
  await expect(page.getByTestId('server-card-1')).toContainText('[RU] BSS Classic');
  await expect(page.getByTestId('server-card-2')).toContainText('[RU] BSS Spec Ops');
  await expect(page.getByTestId('active-server-board')).toContainText('вход по запросу');
  await expect(page.getByText('Как запустить')).toBeVisible();
  await expect(page.getByText('Выбор сервера')).toBeVisible();
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

test('renders the series card only after its campaign has started', async ({ page }) => {
  await page.clock.setFixedTime('2026-07-15T12:00:00.000Z');
  await mockRaffleAutoseedApi(page);

  await page.goto('/#winners');

  await expect(page.getByTestId('winners-campaign-card')).toContainText('Серия розыгрышей');
  await expect(page.getByTestId('winners-campaign-card')).toContainText('1 июл. - 1 авг.');
  await expect(page.getByTestId('planned-campaign-notification')).toHaveCount(1);
  await expect(page.getByTestId('planned-campaigns')).toContainText('1 авг. - 1 сент.');
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

  await page.getByTestId('popup-help-trigger').click();
  await expect(page.getByTestId('popup-help-popover')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('keeps the layout usable on mobile without document-level horizontal overflow', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAutoseedApi(page);

  await page.goto('/');

  await expect(page.getByTestId('power-toggle')).toBeVisible();
  await expect(page.getByTestId('server-card-2')).toBeVisible();

  const hasNoDocumentOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );

  expect(hasNoDocumentOverflow).toBe(true);
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
