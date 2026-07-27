import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ChangeEvent
} from 'react';

import { runPermissionCheck } from './lib/permissions';
import {
  buildSelectionState,
  getSelectionStatusLabel,
  resolveSeedPolicy
} from './lib/seed-policy';
import {
  fetchCombinedSnapshot,
  fetchServerJoinLink,
  SNAPSHOT_POLL_INTERVAL_MS,
  subscribeCombinedSnapshot
} from './lib/snapshot';
import {
  formatServerDisplayName,
  formatTeamDisplayName,
  USER_STATE_COPY
} from './lib/ui-copy';
import {
  formatBool,
  formatCompactTimestamp,
  formatCountdown,
  formatHours
} from './lib/ui-format';
import { classNames, getSafeHttpUrl } from './lib/ui';
import {
  findServerBySelectionKey,
  getServerSelectionKey,
  isSameServer
} from './lib/server';
import {
  loadStoredState,
  saveActiveRedirectServerKey,
  saveCooldownUntil,
  saveEnabled,
  saveLastProcessedTimestamp,
  saveMode,
  savePermissions,
  saveTestSequenceDelayMs
} from './lib/storage';
import {
  APP_DISPLAY_NAME,
  PageHeader,
  PageShell,
  type AppRoute
} from './components/PageShell';
import {
  buildTeamBalancerVisibleTones,
  getWeakerTeam,
  TeamBalancerPanel,
  TeamPanel
} from './components/TeamBalancer';
import {
  Notice,
  SegmentedControl,
  ServerSelector
} from './components/Primitives';
import { BalancePage } from './pages/BalancePage';
import { JournalPage } from './pages/JournalPage';
import { LeaderboardsPage } from './pages/LeaderboardsPage';
import { WinnersPage } from './pages/WinnersPage';
import type {
  AppConfig,
  AppMode,
  BrowserPermissions,
  CombinedSnapshot,
  ExporterServerSnapshot,
  SelectionState,
  TeamBalancerProposalMode
} from './types';
import projectLogo from '../image.png';

type AppProps = {
  config: AppConfig;
};

type PendingSequence = {
  remaining: ExporterServerSnapshot[];
  nextRedirectAt: number;
};

type RefreshSnapshotOptions = {
  forceRedirect?: boolean;
};

type SnapshotUpdateSource = 'manual' | 'stream';

type ConnectorWindowContext = {
  title: string;
  server: ExporterServerSnapshot;
  followupServer?: ExporterServerSnapshot | null;
  followupDelayMs?: number;
  seedLimit: number;
  phase: 'dispatching' | 'redirect_sent';
};

type ConnectorWindowState = {
  serverKey: string;
  followupServerKey: string;
  phase: ConnectorWindowContext['phase'];
};

type GuideStep = {
  id: string;
  step: string;
  title: string;
  description: string;
  hints: string[];
};

type InlineHelpProps = {
  label: string;
  title: string;
  description: string;
  testId?: string;
};

const EMPTY_SNAPSHOT: CombinedSnapshot = {
  timestamp: 0,
  generatedAt: '',
  servers: [],
  errors: []
};

const IMMEDIATE_REDIRECT_SNAPSHOT_MAX_AGE_MS = 15_000;
function getRouteFromHash(): AppRoute {
  if (typeof window === 'undefined') return 'home';
  if (window.location.hash.startsWith('#leaderboards')) return 'leaderboards';
  if (window.location.hash.startsWith('#winners')) return 'winners';
  if (window.location.hash.startsWith('#balance')) return 'balance';
  return window.location.hash.startsWith('#journal') ? 'journal' : 'home';
}

function normalizeDelaySeconds(value: number): number {
  if (!Number.isFinite(value)) return 60;
  return Math.max(5, Math.min(600, Math.round(value)));
}

function getSnapshotAgeMs(snapshot: CombinedSnapshot): number {
  const generatedAtMs = Date.parse(snapshot.generatedAt);
  if (Number.isFinite(generatedAtMs)) {
    return Math.max(0, Date.now() - generatedAtMs);
  }

  if (snapshot.timestamp > 0) {
    return Math.max(0, Date.now() - snapshot.timestamp);
  }

  return Number.POSITIVE_INFINITY;
}

function getServerLoadPercent(server: ExporterServerSnapshot): number {
  if (!server.maxPlayers) return 0;
  return Math.max(0, Math.min(100, Math.round((server.playerCount / server.maxPlayers) * 100)));
}

function getSeedProgressPercent(server: ExporterServerSnapshot, seedLimit: number): number {
  if (!seedLimit) return 0;
  return Math.max(0, Math.min(100, Math.round((server.playerCount / seedLimit) * 100)));
}

function getSeedProgressGradient(percent: number): string {
  const normalized = Math.max(0, Math.min(100, percent));
  const startHue = Math.round((normalized / 100) * 120);
  const endHue = Math.min(120, startHue + 14);
  return `linear-gradient(90deg, hsl(${startHue} 78% 42%), hsl(${endHue} 86% 56%))`;
}

function canUseRedirectSequenceTarget(server: ExporterServerSnapshot | undefined): boolean {
  return Boolean(server?.online && server.joinLinkUrl);
}

function canRequestJoinLink(server: ExporterServerSnapshot | null | undefined): boolean {
  return Boolean(server?.online && server.joinLinkUrl);
}

