/*
AC-1171: `PUT /discussions/:id/read` records one person's read, and only theirs.

A and B are members of a Folder; B has posted in a Discussion, so A's later
post notifies B. Before B opens it, B's list row carries `read_at` null and
B's notification for A's post is unread. After B's PUT:

- a `discussion_reads` row for (Discussion, B) is stored;
- B's list row and B's `GET /discussions/:id` carry a non-null `read_at`;
- A's list row still carries `read_at` null, and no row exists for A;
- B's notification for A's post has `read_at` set in the database.

Asserted on stored rows. Spec: 4.x discussion_reads, 7.28.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['a', 'b'], 'ac1171')
const folders: string[] = []

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  for (const folderId of folders) {
    await app.db.execute(sql`DELETE FROM folders WHERE id = ${folderId}::uuid`)
  }
  await cast.cleanup(app.db)
  await app.close()
})

async function post(actor: Actor, path: string, body: Record<string, unknown>): Promise<string> {
  const posted = await actor.browser.json(path, 'POST', body)
  expectStatus(posted, 201, `POST ${path} creates the post`)
  return String((posted.json() as { id?: unknown }).id)
}

async function listedReadAt(actor: Actor, folderId: string, discussionId: string): Promise<unknown> {
  const listed = await actor.browser.json(`/folders/${folderId}/discussions`, 'GET')
  expectStatus(listed, 200, 'GET /folders/:id/discussions lists')
  const row = (listed.json() as { discussions: { id: string; read_at?: unknown }[] }).discussions.find(
    (line) => line.id === discussionId,
  )
  expect(row, 'the Discussion is listed').toBeDefined()
  return row?.read_at
}

async function notificationReadAt(userId: string, commentId: string): Promise<unknown[]> {
  const found = await rows(
    app.db,
    sql`SELECT n.read_at FROM notifications n JOIN events e ON e.id = n.event_id
         WHERE n.user_id = ${userId}::uuid AND e.subject_kind = 'comment'
           AND e.subject_id = ${commentId}::uuid`,
  )
  return found.map((row) => row.read_at)
}

describe('AC-1171 a Discussion read is per person', () => {
  test("B's PUT stores B's row, clears B's notification, and leaves A unread", async () => {
    const [a, b] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, a.id, b.id)
    const folderId = await createFolder(a, 'ac1171 folder')
    folders.push(folderId)
    await addMemberOk(a, folderId, b.id, 'can_edit')

    const made = await a.browser.json(`/folders/${folderId}/discussions`, 'POST', { title: 'ac1171 venue' })
    expectStatus(made, 201, 'POST /folders/:id/discussions creates the Discussion')
    const discussionId = String((made.json() as { id?: unknown }).id)

    await post(b, `/discussions/${discussionId}/comments`, { body: 'ac1171 where do we meet?' })
    const aPost = await post(a, `/discussions/${discussionId}/comments`, { body: 'ac1171 the hall' })

    expect(await listedReadAt(b, folderId, discussionId), 'B has never opened it').toBeNull()
    expect(await notificationReadAt(b.id, aPost), "B is told about A's post, unread").toEqual([null])

    const marked = await b.browser.json(`/discussions/${discussionId}/read`, 'PUT')
    expectStatus(marked, 204, 'PUT /discussions/:id/read records the read')

    const stored = await rows(
      app.db,
      sql`SELECT user_id, read_at FROM discussion_reads WHERE discussion_id = ${discussionId}::uuid`,
    )
    expect(stored.map((row) => String(row.user_id)), "only B's row is stored").toEqual([b.id])
    expect(stored[0]?.read_at).not.toBeNull()

    expect(typeof (await listedReadAt(b, folderId, discussionId)), "B's list row carries read_at").toBe('string')
    const read = await b.browser.json(`/discussions/${discussionId}`, 'GET')
    expectStatus(read, 200, 'GET /discussions/:id reads')
    expect(typeof (read.json() as { read_at?: unknown }).read_at, "B's read carries read_at").toBe('string')
    expect(await listedReadAt(a, folderId, discussionId), "A's list row is untouched").toBeNull()

    const cleared = await notificationReadAt(b.id, aPost)
    expect(cleared, "B's notification for A's post is marked read").toHaveLength(1)
    expect(cleared[0]).not.toBeNull()
  })
})
