/*
The gate, run where the code was written.

**Why this file exists.** Spec 11.11 fixes six steps and their order: npm ci,
lint, typecheck, one real Postgres leg, build, Playwright. PGlite is the
fallback when no `TEST_DATABASE_URL` is present, so a machine without Postgres
still runs its tests; that run is `incomplete` rather than green. The gate runs
on the author's machine (issue #180), and the block it prints at the end is
the gate record.

**What it does not do.** It decides nothing. It runs the same commands a person
would type, in 11.11's order, stops at the first failure, and writes down what
happened with enough detail that a second person can tell which commit was
measured: the head sha, whether the tree was dirty at either end of the run, the
machine, the clock, and the tally each leg reported. A record with no tallies is
a claim; a record with them is a measurement.

**The one number that matters most is the file count.** The vitest legs run
through `scripts/run-suite.mjs`, which fails a run that exited 0 without
accounting for every file it collected, and this file prints that accounting
into the record so that a reader sees a file count rather than the word
"passed".
**A leg that reports no tally at all is red**, not ok: an exit code with no
summary behind it is the same false green one layer up.

**Three verdicts, and only one of them is green.** `green` means all
six ran and all six passed. `red at <step>` means one failed. `incomplete` means
a step of the six did not run, or the test leg ran somewhere other than Postgres
— this machine has no `TEST_DATABASE_URL`, or you asked for `--quick`.
Incomplete is not red, because there is no defect to point at, and it is not
green, because 11.11 fixes six steps and names the engine one of them runs on.

**It reads its host rather than describing the host it was written on**
(issue #273). The engine line is asked of the server it is about to run
against, the fallback line names the PGlite actually installed, and a version
that cannot be read says so rather than being guessed at. A sub-18 server is a
supported host (11.10's CREATE DATABASE has a libc fallback), so a written-down
version can be wrong. The verdict turns on the engine family either way.

**Two preconditions refuse the browser leg, and neither is a postmortem.** A
second leg on one port seeds and truncates the first one's database underneath
its browser, and a leg run from a path carrying a dot segment answers every
client route 404 — both look from the report like a broken application rather
than like a broken run, which is what makes a precondition worth more than a
diagnosis. **Both fail closed**: the port check refuses when it cannot see the
port rather than reporting it clear, because a check that answers "fine" when
it cannot answer at all is worse than no check — a netstat loop on a host with
no netstat reports every port clear.

**Read a red through docs/troubleshooting.md before believing it.** Several
flake classes are described there and only some are answered by re-running. Nothing here tries to
tell them apart, on purpose: a gate that decides which of its own failures to
forgive is not a gate.
*/
import { spawn } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { readFile, rm } from 'node:fs/promises'
import process from 'node:process'
import { URL, fileURLToPath } from 'node:url'
import { gatePort } from './gate-port.mjs'
import { summarise } from './run-suite.mjs'

/** The application root: this file lives in app/scripts/. */
const APP = fileURLToPath(new URL('..', import.meta.url))

/**
 * The port the browser leg will serve on. A setting in both places now, read
 * from `DANA_GATE_PORT` by the one resolver playwright.config.ts also reads,
 * so the port this file probes and names in its record cannot differ from the
 * port Playwright serves on. scripts/gate-port.mjs carries why the variable
 * exists at all (issue #254).
 */
