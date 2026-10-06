import { defineConfig, devices } from '@playwright/test'

// Each parallel browser run needs its own port: two runs on one port seed and empty one database.
const PORT = Number(process.env.DANA_E2E_PORT ?? 3100)
const baseURL = `http://localhost:${PORT}`
const inCI = process.env.CI !== undefined && process.env.CI !== ''

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  // All specs share one seeded database, so run one at a time and do not retry.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: inCI,
  reporter: inCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // The built client, a fresh seed, then the API from source: the built server has no dev login.
    // DANA_E2E_PREBUILT=1 skips the build when dist/client is already current.
    command: process.env.DANA_E2E_PREBUILT === '1' ? 'npm run e2e:app:prebuilt' : 'npm run e2e:app',
    // The server listens only after migrations, so health 200 means the database is ready.
    url: `${baseURL}/api/health`,
    // Never attach to an old server: its data was not seeded by this run.
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      PORT: String(PORT),
      NODE_ENV: 'test',
      DANA_DEV_LOGIN: '1',
      // Seed and server must open the same database. Empty means PGlite in .data for both.
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      TEST_DATABASE_URL: '',
    },
  },
})
