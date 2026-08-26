/*
AC-199: given a task assigned to a section block, when that section is
deleted, then the task survives with section_block_id null.

The FK is ON DELETE SET NULL (4.5) precisely so an arrangement change can
never destroy work: sections are furniture, tasks are the point. The test
deletes the section through the page write, the way a person does, not
through SQL.

Spec: 4.5, 4.17, 7.16 (RFC 0005).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { createTaskOk } from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'])

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-199 sections are furniture, tasks are the point', () => {
  test('deleting a section frees its tasks instead of taking them', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 's1 ac199 sections')

    const written = await owner.browser.json(`/folders/${folderId}/page`, 'PUT', {
      blocks: [{ kind: 'section', position: 0, text: 'Venue' }],
    })
    expectStatus(written, 200, 'the section writes (spec 7.16)')
    const read = await owner.browser.json(`/folders/${folderId}/page`, 'GET')
    const sectionId = String(
      ((read.json() as { blocks?: Array<{ id?: unknown }> }).blocks ?? [])[0]?.id,
    )

    const task = await createTaskOk(
      owner,
      {
        title: 's1 ac199 the surviving task',
        folder_id: folderId,
        section_block_id: sectionId,
      },
      'a task must take a section assignment (spec 4.5)',
    )

    const cleared = await owner.browser.json(`/folders/${folderId}/page`, 'PUT', {
      blocks: [],
    })
    expectStatus(cleared, 200, 'the section deletes through the page (spec 7.16)')

    const detail = await owner.browser.json(`/tasks/${task.id}`, 'GET')
    expectStatus(detail, 200, 'the task survives its section (spec 4.5)')
    expect(
      (detail.json() as { section_block_id?: unknown }).section_block_id ?? null,
      'the assignment cleared to null rather than dangling (spec 4.5)',
    ).toBeNull()
  })
})
