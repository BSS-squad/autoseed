import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'public');
const outputPath = path.join(publicDir, 'runtime-config.json');
const examplePath = path.join(publicDir, 'runtime-config.example.json');
const rawConfig = process.env.AUTOSEED_RUNTIME_CONFIG_JSON;

const allowedPolicyKeys = new Set([
  'timezone',
  'nightWindowStart',
  'nightWindowEnd',
  'nightPreferredServerId',
  'maxSeedPlayers',
  'priorityOrder',
  'switchDelta',
  'cooldownMs',
  'periodicReconnectMs'
]);

function assertPlainObject(value, location) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Public runtime config has invalid ${location}.`);
  }
}

function assertAllowedKeys(value, allowedKeys, location) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Public runtime config has unsupported field at ${location}.`);
    }
  }
}

function assertNonEmptyString(value, location) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Public runtime config has invalid ${location}.`);
  }
}

function assertFiniteNumber(value, location) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Public runtime config has invalid ${location}.`);
  }
}

function assertPublicUrl(value, location) {
  assertNonEmptyString(value, location);

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Public runtime config has invalid ${location}.`);
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`Public runtime config has unsafe ${location}.`);
  }
}

function assertOptionalPublicUrl(value, location) {
  if (value !== undefined) assertPublicUrl(value, location);
}

function assertRuntimeConfig(config) {
  assertPlainObject(config, 'root object');
  assertAllowedKeys(config, new Set(['app', 'policy', 'leaderboards', 'exporters']), 'root object');

  assertPlainObject(config.app, 'app');
  assertAllowedKeys(config.app, new Set(['title', 'debugLogLimit', 'vipShopUrl', 'testMode']), 'app');
  assertNonEmptyString(config.app.title, 'app.title');
  if (config.app.debugLogLimit !== undefined) {
    assertFiniteNumber(config.app.debugLogLimit, 'app.debugLogLimit');
  }
  assertOptionalPublicUrl(config.app.vipShopUrl, 'app.vipShopUrl');

  if (config.app.testMode !== undefined) {
    assertPlainObject(config.app.testMode, 'app.testMode');
    assertAllowedKeys(
      config.app.testMode,
      new Set(['sequenceServerIds', 'delayMs', 'cooldownMs']),
      'app.testMode'
    );
    if (!Array.isArray(config.app.testMode.sequenceServerIds)) {
      throw new Error('Public runtime config has invalid app.testMode.sequenceServerIds.');
    }
    for (const serverId of config.app.testMode.sequenceServerIds) {
      assertFiniteNumber(serverId, 'app.testMode.sequenceServerIds');
    }
    assertFiniteNumber(config.app.testMode.delayMs, 'app.testMode.delayMs');
    assertFiniteNumber(config.app.testMode.cooldownMs, 'app.testMode.cooldownMs');
  }

  if (config.policy !== undefined) {
    assertPlainObject(config.policy, 'policy');
    assertAllowedKeys(config.policy, allowedPolicyKeys, 'policy');
    for (const [key, value] of Object.entries(config.policy)) {
      if (key === 'timezone' || key === 'nightWindowStart' || key === 'nightWindowEnd') {
        assertNonEmptyString(value, `policy.${key}`);
      } else if (key === 'priorityOrder') {
        if (!Array.isArray(value)) {
          throw new Error('Public runtime config has invalid policy.priorityOrder.');
        }
        for (const serverId of value) assertFiniteNumber(serverId, 'policy.priorityOrder');
      } else {
        assertFiniteNumber(value, `policy.${key}`);
      }
    }
  }

  if (config.leaderboards !== undefined) {
    assertPlainObject(config.leaderboards, 'leaderboards');
    assertAllowedKeys(config.leaderboards, new Set(['url']), 'leaderboards');
    assertOptionalPublicUrl(config.leaderboards.url, 'leaderboards.url');
  }

  if (!Array.isArray(config.exporters) || config.exporters.length === 0) {
    throw new Error('Public runtime config must contain at least one exporter.');
  }
  for (const exporter of config.exporters) {
    assertPlainObject(exporter, 'exporter');
    assertAllowedKeys(exporter, new Set(['name', 'baseUrl']), 'exporter');
    assertNonEmptyString(exporter.name, 'exporter.name');
    assertPublicUrl(exporter.baseUrl, 'exporter.baseUrl');
  }
}

function parseConfig(raw, source) {
  try {
    const config = JSON.parse(raw);
    assertRuntimeConfig(config);
    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Public runtime config from ${source} is not valid JSON.`);
    }
    throw error;
  }
}

function writeConfig(config) {
  fs.writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

fs.mkdirSync(publicDir, { recursive: true });

if (rawConfig && rawConfig.trim().length > 0) {
  writeConfig(parseConfig(rawConfig, 'AUTOSEED_RUNTIME_CONFIG_JSON'));
  process.exit(0);
}

if (fs.existsSync(outputPath)) {
  parseConfig(fs.readFileSync(outputPath, 'utf8'), 'public/runtime-config.json');
  process.exit(0);
}

if (fs.existsSync(examplePath)) {
  writeConfig(parseConfig(fs.readFileSync(examplePath, 'utf8'), 'public/runtime-config.example.json'));
  process.exit(0);
}

throw new Error(
  'runtime-config.json is missing. Provide AUTOSEED_RUNTIME_CONFIG_JSON or create public/runtime-config.json.'
);
