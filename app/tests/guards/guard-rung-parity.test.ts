/*
The server's rung against the client's, and GET /views/focus's `important`.

The rung (`rungOf` in src/server/views/cards.ts) is the server's statement of
where a task stands against today, and it filters the Focus lists in SQL; the
client keeps its own copy (`rungForTask` in client/views/ladder.ts) for
Upcoming's headings. This guard holds the two together:

- every open row's rung equals `rungForTask`, with the rungs after today
  folded into `future`;
- `important` narrows to exactly the stored starred rows.

`rungForTask` is restated below rather than imported: tests/ compiles under
tsconfig.node.json, which has no DOM and no JSX, and ladder.ts reaches both.

**The boundaries.** Dates run from the day before Honolulu's today to three
days after it, every start/due pair of them that 4.5's CHECK allows, and each
is read in three zones: Pacific/Kiritimati is always one calendar day ahead of
Honolulu, so one fixture is overdue, today and future across the three reads,
and the third zone is whichever sits nearest midday.

Seen red: swapping the `started` and `overdue` arms of `rungOf` fails the
parity case (an overdue task that has started reads `started`).
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { rungOf } from '../../src/server/views/cards.js'
import type { TaskCard } from '../../src/shared/tasks.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus, seedMyDayEntry } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'
import {
  ZONE_AHEAD,
  ZONE_BEHIND,
  expectStillSameDay,
  getView,
  middayZone,
  seedViewTask,
  sharedFolder,
  shiftDate,
  todayIn,
} from '../support/views-harness.js'
import type { ViewQuery } from '../support/views-harness.js'

let app: AuthTestApp
const cast = new Cast(['maya', 'sam'], 'rung')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface FocusBody {
  groups: Array<{ key: string; rows: TaskCard[] }>
  truncated: boolean
}

async function focus(actor: Actor, query: ViewQuery): Promise<FocusBody> {
  const response = await getView(actor, '/views/focus', query)
  expectStatus(response, 200, `GET /views/focus ${JSON.stringify(query)}`)
  return response.json() as FocusBody
}

const ids = (cards: readonly TaskCard[]): string[] => cards.map((card) => card.id)
const flat = (body: FocusBody): TaskCard[] => body.groups.flatMap((group) => group.rows)

/* ---- The client rules, restated (see the header) ---- */

/** linear/stage.ts `stageOf(task, today) === 'present'`. */
const started = (task: TaskCard, today: string): boolean =>
  task.status === 'pending' && task.start_date !== null && task.start_date <= today

/** ladder.ts `rungForTask(...).key`, every rung after today folded into future. */
function clientRung(task: TaskCard, today: string): string {
  const late = task.due_date !== null && task.due_date < today
  if (!late && started(task, today)) return 'started'
  const date = task.due_date ?? task.start_date
  if (date === null) return 'undated'
  if (date < today) return 'overdue'
  return date === today ? 'today' : 'future'
}

let seeded: { maya: Actor; sam: Actor; open: string[]; closed: string[] } | undefined

async function fixtures(): Promise<NonNullable<typeof seeded>> {
  if (seeded !== undefined) return seeded
  const [maya, sam] = (await cast.of(app)) as [Actor, Actor]
  const folderId = await sharedFolder(app.db, maya, sam, 'rung shared')
  const base = todayIn(ZONE_BEHIND)
  const days = [-1, 0, 1, 2, 3].map((n) => shiftDate(base, n))
  const dates: Array<string | null> = [null, ...days]
  const who = [maya.id, sam.id, null]
  const open: string[] = []
  let n = 0
  for (const start of dates) {
    for (const due of dates) {
      if (start !== null && due !== null && start > due) continue
      const id = await seedViewTask(app.db, {
        folderId,
        createdBy: maya.id,
        title: `rung ${String(n)} ${start ?? '-'} ${due ?? '-'}`,
        startDate: start,
        dueDate: due,
        assigneeId: who[n % 3] ?? null,
        important: n % 4 === 0,
      })
      if (n % 5 === 0) await seedMyDayEntry(app.db, id, maya.id)
      open.push(id)
      n += 1
    }
  }
  const closed = [
    await seedViewTask(app.db, { folderId, createdBy: maya.id, status: 'abandoned', dueDate: days[0] ?? null, assigneeId: maya.id }),
    await seedViewTask(app.db, { folderId, createdBy: maya.id, status: 'completed', dueDate: days[1] ?? null, assigneeId: maya.id }),
  ]
  seeded = { maya, sam, open, closed }
  return seeded
}

const ZONES = (): string[] => [ZONE_AHEAD, ZONE_BEHIND, middayZone()]

describe('the server rung matches the client, and important narrows', () => {
  test('every open row has the rung the client computes, across the day boundary in three zones', async () => {
    const { maya, open, closed } = await fixtures()
    for (const tz of ZONES()) {
      const today = todayIn(tz)
      const body = await focus(maya, { tz })
      const cards = flat(body)
      expect(new Set(ids(cards)), `every open fixture, and only open ones (${tz})`).toEqual(new Set(open))
      for (const id of closed) expect(ids(cards)).not.toContain(id)
      const stored = await rows(
        app.db,
        sql`SELECT t.id::text AS id, ${rungOf(today)} AS rung FROM tasks t
            WHERE t.id = ANY(${`{${open.join(',')}}`}::uuid[])`,
      )
      const rungs = new Map(stored.map((row) => [String(row.id), String(row.rung)]))
      const mismatched = cards
        .filter((card) => rungs.get(card.id) !== clientRung(card, today))
        .map((card) => `${card.title}: server ${String(rungs.get(card.id))}, client ${clientRung(card, today)}`)
      expect(mismatched, `rung parity in ${tz} on ${today}`).toEqual([])
      expectStillSameDay(tz, today, 'rung parity')
    }
  })

  test('important narrows to the stored starred rows', async () => {
    const { maya, sam, open } = await fixtures()
    const tz = middayZone()
    const stored = await rows(
      app.db,
      sql`SELECT id FROM tasks WHERE id = ANY(${`{${open.join(',')}}`}::uuid[]) AND important = true`,
    )
    const starred = new Set(stored.map((row) => String(row.id)))
    expect(starred.size, 'the fixture stars some rows and not others').toBeGreaterThan(0)
    expect(starred.size).toBeLessThan(open.length)
    for (const actor of [maya, sam]) {
      const got = ids(flat(await focus(actor, { tz, important: 'true' })))
      expect(new Set(got), 'exactly the starred rows').toEqual(starred)
    }
  })
})
