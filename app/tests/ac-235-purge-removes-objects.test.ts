/*
AC-235: given a folder in Trash past 30 days holding stored files, when the
11.7 pass purges it, then the files rows are gone and their objects are
absent from the store.

This is F-2's pin. files_folder_id_fkey is ON DELETE CASCADE, so the purge's
folder delete silently drops the files rows, and those rows are the only
index to the bytes: before the fix nothing removed the objects, the store
grew without bound on a paid disk, and nothing user-visible ever said so.
The store is injected through the 11.10 seam and the same store rides the
pass's deps, because a removal from a store nothing reads is unobservable.
Aging by UPDATE is AC-213's precedent. Ruled in by RFC 0005 change control
item 18.

Spec: 11.7 (the purge duty's object removal), 7.13, 4.16.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { runPass } from './reminders-harness.js'
import { ONE_PIXEL_PNG, upload } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 's14')

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

describe('AC-235 the Trash purge removes the objects its cascades orphan', () => {
  test('after the purge, the rows and the bytes are both gone', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 's14 ac235 doomed')

    const stored = await upload(
      owner,
      '/files',
      { kind: 'image', folder_id: folderId },
      { name: 'photo.png', type: 'image/png', bytes: ONE_PIXEL_PNG },
    )
    expectStatus(stored, 201, 'the file must store before the purge is judged (spec 7.15)')
    const fileId = String((stored.json() as { id?: unknown }).id)
    expect(
      objects.has(fileId),
      'the injected store must hold the object, or nothing here measures anything',
    ).toBe(true)

    const trashed = await owner.browser.json(`/folders/${folderId}`, 'DELETE')
    expectStatus(trashed, 200, 'deletion moves the folder to Trash (spec 7.13)')

    // 31 days old: past the purge line. AC-213's aging precedent.
    await app.db.execute(sql`
      UPDATE folders SET deleted_at = now() - interval '31 days'
      WHERE id = ${folderId}::uuid`)

    await runPass(app)

    const rows = await app.db.execute(sql`
      SELECT count(*)::int AS n FROM files WHERE id = ${fileId}::uuid`)
    expect(
      Number((rows.rows as Array<{ n: unknown }>)[0]?.n ?? -1),
      'the purge must drop the files rows with the folder (11.7)',
    ).toBe(0)
    expect(
      objects.has(fileId),
      'the object must leave the store with its row: the rows were the only index to the bytes (11.7, RFC 0005 change control item 18)',
    ).toBe(false)
  })
})