function buildTestSequence(
  snapshot: CombinedSnapshot,
  configuredServerIds: number[] | undefined
): ExporterServerSnapshot[] {
  if (!configuredServerIds?.length) return [];

  const sequence: ExporterServerSnapshot[] = [];

  for (const serverId of configuredServerIds) {
    const server = snapshot.servers.find((entry) => entry.id === serverId);
    if (!server || !canUseRedirectSequenceTarget(server)) {
      return [];
    }

    sequence.push(server);
  }

  return sequence;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildConnectorWindowMarkup(context: ConnectorWindowContext): string {
  const { title, server, followupServer, followupDelayMs = 0, seedLimit, phase } = context;
  const seedPercent = getSeedProgressPercent(server, seedLimit);
  const seedGradient = getSeedProgressGradient(seedPercent);
  const escapedLogo = escapeHtml(projectLogo);
  const weakerTeam = getWeakerTeam(server);
  const [teamOne, teamTwo] = server.teams;
  const matchupText =
    teamOne && teamTwo
      ? `${escapeHtml(formatTeamDisplayName(teamOne))} ${formatHours(
          teamOne.totalPlaytimeHours
        )} · ${escapeHtml(formatTeamDisplayName(teamTwo))} ${formatHours(
          teamTwo.totalPlaytimeHours
        )}`
      : 'Состав сторон уточняется…';
  const weakerText = weakerTeam
    ? `Слабее по часам: ${escapeHtml(formatTeamDisplayName(weakerTeam))}`
    : 'Баланс сторон пока ровный';
  const hasFollowup = Boolean(followupServer && followupDelayMs > 0);
  const statusTag =
    phase === 'redirect_sent'
      ? hasFollowup
        ? 'Первый переход отправлен'
        : 'Переход отправлен'
      : 'Передаём ссылку входа в Steam';
  const leadText =
    phase === 'redirect_sent'
      ? 'Браузер не получает отдельный ответ от Steam или Squad. Если окно осталось на служебной карточке, это нормально. Перед каждым следующим переходом запросим новую ссылку входа.'
      : 'Держи Squad открытым в главном меню. Окно нужно только для запроса свежей ссылки входа и передачи перехода в Steam.';
  const nextStepLabel = hasFollowup ? 'Следом' : 'Дальше';
  const nextStepText = hasFollowup
    ? `Следующий сервер: ${escapeHtml(followupServer!.name)} через ${Math.ceil(followupDelayMs / 1000)} с`
    : phase === 'redirect_sent'
      ? 'Автоподключение ждёт новые данные. Перед следующим переходом ссылка входа будет запрошена заново.'
      : 'После отправки браузер не получит отдельный ответ от Steam или Squad.';
  const snapshotText = formatCompactTimestamp(server.updatedAt);
  const joinLinkText = 'Запрашивается прямо перед переходом';

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #060606;
        --panel: rgba(18, 18, 18, 0.96);
        --line: rgba(255, 255, 255, 0.08);
        --text: #f5f5f5;
        --muted: #9d9d9d;
        --red: #dd1f1f;
        --green: #20c45a;
        --amber: #f59e0b;
        --brand: url("${escapedLogo}");
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; font-family: Inter, system-ui, sans-serif; background:
        radial-gradient(circle at top left, rgba(221, 31, 31, 0.24), transparent 28%),
        radial-gradient(circle at 100% 100%, rgba(255, 255, 255, 0.08), transparent 24%),
        linear-gradient(180deg, rgba(0, 0, 0, 0.44), rgba(0, 0, 0, 0.76)),
        var(--brand) center/cover no-repeat,
        linear-gradient(180deg, #020202 0%, #090909 100%);
        color: var(--text); }
      body { display: grid; place-items: center; padding: 16px; }
      .panel {
        position: relative;
        width: min(440px, 100%);
        border: 1px solid var(--line);
        border-radius: 24px;
        background: var(--panel);
        padding: 22px;
        overflow: hidden;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
      }
      .panel::before {
        content: "";
        position: absolute;
        inset: auto -30px -40px auto;
        width: 210px;
        height: 210px;
        background: var(--brand) center/contain no-repeat;
        opacity: 0.12;
        filter: saturate(1.05);
        pointer-events: none;
      }
      .panel > * { position: relative; z-index: 1; }
      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .brand-mark {
        width: 58px;
        height: 58px;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(circle at 50% 24%, rgba(255,255,255,.14), transparent 58%),
          rgba(9,14,21,.18);
        object-fit: contain;
        padding: 6px;
      }
      .eyebrow {
        margin: 0 0 6px;
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      .brand-copy p { margin-top: 4px; }
      h1 {
        margin: 12px 0 0;
        font-size: 24px;
        line-height: 1.05;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.5;
      }
      .stack { display: grid; gap: 14px; margin-top: 18px; }
      .row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.03);
      }
      .row strong { font-size: 15px; }
      .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
      .big { font-size: 34px; font-weight: 800; line-height: 1; }
      .progress {
        height: 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        overflow: hidden;
      }
      .progress > span {
        display: block;
        height: 100%;
        width: ${seedPercent}%;
        background: ${seedGradient};
        box-shadow: 0 0 18px rgba(0, 0, 0, 0.24);
      }
      .tag {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        width: fit-content;
        min-height: 32px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: rgba(32, 196, 90, 0.12);
        color: var(--green);
        font-size: 13px;
        font-weight: 600;
      }
      .tag::before {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: currentColor;
      }
      .note { color: var(--amber); }
    </style>
  </head>
  <body>
    <main class="panel">
      <div class="brand">
        <img class="brand-mark" src="${escapedLogo}" alt="" />
        <div class="brand-copy">
          <p class="eyebrow">Автосид BSS</p>
          <p>Это окно помогает последовательно подключаться к серверам через Steam.</p>
        </div>
      </div>
      <h1>${escapeHtml(formatServerDisplayName(server))}</h1>
      <p>${leadText}</p>
      <div class="stack">
        <span class="tag">${statusTag}</span>
        <div class="row">
          <div>
            <div class="label">Прогресс рассида</div>
            <div class="big">${server.playerCount}/${seedLimit || server.maxPlayers || '—'}</div>
          </div>
          <div style="text-align:right">
            <div class="label">Общий онлайн</div>
            <strong>${server.playerCount}/${server.maxPlayers || '—'}</strong>
          </div>
        </div>
        <div class="progress"><span></span></div>
        <div class="row">
          <div>
            <div class="label">Стороны</div>
            <strong>${matchupText}</strong>
          </div>
        </div>
        <div class="row">
          <div>
            <div class="label">Подсказка</div>
            <strong>${weakerText}</strong>
          </div>
        </div>
        <div class="row">
          <div>
            <div class="label">Обновлено</div>
            <strong>${snapshotText}</strong>
          </div>
        </div>
        <div class="row">
          <div>
            <div class="label">Ссылка входа</div>
            <strong>${joinLinkText}</strong>
          </div>
        </div>
        <div class="row">
          <div>
            <div class="label">${nextStepLabel}</div>
            <strong class="note">${nextStepText}</strong>
          </div>
        </div>
      </div>
    </main>
  </body>
</html>`;
}

function buildConnectorWindowBootMarkup(title: string): string {
  const escapedLogo = escapeHtml(projectLogo);

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
        --brand: url("${escapedLogo}");
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        min-height: 100%;
        font-family: Inter, system-ui, sans-serif;
        color: #f3f3f3;
        background:
          radial-gradient(circle at top left, rgba(221, 31, 31, 0.24), transparent 28%),
          linear-gradient(180deg, rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0.78)),
          var(--brand) center/cover no-repeat,
          #060606;
      }
      body {
        display: grid;
        place-items: center;
        padding: 16px;
      }
      .boot {
        width: min(340px, 100%);
        padding: 18px;
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 22px;
        background: rgba(17, 17, 17, 0.92);
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.52);
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .brand img {
        width: 56px;
        height: 56px;
        padding: 6px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(circle at 50% 24%, rgba(255,255,255,.14), transparent 58%),
          rgba(9,14,21,.18);
        object-fit: contain;
      }
      .eyebrow {
        margin: 0 0 4px;
        color: rgba(255,255,255,.6);
        font-size: 12px;
        letter-spacing: .14em;
        text-transform: uppercase;
      }
      p {
        margin: 0;
        color: rgba(255,255,255,.76);
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <div class="boot">
      <div class="brand">
        <img src="${escapedLogo}" alt="" />
        <div>
          <p class="eyebrow">Автосид BSS</p>
          <p>Окно автоподключения готово. Не закрывайте его во время переключений.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function InlineHelp({ label, title, description, testId }: InlineHelpProps) {
  return (
    <details className="panel-help" data-testid={testId ? `${testId}-container` : undefined}>
      <summary
        className="panel-help-trigger"
        aria-label={label}
        title={label}
        data-testid={testId ? `${testId}-trigger` : undefined}
      >
        <span aria-hidden="true">?</span>
      </summary>
      <div className="panel-help-popover" data-testid={testId ? `${testId}-popover` : undefined}>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </details>
  );
}

export default function App({ config }: AppProps) {
  const storedState = useMemo(() => loadStoredState(), []);
  const hasConfiguredTestMode = Boolean(config.app.testMode?.sequenceServerIds?.length);
  const vipShopUrl = getSafeHttpUrl(config.app.vipShopUrl);
  const [snapshot, setSnapshot] = useState<CombinedSnapshot>(EMPTY_SNAPSHOT);
  const [permissions, setPermissions] = useState<BrowserPermissions | null>(storedState.permissions);
  const [enabled, setEnabled] = useState<boolean>(storedState.enabled);
  const [mode, setMode] = useState<AppMode>(
    hasConfiguredTestMode ? storedState.mode : 'production'
  );
  const [lastProcessedTimestamp, setLastProcessedTimestamp] = useState<number>(
    storedState.lastProcessedTimestamp
  );
  const [cooldownUntil, setCooldownUntil] = useState<number>(storedState.cooldownUntil);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [plannedSequence, setPlannedSequence] = useState<ExporterServerSnapshot[]>([]);
  const [pendingSequence, setPendingSequence] = useState<PendingSequence | null>(null);
  const [testSequenceDelayMsOverride, setTestSequenceDelayMsOverride] = useState<number>(
    storedState.testSequenceDelayMs
  );
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [now, setNow] = useState<number>(Date.now());
  const [activeServerKey, setActiveServerKey] = useState<string>('');
  const [joinLinkRequestServerKey, setJoinLinkRequestServerKey] = useState<string>('');
  const [route, setRoute] = useState<AppRoute>(() => getRouteFromHash());
  const [teamBalancerProposalMode, setTeamBalancerProposalMode] =
    useState<TeamBalancerProposalMode>('squad');

  const enabledRef = useRef(enabled);
  const modeRef = useRef(mode);
  const snapshotRef = useRef(snapshot);
  const isFetchingRef = useRef(isFetching);
  const cooldownUntilRef = useRef(cooldownUntil);
  const lastProcessedTimestampRef = useRef(lastProcessedTimestamp);
  const permissionsRef = useRef(permissions);
  const pendingSequenceRef = useRef(pendingSequence);
  const connectorWindowRef = useRef<Window | null>(null);
  const sequenceTimerRef = useRef<number | null>(null);
  const testSequenceDelayMsRef = useRef<number>(0);
  const connectorWindowStateRef = useRef<ConnectorWindowState | null>(null);
  const connectorWindowWriteBlockedRef = useRef<boolean>(false);
  const activeRedirectServerKeyRef = useRef<string>(storedState.activeRedirectServerKey);
  const redirectInFlightRef = useRef<boolean>(false);
  const pendingRedirectServerKeyRef = useRef<string>('');

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    isFetchingRef.current = isFetching;
  }, [isFetching]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    cooldownUntilRef.current = cooldownUntil;
  }, [cooldownUntil]);

  useEffect(() => {
    lastProcessedTimestampRef.current = lastProcessedTimestamp;
  }, [lastProcessedTimestamp]);

  useEffect(() => {
    permissionsRef.current = permissions;
  }, [permissions]);

  useEffect(() => {
    pendingSequenceRef.current = pendingSequence;
  }, [pendingSequence]);

  useEffect(() => {
    if (!hasConfiguredTestMode && mode !== 'production') {
      setMode('production');
      saveMode('production');
    }
  }, [hasConfiguredTestMode, mode]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleHashChange = () => setRoute(getRouteFromHash());
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const clearPendingSequence = () => {
    if (sequenceTimerRef.current) {
      window.clearTimeout(sequenceTimerRef.current);
      sequenceTimerRef.current = null;
    }

    setPendingSequence(null);
  };

  const closeConnectorWindow = () => {
    const connectorWindow = connectorWindowRef.current;
    if (!connectorWindow || connectorWindow.closed) return;

    try {
      connectorWindow.close();
    } catch {
      // Ignore user-agent specific close failures.
    } finally {
      connectorWindowRef.current = null;
      connectorWindowWriteBlockedRef.current = false;
    }
  };

  useEffect(() => {
    return () => {
      clearPendingSequence();
      closeConnectorWindow();
    };
  }, []);

  const effectivePolicy = useMemo(() => resolveSeedPolicy(config.policy), [config.policy]);
  const debugLogLimit = config.app.debugLogLimit || 80;
  const appendLog = (message: string) => {
    setLogs((previous) => {
      const entry = `${new Date().toLocaleTimeString('ru-RU')}: ${message}`;
      const next = [...previous, entry];
      return next.slice(Math.max(0, next.length - debugLogLimit));
    });
  };
  const isJoinLinkRequestPending = (server: ExporterServerSnapshot | null | undefined): boolean =>
    Boolean(server && getServerSelectionKey(server) === joinLinkRequestServerKey);

  const requestFreshJoinLink = async (
    server: ExporterServerSnapshot,
    reason: 'redirect' | 'direct'
  ): Promise<string | null> => {
    if (!canRequestJoinLink(server)) {
      appendLog(
        reason === 'direct'
          ? `Прямое подключение недоступно: ${formatServerDisplayName(server)} сейчас оффлайн.`
          : `Переход отменён: ${formatServerDisplayName(server)} сейчас оффлайн.`
      );
      return null;
    }

    const serverKey = getServerSelectionKey(server);
    setJoinLinkRequestServerKey(serverKey);
    appendLog(
      reason === 'direct'
        ? `Прямое подключение: запрашиваю свежую ссылку входа для ${formatServerDisplayName(server)}.`
        : `Запрашиваю свежую ссылку входа для ${formatServerDisplayName(server)}.`
    );

    try {
      return await fetchServerJoinLink(server.joinLinkUrl);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'неизвестная ошибка при запросе ссылки входа';
      appendLog(
        reason === 'direct'
          ? `Прямое подключение не удалось: ${formatServerDisplayName(server)} не отдал ссылку входа (${message}).`
          : `Переход отменён: ${formatServerDisplayName(server)} не отдал ссылку входа (${message}).`
      );
      return null;
    } finally {
      setJoinLinkRequestServerKey((current) => (current === serverKey ? '' : current));
    }
  };

  const testModeConfig = config.app.testMode;
  const activeMode: AppMode = hasConfiguredTestMode ? mode : 'production';
  const isTestModeActive = activeMode === 'test';
  const configuredTestSequenceDelayMs = Math.max(0, testModeConfig?.delayMs || 0);
  const testSequenceDelayMs = Math.max(0, testSequenceDelayMsOverride || configuredTestSequenceDelayMs);
  const testSequenceDelaySeconds = Math.max(5, Math.round(testSequenceDelayMs / 1000));
  const configuredTestSequenceDelaySeconds = Math.max(
    5,
    Math.round(configuredTestSequenceDelayMs / 1000)
  );
  const testCooldownMs = Math.max(0, testModeConfig?.cooldownMs || 30000);
  const testSequencePlanLabel = testModeConfig?.sequenceServerIds?.join(' -> ') || '—';
  const hasManualTestSequenceDelay = testSequenceDelayMsOverride > 0;

  useEffect(() => {
    testSequenceDelayMsRef.current = testSequenceDelayMs;
  }, [testSequenceDelayMs]);

  const applySnapshot = useEffectEvent(
    (
      nextSnapshot: CombinedSnapshot,
      options?: RefreshSnapshotOptions,
      source: SnapshotUpdateSource = 'stream'
    ) => {
      setFatalError(null);

      try {
        const nextPolicy = resolveSeedPolicy(config.policy);
        const nextSelection = buildSelectionState(nextSnapshot, nextPolicy);
        const testModeEnabled = modeRef.current === 'test';
        const nextTestSequence = buildTestSequence(
          nextSnapshot,
          testModeEnabled ? testModeConfig?.sequenceServerIds : undefined
        );
        const nextRedirectPlan = testModeEnabled
          ? nextTestSequence
          : nextSelection.targetServer
            ? [nextSelection.targetServer]
            : [];

        setSnapshot(nextSnapshot);
        setSelection(nextSelection);
        setPlannedSequence(nextRedirectPlan);

        if (nextSnapshot.errors.length) {
          nextSnapshot.errors.forEach((error) => appendLog(`Не удалось обновить данные сервера: ${error}`));
        }

        appendLog(
          `Данные ${source === 'manual' ? 'получены' : 'обновлены'}: выбранный сервер=${
            nextRedirectPlan[0]
              ? formatServerDisplayName(nextRedirectPlan[0])
              : nextSelection.targetServer
                ? formatServerDisplayName(nextSelection.targetServer)
                : 'нет'
          }, режим=${testModeEnabled ? 'тест' : nextSelection.nightMode ? 'ночь' : 'день'}`
        );

        if (!enabledRef.current) return;

        if (!permissionsRef.current?.popupAllowed || !permissionsRef.current?.steamProtocolReady) {
          appendLog('Переход отменён: браузерные разрешения не подтверждены.');
          return;
        }

        if (!nextRedirectPlan[0]) {
          appendLog(
            testModeEnabled
              ? 'Переход отменён: тестовый режим пока не готов.'
              : 'Переход отменён: нет подходящего сервера.'
          );
          return;
        }

        const nextTargetKey = getServerSelectionKey(nextRedirectPlan[0]);
        const activeRedirectServerKey = activeRedirectServerKeyRef.current;
        const awaitingTestFollowup = Boolean(
          testModeEnabled &&
            pendingSequenceRef.current?.remaining.length &&
            !options?.forceRedirect &&
            nextTargetKey &&
            nextTargetKey === activeRedirectServerKey
        );
        const productionTargetUnchanged = Boolean(
          !testModeEnabled &&
            nextTargetKey &&
            activeRedirectServerKey &&
            nextTargetKey === activeRedirectServerKey
        );
        const productionTargetChanged = Boolean(
          !testModeEnabled &&
            nextTargetKey &&
            activeRedirectServerKey &&
            nextTargetKey !== activeRedirectServerKey
        );

        if (awaitingTestFollowup) {
          return;
        }

        if (productionTargetUnchanged) {
          return;
        }

        if (redirectInFlightRef.current) {
          if (nextTargetKey && pendingRedirectServerKeyRef.current === nextTargetKey) {
            return;
          }

          appendLog('Переход отменён: предыдущий переход ещё готовится.');
          return;
        }

        if (
          !options?.forceRedirect &&
          !productionTargetChanged &&
          nextSnapshot.timestamp <= lastProcessedTimestampRef.current
        ) {
          appendLog('Переход отменён: эти данные уже обработаны.');
          return;
        }

        if (
          !options?.forceRedirect &&
          !productionTargetChanged &&
          Date.now() < cooldownUntilRef.current
        ) {
          appendLog('Переход отменён: ещё действует пауза между переходами.');
          return;
        }

        if (productionTargetChanged) {
          const previousServer =
            findServerBySelectionKey(nextSnapshot, activeRedirectServerKey) ||
            findServerBySelectionKey(snapshot, activeRedirectServerKey);
          appendLog(
            `Обычный режим: выбранный сервер изменился с ${
              previousServer ? formatServerDisplayName(previousServer) : 'предыдущего сервера'
            } на ${formatServerDisplayName(nextRedirectPlan[0])}, запускаю новый переход.`
          );
        }

        void startRedirectPlan(
          nextRedirectPlan,
          nextSnapshot.timestamp,
          testModeEnabled ? testCooldownMs : nextPolicy.cooldownMs
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'неизвестная ошибка данных';
        setFatalError(message);
        appendLog(`Ошибка обработки данных: ${message}`);
      }
    }
  );

  const ensureConnectorWindow = (): Window | null => {
    const existingWindow = connectorWindowRef.current;
    if (existingWindow && !existingWindow.closed) {
      return existingWindow;
    }

    try {
      const nextWindow = window.open('', 'autoseed-connector', 'popup=yes,width=480,height=460');
      if (!nextWindow) return null;

      nextWindow.document.open();
      nextWindow.document.write(buildConnectorWindowBootMarkup(APP_DISPLAY_NAME));
      nextWindow.document.close();
      connectorWindowRef.current = nextWindow;
      connectorWindowWriteBlockedRef.current = false;
      return nextWindow;
    } catch {
      return null;
    }
  };

  const renderConnectorWindow = (
    connectorWindow: Window,
    server: ExporterServerSnapshot,
    followupServer?: ExporterServerSnapshot | null,
    phase: ConnectorWindowContext['phase'] = 'dispatching',
    followupDelayMs: number = followupServer ? testSequenceDelayMsRef.current : 0
  ): void => {
    try {
      connectorWindow.document.open();
      connectorWindow.document.write(
        buildConnectorWindowMarkup({
          title: APP_DISPLAY_NAME,
          server,
          followupServer,
          followupDelayMs,
          seedLimit: effectivePolicy.maxSeedPlayers,
          phase
        })
      );
      connectorWindow.document.close();
      connectorWindowWriteBlockedRef.current = false;
    } catch {
      if (!connectorWindowWriteBlockedRef.current) {
        appendLog(
          phase === 'redirect_sent'
            ? 'Не удалось обновить окно автоподключения после перехода.'
            : 'Не удалось обновить окно автоподключения перед переходом.'
        );
      }
      connectorWindowWriteBlockedRef.current = true;
    }
  };

  const syncConnectorWindow = (
    nextSnapshot: CombinedSnapshot,
    nextRedirectPlan: ExporterServerSnapshot[]
  ): void => {
    const connectorWindow = connectorWindowRef.current;
    if (!connectorWindow || connectorWindow.closed) {
      connectorWindowRef.current = null;
      connectorWindowWriteBlockedRef.current = false;
      return;
    }

    const trackedState = connectorWindowStateRef.current;
    const trackedServer = trackedState
      ? findServerBySelectionKey(nextSnapshot, trackedState.serverKey)
      : null;
    const trackedFollowupServer = trackedState?.followupServerKey
      ? findServerBySelectionKey(nextSnapshot, trackedState.followupServerKey)
      : null;
    const liveFollowupDelayMs =
      pendingSequence &&
      trackedFollowupServer &&
      pendingSequence.remaining.length &&
      getServerSelectionKey(pendingSequence.remaining[0]) ===
        getServerSelectionKey(trackedFollowupServer)
        ? Math.max(0, pendingSequence.nextRedirectAt - Date.now())
        : trackedFollowupServer
          ? testSequenceDelayMsRef.current
          : 0;

    if (trackedServer && trackedState) {
      renderConnectorWindow(
        connectorWindow,
        trackedServer,
        trackedFollowupServer,
        trackedState.phase,
        liveFollowupDelayMs
      );
      return;
    }

    if (!enabledRef.current || !nextRedirectPlan.length) return;

    const fallbackServer = nextRedirectPlan[0];
    const fallbackFollowupServer = pendingSequence?.remaining[0] || nextRedirectPlan[1] || null;
    connectorWindowStateRef.current = {
      serverKey: getServerSelectionKey(fallbackServer),
      followupServerKey: getServerSelectionKey(fallbackFollowupServer),
      phase: 'redirect_sent'
    };

    renderConnectorWindow(
      connectorWindow,
      fallbackServer,
      fallbackFollowupServer,
      'redirect_sent',
      pendingSequence
        ? Math.max(0, pendingSequence.nextRedirectAt - Date.now())
        : fallbackFollowupServer
          ? testSequenceDelayMsRef.current
          : 0
    );
  };

  useEffect(() => {
    if (!enabled) return;
    syncConnectorWindow(snapshot, plannedSequence);
  }, [enabled, pendingSequence, plannedSequence, snapshot]);

  const triggerJoinLink = async (
    server: ExporterServerSnapshot,
    followupServer?: ExporterServerSnapshot | null,
    reason: 'redirect' | 'direct' = 'redirect'
  ): Promise<string | null> => {
    const connectorWindow = ensureConnectorWindow();
    if (!connectorWindow) {
      appendLog('Переход отменён: не удалось подготовить служебное окно.');
      return null;
    }

    try {
      connectorWindowStateRef.current = {
        serverKey: getServerSelectionKey(server),
        followupServerKey: getServerSelectionKey(followupServer),
        phase: 'dispatching'
      };
      renderConnectorWindow(
        connectorWindow,
        server,
        followupServer,
        'dispatching',
        followupServer ? testSequenceDelayMsRef.current : 0
      );

      const joinLink = await requestFreshJoinLink(server, reason);
      if (!joinLink) {
        return null;
      }

      window.setTimeout(() => {
        try {
          connectorWindow.location.href = joinLink;
          connectorWindow.focus();
          appendLog(
            followupServer
              ? `Переход отправлен в Steam для ${formatServerDisplayName(server)}. Отдельного ответа от Steam или Squad браузер не получит.`
              : `Переход отправлен в Steam для ${formatServerDisplayName(server)}. Дальше ждём только новые данные.`
          );
          connectorWindowStateRef.current = {
            serverKey: getServerSelectionKey(server),
            followupServerKey: getServerSelectionKey(followupServer),
            phase: 'redirect_sent'
          };
          window.setTimeout(() => {
            renderConnectorWindow(
              connectorWindow,
              server,
              followupServer,
              'redirect_sent',
              followupServer ? testSequenceDelayMsRef.current : 0
            );
          }, 1200);
        } catch {
          appendLog('Переход отменён: браузер не дал обновить служебное окно.');
        }
      }, 40);

      return joinLink;
    } catch {
      appendLog('Переход отменён: браузер не дал обновить служебное окно.');
      return null;
    }
  };

  const scheduleSequenceStep = (remaining: ExporterServerSnapshot[]) => {
    clearPendingSequence();

    const nextDelayMs = testSequenceDelayMsRef.current;
    if (!remaining.length || nextDelayMs <= 0) return;

    const [scheduledNextServer, ...tail] = remaining;
    const nextServerKey = getServerSelectionKey(scheduledNextServer);
    const nextRedirectAt = Date.now() + nextDelayMs;

    setPendingSequence({ remaining, nextRedirectAt });
    appendLog(
      `Запланирован следующий переход через ${Math.ceil(nextDelayMs / 1000)} с: ${formatServerDisplayName(scheduledNextServer)}`
    );

    sequenceTimerRef.current = window.setTimeout(() => {
      sequenceTimerRef.current = null;
      setPendingSequence(null);

      void (async () => {
        if (!enabledRef.current) {
          appendLog(`Следующий переход пропущен: автоподключение уже выключено.`);
          return;
        }

        const latestNextServer =
          findServerBySelectionKey(snapshotRef.current, nextServerKey) || scheduledNextServer;
        const dispatchedJoinLink = await triggerJoinLink(latestNextServer, tail[0] || null);
        if (!dispatchedJoinLink) {
          return;
        }

        appendLog(`Следующий переход запущен: ${formatServerDisplayName(latestNextServer)}`);
        scheduleSequenceStep(tail);
      })();
    }, nextDelayMs);
  };

  const resetRedirectState = () => {
    setLastProcessedTimestamp(0);
    saveLastProcessedTimestamp(0);
    setCooldownUntil(0);
    saveCooldownUntil(0);
    setJoinLinkRequestServerKey('');
    activeRedirectServerKeyRef.current = '';
    saveActiveRedirectServerKey('');
    pendingRedirectServerKeyRef.current = '';
    redirectInFlightRef.current = false;
    connectorWindowStateRef.current = null;
  };

  const handleTestSequenceDelayChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextSeconds = normalizeDelaySeconds(Number(event.target.value));
    const nextDelayMs = nextSeconds * 1000;
    const pendingRemaining = pendingSequence?.remaining || [];

    testSequenceDelayMsRef.current = nextDelayMs;
    setTestSequenceDelayMsOverride(nextDelayMs);
    saveTestSequenceDelayMs(nextDelayMs);
    appendLog(`Тестовая задержка следующего перехода обновлена: ${nextSeconds} с.`);

    if (pendingRemaining.length && enabledRef.current && modeRef.current === 'test') {
      clearPendingSequence();
      scheduleSequenceStep(pendingRemaining);
      appendLog(`Ожидающий следующий переход пересоздан с новой задержкой.`);
    }
  };

  const handleTestSequenceDelayReset = () => {
    const pendingRemaining = pendingSequence?.remaining || [];

    testSequenceDelayMsRef.current = configuredTestSequenceDelayMs;
    setTestSequenceDelayMsOverride(0);
    saveTestSequenceDelayMs(0);
    appendLog(
      `Тестовая задержка следующего перехода сброшена к конфигу: ${configuredTestSequenceDelaySeconds} с.`
    );

    if (pendingRemaining.length && enabledRef.current && modeRef.current === 'test') {
      clearPendingSequence();
      scheduleSequenceStep(pendingRemaining);
      appendLog(`Ожидающий следующий переход пересоздан с задержкой из конфига.`);
    }
  };

  const handlePermissionsCheck = async () => {
    const result = await runPermissionCheck();
    setPermissions(result);
    savePermissions(result);
    appendLog(
      `Проверка браузера: окно=${formatBool(result.popupAllowed)}, Steam=${formatBool(result.steamProtocolReady)}`
    );
  };

  const handleDirectJoin = async (server: ExporterServerSnapshot) => {
    if (!canRequestJoinLink(server)) {
      appendLog(
        `Прямое подключение недоступно: ${formatServerDisplayName(server)} сейчас оффлайн.`
      );
      return;
    }

    const joinLink = await requestFreshJoinLink(server, 'direct');
    if (!joinLink) return;

    try {
      appendLog(`Прямое подключение: ${formatServerDisplayName(server)}`);
      const openedWindow = window.open(joinLink, '_self');
      if (!openedWindow) {
        window.location.href = joinLink;
      }
    } catch {
      appendLog(
        `Прямое подключение не удалось: браузер заблокировал переход к ${formatServerDisplayName(server)}.`
      );
    }
  };

  const handleModeToggle = () => {
    if (!hasConfiguredTestMode) return;

    const nextMode: AppMode = mode === 'production' ? 'test' : 'production';
    clearPendingSequence();
    resetRedirectState();
    modeRef.current = nextMode;
    setMode(nextMode);
    saveMode(nextMode);
    appendLog(nextMode === 'test' ? 'Переключено в тестовый режим.' : 'Переключено в обычный режим.');
    void refreshSnapshot();
  };

  const startRedirectPlan = async (
    redirectPlan: ExporterServerSnapshot[],
    snapshotTimestamp: number,
    cooldownMs: number
  ): Promise<boolean> => {
    const [firstTarget, ...followups] = redirectPlan;
    if (!firstTarget) {
      appendLog('Переход отменён: нет подходящего сервера.');
      return false;
    }

    const targetServerKey = getServerSelectionKey(firstTarget);
    if (redirectInFlightRef.current) {
      if (pendingRedirectServerKeyRef.current === targetServerKey) {
        return false;
      }

      appendLog('Переход отменён: предыдущий переход ещё готовится.');
      return false;
    }

    redirectInFlightRef.current = true;
    pendingRedirectServerKeyRef.current = targetServerKey;
    clearPendingSequence();

    try {
      const dispatchedJoinLink = await triggerJoinLink(firstTarget, followups[0] || null);
      if (!dispatchedJoinLink) {
        return false;
      }

      const nextCooldownUntil = Date.now() + cooldownMs;
      activeRedirectServerKeyRef.current = targetServerKey;
      saveActiveRedirectServerKey(targetServerKey);
      setLastProcessedTimestamp(snapshotTimestamp);
      saveLastProcessedTimestamp(snapshotTimestamp);
      setCooldownUntil(nextCooldownUntil);
      saveCooldownUntil(nextCooldownUntil);

      appendLog(`Переход запущен: ${formatServerDisplayName(firstTarget)}`);
      scheduleSequenceStep(followups);
      return true;
    } finally {
      if (pendingRedirectServerKeyRef.current === targetServerKey) {
        pendingRedirectServerKeyRef.current = '';
      }
      redirectInFlightRef.current = false;
    }
  };

  const refreshSnapshot = async (options?: RefreshSnapshotOptions) => {
    setIsFetching(true);
    setFatalError(null);

    try {
      const nextSnapshot = await fetchCombinedSnapshot(config.exporters);
      applySnapshot(nextSnapshot, options, 'manual');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'неизвестная ошибка снимка';
      setFatalError(message);
      appendLog(`Не удалось получить свежие данные: ${message}`);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    if (typeof window.EventSource === 'undefined') {
      const message = 'Браузер не поддерживает EventSource/SSE.';
      setFatalError(message);
      setIsFetching(false);
      appendLog(`Поток снимков завершился ошибкой: ${message}`);
      return;
    }

    setIsFetching(true);
    setFatalError(null);

    const unsubscribe = subscribeCombinedSnapshot(config.exporters, (nextSnapshot) => {
      setIsFetching(false);
      applySnapshot(nextSnapshot, undefined, 'stream');
    });

    return () => unsubscribe();
  }, [config.exporters]);

  const handleEnable = async () => {
    if (!permissions) {
      appendLog('Автоподключение не запущено: сначала проверьте браузер.');
      return;
    }

    if (!permissions.popupAllowed || !permissions.steamProtocolReady) {
      appendLog('Автоподключение не запущено: браузер ещё не готов.');
      return;
    }

    if (!ensureConnectorWindow()) {
      appendLog('Автоподключение не запущено: не удалось открыть вспомогательное окно.');
      return;
    }

    clearPendingSequence();
    resetRedirectState();
    enabledRef.current = true;

    setEnabled(true);
    saveEnabled(true);
    appendLog(
      isTestModeActive
        ? `Автоподключение включено. Активен тестовый режим: ${testSequencePlanLabel}.`
        : 'Автоподключение включено.'
    );

    const immediateRedirectPlan =
      isTestModeActive
        ? plannedSequence.length === (testModeConfig?.sequenceServerIds?.length || 0)
          ? plannedSequence
          : []
        : selection?.targetServer
          ? [selection.targetServer]
          : [];
    const currentSnapshotIsFresh =
      snapshot.timestamp > 0 && getSnapshotAgeMs(snapshot) <= IMMEDIATE_REDIRECT_SNAPSHOT_MAX_AGE_MS;

    if (immediateRedirectPlan.length && currentSnapshotIsFresh) {
      if (
        await startRedirectPlan(
          immediateRedirectPlan,
          snapshot.timestamp,
          isTestModeActive ? testCooldownMs : effectivePolicy.cooldownMs
        )
      ) {
        appendLog(
          isTestModeActive
            ? 'Тестовый режим: первый переход запущен сразу из текущего снимка.'
            : 'Обычный режим: первый переход запущен сразу по текущим данным.'
        );
        return;
      }
    }

    if (immediateRedirectPlan.length && snapshot.timestamp > 0 && !currentSnapshotIsFresh) {
      appendLog('Текущие данные устарели: обновляю их перед первым переходом.');
    }

    void refreshSnapshot();
  };

  const handleDisable = () => {
    clearPendingSequence();
    closeConnectorWindow();
    setJoinLinkRequestServerKey('');
    activeRedirectServerKeyRef.current = '';
    saveActiveRedirectServerKey('');
    pendingRedirectServerKeyRef.current = '';
    redirectInFlightRef.current = false;
    connectorWindowStateRef.current = null;
    enabledRef.current = false;
    setEnabled(false);
    saveEnabled(false);
    appendLog('Автоподключение выключено.');
  };

  const permissionsReady = Boolean(permissions?.popupAllowed && permissions?.steamProtocolReady);
  const productionMode = activeMode === 'production';
  const statusText = isTestModeActive
    ? plannedSequence.length === (testModeConfig?.sequenceServerIds?.length || 0)
      ? 'Тестовая последовательность готова'
      : 'Тестовая последовательность пока не готова'
    : getSelectionStatusLabel(selection);
  const displayTargetServer = plannedSequence[0] || selection?.targetServer || null;
  const nextFollowupServer = pendingSequence?.remaining[0] || plannedSequence[1] || null;
  const nextFollowupCountdown = pendingSequence
    ? Math.max(0, pendingSequence.nextRedirectAt - now)
    : 0;
  const weakSideSuggestion = getWeakerTeam(displayTargetServer);
  const liveServerCount = snapshot.servers.filter((server) => server.online).length;
  const healthyExporterCount = Math.max(0, config.exporters.length - snapshot.errors.length);
  const nextActionValue = pendingSequence
    ? formatCountdown(nextFollowupCountdown)
    : enabled
      ? formatCountdown(SNAPSHOT_POLL_INTERVAL_MS)
      : 'Готово';
  const nextActionCaption = pendingSequence
    ? nextFollowupServer
      ? formatServerDisplayName(nextFollowupServer)
      : 'Ждём следующий сервер'
    : enabled
      ? 'Статус обновляется автоматически'
      : 'Автоподключение выключено';
  const heroMeshLabel = `${liveServerCount}/${snapshot.servers.length || config.exporters.length}`;
  const heroModeLabel = productionMode ? 'Обычный' : 'Тест';
  const heroModeCaption = productionMode
    ? 'Обычный режим работы'
    : 'Режим для ручной проверки';
  const browserCheckLabel = permissionsReady ? 'Браузер проверен' : 'Проверить браузер';
  const orderedServers = useMemo(
    () =>
      snapshot.servers
        .filter((server) => server.isSeedCandidate)
        .slice()
        .sort((left, right) => {
          const leftTarget = isSameServer(left, displayTargetServer) ? 1 : 0;
          const rightTarget = isSameServer(right, displayTargetServer) ? 1 : 0;
          if (leftTarget !== rightTarget) return rightTarget - leftTarget;
          if (left.online !== right.online) return Number(right.online) - Number(left.online);
          return left.id - right.id;
        }),
    [displayTargetServer, snapshot.servers]
  );
  const activeServer =
    orderedServers.find((server) => getServerSelectionKey(server) === activeServerKey) ||
    orderedServers[0] ||
    null;
  const quickStartSteps: GuideStep[] = [
    {
      id: 'mode',
      step: '1',
      title: 'Выбери режим в первом блоке',
      description: hasConfiguredTestMode
        ? 'Для обычной работы оставляй «Обычный». «Тест» нужен только для проверки и ручного прогона.'
        : 'Сейчас доступен только «Обычный» режим, поэтому ничего переключать не нужно.',
      hints: hasConfiguredTestMode
        ? ['Кнопки: «Обычный» или «Тест»', 'Для обычной работы оставляй «Обычный»']
        : ['Кнопка: «Обычный»', 'Тестовый режим сейчас недоступен']
    },
    {
      id: 'browser',
      step: '2',
      title: 'Нажми «Проверить браузер»',
      description:
        'Проверь, что браузер готов открыть окно и передать подключение в Steam. Пока оба индикатора не зелёные, автоподключение не запустится.',
      hints: ['Кнопка: «Проверить браузер»', 'Смотри статусы окна и Steam']
    },
    {
      id: 'squad',
      step: '3',
      title: 'Запусти Squad и оставь его в главном меню',
      description:
        'Перед включением автоподключения или ручным прямым подключением клиент Squad уже должен быть открыт и ждать в главном меню. Иначе переход в игру может не сработать или сработать нестабильно.',
      hints: ['Squad должен быть запущен', 'Оставь игру в главном меню']
    },
    {
      id: 'connector',
      step: '4',
      title: 'Нажми «Автоподключение»',
      description:
        'После запуска откроется окно автоподключения. Не закрывай его во время работы. Если после отправки оно осталось на вспомогательной карточке, это нормально.',
      hints: ['Кнопка: «Автоподключение»', 'Окно автоподключения не закрывать']
    },
    {
      id: 'manual',
      step: '5',
      title: 'Следи за выбранным сервером и при необходимости заходи вручную',
      description:
        'Ниже видно, куда сейчас стоит заходить. Если нужен ручной вход, используй кнопку «Подключиться напрямую», когда Squad уже открыт в главном меню.',
      hints: ['Карточки: «Выбранный сервер» и «Куда заходить»', 'Кнопка: «Подключиться напрямую»']
    }
  ];

  useEffect(() => {
    if (!orderedServers.length) {
      setActiveServerKey('');
      return;
    }

    setActiveServerKey((current) => {
      if (current && orderedServers.some((server) => getServerSelectionKey(server) === current)) {
        return current;
      }

      return getServerSelectionKey(displayTargetServer) || getServerSelectionKey(orderedServers[0]);
    });
  }, [displayTargetServer, orderedServers]);

  if (route === 'winners') {
    return <WinnersPage snapshot={snapshot} now={now} route={route} vipShopUrl={vipShopUrl} />;
  }

  if (route === 'leaderboards') {
    return <LeaderboardsPage config={config} route={route} vipShopUrl={vipShopUrl} />;
  }

  if (route === 'balance') {
    return <BalancePage snapshot={snapshot} route={route} vipShopUrl={vipShopUrl} />;
  }

  if (route === 'journal') {
    return <JournalPage snapshot={snapshot} route={route} vipShopUrl={vipShopUrl} />;
  }

  return (
    <PageShell
      currentRoute={route}
      vipShopUrl={vipShopUrl}
      testId="app-shell"
    >
      <PageHeader
        eyebrow="Автосид BSS"
        title={APP_DISPLAY_NAME}
        description="Рабочий экран для выбора цели, проверки браузера и запуска подключения без лишних переходов."
        className="hero hero-redesign"
        headingClassName="hero-main hero-main-tight"
        eyebrowClassName="eyebrow"
        descriptionClassName="hero-copy hero-copy-tight"
        titleTestId="hero-title"
        testId="hero"
        headingLead={
          <div className="hero-topline">
            <div className="hero-brand">
              <div className="hero-logo-shell">
                <img className="hero-logo" src={projectLogo} alt={`Логотип ${APP_DISPLAY_NAME}`} />
              </div>
              <div className="hero-brand-copy">
                <span className="hero-brand-kicker">BREAKING SQUAD</span>
                <span className="hero-brand-subtitle">подключение к серверам</span>
              </div>
            </div>

            <InlineHelp
              label="Справка по главному экрану"
              title="Главный экран Автосида"
              description="Здесь включается автоподключение, выбирается режим и видно, что готово к запуску."
              testId="hero-help"
            />
          </div>
        }
        afterDescription={
          <>
            <div className="hero-ribbon" data-testid="hero-ribbon">
              <span className="hero-ribbon-tag">Куда заходим</span>
              <p>
                {displayTargetServer
                  ? `${formatServerDisplayName(displayTargetServer)} · ${statusText}`
                  : 'Подходящий сервер пока не найден.'}
              </p>
            </div>

            <div className="hero-badges hero-badges-tight">
              <span className={classNames('status-pill', enabled ? 'status-good' : 'status-muted')}>
                {enabled ? 'Автоподключение активно' : 'Автоподключение выключено'}
              </span>
              <span
                className={classNames(
                  'status-pill',
                  permissionsReady ? 'status-good' : 'status-danger'
                )}
              >
                {permissionsReady ? 'Браузер готов' : 'Нужна проверка браузера'}
              </span>
            </div>

            <div className="hero-glance-grid" data-testid="hero-glance-grid">
              <article className="hero-glance-card hero-glance-card-emphasis">
                <span className="hero-glance-label">Серверы</span>
                <strong>{heroMeshLabel}</strong>
                <p>доступно сейчас</p>
              </article>
              <article className="hero-glance-card">
                <span className="hero-glance-label">
                  {pendingSequence ? 'Следующий переход' : 'Обновление'}
                </span>
                <strong data-testid="hero-next-action-value">{nextActionValue}</strong>
                <p>{nextActionCaption}</p>
              </article>
              <article className="hero-glance-card">
                <span className="hero-glance-label">Режим</span>
                <strong>{heroModeLabel}</strong>
                <p>{heroModeCaption}</p>
              </article>
            </div>

            <div className="mobile-status-strip" data-testid="mobile-monitor-note">
              <span className="status-pill status-accent">Мобильный просмотр</span>
              <p>Steam-вход доступен с ПК. Здесь остаются цель, серверы и состав.</p>
            </div>
          </>
        }
      >
        <aside className="control-deck desktop-connector">
          <div className="guide-focus guide-focus-neutral">
            <div className="guide-control-label">
              <span className="guide-inline-step" aria-hidden="true">
                1
              </span>
              <span>Режим запуска</span>
            </div>

            <SegmentedControl label="Режим запуска" className="segmented-control">
              <button
                className={classNames('segment', productionMode && 'segment-active')}
                onClick={productionMode ? undefined : handleModeToggle}
                disabled={productionMode}
                data-testid="mode-production"
              >
                Обычный
              </button>
              <button
                className={classNames('segment', isTestModeActive && 'segment-active')}
                onClick={!productionMode ? undefined : handleModeToggle}
                disabled={!hasConfiguredTestMode || isTestModeActive}
                data-testid="mode-test"
              >
                {hasConfiguredTestMode ? `Тест ${testSequencePlanLabel}` : 'Тест недоступен'}
              </button>
            </SegmentedControl>
          </div>

          {hasConfiguredTestMode && isTestModeActive ? (
            <div className="test-delay-card">
              <label className="delay-field">
                <span>Следом</span>
                <input
                  className="delay-input"
                  type="number"
                  min={5}
                  max={600}
                  step={5}
                  value={testSequenceDelaySeconds}
                  onChange={handleTestSequenceDelayChange}
                />
                <small>сек</small>
              </label>
              <button
                className="button"
                onClick={handleTestSequenceDelayReset}
                disabled={!hasManualTestSequenceDelay}
              >
                Сбросить
              </button>
            </div>
          ) : null}

          <div className="readiness-panel guide-focus guide-focus-primary">
            <div className="guide-control-label">
              <span className="guide-inline-step" aria-hidden="true">
                2
              </span>
              <span>Готовность браузера</span>
            </div>

            <div className="control-actions">
              <button
                className={classNames(
                  'button',
                  'guide-button',
                  permissionsReady ? 'button-success guide-focus-success' : 'button-primary'
                )}
                onClick={() => void handlePermissionsCheck()}
                data-testid="check-browser-button"
              >
                <span>{browserCheckLabel}</span>
              </button>
              <button
                className="button"
                onClick={() => void refreshSnapshot()}
                data-testid="refresh-snapshot-button"
              >
                Обновить сейчас
              </button>
            </div>
          </div>

          <button
            className={classNames(
              'power-button',
              'guide-focus',
              'guide-focus-accent',
              enabled && 'power-button-live'
            )}
            onClick={enabled ? handleDisable : () => void handleEnable()}
            data-testid="power-toggle"
            aria-pressed={enabled}
          >
            <div className="power-button-head">
              <span className="guide-inline-step guide-inline-step-large" aria-hidden="true">
                3
              </span>
              <span className="power-caption">Автоподключение</span>
            </div>
            <strong>{enabled ? 'Включён' : 'Выключен'}</strong>
            <small>{statusText}</small>
          </button>

          <div className="signal-grid compact-signal-grid">
            <div className="signal-card signal-card-with-help">
              <div className="signal-card-main">
                <span
                  className={classNames(
                    'signal-dot',
                    permissions?.popupAllowed ? 'signal-dot-good' : 'signal-dot-bad'
                  )}
                />
                <div>
                  <strong>Окно</strong>
                  <p>{permissions?.popupAllowed ? 'готов' : 'не готов'}</p>
                </div>
              </div>
              <InlineHelp
                label="Что делает окно"
                title="Окно автоподключения"
                description="Открывается после включения автоподключения. Оно получает свежую ссылку входа и передаёт её в Steam. После отправки окно может остаться на вспомогательной карточке: Steam и Squad не присылают браузеру отдельный ответ."
                testId="popup-help"
              />
            </div>
            <div className="signal-card signal-card-with-help">
              <div className="signal-card-main">
                <span
                  className={classNames(
                    'signal-dot',
                    permissions?.steamProtocolReady ? 'signal-dot-good' : 'signal-dot-bad'
                  )}
                />
                <div>
                  <strong>Steam</strong>
                  <p>{permissions?.steamProtocolReady ? 'готов' : 'не готов'}</p>
                </div>
              </div>
              <InlineHelp
                label="Что значит Steam"
                title="Steam и Squad"
                description="Это финальная точка подключения. Держи Squad открытым в главном меню, чтобы переход в клиент проходил быстрее и стабильнее."
                testId="steam-help"
              />
            </div>
            <div className="signal-card">
              <span
                className={classNames(
                  'signal-dot',
                  healthyExporterCount === config.exporters.length
                    ? 'signal-dot-good'
                    : 'signal-dot-warn'
                )}
              />
              <div>
                <strong>Связь с серверами</strong>
                <p>
                  {healthyExporterCount}/{config.exporters.length}
                </p>
              </div>
            </div>
            <div className="signal-card">
              <span
                className={classNames(
                  'signal-dot',
                  displayTargetServer ? 'signal-dot-good' : 'signal-dot-bad'
                )}
              />
              <div>
                <strong>Выбранный сервер</strong>
                <p>{displayTargetServer ? 'есть' : 'нет'}</p>
              </div>
            </div>
          </div>
        </aside>
      </PageHeader>

      <details className="panel panel-span guide-spoiler">
        <summary className="details-summary">
          <span>Как запустить</span>
          <span className="badge badge-muted">{quickStartSteps.length} шагов</span>
        </summary>
        <div className="guide-spoiler-body">
          <p className="guide-spoiler-copy">
            Весь сценарий укладывается в несколько коротких действий: выбрать режим, проверить
            браузер, открыть Squad и оставить его в главном меню, затем включить автоподключение
            или при необходимости зайти вручную.
          </p>

          <ol className="guide-steps" aria-label="Пошаговая инструкция">
            {quickStartSteps.map((item) => (
              <li key={item.id} className="guide-step">
                <span className="guide-step-index" aria-hidden="true">
                  {item.step}
                </span>
                <div className="guide-step-copy">
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                  <div className="guide-pill-row">
                    {item.hints.map((hint) => (
                      <span key={`${item.id}-${hint}`} className="guide-pill">
                        {hint}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </details>

      {(fatalError || snapshot.errors.length > 0) && (
        <Notice
          title={USER_STATE_COPY.unavailable.title}
          tone="danger"
          className="alert-strip"
        >
          <p>{USER_STATE_COPY.unavailable.description}</p>
        </Notice>
      )}

      <section className="section-shell">
        <div className="section-head">
          <div>
            <span className="section-eyebrow">Сводка</span>
            <h2>Что происходит прямо сейчас</h2>
          </div>
          <p>Куда заходить и что сейчас доступно.</p>
        </div>

        <div className="overview-grid">
          <article
            className="overview-card overview-card-spotlight"
            data-testid="overview-target"
          >
            <span className="overview-label">Выбранный сервер</span>
            <strong>
              {displayTargetServer
                ? formatServerDisplayName(displayTargetServer)
                : 'Подходящий сервер не найден'}
            </strong>
            <p>{statusText}</p>
          </article>

          <article className="overview-card">
            <span className="overview-label">Куда заходить</span>
            <strong>
              {weakSideSuggestion
                ? formatTeamDisplayName(weakSideSuggestion)
                : 'Стороны пока ровные'}
            </strong>
            <p>{weakSideSuggestion ? 'Слабая сторона на выбранном сервере' : 'Ждём состав сторон'}</p>
          </article>

          <article className="overview-card">
            <span className="overview-label">Обновлено</span>
            <strong>{formatCompactTimestamp(snapshot.generatedAt)}</strong>
            <p>
              {liveServerCount}/{snapshot.servers.length || config.exporters.length} серверов в сети
            </p>
          </article>

          <article className="overview-card">
            <span className="overview-label">{pendingSequence ? 'Следующий переход' : 'Обновление'}</span>
            <strong data-testid="overview-next-action-value">
              {pendingSequence
                ? formatCountdown(nextFollowupCountdown)
                : enabled
                  ? formatCountdown(SNAPSHOT_POLL_INTERVAL_MS)
                  : '—'}
            </strong>
            <p>
              {pendingSequence
                ? nextFollowupServer
                  ? formatServerDisplayName(nextFollowupServer)
                  : 'Ждём следующий сервер'
                : enabled
                  ? 'Статус обновляется автоматически'
                  : 'Автоподключение выключено'}
            </p>
          </article>
        </div>
      </section>

      <ServerSelector
        label="Выбор сервера"
        className="section-shell server-switcher"
      >
        <div className="section-head">
          <div>
            <span className="section-eyebrow">Серверы</span>
            <h2>Выбор сервера</h2>
          </div>
          <p>Открой карточку ниже, чтобы посмотреть состав и подключиться вручную.</p>
        </div>

        <div className="server-switcher-track" data-testid="server-switcher-track">
          {orderedServers.map((server) => {
            const serverKey = getServerSelectionKey(server);
            const isActive = serverKey === getServerSelectionKey(activeServer);
            const isTarget = isSameServer(server, displayTargetServer);
            const canDirectJoin = canRequestJoinLink(server);
            const joinRequestPending = isJoinLinkRequestPending(server);
            const [leftTeam, rightTeam] = server.teams;
            const switcherHoursLine =
              leftTeam && rightTeam
                ? `${formatTeamDisplayName(leftTeam)}: ${formatHours(
                    leftTeam.totalPlaytimeHours
                  )} · ${formatTeamDisplayName(rightTeam)}: ${formatHours(
                    rightTeam.totalPlaytimeHours
                  )}`
                : 'Сводка сторон пока не готова';

            return (
              <article
                key={serverKey}
                className={classNames(
                  'server-switcher-card',
                  isActive && 'server-switcher-card-active',
                  isTarget && 'server-switcher-card-target'
                )}
                data-testid={`server-card-${server.id}`}
              >
                <button
                  type="button"
                  className="server-switcher-select"
                  onClick={() => setActiveServerKey(serverKey)}
                >
                  <div className="server-switcher-head">
                    <strong>{formatServerDisplayName(server)}</strong>
                    <span
                      className={classNames(
                        'server-state',
                        server.online ? 'state-live' : 'state-dead'
                      )}
                    >
                      {server.online ? 'в сети' : 'оффлайн'}
                    </span>
                  </div>
                  <div className="server-switcher-meta">
                    <span>{server.playerCount}/{server.maxPlayers || '—'}</span>
                    {isTarget ? <span className="server-switcher-accent">выбран</span> : null}
                  </div>
                  <p>{switcherHoursLine}</p>
                </button>

                <div className="server-switcher-actions">
                  <button
                    type="button"
                    className="button button-small"
                    onClick={() => void handleDirectJoin(server)}
                    disabled={!canDirectJoin || joinRequestPending}
                    data-testid={`direct-join-${server.id}`}
                  >
                    {joinRequestPending
                      ? 'Запрашиваем ссылку...'
                      : canDirectJoin
                        ? 'Подключиться'
                        : 'Сервер оффлайн'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </ServerSelector>

      <section className="section-shell server-stack">
        <div className="section-head">
          <div>
            <span className="section-eyebrow">Выбранный сервер</span>
            <h2>Информация о сервере</h2>
          </div>
          <p>Онлайн, состав сторон и ручное подключение.</p>
        </div>

        {activeServer ? (() => {
          const server = activeServer;
          const canDirectJoin = canRequestJoinLink(server);
          const joinRequestPending = isJoinLinkRequestPending(server);
          const seedLimit = effectivePolicy.maxSeedPlayers || server.maxPlayers || 0;
          const loadPercent = getServerLoadPercent(server);
          const seedPercent = getSeedProgressPercent(server, seedLimit);
          const weakerTeam = getWeakerTeam(server);
          const [teamOne, teamTwo] = server.teams;

          return (
            <article
              key={getServerSelectionKey(server)}
              className={classNames(
                'server-board',
                server.online && 'server-board-live',
                isSameServer(server, displayTargetServer) && 'server-board-target'
              )}
              data-testid="active-server-board"
            >
              <div className="server-board-top">
                <div className="server-title-block">
                  <div className="server-title-row">
                    <div className="server-title-main">
                      <h2>{formatServerDisplayName(server)}</h2>
                      <InlineHelp
                        label="Справка по карточке сервера"
                        title="Карточка выбранного сервера"
                        description="Это основной блок выбранного сервера. Здесь видно текущий онлайн, стороны и кнопка ручного подключения."
                        testId="server-help"
                      />
                    </div>
                    <div className="server-chip-row">
                      <span
                        className={classNames(
                          'server-state',
                          server.online ? 'state-live' : 'state-dead'
                        )}
                      >
                        {server.online ? 'в сети' : 'оффлайн'}
                      </span>
                      <span
                        className={classNames(
                          'server-state',
                          server.isSeedCandidate ? 'state-live' : 'state-dead'
                        )}
                      >
                        сид
                      </span>
                      <span className="server-state state-join">вход по запросу</span>
                      {isSameServer(server, displayTargetServer) ? (
                        <span className="server-state state-target">выбран</span>
                      ) : null}
                    </div>
                  </div>
                  <p className="server-board-copy">
                    {weakerTeam
                      ? `Сторона для захода: ${formatTeamDisplayName(weakerTeam)}`
                      : 'Смотри состав сторон и общий баланс часов ниже.'}
                  </p>
                  <div className="server-board-actions">
                    <button
                      type="button"
                      className="button button-primary guide-button guide-focus guide-focus-accent"
                      onClick={() => void handleDirectJoin(server)}
                      disabled={!canDirectJoin || joinRequestPending}
                      data-testid="primary-direct-join"
                    >
                      <span className="guide-inline-step" aria-hidden="true">
                        4
                      </span>
                      <span>
                        {joinRequestPending
                          ? 'Запрашиваем ссылку...'
                          : canDirectJoin
                            ? 'Подключиться напрямую'
                            : 'Сервер оффлайн'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="server-metrics">
                  <div className="server-metric">
                    <span>Онлайн</span>
                    <strong>
                      {server.playerCount}/{server.maxPlayers || '—'}
                    </strong>
                  </div>
                  <div className="server-metric">
                    <span>Прогресс сида</span>
                    <strong>
                      {server.playerCount}/{seedLimit || '—'}
                    </strong>
                  </div>
                  <div className="server-metric">
                    <span>Очередь</span>
                    <strong>{server.queueLength || 0}</strong>
                  </div>
                  <div className="server-metric">
                    <span>Обновлено</span>
                    <strong>{formatCompactTimestamp(server.updatedAt)}</strong>
                  </div>
                </div>
              </div>

              <div className="meter-block">
                <div className="meter-line">
                  <span>Загрузка</span>
                  <strong>{loadPercent}%</strong>
                </div>
                <div className="server-meter server-meter-neutral">
                  <span style={{ width: `${loadPercent}%` }} />
                </div>
              </div>

              <div className="meter-block">
                <div className="meter-line">
                  <span>Прогресс рассида</span>
                  <strong>{seedPercent}%</strong>
                </div>
                <div className="server-meter server-meter-seed">
                  <span
                    style={{
                      width: `${seedPercent}%`,
                      background: getSeedProgressGradient(seedPercent)
                    }}
                  />
                </div>
              </div>

              <div className="server-facts dense-facts">
                <div className="fact-pill">
                  <span>Слой</span>
                  <strong>{server.currentLayer || '—'}</strong>
                </div>
                <div className="fact-pill">
                  <span>Режим</span>
                  <strong>{server.gameMode || '—'}</strong>
                </div>
                <div className="fact-pill">
                  <span>Стороны</span>
                  <strong>{server.teams.length || 0}</strong>
                </div>
                <div className="fact-pill">
                  <span>Игроков с часами</span>
                  <strong>
                    {server.teams.reduce((sum, team) => sum + (team.playersWithHours || 0), 0)}
                  </strong>
                </div>
              </div>

              {server.error ? (
                <p className="error-text">{USER_STATE_COPY.unavailable.description}</p>
              ) : null}

              <div className="teams-grid">
                {teamOne ? (
                  <TeamPanel
                    team={teamOne}
                    opponent={teamTwo || null}
                    teamBalancerSnapshot={server.teamBalancer}
                    teamBalancerMode={teamBalancerProposalMode}
                  />
                ) : null}
                {teamTwo ? (
                  <TeamPanel
                    team={teamTwo}
                    opponent={teamOne || null}
                    teamBalancerSnapshot={server.teamBalancer}
                    teamBalancerMode={teamBalancerProposalMode}
                  />
                ) : null}
                {!teamOne && !teamTwo ? (
                  <div className="team-panel team-panel-empty">
                    Данные о составе сторон пока не поступили.
                  </div>
                ) : null}
              </div>
            </article>
          );
        })() : (
          <article className="server-board">
            <div className="roster-empty">Данные о серверах пока не поступили.</div>
          </article>
        )}
      </section>

    </PageShell>
  );
}
