/*
AC-1540..AC-1542: reactions on a Discussion post (4.15, 7.14).

- AC-1540: a reaction is one stored row per (comment, person, reaction);
  leaving it twice keeps one; the thread reads reactions grouped, in the
  order each was first left, `by` earliest first; a row written the way a
  like was (no reaction named) reads back as `thumbs_up`, and the old like
  route stores and removes `thumbs_up`.
- AC-1541: taking back one reaction removes only that row: the same
  person's other reaction and another person's same reaction stay.
- AC-1542: a stranger gets 404 and a Can view member 403 on both verbs, an
  unknown key is 422 to a Can comment member, and none of them stores a row.

Asserted on stored rows. Spec: 4.15, 7.14.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { CommentLine } from '../../src/shared/comments.js'
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
const cast = new Cast(['owner', 'commenter', 'viewer', 'stranger'], 'ac1540')
const folders: string[] = []

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  for (const folderId of folders) {
    await app.db.execute(
      sql`UPDATE discussions SET is_general = false WHERE folder_id = ${folderId}::uuid`,
    )
    await app.db.execute(sql`DELETE FROM folders WHERE id = ${folderId}::uuid`)
  }
  await cast.cleanup(app.db)
  await app.close()
})

interface Scene {
  owner: Actor
  commenter: Actor
  viewer: Actor
  stranger: Actor
  discussionId: string
  commentId: string
}

async function setUp(name: string): Promise<Scene> {
  const [owner, commenter, viewer, stranger] = (await cast.of(app)) as [
    Actor,
    Actor,
    Actor,
    Actor,
  ]
  await connect(app.db, owner.id, commenter.id)
  await connect(app.db, owner.id, viewer.id)
  const folderId = await createFolder(owner, name)
  folders.push(folderId)
  await addMemberOk(owner, folderId, commenter.id, 'can_comment')
  await addMemberOk(owner, folderId, viewer.id, 'can_view')
  const made = await rows(
    app.db,
    sql`INSERT INTO discussions (folder_id, title, created_by)
        VALUES (${folderId}::uuid, 'Venue', ${owner.id}::uuid) RETURNING id`,
  )
  const discussionId = String(made[0]?.id)
  const posted = await owner.browser.json(
    `/discussions/${discussionId}/comments`,
    'POST',
    { body: `${name} post` },
  )
  expectStatus(posted, 201, 'the post is made')
  const commentId = String((posted.json() as { id?: unknown }).id)
  return { owner, commenter, viewer, stranger, discussionId, commentId }
}

async function stored(commentId: string): Promise<Record<string, unknown>[]> {
  return rows(
    app.db,
    sql`SELECT user_id::text AS user_id, reaction FROM comment_likes
        WHERE comment_id = ${commentId}::uuid
        ORDER BY reaction, user_id`,
  )
}

async function readLine(actor: Actor, scene: Scene): Promise<CommentLine> {
  const read = await actor.browser.json(
    `/discussions/${scene.discussionId}/comments`,
    'GET',
  )
  expectStatus(read, 200, 'the thread reads')
  const line = (read.json() as { comments: CommentLine[] }).comments.find(
    (entry) => entry.id === scene.commentId,
  )
  expect(line).toBeDefined()
  return line as CommentLine
}

async function react(
  actor: Actor,
  commentId: string,
  reaction: string,
  method: 'PUT' | 'DELETE',
): Promise<Awaited<ReturnType<Actor['browser']['json']>>> {
  return method === 'PUT'
    ? actor.browser.json(`/comments/${commentId}/reactions/${reaction}`, 'PUT', {})
    : actor.browser.json(`/comments/${commentId}/reactions/${reaction}`, 'DELETE')
}

describe('AC-1540 a reaction is one stored row and reads grouped', () => {
  test('idempotent row, grouped read, a like is a thumbs_up', async () => {
    const scene = await setUp('ac1540 store')
    const { owner, commenter, commentId } = scene

    expectStatus(await react(owner, commentId, 'party', 'PUT'), 204, 'react')
    expectStatus(await react(owner, commentId, 'party', 'PUT'), 204, 'again')
    expect(await stored(commentId)).toEqual([{ user_id: owner.id, reaction: 'party' }])

    // A row written as a like was, before reactions: no reaction named.
    await app.db.execute(
      sql`INSERT INTO comment_likes (comment_id, user_id, created_at)
          VALUES (${commentId}::uuid, ${commenter.id}::uuid, now() + interval '1 minute')`,
    )
    expectStatus(
      await owner.browser.json(`/comments/${commentId}/like`, 'PUT', {}),
      204,
      'the old like route still answers',
    )
    await app.db.execute(
      sql`UPDATE comment_likes SET created_at = now() + interval '2 minutes'
          WHERE comment_id = ${commentId}::uuid AND user_id = ${owner.id}::uuid
            AND reaction = 'thumbs_up'`,
    )
    expect(await stored(commentId)).toEqual(
      [
        { user_id: owner.id, reaction: 'party' },
        { user_id: commenter.id, reaction: 'thumbs_up' },
        { user_id: owner.id, reaction: 'thumbs_up' },
      ].sort((a, b) =>
        a.reaction === b.reaction
          ? a.user_id.localeCompare(b.user_id)
          : a.reaction.localeCompare(b.reaction),
      ),
    )

    const line = await readLine(commenter, scene)
    expect(line.reactions).toEqual([
      { reaction: 'party', by: [owner.id] },
      { reaction: 'thumbs_up', by: [commenter.id, owner.id] },
    ])

    expectStatus(
      await owner.browser.json(`/comments/${commentId}/like`, 'DELETE'),
      204,
      'the old unlike route still answers',
    )
    expect(await stored(commentId)).toEqual([
      { user_id: owner.id, reaction: 'party' },
      { user_id: commenter.id, reaction: 'thumbs_up' },
    ])
  })
})

describe('AC-1541 taking back a reaction removes only that one', () => {
  test('the other reaction and the other person stay', async () => {
    const scene = await setUp('ac1541 remove')
    const { owner, commenter, commentId } = scene
    for (const [actor, reaction] of [
      [owner, 'heart'],
      [owner, 'thanks'],
      [commenter, 'heart'],
    ] as const) {
      expectStatus(await react(actor, commentId, reaction, 'PUT'), 204, 'react')
    }

    expectStatus(await react(owner, commentId, 'heart', 'DELETE'), 204, 'unreact')
    expectStatus(await react(owner, commentId, 'heart', 'DELETE'), 204, 'again')

    const kept = await stored(commentId)
    expect(kept).toContainEqual({ user_id: owner.id, reaction: 'thanks' })
    expect(kept).toContainEqual({ user_id: commenter.id, reaction: 'heart' })
    expect(kept).not.toContainEqual({ user_id: owner.id, reaction: 'heart' })
    expect(kept).toHaveLength(2)
  })
})

describe('AC-1542 who may react, and with what', () => {
  test('stranger 404, Can view 403, unknown key 422, nothing stored', async () => {
    const scene = await setUp('ac1542 refuse')
    const { commenter, viewer, stranger, commentId } = scene

    for (const method of ['PUT', 'DELETE'] as const) {
      expectStatus(await react(stranger, commentId, 'heart', method), 404, `stranger ${method}`)
      expectStatus(await react(viewer, commentId, 'heart', method), 403, `Can view ${method}`)
    }
    // An unknown key says nothing to a stranger either: 404 comes first.
    expectStatus(await react(stranger, commentId, 'wave', 'PUT'), 404, 'stranger, bad key')
    const invalid = await react(commenter, commentId, 'wave', 'PUT')
    expectStatus(invalid, 422, 'unknown key')
    expect((invalid.json() as { error?: { code?: string } }).error?.code).toBe(
      'validation_failed',
    )
    expectStatus(await react(commenter, commentId, '👍', 'PUT'), 422, 'a glyph is not a key')

    expect(await stored(commentId)).toEqual([])
  })
})
