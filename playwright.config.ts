import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the production build, served from a subpath
// like on GitHub Pages, so base-path regressions are caught locally.
const basePath = process.env.RESM_BASE_PATH ?? '/resm/';
const port = 4173;
const baseURL = `http://localhost:${port}${basePath}`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // On CI, list every test in the log as well, so a failure is easy to find and to quote.
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  // Shared CI machines are slow; waiting longer there does not make any assertion weaker.
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  use: { baseURL, trace: process.env.CI ? 'retain-on-failure' : 'off' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --port ${port} --strictPort`,
    url: baseURL,
    env: { RESM_BASE_PATH: basePath },
    reuseExistingServer: false,
  },
});
