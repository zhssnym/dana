/*
The gate, run where the code was written.

**Why this file exists.** Spec 11.11 fixes six steps and their order: npm ci,
lint, typecheck, one real Postgres 18 leg, build, Playwright. It fixed seven
until 2026-09-20, when the owner ruled the duplicate PGlite leg out: the same
files ran twice for a cross-engine disagreement that nearly none of them could
produce, and the leg dropped was both the slower one and the one production
does not run. PGlite survives as the fallback when no `TEST_DATABASE_URL` is
present, so a machine without Postgres still runs its tests; that run is
`incomplete` rather than green.

Until 2026-09-04 the only thing that ran every step was GitHub Actions on one
self-hosted runner, and CLAUDE.md records what that costs: a CI job holds about
7.7 GB of this machine's 15.8, so agents and a CI job cannot share it, and
every branch queues behind every other branch. Issue #180 moved the run to the
author's machine. This file is that run, and the block it prints at the end is
the gate record a pull request carries.

**What it does not do.** It decides nothing. It runs the same commands a person
would type, in 11.11's order, stops at the first failure, and writes down what
happened with enough detail that a second person can tell which commit was
measured: the head sha, whether the tree was dirty at either end of the run, the
machine, the clock, and the tally each leg reported. A record with no tallies is
a claim; a record with them is a measurement.

**The one number that matters most is the file count.** The vitest legs run
through `scripts/run-suite.mjs`, which fails a run that exited 0 without
accounting for every file it collected, and this file prints that accounting
into the record so that a reader sees 295 files rather than the word "passed".
**A leg that reports no tally at all is red**, not ok: an exit code with no
summary behind it is the same false green one layer up.

**Three verdicts, and only one of them opens a pull request.** `green` means all
six ran and all six passed. `red at <step>` means one failed. `incomplete` means
a step of the six did not run, or the test leg ran somewhere other than Postgres
— this machine has no `TEST_DATABASE_URL`, or you asked for `--quick`.
Incomplete is not red, because there is no defect to point at, and it is not
green, because 11.11 fixes six steps and names the engine one of them runs on.

**Read a red through CLAUDE.md before believing it.** Four flake classes are
enumerated there and only two are answered by re-running. Nothing here tries to
tell them apart, on purpose: a gate that decides which of its own failures to
forgive is not a gate.
*/
import { spawn } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { rm } from 'node:fs/promises'
import process from 'node:process'
import { URL, fileURLToPath } from 'node:url'
import { summarise } from './run-suite.mjs'

/** The application root: this file lives in app/scripts/. */
const APP = fileURLToPath(new URL('..', import.meta.url))

/** The port playwright.config.ts hardcodes. Not a setting here; a fact there. */
const PLAYWRIGHT_PORT = 3100

/** Playwright's list reporter tail, e.g. "  134 passed (11.3m)". */
const PLAYWRIGHT_TALLY = /^\s*(\d+)\s+(passed|failed|flaky|skipped|interrupted|did not run)\b/

const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g')

/**
 * Run a command and capture what it wrote, echoing it as it arrives so that a
 * long leg is watchable rather than silent.
 *
 * `shell: true` on Windows, where npm and npx are .cmd shims that Node refuses
 * to spawn directly. Every argument here is a literal written in this file, so
 * there is nothing for a shell to interpolate.
 */
function run(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: APP,
      shell: true,
      env: { ...process.env, ...env },
      stdio: ['inherit', 'pipe', 'pipe'],
    })

    let captured = ''
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8')
      stream.on('data', (chunk) => {
        captured += chunk
        process.stdout.write(chunk)
      })
    }

    child.on('error', (error) => resolve({ code: 1, output: `${captured}\n${error.message}` }))
    child.on('close', (code) => resolve({ code: code ?? 1, output: captured }))
  })
}

/** One short command, read for its output rather than watched. */
function read(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: APP, shell: true, stdio: ['ignore', 'pipe', 'ignore'] })
    let captured = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      captured += chunk
    })
    child.on('error', () => resolve(''))
    child.on('close', () => resolve(captured.trim()))
  })
}

