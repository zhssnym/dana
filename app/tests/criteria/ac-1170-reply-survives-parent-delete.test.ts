/*
AC-1170: deleting a post leaves every reply to it in the thread.

A member replies to the owner's post; the owner deletes the post. The post's
row is gone, and the reply's row is still stored, under the same Discussion,
with `parent_id` NULL and its body as written. Migration 0047 is what makes
this hold (`comments_parent_id_fkey` ON DELETE SET NULL); before it the key
cascaded and the reply went with the post.

Asserted on stored rows. Spec: 4.15.
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
const cast = new Cast(['owner', 'member'], 'ac1170')
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

describe('AC-1170 a reply survives its parent being deleted', () => {
  test('the post goes; the reply stays, parent_id NULL, body intact', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 'ac1170 folder')
    folders.push(folderId)
    await addMemberOk(owner, folderId, member.id, 'can_edit')

    const made = await owner.browser.json(`/folders/${folderId}/discussions`, 'POST', {
      title: 'ac1170 venue',
    })
    expectStatus(made, 201, 'POST /folders/:id/discussions creates the Discussion')
    const discussionId = String((made.json() as { id?: unknown }).id)

    const parent = await post(owner, `/discussions/${discussionId}/comments`, {
      body: 'ac1170 the hall?',
    })
    const reply = await post(member, `/discussions/${discussionId}/comments`, {
      body: 'ac1170 the hall is booked',
      parent_id: parent,
    })

    const deleted = await owner.browser.json(`/comments/${parent}`, 'DELETE')
    expectStatus(deleted, 204, 'DELETE /comments/:id removes the post')

    const stored = await rows(
      app.db,
      sql`SELECT id, parent_id, body, author_id, discussion_id FROM comments
           WHERE id IN (${parent}::uuid, ${reply}::uuid)`,
    )
    expect(stored.map((row) => String(row.id)), 'the post is gone, the reply is not').toEqual([reply])
    expect(stored[0]).toMatchObject({
      parent_id: null,
      body: 'ac1170 the hall is booked',
      author_id: member.id,
      discussion_id: discussionId,
    })
  })
})
