/*
AC-025: given creation with only a title, then the task lands in the
caller's Inbox, assigned to the caller, pending, undated.

Four defaults in one sentence, and each is a place an implementation can be
wrong on its own: 7.6 defaults folder_id to V's Inbox, assignee_id to V,
4.5 defaults status to pending, and undated means both date columns null.
The file asserts all four on the wire and again on the row, because a create
that answers the right body while storing something else is the failure the
row check exists to catch.

Attacked beside the criterion: the fields nobody asked for must be at their
4.5 defaults rather than invented (important false, notes null, no steps),
creation must not pull the task into My Day (7.8 is the only thing that
does), and the 7.6 guards around the body, title 1 to 300 and membership of
the named folder, must answer 422 and 404 rather than 500 or a task.

Spec: 7.6 (POST /tasks and its guards), 7.0 (TaskDetail), 7.1 (the Inbox
provisioning gives), 4.5 (column defaults), 10.2 (the leak rule), 10.3
(title limits), INV-5.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  countRows,
  createFolder,
  defaultFolderOf,
  expectStatus,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createTask,
  createTaskOk,
  expectTaskInvariants,
  myDayRows,
  reminderRow,
  requireTaskRow,
  stepRows,
} from '../support/tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['author', 'stranger'], 'p3')

interface Stage {
  author: Actor
  stranger: Actor
  inboxId: string
  strangerFolderId: string
  taskId: string
  body: Record<string, unknown>
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [author, stranger] = await cast.of(app)
    if (author === undefined || stranger === undefined) {
      throw new Error('cast must produce two actors')
    }
    const inboxId = await defaultFolderOf(app.db, author.id)
    const strangerFolderId = await createFolder(stranger, 'p3 ac025 private')
    const body = await createTaskOk(
      author,
      { title: 'p3 ac025 title only' },
      'POST /tasks with only a title must create the task and answer 201 with the TaskDetail (spec 7.6)',
    )
    staged = {
      author,
      stranger,
      inboxId,
      strangerFolderId,
      taskId: body.id,
      body,
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

describe('AC-025: a title-only create lands in the Inbox with the 7.6 defaults', () => {
  test('AC-025: the task lands in the caller\'s Inbox', async () => {
    const { inboxId, body } = await stage()
    const folder = body.folder as Record<string, unknown>
    expect(
      folder.id,
      'a body carrying no folder_id defaults to V\'s Inbox (spec 7.6)',
    ).toBe(inboxId)
    expect(
      folder.is_default,
      'the Inbox is the default folder (spec 7.1, INV-2)',
    ).toBe(true)
    expect(
      folder.name,
      'provisioning names the default folder Desk (RFC 0005; spec 2)',
    ).toBe('Desk')
  })

  test('AC-025: the task is assigned to the caller', async () => {
    const { author, body } = await stage()
    const assignee = body.assignee as Record<string, unknown> | null
    expect(
      assignee,
      'assignee_id defaults to V (spec 7.6), and the Inbox has exactly one member (INV-5)',
    ).not.toBeNull()
    expect((assignee as Record<string, unknown>).id).toBe(author.id)
  })

  test('AC-025: the task is pending and undated', async () => {
    const { body } = await stage()
    expect(body.status, 'a new task is pending (spec 4.5)').toBe('pending')
    expect(body.due_date, 'nothing dated it, so due_date is null').toBeNull()
    expect(body.due_time, 'nothing timed it, so due_time is null').toBeNull()
  })

  test('AC-025: the stored row agrees with the body on all four', async () => {
    const { author, inboxId, taskId } = await stage()
    const row = await requireTaskRow(app.db, taskId)
    expect(String(row.folder_id), 'the stored folder is the Inbox').toBe(inboxId)
    expect(
      row.assignee_id === null ? null : String(row.assignee_id),
      'the stored assignee is the caller',
    ).toBe(author.id)
    expect(row.status, 'the stored status is pending').toBe('pending')
    expect(row.due_date, 'the stored due_date is null').toBeNull()
    expect(row.due_time, 'the stored due_time is null').toBeNull()
    expect(
      String(row.created_by),
      'created_by is the caller (spec 4.5, NOT NULL)',
    ).toBe(author.id)
  })

  test('AC-025 adversarial: nothing the body did not ask for was invented', async () => {
    const { taskId, body } = await stage()
    expect(body.important, 'important defaults to false (spec 7.6, 4.5)').toBe(
      false,
    )
    expect(body.notes, 'no notes were sent, so notes is null').toBeNull()
    expect(body.recurrence_rule, 'no rule was sent').toBeNull()
    expect(body.series_id, 'no rule means no series (INV-13)').toBeNull()
    expect(body.reminder, 'no reminder was sent').toBeNull()
    expect(body.steps, 'no steps were sent').toEqual([])
    expect(body.steps_total, 'no steps means steps_total zero').toBe(0)
    expect(body.steps_done, 'no steps means steps_done zero').toBe(0)
    expect(body.is_recurring, 'no rule means is_recurring false').toBe(false)
    expect(body.completed_at, 'a pending task has no completed_at (INV-8)').toBeNull()
    expect(body.completed_by, 'a pending task has no completed_by (INV-8)').toBeNull()
    expect(
      await stepRows(app.db, taskId),
      'no steps rows were written',
    ).toEqual([])
    expect(
      await reminderRow(app.db, taskId),
      'no reminder row was written',
    ).toBeUndefined()
  })

  test('AC-025 adversarial: creating a task does not pull it into My Day', async () => {
    const { taskId, body } = await stage()
    expect(
      body.pulled,
      'pulled reports a My Day entry of the viewer (spec 7.0), and only 7.8 creates one',
    ).toBe(false)
    expect(
      await myDayRows(app.db, taskId),
      'POST /tasks must write no my_day_entries row (spec 7.8 is the only writer)',
    ).toEqual([])
  })

  test('AC-025 adversarial: the title limits of 10.3 are enforced', async () => {
    const { author } = await stage()
    const empty = await createTask(author, { title: '' })
    expectStatus(
      empty,
      422,
      'a title shorter than one character must answer 422 (spec 7.6, 10.3)',
    )
    const missing = await createTask(author, {})
    expectStatus(
      missing,
      422,
      'title is required by 7.6, so a body without one must answer 422',
    )
    const tooLong = await createTask(author, { title: 'x'.repeat(301) })
    expectStatus(
      tooLong,
      422,
      'a title longer than 300 characters must answer 422 (spec 7.6, 10.3)',
    )
    const atLimit = await createTaskOk(
      author,
      { title: 'y'.repeat(300) },
      'a title of exactly 300 characters is inside the 10.3 limit and must be accepted',
    )
    expect(atLimit.title, 'the accepted title is stored whole').toHaveLength(300)
  })

  test('AC-025 adversarial: creating in a folder the caller cannot see answers 404', async () => {
    const { author, strangerFolderId } = await stage()
    const response = await createTask(author, {
      title: 'p3 ac025 trespass',
      folder_id: strangerFolderId,
    })
    expectStatus(
      response,
      404,
      'a non-member must not create in a folder, and an inaccessible folder reads as nonexistent (spec 7.6, 10.2)',
    )
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM tasks WHERE folder_id = ${strangerFolderId}`,
      ),
      'the refused create must write no row into the folder it named',
    ).toBe(0)
  })

  test('AC-025: invariants hold afterwards', async () => {
    const { author, stranger, inboxId, taskId, strangerFolderId } = await stage()
    await expectTaskInvariants(
      app.db,
      [taskId],
      [inboxId, strangerFolderId],
      [author.id, stranger.id],
    )
  })
})