/**
 * Whether anything answers on the port, asked by connecting rather than by
 * parsing netstat. CLAUDE.md records what a second browser leg on one port
 * looks like from the report — crashed pages, assertions timing out at two
 * minutes that pass in three seconds alone — and that it does not announce
 * itself as a port collision. So the gate refuses to start one rather than
 * producing a record nobody can trust.
 */
export function occupied(port) {
  const probe = (host) =>
    new Promise((resolve) => {
      const socket = net.connect({ host, port })
      const settle = (answer) => {
        socket.destroy()
        resolve(answer)
      }
      socket.setTimeout(1500)
      socket.on('connect', () => settle(true))
      socket.on('timeout', () => settle(false))
      socket.on('error', () => settle(false))
    })

  return Promise.all([probe('127.0.0.1'), probe('::1')]).then((answers) => answers.includes(true))
}

/** "5m02s", "14s". Durations a person reads, not milliseconds. */
function elapsed(ms) {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`
}

/**
 * What a leg reported, as {ok, note}. `ok: false` fails the step even though
 * the command exited 0.
 *
 * **A leg with no tally is red rather than ok**, and that is the whole reason
 * these return a verdict instead of a string. A green exit code with no summary
 * line means the run ended in some way this file cannot read, and a record that
 * writes `ok` beside "no summary line found" is a claim dressed as a
 * measurement — the same false green `run-suite.mjs` exists to refuse, arriving
 * one layer up.
 */
function vitestTally(output) {
  const { files, tests } = summarise(output)
  if (files === null || tests === null) {
    return { ok: false, note: 'no summary line: this run reported no tally to record' }
  }
  return { ok: true, note: `${files.text} files, ${tests.text} tests` }
}

/** The same, for Playwright's list reporter. */
function playwrightTally(output) {
  const parts = []
  for (const line of output.split(/\r?\n/).map((l) => l.replace(ANSI, ''))) {
    const match = PLAYWRIGHT_TALLY.exec(line)
    if (match !== null) parts.push(`${match[1]} ${match[2]}`)
  }
  if (parts.length === 0) {
    return { ok: false, note: 'no summary line: this run reported no tally to record' }
  }
  return { ok: true, note: `${[...new Set(parts)].join(', ')} cases` }
}

async function main() {
  const quick = process.argv.slice(2).includes('--quick')
  const started = new Date()

  const shortSha = await read('git', ['rev-parse', '--short', 'HEAD'])
  const fullSha = await read('git', ['rev-parse', 'HEAD'])
  const porcelain = await read('git', ['status', '--porcelain'])

  // The parent environment decides whether the Postgres leg is available at
  // all. CLAUDE.md is emphatic that this variable is ambient and has changed
  // more than once, so the record prints what this process actually saw rather
  // than what any file says it should be.
  const postgres = process.env.TEST_DATABASE_URL ?? ''
  const havePostgres = postgres !== ''

  /** @type {{name: string, state: string, note: string, took: string}[]} */
  const rows = []
  let failedAt = null
  /** Steps of the six that did not run, or ran off Postgres. Any of these is not green. */
  const missing = []

  const record = (name, state, note, took) => rows.push({ name, state, note, took })

  const step = async (name, command, args, env, tally) => {
    if (failedAt !== null) return
    process.stdout.write(`\n=== gate: ${name} ===\n`)
    const at = Date.now()
    const { code, output } = await run(command, args, env)
    const took = elapsed(Date.now() - at)
    const verdict = tally === undefined ? { ok: true, note: '' } : tally(output)
    if (code !== 0) {
      failedAt = name
      record(name, 'RED', verdict.note === '' ? `exit ${code}` : `exit ${code}, ${verdict.note}`, took)
      return
    }
    if (!verdict.ok) {
      failedAt = name
      record(name, 'RED', verdict.note, took)
      return
    }
    record(name, 'ok', verdict.note, took)
  }

  // Step 1 of 11.11's six. It is executed only when the lockfile has actually
  // moved, and the comparison is against the merge base with origin/main rather
  // than against the working tree: what matters is whether this branch changed
  // the dependencies, not whether git happens to see the file as dirty.
  //
  // `npm ci` deletes node_modules and rebuilds it, which is right for a fresh
  // runner and expensive for a working tree that has not touched the lockfile.
  // So the two cases are said differently and neither is a guess: unmodified
  // since the base, and the record says the install was not re-run; modified,
  // and it is re-run here as a real step with its own timing, because the other
  // five then ran against dependencies nobody had installed.
  const base = await read('git', ['merge-base', 'HEAD', 'origin/main'])
  const lockMoved =
    base === ''
      ? null
      : (await read('git', ['diff', '--name-only', base, '--', 'package-lock.json'])) !== ''

  if (lockMoved === null) {
    record('install', 'ok', 'no origin/main to compare against; npm ci not re-run', '-')
  } else if (lockMoved) {
    await step('install', 'npm', ['ci'])
    const row = rows[rows.length - 1]
    if (row !== undefined && row.name === 'install' && row.state === 'ok') {
      row.note = `package-lock.json moved since ${base.slice(0, 7)}; npm ci run`
    }
  } else {
    record(
      'install',
      'ok',
      `node_modules as installed, package-lock.json unmodified since ${base.slice(0, 7)}; npm ci not re-run`,
      '-',
    )
  }

  await step('lint', 'npm', ['run', 'lint'])
  await step('typecheck', 'npm', ['run', 'typecheck'])

  if (quick) {
    missing.push('the legs and the browser')
  } else {
    /*
    One leg, and it is Postgres. Amended 2026-09-20 on the owner's ruling.

    Until then this ran the same files twice, once on PGlite and once on
    Postgres, and the second run was pure duplication for every file that
    touches no engine-specific behaviour, which is nearly all of them. Postgres
    is also the faster of the two here and the engine production actually runs,
    so keeping PGlite as the mandatory leg was paying for the slower and less
    faithful half.

    What is given up is real and is written down rather than waved at: the
    cross-engine class CLAUDE.md records — `current_date` reading in the
    database session's zone, and text ordering under a locale PGlite does not
    share — is now caught by whichever leg runs rather than by their
    disagreement. 11.10's two locale checks still run inside the leg.

    PGlite remains the fallback so that no machine ever runs zero tests. A run
    that takes it is `incomplete` rather than green, on the same rule the old
    missing-Postgres row used: the gate's job is to answer for the engine that
    serves users, and a leg that did not touch it has not answered.
    */
    if (havePostgres) {
      await step('test (Postgres 18)', 'npm', ['test'], { TEST_DATABASE_URL: postgres }, vitestTally)
    } else {
      // Empty rather than absent, which is the condition app/db/client.ts tests
      // and the same spelling ci.yml uses on this step.
      await step('test (PGlite fallback)', 'npm', ['test'], { TEST_DATABASE_URL: '' }, vitestTally)

      if (failedAt === null) {
        missing.push('ran on PGlite; TEST_DATABASE_URL is unset, so no leg touched Postgres')
      }
    }
  }

  await step('build', 'npm', ['run', 'build'])

  if (!quick && failedAt === null) {
    if (await occupied(PLAYWRIGHT_PORT)) {
      failedAt = 'playwright'
      record(
        'playwright',
        'RED',
        `something is listening on ${PLAYWRIGHT_PORT}; the browser leg was not started`,
        '-',
      )
      process.stdout.write(
        `\nSomething is already listening on ${PLAYWRIGHT_PORT}. playwright.config.ts\n` +
          'hardcodes that port and never reuses a server, so this run would seed and\n' +
          "truncate another run's database underneath its browser. Stop every node\n" +
          'process whose command line matches playwright or e2e:app, wait for the port\n' +
          'to go quiet, and run the gate again. CLAUDE.md carries the whole story.\n',
      )
    } else {
      // Deleted rather than merged into: artifacts from a run that is already
      // dead sit beside fresh ones with indistinguishable timestamps, and an
      // hour spent reading the wrong trace is how this was learned.
      await rm(new URL('../test-results/', import.meta.url), { recursive: true, force: true })
      // DANA_GATE_PREBUILT tells playwright.config.ts that the build step
      // above already produced dist/client, so the browser leg's own server
      // command skips the identical second `vite build`. Only the gate sets
      // it, and only here, after that step has actually run.
      await step(
        'playwright',
        'npx',
        ['playwright', 'test'],
        { DANA_GATE_PREBUILT: '1' },
        playwrightTally,
      )
    }
  }

  // Asked twice, at both ends, and the second one is the load-bearing half.
  // A run measures a tree over half an hour, and a tree that was clean when it
  // started can be edited while it runs; the author of this file did exactly
  // that, on this branch, the day it was written. One reading at the start
  // would have called that record clean. So the record says dirty if the tree
  // was dirty at either end, and names which.
  const porcelainAfter = await read('git', ['status', '--porcelain'])
  const shaAfter = await read('git', ['rev-parse', '--short', 'HEAD'])
  const dirtyBefore = porcelain !== ''
  const dirtyAfter = porcelainAfter !== ''
  const moved = shaAfter !== shortSha

  let treeLine = 'clean'
  if (dirtyBefore && dirtyAfter) treeLine = `tree dirty at ${shortSha}`
  else if (dirtyBefore) treeLine = `tree dirty at ${shortSha} when the run started`
  else if (dirtyAfter) treeLine = `tree dirty at ${shortSha} — edited while the run was going`
  if (moved) treeLine += `; HEAD moved to ${shaAfter} during the run`

  // **Green means all six ran and all six passed, and nothing else does.**
  // A run that skipped one is `incomplete`: not red, because there is no defect
  // to point at, and not green, because 11.11 fixes six steps and this record
  // is the evidence that they were answered for. `how-we-work.md` section 8 and
  // `hard-stops.md` both say a pull request needs a green gate, so a machine
  // with no Postgres cannot open one, and spec 11.10 carries the one CREATE
  // DATABASE statement that fixes it. `--quick` is incomplete by construction
  // and can therefore never be mistaken for a pull request's gate.
  const green = failedAt === null && missing.length === 0
  const verdict =
    failedAt !== null
      ? `GATE: red at ${failedAt}`
      : green
        ? 'GATE: green'
        : `GATE: incomplete (${missing.join('; ')})`

  // **The verdict line and the exit code answer different questions**, and
  // separating them is deliberate rather than sloppy. The line answers "is this
  // a pull request's gate", and only `green` is. The code answers "did you get
  // what you asked for": a machine that cannot run a leg you asked for is a
  // failure of the run and exits non-zero, while `--quick` gave you exactly the
  // three steps you asked for and exits 0 so that it can sit in a shell loop.
  // Neither can be mistaken for the other, because `--quick` never prints
  // `GATE: green`.
  const gotWhatWasAsked = failedAt === null && (quick || missing.length === 0)

  const ended = new Date()
  const width = Math.max(...rows.map((row) => row.name.length))
  const lines = [
    '```',
    `Dana gate${quick ? ' --quick' : ''}`,
    `commit    ${shortSha} (${fullSha})`,
    `tree      ${treeLine}`,
    `machine   ${os.hostname()}`,
    `start     ${started.toISOString()}`,
    `end       ${ended.toISOString()}`,
    '',
    ...rows.map((row) =>
      `${row.name.padEnd(width)}  ${row.state.padEnd(4)}  ${row.took.padStart(6)}  ${row.note}`.trimEnd(),
    ),
    '',
    quick ? 'quick: lint, typecheck and build only. The legs and the browser did not run.' : null,
    verdict,
    '```',
  ].filter((line) => line !== null)

  process.stdout.write(`\n${lines.join('\n')}\n`)

  // exitCode rather than exit(), so that stdout is flushed rather than
  // truncated. process.exit() kills the process at the next tick whatever is
  // still in the pipe, and the thing in the pipe here is the record itself:
  // piped into `tee` or read over a slow console it is exactly the output that
  // would be lost, which would make a red run look like a run that never
  // finished.
  process.exitCode = gotWhatWasAsked ? 0 : 1
}

// The same entry guard run-suite.mjs carries, and for the same reason: the
// port probe above is worth being able to import and try on its own, and
// importing this file must not start a gate run to do it.
const entry = process.argv[1]
if (entry !== undefined && path.resolve(entry) === fileURLToPath(import.meta.url)) {
  main()
}
