/*
AC-451: given the four valid Task Schedule states, then Scheduled holds the
three that carry a date and Anytime holds only the one that carries none;
a task is placed and ordered by its Due Date where it has one and by its
Start Date otherwise; no task appears twice and none is lost between the two;
and a spent Start Date makes nothing overdue.

Issue #216. Scheduled was `due_date IS NOT NULL` and Anytime was its
negation, which is a partition of one column's nullness that a reader can
check by eye. It is now a partition over two columns, and 6.1's proof is the
thing most likely to quietly stop being true, so this criterion asserts the
proof rather than the sentence: **Scheduled and Anytime are read in the same
breath and compared against the whole fixture**, so a row that went to both
fails and a row that went to neither fails, and neither failure depends on
anybody having thought of the state that produced it.

**Placement is asserted as a whole sequence, and the fixture is built so the
two candidate rules disagree.** The start-and-due task starts on the same day
the start-only task starts and is due two days later. An implementation
leading Q3 on the start date orders them as a tie; an implementation leading
on the due date with nulls last puts the start-only row at the foot. Only
"due date where there is one, start date otherwise" produces the sequence
below, and every other rule anybody is likely to write produces a different
one.

**"Do not create duplicate list rows" is asserted by counting, not by
looking.** The task carrying both dates is the one a two-armed
implementation - a union of a due query and a start query - emits twice, and
a `toContain` assertion passes against exactly that build.

**Overdue is asserted as what the server hands over rather than as a style.**
A style is `parts/presenters.ts`'s and no criterion reads it. What this
asserts is the fact the style is derived from: a start-only task whose start
is three days spent still carries `due_date: null`, so nothing downstream can
compute a passed deadline for it, and the started-and-due task carries a
deadline still in the future.

**Q4 and Q7 are asserted too, because their blocks are these two pages'
membership rather than a column.** Q4's own sentence says its first block
shows rows "like a Scheduled row" and its second "like an Anytime row", and
Q7's two open sections are Q3's and Q2's predicates narrowed to one folder.
An implementation that moved Q3 and Q2 and left those two behind splits the
same task into two different answers on two pages, which is the failure this
file is here to make visible.

**Q4's fixture carries a third starred row for that, added 2026-09-20, and
the reason is the same class of gap the placement paragraph above describes.**
The first two starred rows both carry a null due date, so Q4's boundary reads
the same under `schedule_date IS NULL` and under `due_date IS NULL`, and
`created_at` produces the same sequence a third time: the assertion held under
the predicate this criterion is about and under the one it replaced, which is
no assertion at all. `starredDueLater` is due after the start-only row's start
and is seeded after it, so only the schedule-date boundary puts the start-only
row in front of it.

Spec: 6 Q2, 6 Q3, 6 Q4, 6 Q5, 6 Q7, 6.1 (the partition proof), 4.5
(start_date and tasks_start_before_due_check), 7.10, 8.1 (overdue).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  createFolder,
  defaultFolderOf,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { expectTaskInvariants } from '../support/tasks-harness.js'
import type { SeedViewTaskOptions } from '../support/views-harness.js'
import {
  allView,
  expectStillSameDay,
  folderOpen,
  idsOf,
  important,
  middayZone,
  planned,
  requireCard,
  requireGroup,
  seedViewTask,
  shiftDate,
  tasksView,
  todayIn,
} from '../support/views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer'], 'ac451')

const tz = middayZone()

interface Stage {
  viewer: Actor
  inboxId: string
  workId: string
  today: string
  /** Due tomorrow, no start: the state that must not move. */
  dueOnly: string
  /** Starts in two days, due in four: placed by the due date. */
  startAndDue: string
  /** Starts in two days and nothing else: placed by the start date. */
  startOnly: string
  /** Started three days ago, no due date: started, and not overdue. */
  startOnlySpent: string
  /** Neither date: the one plain Anytime row. */
  neither: string
  /** Starred, start-only, five days out: Q4's scheduled block. */
  starredStartOnly: string
  /** Starred, neither date: Q4's Anytime block. */
  starredUndated: string
  /**
   * Starred, due-only, eight days out, and seeded last: the row that makes
   * Q4's block boundary observable.
   *
   * Without it the two starred rows both carry a null due date, so the
   * boundary this criterion is about - `schedule_date IS NULL` against
   * `due_date IS NULL` - puts them in the same block under either spelling
   * and `created_at` reproduces the same sequence. This one is in the
   * Scheduled block under both and has to sort *behind* the start-only row,
   * which only the schedule date produces: a due-date boundary puts it in the
   * first block alone and leads the list with it.
   */
  starredDueLater: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer] = await cast.of(app)
    if (viewer === undefined) throw new Error('cast must produce one actor')
    const inboxId = await defaultFolderOf(app.db, viewer.id)
    const workId = await createFolder(viewer, 'ac451 work')
    const today = todayIn(tz)
    const seed = (
      options: Omit<SeedViewTaskOptions, 'folderId' | 'createdBy'>,
    ) =>
      seedViewTask(app.db, {
        folderId: workId,
        createdBy: viewer.id,
        assigneeId: viewer.id,
        ...options,
      })

    const dueOnly = await seed({
      title: 'ac451 due tomorrow',
      dueDate: shiftDate(today, 1),
    })
    /* The two that disagree. Both start on today+2; one is due on today+4.
       Placed by the due date where there is one, they come out two days
       apart; placed by the start date they tie and fall back to created_at,
       which would put startAndDue first because it is seeded first. */
    const startAndDue = await seed({
      title: 'ac451 starts in two due in four',
      startDate: shiftDate(today, 2),
      dueDate: shiftDate(today, 4),
    })
    const startOnly = await seed({
      title: 'ac451 starts in two only',
      startDate: shiftDate(today, 2),
    })
    const startOnlySpent = await seed({
      title: 'ac451 started three days ago only',
      startDate: shiftDate(today, -3),
    })
    const neither = await seed({ title: 'ac451 no dates at all' })
    /* Q4's two blocks, which are these two pages' membership rather than a
       column of their own. Seeded here rather than inside the case that
       reads them, so that every assertion in this file sees one fixture. */
    const starredStartOnly = await seed({
      title: 'ac451 starred start only',
      important: true,
      startDate: shiftDate(today, 5),
    })
    const starredUndated = await seed({
      title: 'ac451 starred no dates',
      important: true,
    })
    /* Seeded after the start-only one on purpose: under a boundary read off
       the due date this row leads the page by being the only one with a
       deadline, and under Q4's own boundary it follows the start-only row by
       being due later. created_at cannot rescue either reading. */
    const starredDueLater = await seed({
      title: 'ac451 starred due in eight',
      important: true,
      dueDate: shiftDate(today, 8),
    })

    staged = {
      viewer,
      inboxId,
      workId,
      today,
      dueOnly,
      startAndDue,
      startOnly,
      startOnlySpent,
      neither,
      starredStartOnly,
      starredUndated,
      starredDueLater,
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

describe('AC-451: Scheduled and Anytime over the four Schedule states', () => {
  test('AC-451: the fixture satisfies section 3, so a red below is a result', async () => {
    const stage_ = await stage()
    await expectTaskInvariants(
      app.db,
      [
        stage_.dueOnly,
        stage_.startAndDue,
        stage_.startOnly,
        stage_.startOnlySpent,
        stage_.neither,
        stage_.starredStartOnly,
        stage_.starredUndated,
        stage_.starredDueLater,
      ],
      [stage_.inboxId, stage_.workId],
      [stage_.viewer.id],
    )
  })

  test('AC-451: Scheduled holds every task carrying a date, in Q3\'s order', async () => {
    const stage_ = await stage()
    const body = await planned(stage_.viewer, tz)
    expectStillSameDay(tz, stage_.today, 'AC-451')
    expect(
      idsOf(body.rows),
      "Q3's membership is a Start Date or a Due Date (issue #216), and its leading key is the due date where there is one and the start date otherwise: started three days ago, due tomorrow, starting in two days, due in four days, starting in five days",
    ).toEqual([
      stage_.startOnlySpent,
      stage_.dueOnly,
      stage_.startOnly,
      stage_.startAndDue,
      stage_.starredStartOnly,
      stage_.starredDueLater,
    ])
  })

  test('AC-451: Anytime holds only the task carrying neither date', async () => {
    const stage_ = await stage()
    const body = await tasksView(stage_.viewer, tz)
    expectStillSameDay(tz, stage_.today, 'AC-451')
    const group = requireGroup(
      body.groups,
      stage_.workId,
      'the fixture folder holds the one undated row, so Q2 opens a heading for it',
    )
    expect(
      idsOf(group.rows),
      'Q2 is Scheduled\'s complement: a task belongs to Anytime only when it has neither date (issue #216)',
    ).toEqual([stage_.neither, stage_.starredUndated])
    expect(
      idsOf(body.inbox),
      'nothing was seeded in the Desk, and a start date does not move a task into one',
    ).toEqual([])
  })

  test('AC-451: the two pages partition the fixture with no gap and no overlap', async () => {
    const stage_ = await stage()
    const body = await allView(stage_.viewer, tz)
    expectStillSameDay(tz, stage_.today, 'AC-451')
    const scheduled = idsOf(body.planned)
    const anytime = [
      ...idsOf(body.tasks_inbox),
      ...body.tasks_groups.flatMap((group) => idsOf(group.rows)),
    ]
    const every = [
      stage_.dueOnly,
      stage_.startAndDue,
      stage_.startOnly,
      stage_.startOnlySpent,
      stage_.neither,
      stage_.starredStartOnly,
      stage_.starredUndated,
      stage_.starredDueLater,
    ]
    expect(
      [...scheduled, ...anytime].sort(),
      '6.1: Q5 is Q2 union Q3, so every open row appears exactly once across the two halves. A count rather than a containment, because a union of a due query and a start query emits the both-dated row twice and passes every membership check',
    ).toEqual([...every].sort())
    expect(
      scheduled.filter((id) => anytime.includes(id)),
      '6.1: Q2 intersect Q3 is empty, and it now rests on Anytime being written as the negation of Scheduled rather than on two sentences agreeing',
    ).toEqual([])
    expect(
      new Set([...scheduled, ...anytime]).size,
      'and no row is emitted twice inside either half: "do not create duplicate list rows for the same Task" (issue #216)',
    ).toBe(every.length)
  })

  test('AC-451: a spent Start Date is not a deadline, so nothing derives overdue from it', async () => {
    const stage_ = await stage()
    const body = await planned(stage_.viewer, tz)
    expectStillSameDay(tz, stage_.today, 'AC-451')
    const spent = requireCard(
      body.rows,
      stage_.startOnlySpent,
      'the started task is on Scheduled',
    )
    expect(
      { start_date: spent.start_date, due_date: spent.due_date },
      '8.1 derives overdue from due_date alone. A start-only task has none, so it leads the list by date and can still never be late: "Start-only Tasks must not acquire overdue styling simply because they have started" (issue #216)',
    ).toEqual({ start_date: shiftDate(stage_.today, -3), due_date: null })
    const pair = requireCard(
      body.rows,
      stage_.startAndDue,
      'the start-and-due task is on Scheduled',
    )
    expect(
      { start_date: pair.start_date, due_date: pair.due_date },
      'and a task carrying both is placed under its deadline while its row still shows the whole Schedule, which is what lets a chip read "starts in two, due in four"',
    ).toEqual({
      start_date: shiftDate(stage_.today, 2),
      due_date: shiftDate(stage_.today, 4),
    })
  })

  test("AC-451: the folder page's two open sections split the same way", async () => {
    const stage_ = await stage()
    const body = await folderOpen(stage_.viewer, stage_.workId, tz)
    expectStillSameDay(tz, stage_.today, 'AC-451')
    expect(
      idsOf(body.scheduled),
      "Q7's first section is Q3's predicate narrowed to one folder, so it moved with Q3",
    ).toEqual([
      stage_.startOnlySpent,
      stage_.dueOnly,
      stage_.startOnly,
      stage_.startAndDue,
      stage_.starredStartOnly,
      stage_.starredDueLater,
    ])
    expect(
      idsOf(body.unscheduled),
      "and the second is Q2's. A start-only task leaves the hand-ordered list exactly as a due-only one does, which is also why placeTaskInOrder refuses it",
    ).toEqual([stage_.neither, stage_.starredUndated])
  })

  test("AC-451: Important's two blocks are the same boundary", async () => {
    const stage_ = await stage()
    const body = await important(stage_.viewer, tz)
    expectStillSameDay(tz, stage_.today, 'AC-451')
    expect(
      idsOf(body.rows),
      'Q4 puts its scheduled block first and its Anytime block after, and its own sentence says the first shows "due date and time like a Scheduled row" and the second "their folder like an Anytime row". A start-only task belongs to the first and is ordered inside it by the one date it has, so it leads the starred task due three days later rather than trailing every dated row under a nulls-last due date; the undated row is the only one in the second block',
    ).toEqual([
      stage_.starredStartOnly,
      stage_.starredDueLater,
      stage_.starredUndated,
    ])
  })
})
