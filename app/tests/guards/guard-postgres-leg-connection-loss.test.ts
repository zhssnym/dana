/*
A reset connection costs a query, not a file.

**The defect this pins.** Issue #174: about once a run the Postgres leg lost one
whole file to `Error: read ECONNRESET` with no assertion failing, a different
file each time, every one of them green when run alone. The message is a socket
error rather than a Postgres one and it names no frame of this repository, which
is why three sessions read it as a machine fault and none of them could
attribute it.

The mechanism, measured on 2026-09-04 rather than reasoned about. node-postgres
re-emits the socket error of an **idle** pooled connection on the pool
(`pool.emit('error', err, client)`, pg-pool/index.js), and a `pg.Client` emits
its socket errors on itself while it is **checked out** by pool.connect(), which
is every transaction and every migration run (`_handleErrorEvent`,
pg/lib/client.js, and `_acquireClient` in pg-pool, which removes its own
listener for that window). An EventEmitter 'error' with no listener throws, so
before the fix one reset socket ended the worker process with an uncaught
exception, and Vitest attributes an uncaught exception to whichever file was
running: the file dies as a suite with its tests skipped, nothing having
asserted anything. The third window, a query through pool.query(), was already
safe, pg-pool attaching its own `once('error')` for its length.

**What is not claimed here.** What resets the socket in the wild is not known and
is deliberately not guessed at. It is not connection exhaustion — measured the
same day, a whole parallel leg peaks at 17 and 18 client backends across two
runs, against a `max_connections` of 100 — and the cluster log records no termination of its own
on any of the days a file was lost. A transient reset is something a pool must
survive rather than something a test suite can forbid, which is what these
assert.

**Why a proxy.** The reset has to be a real RST on a real pooled socket, and the
only other way to get one is to kill a backend process, which on this machine
would restart the cluster under whatever else is using it. A TCP proxy inside
the test process forwards to the cluster and resets its own socket with
`resetAndDestroy()`, which is what the driver meets in the wild.

**Both reporting paths are asserted here**, because the fix would otherwise have
traded a crash for silence: the seam calls `onConnectionLost` when the caller
gives it one, which is how the boot reaches the 10.5 log line and the tracker
(`observability/connection-lost.ts`), and writes one plain stderr line when it
does not, which is what the suite and the database scripts get.

**PGlite skips this**, having no socket to reset: the seam runs in process there
and the whole class does not exist.

Spec 11.10 (the two legs), issue #174.
*/
import net from 'node:net'
import type { AddressInfo } from 'node:net'

import { sql } from 'drizzle-orm'
import { afterEach, expect, test } from 'vitest'

import { createDbClient } from '../../db/client.js'
import type { ConnectionLostEvent, DbClient } from '../../db/client.js'
import { prepareLegDatabaseOnce } from '../support/postgres-leg-admin.js'

const target = process.env.TEST_DATABASE_URL
const onPostgres = target !== undefined && target !== ''

interface Reachable {
  client: DbClient
  /** Sends an RST on every socket the pool has opened through the proxy. */
  reset(): void
  stop(): Promise<void>
}

/** A pool reaching the worker database through a proxy whose sockets we own. */
async function throughAProxy(
  onConnectionLost?: (event: ConnectionLostEvent) => void,
): Promise<Reachable> {
  // The worker database is created on demand by a file's first createTestDb(),
  // and this file opens its own client rather than going through that door.
  await prepareLegDatabaseOnce()

  const upstream = new URL(target ?? '')
  const accepted: net.Socket[] = []
  const forwarded: net.Socket[] = []
  const proxy = net.createServer((from) => {
    const to = net.connect(Number(upstream.port), upstream.hostname)
    from.pipe(to)
    to.pipe(from)
    // These sockets are about to be reset on purpose; the errors that follow
    // are the point of the test rather than a failure of it.
    from.on('error', () => undefined)
    to.on('error', () => undefined)
    accepted.push(from)
    forwarded.push(to)
  })
  await new Promise<void>((resolve) => {
    proxy.listen(0, '127.0.0.1', () => {
      resolve()
    })
  })
  const proxied = new URL(upstream.toString())
  proxied.port = String((proxy.address() as AddressInfo).port)

  const client = await createDbClient({
    url: proxied.toString(),
    ...(onConnectionLost === undefined ? {} : { onConnectionLost }),
  })
  return {
    client,
    reset: () => {
      expect(accepted.length).toBeGreaterThan(0)
      for (const socket of accepted) socket.resetAndDestroy()
    },
    stop: async () => {
      await client.close()
      // Every socket is destroyed before the close is awaited. net.Server.close
      // waits for open connections, and a test that failed before its reset
      // leaves some open, so without this a failed assertion would be reported
      // as a hook timeout in afterEach instead.
      for (const socket of [...accepted, ...forwarded]) socket.destroy()
      await new Promise<void>((resolve) => {
        proxy.close(() => {
          resolve()
        })
      })
    },
  }
}

