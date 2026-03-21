import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

import { runPermissionCheck } from './lib/permissions';
import {
  buildSelectionState,
  getSelectionStatusLabel,
  resolveSeedPolicy
} from './lib/seed-policy';
import { fetchCombinedSnapshot } from './lib/snapshot';
import {
  loadStoredState,
  saveCooldownUntil,
  saveEnabled,
  saveLastProcessedTimestamp,
  saveMode,
  savePermissions,
  saveTestSequenceDelayMs
} from './lib/storage';
import type {
  AppMode,
  AppConfig,
  BrowserPermissions,
  CombinedSnapshot,
  ExporterServerSnapshot,
  SelectionState
} from './types';

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

const EMPTY_SNAPSHOT: CombinedSnapshot = {
  timestamp: 0,
  generatedAt: '',
  servers: [],
  errors: []
};

const IMMEDIATE_REDIRECT_SNAPSHOT_MAX_AGE_MS = 15_000;

function formatTimestamp(value: number | string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(date);
}

function formatBool(value: boolean): string {
  return value ? 'Да' : 'Нет';
}

function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0 s';
  return `${Math.ceil(ms / 1000)} s`;
}

function formatCompactTimestamp(value: number | string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
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

function canUseRedirectSequenceTarget(server: ExporterServerSnapshot | undefined): boolean {
  return Boolean(server?.online && server.joinLink);
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

export default function App({ config }: AppProps) {
  const storedState = useMemo(() => loadStoredState(), []);
  const hasConfiguredTestMode = Boolean(config.app.testMode?.sequenceServerIds?.length);
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

  const enabledRef = useRef(enabled);
  const modeRef = useRef(mode);
  const cooldownUntilRef = useRef(cooldownUntil);
  const lastProcessedTimestampRef = useRef(lastProcessedTimestamp);
  const permissionsRef = useRef(permissions);
  const connectorWindowRef = useRef<Window | null>(null);
  const sequenceTimerRef = useRef<number | null>(null);
  const testSequenceDelayMsRef = useRef<number>(0);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

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

  const clearPendingSequence = () => {
    if (sequenceTimerRef.current) {
      window.clearTimeout(sequenceTimerRef.current);
      sequenceTimerRef.current = null;
    }

    setPendingSequence(null);
  };

  const resetRedirectState = () => {
    setLastProcessedTimestamp(0);
    saveLastProcessedTimestamp(0);
    setCooldownUntil(0);
    saveCooldownUntil(0);
  };

  const closeConnectorWindow = () => {
    const connectorWindow = connectorWindowRef.current;
    if (!connectorWindow || connectorWindow.closed) return;

    try {
      connectorWindow.close();
    } catch {
      // Ignore user-agent specific close failures.
    }
  };

  const ensureConnectorWindow = (): Window | null => {
    const existingWindow = connectorWindowRef.current;
    if (existingWindow && !existingWindow.closed) {
      return existingWindow;
    }

    try {
      const nextWindow = window.open('', 'autoseed-connector', 'width=420,height=220');
      if (!nextWindow) return null;

      nextWindow.document.write(
        '<!doctype html><title>BSS AutoConnect</title><body style="font:14px sans-serif;padding:16px">Служебное окно автоконнектора.<br/>Не закрывайте его во время тестовой последовательности.</body>'
      );
      nextWindow.document.close();
      connectorWindowRef.current = nextWindow;
      return nextWindow;
    } catch {
      return null;
    }
  };

  const triggerJoinLink = (joinLink: string): boolean => {
    const connectorWindow = ensureConnectorWindow();
    if (!connectorWindow) {
      appendLog('Redirect подавлен: не удалось подготовить служебное окно.');
      return false;
    }

    try {
      connectorWindow.location.href = joinLink;
      connectorWindow.focus();
      return true;
    } catch {
      appendLog('Redirect подавлен: браузер не дал обновить служебное окно.');
      return false;
    }
  };

  const scheduleSequenceStep = (remaining: ExporterServerSnapshot[]) => {
    clearPendingSequence();

    const nextDelayMs = testSequenceDelayMsRef.current;
    if (!remaining.length || nextDelayMs <= 0) return;

    const [nextServer, ...tail] = remaining;
    const nextRedirectAt = Date.now() + nextDelayMs;

    setPendingSequence({ remaining, nextRedirectAt });
    appendLog(
      `Запланирован follow-up redirect через ${Math.ceil(nextDelayMs / 1000)} s: ${nextServer.name}`
    );

    sequenceTimerRef.current = window.setTimeout(() => {
      sequenceTimerRef.current = null;
      setPendingSequence(null);

      if (!enabledRef.current) {
        appendLog(`Follow-up redirect пропущен: автоконнектор уже выключен.`);
        return;
      }

      if (!nextServer.joinLink) {
        appendLog(`Follow-up redirect пропущен: у ${nextServer.name} нет joinLink.`);
        return;
      }

      if (!triggerJoinLink(nextServer.joinLink)) {
        return;
      }

      appendLog(`Follow-up redirect triggered: ${nextServer.joinLink}`);
      scheduleSequenceStep(tail);
    }, nextDelayMs);
  };

  const handleTestSequenceDelayChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextSeconds = normalizeDelaySeconds(Number(event.target.value));
    const nextDelayMs = nextSeconds * 1000;
    const pendingRemaining = pendingSequence?.remaining || [];

    testSequenceDelayMsRef.current = nextDelayMs;
    setTestSequenceDelayMsOverride(nextDelayMs);
    saveTestSequenceDelayMs(nextDelayMs);
    appendLog(`Тестовая задержка follow-up обновлена: ${nextSeconds} s.`);

    if (pendingRemaining.length && enabledRef.current && modeRef.current === 'test') {
      clearPendingSequence();
      scheduleSequenceStep(pendingRemaining);
      appendLog(`Ожидающий follow-up redirect пересоздан с новой задержкой.`);
    }
  };

  const handleTestSequenceDelayReset = () => {
    const pendingRemaining = pendingSequence?.remaining || [];

    testSequenceDelayMsRef.current = configuredTestSequenceDelayMs;
    setTestSequenceDelayMsOverride(0);
    saveTestSequenceDelayMs(0);
    appendLog(`Тестовая задержка follow-up сброшена к конфигу: ${configuredTestSequenceDelaySeconds} s.`);

    if (pendingRemaining.length && enabledRef.current && modeRef.current === 'test') {
      clearPendingSequence();
      scheduleSequenceStep(pendingRemaining);
      appendLog(`Ожидающий follow-up redirect пересоздан с задержкой из конфига.`);
    }
  };

  const handlePermissionsCheck = async () => {
    const result = await runPermissionCheck();
    setPermissions(result);
    savePermissions(result);
    appendLog(
      `Проверка permissions: popup=${formatBool(result.popupAllowed)}, steam=${formatBool(result.steamProtocolReady)}`
    );
  };

  const handleModeChange = (nextMode: AppMode) => {
    if (nextMode === mode) return;
    if (nextMode === 'test' && !hasConfiguredTestMode) return;

    clearPendingSequence();
    resetRedirectState();
    modeRef.current = nextMode;
    setMode(nextMode);
    saveMode(nextMode);
    appendLog(nextMode === 'test' ? 'Переключено в тестовый режим.' : 'Переключено в боевой режим.');
    void refreshSnapshot();
  };

  const startRedirectPlan = (
    redirectPlan: ExporterServerSnapshot[],
    snapshotTimestamp: number,
    cooldownMs: number
  ): boolean => {
    const [firstTarget, ...followups] = redirectPlan;
    if (!firstTarget?.joinLink) {
      appendLog('Redirect подавлен: нет готового joinLink.');
      return false;
    }

    const nextCooldownUntil = Date.now() + cooldownMs;
    setLastProcessedTimestamp(snapshotTimestamp);
    saveLastProcessedTimestamp(snapshotTimestamp);
    setCooldownUntil(nextCooldownUntil);
    saveCooldownUntil(nextCooldownUntil);
    clearPendingSequence();

    if (!triggerJoinLink(firstTarget.joinLink)) {
      return false;
    }

    appendLog(`Redirect triggered: ${firstTarget.joinLink}`);
    scheduleSequenceStep(followups);
    return true;
  };

  const refreshSnapshot = async (options?: RefreshSnapshotOptions) => {
    setIsFetching(true);
    setFatalError(null);

    try {
      const nextSnapshot = await fetchCombinedSnapshot(config.exporters);
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
        nextSnapshot.errors.forEach((error) => appendLog(`Ошибка exporter: ${error}`));
      }

      appendLog(
        `Snapshot fetched: target=${nextRedirectPlan[0]?.name || nextSelection.targetServer?.name || 'none'}, mode=${
          testModeEnabled ? 'test' : nextSelection.nightMode ? 'night' : 'day'
        }`
      );

      if (!enabledRef.current) return;

      if (!permissionsRef.current?.popupAllowed || !permissionsRef.current?.steamProtocolReady) {
        appendLog('Redirect подавлен: нет подтверждённых browser permissions.');
        return;
      }

      if (!nextRedirectPlan[0]?.joinLink) {
        appendLog(
          testModeEnabled
            ? 'Redirect подавлен: тестовый режим пока не готов.'
            : 'Redirect подавлен: нет подходящего сервера или joinLink.'
        );
        return;
      }

      if (!options?.forceRedirect && nextSnapshot.timestamp <= lastProcessedTimestampRef.current) {
        appendLog('Redirect подавлен: snapshot уже обработан.');
        return;
      }

      if (!options?.forceRedirect && Date.now() < cooldownUntilRef.current) {
        appendLog('Redirect подавлен: активен cooldown.');
        return;
      }

      startRedirectPlan(
        nextRedirectPlan,
        nextSnapshot.timestamp,
        testModeEnabled ? testCooldownMs : nextPolicy.cooldownMs
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown snapshot error';
      setFatalError(message);
      appendLog(`Snapshot fetch failed: ${message}`);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    void refreshSnapshot();
    const interval = window.setInterval(() => {
      void refreshSnapshot();
    }, config.app.pollIntervalMs);

    return () => window.clearInterval(interval);
  }, [config]);

  const handleEnable = async () => {
    if (!permissions) {
      appendLog('Автоконнектор не запущен: сначала вручную выполните локальную проверку permissions.');
      return;
    }

    if (!permissions.popupAllowed || !permissions.steamProtocolReady) {
      appendLog('Автоконнектор не запущен: browser permissions не подтверждены.');
      return;
    }

    if (!ensureConnectorWindow()) {
      appendLog('Автоконнектор не запущен: не удалось открыть служебное окно.');
      return;
    }

    clearPendingSequence();
    resetRedirectState();
    enabledRef.current = true;

    setEnabled(true);
    saveEnabled(true);
    appendLog(
      isTestModeActive
        ? `Автоконнектор включён. Активен тестовый режим: ${testSequencePlanLabel}.`
        : 'Автоконнектор включён.'
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
        startRedirectPlan(
          immediateRedirectPlan,
          snapshot.timestamp,
          isTestModeActive ? testCooldownMs : effectivePolicy.cooldownMs
        )
      ) {
        appendLog(
          isTestModeActive
            ? 'Тестовый режим: первый redirect запущен сразу из текущего snapshot.'
            : 'Боевой режим: первый redirect запущен сразу из текущего snapshot.'
        );
        return;
      }
    }

    if (immediateRedirectPlan.length && snapshot.timestamp > 0 && !currentSnapshotIsFresh) {
      appendLog('Текущий snapshot устарел: запрашиваю свежие данные перед первичным redirect.');
    }

    void refreshSnapshot({ forceRedirect: true });
  };

  const handleDisable = () => {
    clearPendingSequence();
    closeConnectorWindow();
    enabledRef.current = false;
    setEnabled(false);
    saveEnabled(false);
    appendLog('Автоконнектор выключен.');
  };

  const cooldownLeftMs = Math.max(0, cooldownUntil - now);
  const statusText = isTestModeActive
    ? plannedSequence.length === (testModeConfig?.sequenceServerIds?.length || 0)
      ? 'Тестовая последовательность готова'
      : 'Тестовая последовательность пока не готова'
    : getSelectionStatusLabel(selection);
  const permissionsReady = Boolean(permissions?.popupAllowed && permissions?.steamProtocolReady);
  const displayTargetServer = plannedSequence[0] || selection?.targetServer || null;
  const nextFollowupServer = pendingSequence?.remaining[0] || plannedSequence[1] || null;
  const nextFollowupCountdown = pendingSequence
    ? Math.max(0, pendingSequence.nextRedirectAt - now)
    : 0;
  const productionMode = activeMode === 'production';
  const liveServerCount = snapshot.servers.filter((server) => server.online).length;
  const healthyExporterCount = Math.max(0, config.exporters.length - snapshot.errors.length);
  const latestLog = logs[logs.length - 1] || 'Событий пока нет.';

  return (
    <div className="shell">
      <header className="hero">
        <div className="hero-main">
          <p className="eyebrow">BSS Seed Connect</p>
          <h1>{config.app.title}</h1>
          <p className="hero-copy">
            Публичный snapshot SquadJS exporter-а, автоматический выбор seed-сервера и redirect в
            Squad через Steam.
          </p>
          <div className="hero-badges">
            <span className={classNames('status-pill', enabled ? 'status-good' : 'status-muted')}>
              {enabled ? 'Автоконнектор включён' : 'Автоконнектор выключен'}
            </span>
            <span
              className={classNames(
                'status-pill',
                permissionsReady ? 'status-good' : 'status-danger'
              )}
            >
              {permissionsReady ? 'Браузер готов' : 'Нужна проверка браузера'}
            </span>
            <span
              className={classNames(
                'status-pill',
                displayTargetServer ? 'status-good' : 'status-danger'
              )}
            >
              {displayTargetServer ? statusText : 'Цель не выбрана'}
            </span>
            <span className="status-pill status-accent">
              {productionMode ? 'Боевой режим' : `Тест ${testSequencePlanLabel}`}
            </span>
          </div>
        </div>
        <div className="hero-side hero-metrics">
          <div className="stat-card">
            <span>Текущая цель</span>
            <strong>{displayTargetServer?.name || 'Нет подходящего сервера'}</strong>
          </div>
          <div className="metric-row">
            <div className="stat-card stat-card-compact">
              <span>Серверы</span>
              <strong>
                {liveServerCount}/{snapshot.servers.length || config.exporters.length}
              </strong>
            </div>
            <div className="stat-card stat-card-compact">
              <span>Exporter</span>
              <strong>
                {healthyExporterCount}/{config.exporters.length}
              </strong>
            </div>
            <div className="stat-card stat-card-compact">
              <span>Snapshot</span>
              <strong>{formatCompactTimestamp(snapshot.generatedAt)}</strong>
            </div>
            <div className="stat-card stat-card-compact">
              <span>{pendingSequence ? 'Follow-up' : 'Cooldown'}</span>
              <strong>
                {pendingSequence
                  ? formatCountdown(nextFollowupCountdown)
                  : cooldownLeftMs > 0
                    ? formatCountdown(cooldownLeftMs)
                    : '—'}
              </strong>
            </div>
          </div>
        </div>
      </header>

      {(fatalError || snapshot.errors.length) && (
        <section className="alert-strip">
          {fatalError ? <p>{fatalError}</p> : null}
          {snapshot.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </section>
      )}

      <main className="dashboard-grid compact-grid" style={{ marginTop: 20 }}>
        <section className="panel panel-span">
          <div className="panel-header">
            <h2>Управление</h2>
            <span
              className={classNames(
                'badge',
                pendingSequence ? 'badge-warn' : enabled ? 'badge-live' : 'badge-muted'
              )}
            >
              {pendingSequence
                ? `Follow-up через ${formatCountdown(nextFollowupCountdown)}`
                : isFetching
                  ? 'Polling…'
                  : enabled
                    ? 'Активен'
                    : 'Idle'}
            </span>
          </div>
          <div className="actions">
            <button
              className="button button-primary"
              onClick={enabled ? handleDisable : () => void handleEnable()}
            >
              {enabled ? 'Выключить автоконнектор' : 'Включить автоконнектор'}
            </button>
            <button className="button button-primary" onClick={() => void handlePermissionsCheck()}>
              Проверить браузер
            </button>
            <button className="button" onClick={() => void refreshSnapshot()}>
              Обновить сейчас
            </button>
          </div>
          <div className="mode-switch">
            <button
              className={classNames('button', productionMode && 'button-mode-active')}
              onClick={() => handleModeChange('production')}
            >
              Боевой режим
            </button>
            <button
              className={classNames('button', isTestModeActive && 'button-mode-active')}
              onClick={() => handleModeChange('test')}
              disabled={!hasConfiguredTestMode}
            >
              Тестовый режим
            </button>
          </div>
          {hasConfiguredTestMode ? (
            <div className="test-tuning-row">
              <label className="delay-field">
                <span>Follow-up в тесте</span>
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
                Сбросить к конфигу
              </button>
            </div>
          ) : null}
          <div className="signal-grid">
            <div className="signal-card">
              <span
                className={classNames(
                  'signal-dot',
                  permissions?.popupAllowed ? 'signal-dot-good' : 'signal-dot-bad'
                )}
              />
              <div>
                <strong>Popup</strong>
                <p>{permissions?.popupAllowed ? 'Разрешены' : 'Не подтверждены'}</p>
              </div>
            </div>
            <div className="signal-card">
              <span
                className={classNames(
                  'signal-dot',
                  permissions?.steamProtocolReady ? 'signal-dot-good' : 'signal-dot-bad'
                )}
              />
              <div>
                <strong>Steam protocol</strong>
                <p>{permissions?.steamProtocolReady ? 'Готов' : 'Не подтверждён'}</p>
              </div>
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
                <strong>Exporter</strong>
                <p>
                  {healthyExporterCount}/{config.exporters.length} доступны
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
                <strong>Target</strong>
                <p>{displayTargetServer ? 'Найден' : 'Не найден'}</p>
              </div>
            </div>
          </div>
          <p className="panel-note">
            После проверки браузера оставь Steam и Squad запущенными, а сам Squad держи в главном
            меню.
          </p>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Правила</h2>
            <span className={classNames('badge', productionMode ? 'badge-live' : 'badge-warn')}>
              {productionMode ? 'Боевой режим' : `Тест ${testSequencePlanLabel}`}
            </span>
          </div>
          <div className="rule-grid">
            <div className="rule-card">
              <span>Приоритет</span>
              <strong>{effectivePolicy.priorityOrder.join(' → ')}</strong>
            </div>
            <div className="rule-card">
              <span>Ночь</span>
              <strong>
                {effectivePolicy.nightWindowStart} - {effectivePolicy.nightWindowEnd}
              </strong>
            </div>
            <div className="rule-card">
              <span>Ночной target</span>
              <strong>{effectivePolicy.nightPreferredServerId}</strong>
            </div>
            <div className="rule-card">
              <span>Лимит seed</span>
              <strong>&lt; {effectivePolicy.maxSeedPlayers}</strong>
            </div>
            <div className="rule-card">
              <span>Switch delta</span>
              <strong>&gt; {effectivePolicy.switchDelta}</strong>
            </div>
            <div className="rule-card">
              <span>Polling</span>
              <strong>{Math.round(config.app.pollIntervalMs / 1000)} s</strong>
            </div>
            {hasConfiguredTestMode ? (
              <>
                <div className="rule-card">
                  <span>Тестовый план</span>
                  <strong>{testSequencePlanLabel}</strong>
                </div>
                <div className="rule-card">
                  <span>Задержка теста</span>
                  <strong>
                    {Math.round(testSequenceDelayMs / 1000)} s
                    {hasManualTestSequenceDelay ? ' · local' : ''}
                  </strong>
                </div>
                <div className="rule-card">
                  <span>Cooldown теста</span>
                  <strong>{Math.round(testCooldownMs / 1000)} s</strong>
                </div>
              </>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Состояние</h2>
            <span
              className={classNames(
                'badge',
                selection?.nightMode ? 'badge-warn' : 'badge-muted'
              )}
            >
              {selection?.nightMode ? 'Ночной режим' : 'Дневной режим'}
            </span>
          </div>
          <div className="summary-stack">
            <div className="summary-row">
              <span>Активный режим</span>
              <strong>{productionMode ? 'Боевой' : `Тестовый ${testSequencePlanLabel}`}</strong>
            </div>
            <div className="summary-row">
              <span>Последний snapshot</span>
              <strong>{formatTimestamp(snapshot.generatedAt)}</strong>
            </div>
            <div className="summary-row">
              <span>Последняя проверка браузера</span>
              <strong>{permissions ? formatTimestamp(permissions.checkedAt) : '—'}</strong>
            </div>
            <div className="summary-row">
              <span>Cooldown</span>
              <strong>{cooldownLeftMs > 0 ? formatCountdown(cooldownLeftMs) : 'Не активен'}</strong>
            </div>
            {pendingSequence ? (
              <div className="summary-row">
                <span>Следующий redirect</span>
                <strong>{nextFollowupServer?.name || '—'}</strong>
              </div>
            ) : null}
            <div className="summary-row summary-row-log">
              <span>Последнее событие</span>
              <strong>{latestLog}</strong>
            </div>
          </div>
        </section>

        <section className="panel panel-span">
          <div className="panel-header">
            <h2>Серверы</h2>
            <span className="badge badge-live">{snapshot.servers.length}</span>
          </div>
          <div className="server-grid">
            {snapshot.servers.map((server: ExporterServerSnapshot) => (
              <article
                key={`${server.sourceUrl}-${server.id}-${server.code}`}
                className={classNames(
                  'server-card',
                  server.online && 'server-card-live',
                  displayTargetServer?.id === server.id && 'server-card-target'
                )}
              >
                <div className="server-card-head compact-head">
                  <div>
                    <h3>{server.name}</h3>
                    <p className="server-subline">{server.code}</p>
                  </div>
                  <div className="server-chip-row">
                    <span
                      className={classNames(
                        'server-state',
                        server.online ? 'state-live' : 'state-dead'
                      )}
                    >
                      {server.online ? 'online' : 'offline'}
                    </span>
                    <span
                      className={classNames(
                        'server-state',
                        server.isSeedCandidate ? 'state-live' : 'state-dead'
                      )}
                    >
                      seed
                    </span>
                    {displayTargetServer?.id === server.id ? (
                      <span className="server-state state-target">target</span>
                    ) : null}
                  </div>
                </div>
                <div className="server-load">
                  <div className="server-load-main">
                    <strong>{server.playerCount}</strong>
                    <span>/{server.maxPlayers || '—'}</span>
                  </div>
                  <em>{getServerLoadPercent(server)}%</em>
                </div>
                <div className="server-meter">
                  <span style={{ width: `${getServerLoadPercent(server)}%` }} />
                </div>
                <div className="server-facts">
                  <div className="fact-pill">
                    <span>Очередь</span>
                    <strong>{server.queueLength || 0}</strong>
                  </div>
                  <div className="fact-pill">
                    <span>Слой</span>
                    <strong>{server.currentLayer || '—'}</strong>
                  </div>
                  <div className="fact-pill">
                    <span>Режим</span>
                    <strong>{server.gameMode || '—'}</strong>
                  </div>
                </div>
                {server.error ? <p className="error-text">{server.error}</p> : null}
              </article>
            ))}
          </div>
        </section>

        <details className="panel panel-span panel-details">
          <summary className="details-summary">
            <span>Debug log</span>
            <span className="badge badge-muted">{logs.length}</span>
          </summary>
          <div className="log-box">
            {logs.length ? logs.map((line) => <pre key={line}>{line}</pre>) : <pre>Лог пуст.</pre>}
          </div>
        </details>
      </main>
    </div>
  );
}
