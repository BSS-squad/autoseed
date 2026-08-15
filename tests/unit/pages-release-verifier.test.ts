import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyPagesRelease } from '../../scripts/verify-pages-release.mjs';

const RELEASE_SHA = '0123456789abcdef0123456789abcdef01234567';
const PAGES_URL = 'https://pages.example.test/autoseed/';
const READY_URL = 'https://squad.example.test/readyz';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('verifies the exact Pages revision and canonical site readiness without data exporters', async () => {
  const requested: string[] = [];
  const fetchImpl: typeof fetch = async input => {
    const url = String(input);
    requested.push(url);
    if (url === `${PAGES_URL}release.json`) return jsonResponse({ sha: RELEASE_SHA });
    if (url === READY_URL) {
      return jsonResponse({ status: 'ok', database: 'ok', redis: 'ok' });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  await verifyPagesRelease({
    pagesUrl: PAGES_URL,
    expectedSha: RELEASE_SHA,
    readyUrl: READY_URL,
    fetchImpl,
    sleepImpl: async () => {}
  });

  assert.deepEqual(requested, [`${PAGES_URL}release.json`, READY_URL]);
});

test('rejects a different published revision after the bounded retry window', async () => {
  let releaseRequests = 0;
  const fetchImpl: typeof fetch = async input => {
    if (String(input) !== `${PAGES_URL}release.json`) throw new Error('Unexpected request.');
    releaseRequests += 1;
    return jsonResponse({ sha: 'ffffffffffffffffffffffffffffffffffffffff' });
  };

  await assert.rejects(
    verifyPagesRelease({
      pagesUrl: PAGES_URL,
      expectedSha: RELEASE_SHA,
      readyUrl: READY_URL,
      fetchImpl,
      sleepImpl: async () => {},
      releaseAttempts: 2
    }),
    /different release/
  );
  assert.equal(releaseRequests, 2);
});

test('retries a temporarily unavailable release manifest', async () => {
  let releaseRequests = 0;
  const fetchImpl: typeof fetch = async input => {
    if (String(input) === READY_URL) {
      return jsonResponse({ status: 'ok', database: 'ok', redis: 'ok' });
    }
    releaseRequests += 1;
    if (releaseRequests === 1) throw new Error('Temporary Pages outage.');
    return jsonResponse({ sha: RELEASE_SHA });
  };

  await verifyPagesRelease({
    pagesUrl: PAGES_URL,
    expectedSha: RELEASE_SHA,
    readyUrl: READY_URL,
    fetchImpl,
    sleepImpl: async () => {},
    releaseAttempts: 2
  });

  assert.equal(releaseRequests, 2);
});

test('rejects a degraded canonical site after matching the Pages revision', async () => {
  const fetchImpl: typeof fetch = async input => {
    if (String(input) === `${PAGES_URL}release.json`) return jsonResponse({ sha: RELEASE_SHA });
    return jsonResponse({ status: 'degraded', database: 'error', redis: 'ok' }, 503);
  };

  await assert.rejects(
    verifyPagesRelease({
      pagesUrl: PAGES_URL,
      expectedSha: RELEASE_SHA,
      readyUrl: READY_URL,
      fetchImpl,
      sleepImpl: async () => {}
    }),
    /Canonical site readiness request failed: 503/
  );
});
