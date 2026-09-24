/*
AC-1020: a duplicate lands beside its original. A sub-page's copy is stored
under the same parent, directly after the original among its siblings; a
top-level page's copy goes into the duplicator's `sidebar_order` directly
after the original, in the original's collection.

Spec: 7.16, 9.1.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'dup1020')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function owner(): Promise<Actor> {
  const [actor] = await cast.of(app)
  if (!actor) throw new Error('cast must produce an actor')
  return actor
}

async function subPage(actor: Actor, parentId: string, name: string): Promise<string> {
  const made = await actor.browser.json('/folders', 'POST', { name, parent_folder_id: parentId })
  expectStatus(made, 201, `create sub-page ${name}`)
  return (made.json() as { id: string }).id
}

async function duplicate(actor: Actor, id: string): Promise<string> {
  const made = await actor.browser.json(`/folders/${id}/duplicate?tz=UTC`, 'POST', {})
  expectStatus(made, 201, 'duplicate')
  return (made.json() as { id: string }).id
}

describe('AC-1020: a duplicate lands right after its original', () => {
  test('AC-1020 a sub-page copy keeps the parent and sits after the original', async () => {
    const actor = await owner()
    const parent = await createFolder(actor, 'dup1020 parent')
    const first = await subPage(actor, parent, 'dup1020 first')
    const second = await subPage(actor, parent, 'dup1020 second')

    const copy = await duplicate(actor, first)

    const children = await rows(
      app.db,
      sql`SELECT id FROM folders WHERE parent_folder_id = ${parent}::uuid
           ORDER BY child_position, id`,
    )
    expect(children.map((row) => String(row.id))).toEqual([first, copy, second])
    const homes = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM page_blocks
           WHERE folder_id = ${parent}::uuid AND kind = 'page' AND ref_folder_id = ${copy}::uuid`,
    )
    expect(Number(homes[0]?.n), 'the copy has one home block in the parent').toBe(1)
  })

  test('AC-1020 a top-level copy goes after the original in the sidebar order and collection', async () => {
    const actor = await owner()
    const before = await createFolder(actor, 'dup1020 before')
    const original = await createFolder(actor, 'dup1020 original')
    const after = await createFolder(actor, 'dup1020 after')
    await app.db.execute(
      sql`UPDATE folder_members SET shelf_name = 'dup1020 shelf'
           WHERE folder_id = ${original}::uuid AND user_id = ${actor.id}::uuid`,
    )
    expectStatus(
      await actor.browser.json('/settings', 'PATCH', { sidebar_order: [before, original, after] }),
      200,
      'store an arrangement',
    )

    const copy = await duplicate(actor, original)

    const stored = await rows(
      app.db,
      sql`SELECT f.parent_folder_id, m.shelf_name FROM folders f
            JOIN folder_members m ON m.folder_id = f.id AND m.user_id = ${actor.id}::uuid
           WHERE f.id = ${copy}::uuid`,
    )
    expect(stored[0]?.parent_folder_id).toBeNull()
    expect(stored[0]?.shelf_name).toBe('dup1020 shelf')
    const settings = await rows(
      app.db,
      sql`SELECT sidebar_order FROM user_settings WHERE user_id = ${actor.id}::uuid`,
    )
    expect(settings[0]?.sidebar_order).toEqual([before, original, copy, after])
  })
})
