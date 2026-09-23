/*
AC-930..AC-932: Discussion and Outcome Dana Links (issue #320) resolve only for
a member of the Discussion's live Folder, answer a trashed Discussion as a
missing target, and keep a superseded Outcome's link naming what it said.

**Why these exist.** The resolver, the picker and the backlink route are three
doors onto the same rows, and each is a read someone could point at a
Discussion they were never in. A slipped membership join answers a 200 with
the Discussion's title on it, and nothing structural notices: the ac-397 sweep
drives one path per route, and search takes no id at all.

Rows are seeded directly: these criteria are about the link doors, not about
how a Discussion is written.

Spec: 7.24 ("Discussion and Outcome references"), 7.0, 10.2.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { GetBacklinksResponse } from '../../src/shared/backlinks.js'
import type { DocumentTransaction, PageView } from '../../src/shared/pages.js'
import type {
  GetReferenceSearchResponse,
  ReferenceSummary,
} from '../../src/shared/references.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  countRows,
  createFolder,
  expectStatus,
  seedMembership,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 'ac930')

const TITLE = 'ac930 zanzibar decision'
const FIRST = 'ac930 zanzibar first answer'
const SECOND = 'ac930 zanzibar second answer'

interface Stage {
  owner: Actor
  member: Actor
  stranger: Actor
  folderId: string
  discussionId: string
  oldOutcomeId: string
  currentOutcomeId: string
}
let staged: Stage | undefined

async function seedOutcome(
  discussionId: string,
  actorId: string,
  statement: string,
): Promise<string> {
  const id = randomUUID()
  await app.db.execute(sql`
    INSERT INTO discussion_outcomes (id, discussion_id, statement, actor_id)
    VALUES (${id}::uuid, ${discussionId}::uuid, ${statement}, ${actorId}::uuid)`)
  await app.db.execute(sql`
    UPDATE discussions
       SET state = 'resolved', resolved_at = now(), resolved_by = ${actorId}::uuid,
           current_outcome_id = ${id}::uuid
     WHERE id = ${discussionId}::uuid`)
  return id
}

async function stage(): Promise<Stage> {
  if (staged !== undefined) return staged
  const [owner, member, stranger] = (await cast.of(app)) as [Actor, Actor, Actor]
  const folderId = await createFolder(owner, 'ac930 consulted folder')
  await seedMembership(app.db, folderId, member.id)
  const discussionId = randomUUID()
  await app.db.execute(sql`
    INSERT INTO discussions (id, folder_id, title, context, created_by)
    VALUES (${discussionId}::uuid, ${folderId}::uuid, ${TITLE},
            'plain context', ${owner.id}::uuid)`)
  const oldOutcomeId = await seedOutcome(discussionId, owner.id, FIRST)
  const currentOutcomeId = await seedOutcome(discussionId, member.id, SECOND)
  staged = {
    owner,
    member,
    stranger,
    folderId,
    discussionId,
    oldOutcomeId,
    currentOutcomeId,
  }
  return staged
}

async function search(
  actor: Actor,
  q: string,
  folderId?: string,
): Promise<ReferenceSummary[]> {
  const context = folderId === undefined ? '' : `&folder=${folderId}`
  const answer = await actor.browser.json(
    `/references/search?q=${encodeURIComponent(q)}${context}`,
    'GET',
  )
  expectStatus(answer, 200, 'the picker answers its reader (spec 7.24)')
  return (answer.json() as GetReferenceSearchResponse).results
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  if (staged !== undefined) {
    await app.db.execute(
      sql`DELETE FROM discussions WHERE folder_id = ${staged.folderId}::uuid`,
    )
  }
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-930..932 Discussion and Outcome links', () => {
  test('AC-930: a non-member is told what a missing id is told, at every door', async () => {
    const { member, stranger, discussionId, currentOutcomeId, oldOutcomeId } =
      await stage()

    const discussion = await member.browser.json(
      `/references/discussion/${discussionId}`,
      'GET',
    )
    expectStatus(discussion, 200, 'a member resolves the Discussion (spec 7.24)')
    expect(discussion.json()).toEqual({
      kind: 'discussion',
      id: discussionId,
      label: TITLE,
      path: `/app/discussions/${discussionId}`,
    })
    const outcome = await member.browser.json(
      `/references/outcome/${currentOutcomeId}`,
      'GET',
    )
    expectStatus(outcome, 200, 'a member resolves the Outcome (spec 7.24)')
    expect(outcome.json()).toEqual({
      kind: 'outcome',
      id: currentOutcomeId,
      label: SECOND,
      path: `/app/outcomes/${currentOutcomeId}`,
    })

    const missing = await stranger.browser.json(
      `/references/discussion/${randomUUID()}`,
      'GET',
    )
    expectStatus(missing, 404, 'a missing target is 404 (spec 7.0)')
    for (const path of [
      `/references/discussion/${discussionId}`,
      `/references/outcome/${currentOutcomeId}`,
      `/references/outcome/${oldOutcomeId}`,
      `/discussions/${discussionId}/backlinks`,
      `/outcomes/${currentOutcomeId}/backlinks`,
    ]) {
      const refused = await stranger.browser.json(path, 'GET')
      expectStatus(refused, 404, `${path} must read as nonexistent to a stranger (spec 10.2)`)
      expect(refused.body).toBe(missing.body)
      expect(refused.body).not.toContain('zanzibar')
    }

    expect(await search(stranger, 'zanzibar')).toEqual([])
    const found = await search(member, 'zanzibar')
    expect(found.map((row) => `${row.kind}:${row.id}`).sort()).toEqual(
      [`discussion:${discussionId}`, `outcome:${currentOutcomeId}`].sort(),
    )
  })

  test('AC-930: a Discussion is a backlink target, answered from a page the reader can open', async () => {
    const { owner, member, folderId, discussionId } = await stage()
    const page = await owner.browser.json(`/folders/${folderId}/page`, 'GET')
    expectStatus(page, 200, 'the owner reads the page before writing it (spec 7.16)')
    const blockId = randomUUID()
    const href = `/app/discussions/${discussionId}`
    const body: DocumentTransaction = {
      action: 'document_transaction',
      mutation_id: randomUUID(),
      base_revision: (page.json() as PageView).revision!,
      operations: [
        {
          op: 'put_block',
          id: blockId,
          block_kind: 'paragraph',
          text: 'see the discussion',
          rich_content: { version: 1, runs: [{ text: 'see the discussion', href }] },
          file_id: null,
          ref_folder_id: null,
          width_pct: null,
          checked: null,
        },
        {
          op: 'set_outline',
          items: [
            { kind: 'block', id: blockId, section_block_id: null, list_parent_block_id: null },
          ],
        },
      ],
    }
    const written = await owner.browser.json(`/folders/${folderId}/page/actions`, 'POST', body)
    expectStatus(written, 200, 'the owner links the Discussion from the page (spec 7.24)')
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM page_blocks
             WHERE id = ${blockId}::uuid AND rich_content::text LIKE ${`%${href}%`}`,
      ),
    ).toBe(1)

    const answer = await member.browser.json(`/discussions/${discussionId}/backlinks`, 'GET')
    expectStatus(answer, 200, 'a member reads what references the Discussion (spec 7.24)')
    const backlinks = answer.json() as GetBacklinksResponse
    expect(backlinks.results.map((row) => [row.home_id, row.block_ids])).toEqual([
      [folderId, [blockId]],
    ])
  })

  test('AC-932: a superseded Outcome still resolves to what it said; the picker offers the current one', async () => {
    const { member, folderId, discussionId, oldOutcomeId, currentOutcomeId } =
      await stage()
    const old = await member.browser.json(`/references/outcome/${oldOutcomeId}`, 'GET')
    expectStatus(old, 200, 'an old Outcome link stays stable (#320)')
    expect((old.json() as ReferenceSummary).label).toBe(FIRST)
    const offered = (await search(member, 'zanzibar'))
      .filter((row) => row.kind === 'outcome')
      .map((row) => row.id)
    expect(offered).toEqual([currentOutcomeId])
    const inContext = await search(member, 'zanzibar', folderId)
    expect(inContext.map((row) => row.id).sort()).toEqual(
      [discussionId, currentOutcomeId].sort(),
    )
  })

  test('AC-931: a trashed Discussion and its Outcomes read as missing, even to a member, until restored', async () => {
    const { member, discussionId, currentOutcomeId } = await stage()
    const paths = [
      `/references/discussion/${discussionId}`,
      `/references/outcome/${currentOutcomeId}`,
      `/discussions/${discussionId}/backlinks`,
    ]
    await app.db.execute(
      sql`UPDATE discussions SET trashed_at = now() WHERE id = ${discussionId}::uuid`,
    )
    try {
      for (const path of paths) {
        const refused = await member.browser.json(path, 'GET')
        expectStatus(refused, 404, `${path} is a missing target while trashed (spec 7.24)`)
        expect(refused.body).not.toContain('zanzibar')
      }
      expect(await search(member, 'zanzibar')).toEqual([])
    } finally {
      await app.db.execute(
        sql`UPDATE discussions SET trashed_at = NULL WHERE id = ${discussionId}::uuid`,
      )
    }
    for (const path of paths) {
      const back = await member.browser.json(path, 'GET')
      expectStatus(back, 200, `${path} resolves again once restored (spec 7.24)`)
    }
  })
})