export const PLAYWRIGHT_PORT = gatePort()

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
 * Whether anything *answers* on the port, asked by connecting rather than by
 * parsing netstat. docs/troubleshooting.md records what a second browser leg
 * on one port looks like from the report — crashed pages, assertions timing out at two
 * minutes that pass in three seconds alone — and that it does not announce
 * itself as a port collision. So the gate refuses to start one rather than
 * producing a record nobody can trust.
 *
 * **What it cannot see, which is why it is not the whole check** (issue #273). It asks loopback, so a listener bound to another address is
 * invisible to it while still making the leg's own `listen` fail with
 * EADDRINUSE — the leg binds the wildcard, and a wildcard bind collides with a
 * specific-address listener, measured. `listeningSockets` below is the second
 * reading, and it is the one that decides the free case: `browserLegRefusal`
 * refuses when **either** reading says the port is taken, or when the socket
 * table could not be read at all.
 *
 * @param {number} port
 * @returns {Promise<boolean>}
 */
export function occupied(port) {
  return probeConnect(port).then((answer) => answer === 'occupied')
}

/**
 * The same probe, undegraded: `occupied`, `free`, or `unknown` when the
 * connection neither completed nor was refused.
 *
 * A free port on loopback answers ECONNREFUSED at once, so a timeout there is
 * not a quiet way of saying nothing is home — it is the probe failing to
 * answer, and a probe that cannot answer must not be recorded as one that said
 * "free".
 *
 * **What the third state does and does not do.** It is kept
 * distinct so that nothing downstream can read a timeout as an all-clear, and
 * it is what `occupied()` is narrowed from. It does **not** refuse the leg on
 * its own: if the host's socket table has been read and holds no listener for
 * this port, that is the better of the two readings and the leg starts.
 * Refusing there would mean refusing a demonstrably free port because one
 * loopback connect was slow, which is a check firing with no cause — and the
 * case where nothing could read the table is already a refusal in its own
 * right. So `unknown` and `free` reach the same outcome today, and the
 * distinction earns its place by being impossible to launder rather than by
 * changing a verdict.
 *
 * @param {number} port
 * @returns {Promise<'occupied' | 'free' | 'unknown'>}
 */
export function probeConnect(port) {
  const probe = (host) =>
    new Promise((resolve) => {
      const socket = net.connect({ host, port })
      const settle = (answer) => {
        socket.destroy()
        resolve(answer)
      }
      socket.setTimeout(1500)
      socket.on('connect', () => settle('occupied'))
      socket.on('timeout', () => settle('unknown'))
      socket.on('error', () => settle('free'))
    })

  return Promise.all([probe('127.0.0.1'), probe('::1')]).then((answers) => {
    if (answers.includes('occupied')) return 'occupied'
    if (answers.includes('unknown')) return 'unknown'
    return 'free'
  })
}

/**
 * The commands that can be asked which process holds a listening socket, in
 * the order they are tried, with the reading of each one's output.
 *
 * **Three of them because there are three hosts.** `lsof` is what the Linux
 * container has, `netstat` is what Windows has, and `ss` is what a stripped
 * Linux image tends to have when it has neither; a host with none of them
 * must not be read as having no listeners (issue #273). Each entry reports the lines it matched
 * rather than a boolean, so a refusal can name the process a reader has to go
 * and stop.
 *
 * The port is interpolated into an argument, which is safe here and is worth
 * saying once: these are spawned with `shell: false`, unlike `run` above, and
 * the number has already been through `gatePort`, which refuses anything that
 * is not a whole number in range.
 *
 * **`accepts` is why a tool that runs is not automatically a tool that
 * answered.** Being missing is not the only way a command fails to read the
 * socket table: a BusyBox `netstat` has no `-o`, so it writes a usage message
 * to stderr and exits non-zero, and reading that empty stdout as an empty
 * socket table would be a fail-open through a command that was present. So
 * each entry says which exits are an
 * answer. `lsof` is the only one with two, because it exits 1 to mean "nothing
 * matched", which is a real reading of an empty table; it must have said
 * nothing on stderr for that reading to be taken, which is what separates a
 * clean no-match from a refusal to run.
 *
 * @type {{name: string, args: (port: number) => string[], accepts: (code: number | null, stderr: string) => boolean, match: (line: string, port: number) => boolean}[]}
 */
export const PORT_INSPECTORS = [
  {
    name: 'lsof',
    args: (port) => ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'],
    accepts: (code, stderr) => code === 0 || (code === 1 && stderr.trim() === ''),
    // lsof has already filtered; every line but its header is a listener.
    match: (line) => !line.startsWith('COMMAND'),
  },
  {
    name: 'ss',
    args: () => ['-lnt'],
    accepts: (code, stderr) => code === 0 && stderr.trim() === '',
    match: (line, port) => hasLocalPort(line, port) && !line.startsWith('State'),
  },
  {
    name: 'netstat',
    // -ano on Windows, where this is the only one of the three that exists.
    // The same flags on a Linux netstat print the same three columns this
    // reads, so nothing here is spelled twice for the two platforms.
    args: () => ['-ano'],
    accepts: (code, stderr) => code === 0 && stderr.trim() === '',
    match: (line, port) => /\bLISTEN(ING)?\b/.test(line) && hasLocalPort(line, port),
  },
]

/**
 * Whether one line of a socket table names this port as a local address.
 *
 * The address column, not the line: a line mentioning the number as a remote
 * port or as a process id would otherwise read as a listener, and the refusal
 * it produced would send its reader to kill something innocent. The IPv6 and
 * wildcard forms (`[::]:<port>`, `*:<port>`) end the same way, which is why
 * this is a suffix test over whitespace-separated fields rather than a parse
 * of the address. The port literal itself is deliberately not written here:
 * a second copy of the number is the drift gate-port.mjs exists to stop.
 *
 * @param {string} line
 * @param {number} port
 */
function hasLocalPort(line, port) {
  const fields = line.trim().split(/\s+/)
  // The last field of ss and netstat alike is the remote address or the pid;
  // the local address is the one before it on netstat and the fourth on ss, so
  // both are covered by reading every field but the last.
  return fields.slice(0, -1).some((field) => field.endsWith(`:${String(port)}`))
}

/**
 * Who holds a listening socket on the port, according to the host's own
 * socket table.
 *
 * **`listening: null` means nobody could be asked**, and that is a distinct
 * answer rather than a polite `false` (issue #273): a loop that greps
 * `netstat` on a host without it writes nothing, nothing greps to nothing, and
 * the check reports the port clear for every port on the machine — an unconditional all-clear wearing the clothes
 * of a check. So the tools are tried in turn, a tool that cannot be spawned is
 * passed over, and running out of tools is reported as running out of tools.
 *
 * @param {number} port
 * @param {typeof PORT_INSPECTORS} inspectors
 * @returns {Promise<{tool: string | null, listening: boolean | null, lines: string[]}>}
 */
export async function listeningSockets(port, inspectors = PORT_INSPECTORS) {
  for (const inspector of inspectors) {
    const answer = await inspect(inspector.name, inspector.args(port))
    // Two ways not to be an answer, and they used to be one. The command is
    // not on this host; or it ran and would not do what it was asked, which
    // reads as an empty socket table and is not one. Either way the next tool,
    // and if there is no next tool the caller is told that rather than "clear".
    if (!answer.ran || !inspector.accepts(answer.code, answer.stderr)) continue
    const lines = answer.stdout
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line !== '' && inspector.match(line, port))
    return { tool: inspector.name, listening: lines.length > 0, lines }
  }
  return { tool: null, listening: null, lines: [] }
}

