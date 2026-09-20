/*
AC-072: given weekly Monday due 2026-07-20 completed that day, then the
successor is due 2026-07-27, carries the rule, and the completed row keeps its
date with rule null.

Asserted by its content rather than at the dates it names, ruled at the P6
kickoff on 2026-08-10 and recorded in section 12 beside the range, the same
treatment AC-046 and AC-050 carry from P4. The completing side of the worked
example is today wherever this suite runs, and 2026-07-20 is producible by no
API call, so the file computes today in one zone, dates the occurrence there,
and builds a weekly rule on that date's own weekday. What the criterion pins
is 8.5's first worked consequence, on time: cutoff = max(due_date,
current_date(actor.tz)) collapses to the due date, and the next instance
strictly after it is one interval on.

Three outcomes, and the third is the one an implementation is most likely to
get half right. The successor is due one week on. It carries the rule, so the
series continues from it. And the closed row keeps its own date while losing
the rule, because 8.5 puts the rule on the current occurrence alone: a
generation that copied the rule forward without clearing it behind leaves two
rows of one series carrying rules, which INV-7 does not catch (it counts
pending rows) and which makes the next un-complete ambiguous.

The clock is not owned. The zone is the one whose local time is nearest
midday, so the fixture cannot straddle a local midnight between being seeded
and being completed, and every assertion is a relationship between dates
rather than a constant.

Spec: 8.5 (evaluation, generation, and the first worked consequence), 5.1
(pending to complete runs generation in the same transaction), 7.6 (the
transition endpoints, their response envelope, and the tz parameter ruled on
2026-08-10), 4.11 (the rule's subset and the anchor), INV-13, INV-7.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  expectSweptTasks,
  expectTaskInvariants,
  readTask,
  requireTaskRow,
} from '../support/tasks-harness.js'
import {
  bydayOf,
  requireGenerated,
  requireOneSuccessor,
  seedRecurringTask,
  transitionRecurringOk,
  weeklyRuleOn,
} from '../support/recurrence-harness.js'
import type { RecurringFixture } from '../support/recurrence-harness.js'
import { middayZone, shiftDate, todayIn } from '../support/views-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'p6')

const tz = middayZone()

interface Stage {
  owner: Actor
  folderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner] = await cast.of(app)
    if (owner === undefined) throw new Error('cast must produce one actor')
    const folderId = await createFolder(owner, 'p6 ac072 on time')
    staged = { owner, folderId }
  }
  return staged
}

/** Due today in tz, on a weekly rule that lands on today's weekday: 8.5's
 * "due 2026-07-20, completed 2026-07-20" with the clock left alone. */
