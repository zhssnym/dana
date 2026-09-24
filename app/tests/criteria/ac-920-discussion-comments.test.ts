/*
AC-920..AC-925: comments inside a Discussion (issue #320).

- AC-920: `/discussions/:id/comments` is 404 to a stranger, read and write,
  and to an id naming no Discussion; a Can view member reads it and is
  refused the write (403).
- AC-921: a comment posted to a Discussion is stored under it, moves its
  `last_activity_at` in the same act, and the Discussion's read answers its
  comments and no other thread's.
- AC-922: a resolved or trashed Discussion refuses a new comment, an edit, a
  delete and a like with 409 `discussion_frozen`, and the stored rows are
  unchanged.
- AC-923: the legacy Folder thread (`/folders/:id/comments`, no `task`) that
  the deployed client posts to files a new comment under the Folder's open
  "General discussion", creating it when missing, and reads that
  Discussion and never another; a Task thread stays `discussion_id` null.
  The General discussion is its `is_general` flag, never its title:
  renaming it moves nothing, and another Discussion titled "General
  discussion" stays off the legacy thread.
- AC-924: when the General discussion is resolved, a legacy post opens a
  fresh General discussion rather than being refused, a legacy reply to a
  comment of the resolved one is refused as frozen, and the legacy read
  still shows the resolved one's history.
- AC-925: every Folder-level comment the sample workspace writes is filed
  under a Discussion (its titled threads, since round 12), and removing the
  sample still works.

Asserted on stored rows, not only responses. Spec: 4.15, 4.31, 7.14.
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
const cast = new Cast(['owner', 'viewer', 'stranger'], 'ac920')
const folders: string[] = []

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  /* Discussions hold `created_by` RESTRICT and a resolved one points at
     its Outcome, so they go first, with their Folders. */
  for (const folderId of folders) {
    await app.db.execute(
      sql`UPDATE discussions SET state = 'open', resolved_at = NULL,
                 resolved_by = NULL, current_outcome_id = NULL, is_general = false
          WHERE folder_id = ${folderId}::uuid`,
    )
    await app.db.execute(sql`DELETE FROM folders WHERE id = ${folderId}::uuid`)
  }
  await cast.cleanup(app.db)
  await app.close()
})

async function setUp(name: string): Promise<{
  owner: Actor
  viewer: Actor
  stranger: Actor
  folderId: string
}> {
  const [owner, viewer, stranger] = (await cast.of(app)) as [Actor, Actor, Actor]
  await connect(app.db, owner.id, viewer.id)
  const folderId = await createFolder(owner, name)
  folders.push(folderId)
  await addMemberOk(owner, folderId, viewer.id, 'can_view')
  return { owner, viewer, stranger, folderId }
}

async function seedDiscussion(
  folderId: string,
  createdBy: string,
  title: string,
): Promise<string> {
  const made = await rows(
    app.db,
    sql`INSERT INTO discussions (folder_id, title, created_by, last_activity_at)
        VALUES (${folderId}::uuid, ${title}, ${createdBy}::uuid,
                '2020-01-01T00:00:00Z')
        RETURNING id`,
  )
  return String(made[0]?.id)
}

async function resolve(discussionId: string, actorId: string): Promise<void> {
  const outcome = await rows(
    app.db,
    sql`INSERT INTO discussion_outcomes (discussion_id, statement, actor_id)
        VALUES (${discussionId}::uuid, 'settled', ${actorId}::uuid)
        RETURNING id`,
  )
  await app.db.execute(
    sql`UPDATE discussions
        SET state = 'resolved', resolved_at = now(), resolved_by = ${actorId}::uuid,
            current_outcome_id = ${String(outcome[0]?.id)}::uuid
        WHERE id = ${discussionId}::uuid`,
  )
}

async function storedComment(
  commentId: string,
): Promise<Record<string, unknown> | undefined> {
  const found = await rows(
    app.db,
    sql`SELECT c.discussion_id, c.task_id, c.body, c.edited_at::text AS edited_at,
               (SELECT count(*)::int FROM comment_likes l
                 WHERE l.comment_id = c.id) AS likes
        FROM comments c WHERE c.id = ${commentId}::uuid`,
  )
  return found[0]
}

