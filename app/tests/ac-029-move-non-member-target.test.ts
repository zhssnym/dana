/*
AC-029: given a move whose target folder the caller is not a member of, then
the request fails and nothing changes.

The criterion names no status, and 7.6 admits two for this move ("V must be
member of both source and target (404 or 422)"), so the assertion is
membership in that pair rather than one number: pinning a single value would
be inventing a rule the frozen text left open. What is not open is the
failure itself and its emptiness, so both halves are asserted hard, and a
500 fails the pair.

Attacked beside the criterion: the mirror case, a move out of a folder the
caller cannot see, which must read 404 and never 403 under the leak rule of
10.2; a target id that exists nowhere, which must fail the same way rather
than crash on a foreign key; and the emptiness, read from the row rather
than from the response, including updated_at, because "nothing changes" is
violated by a touch as surely as by a move.

Spec: 7.6 (PATCH, folder_id change is a move), 10.2 (inaccessible reads as
404), 5.4 (the move row: member of both), 4.5 (updated_at is touched on
every mutation, so an unchanged row must carry an unchanged one).
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  countRows,
  createFolder,
  defaultFolderOf,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTaskOk,
  expectTaskInvariants,
  patchTask,
  requireTaskRow,
} from './tasks-harness.js'
import type { TaskRow } from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['author', 'stranger'], 'p3')

interface Stage {
  author: Actor
  stranger: Actor
  authorFolderId: string
  strangerFolderId: string
  authorInboxId: string
  taskId: string
  strangerTaskId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [author, stranger] = await cast.of(app)
    if (author === undefined || stranger === undefined) {
      throw new Error('cast must produce two actors')
    }
    const authorFolderId = await createFolder(author, 'p3 ac029 source')
    const strangerFolderId = await createFolder(stranger, 'p3 ac029 elsewhere')
    const authorInboxId = await defaultFolderOf(app.db, author.id)
    const task = await createTaskOk(
      author,
      { title: 'p3 ac029 stays put', folder_id: authorFolderId },
      'the task the move is attempted on must be creatable (spec 7.6)',
    )
    const strangerTask = await createTaskOk(
      stranger,
      { title: 'p3 ac029 out of reach', folder_id: strangerFolderId },
      'the task the mirror case reaches for must be creatable (spec 7.6)',
    )
    staged = {
      author,
      stranger,
      authorFolderId,
      strangerFolderId,
      authorInboxId,
      taskId: task.id,
      strangerTaskId: strangerTask.id,
    }
  }
  return staged
}

function expectRefused(status: number, why: string): void {
  expect(
    [404, 422].includes(status),
    `${why}; frozen 7.6 admits 404 or 422 for this move and answered ${String(status)}`,
  ).toBe(true)
}

function snapshot(row: TaskRow): Record<string, unknown> {
  return {
    folder_id: String(row.folder_id),
    title: row.title,
    assignee_id: row.assignee_id === null ? null : String(row.assignee_id),
    status: row.status,
    updated_at: String(row.updated_at),
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

describe('AC-029: a move into a folder the caller is not in is refused', () => {
  test('AC-029: the move fails', async () => {
    const { author, taskId, strangerFolderId } = await stage()
    const response = await patchTask(author, taskId, {
      folder_id: strangerFolderId,
    })
    expectRefused(
      response.status,
      `moving into a folder V is not a member of must fail (spec 7.6, 5.4); body: ${response.body.slice(0, 160)}`,
    )
  })

  test('AC-029: nothing about the task changed', async () => {
    const { author, taskId, authorFolderId, strangerFolderId } = await stage()
    const before = snapshot(await requireTaskRow(app.db, taskId))
    await patchTask(author, taskId, { folder_id: strangerFolderId })
    const after = snapshot(await requireTaskRow(app.db, taskId))
    expect(
      after,
      'a refused move leaves the row exactly as it was, updated_at included (spec 4.5)',
    ).toEqual(before)
    expect(after.folder_id, 'the task is still in its own folder').toBe(
      authorFolderId,
    )
  })

  test('AC-029 adversarial: the target folder gained nothing', async () => {
    const { author, taskId, strangerFolderId, strangerTaskId, stranger } =
      await stage()
    await patchTask(author, taskId, { folder_id: strangerFolderId })
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM tasks WHERE folder_id = ${strangerFolderId}`,
      ),
      "the stranger's folder must still hold only their own task",
    ).toBe(1)
    expect(
      String((await requireTaskRow(app.db, strangerTaskId)).created_by),
      'and that task is still theirs',
    ).toBe(stranger.id)
  })

  test('AC-029 adversarial: moving a task the caller cannot see reads as 404', async () => {
    const { author, strangerTaskId, authorFolderId } = await stage()
    const response = await patchTask(author, strangerTaskId, {
      folder_id: authorFolderId,
    })
    expect(
      response.status,
      'an inaccessible task is indistinguishable from a nonexistent one (spec 10.2), never 403',
    ).toBe(404)
    const row = await requireTaskRow(app.db, strangerTaskId)
    expect(
      String(row.folder_id),
      'the task stayed where its own member left it',
    ).toBe((await stage()).strangerFolderId)
  })

  test('AC-029 adversarial: a target id that exists nowhere fails the same way', async () => {
    const { author, taskId } = await stage()
    const response = await patchTask(author, taskId, {
      folder_id: '00000000-0000-4000-8000-000000000000',
    })
    expectRefused(
      response.status,
      `a folder id nobody owns is a folder V is not a member of; the FK must never answer for it (spec 7.6, 10.2); body: ${response.body.slice(0, 160)}`,
    )
  })

  test('AC-029: invariants hold afterwards', async () => {
    const stageState = await stage()
    await expectTaskInvariants(
      app.db,
      [stageState.taskId, stageState.strangerTaskId],
      [
        stageState.authorFolderId,
        stageState.strangerFolderId,
        stageState.authorInboxId,
      ],
      [stageState.author.id, stageState.stranger.id],
    )
  })
})
