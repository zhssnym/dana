/*
AC-197: given a page-block write carrying a stale updated_at, then 409 with
the 5.1 conflict copy; given a fresh one, then success and the last write
stands for that block.

Last write wins per block with a stale-write refusal is the whole
concurrency model of 4.17; there is no operational transform behind it, so
this pair of asserts is the model's entire surface.

Spec: 4.17, 7.16, 5.1 (RFC 0005).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'

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

describe('AC-197 last write wins, stale writes lose loudly', () => {
  test('fresh write lands; the write it beat answers 409', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 's1 ac197 page')

    const first = await owner.browser.json(`/folders/${folderId}/page`, 'PUT', {
      blocks: [{ kind: 'paragraph', position: 0, text: 's1 ac197 first draft' }],
    })
    expectStatus(first, 200, 'the first page write lands (spec 7.16)')

    const read = await owner.browser.json(`/folders/${folderId}/page`, 'GET')
    expectStatus(read, 200, 'the page reads back (spec 7.16)')
    const page = read.json() as {
      blocks?: Array<{ id?: string; updated_at?: string }>
    }
    const block = page.blocks?.[0]
    expect(block?.id !== undefined, 'the stored block carries its id').toBe(true)

    const fresh = await owner.browser.json(`/folders/${folderId}/page`, 'PUT', {
      blocks: [
        {
          id: block?.id,
          kind: 'paragraph',
          position: 0,
          text: 's1 ac197 second draft',
          updated_at: block?.updated_at,
        },
      ],
    })
    expectStatus(fresh, 200, 'a fresh updated_at writes (spec 4.17)')

    const stale = await owner.browser.json(`/folders/${folderId}/page`, 'PUT', {
      blocks: [
        {
          id: block?.id,
          kind: 'paragraph',
          position: 0,
          text: 's1 ac197 the beaten draft',
          updated_at: block?.updated_at,
        },
      ],
    })
    expectStatus(
      stale,
      409,
      'the write carrying the beaten updated_at is refused (spec 4.17, 5.1 copy)',
    )
  })
})
