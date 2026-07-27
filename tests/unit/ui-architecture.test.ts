import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findServerBySelectionKey,
  getServerSelectionKey,
  isSameServer
} from '../../src/lib/server.ts';
import { classNames, getSafeHttpUrl } from '../../src/lib/ui.ts';
import type {
  CombinedSnapshot,
  ExporterServerSnapshot
} from '../../src/types.ts';

function buildServer(
  id: number,
  code: string,
  sourceUrl: string
): ExporterServerSnapshot {
  return {
    id,
    code,
    sourceUrl
  } as ExporterServerSnapshot;
}

test('shared class and URL helpers keep presentation inputs safe', () => {
  assert.equal(classNames('base', false, null, 'active'), 'base active');
  assert.equal(getSafeHttpUrl('https://example.test/shop'), 'https://example.test/shop');
  assert.equal(getSafeHttpUrl('javascript:alert(1)'), null);
  assert.equal(getSafeHttpUrl('not a url'), null);
});

test('server selection uses one stable identity across routes', () => {
  const first = buildServer(2, 'squadjs2', 'https://example.test/specops');
  const same = buildServer(2, 'squadjs2', 'https://example.test/specops');
  const other = buildServer(3, 'squadjs3', 'https://example.test/invasion');
  const snapshot = {
    timestamp: 0,
    generatedAt: '',
    servers: [first, other],
    errors: []
  } as CombinedSnapshot;

  const selectionKey = getServerSelectionKey(first);
  assert.equal(selectionKey, 'https://example.test/specops::2::squadjs2');
  assert.equal(isSameServer(first, same), true);
  assert.equal(isSameServer(first, other), false);
  assert.equal(findServerBySelectionKey(snapshot, selectionKey), first);
  assert.equal(findServerBySelectionKey(snapshot, ''), null);
});