async function post(
  actor: Actor,
  path: string,
  body: Record<string, unknown>,
): Promise<string> {
  const posted = await actor.browser.json(path, 'POST', body)
  expectStatus(posted, 201, `POST ${path} creates the comment`)
  return String((posted.json() as { id?: unknown }).id)
}

function idsOf(response: { json(): unknown }): string[] {
  return (response.json() as { comments: { id: string }[] }).comments.map(
    (line) => line.id,
  )
}

describe('AC-920 a Discussion conversation is its Folder members\' alone', () => {
  test('stranger 404 both ways; unknown id 404; Can view reads, may not write', async () => {
    const { owner, viewer, stranger, folderId } = await setUp('ac920 access')
    const discussionId = await seedDiscussion(folderId, owner.id, 'Venue')
    const path = `/discussions/${discussionId}/comments`

    expectStatus(await stranger.browser.json(path, 'GET'), 404, 'stranger read')
    expectStatus(
      await stranger.browser.json(path, 'POST', { body: 'ac920 stranger' }),
      404,
      'stranger write',
    )
    expectStatus(
      await owner.browser.json(
        '/discussions/00000000-0000-4000-8000-000000000920/comments',
        'GET',
      ),
      404,
      'no such Discussion',
    )
    expectStatus(await viewer.browser.json(path, 'GET'), 200, 'Can view reads')
    expectStatus(
      await viewer.browser.json(path, 'POST', { body: 'ac920 viewer' }),
      403,
      'Can view does not comment',
    )
    const stored = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM comments
          WHERE discussion_id = ${discussionId}::uuid`,
    )
    expect(stored[0]?.n).toBe(0)
  })
})

describe('AC-921 a comment lands in its Discussion', () => {
  test('stored discussion_id, activity bumped, read scoped to the Discussion', async () => {
    const { owner, folderId } = await setUp('ac921 scope')
    const venue = await seedDiscussion(folderId, owner.id, 'Venue')
    const budget = await seedDiscussion(folderId, owner.id, 'Budget')

    const root = await post(owner, `/discussions/${venue}/comments`, {
      body: 'ac921 the hall?',
    })
    const reply = await post(owner, `/discussions/${venue}/comments`, {
      body: 'ac921 yes',
      parent_id: root,
    })
    await post(owner, `/discussions/${budget}/comments`, { body: 'ac921 money' })

    expect((await storedComment(root))?.discussion_id).toBe(venue)
    expect((await storedComment(reply))?.discussion_id).toBe(venue)
    const activity = await rows(
      app.db,
      sql`SELECT last_activity_at > '2020-01-02T00:00:00Z' AS moved
          FROM discussions WHERE id = ${venue}::uuid`,
    )
    expect(activity[0]?.moved).toBe(true)

    const read = await owner.browser.json(`/discussions/${venue}/comments`, 'GET')
    expectStatus(read, 200, 'the Discussion reads')
    expect(idsOf(read)).toEqual([root, reply])

    // A reply cannot cross into another Discussion.
    expectStatus(
      await owner.browser.json(`/discussions/${budget}/comments`, 'POST', {
        body: 'ac921 crossing',
        parent_id: root,
      }),
      422,
      'a parent of another Discussion',
    )
    // Nor does another Discussion show on the legacy Folder thread.
    const legacy = await owner.browser.json(`/folders/${folderId}/comments`, 'GET')
    expect(idsOf(legacy)).toEqual([])
  })
})

describe('AC-922 a resolved or trashed Discussion is frozen', () => {
  test('new comment, edit, delete and like are 409 and change nothing', async () => {
    const { owner, folderId } = await setUp('ac922 freeze')
    const discussionId = await seedDiscussion(folderId, owner.id, 'Date')
    const commentId = await post(owner, `/discussions/${discussionId}/comments`, {
      body: 'ac922 before',
    })
    await resolve(discussionId, owner.id)
    const before = await storedComment(commentId)

    const attempts = [
      await owner.browser.json(`/discussions/${discussionId}/comments`, 'POST', {
        body: 'ac922 after',
      }),
      await owner.browser.json(`/discussions/${discussionId}/comments`, 'POST', {
        body: 'ac922 reply after',
        parent_id: commentId,
      }),
      await owner.browser.json(`/comments/${commentId}`, 'PATCH', {
        body: 'ac922 rewritten',
      }),
      await owner.browser.json(`/comments/${commentId}/like`, 'PUT', {}),
      await owner.browser.json(`/comments/${commentId}`, 'DELETE'),
    ]
    for (const attempt of attempts) {
      expectStatus(attempt, 409, 'a frozen Discussion refuses the write')
      expect((attempt.json() as { error?: { code?: string } }).error?.code).toBe(
        'discussion_frozen',
      )
    }
    expect(await storedComment(commentId)).toEqual(before)
    const count = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM comments
          WHERE discussion_id = ${discussionId}::uuid`,
    )
    expect(count[0]?.n).toBe(1)

    // Trash freezes too, and the conversation still reads.
    const trashed = await seedDiscussion(folderId, owner.id, 'Trashed')
    const inTrash = await post(owner, `/discussions/${trashed}/comments`, {
      body: 'ac922 kept',
    })
    await app.db.execute(
      sql`UPDATE discussions SET trashed_at = now() WHERE id = ${trashed}::uuid`,
    )
    expectStatus(
      await owner.browser.json(`/comments/${inTrash}`, 'DELETE'),
      409,
      'a trashed Discussion keeps its comments',
    )
    expect(await storedComment(inTrash)).toBeDefined()
    const read = await owner.browser.json(`/discussions/${trashed}/comments`, 'GET')
    expect(idsOf(read)).toEqual([inTrash])
  })
})

