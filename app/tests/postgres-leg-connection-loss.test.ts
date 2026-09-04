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

**PGlite skips this**, having no socket to reset: the seam runs in process there
and the whole class does not exist.

Spec 11.10 (the two legs), issue #174.
*/
import net from 'node:net'
import type { AddressInfo } from 'node:net'

import { sql } from 'drizzle-orm'
import { afterEach, expect, test, vi } from 'vitest'

import { createDbClient } from '../db/client.js'
import type { DbClient } from '../db/client.js'
import { prepareLegDatabaseOnce } from './postgres-leg-admin.js'

const target = process.env.TEST_DATABASE_URL
const onPostgres = target !== undefined && target !== ''

interface Reachable {
  client: DbClient
  /** Sends an RST on every socket the pool has opened through the proxy. */
  reset(): void
  stop(): Promise<void>
}

/** A pool reaching the worker database through a proxy whose sockets we own. */
async function throughAProxy(): Promise<Reachable> {
  // The worker database is created on demand by a file's first createTestDb(),
  // and this file opens its own client rather than going through that door.
  await prepareLegDatabaseOnce()

  const upstream = new URL(target ?? '')
  const accepted: net.Socket[] = []
  const proxy = net.createServer((from) => {
    const to = net.connect(Number(upstream.port), upstream.hostname)
    from.pipe(to)
    to.pipe(from)
    // These sockets are about to be reset on purpose; the errors that follow
    // are the point of the test rather than a failure of it.
    from.on('error', () => undefined)
    to.on('error', () => undefined)
    accepted.push(from)
  })
  await new Promise<void>((resolve) => {
    proxy.listen(0, '127.0.0.1', () => {
      resolve()
    })
  })
  const proxied = new URL(upstream.toString())
  proxied.port = String((proxy.address() as AddressInfo).port)

  const client = await createDbClient({ url: proxied.toString() })
  return {
    client,
    reset: () => {
      expect(accepted.length).toBeGreaterThan(0)
      for (const socket of accepted) socket.resetAndDestroy()
    },
    stop: async () => {
      await client.close()
      await new Promise<void>((resolve) => {
        proxy.close(() => {
          resolve()
        })
      })
    },
  }
}

/** Collects what the seam writes to stderr while `run` is running. */
async function stderrDuring(run: () => Promise<void>): Promise<string> {
  const written: string[] = []
  const spy = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: unknown): boolean => {
      written.push(String(chunk))
      return true
    })
  try {
    await run()
  } finally {
    spy.mockRestore()
  }
  return written.join('')
}

let open: Reachable | undefined

afterEach(async () => {
  const reachable = open
  open = undefined
  if (reachable !== undefined) await reachable.stop()
})

test.runIf(onPostgres)(
  'an idle pooled connection reset by its peer is discarded and logged, not thrown',
  async () => {
    const reachable = await throughAProxy()
    open = reachable
    const first = (await reachable.client.db.execute(sql`select 1 as one`)) as unknown as {
      rows: { one: number }[]
    }
    expect(first.rows[0]?.one).toBe(1)

    const logged = await stderrDuring(async () => {
      // The connection is idle in the pool now, which is where it spends most
      // of a file's life and is the state with no query to reject into.
      reachable.reset()
      const deadline = Date.now() + 5_000
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    })
    expect(logged).toContain('[db] idle pooled connection discarded')

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
    const reachable = await throughAProxy()
    open = reachable
    let rejection: unknown

    const logged = await stderrDuring(async () => {
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
      await new Promise((resolve) => setTimeout(resolve, 500))
    })

    expect(rejection).toBeInstanceOf(Error)
    expect(logged).toContain('[db] connection lost')

    // Alive, and able to work again: the pool opens a new connection for this.
    const after = (await reachable.client.db.execute(sql`select 3 as three`)) as unknown as {
      rows: { three: number }[]
    }
    expect(after.rows[0]?.three).toBe(3)
  },
  30_000,
)
