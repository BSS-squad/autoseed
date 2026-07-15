const pageUrl = process.env.PAGES_URL;
const expectedSha = process.env.EXPECTED_RELEASE_SHA;
const maxAgeMs = Number(process.env.EXPORTER_MAX_AGE_MS || 120_000);
const maxFutureSkewMs = Number(process.env.EXPORTER_MAX_FUTURE_SKEW_MS || 30_000);
const requestTimeoutMs = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 15_000);

if (!pageUrl || !expectedSha || !Number.isFinite(maxAgeMs) || !Number.isFinite(maxFutureSkewMs)) {
  throw new Error('Pages smoke configuration is invalid.');
}

const basePageUrl = pageUrl.endsWith('/') ? pageUrl : `${pageUrl}/`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, label, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(requestTimeoutMs)
      });
      if (!response.ok) {
        throw new Error(`${label} request failed: ${response.status}.`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 2_000);
    }
  }

  throw new Error(`${label} is unavailable: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function parseTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function assertFreshTimestamp(timestamp, label) {
  const ageMs = Date.now() - timestamp;
  if (ageMs < -maxFutureSkewMs) {
    throw new Error(`${label} timestamp is unexpectedly in the future.`);
  }
  if (ageMs > maxAgeMs) {
    throw new Error(`${label} is stale.`);
  }
}

function assertExporterConfig(exporter) {
  if (!exporter || typeof exporter.name !== 'string' || typeof exporter.baseUrl !== 'string') {
    throw new Error('Runtime config exporter is invalid.');
  }

  let baseUrl;
  try {
    baseUrl = new URL(exporter.baseUrl);
  } catch {
    throw new Error(`Exporter ${exporter.name} has an invalid URL.`);
  }

  if (
    !['http:', 'https:'].includes(baseUrl.protocol) ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash
  ) {
    throw new Error(`Exporter ${exporter.name} has an unsafe URL.`);
  }
}

const release = await fetchJson(new URL('release.json', basePageUrl), 'Release manifest');
if (release?.sha !== expectedSha) {
  throw new Error('Pages serves a different release than the deployed commit.');
}

const config = await fetchJson(new URL('runtime-config.json', basePageUrl), 'Runtime config');
if (!Array.isArray(config?.exporters) || config.exporters.length === 0) {
  throw new Error('Runtime config has no exporters.');
}

await Promise.all(
  config.exporters.map(async (exporter) => {
    assertExporterConfig(exporter);
    const snapshotUrl = new URL('snapshot', `${exporter.baseUrl.replace(/\/+$/, '')}/`);
    const snapshot = await fetchJson(snapshotUrl, `Exporter ${exporter.name}`);
    if (snapshot?.success !== true || snapshot?.stale !== false) {
      throw new Error(`Exporter ${exporter.name} reports an unhealthy snapshot.`);
    }

    const onlineServers = Array.isArray(snapshot.servers)
      ? snapshot.servers.filter((server) => server?.online === true)
      : [];
    if (!onlineServers.length) {
      throw new Error(`Exporter ${exporter.name} has no healthy online server.`);
    }

    const serverUpdates = onlineServers
      .map((server) => parseTimestamp(server.updatedAt))
      .filter((timestamp) => timestamp !== null);
    const sourceTimestamp = parseTimestamp(snapshot.lastServerUpdateAt) ?? Math.max(...serverUpdates);
    if (!Number.isFinite(sourceTimestamp)) {
      throw new Error(`Exporter ${exporter.name} does not expose server freshness.`);
    }
    assertFreshTimestamp(sourceTimestamp, `Exporter ${exporter.name}`);
  })
);

console.log(`Pages smoke passed for ${config.exporters.length} exporters and release ${expectedSha}.`);
