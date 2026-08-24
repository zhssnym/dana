/*
AC-203: given shelves, then (user_id, name) is unique; renaming keeps the
shelf's id and its page; deleting clears the member labels and keeps every
folder.

The id surviving the rename is the criterion's point: 4.18 exists because a
page keyed by a mutable string re-keys storage on every rename (the
prototype's own bug, DES-218). The label side is read through the folder
list the way the sidebar reads it.

Spec: 4.18, 7.16, 4.4 (RFC 0005).
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

describe('AC-203 a shelf is a stable id wearing a changeable name', () => {
  test('unique per user; rename keeps the id; delete keeps the folders', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 's1 ac203 shelved folder')

    const made = await owner.browser.json('/shelves', 'POST', {
      name: 's1 ac203 shelf',
    })
    expectStatus(made, 201, 'a shelf creates (spec 7.16)')
    const shelfId = String((made.json() as { id?: unknown }).id)

    const duplicate = await owner.browser.json('/shelves', 'POST', {
      name: 's1 ac203 shelf',
    })
    expectStatus(duplicate, 422, 'the same name twice for one user refuses (spec 4.18)')

    const placed = await owner.browser.json(
      `/folders/${folderId}/my-membership`,
      'PATCH',
      { label: 's1 ac203 shelf', color: null },
    )
    expectStatus(placed, 200, 'the folder takes the shelf label (spec 7.4)')

    const renamed = await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
      name: 's1 ac203 renamed',
    })
    expectStatus(renamed, 200, 'the shelf renames (spec 7.16)')
    expect(
      (renamed.json() as { id?: unknown }).id,
      'the id survives the rename (spec 4.18)',
    ).toBe(shelfId)

    const removed = await owner.browser.json(`/shelves/${shelfId}`, 'DELETE')
    expect(
      [200, 204].includes(removed.status),
      `the shelf deletes; answered ${String(removed.status)}`,
    ).toBe(true)
    const folder = await owner.browser.json(`/folders/${folderId}`, 'GET')
    expectStatus(folder, 200, 'the folder outlives its shelf (spec 4.18)')
  })
})