describe('AC-923 the legacy Folder thread is the General discussion', () => {
  test('a legacy post creates and lands in it; task threads stay unscoped', async () => {
    const { owner, folderId } = await setUp('ac923 legacy')
    const none = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM discussions WHERE folder_id = ${folderId}::uuid`,
    )
    expect(none[0]?.n).toBe(0)

    const first = await post(owner, `/folders/${folderId}/comments`, {
      body: 'ac923 hello',
    })
    const general = await rows(
      app.db,
      sql`SELECT id, title, state, created_by, is_general FROM discussions
          WHERE folder_id = ${folderId}::uuid`,
    )
    expect(general).toHaveLength(1)
    expect(general[0]).toMatchObject({
      title: 'General discussion',
      state: 'open',
      created_by: owner.id,
      is_general: true,
    })
    const generalId = String(general[0]?.id)
    expect((await storedComment(first))?.discussion_id).toBe(generalId)

    // A stray (pre-cutover) Folder-level comment is swept in by the next post.
    const stray = await rows(
      app.db,
      sql`INSERT INTO comments (folder_id, author_id, body)
          VALUES (${folderId}::uuid, ${owner.id}::uuid, 'ac923 stray')
          RETURNING id`,
    )
    const strayId = String(stray[0]?.id)
    const second = await post(owner, `/folders/${folderId}/comments`, {
      body: 'ac923 second',
    })
    expect((await storedComment(second))?.discussion_id).toBe(generalId)
    expect((await storedComment(strayId))?.discussion_id).toBe(generalId)
    const reply = await post(owner, `/folders/${folderId}/comments`, {
      body: 'ac923 reply',
      parent_id: first,
    })
    expect((await storedComment(reply))?.discussion_id).toBe(generalId)

    // Another Discussion's comments stay off the legacy read.
    const other = await seedDiscussion(folderId, owner.id, 'Elsewhere')
    const elsewhere = await post(owner, `/discussions/${other}/comments`, {
      body: 'ac923 elsewhere',
    })
    const legacy = await owner.browser.json(`/folders/${folderId}/comments`, 'GET')
    expect(idsOf(legacy)).toEqual([first, strayId, second, reply])

    // Renaming the General discussion moves nothing, and a Discussion that
    // merely carries its title is an ordinary one: the flag decides.
    const renamed = await owner.browser.json(`/discussions/${generalId}`, 'PATCH', {
      title: 'ac923 renamed',
    })
    expectStatus(renamed, 200, 'the General discussion is renamed')
    expect((renamed.json() as { is_general?: unknown }).is_general).toBe(true)
    const decoy = await owner.browser.json(`/folders/${folderId}/discussions`, 'POST', {
      title: 'General discussion',
    })
    expectStatus(decoy, 201, 'a Discussion titled like the General one')
    const decoyId = String((decoy.json() as { id?: unknown }).id)
    expect((decoy.json() as { is_general?: unknown }).is_general).toBe(false)
    const inDecoy = await post(owner, `/discussions/${decoyId}/comments`, {
      body: 'ac923 decoy',
    })
    const afterRename = await post(owner, `/folders/${folderId}/comments`, {
      body: 'ac923 after rename',
    })
    expect((await storedComment(afterRename))?.discussion_id).toBe(generalId)
    const relisted = await owner.browser.json(`/folders/${folderId}/comments`, 'GET')
    expect(idsOf(relisted)).toEqual([first, strayId, second, reply, afterRename])
    expect(idsOf(relisted)).not.toContain(inDecoy)
    expect(
      await rows(
        app.db,
        sql`SELECT count(*)::int AS n FROM discussions
            WHERE folder_id = ${folderId}::uuid AND is_general`,
      ),
      'no second General was forked by the rename',
    ).toEqual([{ n: 1 }])
    // And the legacy thread's reply cannot reach into another Discussion.
    expectStatus(
      await owner.browser.json(`/folders/${folderId}/comments`, 'POST', {
        body: 'ac923 crossing',
        parent_id: elsewhere,
      }),
      422,
      'a legacy reply to another Discussion',
    )

    // A Task thread is untouched by all of it.
    const task = await owner.browser.json('/tasks', 'POST', {
      title: 'ac923 task',
      folder_id: folderId,
    })
    expectStatus(task, 201, 'a task')
    const taskId = String((task.json() as { id?: unknown }).id)
    const onTask = await post(owner, `/folders/${folderId}/comments?task=${taskId}`, {
      body: 'ac923 on the task',
    })
    const storedTask = await storedComment(onTask)
    expect(storedTask?.discussion_id).toBeNull()
    expect(storedTask?.task_id).toBe(taskId)
    const taskRead = await owner.browser.json(
      `/folders/${folderId}/comments?task=${taskId}`,
      'GET',
    )
    expect(idsOf(taskRead)).toEqual([onTask])
  })
})

describe('AC-924 a resolved General discussion does not silence the legacy thread', () => {
  test('a new General opens; a reply into the resolved one is frozen; history reads', async () => {
    const { owner, folderId } = await setUp('ac924 resolved general')
    const old = await post(owner, `/folders/${folderId}/comments`, {
      body: 'ac924 old',
    })
    const oldGeneral = String((await storedComment(old))?.discussion_id)
    await resolve(oldGeneral, owner.id)

    const replied = await owner.browser.json(`/folders/${folderId}/comments`, 'POST', {
      body: 'ac924 late reply',
      parent_id: old,
    })
    expectStatus(replied, 409, 'a reply into a resolved General discussion')

    const fresh = await post(owner, `/folders/${folderId}/comments`, {
      body: 'ac924 new',
    })
    const freshGeneral = String((await storedComment(fresh))?.discussion_id)
    expect(freshGeneral).not.toBe(oldGeneral)
    const generals = await rows(
      app.db,
      sql`SELECT state FROM discussions
          WHERE folder_id = ${folderId}::uuid AND is_general
          ORDER BY created_at, id`,
    )
    expect(generals.map((row) => row.state)).toEqual(['resolved', 'open'])

    const legacy = await owner.browser.json(`/folders/${folderId}/comments`, 'GET')
    expect(idsOf(legacy)).toEqual([old, fresh])
  })
})

describe('AC-925 the sample workspace files its conversation under Discussions', () => {
  test('every sample Folder-level comment is in one; removal still works', async () => {
    const [, , stranger] = (await cast.of(app)) as [Actor, Actor, Actor]
    expectStatus(
      await stranger.browser.json('/sample', 'POST', {}),
      200,
      'the sample workspace is made (7.20)',
    )
    const scoped = await rows(
      app.db,
      sql`SELECT d.id AS discussion_id
          FROM comments c
          JOIN folders f ON f.id = c.folder_id AND f.owner_id = ${stranger.id}::uuid
          LEFT JOIN discussions d ON d.id = c.discussion_id
          WHERE c.task_id IS NULL`,
    )
    expect(scoped.length).toBeGreaterThan(0)
    for (const row of scoped) {
      expect(row.discussion_id).not.toBeNull()
    }

    expectStatus(
      await stranger.browser.json('/sample', 'DELETE'),
      204,
      'the sample workspace is removed with its Discussions',
    )
    const left = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM discussions d
          JOIN folders f ON f.id = d.folder_id
          WHERE f.owner_id = ${stranger.id}::uuid AND f.deleted_at IS NULL`,
    )
    expect(left[0]?.n).toBe(0)
  })
})