async function occurrence(label: string): Promise<RecurringFixture> {
  const { owner, folderId } = await stage()
  const dueDate = todayIn(tz)
  const fixture = await seedRecurringTask(app.db, owner, {
    folderId,
    title: `p6 ac072 ${label}`,
    dueDate,
    dueTime: '09:30',
    important: true,
    rule: weeklyRuleOn(dueDate),
  })
  taskIds.push(fixture.taskId)
  return fixture
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-072: completing on time generates the next slot', () => {
  test('AC-072: the successor is due one interval after the occurrence', async () => {
    const { owner } = await stage()
    const fixture = await occurrence('successor')
    const body = await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      tz,
      'completing a pending occurrence is allowed to any member (spec 5.1, 5.4)',
    )
    const generated = requireGenerated(
      body,
      'a pending row carrying a rule generates its successor inside the completing transaction',
    )
    const successor = await requireOneSuccessor(
      app.db,
      fixture.seriesId,
      fixture.taskId,
      'one completion generates one successor',
    )
    taskIds.push(successor.id)

    expect(
      generated.id,
      'the envelope reports the row generation actually inserted (spec 7.6)',
    ).toBe(successor.id)
    expect(
      String(successor.due_date),
      `8.5: cutoff = max(due_date, current_date(actor.tz)) is the due date when the occurrence is completed on it, and the next weekly instance is seven days on. Due ${fixture.dueDate}, rule ${fixture.rule}, completed in ${tz}`,
    ).toBe(shiftDate(fixture.dueDate, 7))
    expect(
      bydayOf(String(successor.due_date)),
      'a weekly rule keeps its weekday',
    ).toBe(bydayOf(fixture.dueDate))
    expect(
      generated.due_date,
      'and the wire says the same thing as the row',
    ).toBe(successor.due_date)
  })

  test('AC-072: the successor carries the rule and the series', async () => {
    const { owner } = await stage()
    const fixture = await occurrence('carries the rule')
    await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      tz,
      'the completion is accepted (spec 5.1)',
    )
    const successor = await requireOneSuccessor(
      app.db,
      fixture.seriesId,
      fixture.taskId,
      'the completion generated the successor under test',
    )
    taskIds.push(successor.id)

    expect(
      successor.recurrence_rule,
      '8.5 copies recurrence_rule onto the successor: the rule lives on the current occurrence, and the successor is now it',
    ).toBe(fixture.rule)
    expect(
      String(successor.series_id),
      '8.5 copies series_id, which is what makes this one series rather than two (INV-13, 4.12)',
    ).toBe(fixture.seriesId)
    expect(
      String(successor.status),
      'the successor arrives pending (spec 8.5)',
    ).toBe('pending')
    expect(
      successor.completed_at,
      'INV-8: a pending row has no completion columns',
    ).toBeNull()
    expect(
      (await readTask(owner, successor.id)).is_recurring,
      '7.0: is_recurring reports the rule the row carries, and the successor carries it',
    ).toBe(true)
  })

  test('AC-072: the completed row keeps its date and loses the rule', async () => {
    const { owner } = await stage()
    const fixture = await occurrence('closing row')
    const body = await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      tz,
      'the completion is accepted (spec 5.1)',
    )
    const closed = await requireTaskRow(app.db, fixture.taskId)
    taskIds.push(
      (
        await requireOneSuccessor(
          app.db,
          fixture.seriesId,
          fixture.taskId,
          'the completion generated a successor',
        )
      ).id,
    )

    expect(
      String(closed.due_date),
      '5.1 lists this transition\'s side effects and moving the date is not among them: the completed row is history on the day it was due',
    ).toBe(fixture.dueDate)
    expect(
      closed.recurrence_rule,
      '8.5: t.recurrence_rule = null at the end of generation, because the rule lives only on the current occurrence',
    ).toBeNull()
    expect(
      String(closed.series_id),
      'the series id stays for history (spec 8.4, 8.5), which is what the Done-page trail and G-SERIES read',
    ).toBe(fixture.seriesId)
    expect(String(closed.status), 'the row is completed').toBe('completed')
    expect(
      body.task.recurrence_rule,
      'the envelope\'s task is the closed row, so it reports the rule as gone too',
    ).toBeNull()
    expect(
      body.task.is_recurring,
      '7.0: a row with no rule is not recurring',
    ).toBe(false)
  })

  test('AC-072: the successor copies the occurrence and nothing else', async () => {
    const { owner } = await stage()
    const fixture = await occurrence('copied fields')
    const before = await requireTaskRow(app.db, fixture.taskId)
    await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      tz,
      'the completion is accepted (spec 5.1)',
    )
    const successor = await requireOneSuccessor(
      app.db,
      fixture.seriesId,
      fixture.taskId,
      'the completion generated the successor under test',
    )
    taskIds.push(successor.id)

    // 8.5 names the copied columns one by one. Each is a field an
    // implementation can silently drop, and a dropped one is invisible until
    // a user notices their repeating task lost its time or its folder.
    expect(successor.title, '8.5 copies title').toBe(before.title)
    expect(successor.notes, '8.5 copies notes').toBe(before.notes)
    expect(String(successor.folder_id), '8.5 copies folder_id').toBe(
      String(before.folder_id),
    )
    expect(String(successor.assignee_id), '8.5 copies assignee_id').toBe(
      String(before.assignee_id),
    )
    expect(successor.important, '8.5 copies important').toBe(before.important)
    expect(String(successor.due_time), '8.5 copies due_time').toBe(
      String(before.due_time),
    )
    expect(String(successor.created_by), '8.5 copies created_by').toBe(
      String(before.created_by),
    )
    expect(
      successor.completed_by,
      '8.5 inserts the successor pending, so it carries no completion of its own even though the row it came from was just completed',
    ).toBeNull()
    expect(
      successor.id,
      'the successor is a new row, never the same one moved forward',
    ).not.toBe(fixture.taskId)
  })

  test('AC-072 adversarial: a second complete generates nothing more', async () => {
    const { owner } = await stage()
    const fixture = await occurrence('repeat call')
    await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      tz,
      'the first completion is accepted (spec 5.1)',
    )
    const successor = await requireOneSuccessor(
      app.db,
      fixture.seriesId,
      fixture.taskId,
      'the first completion generated one successor',
    )
    taskIds.push(successor.id)

    const repeat = await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      tz,
      '5.1: completed plus complete is a no-op answering 200',
    )
    expect(
      repeat.generated,
      '8.3 runs generation only in the branch where the guarded update changed a row, so a repeat call generates nothing and reports nothing',
    ).toBeNull()
    await requireOneSuccessor(
      app.db,
      fixture.seriesId,
      fixture.taskId,
      'the no-op left the series exactly as the first completion did; a retried request must not double the series',
    )
  })

  test('AC-072: invariants hold afterwards', async () => {
    const { owner, folderId } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, [folderId], [owner.id])
  })
})
