/*
AC-507: given a workflow file whose document names a `file_id`, then the
import is honest about what that id is: an account-specific reference rather
than a portable asset. An importer who can read the row gets an independent
copy in the new folder with the source's kind preserved; an importer who
cannot read it is **refused outright** rather than silently given a folder
whose blocks point at nothing.

Issue #220, proof 20, and R1's "Workflow boundary". #185 owns the portable
workflow asset bundle. #220 must leave the model structurally capable of
portability and must not invent the container, and — the sentence this
criterion is for — **must not silently claim that an exported workflow
contains assets when it does not.**

**The refusal is the truthful answer and the alternative is the dishonest
one**, which is why it is pinned rather than left to taste. Dropping the block
would produce a folder that looks imported and has lost content; importing it
pointing at the source's row would hand the importer a block they cannot
read, drawn as a broken asset for ever, and would leave one account's file
referenced from another's folder. Refusing says the true thing: this file
refers to something this account does not have, and until #185 there is no
mechanism that could give it to them.

**The kind-preservation half is here too**, because the workflow import is the
second of the two call sites that used to run `UPDATE files SET kind='image'`
over every copied asset. An audio track imported as an image is exactly the
corruption #220 exists to prevent, and it would have shown up here and nowhere
else.

Spec: 4.16, 7.16, 9.6, and #220 R1's "Workflow boundary".
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'
import type { PageView } from '../../src/shared/pages.js'
import { MP3_BYTES, ZIP_BYTES, uploadKindOk } from '../support/uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'stranger'], 'ac507')
beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)
afterAll(async () => {
  if (app) {
    await cast.cleanup(app.db)
    await app.close()
  }
})

async function read(owner: Actor, folder: string): Promise<PageView> {
  const response = await owner.browser.json(`/folders/${folder}/page`, 'GET')
  expectStatus(response, 200, 'page read')
  return response.json() as PageView
}

function workflowWith(fileId: string, kind: 'audio' | 'file'): Record<string, unknown> {
  const id = randomUUID()
  return {
    dana: 'workflow',
    version: 2,
    folders: [
      {
        name: `Imported ${kind}`,
        tasks: [],
        document: {
          blocks: [
            {
              op: 'put_block',
              id,
              block_kind: kind,
              text: null,
              rich_content: null,
              file_id: fileId,
              ref_folder_id: null,
              width_pct: null,
              checked: null,
            },
          ],
          outline: [
            { kind: 'block', id, section_block_id: null, list_parent_block_id: null },
          ],
          task_ids: [],
        },
      },
    ],
  }
}

test('AC-507 an importer who can read the asset gets an independent copy of the right kind', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const source = await createFolder(owner, 'ac507 the source folder')
  const audioId = await uploadKindOk(owner, 'audio', source, {
    name: 'ac507.mp3',
    type: 'audio/mpeg',
    bytes: MP3_BYTES,
  })

  const imported = await owner.browser.json(
    '/workflows/import',
    'POST',
    workflowWith(audioId, 'audio'),
  )
  expectStatus(imported, 201, 'a workflow naming a readable asset imports (spec 9.6)')
  const folderId = (imported.json() as { folders: { id: string }[] }).folders[0]!.id

  const page = await read(owner, folderId)
  const block = page.blocks[0]
  expect(block?.kind, 'the imported block is still an audio block').toBe('audio')
  expect(block?.file_id, 'and names a copy rather than the source row').not.toBe(audioId)

  const copied = await rows(
    app.db,
    sql`SELECT kind, folder_id FROM files WHERE id = ${block!.file_id!}::uuid`,
  )
  /* The assertion the old `UPDATE files SET kind='image'` in this path would
     have failed. An audio track imported as an image is the corruption #220
     exists to prevent. */
  expect(String(copied[0]?.kind), "the copy keeps the source's semantic kind").toBe('audio')
  expect(String(copied[0]?.folder_id), 'and lives in the imported folder, its own scope').toBe(
    folderId,
  )

  // The source is untouched by somebody importing a file that refers to it.
  const stillThere = await rows(app.db, sql`SELECT kind FROM files WHERE id = ${audioId}::uuid`)
  expect(String(stillThere[0]?.kind)).toBe('audio')
})

test('AC-507 an importer who cannot read the asset is refused, never quietly given less', async () => {
  const [owner, stranger] = (await cast.of(app)) as [Actor, Actor]
  const source = await createFolder(owner, 'ac507 not yours')
  const fileId = await uploadKindOk(owner, 'file', source, {
    name: 'ac507.q4data',
    type: 'application/octet-stream',
    bytes: ZIP_BYTES,
  })

  const before = await rows(
    app.db,
    sql`SELECT count(*)::int AS n FROM folders
        WHERE owner_id = ${stranger.id}::uuid AND deleted_at IS NULL`,
  )

  /* The whole of "do not silently claim that an exported workflow contains
     assets when it does not": a `file_id` is account-specific until #185
     builds the portable bundle, so a file that refers to one this account
     cannot read is refused rather than imported with the block dropped or
     with the reference left dangling into somebody else's folder. */
  const refused = await stranger.browser.json(
    '/workflows/import',
    'POST',
    workflowWith(fileId, 'file'),
  )
  expectStatus(refused, 422, 'the import is refused rather than silently emptied (#220 R1, #185)')

  const after = await rows(
    app.db,
    sql`SELECT count(*)::int AS n FROM folders
        WHERE owner_id = ${stranger.id}::uuid AND deleted_at IS NULL`,
  )
  expect(
    Number(after[0]?.n),
    'and the refusal leaves no half-imported folder behind',
  ).toBe(Number(before[0]?.n))

  // The stranger gained nothing at all: not the folder, and not the file.
  expectStatus(
    await stranger.browser.request(`/api/v1/files/${fileId}`, { method: 'GET' }),
    404,
    'an import refusal grants no access to the asset it named (spec 10.2)',
  )
})
