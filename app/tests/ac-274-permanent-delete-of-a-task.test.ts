/*
AC-274: given a trashed task with steps, a conversation and a file hung on
that conversation, when the folder owner deletes it permanently, then the
task, its steps, its comments and the file's row and bytes are all gone,
the Trash no longer lists it, and no restore can bring it back; and given a
task that is not in Trash, then the same call is 404, the live delete being
7.6's soft one.

Permanent delete is RFC 0005 change control item 36 enacted by RFC 0004's
S28a: 7.13 gains an address, and the endpoint calls the collection the 11.7
purge already does rather than writing a delete beside it. A task carries no
files row of its own, but its conversation may (4.15), and once the task's
cascade takes the comments nothing is left that names those rows, so they
go with the task and their bytes leave the store after the commit (7.15's
order). The store is injected through the 11.10 seam, AC-235's precedent,
because a removal from a store nothing reads is unobservable.

Spec: 7.13 as amended (RFC 0005 change control items 36, 38 and 52), 4.15,
4.16, 11.7, 10.2.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  countRows,
  createFolder,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { addStepOk, createTaskOk, deleteTask } from './tasks-harness.js'
import { upload } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 's28a')

const objects = new Map<string, Buffer>()
const memoryStore = {
  put: (id: string, bytes: Buffer): Promise<void> => {
    objects.set(id, bytes)
    return Promise.resolve()
  },
  get: (id: string): Promise<Buffer | null> =>
    Promise.resolve(objects.get(id) ?? null),
  remove: (id: string): Promise<void> => {
    objects.delete(id)
    return Promise.resolve()
  },
}

beforeAll(async () => {
  app = await startAuthTestApp({ fileStore: memoryStore })
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-274 the owner deletes a trashed task for good', () => {
  test('rows, steps, comments, file row and bytes all go; restore is 404', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 's28a ac274 home')
    const task = await createTaskOk(
      owner,
      { title: 's28a ac274 doomed', folder_id: folderId },
      'the task must exist before it is trashed (spec 7.6)',
    )
    await addStepOk(owner, task.id, 's28a ac274 step')

    const stored = await upload(
      owner,
      '/files',
      { kind: 'file', folder_id: folderId },
      {
        name: 'attached.txt',
        type: 'text/plain',
        bytes: Buffer.from('ac274 bytes on a conversation', 'utf8'),
      },
    )
    expectStatus(stored, 201, 'the file must store first (spec 7.15)')
    const fileId = String((stored.json() as { id?: unknown }).id)
    expect(objects.has(fileId), 'the injected store holds the object').toBe(true)

    const comment = await owner.browser.json(
      `/folders/${folderId}/comments?task=${task.id}`,
      'POST',
      { body: 's28a ac274 said with a file', file_id: fileId },
    )
    expectStatus(comment, 201, 'a comment carrying a file (spec 7.14)')

    // Not in Trash yet: the permanent delete has nothing to act on.
    const tooEarly = await owner.browser.json(
      `/trash/tasks/${task.id}`,
      'DELETE',
    )
    expectStatus(
      tooEarly,
      404,
      'a live task is not in Trash, and only a trashed row may be destroyed (spec 7.13)',
    )

    expectStatus(await deleteTask(owner, task.id), 204, 'the soft delete (spec 7.6)')

    const destroyed = await owner.browser.json(
      `/trash/tasks/${task.id}`,
      'DELETE',
    )
    expectStatus(destroyed, 204, 'the owner destroys a trashed task (spec 7.13)')

    expect(
      await countRows(app.db, sql`SELECT count(*)::int AS n FROM tasks WHERE id = ${task.id}::uuid`),
      'the task row is gone',
    ).toBe(0)
    expect(
      await countRows(app.db, sql`SELECT count(*)::int AS n FROM steps WHERE task_id = ${task.id}::uuid`),
      'its steps went by the named cascade',
    ).toBe(0)
    expect(
      await countRows(app.db, sql`SELECT count(*)::int AS n FROM comments WHERE task_id = ${task.id}::uuid`),
      'its conversation went by the named cascade (spec 4.15)',
    ).toBe(0)
    expect(
      await countRows(app.db, sql`SELECT count(*)::int AS n FROM files WHERE id = ${fileId}::uuid`),
      'the file that hung on the conversation alone is deleted with it, its row being the only index to the bytes (spec 4.16, item 36)',
    ).toBe(0)
    expect(
      objects.has(fileId),
      'and its bytes left the store after the commit (spec 7.15 order, item 36)',
    ).toBe(false)

    const trash = await owner.browser.json('/trash', 'GET')
    expectStatus(trash, 200, 'trash reads (spec 7.13)')
    expect(
      JSON.stringify(trash.json()).includes(task.id),
      'the Trash no longer lists it',
    ).toBe(false)

    const restore = await owner.browser.json(`/tasks/${task.id}/restore`, 'POST')
    expectStatus(restore, 404, 'nothing is left to restore (spec 7.13)')
    const again = await owner.browser.json(`/trash/tasks/${task.id}`, 'DELETE')
    expectStatus(again, 404, 'a second destroy finds nothing (spec 10.2)')

    const events = await owner.browser.json(`/events?folder=${folderId}`, 'GET')
    expectStatus(events, 200, 'the folder log reads (spec 7.12)')
    expect(
      JSON.stringify(events.json()).includes('deleted permanently'),
      'the log says the row is gone and who took it (spec 4.13)',
    ).toBe(true)
  })
})
