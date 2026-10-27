import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', ...devices['Pixel 7'], colorScheme: 'light' },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: false, timeout: 60_000 },
});
