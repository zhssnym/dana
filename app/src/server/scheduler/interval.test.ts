/*
The 60-second interval and its in-flight guard, which no acceptance criterion
can reach.

11.7's seam is the pass, deliberately: the suite runs single passes on demand
and never starts a timer, which is what makes an acceptance test of the loop
possible at all (AC-089's header calls the resulting outage the suite's
ordinary state). Everything the timer adds is therefore covered here or
nowhere, and it is the half that decides whether a live server goes on
delivering: a tick that throws into a timer callback ends the process on
Node's default, and a tick that piles up behind a slow pass turns one late
cycle into a queue of them.

The database is a stub rather than a real one because none of this is about
rows. What the pass does with rows is asserted in pass.test.ts against real
Postgres and in the acceptance range over the whole loop; what is asserted
here is when the pass is called and what happens to its failures, and a stub
that can be held open on demand is the only way to observe a second tick
arriving during the first.

Timers are faked, so the assertions are about ordering rather than about how
fast this machine is.
*/
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { Db, DbClient } from '../../../db/client.js'
import { startReminderScheduler } from './interval.js'
import type { SchedulerLogger } from './pass.js'

interface CapturedLine {
  fields: Record<string, unknown>
  message: string
}

function capturingLogger(): SchedulerLogger & { lines: CapturedLine[] } {
  const lines: CapturedLine[] = []
  return {
    lines,
    info: (fields, message) => lines.push({ fields, message }),
    warn: (fields, message) => lines.push({ fields, message }),
    error: (fields, message) => lines.push({ fields, message }),
  }
}

interface StubDb {
  client: DbClient
  /** How many passes have opened their transaction. */
  started(): number
  /** How many have reached the session pruning that follows it. */
  finished(): number
  /** Lets the transaction opened by the current pass proceed. */
  release(): void
  /** Makes the next transaction reject, as a failing pass. */
  failNext(): void
}

function stubDb(options: { hold?: boolean } = {}): StubDb {
  let starts = 0
  let finishes = 0
  let fail = false
  let unblock: (() => void) | undefined

  const db = {
    async transaction<T>(run: (tx: unknown) => Promise<T>): Promise<T> {
      starts += 1
      if (options.hold === true) {
        await new Promise<void>((resolve) => {
          unblock = resolve
        })
      }
      if (fail) {
        fail = false
        throw new Error('the database went away mid-pass')
      }
      return run({ execute: () => Promise.resolve({ rows: [] }) })
    },
    // Whatever runs outside the transaction, which is the session pruning of
    // 11.7's second duty.
    execute: () => {
      finishes += 1
      return Promise.resolve({ rows: [] })
    },
  }

  return {
    client: {
      kind: 'pglite',
      db: db as unknown as Db,
      runMigrations: () => Promise.resolve(),
      close: () => Promise.resolve(),
    },
    started: () => starts,
    finished: () => finishes,
    release: () => unblock?.(),
    failNext: () => {
      fail = true
    },
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('the in-flight guard (spec 11.7)', () => {
  test('a tick arriving while a pass is running is skipped, and the next one is not', async () => {
    vi.useFakeTimers()
    const stub = stubDb({ hold: true })
    const logger = capturingLogger()
    const scheduler = startReminderScheduler({
      dbClient: stub.client,
      logger,
      intervalMs: 1_000,
    })

    await vi.advanceTimersByTimeAsync(1_000)
    expect(stub.started(), 'the first tick starts a pass').toBe(1)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(
      stub.started(),
      '11.7 guards against overlapping passes: the second tick finds one in flight and does nothing. A tick skipped this way costs nothing, the poll being over fire_at <= now(), so the next pass picks up whatever this one would have',
    ).toBe(1)
    expect(
      logger.lines.map((line) => line.fields.event),
      'and it says so, because a pass that runs longer than a minute is an operational fact somebody should see',
    ).toContain('reminder_pass_overlapped')

    stub.release()
    await vi.advanceTimersByTimeAsync(0)
    // Six statements follow the delivery transaction: the session prune and
    // the five purge DELETEs (Trash folders, Trash tasks, **Trash facets**,
    // events, and the cover reclaim of issue #116), each a single statement
    // needing no wrapper. It was four from S3 until 2026-09-04, five until
    // 2026-09-21, and the number moves with the pass's duties in the same
    // change — like AC-236's route count, this is a fixture over the
    // implementation rather than a rule about it, and what it asserts is
    // unchanged: the held pass ran all the way through rather than stopping
    // where it was released.
    //
    // **Moved by issue #210**, which added the facet arm of the thirty-day
    // Trash purge: `destroyFacets` in `domain/facets.ts`, one statement in
    // the shape `destroyFolders` and `destroyTasks` next to it keep. The
    // enumeration above is kept in step deliberately — `docs/workflow/backend.md`
    // says so of this line in particular — because it is the only thing that
    // lets the next reader tell a legitimate move from a lost duty.
    expect(stub.finished(), 'the held pass ran to completion').toBe(6)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(
      stub.started(),
      'and the guard is released with it: the loop is not permanently wedged by one slow pass',
    ).toBe(2)

    scheduler.stop()
  })

  test('a failed pass is caught, logged, and does not stop the loop', async () => {
    vi.useFakeTimers()
    const stub = stubDb()
    const logger = capturingLogger()
    const scheduler = startReminderScheduler({
      dbClient: stub.client,
      logger,
      intervalMs: 1_000,
    })

    stub.failNext()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(
      logger.lines.map((line) => line.fields.event),
      'a rejection escaping a timer callback is an unhandled rejection, which ends the process on Node default',
    ).toContain('reminder_pass_failed')

    await vi.advanceTimersByTimeAsync(1_000)
    expect(
      stub.started(),
      'and the interval survives it: one bad minute is not a dead tick. Nothing pinged the heartbeat for the failed cycle, so 11.12 alerts if this keeps happening',
    ).toBe(2)

    scheduler.stop()
  })

  test('stop ends the ticks', async () => {
    vi.useFakeTimers()
    const stub = stubDb()
    const scheduler = startReminderScheduler({
      dbClient: stub.client,
      logger: capturingLogger(),
      intervalMs: 1_000,
    })

    await vi.advanceTimersByTimeAsync(1_000)
    expect(stub.started()).toBe(1)

    scheduler.stop()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(
      stub.started(),
      'SIGTERM stops the scheduler before the server closes, so no tick opens a transaction on a handle that is being torn down',
    ).toBe(1)
  })
})