/** Waits for `seen` to hold, and stops as soon as it does. */
async function until(seen: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!seen() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

let open: Reachable | undefined

afterEach(async () => {
  const reachable = open
  open = undefined
  if (reachable !== undefined) await reachable.stop()
})

test.runIf(onPostgres)(
  'an idle pooled connection reset by its peer is reported once and discarded, not thrown',
  async () => {
    const reported: ConnectionLostEvent[] = []
    const reachable = await throughAProxy((event) => reported.push(event))
    open = reachable
    const first = (await reachable.client.db.execute(sql`select 1 as one`)) as unknown as {
      rows: { one: number }[]
    }
    expect(first.rows[0]?.one).toBe(1)

    // The connection is idle in the pool now, which is where it spends most of
    // a file's life and is the state with no query to reject into.
    reachable.reset()
    await until(() => reported.length > 0)

    expect(reported, 'once for the connection, not once per listener').toHaveLength(1)
    expect(reported[0]?.code).toBe('ECONNRESET')
    expect(reported[0]?.message).toContain('ECONNRESET')

    // The process is still here, which is the assertion this file exists for,
    // and the pool has replaced what it lost.
    const second = (await reachable.client.db.execute(sql`select 2 as two`)) as unknown as {
      rows: { two: number }[]
    }
    expect(second.rows[0]?.two).toBe(2)
  },
  30_000,
)

test.runIf(onPostgres)(
  'a connection reset inside a transaction rejects that transaction and nothing else',
  async () => {
    const reported: ConnectionLostEvent[] = []
    const reachable = await throughAProxy((event) => reported.push(event))
    open = reachable
    let rejection: unknown

    const transaction = reachable.client.db
      .transaction(async (tx) => {
        await tx.execute(sql`select pg_sleep(3)`)
      })
      .catch((error: unknown) => {
        rejection = error
      })
    // Long enough for the transaction to have checked its connection out of
    // the pool, which is the window pg-pool leaves without a listener.
    await new Promise((resolve) => setTimeout(resolve, 700))
    reachable.reset()
    await transaction
    await until(() => reported.length > 0)

    expect(rejection).toBeInstanceOf(Error)
    expect(reported.map((event) => event.code)).toContain('ECONNRESET')

    // Alive, and able to work again: the pool opens a new connection for this.
    const after = (await reachable.client.db.execute(sql`select 3 as three`)) as unknown as {
      rows: { three: number }[]
    }
    expect(after.rows[0]?.three).toBe(3)
  },
  30_000,
)

test.runIf(onPostgres)(
  'a seam given no callback says so on stderr rather than saying nothing',
  async () => {
    const reachable = await throughAProxy()
    open = reachable
    await reachable.client.db.execute(sql`select 1 as one`)

    const written: string[] = []
    const stderr = process.stderr.write.bind(process.stderr)
    // A spy rather than vi.spyOn: this has to be restored even if the reset
    // never lands, and the restore is the finally below rather than a hook.
    process.stderr.write = ((chunk: unknown): boolean => {
      written.push(String(chunk))
      return true
    }) as typeof process.stderr.write
    try {
      reachable.reset()
      await until(() => written.some((line) => line.includes('[db] connection lost')))
    } finally {
      process.stderr.write = stderr
    }

    expect(written.join('')).toContain('[db] connection lost: read ECONNRESET (ECONNRESET)')
  },
  30_000,
)
