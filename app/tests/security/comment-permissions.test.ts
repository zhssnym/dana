/*
given a comment in a folder, when a non-member reads or writes its
thread, then the 10.2 not-found shape; when the author or the folder owner
deletes it, then success; when another member tries, then 403.

Three roles, three answers, one thread. The author-or-owner delete rule is
4.15's and it is asserted from both sides so an implementation that checks
only one of the two grants cannot pass.

Spec: 4.15, 7.14, 10.2.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { GetBacklinksResponse } from '../../src/shared/backlinks.js'

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
import { uploadImageOk } from '../support/uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'author', 'bystander', 'outsider'])

async function comment(actor: Actor, folderId: string, body: string) {
  const posted = await actor.browser.json(`/folders/${folderId}/comments`, 'POST', {
    body,
  })
  expectStatus(posted, 201, 'a member comments (spec 7.14)')
  return String((posted.json() as { id?: unknown }).id)
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('three roles at one thread', () => {
  test('outsider not-found; author and owner delete; bystander 403', async () => {
    const [owner, author, bystander, outsider] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
      Actor,
    ]
    for (const person of [author, bystander]) {
      await connect(app.db, owner.id, person.id)
    }
    const folderId = await createFolder(owner, 's1 ac205 thread')
    await addMemberOk(owner, folderId, author.id)
    await addMemberOk(owner, folderId, bystander.id)

    const outsiderRead = await outsider.browser.json(
      `/folders/${folderId}/comments`,
      'GET',
    )
    expectStatus(outsiderRead, 404, 'a non-member meets not-found (spec 10.2)')

    const byAuthor = await comment(author, folderId, 's1 ac205 the author speaks')

    const refused = await bystander.browser.json(
      `/comments/${byAuthor}`,
      'DELETE',
    )
    expectStatus(refused, 403, 'a mere member deletes nobody else’s words (spec 4.15)')

    const authorDelete = await author.browser.json(`/comments/${byAuthor}`, 'DELETE')
    expect(
      [200, 204].includes(authorDelete.status),
      `the author deletes their own; answered ${String(authorDelete.status)}`,
    ).toBe(true)

    const ownerTarget = await comment(author, folderId, 's1 ac205 for the owner')
    const ownerDelete = await owner.browser.json(`/comments/${ownerTarget}`, 'DELETE')
    expect(
      [200, 204].includes(ownerDelete.status),
      `the folder owner may moderate; answered ${String(ownerDelete.status)}`,
    ).toBe(true)
  })
})

/*
W-C (Wave 2, Discussion threads): posts written in the editor.

- A media block may only name one of the same comment's own `file_ids`; a
  post naming any other file (another member's upload, or the author's own
  file not attached to this comment) is 422 and writes nothing.
- `content` round-trips, and `body` is derived from it: the request field
  arrives (AGENTS.md "Request fields").
- Only the author changes content; another member is refused.
- A thread closes without a decision and reopens; the list row carries the
  thread summary.
- A post's Dana Link is a backlink, and only to a reader who can open the
  thread.

Spec: 4.15, 4.31, 7.14, 7.24, 7.28.
*/
describe('W-C posts in a Discussion', () => {
  const madeFolders: string[] = []

  afterAll(async () => {
    if ((app as AuthTestApp | undefined) === undefined) return
    // Discussions hold `created_by` RESTRICT; they go with their Folders first.
    for (const folderId of madeFolders) {
      await app.db.execute(sql`DELETE FROM folders WHERE id = ${folderId}::uuid`)
    }
  })

  function paragraph(text: string, href?: string) {
    return {
      kind: 'paragraph',
      rich_content: { version: 1, runs: [href === undefined ? { text } : { text, href }] },
    }
  }

  async function commentCount(folderId: string): Promise<number> {
    const found = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM comments WHERE folder_id = ${folderId}::uuid`,
    )
    return Number(found[0]?.n)
  }

  test("media must be the post's own files; content round-trips with a derived body; only the author edits it", async () => {
    const [owner, author, bystander] = (await cast.of(app)) as [Actor, Actor, Actor, Actor]
    for (const person of [author, bystander]) await connect(app.db, owner.id, person.id)
    const folderId = await createFolder(owner, 'wc ac205 posts')
    madeFolders.push(folderId)
    await addMemberOk(owner, folderId, author.id)
    await addMemberOk(owner, folderId, bystander.id)
    const made = await author.browser.json(`/folders/${folderId}/discussions`, 'POST', {
      title: 'wc ac205 thread',
    })
    expectStatus(made, 201, 'a member starts a thread (spec 7.28)')
    const discussionId = String((made.json() as { id: string }).id)

    const own = await uploadImageOk(author, folderId, 'wc-own.png')
    const unattached = await uploadImageOk(author, folderId, 'wc-unattached.png')
    const foreign = await uploadImageOk(bystander, folderId, 'wc-foreign.png')

    const before = await commentCount(folderId)
    for (const named of [foreign, unattached]) {
      const refused = await author.browser.json(`/discussions/${discussionId}/comments`, 'POST', {
        content: {
          version: 1,
          blocks: [paragraph('look'), { kind: 'image', file_id: named }],
        },
        file_ids: [own],
      })
      expectStatus(refused, 422, 'a post shows only its own files (spec 7.14, W-C)')
    }
    const empty = await author.browser.json(`/discussions/${discussionId}/comments`, 'POST', {
      content: { version: 1, blocks: [{ kind: 'divider' }] },
    })
    expectStatus(empty, 422, 'a post carries words or a file (spec 7.14)')
    expect(await commentCount(folderId), 'a refused post writes nothing').toBe(before)

    const content = {
      version: 1,
      blocks: [
        { kind: 'heading2', rich_content: { version: 1, runs: [{ text: 'Plan' }] } },
        {
          kind: 'bullet',
          rich_content: { version: 1, runs: [{ text: 'first', bold: true }] },
          children: [paragraph('nested')],
        },
        { kind: 'image', file_id: own },
      ],
    }
    const posted = await author.browser.json(`/discussions/${discussionId}/comments`, 'POST', {
      content,
      file_ids: [own],
    })
    expectStatus(posted, 201, 'a post whose image is its own attachment lands')
    const line = posted.json() as { id: string; body: string | null; content: unknown }
    expect(line.body).toBe('Plan\nfirst\nnested')
    expect(line.content).toEqual(content)
    const stored = await rows(
      app.db,
      sql`SELECT body, content FROM comments WHERE id = ${line.id}::uuid`,
    )
    expect(stored[0]?.body, 'body is derived and stored').toBe('Plan\nfirst\nnested')
    expect(stored[0]?.content, 'content is stored as sent').toEqual(content)
    const thread = await bystander.browser.json(`/discussions/${discussionId}/comments`, 'GET')
    expectStatus(thread, 200, 'a member reads the thread')
    const read = (thread.json() as { comments: { id: string; content: unknown }[] }).comments
    expect(read.find((row) => row.id === line.id)?.content).toEqual(content)

    // Only the author changes content.
    const edited = { version: 1, blocks: [paragraph('rewritten')] }
    const notYours = await bystander.browser.json(`/comments/${line.id}`, 'PATCH', {
      content: edited,
    })
    expectStatus(notYours, 403, 'another member never rewrites a post (spec 7.14)')
    const owners = await owner.browser.json(`/comments/${line.id}`, 'PATCH', { content: edited })
    expectStatus(owners, 403, 'moderation removes a post and does not rewrite it')
    // Detaching the file the stored content still shows is refused.
    const detach = await author.browser.json(`/comments/${line.id}`, 'PATCH', { file_ids: [] })
    expectStatus(detach, 422, 'a post keeps the files its content shows')
    const smuggle = await author.browser.json(`/comments/${line.id}`, 'PATCH', {
      content: { version: 1, blocks: [{ kind: 'image', file_id: foreign }] },
    })
    expectStatus(smuggle, 422, "an edit shows only the post's own files")
    const unchanged = await rows(
      app.db,
      sql`SELECT content FROM comments WHERE id = ${line.id}::uuid`,
    )
    expect(unchanged[0]?.content, 'refused edits change nothing').toEqual(content)

    const mine = await author.browser.json(`/comments/${line.id}`, 'PATCH', { content: edited })
    expectStatus(mine, 200, 'the author edits their post')
    const answer = (mine.json() as { comment: { body: string; content: unknown } }).comment
    expect(answer.body).toBe('rewritten')
    expect(answer.content).toEqual(edited)
    // A plain-text edit replaces the post: content is cleared.
    const plain = await author.browser.json(`/comments/${line.id}`, 'PATCH', { body: 'just words' })
    expectStatus(plain, 200, 'a plain-text edit lands')
    expect((plain.json() as { comment: { content: unknown } }).comment.content).toBeNull()
  })

  test('a thread closes without a decision, reopens, and the list carries its summary', async () => {
    const [owner, author, bystander] = (await cast.of(app)) as [Actor, Actor, Actor, Actor]
    for (const person of [author, bystander]) await connect(app.db, owner.id, person.id)
    const folderId = await createFolder(owner, 'wc ac205 close')
    madeFolders.push(folderId)
    await addMemberOk(owner, folderId, author.id)
    await addMemberOk(owner, folderId, bystander.id)
    const made = await author.browser.json(`/folders/${folderId}/discussions`, 'POST', {
      title: 'wc ac205 closing',
    })
    expectStatus(made, 201, 'a member starts a thread')
    const discussionId = String((made.json() as { id: string }).id)
    const long = 'x'.repeat(200)
    const writers: [Actor, string][] = [
      [author, 'opening words'],
      [bystander, 'a reply'],
      [author, long],
    ]
    for (const [actor, text] of writers) {
      const posted = await actor.browser.json(`/discussions/${discussionId}/comments`, 'POST', {
        content: { version: 1, blocks: [paragraph(text)] },
      })
      expectStatus(posted, 201, 'a post lands')
    }

    const listed = await bystander.browser.json(`/folders/${folderId}/discussions`, 'GET')
    expectStatus(listed, 200, 'a member lists the threads')
    const row = (listed.json() as { discussions: Record<string, unknown>[] }).discussions.find(
      (entry) => entry.id === discussionId,
    )
    expect(row?.post_count).toBe(3)
    expect(row?.last_post).toMatchObject({ author_id: author.id, preview: 'x'.repeat(140) })
    expect(row?.participant_ids).toEqual([author.id, bystander.id])

    const closed = await author.browser.json(`/discussions/${discussionId}/resolve`, 'POST', {})
    expectStatus(closed, 200, 'a thread closes without a decision (Wave 2 decision 3)')
    expect(closed.json()).toMatchObject({
      state: 'resolved',
      current_outcome_id: null,
      current_outcome: null,
    })
    const outcomes = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM discussion_outcomes
           WHERE discussion_id = ${discussionId}::uuid`,
    )
    expect(outcomes[0]?.n, 'closing without a decision records no Outcome').toBe(0)
    const reopened = await author.browser.json(`/discussions/${discussionId}/reopen`, 'POST', {})
    expectStatus(reopened, 200, 'a thread closed without a decision reopens')
    expect(reopened.json()).toMatchObject({ state: 'open', resolved_at: null })
  })

  test("a post's Dana Link is a backlink only to a reader who can open the thread", async () => {
    const [owner, author, , outsider] = (await cast.of(app)) as [Actor, Actor, Actor, Actor]
    for (const person of [author, outsider]) await connect(app.db, owner.id, person.id)
    const target = await createFolder(owner, 'wc ac205 target')
    const source = await createFolder(owner, 'wc ac205 source')
    madeFolders.push(target, source)
    await addMemberOk(owner, target, author.id)
    await addMemberOk(owner, target, outsider.id)
    await addMemberOk(owner, source, author.id)
    const made = await author.browser.json(`/folders/${source}/discussions`, 'POST', {
      title: 'wc ac205 linking thread',
    })
    expectStatus(made, 201, 'a member starts a thread')
    const discussionId = String((made.json() as { id: string }).id)
    const posted = await author.browser.json(`/discussions/${discussionId}/comments`, 'POST', {
      content: { version: 1, blocks: [paragraph('see the target', `/app/folders/${target}`)] },
    })
    expectStatus(posted, 201, 'a post with a Dana Link lands')
    const postId = String((posted.json() as { id: string }).id)

    const seen = await author.browser.json(`/folders/${target}/backlinks`, 'GET')
    expectStatus(seen, 200, 'a reader of the target asks for its backlinks')
    const results = (seen.json() as GetBacklinksResponse).results
    expect(results.find((entry) => entry.surface === 'post')).toEqual({
      surface: 'post',
      home: 'discussion',
      home_id: discussionId,
      folder_id: source,
      member_id: null,
      label: 'wc ac205 linking thread',
      block_ids: [postId],
    })
    const hidden = await outsider.browser.json(`/folders/${target}/backlinks`, 'GET')
    expectStatus(hidden, 200, 'the outsider reads the target')
    expect(
      (hidden.json() as GetBacklinksResponse).results.filter((entry) => entry.surface === 'post'),
      'a thread the reader cannot open is not a backlink (spec 7.24)',
    ).toEqual([])
  })
})