/**
 * One socket-table command, `shell: false` so that a missing binary arrives as
 * an ENOENT on the error event rather than as a shell's exit 127 with a
 * message in whatever language the host speaks.
 *
 * `ran` is whether the command executed at all; the exit code and stderr go
 * back with it because whether a run that exited non-zero is an answer is the
 * caller's question and differs by tool. Nothing is interpreted here.
 *
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<{ran: boolean, code: number | null, stdout: string, stderr: string}>}
 */
function inspect(command, args) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch {
      resolve({ ran: false, code: null, stdout: '', stderr: '' })
      return
    }
    let out = ''
    let err = ''
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      out += chunk
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk) => {
      err += chunk
    })
    // The error event arrives before the close event when the binary is not
    // there, and a promise settles once, so the missing-tool answer wins.
    child.on('error', () => resolve({ ran: false, code: null, stdout: '', stderr: '' }))
    child.on('close', (code) => resolve({ ran: true, code, stdout: out, stderr: err }))
  })
}

/**
 * The browser leg's port precondition: `null` when the port is provably free,
 * and the two texts a refusal is written in otherwise — the short one the
 * record carries and the long one the console gets.
 *
 * **A function rather than two string literals inside main(), so that the
 * refusal can be driven against a real socket.** A precondition exercised
 * only by the incident it prevents is one nobody can show still bites.
 *
 * **Both texts name the port that was actually probed.** A refusal naming a constant while
 * probing a variable would send its reader to stop processes on a port that
 * nothing was wrong with.
 *
 * **Three refusals rather than one.** Something answered; something holds the
 * socket without answering; and *nothing here could tell*. The third is a
 * refusal because the alternative is a check whose missing tool makes it
 * report every port clear (issue #273), in front of a collision that looks
 * like one criterion red twice for what seems a reproducible reason. A gate that cannot see the port does not get to say it
 * is free; it says it could not look, and the run stops on the cheap side of
 * an hour of misread reds.
 *
 * @param {number} port
 * @param {typeof PORT_INSPECTORS} inspectors
 * @returns {Promise<{note: string, advice: string} | null>}
 */
