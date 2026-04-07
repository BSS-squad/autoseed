import type { AppMode, BrowserPermissions, StoredState } from '../types';

const STORAGE_KEYS = {
  enabled: 'steam-auto-enabled',
  mode: 'steam-auto-mode',
  testSequenceDelayMs: 'steam-auto-test-sequence-delay-ms',
  lastTimestamp: 'steam-auto-last-timestamp',
  cooldownUntil: 'steam-auto-cooldown-until',
  activeRedirectServerKey: 'steam-auto-active-redirect-server-key',
  permissions: 'steam-auto-permissions'
} as const;

export function loadStoredState(): StoredState {
  const enabled = window.localStorage.getItem(STORAGE_KEYS.enabled) === 'true';
  const mode = loadMode();
  const testSequenceDelayMs = Number(window.localStorage.getItem(STORAGE_KEYS.testSequenceDelayMs) || 0);
  const activeRedirectServerKey =
    window.localStorage.getItem(STORAGE_KEYS.activeRedirectServerKey) || '';
  const permissions = loadPermissions();

  // Old builds persisted cooldown/timestamp across full browser restarts.
  // Keep the keys cleared so a restored tab starts from the live target instead of a stale timer.
  window.localStorage.removeItem(STORAGE_KEYS.lastTimestamp);
  window.localStorage.removeItem(STORAGE_KEYS.cooldownUntil);

  return {
    enabled,
    mode,
    testSequenceDelayMs: Number.isFinite(testSequenceDelayMs) ? Math.max(0, testSequenceDelayMs) : 0,
    lastProcessedTimestamp: 0,
    cooldownUntil: 0,
    activeRedirectServerKey,
    permissions
  };
}

export function saveEnabled(value: boolean): void {
  window.localStorage.setItem(STORAGE_KEYS.enabled, String(value));
}

export function loadMode(): AppMode {
  const raw = window.localStorage.getItem(STORAGE_KEYS.mode);
  return raw === 'test' ? 'test' : 'production';
}

export function saveMode(value: AppMode): void {
  window.localStorage.setItem(STORAGE_KEYS.mode, value);
}

export function saveTestSequenceDelayMs(value: number): void {
  window.localStorage.setItem(STORAGE_KEYS.testSequenceDelayMs, String(Math.max(0, value)));
}

export function saveLastProcessedTimestamp(value: number): void {
  if (value > 0) {
    window.localStorage.removeItem(STORAGE_KEYS.lastTimestamp);
    return;
  }

  window.localStorage.removeItem(STORAGE_KEYS.lastTimestamp);
}

export function saveCooldownUntil(value: number): void {
  if (value > 0) {
    window.localStorage.removeItem(STORAGE_KEYS.cooldownUntil);
    return;
  }

  window.localStorage.removeItem(STORAGE_KEYS.cooldownUntil);
}

export function saveActiveRedirectServerKey(value: string): void {
  if (!value) {
    window.localStorage.removeItem(STORAGE_KEYS.activeRedirectServerKey);
    return;
  }

  window.localStorage.setItem(STORAGE_KEYS.activeRedirectServerKey, value);
}

export function loadPermissions(): BrowserPermissions | null {
  const raw = window.localStorage.getItem(STORAGE_KEYS.permissions);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as BrowserPermissions;
  } catch {
    return null;
  }
}

export function savePermissions(value: BrowserPermissions): void {
  window.localStorage.setItem(STORAGE_KEYS.permissions, JSON.stringify(value));
}
