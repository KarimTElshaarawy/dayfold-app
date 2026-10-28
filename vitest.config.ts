import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { loadConfig } from './scripts/config.mjs';

export default defineConfig({
  define: { __APP_NAME__: JSON.stringify(loadConfig().appName), __STARTUP_MS__: JSON.stringify(Math.round(loadConfig().startupSeconds * 1000)) },
  resolve: { alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
