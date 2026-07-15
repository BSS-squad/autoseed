import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const generatorPath = path.resolve('scripts/write-runtime-config.mjs');

function runGenerator(config: unknown) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoseed-runtime-config-'));
  const result = spawnSync(process.execPath, [generatorPath], {
    cwd: tempDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      AUTOSEED_RUNTIME_CONFIG_JSON: JSON.stringify(config)
    }
  });

  return {
    ...result,
    tempDir,
    outputPath: path.join(tempDir, 'public', 'runtime-config.json')
  };
}

test('runtime config generator writes only the approved public shape', (t) => {
  const config = {
    app: {
      title: 'BSS AutoConnect',
      vipShopUrl: 'https://vip.example.test'
    },
    policy: {
      priorityOrder: [1, 2, 3]
    },
    exporters: [
      {
        name: 'squadjs1',
        baseUrl: 'https://api.example.test/squadjs1/v1/autoseed'
      }
    ]
  };
  const result = runGenerator(config);
  t.after(() => fs.rmSync(result.tempDir, { recursive: true, force: true }));

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(result.outputPath, 'utf8')), config);
});

test('runtime config generator rejects unapproved fields without printing values', (t) => {
  const secret = 'must-not-be-published';
  const result = runGenerator({
    app: {
      title: 'BSS AutoConnect',
      privateToken: secret
    },
    exporters: [
      {
        name: 'squadjs1',
        baseUrl: 'https://api.example.test/autoseed'
      }
    ]
  });
  t.after(() => fs.rmSync(result.tempDir, { recursive: true, force: true }));

  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, new RegExp(secret));
  assert.equal(fs.existsSync(result.outputPath), false);
});

test('runtime config generator rejects exporter URLs with credentials', (t) => {
  const result = runGenerator({
    app: { title: 'BSS AutoConnect' },
    exporters: [
      {
        name: 'squadjs1',
        baseUrl: 'https://user:password@api.example.test/autoseed'
      }
    ]
  });
  t.after(() => fs.rmSync(result.tempDir, { recursive: true, force: true }));

  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(result.outputPath), false);
});