export async function browserLegRefusal(port, inspectors = PORT_INSPECTORS) {
  const answered = await probeConnect(port)
  const held = await listeningSockets(port, inspectors)

  if (answered === 'occupied') {
    return {
      note: `something is listening on ${port}; the browser leg was not started`,
      advice:
        `Something is already listening on ${port}. playwright.config.ts serves the\n` +
        'browser leg there and never reuses a server, so this run would seed and\n' +
        "truncate another run's database underneath its browser. Either stop every\n" +
        'node process whose command line matches playwright or e2e:app and wait for\n' +
        'the port to go quiet, or give this run a port of its own by setting\n' +
        'DANA_GATE_PORT to a free one. docs/troubleshooting.md carries the whole story.\n',
    }
  }

  if (held.listening === true) {
    return {
      note: `${held.tool} reports a listening socket on ${port} that did not answer a connection; the browser leg was not started`,
      advice:
        `Nothing answered a connection on ${port}, but ${held.tool} says a process\n` +
        'holds a listening socket there. A socket bound to an address this probe\n' +
        'does not ask, or one whose process has stopped accepting, still takes the\n' +
        "port from this run's own server, which would then fail to bind. Stop it, or\n" +
        'give this run a port of its own by setting DANA_GATE_PORT to a free one.\n\n' +
        `${held.lines.join('\n')}\n`,
    }
  }

  if (held.listening === null) {
    return {
      note: `no port-inspection tool on this host, so ${port} could not be checked; the browser leg was not started`,
      advice:
        `This host has none of ${PORT_INSPECTORS.map((one) => one.name).join(', ')}, so nothing\n` +
        `here can read the socket table and say who holds ${port}. Nothing answered a\n` +
        'connection on it, which is not the same fact: a listener bound to another\n' +
        'address answers no connection here and still takes the port. This refuses\n' +
        'rather than reporting the port clear, because a check that says fine when it\n' +
        'cannot look is how issue #273 was found. Install one of those commands, or\n' +
        'run the browser leg by hand on a port you have checked yourself.\n',
    }
  }

  return null
}

/**
 * The browser leg's other precondition: the checkout's own path.
 *
 * **A dot segment anywhere above the build makes every spec fail on a missing
 * sidebar.** The SPA fallback answers client routes with `res.sendFile()` on an
 * absolute path, and Express refuses any path carrying a dot segment, so
 * `GET /app` returns 404 while `GET /` still succeeds through
 * `express.static` — the application looks broken and is not. Measured on
 * Express 5.2.1: one file served from two paths differing only in a `.work`
 * directory answers 200 from one and 404 from the other.
 *
 * **Why it is a precondition** (issue #273): `.claude/worktrees/`, where an
 * agent's worktree is created by default, is such a path.
 *
 * **Asked at the top of `main()`, before lint**, and `--quick` is exempt. The
 * reasoning is beside the call rather than here, because it is about the order
 * of the run rather than about this refusal.
 *
 * @param {string} appPath
 * @returns {{note: string, advice: string} | null}
 */
export function browserLegPathRefusal(appPath) {
  const segment = dotSegmentIn(appPath)
  if (segment === null) return null

  return {
    note: `the checkout path carries the dot segment ${segment}; the browser leg was not started`,
    advice:
      `This checkout is at ${appPath}, and ${segment} is a dot segment.\n` +
      'The SPA fallback serves client routes with res.sendFile() on an absolute\n' +
      'path, Express refuses any path carrying a dot segment, and so GET /app\n' +
      'answers 404 while GET / still succeeds through express.static. Every spec\n' +
      'then fails on a missing sidebar, which reads as a broken application and is\n' +
      'not one. Copy or clone the tree to a path with no dot directory and run the\n' +
      'leg there; the default agent worktree under .claude/worktrees is not one.\n' +
      'Nothing else about this checkout is wrong: npm run gate -- --quick runs lint,\n' +
      'typecheck and build here and never starts a browser leg.\n',
  }
}

