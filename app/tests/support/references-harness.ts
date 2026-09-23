/*
The fixture the five Dana Link criteria share (issue #223, AC-424 to AC-428).

**One fixture rather than five, and the reason is the thing being proved.**
Every one of those criteria is a statement about two people looking at the
same rows: what the viewer gets, and what somebody with no relationship to
them gets for the very same id. Five files each building their own pair of
accounts would be five chances for the two halves to drift apart — a stranger
who is accidentally a member, a "secret" folder nobody actually owns — and
each drift would make a criterion pass while measuring nothing. Built once,
the same nine ids are addressed by every file.

The naming rule below is worth one sentence because it is load-bearing:
**every row carries `NEEDLE` in its name, the accessible and the inaccessible
alike.** A search scoped correctly and a search that found nothing at all look
identical unless the rows it must not return would have matched. So the
stranger's folder, task and shelf are all named with the same needle the
viewer's are.

Each criterion file still boots its own application and signs its own cast in,
which is how every file in this suite works; what is shared is the shape of
the fixture and the two transports, not the state.
*/
import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import type { RawResponse } from './http-client.js'
import { seedViewTask } from './views-harness.js'

/** Mid-word in every name below, so a prefix-anchored match finds none of
 * them and a search that leans on the index rather than on the predicate
 * fails loudly. */
export const NEEDLE = 'danalinkneedle'

export const REFERENCE_CAST = ['viewer', 'stranger'] as const
export const REFERENCE_PREFIX = 'r223'

export interface ReferenceStage {
  viewer: Actor
  /** Signed in, connected to nobody, a member of nothing of the viewer's. */
  stranger: Actor
  /** The viewer's folder, and the context a picker would be opened in. */
  contextFolderId: string
  /** A second folder of the viewer's, to tell "prioritised" from "only". */
  otherFolderId: string
  /** A task in each of those two. */
  contextTaskId: string
  otherTaskId: string
  /** The viewer's native Purpose facet, renamed to match NEEDLE (#211). */
  contextPurposeId: string
  /** The viewer's shelf. Shelves are private by construction (4.18). */
  shelfId: string
  /** The stranger's three, every one of them matching NEEDLE. */
  strangerFolderId: string
  strangerTaskId: string
  strangerPurposeId: string
  strangerShelfId: string
}

async function createShelf(actor: Actor, name: string): Promise<string> {
  const made = await actor.browser.json('/shelves', 'POST', { name })
  expectStatus(made, 201, `POST /shelves must create ${name} (spec 7.16)`)
  return String((made.json() as { id?: unknown }).id)
}

export async function stageReferences(
  app: AuthTestApp,
  cast: Cast,
): Promise<ReferenceStage> {
  const [viewer, stranger] = await cast.of(app)
  if (viewer === undefined || stranger === undefined) {
    throw new Error('the reference cast must produce a viewer and a stranger')
  }

  const contextFolderId = await createFolder(
    viewer,
    `r223 ${NEEDLE} context folder`,
  )
  const otherFolderId = await createFolder(
    viewer,
    `r223 ${NEEDLE} other folder`,
  )
  const strangerFolderId = await createFolder(
    stranger,
    `r223 ${NEEDLE} private folder`,
  )

  const contextTaskId = await seedViewTask(app.db, {
    folderId: contextFolderId,
    createdBy: viewer.id,
    assigneeId: viewer.id,
    title: `r223 ${NEEDLE} task in context`,
    // Deliberately the older of the two. Without a folder context the task
    // list is most-recently-touched first, so the task elsewhere leads;
    // supplying the context folder must put this one in front of it. That
    // contrast is what proves the `folder` parameter arrives and is read
    // (hard stop 3), and it cannot be proved by a fixture whose two tasks
    // are tied.
    updatedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  })
  const otherTaskId = await seedViewTask(app.db, {
    folderId: otherFolderId,
    createdBy: viewer.id,
    assigneeId: viewer.id,
    title: `r223 ${NEEDLE} task elsewhere`,
    updatedAt: new Date(Date.now() - 60_000).toISOString(),
  })
  const strangerTaskId = await seedViewTask(app.db, {
    folderId: strangerFolderId,
    createdBy: stranger.id,
    assigneeId: stranger.id,
    title: `r223 ${NEEDLE} private task`,
  })

  const purposeOf = async (folderId: string, name: string): Promise<string> => {
    const result = (await app.db.execute(
      sql`UPDATE folder_facets
              SET display_name = ${name}, updated_at = now()
            WHERE folder_id = ${folderId}::uuid AND kind = 'purpose'
            RETURNING id`,
    )) as unknown as { rows: { id: unknown }[] }
    const row = result.rows[0]
    if (row === undefined) throw new Error('the native Purpose facet must exist')
    return String(row.id)
  }
  const contextPurposeId = await purposeOf(
    contextFolderId,
    `r223 ${NEEDLE} purpose`,
  )
  const strangerPurposeId = await purposeOf(
    strangerFolderId,
    `r223 ${NEEDLE} private purpose`,
  )

  const shelfId = await createShelf(viewer, `r223 ${NEEDLE} shelf`)
  const strangerShelfId = await createShelf(
    stranger,
    `r223 ${NEEDLE} private shelf`,
  )

  return {
    viewer,
    stranger,
    contextFolderId,
    otherFolderId,
    contextTaskId,
    otherTaskId,
    contextPurposeId,
    shelfId,
    strangerFolderId,
    strangerTaskId,
    strangerPurposeId,
    strangerShelfId,
  }
}

/* ------------------------------------------------------------------ *
 * The two transports
 * ------------------------------------------------------------------ */

/** `GET /references/:kind/:id`, unjudged: most cases here are about the
 * refusal, so the status is the assertion rather than a precondition. */
export function resolveReference(
  actor: Actor,
  kind: string,
  id: string,
): Promise<RawResponse> {
  return actor.browser.json(`/references/${kind}/${id}`, 'GET')
}

/** `GET /references/search`, likewise unjudged. */
export function searchReferences(
  actor: Actor,
  q: string,
  folder?: string,
): Promise<RawResponse> {
  const scope = folder === undefined ? '' : `&folder=${folder}`
  return actor.browser.json(
    `/references/search?q=${encodeURIComponent(q)}${scope}`,
    'GET',
  )
}

export interface Summary extends Record<string, unknown> {
  kind: string
  id: string
  label: string
  path: string
}

/** The whole summary, key-exact. The absences are the contract — a folder,
 * an assignee or a due date appearing here would be the leak the feature
 * exists to refuse — so this is asserted on the key set rather than on the
 * four values alone. */
export function expectSummaryShape(value: unknown, source: string): Summary {
  expect(
    typeof value === 'object' && value !== null,
    `${source} must be a reference summary object`,
  ).toBe(true)
  const record = value as Record<string, unknown>
  expect(
    Object.keys(record).sort(),
    `${source} must carry kind, id, label and path and nothing else: a fifth key is metadata the picker never asked for (issue #223)`,
  ).toEqual(['id', 'kind', 'label', 'path'])
  return record as Summary
}

export function summariesOf(response: RawResponse, source: string): Summary[] {
  const body = response.json() as { results?: unknown }
  expect(Array.isArray(body.results), `${source} must answer a results array`).toBe(
    true,
  )
  return (body.results as unknown[]).map((row, index) =>
    expectSummaryShape(row, `${source} row ${String(index)}`),
  )
}

export function idsOf(summaries: readonly Summary[]): string[] {
  return summaries.map((summary) => summary.id)
}
