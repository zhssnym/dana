/*
Given a task, a block or a comment the person wrote into a sample
page, when they DELETE /sample, then that page's sample tree goes to Trash (a thread on a
project's Discussion tab counts as the project's)
with their writing in it, the response names it in X-Dana-Sample-Trashed,
the register is empty, and the undo's fresh sample has no live duplicate of
it. An untouched sample is destroyed whole, with nothing sent to Trash.

Data loss: removal destroys past Trash, and the undo writes a fresh sample,
not what was removed. Before, a person who tried the product by writing in
one of Maya's pages lost it for good on one press of Remove.

Asserted on stored rows. Spec: 7.20.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'
import { SAMPLE_TRASHED_HEADER } from '../../src/shared/sample.js'

let app: AuthTestApp
const cast = new Cast(['tryer', 'writer', 'looker', 'starter'], 'ac1380')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

type Actor = Awaited<ReturnType<Cast['of']>>[number]

async function sampleFolders(userId: string): Promise<Record<string, unknown>[]> {
  return rows(
    app.db,
    // A sub-page in a project's Pages tab hangs from the project: tabs are not registered.
    sql`SELECT f.id, f.name,
               (SELECT CASE WHEN pp.tab_position IS NOT NULL THEN pp.project_id ELSE pp.id END
                  FROM folders pp WHERE pp.id = f.parent_folder_id) AS parent_folder_id
          FROM sample_objects s JOIN folders f ON f.id = s.id
        WHERE s.user_id = ${userId}::uuid AND s.kind = 'folder'
        ORDER BY f.name`,
  )
}

function trashedNames(response: { headers: Record<string, unknown> }): string[] {
  const header = response.headers[SAMPLE_TRASHED_HEADER]
  return header === undefined ? [] : decodeURIComponent(String(header)).split('\n')
}

async function liveByName(userId: string, name: string): Promise<number> {
  const found = await rows(
    app.db,
    sql`SELECT count(*)::int AS n FROM folders
        WHERE owner_id = ${userId}::uuid AND name = ${name} AND deleted_at IS NULL`,
  )
  return Number(found[0]?.n)
}

async function withSample(actor: Actor | undefined): Promise<Actor> {
  if (actor === undefined) throw new Error('cast must produce the actor')
  expectStatus(await actor.browser.json('/sample', 'POST', {}), 200, 'the sample workspace is made (7.20)')
  return actor
}

describe('removing the sample keeps the person’s own work', () => {
  test('a sample page holding an own task goes to Trash with it, and the undo duplicates nothing', async () => {
    const [first] = await cast.of(app)
    const tryer = await withSample(first)
    const folders = await sampleFolders(tryer.id)
    const target = folders.find((row) => row.parent_folder_id === null)
    if (target === undefined) throw new Error('the sample must write a top-level page')

    const made = await tryer.browser.json('/tasks', 'POST', {
      title: 'My own real task',
      folder_id: String(target.id),
    })
    expectStatus(made, 201, 'the own task is created in a sample page')
    const taskId = (made.json() as { id: string }).id

    const removed = await tryer.browser.json('/sample', 'DELETE')
    expectStatus(removed, 204, 'the sample is removed (7.20)')
    expect(trashedNames(removed)).toEqual([String(target.name)])

    const task = await rows(app.db, sql`SELECT folder_id FROM tasks WHERE id = ${taskId}::uuid`)
    expect(task[0]?.folder_id).toBe(String(target.id))
    const folder = await rows(
      app.db,
      sql`SELECT deleted_at FROM folders WHERE id = ${String(target.id)}::uuid`,
    )
    expect(folder[0]?.deleted_at).not.toBeNull()

    // What is removed as well as what is kept: the untouched pages are gone.
    // Since step 7 a sub-page's Purpose is a child Doc page, so the tree
    // under the target is two deep: everything in it goes to Trash with it.
    const parentOf = new Map(folders.map((row) => [String(row.id), row.parent_folder_id]))
    const underTarget = (id: string): boolean => {
      for (let at: unknown = id; at !== null && at !== undefined; at = parentOf.get(String(at))) {
        if (at === target.id) return true
      }
      return false
    }
    const others = folders
      .filter((row) => !underTarget(String(row.id)))
      .map((row) => String(row.id))
    const survivors = await rows(
      app.db,
      sql`SELECT id FROM folders WHERE id IN (${sql.join(others.map((id) => sql`${id}::uuid`), sql`, `)})`,
    )
    expect(survivors.length).toBe(0)
    const register = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM sample_objects WHERE user_id = ${tryer.id}::uuid`,
    )
    expect(register[0]?.n).toBe(0)

    expectStatus(await tryer.browser.json('/sample', 'POST', {}), 200, 'the undo writes the sample afresh')
    expect(await liveByName(tryer.id, String(target.name))).toBe(1)
  })

  test('a comment and an edited paragraph on sample pages go to Trash, not past it', async () => {
    const [, second] = await cast.of(app)
    const writer = await withSample(second)
    const folders = await sampleFolders(writer.id)
    const child = folders.find((row) => row.parent_folder_id !== null)
    const parent = folders.find((row) => row.id === child?.parent_folder_id)
    const other = folders.find(
      (row) => row.parent_folder_id === null && row.id !== parent?.id,
    )
    if (child === undefined || parent === undefined || other === undefined) {
      throw new Error('the sample must write a sub-page and two top-level pages')
    }

    const posted = await writer.browser.json(`/folders/${String(child.id)}/comments`, 'POST', {
      body: 'MY OWN COMMENT',
    })
    expect(posted.status).toBeLessThan(300)
    // The page document's applier stamps a block it writes with now(), as a
    // person's edit in the Work tab does.
    const edited = await rows(
      app.db,
      sql`UPDATE page_blocks SET text = 'MY OWN NOTE', updated_at = now()
          WHERE id = (SELECT id FROM page_blocks
                       WHERE folder_id = ${String(other.id)}::uuid AND kind = 'paragraph' LIMIT 1)
          RETURNING id`,
    )
    expect(edited.length).toBe(1)

    const removed = await writer.browser.json('/sample', 'DELETE')
    expectStatus(removed, 204, 'the sample is removed (7.20)')
    expect(trashedNames(removed).sort()).toEqual([String(parent.name), String(other.name)].sort())

    const comment = await rows(
      app.db,
      sql`SELECT c.id FROM comments c JOIN folders f ON f.id = c.folder_id
          WHERE c.body = 'MY OWN COMMENT' AND f.id = ${String(child.id)}::uuid
            AND f.deleted_at IS NOT NULL`,
    )
    expect(comment.length).toBe(1)
    const note = await rows(
      app.db,
      sql`SELECT b.id FROM page_blocks b JOIN folders f ON f.id = b.folder_id
          WHERE b.id = ${String(edited[0]?.id)}::uuid AND f.deleted_at IS NOT NULL`,
    )
    expect(note.length).toBe(1)
  })

  test('an untouched sample, every page opened, is destroyed whole with nothing sent to Trash', async () => {
    const [, , third] = await cast.of(app)
    const looker = await withSample(third)
    const folders = await sampleFolders(looker.id)
    for (const row of folders) {
      expect((await looker.browser.api(`/folders/${String(row.id)}/page`)).status).toBe(200)
    }

    const removed = await looker.browser.json('/sample', 'DELETE')
    expectStatus(removed, 204, 'the sample is removed (7.20)')
    expect(trashedNames(removed)).toEqual([])
    const left = await rows(
      app.db,
      sql`SELECT id FROM folders WHERE id IN (${sql.join(
        folders.map((row) => sql`${String(row.id)}::uuid`),
        sql`, `,
      )})`,
    )
    expect(left.length).toBe(0)
    // The unregistered tabs (Purpose, Results, Discussion) go too: nothing of
    // the sample is released into a project of its own. Only the Desk's own
    // Docs tab (spec 7.30) is left.
    const remaining = await rows(
      app.db,
      sql`SELECT name FROM folders WHERE owner_id = ${looker.id}::uuid AND NOT is_default`,
    )
    expect(remaining.map((row) => row.name)).toEqual(['Docs'])
  })

  test('a thread started on a sample Discussion tab sends its project to Trash', async () => {
    const [, , , fourth] = await cast.of(app)
    const starter = await withSample(fourth)
    const tab = await rows(
      app.db,
      sql`SELECT d.id, r.name AS project FROM sample_objects s
          JOIN folders r ON r.id = s.id AND r.parent_folder_id IS NULL
          JOIN folders d ON d.project_id = r.id AND d.kind = 'discussion' AND d.id <> r.id
          WHERE s.user_id = ${starter.id}::uuid AND s.kind = 'folder'
          ORDER BY r.name LIMIT 1`,
    )
    if (tab[0] === undefined) throw new Error('the sample must write a Discussion tab')
    const started = await starter.browser.json(`/folders/${String(tab[0].id)}/discussions`, 'POST', {
      title: 'MY OWN THREAD',
    })
    expect(started.status).toBe(201)

    const removed = await starter.browser.json('/sample', 'DELETE')
    expectStatus(removed, 204, 'the sample is removed (7.20)')
    expect(trashedNames(removed)).toEqual([String(tab[0].project)])
    const thread = await rows(
      app.db,
      sql`SELECT f.deleted_at FROM discussions d JOIN folders f ON f.id = d.folder_id
          WHERE d.title = 'MY OWN THREAD' AND d.created_by = ${starter.id}::uuid`,
    )
    expect(thread.length).toBe(1)
    expect(thread[0]?.deleted_at).not.toBeNull()
  })
})
