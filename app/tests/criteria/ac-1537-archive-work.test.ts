import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus, seedMembership } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'editor', 'stranger'], 'archive')

beforeAll(async () => { app = await startAuthTestApp() }, 60_000)
afterAll(async () => {
  if (app === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function page(parent: string, name: string): Promise<string> {
  const [owner] = await cast.of(app)
  if (!owner) throw new Error('missing owner')
  const response = await owner.browser.json('/folders', 'POST', { name, parent_folder_id: parent })
  expectStatus(response, 201, 'create child page')
  return (response.json() as { id: string }).id
}

describe('AC-1537 archived Work', () => {
  test('archiving a nested page removes its parent link and restore puts it back', async () => {
    const [owner] = await cast.of(app)
    if (!owner) throw new Error('missing owner')
    const root = await createFolder(owner, 'Archive parent', 'doc')
    const child = await page(root, 'Archive nested')
    const home = () => rows(app.db, sql`SELECT id FROM page_blocks
      WHERE folder_id = ${root}::uuid AND ref_folder_id = ${child}::uuid`)
    expect(await home()).toHaveLength(1)

    expectStatus(await owner.browser.json(`/folders/${child}/archive`, 'POST', {}), 204,
      'archive nested page')
    expect(await home()).toHaveLength(0)
    expectStatus(await owner.browser.json(`/archive/folders/${child}/restore`, 'POST', {}), 200,
      'restore nested page')
    expect(await home()).toHaveLength(1)
    expect(await rows(app.db, sql`SELECT parent_folder_id FROM folders WHERE id = ${child}::uuid`))
      .toEqual([{ parent_folder_id: root }])
  })

  test('archives and restores the canonical hierarchy, invisible in active reads', async () => {
    const [owner, editor, stranger] = await cast.of(app)
    if (!owner || !editor || !stranger) throw new Error('missing actors')
    const root = await createFolder(owner, 'Archive hierarchy', 'doc')
    const child = await page(root, 'Archive child')
    const grandchild = await page(child, 'Archive grandchild')
    await seedMembership(app.db, root, editor.id, { access: 'can_edit' })

    expectStatus(await editor.browser.json(`/folders/${root}/archive`, 'POST', {}), 403,
      'Can edit cannot archive Work')
    expectStatus(await stranger.browser.json(`/folders/${root}/archive`, 'POST', {}), 404,
      'a stranger cannot discover Work by archiving it')
    expectStatus(await owner.browser.json(`/folders/${root}/archive`, 'POST', {}), 204,
      'owner archives without a confirmation request')

    const stored = await rows(app.db, sql`SELECT id, parent_folder_id, archived_at,
        archived_with_folder_id, deleted_at FROM folders
      WHERE id IN (${root}::uuid, ${child}::uuid, ${grandchild}::uuid)`)
    expect(stored).toHaveLength(3)
    expect(stored.every((row) => row.archived_at !== null && row.deleted_at === null)).toBe(true)
    expect(stored.find((row) => row.id === child)?.parent_folder_id).toBe(root)
    expect(stored.find((row) => row.id === grandchild)?.parent_folder_id).toBe(child)
    expect(stored.find((row) => row.id === child)?.archived_with_folder_id).toBe(root)
    expect(stored.find((row) => row.id === grandchild)?.archived_with_folder_id).toBe(root)

    const active = await owner.browser.api('/folders?tabs=1')
    expectStatus(active, 200, 'active Work list remains readable')
    expect(JSON.stringify(active.json())).not.toContain(root)
    expect(JSON.stringify(active.json())).not.toContain(child)
    expectStatus(await owner.browser.api(`/folders/${root}`), 404, 'archived Work is not an active page')

    const listed = await editor.browser.api('/archive/folders')
    expectStatus(listed, 200, 'a member can find shared archived Work')
    const listedRows = (listed.json() as { rows: { id: string; shared: boolean; archived_by_name: string | null }[] }).rows
    expect(listedRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: root, shared: true, archived_by_name: expect.any(String) }),
    ]))
    expect(listedRows.some((row) => row.id === grandchild)).toBe(false)
    expectStatus(await stranger.browser.api('/archive/folders'), 200, 'archive list is scoped')
    expect(JSON.stringify((await stranger.browser.api('/archive/folders')).json())).not.toContain(root)

    expectStatus(await editor.browser.json(`/archive/folders/${root}/restore`, 'POST', {}), 403,
      'Can edit cannot restore')
    expectStatus(await owner.browser.json(`/archive/folders/${root}/restore`, 'POST', {}), 200,
      'restore recovers the same Work')
    const restored = await rows(app.db, sql`SELECT id, archived_at FROM folders
      WHERE id IN (${root}::uuid, ${child}::uuid, ${grandchild}::uuid)`)
    expect(restored).toHaveLength(3)
    expect(restored.every((row) => row.archived_at === null)).toBe(true)
  })

  test('AC-1538 permanent deletion from Archive removes the stored hierarchy', async () => {
    const [owner, editor, stranger] = await cast.of(app)
    if (!owner || !editor || !stranger) throw new Error('missing actors')
    const root = await createFolder(owner, 'Archive permanent', 'doc')
    const child = await page(root, 'Archive permanent child')
    await seedMembership(app.db, root, editor.id, { access: 'can_edit' })
    expectStatus(await owner.browser.json(`/folders/${root}/archive`, 'POST', {}), 204, 'archive first')
    expectStatus(await editor.browser.json(`/archive/folders/${root}`, 'DELETE', {}), 403,
      'a non-owner cannot permanently delete shared Work')
    expectStatus(await stranger.browser.json(`/archive/folders/${root}`, 'DELETE', {}), 404,
      'a stranger cannot discover it by deletion')
    expectStatus(await owner.browser.json(`/archive/folders/${root}`, 'DELETE', {}), 204,
      'owner permanently deletes archived Work')
    expect(await rows(app.db, sql`SELECT id FROM folders WHERE id IN (${root}::uuid, ${child}::uuid)`))
      .toHaveLength(0)
  })
})
