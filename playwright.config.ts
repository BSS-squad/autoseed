import { defineConfig } from '@playwright/test';

const host = '127.0.0.1';
const port = process.env.PLAYWRIGHT_PORT || '4173';
const basePath = process.env.PLAYWRIGHT_BASE_PATH || '/';
const normalizedBasePath = `/${basePath.replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');
const baseURL = `http://${host}:${port}${normalizedBasePath}`;
const serverCommand =
  process.env.PLAYWRIGHT_SERVER === 'preview'
    ? `npm run preview -- --host ${host} --port ${port} --strictPort`
    : `npm run dev -- --host ${host} --port ${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  webServer: {
    command: serverCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
