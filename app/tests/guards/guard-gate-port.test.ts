/*
The gate's port, pinned from both ends.

**Why this is a guard and not a criterion.** It pins nothing in spec section
12: `npm run gate` is not a behaviour of Dana, it is the thing that certifies
Dana's behaviours. `tests/README.md` names that exactly — a `guard-` file
"exists to keep the suite itself honest rather than to prove product
behaviour", and taking an `ac-` number for this would claim a section 12
criterion that does not exist. (It would also have had to be taken from a tail
whose own README is stale: that file still says the next free number is 423
while `tests/criteria/` already carries ac-460 to ac-463.)

**What it is guarding.** Issue #254 made the browser leg's port a setting so
that two gates can run on one machine. Three things have to stay true for that
to be safe, and none of them is visible from reading either file alone.

1. **The default is unchanged.** With `DANA_GATE_PORT` unset, every reader
   resolves the number the gate has always used. This is the entire safety
   argument for touching the gate at all, and it is asserted against the
   literal rather than against the constant, because a constant compared with
   itself agrees no matter what it says.
2. **The two readers cannot disagree.** gate.mjs probes a port and then starts
   a Playwright run that serves on one. If those ever differed, the gate would
   certify a run it had not checked the port for — which is the collision the
   precondition exists to prevent, arriving through the mechanism meant to
   prevent it. Both are resolved here, under an unset variable and under a set
   one, and compared.
3. **The precondition still bites.** It is the postmortem of a real incident
   written as a check, and the issue was explicit that parameterising the port
   must aim it rather than weaken it. It is driven here against a real listening
   socket on a real port, not against a stubbed probe, and both of its texts
   are read for the port they name.

**The socket this test opens is on an ephemeral port the operating system
chooses**, never a fixed one and never the default. Another gate may well be
running on this machine while this test does — that is the whole point of the
change — and a test that took a guessed port to prove a port-collision check
would be the collision.
*/
import net from 'node:net'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import type { PlaywrightTestConfig } from '@playwright/test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_GATE_PORT, gatePort } from '../../scripts/gate-port.mjs'
import { browserLegRefusal, occupied, portLine } from '../../scripts/gate.mjs'

/** Listen on a port the OS picks, and answer with the port it picked. */
function listenOnAFreePort(): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('the OS gave this server no numeric port'))
        return
      }
      resolve({ server, port: address.port })
    })
  })
}

function close(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()))
}

/**
 * Wait for the port to stop being listened on.
 *
 * `occupied` asks by connecting, which is the check that matters and the only
 * one worth polling: a finished leg leaves dozens of sockets in TIME_WAIT for
 * minutes, and anything that greps the port number rather than the listener
 * never clears. CLAUDE.md records the hour that cost.
 */
