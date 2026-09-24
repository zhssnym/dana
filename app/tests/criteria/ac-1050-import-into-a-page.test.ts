/*
AC-1050: "Import" from a page's menu brings a Dana file in as sub-pages of that
page, in one transaction. `POST /folders/:id/import` takes the body
`POST /workflows/import` takes; each folder of the file becomes a page whose
stored parent is `:id`, with a `page` home block on the parent's Main document
and the parent's members copied with their presets, as a sub-page made by
hand is. A page the importer is not a member of is 404 and a Can-view one is
403, and either way nothing is created.

Spec: wave 2 plan (pages in pages), 7.16, 10.2.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  createFolder,
  expectStatus,
  seedMembership,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'viewer', 'stranger'], 'import1050')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function actors(): Promise<{ owner: Actor; viewer: Actor; stranger: Actor }> {
  const [owner, viewer, stranger] = await cast.of(app)
  if (!owner || !viewer || !stranger) throw new Error('cast must produce three actors')
  return { owner, viewer, stranger }
}

function file(prefix: string): unknown {
  return {
    dana: 'workflow',
    version: 1,
    folders: [
      { name: `${prefix} first`, tasks: [{ title: `${prefix} task` }] },
      { name: `${prefix} second` },
    ],
  }
}

function importInto(actor: Actor, parentId: string, body: unknown) {
  return actor.browser.json(`/folders/${parentId}/import?tz=UTC`, 'POST', body)
}

async function ownedFolderCount(userId: string): Promise<number> {
  const found = await rows(
    app.db,
    sql`SELECT count(*)::int AS n FROM folders WHERE owner_id = ${userId}::uuid`,
  )
  return Number(found[0]?.n)
}

async function homeBlocksIn(parentId: string): Promise<string[]> {
  const found = await rows(
    app.db,
    sql`SELECT ref_folder_id FROM page_blocks
         WHERE folder_id = ${parentId}::uuid AND kind = 'page'
         ORDER BY page_position`,
  )
  return found.map((row) => String(row.ref_folder_id))
}

describe('AC-1050: importing a file into a page makes its sub-pages', () => {
  test('AC-1050 the imported folders are stored under the page, placed on it, and share its members', async () => {
    const { owner, viewer } = await actors()
    const parent = await createFolder(owner, 'import1050 parent')
    await seedMembership(app.db, parent, viewer.id, { access: 'can_view' })

    const response = await importInto(owner, parent, file('import1050 ok'))
    expectStatus(response, 201, 'the file imports into the page')
    const made = (response.json() as { folders: { id: string }[] }).folders.map((f) => f.id)
    expect(made).toHaveLength(2)

    const stored = await rows(
      app.db,
      sql`SELECT id, parent_folder_id, child_position FROM folders
           WHERE id IN (${sql.join(made.map((id) => sql`${id}::uuid`), sql`, `)})
           ORDER BY child_position`,
    )
    expect(stored.map((row) => String(row.id)), 'children in file order').toEqual(made)
    expect(stored.map((row) => String(row.parent_folder_id))).toEqual([parent, parent])

    expect(await homeBlocksIn(parent), 'one home block per new page, in file order').toEqual(made)

    for (const id of made) {
      const members = await rows(
        app.db,
        sql`SELECT user_id, access FROM folder_members WHERE folder_id = ${id}::uuid`,
      )
      expect(members.map((m) => [String(m.user_id), String(m.access)]).sort()).toEqual(
        [
          [owner.id, 'full_control'],
          [viewer.id, 'can_view'],
        ].sort(),
      )
    }
  })

  test('AC-1050 a stranger naming somebody else\'s page gets 404 and nothing is created', async () => {
    const { owner, stranger } = await actors()
    const parent = await createFolder(owner, 'import1050 private parent')
    const before = await ownedFolderCount(stranger.id)

    expectStatus(
      await importInto(stranger, parent, file('import1050 stranger')),
      404,
      'a page the importer is not a member of is 404, never 403',
    )
    expect(await ownedFolderCount(stranger.id)).toBe(before)
    expect(await homeBlocksIn(parent)).toEqual([])
  })

  test('AC-1050 a Can-view member gets 403 and nothing is created', async () => {
    const { owner, viewer } = await actors()
    const parent = await createFolder(owner, 'import1050 viewed parent')
    await seedMembership(app.db, parent, viewer.id, { access: 'can_view' })
    const before = await ownedFolderCount(viewer.id)

    expectStatus(
      await importInto(viewer, parent, file('import1050 viewer')),
      403,
      'below edit rights on the page is 403',
    )
    expect(await ownedFolderCount(viewer.id)).toBe(before)
    expect(await homeBlocksIn(parent)).toEqual([])
  })
})