/**
 * The first segment of a path that begins with a dot, or `null`.
 *
 * Both separators, because the hazard is the same on Windows and the path this
 * is asked about comes from `import.meta.url` rather than from a person.
 *
 * @param {string} absolutePath
 * @returns {string | null}
 */
export function dotSegmentIn(absolutePath) {
  for (const segment of absolutePath.split(/[\\/]+/)) {
    if (segment !== '' && segment.startsWith('.')) return segment
  }
  return null
}

/**
 * What engine the Postgres leg is about to run on, asked of the server.
 *
 * `SHOW server_version_num` is the same reading `postgres-leg.ts` selects the
 * CREATE DATABASE locale clause on, so the record and the leg cannot disagree
 * about what they met; `SHOW server_version` is asked beside it because it is
 * the one a person recognises. Both, because either alone has a way of being
 * unhelpful: the prose carries a distribution's own suffix, and the number is
 * a number.
 *
 * `pg` is imported here rather than at the top of the file so that a checkout
 * with no `node_modules` still reaches the install step instead of dying on a
 * module it was about to install.
 *
 * **It is bounded.** A `TEST_DATABASE_URL` pointing at an unroutable address,
 * or at a socket that accepts and then never speaks the protocol, would leave
 * this waiting on the operating system's own connect timeout — over 25
 * seconds, with the caller unable to print its record in the meantime. Five
 * seconds is far longer than a real answer takes and far shorter than any of
 * those. `query_timeout` is set beside it because the two hangs are different:
 * a server that completes the handshake and then never answers `SHOW` is past
 * the connection timeout and would otherwise wait forever.
 *
 * Neither timeout is a verdict about the database. It is about to be met
 * properly by the leg itself, which will fail with a message about the real
 * problem; all this owes the record is a version or an honest absence.
 *
 * @param {string} url
 * @returns {Promise<string | null>}
 */
export async function postgresVersion(url) {
  try {
    const { default: pg } = await import('pg')
    const client = new pg.Client({
      connectionString: url,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    })
    // The same hazard issue #174 measured on the pool in db/client.ts: a
    // connected client emits 'error' on itself when its socket dies, and an
    // EventEmitter 'error' with no listener throws. This one lives for two
    // queries, but a gate that died reading a version rather than running a
    // leg would be an absurd way to lose a run.
    client.on('error', () => {})
    try {
      await client.connect()
      const num = await client.query('SHOW server_version_num')
      const text = await client.query('SHOW server_version')
      return versionText(text.rows[0]?.server_version, num.rows[0]?.server_version_num)
    } finally {
      await client.end()
    }
  } catch {
    // Unreachable, unauthorised, or no pg: none of those is this function's to
    // report. The leg itself is about to meet the same server and fail with a
    // message about the real problem, and a version nobody could read is
    // written into the record as exactly that.
    return null
  }
}

/**
 * The version a record prints, from what the server said.
 *
 * The prose first, because `16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)` is a fact
 * about this host that `160013` is not; its leading version token, because the
 * rest of it is a packager's. The number is the fallback and not the other way
 * round, and an unreadable pair is `null` rather than a guess: a version
 * nobody measured must not appear in the record (issue #273).
 *
 * @param {unknown} serverVersion
 * @param {unknown} serverVersionNum
 * @returns {string | null}
 */
export function versionText(serverVersion, serverVersionNum) {
  if (typeof serverVersion === 'string') {
    const leading = /^[0-9]+(\.[0-9]+)*/.exec(serverVersion.trim())
    if (leading !== null) return leading[0]
  }
  if (typeof serverVersionNum === 'string' && /^[0-9]+$/.test(serverVersionNum)) {
    const num = Number(serverVersionNum)
    // The scheme since Postgres 10: major * 10000 + minor. Below that the
    // number means something else, and no server that old can run this schema,
    // so it is left unread rather than mistranslated.
    if (num >= 100000) return `${String(Math.floor(num / 10000))}.${String(num % 10000)}`
  }
  return null
}

