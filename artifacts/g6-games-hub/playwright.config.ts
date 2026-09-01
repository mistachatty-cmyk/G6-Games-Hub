import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 15_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:19106/',
    trace: 'on-first-retry',
    serviceWorkers: 'block',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'PORT=19106 BASE_PATH=/ pnpm run dev',
    url: 'http://127.0.0.1:19106/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});