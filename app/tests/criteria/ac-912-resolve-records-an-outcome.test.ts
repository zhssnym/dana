/*
AC-912: resolving records a new, immutable, current Outcome atomically;
reopening clears the pointer and keeps every Outcome addressable; `Use as
outcome` snapshots a comment of the same Discussion and only that.

AC-913: a Folder's Consultation list is bounded, recent-activity ordered,
filterable by state, searchable over title and context, and its cursor walks
every row exactly once; a cursor it did not issue is 422.

**Why this criterion exists.** These are #320's core semantics, and every one
of them is a fact about stored rows -- the pointer, the Outcome's statement,
its provenance -- that a response alone could misreport.

Spec: 7.28.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Discussion, Outcome } from '../../src/shared/consultation.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  countRows,
  createFolder,
  expectStatus,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac912')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function row(id: string): Promise<Record<string, unknown> | undefined> {
  const result = (await app.db.execute(
    sql`SELECT state, current_outcome_id, resolved_at, last_activity_at
          FROM discussions WHERE id = ${id}::uuid`,
  )) as unknown as { rows: Record<string, unknown>[] }
  return result.rows[0]
}

async function outcomeRow(id: string): Promise<Record<string, unknown> | undefined> {
  const result = (await app.db.execute(
    sql`SELECT statement, actor_id, source_comment_id, discussion_id
          FROM discussion_outcomes WHERE id = ${id}::uuid`,
  )) as unknown as { rows: Record<string, unknown>[] }
  return result.rows[0]
}

async function start(owner: Actor, folderId: string, title: string, context?: string) {
  const made = await owner.browser.json(`/folders/${folderId}/discussions`, 'POST', {
    title,
    ...(context === undefined ? {} : { context }),
  })
  expectStatus(made, 201, `${title} is created (7.28)`)
  return made.json() as Discussion
}

async function seedComment(
  folderId: string,
  discussionId: string,
  authorId: string,
  body: string,
): Promise<string> {
  const result = (await app.db.execute(
    sql`INSERT INTO comments (folder_id, discussion_id, author_id, body)
        VALUES (${folderId}::uuid, ${discussionId}::uuid, ${authorId}::uuid, ${body})
        RETURNING id`,
  )) as unknown as { rows: { id: string }[] }
  return String(result.rows[0]?.id)
}

describe('AC-912 resolve records an Outcome', () => {
  test('AC-912: resolve, reopen, supersede and Use as outcome, asserted on stored rows', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac912 decisions')
    const made = await start(owner, folderId, 'ac912 which vendor', 'We need one by Friday.')
    const id = made.id
    expect(made.context).toBe('We need one by Friday.')
    const before = (await row(id))?.last_activity_at as Date

    const resolved = await owner.browser.json(`/discussions/${id}/resolve`, 'POST', {
      statement: 'Vendor A',
    })
    expectStatus(resolved, 200, 'resolve records the Outcome')
    const first = await row(id)
    const firstOutcomeId = String(first?.current_outcome_id)
    expect(first?.state).toBe('resolved')
    expect(await outcomeRow(firstOutcomeId)).toMatchObject({
      statement: 'Vendor A',
      actor_id: owner.id,
      source_comment_id: null,
      discussion_id: id,
    })
    expect(
      new Date(String(first?.last_activity_at)).getTime(),
      'resolving is activity',
    ).toBeGreaterThanOrEqual(new Date(before).getTime())

    /* Already resolved: 409, and no second Outcome. */
    expectStatus(
      await owner.browser.json(`/discussions/${id}/resolve`, 'POST', { statement: 'again' }),
      409,
      'a resolved Discussion is reopened before a new Outcome',
    )
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM discussion_outcomes WHERE discussion_id = ${id}::uuid`,
      ),
    ).toBe(1)
    /* Editing is only while open. */
    expectStatus(
      await owner.browser.json(`/discussions/${id}`, 'PATCH', { title: 'renamed' }),
      409,
      'a resolved Discussion is not edited',
    )

    /* Reopen clears the pointer and deletes nothing. */
    expectStatus(
      await owner.browser.json(`/discussions/${id}/reopen`, 'POST', {}),
      200,
      'reopen',
    )
    expect(await row(id)).toMatchObject({ state: 'open', current_outcome_id: null, resolved_at: null })
    expect(await outcomeRow(firstOutcomeId), 'the earlier Outcome survives').toMatchObject({
      statement: 'Vendor A',
    })

    /* Use as outcome: a comment of another Discussion is refused. */
    const elsewhere = await start(owner, folderId, 'ac912 elsewhere')
    const foreign = await seedComment(folderId, elsewhere.id, owner.id, 'not this one')
    expectStatus(
      await owner.browser.json(`/discussions/${id}/resolve`, 'POST', {
        source_comment_id: foreign,
      }),
      422,
      'the source comment must belong to this Discussion',
    )
    expect((await row(id))?.state, 'the refused resolve changed nothing').toBe('open')

    /* ...and one of its own is snapshotted. */
    const source = await seedComment(folderId, id, owner.id, '  Vendor B, on reflection  ')
    const reresolved = await owner.browser.json(`/discussions/${id}/resolve`, 'POST', {
      source_comment_id: source,
    })
    expectStatus(reresolved, 200, 'Use as outcome resolves')
    const second = await row(id)
    const secondOutcomeId = String(second?.current_outcome_id)
    expect(secondOutcomeId).not.toBe(firstOutcomeId)
    expect(await outcomeRow(secondOutcomeId)).toMatchObject({
      statement: 'Vendor B, on reflection',
      source_comment_id: source,
    })

    /* The comment changes later; the Outcome does not. */
    await app.db.execute(
      sql`UPDATE comments SET body = 'edited away' WHERE id = ${source}::uuid`,
    )
    expect((await outcomeRow(secondOutcomeId))?.statement).toBe('Vendor B, on reflection')

    /* The old Outcome's direct route still answers exactly what it said. */
    const old = await owner.browser.json(`/outcomes/${firstOutcomeId}`, 'GET')
    expectStatus(old, 200, 'an earlier Outcome stays addressable')
    const oldBody = old.json() as { outcome: Outcome; discussion: Discussion }
    expect(oldBody.outcome).toMatchObject({ statement: 'Vendor A', current: false })
    expect(oldBody.discussion.current_outcome_id).toBe(secondOutcomeId)

    const history = await owner.browser.json(`/discussions/${id}/outcomes`, 'GET')
    expectStatus(history, 200, 'history')
    expect(
      (history.json() as { outcomes: Outcome[] }).outcomes.map((o) => [o.id, o.current]),
    ).toEqual([
      [secondOutcomeId, true],
      [firstOutcomeId, false],
    ])
  })
})

describe('AC-913 the Consultation list', () => {
  test('AC-913: state filter, search, and a cursor that walks every row once', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac913 list')
    const made: string[] = []
    for (let index = 0; index < 5; index += 1) {
      made.push((await start(owner, folderId, `ac913 topic ${String(index)}`)).id)
    }
    const needle = await start(owner, folderId, 'ac913 other', 'mentions 50%_off deals')
    made.push(needle.id)
    expectStatus(
      await owner.browser.json(`/discussions/${made[0]}/resolve`, 'POST', { statement: 'done' }),
      200,
      'one resolved',
    )

    const walked: string[] = []
    let cursor: string | null = null
    for (let page = 0; page < 10; page += 1) {
      const query: string = cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`
      const answer = await owner.browser.json(
        `/folders/${folderId}/discussions?limit=2${query}`,
        'GET',
      )
      expectStatus(answer, 200, 'a page')
      const body = answer.json() as { discussions: Discussion[]; next_cursor: string | null }
      expect(body.discussions.length).toBeLessThanOrEqual(2)
      walked.push(...body.discussions.map((d) => d.id))
      cursor = body.next_cursor
      if (cursor === null) break
    }
    expect([...walked].sort(), 'every row exactly once').toEqual([...made].sort())
    expect(walked[0], 'the most recent activity first').toBe(made[0])

    const open = await owner.browser.json(`/folders/${folderId}/discussions?state=resolved`, 'GET')
    expect((open.json() as { discussions: Discussion[] }).discussions.map((d) => d.id)).toEqual([
      made[0],
    ])

    const found = await owner.browser.json(
      `/folders/${folderId}/discussions?q=${encodeURIComponent('50%_off')}`,
      'GET',
    )
    expect(
      (found.json() as { discussions: Discussion[] }).discussions.map((d) => d.id),
      'search reads context, with % and _ literal',
    ).toEqual([needle.id])

    for (const bad of ['nonsense', '2026-02-30T00:00:00.000000Z~00000000-0000-0000-0000-000000000000']) {
      expectStatus(
        await owner.browser.json(
          `/folders/${folderId}/discussions?cursor=${encodeURIComponent(bad)}`,
          'GET',
        ),
        422,
        `a cursor this list did not issue (${bad}) is 422, not 500`,
      )
    }
  })
})
