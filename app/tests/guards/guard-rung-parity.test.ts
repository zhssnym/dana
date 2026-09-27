/*
The server's rung and GET /views/focus against the rules the screens ran
before they moved onto it.

The rung (`rungOf` in src/server/views/cards.ts) is the server's statement of
where a task stands against today; it stays on the server, reading the
filters and Today's headings, and the client keeps its own copies
(`rungForTask`, `stageOf`) for Upcoming's headings and the board.
/views/focus replaced the filtering the Focus screens did over /views/all,
/views/planned and /views/my-day, and nothing on screen may move for it, so
this guard holds both to the client rules:

- every open row's rung equals `rungForTask` (client/views/ladder.ts), with
  the rungs after today folded into `future`;
- each list is the rows, in the order, that its screen derived from the
  endpoint it read (the old `FOCUS_FILTERS` and `upcomingRows` in
  client/shell/focus-lists.ts, and TodayPage.tsx's four headings);
- `important` narrows to exactly the stored starred rows.

The client rules are restated below rather than imported: tests/ compiles
under tsconfig.node.json, which has no DOM and no JSX, and those modules
reach both; some of them no longer exist. Each restatement names the function
it copies.

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
  allView,
  expectStillSameDay,
  getView,
  middayZone,
  myDay,
  planned,
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

/** focus-lists.ts `withoutDropped`. */
const withoutDropped = (list: readonly TaskCard[]): TaskCard[] =>
  list.filter((task) => task.status !== 'abandoned')

/** focus-lists.ts `FOCUS_FILTERS`. */
const FOCUS_FILTERS: Record<string, (task: TaskCard, today: string) => boolean> = {
  open: () => true,
  overdue: (task, today) => task.due_date !== null && task.due_date < today,
  undated: (task) => task.due_date === null && task.start_date === null,
}

/** focus-lists.ts `upcomingRows`. */
function upcomingRows(list: readonly TaskCard[], today: string, viewerId: string): TaskCard[] {
  return list.filter((task) => {
    if (task.pulled) return false
    const rung = clientRung(task, today)
    if (rung === 'undated') return false
    const onToday = task.assignee?.id === viewerId
    return !onToday || (rung !== 'overdue' && rung !== 'started' && rung !== 'today')
  })
}

/** TodayPage.tsx's four headings over /views/my-day, as the screen sorts them. */
function todayPageGroups(carried: TaskCard[], todayRows: TaskCard[], today: string) {
  const late = (task: TaskCard): boolean => task.due_date !== null && task.due_date < today
  const underWay = (task: TaskCard): boolean => started(task, today) && !late(task)
  const out = { carried: [] as TaskCard[], today: [] as TaskCard[], started: [] as TaskCard[], added: [] as TaskCard[] }
  for (const task of carried) (underWay(task) ? out.started : out.carried).push(task)
  for (const task of todayRows) {
    if (underWay(task)) out.started.push(task)
    else if (late(task)) out.carried.push(task)
    else if (task.due_date === null || task.due_date <= today) out.today.push(task)
    else out.added.push(task)
  }
  out.started.sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  return Object.entries(out)
    .filter(([, list]) => list.length > 0)
    .map(([key, list]) => ({ key, ids: ids(list) }))
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

describe('the server rung and GET /views/focus match the screens', () => {
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

  test('each Focus list is the rows its screen derives today', async () => {
    const { maya } = await fixtures()
    for (const tz of ZONES()) {
      const today = todayIn(tz)
      const all = await allView(maya, tz)
      const stream = withoutDropped([
        ...all.planned,
        ...all.tasks_inbox,
        ...all.tasks_groups.flatMap((group) => group.rows),
      ] as unknown as TaskCard[])

      for (const when of ['open', 'overdue', 'undated'] as const) {
        const keep = FOCUS_FILTERS[when] ?? (() => true)
        const query = when === 'open' ? { tz } : { tz, when }
        expect(ids(flat(await focus(maya, query))), `${when} in ${tz}`).toEqual(
          ids(stream.filter((task) => keep(task, today))),
        )
      }
      expect(ids(flat(await focus(maya, { tz, important: 'true' }))), `important in ${tz}`).toEqual(
        ids(stream.filter((task) => task.important)),
      )

      const upcoming = withoutDropped(
        upcomingRows((await planned(maya, tz)).rows as unknown as TaskCard[], today, maya.id),
      )
      expect(ids(flat(await focus(maya, { tz, when: 'upcoming' }))), `upcoming in ${tz}`).toEqual(ids(upcoming))

      const day = await myDay(maya, tz)
      const byToday = await focus(maya, { tz, when: 'on_today', group: 'today' })
      expect(
        byToday.groups.map((group) => ({ key: group.key, ids: ids(group.rows) })),
        `today in ${tz}`,
      ).toEqual(
        todayPageGroups(day.carried as unknown as TaskCard[], day.today as unknown as TaskCard[], today),
      )
      expectStillSameDay(tz, today, 'list parity')
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

  test('a bad query is 422 naming the field', async () => {
    const { maya } = await fixtures()
    const tz = middayZone()
    for (const [query, field] of [
      [{ tz, group: 'today' }, 'group'],
      [{ tz, when: 'someday' }, 'when'],
      [{ tz, important: 'yes' }, 'important'],
      [{ when: 'any' }, 'tz'],
    ] as const) {
      const response = await getView(maya, '/views/focus', query)
      expectStatus(response, 422, `GET /views/focus ${JSON.stringify(query)}`)
      expect(response.body).toContain(field)
    }
  })
})
