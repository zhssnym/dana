/*
AC-275: given a trashed shared folder holding tasks, a page, a stored file
and a second member, when its owner deletes it permanently, then the folder,
its tasks, its page blocks, its memberships and its files rows are gone, the
file's bytes are absent from the store, neither member's Trash lists it, and
no restore can bring it back.

Item 36's requirement is that the endpoint call the collection the 11.7
purge already does rather than write a delete beside it, so what this
criterion pins is the same end state AC-235 pins for the tick: the rows the
folder's cascades drop and the bytes those rows were the only index to.
The second member is here so the membership cascade is measured on a row
that had one, and so the Trash read is asserted for the person who did not
press the control.

Spec: 7.13 as amended (RFC 0005 change control items 36, 38 and 52), 4.16,
4.17, 8.8, 11.7.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  countRows,
  createFolder,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { createTaskOk } from './tasks-harness.js'
import { upload } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 's28a')

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

describe('AC-275 the owner deletes a trashed folder for good', () => {
  test('every cascade fires, the bytes leave, and nothing restores', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 's28a ac275 doomed')
    await addMemberOk(owner, folderId, member.id)
    const task = await createTaskOk(
      owner,
      { title: 's28a ac275 rides its folder', folder_id: folderId },
      'a task to cascade (spec 7.6)',
    )

    const page = await owner.browser.json(`/folders/${folderId}/page`, 'PUT', {
      blocks: [{ kind: 'section', position: 0, text: 's28a ac275 section' }],
    })
    expectStatus(page, 200, 'a page block to cascade (spec 7.16)')

    const stored = await upload(
      owner,
      '/files',
      { kind: 'file', folder_id: folderId },
      {
        name: 'in-the-folder.txt',
        type: 'text/plain',
        bytes: Buffer.from('ac275 bytes in a folder', 'utf8'),
      },
    )
    expectStatus(stored, 201, 'the file must store first (spec 7.15)')
    const fileId = String((stored.json() as { id?: unknown }).id)
    expect(objects.has(fileId), 'the injected store holds the object').toBe(true)

    const tooEarly = await owner.browser.json(`/trash/folders/${folderId}`, 'DELETE')
    expectStatus(tooEarly, 404, 'a live folder is not in Trash (spec 7.13)')

    const trashed = await owner.browser.json(`/folders/${folderId}`, 'DELETE')
    expectStatus(trashed, 200, 'the soft delete moves it to Trash (spec 7.13)')

    const destroyed = await owner.browser.json(`/trash/folders/${folderId}`, 'DELETE')
    expectStatus(destroyed, 204, 'the owner destroys a trashed folder (spec 7.13)')

    for (const [what, query] of [
      ['the folder row', sql`SELECT count(*)::int AS n FROM folders WHERE id = ${folderId}::uuid`],
      ['its tasks', sql`SELECT count(*)::int AS n FROM tasks WHERE id = ${task.id}::uuid`],
      ['its page blocks', sql`SELECT count(*)::int AS n FROM page_blocks WHERE folder_id = ${folderId}::uuid`],
      ['its memberships', sql`SELECT count(*)::int AS n FROM folder_members WHERE folder_id = ${folderId}::uuid`],
      ['its files rows', sql`SELECT count(*)::int AS n FROM files WHERE folder_id = ${folderId}::uuid`],
      ['its events', sql`SELECT count(*)::int AS n FROM events WHERE folder_id = ${folderId}::uuid`],
    ] as const) {
      expect(await countRows(app.db, query), `${what}: gone by the named cascades (spec 8.8, 4.16, 4.17)`).toBe(0)
    }
    expect(
      objects.has(fileId),
      'the bytes left the store after the commit, the rows having been the only index to them (item 36)',
    ).toBe(false)

    for (const [who, actor] of [['the owner', owner], ['the other member', member]] as const) {
      const trash = await actor.browser.json('/trash', 'GET')
      expectStatus(trash, 200, `${who} reads Trash (spec 7.13)`)
      expect(
        JSON.stringify(trash.json()).includes(folderId),
        `${who} no longer sees the folder in Trash`,
      ).toBe(false)
    }

    const restore = await owner.browser.json(`/folders/${folderId}/restore`, 'POST')
    expectStatus(restore, 404, 'nothing is left to restore (spec 7.13)')
  })
})
