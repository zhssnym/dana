import { defineConfig, devices } from '@playwright/test'

/*
The end to end runner of spec 11.10: Playwright drives the browser tests on
Windows and in CI, against the seed dataset and the development login.

This file is the runner and nothing else. Every spec and every harness it
collects belongs to the Adversarial Test role under tests/e2e/, by the P8
kickoff's ruling that split this seam by file. The two collectors are
disjoint without either config knowing about the other: vitest.config.ts
includes the .test.ts and .test.tsx files under tests/, this one collects
.spec.ts under tests/e2e/, so no file is ever run twice or claimed by both.

The application under test is a real one, not a stub: the client as built,
the API from source, and a database carrying db/seed.ts. Why those three
come from where they do is written at webServer below, because a browser test
is only as trustworthy as the thing it points at.
*/

// Not 3000, which npm run dev already uses. The two cannot run at once
// anyway, both wanting the same single-connection PGlite directory (11.15),
// but a stale dev API answering on 3000 would otherwise be a plausible thing
// for this runner to attach to, and the failure would look like the
// application misbehaving rather than like the wrong application.
const PORT = 3100
const baseURL = `http://localhost:${PORT}`

const inCI = process.env.CI !== undefined && process.env.CI !== ''

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',

  // One worker, no parallelism, and it is the seed that decides this rather
  // than caution: every spec signs into one server holding one seeded
  // database, so a spec that completes a task changes what a spec running
  // beside it would see. PGlite's single connection (11.15) is the second
  // reason and would be enough on its own.
  fullyParallel: false,
  workers: 1,

  // No retries, for the same reason parallelism is off. A retry is only
  // evidence when it replays the same starting state, and the first attempt
  // has already mutated the shared seed, so a green second attempt here
  // would mean less than the red first one did.
  retries: 0,
  forbidOnly: inCI,

  reporter: inCI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  // One browser. The spec asks for Playwright on Windows and in CI (11.10)
  // and names no matrix, and every browser added here is another download in
  // the CI leg and another install on the operator's machine. The CI step
  // installs exactly this one; widening the list means widening that command
  // with it.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    /*
    Three processes in order, and each is load-bearing.

    vite build, so the client under test is the built bundle rather than the
    dev server's module graph: 10.6's PWA layer is a property of a build, and
    a page that only works unbundled is a page that does not work.

    db/seed.ts, because 11.10 puts these tests on the seed dataset, whose
    identifiers its own header fixes so specs can reference rows. It runs
    before the server and not beside it: PGlite is single-connection (11.15),
    so a seed racing a live server against .data is not a slow start, it is a
    failure. Reseeding wipes application rows first, so every run begins from
    the same dataset whatever the previous run did to it.

    tsx src/server/index.ts, from source rather than the compiled dist. This
    is forced, and it is the one thing about this file worth reading twice.
    11.6 requires the development login to be absent from production builds,
    and tsconfig.build.json delivers that by excluding the module, so the
    built server answers 404 on POST /api/v1/auth/dev-login no matter what
    DANA_DEV_LOGIN says. 11.10 then requires these tests to get their
    sessions from exactly that endpoint. The compiled server therefore cannot
    host this suite, by design and not by oversight, so the API runs from
    source where the module exists while the client stays the built one the
    line above produced. The server serves dist/client when it is there, so
    the pair composes without either half knowing about this file.
    */
    command: 'npm run e2e:app',

    // Health rather than the page: the server listens only after migrations
    // commit (11.5), so a 200 here means the database is ready too, and a
    // spec that starts on a half-migrated schema fails somewhere far from
    // the cause.
    url: `${baseURL}/api/health`,

    // Never reuse. A server already up was started against some other state
    // of this tree and was not reseeded by this run, and Playwright would
    // skip the two lines above to attach to it. A port already in use is a
    // clear error; a run against yesterday's data is not.
    reuseExistingServer: false,

    // A cold client build plus migrations plus the seed, on a machine that
    // may be sharing its cores. Playwright's default of 60 seconds is the
    // build's alone on a bad day.
    timeout: 180_000,

    // Both piped, because everything that can go wrong before the first spec
    // runs goes wrong inside these three commands, and the default swallows
    // the half of it that reaches stdout.
    stdout: 'pipe',
    stderr: 'pipe',

    env: {
      PORT: String(PORT),

      // 11.10's session source. Read at createApp() call time, so setting it
      // here is enough (11.6).
      DANA_DEV_LOGIN: '1',

      // Pinned rather than inherited, and the empty string is the point. The
      // seed reads process.env directly while the server also loads a local
      // .env, and process.loadEnvFile does not override a variable that is
      // already set: without this line a developer's .env could point the
      // server at one database while the seed filled another, and the specs
      // would fail against an empty schema with nothing saying why. Empty
      // means the PGlite .data directory for both halves, which is also what
      // CI gets. Exporting DATABASE_URL before the run still redirects both,
      // together.
      DATABASE_URL: process.env.DATABASE_URL ?? '',

      // The job-level TEST_DATABASE_URL belongs only to 11.11's real-
      // Postgres vitest leg. createDbClient() otherwise treats it as a test
      // fallback, so the seed process would fill that database while the
      // boot path deliberately deletes the variable and opens PGlite. Pinning
      // it empty here keeps the seed and server on the same .data directory.
      // An explicit DATABASE_URL above still redirects both together.
      TEST_DATABASE_URL: '',
    },
  },
})
