/*
AC-955: moving a Task to another Folder carries the files its document names,
so the new Folder's members can open them and the old Folder's purge cannot
take them.

Data-loss class (issue #221's move seam). A file is scoped to one Folder
(`files.folder_id`), and `files_folder_id_fkey` is ON DELETE CASCADE, whose
cascade then SET NULLs every block naming the file. Before this, a Task moved
out of a Folder left its pictures behind: unreadable to its new Folder's
members, and gone from the document for good once the old Folder was purged.

- A file only the Task names is re-scoped in place: same id, new Folder.
- A file the old Folder still names elsewhere (here its own page) is copied:
  the Task's block names the copy in the new Folder, the page keeps the
  original.

Spec: 4.17, 7.6, 7.15.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { rows } from '../support/helpers.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  createFolder,
  expectStatus,
  seedMembership,
  seedTask,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { uploadImageOk } from '../support/uploads-harness.js'
import { at, compose, put, task } from '../support/workflow-page-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'newcomer'], 'ac955')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function one(query: ReturnType<typeof sql>): Promise<Record<string, unknown> | undefined> {
  return (await rows(app.db, query))[0] as Record<string, unknown> | undefined
}

async function withPicture(owner: Actor, taskId: string, fileId: string): Promise<string> {
  const read = await owner.browser.json(`/tasks/${taskId}/document`, 'GET')
  expectStatus(read, 200, 'the owner reads the Task document (7.6)')
  const blockId = randomUUID()
  expectStatus(
    await owner.browser.json(`/tasks/${taskId}/document`, 'PUT', {
      action: 'document_transaction',
      mutation_id: randomUUID(),
      base_revision: (read.json() as { revision: string }).revision,
      operations: [
        {
          op: 'put_block', id: blockId, block_kind: 'image', text: 'ac955 picture',
          rich_content: null, file_id: fileId, ref_folder_id: null, width_pct: null,
          checked: null,
        },
        {
          op: 'set_outline',
          items: [{ kind: 'block', id: blockId, section_block_id: null, list_parent_block_id: null }],
        },
      ],
    }),
    200,
    'the owner puts a picture in the Task document (7.6)',
  )
  return blockId
}

async function stage() {
  const [owner, newcomer] = (await cast.of(app)) as [Actor, Actor]
  const from = await createFolder(owner, 'ac955 leaving')
  const to = await createFolder(owner, 'ac955 arriving')
  await seedMembership(app.db, to, newcomer.id)
  const taskId = await seedTask(app.db, { folderId: from, createdBy: owner.id, title: 'ac955 task' })
  return { owner, newcomer, from, to, taskId }
}

async function move(owner: Actor, taskId: string, to: string): Promise<void> {
  expectStatus(
    await owner.browser.json(`/tasks/${taskId}`, 'PATCH', { folder_id: to }),
    200,
    'the owner moves the Task (7.6)',
  )
}

async function purge(folderId: string): Promise<void> {
  // The end of a Folder purge: the row goes and its cascades run.
  await app.db.execute(sql`DELETE FROM folders WHERE id = ${folderId}::uuid`)
}

describe('AC-955 a moved Task keeps the files its document names', () => {
  test('a file only the Task names moves with it and survives the old purge', async () => {
    const { owner, newcomer, from, to, taskId } = await stage()
    const picture = await uploadImageOk(owner, from, 'ac955-only.png')
    const blockId = await withPicture(owner, taskId, picture)

    await move(owner, taskId, to)
    expect((await one(sql`SELECT folder_id FROM files WHERE id = ${picture}::uuid`))?.folder_id).toBe(to)
    expect((await newcomer.browser.api(`/files/${picture}`)).status).toBe(200)

    await purge(from)
    expect(await one(sql`SELECT id FROM files WHERE id = ${picture}::uuid`)).toBeDefined()
    const block = await one(
      sql`SELECT file_id, task_id FROM page_blocks WHERE id = ${blockId}::uuid`,
    )
    expect(block?.task_id).toBe(taskId)
    expect(block?.file_id).toBe(picture)
  })

  test('a file the old Folder still names is copied for the Task', async () => {
    const { owner, newcomer, from, to, taskId } = await stage()
    const picture = await uploadImageOk(owner, from, 'ac955-shared.png')
    const blockId = await withPicture(owner, taskId, picture)
    const pageBlock = randomUUID()
    await compose(
      owner,
      from,
      [put(pageBlock, 'image', 'ac955 on the page', { file_id: picture }), { op: 'set_outline', items: [at(pageBlock), task(taskId)] }],
      'the old page shows the same picture (7.16)',
    )

    await move(owner, taskId, to)
    const carried = String(
      (await one(sql`SELECT file_id FROM page_blocks WHERE id = ${blockId}::uuid`))?.file_id,
    )
    expect(carried).not.toBe(picture)
    expect((await one(sql`SELECT folder_id FROM files WHERE id = ${carried}::uuid`))?.folder_id).toBe(to)
    expect((await one(sql`SELECT folder_id FROM files WHERE id = ${picture}::uuid`))?.folder_id).toBe(from)
    expect((await one(sql`SELECT file_id FROM page_blocks WHERE id = ${pageBlock}::uuid`))?.file_id).toBe(picture)
    expect((await newcomer.browser.api(`/files/${carried}`)).status).toBe(200)

    await purge(from)
    expect(await one(sql`SELECT id FROM files WHERE id = ${carried}::uuid`)).toBeDefined()
    expect((await one(sql`SELECT file_id FROM page_blocks WHERE id = ${blockId}::uuid`))?.file_id).toBe(carried)
  })
})
