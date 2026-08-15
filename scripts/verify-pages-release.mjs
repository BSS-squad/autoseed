import { pathToFileURL } from 'node:url';

const DEFAULT_READY_URL = 'https://squad.leo-land.ru/readyz';
const DEFAULT_TIMEOUT_MS = 15_000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function requireSafeHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} URL is invalid.`);
  }

  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error(`${label} URL is unsafe.`);
  }
  return url;
}

async function fetchJson({ fetchImpl, sleepImpl, url, label, timeoutMs, attempts }) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) throw new Error(`${label} request failed: ${response.status}.`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleepImpl(attempt * 2_000);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label} is unavailable: ${message}`);
}

export async function verifyPagesRelease({
  pagesUrl,
  expectedSha,
  readyUrl = DEFAULT_READY_URL,
  fetchImpl = fetch,
  sleepImpl = sleep,
  requestTimeoutMs = DEFAULT_TIMEOUT_MS,
  releaseAttempts = 6
}) {
  if (!/^[0-9a-f]{40}$/.test(String(expectedSha))) {
    throw new Error('Expected release SHA is invalid.');
  }
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new Error('Smoke request timeout is invalid.');
  }
  if (!Number.isInteger(releaseAttempts) || releaseAttempts <= 0) {
    throw new Error('Release retry count is invalid.');
  }

  const basePageUrl = requireSafeHttpsUrl(pagesUrl, 'Pages');
  basePageUrl.pathname = `${basePageUrl.pathname.replace(/\/+$/, '')}/`;
  basePageUrl.search = '';
  basePageUrl.hash = '';
  const canonicalReadyUrl = requireSafeHttpsUrl(readyUrl, 'Canonical readiness');
  canonicalReadyUrl.search = '';
  canonicalReadyUrl.hash = '';

  let releaseMatched = false;
  let releaseSeen = false;
  let lastReleaseError;
  for (let attempt = 1; attempt <= releaseAttempts; attempt += 1) {
    try {
      const release = await fetchJson({
        fetchImpl,
        sleepImpl,
        url: new URL('release.json', basePageUrl),
        label: 'Release manifest',
        timeoutMs: requestTimeoutMs,
        attempts: 1
      });
      releaseSeen = true;
      if (release?.sha === expectedSha) {
        releaseMatched = true;
        break;
      }
    } catch (error) {
      lastReleaseError = error;
    }
    if (attempt < releaseAttempts) await sleepImpl(attempt * 3_000);
  }

  if (!releaseMatched) {
    if (!releaseSeen && lastReleaseError) throw lastReleaseError;
    throw new Error('Pages still serves a different release than the deployed commit.');
  }

  const readiness = await fetchJson({
    fetchImpl,
    sleepImpl,
    url: canonicalReadyUrl,
    label: 'Canonical site readiness',
    timeoutMs: requestTimeoutMs,
    attempts: 4
  });
  if (
    readiness?.status !== 'ok' ||
    readiness?.database !== 'ok' ||
    readiness?.redis !== 'ok'
  ) {
    throw new Error('Canonical site is not ready.');
  }

  return { sha: expectedSha, readyUrl: canonicalReadyUrl.href };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const requestTimeoutMs = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  await verifyPagesRelease({
    pagesUrl: process.env.PAGES_URL,
    expectedSha: process.env.EXPECTED_RELEASE_SHA,
    requestTimeoutMs
  });
  console.log(`Pages smoke passed for release ${process.env.EXPECTED_RELEASE_SHA}.`);
}