/**
 * Which PGlite is installed, read from the package rather than from the range
 * in package.json — `^0.5.4` is a range, and the fallback leg runs whatever
 * `npm ci` resolved it to.
 *
 * @returns {Promise<string | null>}
 */
export async function pgliteVersion() {
  try {
    const manifest = await readFile(
      new URL('../node_modules/@electric-sql/pglite/package.json', import.meta.url),
      'utf8',
    )
    const version = JSON.parse(manifest).version
    return typeof version === 'string' && version !== '' ? version : null
  } catch {
    return null
  }
}

/**
 * The name of the test step, which is a reading and not a claim (issue #273).
 * An unread version says so: `test (Postgres,
 * version unread)` is a worse-looking record and a true one, and the step it
 * names is about to fail anyway if the server is the reason.
 *
 * @param {'postgres' | 'pglite'} engine
 * @param {string | null} version
 * @returns {string}
 */
export function testStepName(engine, version) {
  if (engine === 'postgres') {
    return version === null ? 'test (Postgres, version unread)' : `test (Postgres ${version})`
  }
  return version === null
    ? 'test (PGlite fallback, version unread)'
    : `test (PGlite ${version} fallback)`
}

/**
 * The record's port line.
 *
 * **Two records taken side by side on one machine are otherwise
 * indistinguishable**, and telling them apart afterwards is the whole
 * justification for letting a second lane exist at all (issue #254): the
 * honest claim for that change is that it removes an artificial serialisation
 * and exposes a real one, and only a record naming its port lets anybody read
 * back which of the two a bad run met.
 *
 * It says where the number came from as well as what it was, because the
 * default because nobody chose and the same number because somebody chose it
 * are different facts when two records are being compared.
 *
 * @param {number} port
 * @param {Record<string, string | undefined>} env
 */
