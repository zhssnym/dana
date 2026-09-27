/*
AC-1526: `POST /folders` with a Work tab as `parent_folder_id` puts the new
page, and its home block, under the project's `Pages` Doc tab, the shape
migration 0061 gives every root that held pages. The tab is added right
after that Work tab when missing, with the root's people, and reused after.
Work keeps no page block. Asserted on the stored rows (spec 7.4).
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac1526')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-1526 a page added inside Work', () => {
  test('AC-1526: lands in the Pages tab, made once, right after Work', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const made = await owner.browser.json('/folders', 'POST', { name: 'ac1526 trip', kind: null })
    const project = (made.json() as { id: string }).id
    expectStatus(await owner.browser.json(`/folders/${project}/tabs`, 'POST', { kind: 'usual' }), 201, 'the usual project')

    const ids: string[] = []
    for (const name of ['ac1526 one', 'ac1526 two']) {
      const sub = await owner.browser.json('/folders', 'POST', { name, parent_folder_id: project })
      expectStatus(sub, 201, `${name} inside Work`)
      ids.push((sub.json() as { id: string }).id)
    }

    const tabs = await rows(app.db, sql`
      SELECT id, name, kind FROM folders
       WHERE project_id = ${project}::uuid AND tab_position IS NOT NULL
       ORDER BY tab_position, id`)
    expect(tabs.map((tab) => tab.name)).toEqual(['Purpose', 'ac1526 trip', 'Pages', 'Results', 'Discussion'])
    const pages = String(tabs[2]?.id)
    expect(tabs[2]?.kind).toBe('doc')

    expect(
      await rows(app.db, sql`SELECT id, parent_folder_id, project_id FROM folders
        WHERE id IN (${ids[0]}::uuid, ${ids[1]}::uuid) ORDER BY child_position`),
    ).toEqual([
      { id: ids[0], parent_folder_id: pages, project_id: project },
      { id: ids[1], parent_folder_id: pages, project_id: project },
    ])
    expect(
      await rows(app.db, sql`SELECT ref_folder_id FROM page_blocks WHERE folder_id = ${pages}::uuid AND kind = 'page' ORDER BY position`),
    ).toEqual([{ ref_folder_id: ids[0] }, { ref_folder_id: ids[1] }])
    expect(
      await rows(app.db, sql`SELECT count(*)::int AS n FROM page_blocks WHERE folder_id = ${project}::uuid AND kind = 'page'`),
    ).toEqual([{ n: 0 }])
    // Step 8: the Pages tab's people are the project's; it stores none.
    expect(
      await rows(app.db, sql`SELECT user_id, access FROM folder_members WHERE folder_id = ${pages}::uuid ORDER BY user_id`),
    ).toEqual([])
  }, 60_000)
})
