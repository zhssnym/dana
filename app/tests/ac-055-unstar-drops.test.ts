/*
AC-055: given un-star on a row in Important, then the next fetch omits it and
the task is otherwise unchanged.

Two halves with different owners, and both are asserted here because the
criterion is about the pair. The un-star is 7.6's PATCH, merged at P3; the
next fetch is 7.10's Important, which is this package's. What the criterion
adds beyond either is the word "otherwise": 6 Q4 says un-starring removes the
row from the result on the next fetch and nothing else about the task
changes, so an implementation that quietly cleared a date, dropped a My Day
entry, or moved the row would satisfy the first clause and violate the
second.

"Otherwise unchanged" is asserted as column equality across the operation,
every column of the tasks row except important and updated_at, plus the My
Day entry and the step rows beside it. updated_at is excluded by name rather
than by omission: 7.6 makes the PATCH a write, and a write that did not move
the row's clock would be the defect, so the exclusion is a claim about which
columns the star may touch rather than a tolerance.

The other half of "the next fetch" is that the row is still where it lives.
A star is a cross-cutting marker, not a home: 6 Q4 says un-starring removes
it from Important, and Q2 or Q3 held it throughout for reasons that have
nothing to do with the star.

Spec: 6 Q4, 6 Q2, 6 Q3, 7.6 (PATCH), 7.10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, defaultFolderOf, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  expectTaskInvariants,
  myDayAddedOn,
  patchTask,
  pullIntoMyDay,
  requireTaskRow,
  stepRows,
} from './tasks-harness.js'
import type { TaskRow } from './tasks-harness.js'
import {
  idsOf,
  important,
  middayZone,
  planned,
  seedViewTask,
  shiftDate,
  tasksRowsOf,
  tasksView,
  todayIn,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer'], 'p4')

const tz = middayZone()

/** Every column of the tasks row except the two the un-star is allowed to
 * move. Named rather than diffed loosely, so a column added to section 4
 * without a decision here fails the typecheck instead of slipping through. */
function unchangedColumns(row: TaskRow): Record<string, unknown> {
  const { important: _star, updated_at: _clock, ...rest } = row
  return rest
}

interface Stage {
  viewer: Actor
  inboxId: string
  /** Starred and dated, so Planned is its home. */
  dated: string
  /** Starred and undated, so Tasks is its home. */
  undated: string
  before: TaskRow
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer] = await cast.of(app)
    if (viewer === undefined) throw new Error('cast must produce one actor')
    const inboxId = await defaultFolderOf(app.db, viewer.id)
    const today = todayIn(tz)
    const seed = (options: Parameters<typeof seedViewTask>[1]) =>
      seedViewTask(app.db, {
        ...options,
        assigneeId: viewer.id,
        important: true,
      })

    const dated = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac055 starred and dated',
      notes: 'notes that must survive the un-star',
      dueDate: shiftDate(today, 3),
      dueTime: '11:30',
    })
    const undated = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac055 starred and undated',
    })
    // A pull, so the un-star has something else nearby it could disturb.
    const pull = await pullIntoMyDay(viewer, dated)
    expectStatus(
      pull,
      200,
      'the pull the case needs must be accepted (spec 7.8; P3 is merged)',
    )

    staged = {
      viewer,
      inboxId,
      dated,
      undated,
      before: await requireTaskRow(app.db, dated),
    }
  }
  return staged
}

async function unstar(actor: Actor, taskId: string): Promise<void> {
  const response = await patchTask(actor, taskId, { important: false })
  expectStatus(
    response,
    200,
    `PATCH /tasks/${taskId} with important false must be accepted (spec 7.6; P3 is merged)`,
  )
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-055: un-starring drops the row from Important and moves nothing else', () => {
  test('AC-055: the row is on the page before the un-star', async () => {
    const { viewer, dated } = await stage()
    const body = await important(viewer, tz)
    expect(
      idsOf(body.rows),
      'without this the omission below would pass against an implementation that never listed the row at all',
    ).toContain(dated)
  })

  test('AC-055: the next fetch omits it', async () => {
    const { viewer, dated } = await stage()
    await unstar(viewer, dated)
    const body = await important(viewer, tz)
    expect(
      idsOf(body.rows),
      '6 Q4: un-starring a row removes it from the result on the next fetch. The page is a query over important = true, so nothing is deleted and nothing is remembered',
    ).not.toContain(dated)
  })

  test('AC-055: and the task is otherwise unchanged', async () => {
    const { viewer, dated, before } = await stage()
    await unstar(viewer, dated)
    const after = await requireTaskRow(app.db, dated)
    expect(
      unchangedColumns(after),
      '6 Q4: nothing else about the task changes. Every column of section 4 except important is compared, updated_at excepted because 7.6 makes this a write and a write that left the clock alone would be the defect',
    ).toEqual(unchangedColumns(before))
    expect(
      after.important,
      'the one column the call is about',
    ).toBe(false)
  })

  test('AC-055 adversarial: the My Day entry and the steps are untouched', async () => {
    const { viewer, dated } = await stage()
    await unstar(viewer, dated)
    expect(
      await myDayAddedOn(app.db, dated, viewer.id),
      'a star is not a My Day membership, and 5.1 lists no side effect of an edit that would drop one',
    ).toBeDefined()
    expect(
      await stepRows(app.db, dated),
      'nor is it anything to do with steps (spec 4.6)',
    ).toEqual([])
  })

  test('AC-055: the row is still in its own home page', async () => {
    const { viewer, dated, undated } = await stage()
    await unstar(viewer, dated)
    await unstar(viewer, undated)

    const list = await planned(viewer, tz)
    expect(
      idsOf(list.rows),
      'Q3\'s predicate never mentions important, so the dated row was in Planned before the star and after it: Important is a cross-cutting view, not a home',
    ).toContain(dated)

    const tasks = await tasksView(viewer, tz)
    expect(
      idsOf(tasksRowsOf(tasks)),
      'and Q2 holds the undated one for the same reason',
    ).toContain(undated)
  })

  test('AC-055 adversarial: re-starring puts it back', async () => {
    const { viewer, dated } = await stage()
    await unstar(viewer, dated)
    const response = await patchTask(viewer, dated, { important: true })
    expectStatus(
      response,
      200,
      'PATCH with important true must be accepted (spec 7.6)',
    )
    const body = await important(viewer, tz)
    expect(
      idsOf(body.rows),
      'the page is a query and holds no memory of the row having left it; an implementation that recorded the removal rather than reading the column would keep it out',
    ).toContain(dated)
  })

  test('AC-055: the fixture satisfies section 3', async () => {
    const { viewer, inboxId, dated, undated } = await stage()
    await expectTaskInvariants(
      app.db,
      [dated, undated],
      [inboxId],
      [viewer.id],
    )
  })
})
