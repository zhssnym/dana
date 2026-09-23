/*
AC-950: `GET /folders/:id/dependencies` answers a member every edge whose two
ends are both live Tasks of that Folder and nothing else, and answers a
non-member 404.

**Why this exists.** The read hands out both endpoint ids of every edge it
returns, which `GET /tasks/:id/dependencies` deliberately never does for a far
end the viewer cannot read. The only thing standing between the two is the
query's join of *both* ends to the Folder. A join that slipped to one end
would answer 200 with the id of a Task in a Folder the reader was never in,
and nothing structural would notice. The ac-397 sweep covers the stranger's
404; this covers the scope, which no sweep can see.

The cross-folder edge into a Folder the viewer *can* read is here on purpose:
it stops the assertion passing against a query that filters by access rather
than by Folder, which would put an edge the workflow file must not carry on
the wire. Every edge is asserted stored first, so an absence is the scope and
not a missing fixture.

Spec: 7.25, 7.16, 10.2.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { getFolderDependenciesResponse } from '../../src/shared/task-dependencies.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  createFolder,
  expectStatus,
  seedMembership,
} from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'
import { seedViewTask } from '../support/views-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'reader', 'stranger'], 'ac950')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function relate(dependent: string, blocker: string, by: string): Promise<string> {
  const inserted = await rows(
    app.db,
    sql`INSERT INTO task_dependencies (dependent_task_id, blocking_task_id, created_by)
        VALUES (${dependent}::uuid, ${blocker}::uuid, ${by}::uuid)
        RETURNING id`,
  )
  return String(inserted[0]?.id)
}

describe('AC-950: a Folder dependency read stays inside the Folder', () => {
  test('AC-950: a member reads only the internal edges; a stranger is 404', async () => {
    const [owner, reader, stranger] = await cast.of(app)
    if (owner === undefined || reader === undefined || stranger === undefined) {
      throw new Error('cast must produce three actors')
    }
    const home = await createFolder(owner, 'ac950 home')
    const shared = await createFolder(owner, 'ac950 shared elsewhere')
    const hidden = await createFolder(stranger, 'ac950 hidden')
    // The lowest preset: reading relations is every member's.
    await seedMembership(app.db, home, reader.id, { access: 'can_view' })
    await seedMembership(app.db, shared, reader.id, { access: 'can_view' })

    const seed = (folderId: string, by: string, title: string) =>
      seedViewTask(app.db, { folderId, createdBy: by, title })
    const first = await seed(home, owner.id, 'ac950 first')
    const second = await seed(home, owner.id, 'ac950 second')
    const trashed = await seed(home, owner.id, 'ac950 trashed')
    const readableElsewhere = await seed(shared, owner.id, 'ac950 readable elsewhere')
    const unreadable = await seed(hidden, stranger.id, 'ac950 unreadable')
    await app.db.execute(
      sql`UPDATE tasks SET deleted_at = now() WHERE id = ${trashed}::uuid`,
    )

    const internal = await relate(second, first, owner.id)
    await relate(second, readableElsewhere, owner.id)
    await relate(readableElsewhere, first, owner.id)
    await relate(first, unreadable, stranger.id)
    await relate(unreadable, second, stranger.id)
    await relate(first, trashed, owner.id)

    const stored = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM task_dependencies
          WHERE dependent_task_id IN (${first}::uuid, ${second}::uuid)
             OR blocking_task_id IN (${first}::uuid, ${second}::uuid)`,
    )
    expect(stored[0]?.n, 'all six edges touching the home Folder are stored').toBe(6)

    const read = await reader.browser.json(`/folders/${home}/dependencies`, 'GET')
    expectStatus(read, 200, 'a member reads the Folder\'s relations (7.25)')
    const { dependencies } = getFolderDependenciesResponse.parse(read.json())
    expect(
      dependencies,
      'only the edge with both ends live in this Folder; neither cross-folder edge, readable or not, and not the edge to a trashed Task',
    ).toEqual([
      { id: internal, dependent_task_id: second, blocking_task_id: first },
    ])
    const body = JSON.stringify(read.json())
    expect(body, 'the unreadable Task\'s id never reaches the wire').not.toContain(unreadable)

    const refused = await stranger.browser.json(`/folders/${home}/dependencies`, 'GET')
    expectStatus(refused, 404, 'a non-member is told what a missing Folder is told (10.2)')
    expect(JSON.stringify(refused.json())).not.toContain(first)
  })
})
