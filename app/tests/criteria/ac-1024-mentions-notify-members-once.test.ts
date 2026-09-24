/*
AC-1024: an @mention tells a page member once, and nobody else (Wave 2, W-D).

- the `mention` key on a rich-text run arrives: the page read returns it;
- a member mentioned in a page gets one `mentioned` notification; a re-save of
  the same block notifies nobody again;
- a person who is not a member gets no `mention_notices` row and no
  notification, and the save answers exactly as it does for a member;
- a mention naming no existing person is refused and writes nothing;
- a Task document mention notifies the member with the Task as its subject;
- account deletion (8.10 step 6c) sweeps the departed account's notice rows.

Security and data-loss class: a notice to a non-member names a page they
cannot open; a notice per save is a flood; a row that outlives its account is
issue #253 again.
*/
import { randomUUID } from 'node:crypto'

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
  seedTask,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { deleteAccount } from '../support/sharing-harness.js'
import { at, compose, put, readPage } from '../support/workflow-page-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 'ac1024')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface Line {
  event: { verb: string; subject_kind: string; subject_id: string; actor_id: string }
}

async function mentionsOf(actor: Actor): Promise<Line[]> {
  const response = await actor.browser.api('/notifications')
  expect(response.status).toBe(200)
  const body = response.json() as { notifications: Line[] }
  return body.notifications.filter((line) => line.event.verb === 'mentioned')
}

const runs = (...people: string[]) => ({
  version: 1 as const,
  runs: [
    { text: 'Over to ' },
    ...people.map((id) => ({ text: '@Someone', mention: { user_id: id } })),
    { text: ' for review' },
  ],
})
/** The block's plain text, which the server holds equal to its runs. */
const said = (...people: string[]): string => runs(...people).runs.map((run) => run.text).join('')

describe('AC-1024 mentions notify page members once', () => {
  test('a member is told once, a stranger never, an unknown id is refused, deletion sweeps', async () => {
    const [owner, member, stranger] = (await cast.of(app)) as [Actor, Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 'ac1024 the plan')
    await addMemberOk(owner, folderId, member.id)

    const block = randomUUID()
    const page = await compose(
      owner,
      folderId,
      [
        put(block, 'paragraph', said(member.id, stranger.id), { rich_content: runs(member.id, stranger.id) }),
        { op: 'set_outline', items: [at(block)] },
      ],
      'a paragraph mentioning a member and a stranger saves like any other (the stranger is not told)',
    )
    // The request field arrives and is stored, key and all.
    const stored = page.blocks.find((b) => b.id === block)?.rich_content as { runs: { mention?: { user_id: string } }[] }
    expect(stored.runs.filter((run) => run.mention !== undefined).map((run) => run.mention?.user_id)).toEqual([member.id, stranger.id])

    const first = await mentionsOf(member)
    expect(first, 'the member is told once').toHaveLength(1)
    expect(first[0]?.event).toMatchObject({ subject_kind: 'folder', subject_id: folderId, actor_id: owner.id })
    expect(await mentionsOf(stranger), 'a non-member is never told').toHaveLength(0)
    expect(
      await countRows(app.db, sql`SELECT count(*)::int AS n FROM mention_notices WHERE user_id = ${stranger.id}::uuid`),
      'a non-member gets no notice row',
    ).toBe(0)
    expect(await mentionsOf(owner), 'the author is never told of their own mention').toHaveLength(0)

    // Re-saving the same block, still naming the member, tells nobody again.
    await compose(
      owner,
      folderId,
      [
        put(block, 'paragraph', said(member.id), { rich_content: runs(member.id) }),
        { op: 'set_outline', items: [at(block)] },
      ],
      'a re-save of a mention saves',
    )
    expect(await mentionsOf(member), 're-saving the same mention notifies once').toHaveLength(1)
    expect(
      await countRows(app.db, sql`SELECT count(*)::int AS n FROM mention_notices WHERE user_id = ${member.id}::uuid`),
    ).toBe(1)

    // A person who does not exist is refused, and nothing is written.
    const before = await readPage(owner, folderId)
    const ghost = randomUUID()
    const refused = await owner.browser.json(`/folders/${folderId}/page/actions`, 'POST', {
      action: 'document_transaction',
      mutation_id: randomUUID(),
      base_revision: before.revision as string,
      operations: [
        put(block, 'paragraph', said(ghost, ghost), { rich_content: runs(ghost, ghost) }),
        { op: 'set_outline', items: [at(block)] },
      ],
    })
    expect(refused.status).toBeGreaterThanOrEqual(400)
    expect(refused.status).toBeLessThan(500)
    expect((await readPage(owner, folderId)).revision, 'a refused save writes nothing').toBe(before.revision)

    // A Task document mention names the Task.
    const taskId = await seedTask(app.db, { folderId, createdBy: owner.id, title: 'ac1024 the task' })
    const view = await owner.browser.api(`/tasks/${taskId}/document`)
    expect(view.status).toBe(200)
    const taskBlock = randomUUID()
    const written = await owner.browser.json(`/tasks/${taskId}/document`, 'PUT', {
      action: 'document_transaction',
      mutation_id: randomUUID(),
      base_revision: (view.json() as { revision: string }).revision,
      operations: [
        put(taskBlock, 'paragraph', said(member.id, stranger.id), { rich_content: runs(member.id, stranger.id) }),
        { op: 'set_outline', items: [at(taskBlock)] },
      ],
    })
    expect(written.status).toBe(200)
    const afterTask = await mentionsOf(member)
    expect(afterTask).toHaveLength(2)
    expect(afterTask.some((line) => line.event.subject_kind === 'task' && line.event.subject_id === taskId)).toBe(true)
    expect(await mentionsOf(stranger)).toHaveLength(0)

    // 8.10 step 6c: the departed account's notice rows go with it.
    const gone = await deleteAccount(member)
    expect(gone.status).toBeLessThan(300)
    expect(
      await countRows(app.db, sql`SELECT count(*)::int AS n FROM mention_notices WHERE user_id = ${member.id}::uuid`),
      'account deletion sweeps mention_notices',
    ).toBe(0)
  })
})
