/*
AC-450: given an assigned open task whose Schedule carries a Start Date, then
Today's automatic clause admits it from that date onward and not before, it
keeps qualifying while it is open, a due-only task keeps the behaviour it had,
a task with neither date never qualifies from age, and nothing about the row
changes when its start date arrives.

Issue #217, and the criterion is written against the shape of the mistake the
issue names. **The easy wrong build is a second qualification path**: leave
`due_date <= today` where it is and OR a start-date clause beside it. That
passes every "it appears on its start date" assertion and is still wrong,
because 8.2 computes qualify_date from whatever the automatic clause held on,
so two clauses give a row two qualify dates and the Carried/Today split stops
being one rule. So the assertions below are not only about membership: every
started row is asserted into a *named group*, and the group is what a second
clause gets wrong first.

**Three things that must not happen are asserted as well as the one that
must.** The issue lists them: reaching a start date is not a status, not a
priority, not an assignment, and not overdue. The first three are read back
off the row itself after the read that found it on the page, so an
implementation that writes anything on the way past fails here rather than in
a screenshot months later. The fourth is not the server's to render, and what
is asserted instead is the fact overdue is derived from: the card still
carries its future due_date and its start date beside it, so nothing
downstream can conclude a deadline has passed.

**The flooding guardrail is asserted as an exact set, not as a containment.**
The issue asks for the Today grouping and the carried-work behaviour to be
verified rather than the predicate alone, and the way a widened predicate
floods a page is by admitting rows nobody named. Each group is compared with
`toEqual` against the whole list of what belongs in it, so a row that should
not be there fails whether or not anybody thought of it.

**Ordering is asserted and it is Q1's, unchanged.** A start-only task has no
deadline, so it sorts where every undated row on this page already sorts,
last, by `due_date ASC NULLS LAST`. That is a decision and it is pinned here:
the alternative is leading Q1 on the activation date the way Q3 now leads on
the schedule date, and this page is the day's work in the order it is owed, so
ordering it by the day each row became active would put a task that started
three days ago ahead of the task due today.

**The Carried group carries a third row for that assertion alone, and the
reason is worth stating.** The two rows this file first asserted the order
over both activate on the same day, so the due-date key and the activation
key produce the same sequence and `created_at` reproduces it a third time:
the assertion passed under either rule and pinned neither. `startedYesterdayDueSoon`
activates after both and is due before both, so the two keys rank it at
opposite ends of the group and only Q1's own order answers the sequence below.

**The argument this header used to give for that sort was false and is
corrected rather than removed (2026-09-20).** It read "a row on this page has
an activation date of today or earlier by construction". The automatic clause
is one arm of an OR and the pull is the other: `pulledFuture` below is on this
page with an activation date of tomorrow, asserted into the Today group two
cases down. The sort did not move; the reason given for it did.

**The pull stays a separate mechanism**, which the issue requires in terms, so
a task starting tomorrow is pulled here and lands on the page by the entry
alone with `pulled` true, while its unpulled twin is on no page at all.

The fixture anchors on a zone whose local time is near midday and asserts the
residual with expectStillSameDay, like every date criterion in this suite.

Spec: 6 Q1, 8.1 (the boundary statement and the automatic clause), 8.2
(qualify_date and the Carried/Today split), 4.5 (start_date and
tasks_start_before_due_check), 7.10.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  defaultFolderOf,
  expectStatus,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'
import {
  expectTaskInvariants,
  pullIntoMyDay,
} from '../support/tasks-harness.js'
import type { SeedViewTaskOptions } from '../support/views-harness.js'
import {
  expectStillSameDay,
  idsOf,
  middayZone,
  myDay,
  seedViewTask,
  sharedFolder,
  shiftDate,
  todayIn,
} from '../support/views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer', 'colleague'], 'ac450')

const tz = middayZone()

interface Stage {
  viewer: Actor
  colleague: Actor
  inboxId: string
  sharedId: string
  today: string
  /** Start today, due in ten days: the issue's own example, one day in. */
  startsToday: string
  /** Start tomorrow, due in ten days: the day before the issue's example. */
  startsTomorrow: string
  /** Start three days ago, due in seven: started, carried, not yet due. */
  startedThreeDaysAgo: string
  /**
   * Start yesterday, due in two: carried, and the row that makes Q1's order
   * observable.
   *
   * Every other carried row activates on the same day as another one, so the
   * two candidate leading keys - the due date Q1 uses and the activation date
   * Q3 uses since issue #216 - produce the same sequence and the sort cannot
   * be seen. This one activates later than both and is due before both, so
   * the two keys rank it at opposite ends.
   */
  startedYesterdayDueSoon: string
  /** Start-only, today. */
  startOnlyToday: string
  /** Start-only, three days ago. */
  startOnlyPast: string
  /** Start-only, tomorrow. */
  startOnlyTomorrow: string
  /** Due today and nothing else: the behaviour that must not move. */
  dueToday: string
  /** Due tomorrow and nothing else: the behaviour that must not move. */
  dueTomorrow: string
  /** Neither date, created long ago: never qualifies from age. */
  undatedOld: string
  /** Started, but completed. */
  startedCompleted: string
  /** Started, but abandoned. */
  startedAbandoned: string
  /** Started, but assigned to the colleague. */
  startedForColleague: string
  /** Starts tomorrow and was pulled: on the page by the entry alone. */
  pulledFuture: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer, colleague] = await cast.of(app)
    if (viewer === undefined || colleague === undefined) {
      throw new Error('cast must produce two actors')
    }
    const inboxId = await defaultFolderOf(app.db, viewer.id)
    const sharedId = await sharedFolder(
      app.db,
      viewer,
      colleague,
      'ac450 shared',
    )
    const today = todayIn(tz)
    /** Every row is the viewer's own Desk task unless it says otherwise. */
    const seed = (
      options: Omit<SeedViewTaskOptions, 'folderId' | 'createdBy'> & {
        folderId?: string
      },
    ) =>
      seedViewTask(app.db, {
        folderId: inboxId,
        createdBy: viewer.id,
        ...options,
      })

    const startsToday = await seed({
      assigneeId: viewer.id,
      title: 'ac450 starts today due in ten',
      startDate: today,
      dueDate: shiftDate(today, 10),
    })
    const startsTomorrow = await seed({
      assigneeId: viewer.id,
      title: 'ac450 starts tomorrow due in ten',
      startDate: shiftDate(today, 1),
      dueDate: shiftDate(today, 10),
    })
    const startedThreeDaysAgo = await seed({
      assigneeId: viewer.id,
      title: 'ac450 started three days ago due in seven',
      startDate: shiftDate(today, -3),
      dueDate: shiftDate(today, 7),
    })
    const startedYesterdayDueSoon = await seed({
      assigneeId: viewer.id,
      title: 'ac450 started yesterday due in two',
      startDate: shiftDate(today, -1),
      dueDate: shiftDate(today, 2),
    })
    const startOnlyToday = await seed({
      assigneeId: viewer.id,
      title: 'ac450 start only today',
      startDate: today,
    })
    const startOnlyPast = await seed({
      assigneeId: viewer.id,
      title: 'ac450 start only three days ago',
      startDate: shiftDate(today, -3),
    })
    const startOnlyTomorrow = await seed({
      assigneeId: viewer.id,
      title: 'ac450 start only tomorrow',
      startDate: shiftDate(today, 1),
    })
    const dueToday = await seed({
      assigneeId: viewer.id,
      title: 'ac450 due today',
      dueDate: today,
    })
    const dueTomorrow = await seed({
      assigneeId: viewer.id,
      title: 'ac450 due tomorrow',
      dueDate: shiftDate(today, 1),
    })
    const undatedOld = await seed({
      assigneeId: viewer.id,
      title: 'ac450 undated and old',
      createdAt: '2026-01-01T12:00:00.000Z',
      updatedAt: '2026-01-01T12:00:00.000Z',
    })
    const startedCompleted = await seed({
      assigneeId: viewer.id,
      title: 'ac450 started and completed',
      startDate: shiftDate(today, -1),
      dueDate: shiftDate(today, 9),
      status: 'completed',
    })
    const startedAbandoned = await seed({
      assigneeId: viewer.id,
      title: 'ac450 started and abandoned',
      startDate: shiftDate(today, -1),
      dueDate: shiftDate(today, 9),
      status: 'abandoned',
    })
    const startedForColleague = await seed({
      folderId: sharedId,
      assigneeId: colleague.id,
      title: 'ac450 started for the colleague',
      startDate: shiftDate(today, -1),
      dueDate: shiftDate(today, 9),
    })
    const pulledFuture = await seed({
      assigneeId: viewer.id,
      title: 'ac450 starts tomorrow and was pulled',
      startDate: shiftDate(today, 1),
      dueDate: shiftDate(today, 10),
    })
    expectStatus(
      await pullIntoMyDay(viewer, pulledFuture, tz),
      200,
      '7.8: the pull is the explicit mechanism and it takes a tz of its own',
    )

    staged = {
      viewer,
      colleague,
      inboxId,
      sharedId,
      today,
      startsToday,
      startsTomorrow,
      startedThreeDaysAgo,
      startedYesterdayDueSoon,
      startOnlyToday,
      startOnlyPast,
      startOnlyTomorrow,
      dueToday,
      dueTomorrow,
      undatedOld,
      startedCompleted,
      startedAbandoned,
      startedForColleague,
      pulledFuture,
    }
  }
  return staged
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-450: Today activates on the Start Date', () => {
  test('AC-450: the fixture satisfies section 3, so a red below is a result', async () => {
    const stage_ = await stage()
    await expectTaskInvariants(
      app.db,
      [
        stage_.startsToday,
        stage_.startsTomorrow,
        stage_.startedThreeDaysAgo,
        stage_.startedYesterdayDueSoon,
        stage_.startOnlyToday,
        stage_.startOnlyPast,
        stage_.startOnlyTomorrow,
        stage_.dueToday,
        stage_.dueTomorrow,
        stage_.undatedOld,
        stage_.startedCompleted,
        stage_.startedAbandoned,
        stage_.startedForColleague,
        stage_.pulledFuture,
      ],
      [stage_.inboxId, stage_.sharedId],
      [stage_.viewer.id, stage_.colleague.id],
    )
  })

  test('AC-450: a task starting today is in the Today group; one starting tomorrow is on no page', async () => {
    const stage_ = await stage()
    const body = await myDay(stage_.viewer, tz)
    expectStillSameDay(tz, stage_.today, 'AC-450')
    expect(
      idsOf(body.today).sort(),
      'Q1 admits the activation date on or before today(V): the rows qualifying on today itself are the two that start today, the row due today, and the pulled row whose entry was added today (spec 6 Q1, 8.2)',
      // Sorted because this assertion is about membership; the order of the
      // group is its own test below.
    ).toEqual(
      [
        stage_.startsToday,
        stage_.startOnlyToday,
        stage_.dueToday,
        stage_.pulledFuture,
      ].sort(),
    )
    const onThePage = [...idsOf(body.today), ...idsOf(body.carried)]
    expect(
      onThePage,
      '8.1 calls a date after today(V) future, and a Schedule that has not begun is future work: nothing puts it here until its start date arrives',
    ).not.toContain(stage_.startsTomorrow)
    expect(
      onThePage,
      'a start-only task starting tomorrow is future work for the same reason',
    ).not.toContain(stage_.startOnlyTomorrow)
  })

  test('AC-450: a task that started earlier is Carried while it is open, and not because it is late', async () => {
    const stage_ = await stage()
    const body = await myDay(stage_.viewer, tz)
    expectStillSameDay(tz, stage_.today, 'AC-450')
    expect(
      idsOf(body.carried).sort(),
      '8.2 makes qualify_date the day the automatic clause began to hold, so a task that started three days ago has been carrying for three days, exactly as an overdue one has (spec 8.2, 6 Q1)',
    ).toEqual(
      [
        stage_.startedThreeDaysAgo,
        stage_.startedYesterdayDueSoon,
        stage_.startOnlyPast,
      ].sort(),
    )
    const carried = body.carried
    for (const row of carried) {
      expect(
        row.due_date === null || row.due_date > stage_.today,
        `${row.title} is in Carried with a deadline still ahead of it (or none at all), which is #217's point: Carried is work that began before today, not work that is late`,
      ).toBe(true)
    }
  })

  test('AC-450: the two existing due-only behaviours are unchanged', async () => {
    const stage_ = await stage()
    const body = await myDay(stage_.viewer, tz)
    expectStillSameDay(tz, stage_.today, 'AC-450')
    expect(
      idsOf(body.today),
      'a task due today is still in the Today group (AC-045), and the widened clause admits it on the same day it always did: a due date that has arrived is preceded by a start date that has too',
    ).toContain(stage_.dueToday)
    expect(
      [...idsOf(body.today), ...idsOf(body.carried)],
      'a task due tomorrow with no start date is still on neither group (AC-045)',
    ).not.toContain(stage_.dueTomorrow)
  })

  test('AC-450: a task with neither date never qualifies from age', async () => {
    const stage_ = await stage()
    const body = await myDay(stage_.viewer, tz)
    expectStillSameDay(tz, stage_.today, 'AC-450')
    expect(
      [...idsOf(body.today), ...idsOf(body.carried)],
      'the automatic clause holds on a date the task carries, and a task with no Schedule carries none: created_at is not one (issue #217, spec 6 Q1)',
    ).not.toContain(stage_.undatedOld)
  })

  test('AC-450: status, assignment and the star are untouched by the start date arriving', async () => {
    const stage_ = await stage()
    await myDay(stage_.viewer, tz)
    const row = (
      await rows(
        app.db,
        sql`SELECT status, important, assignee_id,
                   to_char(start_date, 'YYYY-MM-DD') AS start_date,
                   to_char(due_date, 'YYYY-MM-DD') AS due_date
              FROM tasks WHERE id = ${stage_.startsToday}::uuid`,
      )
    )[0]
    expect(
      row,
      'the task the page just showed must still be there to read',
    ).toBeDefined()
    expect(
      {
        status: String(row?.status),
        important: row?.important === true,
        assignee: String(row?.assignee_id),
      },
      "#217: a Start Date reaching today means active work and nothing else. It is not a stored status, not an In Progress state, not a priority change and not an assignment, so reading the page must write none of them",
    ).toEqual({ status: 'pending', important: false, assignee: stage_.viewer.id })
    expect(
      {
        start: String(row?.start_date),
        due: String(row?.due_date),
      },
      'and both ends of the Schedule stand where they were written: Today read them, it did not move them',
    ).toEqual({ start: stage_.today, due: shiftDate(stage_.today, 10) })
  })

  test('AC-450: a started task is not overdue, and the card says so', async () => {
    const stage_ = await stage()
    const body = await myDay(stage_.viewer, tz)
    expectStillSameDay(tz, stage_.today, 'AC-450')
    const card = [...body.today, ...body.carried].find(
      (row) => row.id === stage_.startedThreeDaysAgo,
    )
    expect(card, 'the started task is on the page').toBeDefined()
    expect(
      { start_date: card?.start_date, due_date: card?.due_date },
      'overdue is derived from due_date alone (8.1), so what the card owes a reader is both ends of the Schedule: a start three days spent and a deadline still seven days out. A card that dropped either could not be told apart from a late task',
    ).toEqual({
      start_date: shiftDate(stage_.today, -3),
      due_date: shiftDate(stage_.today, 7),
    })
  })

  test('AC-450: completed, abandoned and somebody else\'s started tasks stay off the open groups', async () => {
    const stage_ = await stage()
    const body = await myDay(stage_.viewer, tz)
    expectStillSameDay(tz, stage_.today, 'AC-450')
    const open = [...idsOf(body.today), ...idsOf(body.carried)]
    expect(
      open,
      'Q1 filters on status = pending: a completed task leaves by the existing state rules and does not come back because its start date is spent',
    ).not.toContain(stage_.startedCompleted)
    expect(
      open,
      'Q1 says outright that abandoned tasks never match',
    ).not.toContain(stage_.startedAbandoned)
    expect(
      open,
      'assignee_id = V is a conjunct of the clause and the widened date does not relax it',
    ).not.toContain(stage_.startedForColleague)
  })

  test('AC-450: the manual pull is still its own mechanism', async () => {
    const stage_ = await stage()
    const body = await myDay(stage_.viewer, tz)
    expectStillSameDay(tz, stage_.today, 'AC-450')
    const pulled = body.today.find((row) => row.id === stage_.pulledFuture)
    expect(
      pulled,
      "the pulled task starts tomorrow, so the automatic clause refuses it and only the entry can have put it here (spec 6 Q1's other arm)",
    ).toBeDefined()
    expect(
      pulled?.pulled,
      '7.0 reports the viewer\'s own entry, which is what makes this row the pull and not the schedule',
    ).toBe(true)
    const unpulled = [...body.today, ...body.carried].find(
      (row) => row.id === stage_.startsTomorrow,
    )
    expect(
      unpulled,
      'its twin has the same Schedule and no entry, and is on no page: the two mechanisms did not merge',
    ).toBeUndefined()
  })

  test('AC-450: Q1\'s order is unchanged, so a start-only row sorts where an undated one does', async () => {
    const stage_ = await stage()
    const body = await myDay(stage_.viewer, tz)
    expectStillSameDay(tz, stage_.today, 'AC-450')
    expect(
      idsOf(body.carried),
      "Q1 sorts by due_date ascending nulls last, and the three rows here rank differently under the only other key anybody would reach for: the task due in two days leads though it started most recently, the task due in seven follows though it started first, and the start-only task, having no deadline, trails. Leading Q1 on the activation date the way Q3 leads on the schedule date reverses the first two, which is what this page must not do - it is the day's work in the order it is owed, not in the order it became active",
    ).toEqual([
      stage_.startedYesterdayDueSoon,
      stage_.startedThreeDaysAgo,
      stage_.startOnlyPast,
    ])
  })
})
