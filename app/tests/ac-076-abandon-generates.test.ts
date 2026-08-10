/*
AC-076: given abandon on a recurring occurrence, then a successor generates
exactly as on completion.

"Exactly as" is the whole criterion, so the file asserts it as a comparison
rather than as a list. Two identical occurrences are built, one completed and
one abandoned at the same moment in the same zone, and the two successors are
compared field by field. A list of expected values would pass an
implementation that generates on abandon with some detail dropped, as long as
the detail was one the list happened not to name; the comparison fails on any
difference at all, including one nobody thought to look for.

Why the criterion exists: 5.1 gives abandon the same side-effect cell as
complete, and 8.5's generation runs on "a pending-to-completed or
pending-to-abandoned transition". It is the easier of the two to forget,
because abandoning reads like giving up on the series rather than closing one
occurrence of it, and because the completion path has completed_at and
completed_by to write while the abandon path has nothing of its own to do,
so a hook attached to the completion branch alone looks finished.

The asymmetry that must survive is INV-8's. An abandoned row is not a
completed one: completed_at and completed_by stay null, and an implementation
that reached generation by routing abandon through the completion path would
either set them (a constraint violation) or set them and be caught here.

Spec: 5.1 (the pending-to-abandoned row and its side effects), 8.5
(generation runs on either transition), 7.6 (the transition endpoints, their
envelope, and the tz parameter ruled on 2026-08-10 which names both), INV-8,
INV-7.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  expectSweptTasks,
  expectTaskInvariants,
  readTask,
  requireTaskRow,
} from './tasks-harness.js'
import type { TaskRow } from './tasks-harness.js'
import {
  requireGenerated,
  requireOneSuccessor,
  seedRecurringTask,
  transitionRecurringOk,
  weeklyRuleOn,
} from './recurrence-harness.js'
import type { RecurringFixture } from './recurrence-harness.js'
import { middayZone, shiftDate, todayIn } from './views-harness.js'

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
    const folderId = await createFolder(owner, 'p6 ac076 abandon')
    staged = { owner, folderId }
  }
  return staged
}

/** Every occurrence in this file is identical but for its title, so the two
 * successors are comparable. Due today on a matching weekly rule, which is
 * 8.5's on-time case for both transitions. */
async function occurrence(label: string): Promise<RecurringFixture> {
  const { owner, folderId } = await stage()
  const dueDate = todayIn(tz)
  const fixture = await seedRecurringTask(app.db, owner, {
    folderId,
    title: `p6 ac076 ${label}`,
    dueDate,
    dueTime: '17:45',
    important: true,
    notes: 'p6 ac076 notes that must ride along',
    rule: weeklyRuleOn(dueDate),
  })
  taskIds.push(fixture.taskId)
  return fixture
}

/** The columns 8.5 copies, read off a successor. Ids, titles and timestamps
 * are excluded: they differ between two runs of the same generation for
 * reasons that are not the criterion's business. */
