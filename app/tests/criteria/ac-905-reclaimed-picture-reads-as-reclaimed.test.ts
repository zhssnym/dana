/*
AC-905: when the server deletes a file a page's media block names, the page
read reports that block as reclaimed (`file_reclaimed_at`), not as a freshly
inserted block nobody has filled — and the mark survives the deployed client
re-saving the block, and clears once the block is given a file again.

Data-loss class (issue #267). `page_blocks_file_id_fkey` is ON DELETE SET NULL,
so the block keeps its row and loses its reference; before migration 0033 the
stored row of a picture whose file was taken was byte-identical to an empty
placeholder, and clicking it offered to put a *different* picture where the
old one was, with nothing saying so.

Spec: 4.17, 7.15, 7.16. Issue #267.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { rows } from '../support/helpers.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus, seedTask } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { uploadImageOk } from '../support/uploads-harness.js'
import { at, compose, put, readPage } from '../support/workflow-page-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac905')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function stored(id: string): Promise<Record<string, unknown>> {
  const found = await rows(
    app.db,
    sql`SELECT file_id, file_reclaimed_at FROM page_blocks WHERE id = ${id}::uuid`,
  )
  expect(found, `block ${id} must still exist`).toHaveLength(1)
  return found[0] as Record<string, unknown>
}

describe('AC-905 a reclaimed picture reads as reclaimed, not as empty-new', () => {
  test('delete the file, re-save the caption, then fill it again', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac905 the album')
    const picture = await uploadImageOk(owner, folderId, 'ac905-beach.png')
    const worn = randomUUID()
    const blank = randomUUID()

    await compose(
      owner,
      folderId,
      [
        put(worn, 'image', 'ac905 the beach', { file_id: picture }),
        put(blank, 'image', 'ac905 not chosen yet'),
        { op: 'set_outline', items: [at(worn), at(blank)] },
      ],
      'the fixture page must compose (7.16)',
    )

    expectStatus(
      await owner.browser.json(`/files/${picture}`, 'DELETE'),
      204,
      'the owner deletes the picture (7.15)',
    )

    const afterDelete = await readPage(owner, folderId)
    const wornRead = afterDelete.blocks.find((b) => b.id === worn)
    const blankRead = afterDelete.blocks.find((b) => b.id === blank)
    expect(wornRead?.file_id).toBeNull()
    expect(typeof wornRead?.file_reclaimed_at).toBe('string')
    expect(blankRead?.file_id).toBeNull()
    expect(blankRead?.file_reclaimed_at).toBeNull()
    const wornRow = await stored(worn)
    expect(wornRow.file_id).toBeNull()
    expect(wornRow.file_reclaimed_at).not.toBeNull()
    expect((await stored(blank)).file_reclaimed_at).toBeNull()

    // The deployed client re-sends the block with `file_id: null` whenever
    // its caption changes; that must not erase the only record.
    await compose(
      owner,
      folderId,
      [
        put(worn, 'image', 'ac905 the beach, 2019'),
        { op: 'set_outline', items: [at(worn), at(blank)] },
      ],
      'a caption edit on the reclaimed block must save (7.16)',
    )
    expect((await stored(worn)).file_reclaimed_at).not.toBeNull()
    expect(
      (await readPage(owner, folderId)).blocks.find((b) => b.id === worn)
        ?.file_reclaimed_at,
    ).toEqual(wornRead?.file_reclaimed_at)

    // Given a picture again, nothing is missing any more.
    const replacement = await uploadImageOk(owner, folderId, 'ac905-dunes.png')
    await compose(
      owner,
      folderId,
      [
        put(worn, 'image', 'ac905 the dunes', { file_id: replacement }),
        { op: 'set_outline', items: [at(worn), at(blank)] },
      ],
      'filling the reclaimed block must save (7.16)',
    )
    const refilled = await stored(worn)
    expect(refilled.file_id).toBe(replacement)
    expect(refilled.file_reclaimed_at).toBeNull()
    expect(
      (await readPage(owner, folderId)).blocks.find((b) => b.id === worn)
        ?.file_reclaimed_at,
    ).toBeNull()
  })

  /* The Task document (issue #221) is a fourth block home built beside this
     one; its read and its writer follow the same rule. */
  test('a Task document block reads as reclaimed and keeps the mark on re-save', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac905 the task album')
    const taskId = await seedTask(app.db, { folderId, createdBy: owner.id })
    const picture = await uploadImageOk(owner, folderId, 'ac905-task.png')
    const worn = randomUUID()
    const image = (text: string, fileId: string | null) => ({
      op: 'put_block', id: worn, block_kind: 'image', text, rich_content: null,
      file_id: fileId, ref_folder_id: null, width_pct: null, checked: null,
    })
    const outline = {
      op: 'set_outline',
      items: [{ kind: 'block', id: worn, section_block_id: null, list_parent_block_id: null }],
    }
    const read = async () => {
      const response = await owner.browser.api(`/tasks/${taskId}/document`)
      expect(response.status).toBe(200)
      return (await response.json()) as {
        revision: string
        blocks: { id: string; file_id: string | null; file_reclaimed_at?: string | null }[]
      }
    }
    const write = async (operations: unknown[], because: string) =>
      expectStatus(
        await owner.browser.json(`/tasks/${taskId}/document`, 'PUT', {
          action: 'document_transaction',
          mutation_id: randomUUID(),
          base_revision: (await read()).revision,
          operations,
        }),
        200,
        because,
      )

    await write([image('ac905 task picture', picture), outline], 'the Task document composes (7.6)')
    expect((await read()).blocks.find((b) => b.id === worn)?.file_reclaimed_at).toBeNull()

    expectStatus(
      await owner.browser.json(`/files/${picture}`, 'DELETE'),
      204,
      'the owner deletes the picture (7.15)',
    )
    const afterDelete = (await read()).blocks.find((b) => b.id === worn)
    expect(afterDelete?.file_id).toBeNull()
    expect(typeof afterDelete?.file_reclaimed_at).toBe('string')
    expect((await stored(worn)).file_reclaimed_at).not.toBeNull()

    await write([image('ac905 task picture, recaptioned', null), outline], 'a caption edit saves')
    expect((await stored(worn)).file_reclaimed_at).not.toBeNull()
    expect((await read()).blocks.find((b) => b.id === worn)?.file_reclaimed_at).toEqual(
      afterDelete?.file_reclaimed_at,
    )

    const replacement = await uploadImageOk(owner, folderId, 'ac905-task-2.png')
    await write([image('ac905 task picture, again', replacement), outline], 'refilling saves')
    const refilled = await stored(worn)
    expect(refilled.file_id).toBe(replacement)
    expect(refilled.file_reclaimed_at).toBeNull()
  })
})
