/*
AC-910: Discussion acts follow Folder Access, and creator stewardship ends the
moment the creator's Access drops below Can comment.

**Why this criterion exists.** Every `/discussions/:id` route is a hand-written
`accessOf` gate plus a `mayPerform` call carrying `creatorId`, read under the
row lock in the transaction that writes (issue #320). A gate that trusted the
creator binding alone would keep a downgraded creator's powers; one that
skipped the lock would decide on a row the write never saw. Each refusal below
asserts the stored row, not just the status.

AC-911 is the removal boundary: a creator may trash their own Discussion only
while nobody else has contributed and it has no Outcome; Can edit trashes any;
purge is Full control's.

Spec: 7.28, 7.13, 10.2.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  addMemberOk,
  Cast,
  connect,
  countRows,
  createFolder,
  expectStatus,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(
  ['owner', 'creator', 'viewer', 'editor', 'stranger'],
  'ac910',
)

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface StoredDiscussion {
  title: string
  state: string
  current_outcome_id: string | null
  trashed_at: unknown
}

async function stored(id: string): Promise<StoredDiscussion | undefined> {
  const result = (await app.db.execute(
    sql`SELECT title, state, current_outcome_id, trashed_at
          FROM discussions WHERE id = ${id}::uuid`,
  )) as unknown as { rows: StoredDiscussion[] }
  return result.rows[0]
}

const outcomesOf = (id: string) =>
  countRows(
    app.db,
    sql`SELECT count(*)::int AS n FROM discussion_outcomes
         WHERE discussion_id = ${id}::uuid`,
  )

async function setAccess(folderId: string, userId: string, access: string) {
  await app.db.execute(
    sql`UPDATE folder_members SET access = ${access}
         WHERE folder_id = ${folderId}::uuid AND user_id = ${userId}::uuid`,
  )
}

async function start(actor: Actor, folderId: string, title: string) {
  const made = await actor.browser.json(`/folders/${folderId}/discussions`, 'POST', {
    title,
  })
  expectStatus(made, 201, `${title} is created (7.28)`)
  return String((made.json() as { id: string }).id)
}

async function seedComment(folderId: string, discussionId: string, authorId: string) {
  await app.db.execute(
    sql`INSERT INTO comments (folder_id, discussion_id, author_id, body)
        VALUES (${folderId}::uuid, ${discussionId}::uuid, ${authorId}::uuid,
                'ac910 a contribution')`,
  )
}

describe('AC-910 Discussion acts follow Folder Access', () => {
  test('AC-910: strangers and Can view are refused, and a lowered creator loses every creator power', async () => {
    const [owner, creator, viewer, editor, stranger] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await createFolder(owner, 'ac910 consultation')
    for (const [member, access] of [
      [creator, 'can_comment'],
      [viewer, 'can_view'],
      [editor, 'can_edit'],
    ] as const) {
      await connect(app.db, owner.id, member.id)
      await addMemberOk(owner, folderId, member.id, access)
    }

    const id = await start(creator, folderId, 'ac910 the question')
    const discussionPath = `/discussions/${id}`

    /* A stranger: 404 on every door, and nothing written or disclosed. */
    const peek = await stranger.browser.json(discussionPath, 'GET')
    expectStatus(peek, 404, 'a stranger reads nothing (10.2)')
    expect(peek.body).not.toContain('ac910 the question')
    expectStatus(
      await stranger.browser.json(discussionPath, 'PATCH', { title: 'stranger' }),
      404,
      'a stranger cannot edit (10.2)',
    )
    expectStatus(
      await stranger.browser.json(`${discussionPath}/resolve`, 'POST', {
        statement: 'stranger',
      }),
      404,
      'a stranger cannot resolve (10.2)',
    )
    expectStatus(
      await stranger.browser.json(`/folders/${folderId}/discussions`, 'POST', {
        title: 'stranger',
      }),
      404,
      'a stranger cannot start a Discussion (10.2)',
    )

    /* Can view reads and may not write. */
    expectStatus(await viewer.browser.json(discussionPath, 'GET'), 200, 'Can view reads (7.28)')
    expectStatus(
      await viewer.browser.json(`/folders/${folderId}/discussions`, 'POST', {
        title: 'viewer',
      }),
      403,
      'Can view cannot start a Discussion (discussion.create is Can comment)',
    )
    expectStatus(
      await viewer.browser.json(discussionPath, 'PATCH', { title: 'viewer' }),
      403,
      'Can view cannot edit another member\'s Discussion',
    )
    expectStatus(
      await viewer.browser.json(`${discussionPath}/resolve`, 'POST', {
        statement: 'viewer',
      }),
      403,
      'Can view cannot resolve',
    )
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM discussions
             WHERE folder_id = ${folderId}::uuid`,
      ),
      'no refused create left a row',
    ).toBe(1)
    expect(await stored(id)).toMatchObject({ title: 'ac910 the question', state: 'open' })
    expect(await outcomesOf(id), 'no refused resolve left an Outcome').toBe(0)

    /* The Can-comment creator edits, resolves and reopens their own. */
    expectStatus(
      await creator.browser.json(discussionPath, 'PATCH', { title: 'ac910 sharpened' }),
      200,
      'the creator edits their open Discussion',
    )
    expect((await stored(id))?.title).toBe('ac910 sharpened')
    expectStatus(
      await creator.browser.json(`${discussionPath}/resolve`, 'POST', {
        statement: 'ac910 agreed',
      }),
      200,
      'the creator resolves their own Discussion',
    )
    expect((await stored(id))?.state).toBe('resolved')
    expectStatus(
      await creator.browser.json(`${discussionPath}/reopen`, 'POST', {}),
      200,
      'the creator reopens their own Discussion',
    )
    expect(await stored(id)).toMatchObject({ state: 'open', current_outcome_id: null })

    /* Lowered to Can view: every creator power ends at once. */
    await setAccess(folderId, creator.id, 'can_view')
    expectStatus(
      await creator.browser.json(discussionPath, 'PATCH', { title: 'ac910 lowered' }),
      403,
      'a creator below Can comment cannot edit (#320)',
    )
    expectStatus(
      await creator.browser.json(`${discussionPath}/resolve`, 'POST', {
        statement: 'ac910 lowered',
      }),
      403,
      'a creator below Can comment cannot resolve (#320)',
    )
    expectStatus(
      await creator.browser.json(discussionPath, 'DELETE'),
      403,
      'a creator below Can comment cannot trash even an unshared Discussion (#320)',
    )
    expect(await stored(id)).toMatchObject({
      title: 'ac910 sharpened',
      state: 'open',
      current_outcome_id: null,
      trashed_at: null,
    })
    expect(await outcomesOf(id), 'only the one earlier Outcome exists').toBe(1)

    /* Removed from the Folder altogether: 404, as for any stranger. */
    await app.db.execute(
      sql`DELETE FROM folder_members
           WHERE folder_id = ${folderId}::uuid AND user_id = ${creator.id}::uuid`,
    )
    expectStatus(
      await creator.browser.json(`${discussionPath}/resolve`, 'POST', {
        statement: 'ac910 gone',
      }),
      404,
      'a former member is a stranger (10.2)',
    )
    expect((await stored(id))?.state).toBe('open')

    /* Can edit resolves another member's Discussion. */
    expectStatus(
      await editor.browser.json(`${discussionPath}/resolve`, 'POST', {
        statement: 'ac910 settled by the editor',
      }),
      200,
      'Can edit resolves any Discussion (#320)',
    )
    expect((await stored(id))?.state).toBe('resolved')
  })

  test('AC-911: creator removal only while unshared; Can edit trashes; purge is Full control', async () => {
    const [owner, creator, , editor] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await createFolder(owner, 'ac911 removal')
    await connect(app.db, owner.id, creator.id)
    await connect(app.db, owner.id, editor.id)
    await addMemberOk(owner, folderId, creator.id, 'can_comment')
    await addMemberOk(owner, folderId, editor.id, 'can_edit')

    /* Only the creator has spoken: theirs to remove and restore. */
    const alone = await start(creator, folderId, 'ac911 accidental')
    await seedComment(folderId, alone, creator.id)
    expectStatus(
      await creator.browser.json(`/discussions/${alone}`, 'DELETE'),
      204,
      'the creator removes an unshared Discussion (#320)',
    )
    expect((await stored(alone))?.trashed_at, 'trashed, not deleted').not.toBeNull()
    expectStatus(
      await creator.browser.json(`/discussions/${alone}/restore`, 'POST'),
      200,
      'and restores it',
    )
    expect((await stored(alone))?.trashed_at).toBeNull()

    /* Somebody else contributed: shared history, Can edit's to remove. */
    const shared = await start(creator, folderId, 'ac911 shared')
    await seedComment(folderId, shared, editor.id)
    expectStatus(
      await creator.browser.json(`/discussions/${shared}`, 'DELETE'),
      403,
      'the creator cannot remove a Discussion others contributed to (#320)',
    )
    expect((await stored(shared))?.trashed_at).toBeNull()

    /* An Outcome, even a previous one, is shared activity. */
    const decided = await start(creator, folderId, 'ac911 decided')
    expectStatus(
      await creator.browser.json(`/discussions/${decided}/resolve`, 'POST', {
        statement: 'ac911 outcome',
      }),
      200,
      'resolved',
    )
    expectStatus(
      await creator.browser.json(`/discussions/${decided}/reopen`, 'POST', {}),
      200,
      'reopened',
    )
    expectStatus(
      await creator.browser.json(`/discussions/${decided}`, 'DELETE'),
      403,
      'a Discussion that ever had an Outcome is not the creator\'s to remove (#320)',
    )
    expect((await stored(decided))?.trashed_at).toBeNull()

    /* Can edit removes shared history non-destructively. */
    expectStatus(
      await editor.browser.json(`/discussions/${shared}`, 'DELETE'),
      204,
      'Can edit trashes a shared Discussion',
    )
    expect((await stored(shared))?.trashed_at).not.toBeNull()
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM comments WHERE discussion_id = ${shared}::uuid`,
      ),
      'Trash keeps the conversation',
    ).toBe(1)
    const trash = await editor.browser.json('/trash', 'GET')
    expectStatus(trash, 200, 'Trash lists it')
    expect(
      (trash.json() as { discussions: { id: string }[] }).discussions.map((d) => d.id),
    ).toContain(shared)
    expectStatus(
      await editor.browser.json(`/discussions/${shared}`, 'GET'),
      404,
      'a trashed Discussion is off the ordinary surface',
    )

    /* Purge is Full control's. */
    expectStatus(
      await editor.browser.json(`/trash/discussions/${shared}`, 'DELETE'),
      403,
      'Can edit cannot purge (discussion.purge)',
    )
    expect(await stored(shared), 'the refused purge left the row').toBeDefined()
    expectStatus(
      await owner.browser.json(`/trash/discussions/${shared}`, 'DELETE'),
      204,
      'Full control purges',
    )
    expect(await stored(shared), 'the purge removed the Discussion').toBeUndefined()
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM comments WHERE discussion_id = ${shared}::uuid`,
      ),
      'and its conversation with it',
    ).toBe(0)
    expect(await stored(alone), 'nothing else was touched').toBeDefined()
  })
})