async function waitUntilFree(port: number): Promise<void> {
  const deadline = Date.now() + 10_000
  while (await occupied(port)) {
    if (Date.now() > deadline) throw new Error(`port ${port} never went quiet`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/**
 * Both readers' answers under one environment, each module freshly evaluated
 * so that the top-level resolution really runs again.
 *
 * The environment is mutated rather than passed, because that is how the real
 * thing is configured: gate.mjs resolves at module scope and playwright.config.ts
 * is loaded by Playwright's own runner, and neither takes an argument.
 */
async function resolveBothReaders(
  value: string | undefined,
  extra: Record<string, string> = {},
): Promise<{ gate: number; config: PlaywrightTestConfig }> {
  const saved = { ...process.env }
  if (value === undefined) delete process.env.DANA_GATE_PORT
  else process.env.DANA_GATE_PORT = value
  for (const [key, entry] of Object.entries(extra)) process.env[key] = entry

  vi.resetModules()
  try {
    const gate = await import('../../scripts/gate.mjs')
    const config = await import('../../playwright.config.js')
    return { gate: gate.PLAYWRIGHT_PORT, config: config.default }
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete process.env[key]
    }
    Object.assign(process.env, saved)
  }
}

/** The single webServer playwright.config.ts declares, narrowed from the union. */
function webServerOf(config: PlaywrightTestConfig): {
  command?: string
  url?: string
  env?: Record<string, string>
} {
  const server = config.webServer
  if (server === undefined || Array.isArray(server)) {
    throw new Error('playwright.config.ts is expected to declare exactly one webServer')
  }
  return server
}

const APP = new URL('../../', import.meta.url)

afterEach(() => {
  vi.resetModules()
})

describe('the gate port: the default', () => {
  /*
  The literal, not the constant. Everything that reads "3100" outside this
  repository's code — CLAUDE.md, docs/workflow, a person's shell history, the
  habit of checking that port before starting a leg — is pinned by this line
  and by nothing else. Moving the constant is a decision somebody may make; it
  must not be one they make by accident.
  */
  it('is 3100, which is what every invocation that predates DANA_GATE_PORT depends on', () => {
    expect(DEFAULT_GATE_PORT).toBe(3100)
  })

  it.each([
    ['absent', {}],
    ['explicitly undefined', { DANA_GATE_PORT: undefined }],
    ['empty, as a shell writes DANA_GATE_PORT=', { DANA_GATE_PORT: '' }],
    ['blank', { DANA_GATE_PORT: '   ' }],
  ])('is what an environment with the variable %s resolves to', (_name, env) => {
    expect(gatePort(env)).toBe(DEFAULT_GATE_PORT)
  })
})

describe('the gate port: choosing one', () => {
  it('takes the number DANA_GATE_PORT names', () => {
    expect(gatePort({ DANA_GATE_PORT: '3187' })).toBe(3187)
    expect(gatePort({ DANA_GATE_PORT: ' 3187 ' })).toBe(3187)
    expect(gatePort({ DANA_GATE_PORT: '1' })).toBe(1)
    expect(gatePort({ DANA_GATE_PORT: '65535' })).toBe(65535)
  })

  /*
  A value that is present and unusable throws rather than falling back. The
  fallback is the dangerous answer here and not the safe one: a typo that
  resolved to the default would put this run on the port belonging to the gate
  it was trying to get out of the way of, and CLAUDE.md records that the report
  from that does not say "port collision" anywhere — it says crashed pages and
  assertions timing out at two minutes that pass in three seconds alone.
  */
  it.each(['0', '-1', '65536', '99999', 'abc', '31.87', '0x10', '3e3', '3187x'])(
    'refuses %s rather than quietly falling back to the default',
    (value) => {
      expect(() => gatePort({ DANA_GATE_PORT: value })).toThrow(/DANA_GATE_PORT/)
    },
  )
})

describe('the gate port: the two readers cannot disagree', () => {
  it('resolves the default in gate.mjs and in playwright.config.ts alike', async () => {
    const { gate, config } = await resolveBothReaders(undefined)
    const server = webServerOf(config)

    expect(gate).toBe(DEFAULT_GATE_PORT)
    expect(config.use?.baseURL).toBe(`http://localhost:${DEFAULT_GATE_PORT}`)
    expect(server.url).toBe(`http://localhost:${DEFAULT_GATE_PORT}/api/health`)
    expect(server.env?.PORT).toBe(String(DEFAULT_GATE_PORT))
  })

  it('resolves a chosen port in gate.mjs and in playwright.config.ts alike', async () => {
    const { gate, config } = await resolveBothReaders('3187')
    const server = webServerOf(config)

    expect(gate).toBe(3187)
    expect(config.use?.baseURL).toBe('http://localhost:3187')
    expect(server.url).toBe('http://localhost:3187/api/health')
    expect(server.env?.PORT).toBe('3187')
  })

  /*
  The prebuilt path is the one the gate itself takes: it has just run `npm run
  build`, so playwright.config.ts skips the identical second `vite build`. It
  is a different server command, and the issue asked in terms that it keep
  working on an alternate port, because a change that moved the port and left
  the gate's own server command on the default would be green everywhere
  except in the only place it runs.
  */
  it('serves the prebuilt client on the chosen port too', async () => {
    const chosen = await resolveBothReaders('3187', { DANA_GATE_PREBUILT: '1' })
    const prebuilt = webServerOf(chosen.config)
    expect(prebuilt.command).toBe('npm run e2e:app:prebuilt')
    expect(prebuilt.env?.PORT).toBe('3187')

    const plain = await resolveBothReaders('3187')
    expect(webServerOf(plain.config).command).toBe('npm run e2e:app')
    expect(webServerOf(plain.config).env?.PORT).toBe('3187')
  })
})

describe('the gate port: the record names it', () => {
  /*
  Both branches, because only one of them can be exercised by running the real
  gate here: proving the `default` branch end to end would mean taking the
  default port, which is the port every other lane on this machine is using and
  the exact collision the change exists to avoid. So the line is a function and
  the function is asserted, and the DANA_GATE_PORT branch is confirmed on top
  of that by a real gate run on an alternate port.
  */
  it('says the port and that nobody chose it, when nobody did', () => {
    expect(portLine(DEFAULT_GATE_PORT, {})).toBe(
      `port      ${DEFAULT_GATE_PORT} (browser leg, default)`,
    )
    expect(portLine(DEFAULT_GATE_PORT, { DANA_GATE_PORT: '' })).toContain('default')
  })

  it('says the port and that DANA_GATE_PORT chose it, when it did', () => {
    expect(portLine(3187, { DANA_GATE_PORT: '3187' })).toBe(
      'port      3187 (browser leg, DANA_GATE_PORT)',
    )
  })
})

describe('the gate port: the occupancy precondition', () => {
  it('refuses a port something is listening on, and names that port in both texts', async () => {
    const { server, port } = await listenOnAFreePort()
    expect(port).not.toBe(DEFAULT_GATE_PORT)

    try {
      expect(await occupied(port)).toBe(true)

      const refusal = await browserLegRefusal(port)
      expect(refusal).not.toBeNull()
      // The record's line and the console's advice both, because a reader who
      // meets one of them and not the other is sent to the wrong port.
      expect(refusal?.note).toContain(String(port))
      expect(refusal?.advice).toContain(String(port))

      // And neither names the default instead. `\b` so that a chosen port
      // whose digits happen to contain the default's is not read as one.
      const theDefault = new RegExp(`\\b${DEFAULT_GATE_PORT}\\b`)
      expect(refusal?.note).not.toMatch(theDefault)
      expect(refusal?.advice).not.toMatch(theDefault)
    } finally {
      await close(server)
    }

    await waitUntilFree(port)
    expect(await browserLegRefusal(port)).toBeNull()
  })

  it('lets a free port through', async () => {
    const { server, port } = await listenOnAFreePort()
    await close(server)
    await waitUntilFree(port)

    expect(await occupied(port)).toBe(false)
    expect(await browserLegRefusal(port)).toBeNull()
  })
})

describe('the gate port: nowhere else', () => {
  /*
  The issue weighed generating a second Playwright config against one config
  that reads a variable, and took the second because "a second config file is a
  second thing to drift". A second port literal is the same hazard one size
  down, and it is the one a later edit is most likely to reintroduce — someone
  restoring what looks like a missing constant. So the number lives in
  scripts/gate-port.mjs and appears in neither reader, in code or in a comment.
  */
  it.each(['scripts/gate.mjs', 'playwright.config.ts'])(
    'leaves no port literal in %s',
    async (file) => {
      const text = await readFile(fileURLToPath(new URL(file, APP)), 'utf8')
      expect(text).not.toMatch(new RegExp(`\\b${DEFAULT_GATE_PORT}\\b`))
      expect(text).toContain('gate-port.mjs')
    },
  )

  it('keeps it in scripts/gate-port.mjs, which is the one place it belongs', async () => {
    const text = await readFile(fileURLToPath(new URL('scripts/gate-port.mjs', APP)), 'utf8')
    expect(text).toMatch(new RegExp(`\\b${DEFAULT_GATE_PORT}\\b`))
  })
})
