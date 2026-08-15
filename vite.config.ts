import { defineConfig } from 'vite';

const configuredBase = process.env.VITE_BASE_PATH || '/';
const base = `${configuredBase.replace(/\/+$/, '')}/`;

export default defineConfig({
  base,
  publicDir: false
});