export function portLine(port, env = process.env) {
  const chosen = env.DANA_GATE_PORT
  const source = chosen === undefined || chosen.trim() === '' ? 'default' : 'DANA_GATE_PORT'
  return `port      ${port} (browser leg, ${source})`
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
  // all. This variable is ambient and has changed more than once on the
  // development machine, so the record prints what this process actually saw rather
  // than what any file says it should be.
  const postgres = process.env.TEST_DATABASE_URL ?? ''
  const havePostgres = postgres !== ''

  /** @type {{name: string, state: string, note: string, took: string}[]} */
  const rows = []
  let failedAt = null
  /** Steps of the six that did not run, or ran off Postgres. Any of these is not green. */
  const missing = []

  const record = (name, state, note, took) => rows.push({ name, state, note, took })

  /*
  The path precondition, asked before anything runs.

  **First, not last.** Asked where the browser leg starts, a checkout under a
  dot directory would pay for lint, typecheck, a whole test leg and a build —
  minutes — before being told it was never going to get a verdict. The refusal
  exists so that the trap costs one line rather than twenty reds. It is free to
  ask and cannot
  change while the run goes, so there is no reason for it to be anywhere else.

  **`--quick` is exempt on purpose.** Lint, typecheck and build are unaffected
  by the path and start no server, so they remain available from a worktree
  that cannot run a browser leg — which is the worktree most agents are in.
  Refusing those too would turn a precondition on one step into a blockade on
  the only three a dot-path checkout can legitimately run.
  */
  const pathRefusal = quick ? null : browserLegPathRefusal(APP)
  if (pathRefusal !== null) {
    failedAt = 'playwright'
    record('playwright', 'REFUSED', pathRefusal.note, '-')
    process.stdout.write(`\n${pathRefusal.advice}`)
  }

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
    One leg, and it is Postgres (11.11): the engine production runs, and the
    faster of the two here. Running the same files on PGlite as well would be
    duplication for every file that touches no engine-specific behaviour.

    What is given up: the cross-engine class — `current_date` reading in the
    database session's zone, and text ordering under a locale PGlite does not
    share — is caught by whichever leg runs rather than by two legs
    disagreeing. 11.10's two locale checks still run inside the leg.

    PGlite remains the fallback so that no machine ever runs zero tests. A run
    that takes it is `incomplete` rather than green: the gate's job is to answer
    for the engine that serves users, and a leg that did not touch it has not
    answered.
    */
    /*
    The engine is asked before the leg runs rather than written down here
    (issue #273).

    **Asked only while the run is still alive.** `step()` returns immediately
    once something has failed — but a step's *name* is an argument, and
    arguments are evaluated before the call. Without this check a run already
    red at lint would open a connection to whatever `TEST_DATABASE_URL` names,
    and against an unroutable address it would sit there while the record it
    had already earned went unprinted.
    */
    const version =
      failedAt !== null ? null : havePostgres ? await postgresVersion(postgres) : await pgliteVersion()

    if (havePostgres) {
      await step(
        testStepName('postgres', version),
        'npm',
        ['test'],
        { TEST_DATABASE_URL: postgres },
        vitestTally,
      )
    } else {
      // Empty rather than absent, which is the condition app/db/client.ts tests
      // and the same spelling ci.yml uses on this step.
      await step(
        testStepName('pglite', version),
        'npm',
        ['test'],
        { TEST_DATABASE_URL: '' },
        vitestTally,
      )

      if (failedAt === null) {
        missing.push('ran on PGlite; TEST_DATABASE_URL is unset, so no leg touched Postgres')
      }
    }
  }

  await step('build', 'npm', ['run', 'build'])

  if (!quick && failedAt === null) {
    // The path was asked at the top of this function and a dot segment has
    // already stopped the run, so what is left to ask is the port — which,
    // unlike the path, can only be asked now, a leg that finished a minute ago
    // still holding it.
    //
    // REFUSED rather than RED, and the distinction is worth the word: nothing
    // failed. The gate declined to measure, because the measurement would have
    // been worthless and would have read like a broken application. The
    // verdict line stays inside the three documented outcomes, so this is
    // still `red at playwright` there.
    const refusal = await browserLegRefusal(PLAYWRIGHT_PORT)
    if (refusal !== null) {
      failedAt = 'playwright'
      record('playwright', 'REFUSED', refusal.note, '-')
      process.stdout.write(`\n${refusal.advice}`)
    } else {
      // Deleted rather than merged into: artifacts from a run that is already
      // dead sit beside fresh ones with indistinguishable timestamps.
      await rm(new URL('../test-results/', import.meta.url), { recursive: true, force: true })
      // DANA_GATE_PREBUILT tells playwright.config.ts that the build step
      // above already produced dist/client, so the browser leg's own server
      // command skips the identical second `vite build`. Only the gate sets
      // it, and only here, after that step has actually run.
      //
      // DANA_GATE_PORT is handed over explicitly rather than left to be
      // inherited, and that is not belt and braces. The child would read the
      // same variable out of the same environment and reach the same answer,
      // but what the record owes a reader is stronger: the port probed a
      // moment ago is the port this process was told to serve on, in one
      // statement rather than in two files agreeing. Unset in the parent, this
      // hands the child the default it would have resolved for itself.
      await step(
        'playwright',
        'npx',
        ['playwright', 'test'],
        { DANA_GATE_PREBUILT: '1', DANA_GATE_PORT: String(PLAYWRIGHT_PORT) },
        playwrightTally,
      )
    }
  }

  // Asked twice, at both ends, and the second one is the load-bearing half.
  // A run measures a tree over half an hour, and a tree that was clean when it
  // started can be edited while it runs. One reading at the start would call
  // that record clean. So the record says dirty if the tree
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
  // is the evidence that they were answered for. A machine with no Postgres
  // cannot produce a green record, and spec 11.10 carries the one CREATE
  // DATABASE statement that fixes it. `--quick` is incomplete by construction
  // and can therefore never be mistaken for a full gate.
  const green = failedAt === null && missing.length === 0
  const verdict =
    failedAt !== null
      ? `GATE: red at ${failedAt}`
      : green
        ? 'GATE: green'
        : `GATE: incomplete (${missing.join('; ')})`

  // **The verdict line and the exit code answer different questions**, and
  // separating them is deliberate rather than sloppy. The line answers "is this
  // a full, passing gate", and only `green` is. The code answers "did you get
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
    // Absent under --quick, where the browser leg did not run and no port was
    // taken; the quick line further down already says so, and a port line
    // there would be a number nothing used.
    quick ? null : portLine(PLAYWRIGHT_PORT),
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