function copiedShape(row: TaskRow): Record<string, unknown> {
  return {
    status: row.status,
    due_time: row.due_time,
    important: row.important,
    notes: row.notes,
    recurrence_rule: row.recurrence_rule,
    folder_id: row.folder_id,
    assignee_id: row.assignee_id,
    created_by: row.created_by,
    completed_at: row.completed_at,
    completed_by: row.completed_by,
  }
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-076: abandoning generates the same successor completing does', () => {
  test('AC-076: abandon generates a successor at all', async () => {
    const { owner } = await stage()
    const fixture = await occurrence('generates')
    const body = await transitionRecurringOk(
      owner,
      fixture.taskId,
      'abandon',
      tz,
      'abandoning a pending occurrence is allowed to any member (spec 5.1, 5.4)',
    )
    const generated = requireGenerated(
      body,
      '5.1 gives abandon the same generation side effect complete has, and 8.5 runs on a pending-to-abandoned transition by name',
    )
    const successor = await requireOneSuccessor(
      app.db,
      fixture.seriesId,
      fixture.taskId,
      'one abandon generates one successor',
    )
    taskIds.push(successor.id)

    expect(generated.id, 'the envelope reports the inserted row').toBe(
      successor.id,
    )
    expect(
      String(successor.due_date),
      '8.5\'s cutoff does not know which transition called it: due today, closed today, so the successor is one week on',
    ).toBe(shiftDate(fixture.dueDate, 7))
    expect(
      successor.recurrence_rule,
      'the rule moves to the successor exactly as it does on completion',
    ).toBe(fixture.rule)
  })

  test('AC-076: the two successors are identical in every copied field', async () => {
    const { owner } = await stage()
    const completedSide = await occurrence('the completed side')
    const abandonedSide = await occurrence('the abandoned side')

    await transitionRecurringOk(
      owner,
      completedSide.taskId,
      'complete',
      tz,
      'the completion is accepted (spec 5.1)',
    )
    await transitionRecurringOk(
      owner,
      abandonedSide.taskId,
      'abandon',
      tz,
      'the abandon is accepted (spec 5.1)',
    )

    const fromComplete = await requireOneSuccessor(
      app.db,
      completedSide.seriesId,
      completedSide.taskId,
      'the completion generated its successor',
    )
    const fromAbandon = await requireOneSuccessor(
      app.db,
      abandonedSide.seriesId,
      abandonedSide.taskId,
      'the abandon generated its successor',
    )
    taskIds.push(fromComplete.id, fromAbandon.id)

    expect(
      copiedShape(fromAbandon),
      'AC-076 says "exactly as on completion", so the two successors are compared rather than checked against a list: any field 8.5 copies on one path and drops on the other shows up here, including one this file never thought to name',
    ).toEqual(copiedShape(fromComplete))
    expect(
      String(fromAbandon.due_date),
      'and they land on the same date, the two occurrences having been identical',
    ).toBe(String(fromComplete.due_date))
    expect(
      String(fromAbandon.series_id),
      'each successor stays in its own series',
    ).not.toBe(String(fromComplete.series_id))
  })

  test('AC-076: the abandoned row is abandoned, not completed', async () => {
    const { owner } = await stage()
    const fixture = await occurrence('closed row')
    await transitionRecurringOk(
      owner,
      fixture.taskId,
      'abandon',
      tz,
      'the abandon is accepted (spec 5.1)',
    )
    taskIds.push(
      (
        await requireOneSuccessor(
          app.db,
          fixture.seriesId,
          fixture.taskId,
          'the abandon generated a successor',
        )
      ).id,
    )

    const closed = await requireTaskRow(app.db, fixture.taskId)
    expect(String(closed.status), 'the row is abandoned').toBe('abandoned')
    expect(
      closed.completed_at,
      'INV-8: only a completed row carries completion columns, so reaching generation through the completion path would be caught here or by the CHECK',
    ).toBeNull()
    expect(closed.completed_by, 'INV-8, the other column').toBeNull()
    expect(
      String(closed.due_date),
      'abandoning does not move the date either (spec 5.1)',
    ).toBe(fixture.dueDate)
    expect(
      closed.recurrence_rule,
      '8.5 clears the rule behind it on this path too',
    ).toBeNull()
    expect(
      (await readTask(owner, fixture.taskId)).is_recurring,
      '7.0: the abandoned row no longer carries a rule',
    ).toBe(false)
  })

  test('AC-076 adversarial: a repeat abandon generates nothing', async () => {
    const { owner } = await stage()
    const fixture = await occurrence('repeat call')
    await transitionRecurringOk(
      owner,
      fixture.taskId,
      'abandon',
      tz,
      'the first abandon is accepted (spec 5.1)',
    )
    const successor = await requireOneSuccessor(
      app.db,
      fixture.seriesId,
      fixture.taskId,
      'the first abandon generated one successor',
    )
    taskIds.push(successor.id)

    const repeat = await transitionRecurringOk(
      owner,
      fixture.taskId,
      'abandon',
      tz,
      '5.1: abandoned plus abandon is a no-op answering 200',
    )
    expect(
      repeat.generated,
      '8.3 runs generation only where the guarded update changed a row, so the no-op generates nothing',
    ).toBeNull()
    await requireOneSuccessor(
      app.db,
      fixture.seriesId,
      fixture.taskId,
      'and the series is unchanged by the repeat',
    )
  })

  test('AC-076: invariants hold afterwards', async () => {
    const { owner, folderId } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, [folderId], [owner.id])
  })
})
