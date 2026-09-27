/*
Wave 2, pages in pages (migration 0039): the page tree's security and
data-loss cases.

AC-1016: the tree's body ids are gated. `POST /folders { parent_folder_id }`
and `PATCH /folders/:id/location { parent_folder_id, after_id }` carry page
ids the ac-397 sweep cannot see, so each answers 404 for a page the actor is
not a member of, 403 below Can edit on it, and 422 for a cycle, a tree deeper
than 20, or the default folder leaving the top level; and the values arrive
(the stored row, the sibling order). Since step 8 (migration 0062) a
sub-page's people are its project's: it stores no membership rows of its own,
and every member of the project reads it.

AC-1017 is retired with step 8: a person sees every page of a project or
none, so no member of a sub-page lacks its parent.

AC-1018: trashing a page takes its sub-pages with it (presets are the
project's, so an actor who may trash the page may trash them), lists only the
initiator in Trash, brings the set back on restore, and takes it along on a
permanent delete.

Spec: wave 2 plan (pages in pages), 7.4, 7.13, 10.2.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  createFolder,
  defaultFolderOf,
  expectStatus,
  seedMembership,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'viewer', 'stranger', 'childonly', 'editor'], 'tree')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface Actors {
  owner: Actor
  viewer: Actor
  stranger: Actor
  childonly: Actor
  editor: Actor
}

async function actors(): Promise<Actors> {
  const [owner, viewer, stranger, childonly, editor] = await cast.of(app)
  if (!owner || !viewer || !stranger || !childonly || !editor) {
    throw new Error('cast must produce five actors')
  }
  return { owner, viewer, stranger, childonly, editor }
}

async function subPage(actor: Actor, parentId: string, name: string): Promise<string> {
  const response = await actor.browser.json('/folders', 'POST', {
    name,
    parent_folder_id: parentId,
  })
  expectStatus(response, 201, `a sub-page ${name} is created under its parent`)
  return (response.json() as { id: string }).id
}

async function folderRow(id: string): Promise<Record<string, unknown> | undefined> {
  return (
    await rows(
      app.db,
      sql`SELECT parent_folder_id, child_position, deleted_at, trashed_with_folder_id
            FROM folders WHERE id = ${id}::uuid`,
    )
  )[0]
}

function move(actor: Actor, id: string, body: Record<string, unknown>) {
  return actor.browser.json(`/folders/${id}/location`, 'PATCH', body)
}

describe('AC-1016: the page tree gates its body ids and stores what arrives', () => {
  test('AC-1016 a stranger naming somebody else\'s page as parent or neighbour gets 404', async () => {
    const { owner, stranger } = await actors()
    const parent = await createFolder(owner, 'tree ac1014 private parent', 'doc')
    const child = await subPage(owner, parent, 'tree ac1014 private child')
    const mine = await createFolder(stranger, 'tree ac1014 stranger page')

    expectStatus(
      await stranger.browser.json('/folders', 'POST', { name: 'x', parent_folder_id: parent }),
      404,
      'POST /folders under a page the actor is not a member of is 404, never 403',
    )
    expectStatus(
      await move(stranger, mine, { parent_folder_id: parent }),
      404,
      'moving under a page the actor is not a member of is 404',
    )
    const ownRoot = await createFolder(stranger, 'tree ac1014 stranger root')
    expectStatus(
      await move(stranger, mine, { parent_folder_id: ownRoot, after_id: child }),
      404,
      'after_id naming a page the actor is not a member of is 404',
    )
    expect((await folderRow(mine))?.parent_folder_id).toBeNull()
  })

  test('AC-1016 a sub-page stores its parent, has its project people, and Can view may not add one', async () => {
    const { owner, viewer, stranger } = await actors()
    const parent = await createFolder(owner, 'tree ac1014 shared parent', 'doc')
    await seedMembership(app.db, parent, viewer.id, { access: 'can_view' })

    const response = await owner.browser.json('/folders', 'POST', {
      name: 'tree ac1014 copied child',
      parent_folder_id: parent,
    })
    expectStatus(response, 201, 'a sub-page is created')
    const body = response.json() as { id: string; parent_folder_id: string | null; member_count: number }
    expect(body.parent_folder_id).toBe(parent)
    expect((await folderRow(body.id))?.parent_folder_id).toBe(parent)
    expect(
      await rows(app.db, sql`SELECT user_id FROM folder_members WHERE folder_id = ${body.id}::uuid`),
      'a sub-page stores no people of its own (step 8)',
    ).toEqual([])
    expect(await rows(app.db, sql`SELECT project_id, owner_id FROM folders WHERE id = ${body.id}::uuid`)).toEqual([
      { project_id: parent, owner_id: owner.id },
    ])
    expectStatus(await viewer.browser.json(`/folders/${body.id}`, 'GET'), 200, "the project's viewer reads it")
    expectStatus(await stranger.browser.json(`/folders/${body.id}`, 'GET'), 404, 'a stranger does not')

    expectStatus(
      await viewer.browser.json('/folders', 'POST', { name: 'nope', parent_folder_id: parent }),
      403,
      'Can view on the parent may not add a sub-page to it',
    )
  })

  test('AC-1016 a move refuses a cycle, a tree deeper than 20 and the default folder; after_id orders siblings', async () => {
    const { owner } = await actors()
    const top = await createFolder(owner, 'tree ac1014 top', 'doc')
    const mid = await subPage(owner, top, 'tree ac1014 mid')
    const low = await subPage(owner, mid, 'tree ac1014 low')

    expectStatus(await move(owner, top, { parent_folder_id: low }), 422, 'under its own descendant is a cycle')
    expectStatus(await move(owner, top, { parent_folder_id: top }), 422, 'under itself is a cycle')
    expect((await folderRow(top))?.parent_folder_id).toBeNull()

    const desk = await defaultFolderOf(app.db, owner.id)
    expectStatus(await move(owner, desk, { parent_folder_id: top }), 422, 'the default folder stays a root')

    // Depth: a chain of 20 levels takes no 21st, by creation or by move.
    let deepest = await createFolder(owner, 'tree ac1014 d1', 'doc')
    for (let level = 2; level <= 20; level += 1) {
      deepest = await subPage(owner, deepest, `tree ac1014 d${String(level)}`)
    }
    expectStatus(
      await owner.browser.json('/folders', 'POST', { name: 'd21', parent_folder_id: deepest }),
      422,
      'a 21st level is refused on creation',
    )
    const loose = await createFolder(owner, 'tree ac1014 loose')
    expectStatus(await move(owner, loose, { parent_folder_id: deepest }), 422, 'a 21st level is refused on a move')

    // Order: `after_id: null` lands first, a named sibling lands after it.
    const second = await subPage(owner, top, 'tree ac1014 second')
    expectStatus(await move(owner, loose, { parent_folder_id: top, after_id: null }), 200, 'move first')
    const moved = (await folderRow(loose)) ?? {}
    expect(moved.parent_folder_id).toBe(top)
    const midKey = String((await folderRow(mid))?.child_position)
    expect(String(moved.child_position) < midKey).toBe(true)
    expectStatus(await move(owner, loose, { parent_folder_id: top, after_id: mid }), 200, 'move after mid')
    const key = String((await folderRow(loose))?.child_position)
    expect(key > midKey && key < String((await folderRow(second))?.child_position)).toBe(true)

    expectStatus(await move(owner, loose, { parent_folder_id: null }), 200, 'back to the top level')
    expect(await folderRow(loose)).toMatchObject({ parent_folder_id: null, child_position: null })
  })
})

describe('AC-1018: a page goes to Trash with its sub-pages', () => {
  test('AC-1018 trash takes the set, restores together and purges together', async () => {
    const { owner, editor } = await actors()
    const parent = await createFolder(owner, 'tree ac1016 parent', 'doc')
    const child = await subPage(owner, parent, 'tree ac1016 child')
    const grandchild = await subPage(owner, child, 'tree ac1016 grandchild')
    await seedMembership(app.db, parent, editor.id, { access: 'can_edit' })

    expectStatus(await owner.browser.json(`/folders/${parent}`, 'DELETE'), 200, 'trash the parent')
    expect(await folderRow(child)).toMatchObject({ trashed_with_folder_id: parent })
    expect(await folderRow(grandchild)).toMatchObject({ trashed_with_folder_id: parent })
    expect((await folderRow(child))?.deleted_at).not.toBeNull()

    const trashIds = ((await owner.browser.json('/trash', 'GET')).json() as { folders: Array<{ id: string }> }).folders.map((f) => f.id)
    expect(trashIds).toContain(parent)
    expect(trashIds).not.toContain(child)
    expect(trashIds).not.toContain(grandchild)
    const theirs = ((await editor.browser.json('/trash', 'GET')).json() as { folders: Array<{ id: string }> }).folders.map((f) => f.id)
    expect(theirs, "the project's other member sees the one entry too").toContain(parent)
    expect(theirs).not.toContain(child)

    expectStatus(await owner.browser.json(`/folders/${parent}/restore`, 'POST'), 200, 'restore the parent')
    for (const id of [parent, child, grandchild]) {
      expect(await folderRow(id)).toMatchObject({ deleted_at: null, trashed_with_folder_id: null })
    }
    expect((await folderRow(child))?.parent_folder_id).toBe(parent)

    expectStatus(await owner.browser.json(`/folders/${parent}`, 'DELETE'), 200, 'trash the parent again')
    expectStatus(await owner.browser.json(`/trash/folders/${parent}`, 'DELETE'), 204, 'destroy the parent')
    expect(await folderRow(parent)).toBeUndefined()
    expect(await folderRow(child), 'the trashed-with set is destroyed with it').toBeUndefined()
    expect(await folderRow(grandchild)).toBeUndefined()
  })
})
