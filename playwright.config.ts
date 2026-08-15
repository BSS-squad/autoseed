import { defineConfig } from '@playwright/test';

const host = '127.0.0.1';
const port = process.env.PLAYWRIGHT_PORT || '4173';
const basePath = process.env.PLAYWRIGHT_BASE_PATH || '/';
const normalizedBasePath = `/${basePath.replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseURL || `http://${host}:${port}${normalizedBasePath}`;
const serverCommand =
  process.env.PLAYWRIGHT_SERVER === 'preview'
    ? `npm run preview -- --host ${host} --port ${port} --strictPort`
    : `npm run dev -- --host ${host} --port ${port} --strictPort`;

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
  webServer: externalBaseURL
    ? undefined
    : {
        command: serverCommand,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000
      }
});
