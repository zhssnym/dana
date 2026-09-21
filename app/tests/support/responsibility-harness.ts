/*
Fixtures for AC-560 to AC-573, issue #230's twenty-four required proofs of the
Responsibility document, its revisions and the member-details read contract
(#209 R5 / R7 section O / R10 / R10B).

It sits beside `folder-access-harness.ts` and reuses it rather than repeating
it: a Responsibility criterion nearly always starts from #228's shape -- a
folder, an owner, a member at a chosen preset -- and then adds one thing.

**Setup goes through the API wherever the API is the thing under test**, the
folders-harness rule, with one deliberate exception recorded at its
definition. Reads of what was *recorded* go to the table rather than to a
route, for R9 section 12's reason read across to R10: the append-only record
is the authority and the routes are renderings of it, so a criterion about
what happened asks the record, and a criterion about who may see it drives the
route.
*/
import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import type { Db } from '../../db/client.js'
import type {
  ResponsibilityDocument,
  ResponsibilityTransition,
} from '../../src/shared/responsibility.js'
import { expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { rows } from './helpers.js'
import type { RawResponse } from './http-client.js'

/* ------------------------------------------------------------------ *
 * Building documents
 * ------------------------------------------------------------------ */

/** A one-paragraph document, which is what most cases need. */
export function paragraph(text: string): ResponsibilityDocument {
  return {
    version: 1,
    blocks: [{ kind: 'paragraph', content: { version: 1, runs: [{ text }] } }],
  }
}

/** A document using every block kind and every inline mark the composer has,
 * for the round-trip proof. */
export function richDocument(): ResponsibilityDocument {
  return {
    version: 1,
    blocks: [
      {
        kind: 'heading',
        level: 2,
        content: { version: 1, runs: [{ text: 'Site safety' }] },
      },
      {
        kind: 'paragraph',
        content: {
          version: 1,
          runs: [
            { text: 'Owns the ' },
            { text: 'weekly', bold: true },
            { text: ' walk-round, see ' },
            { text: 'the checklist', href: '/folders/checklist' },
            { text: ' and ' },
            { text: 'the standard', href: 'https://example.test/standard' },
            { text: '.', italic: true },
          ],
        },
      },
      {
        kind: 'bullet',
        depth: 0,
        content: { version: 1, runs: [{ text: 'Scaffold inspections' }] },
      },
      {
        kind: 'bullet',
        depth: 1,
        content: { version: 1, runs: [{ text: 'Tags renewed on Mondays' }] },
      },
    ],
  }
}

/* ------------------------------------------------------------------ *
 * The Responsibility surface
 * ------------------------------------------------------------------ */

export function readResponsibility(
  actor: Actor,
  folderId: string,
  memberId: string,
): Promise<RawResponse> {
  return actor.browser.json(
    `/folders/${folderId}/members/${memberId}/responsibility`,
    'GET',
  )
}

export interface Standing {
  responsibility_id: string | null
  revision: string
  current_revision_id: string | null
  revision_no: number
  content: ResponsibilityDocument | null
  updated_at: string | null
  updated_by: { id: string } | null
  active: boolean
}

/** The current standing, asserted 200 and parsed. */
export async function standingOf(
  actor: Actor,
  folderId: string,
  memberId: string,
): Promise<Standing> {
  const response = await readResponsibility(actor, folderId, memberId)
  expectStatus(
    response,
    200,
    'GET /folders/:id/members/:userId/responsibility must answer a member (#209 R5: Folder-visible in M1)',
  )
  const body = response.json() as { responsibility: Standing }
  return body.responsibility
}

/** PUT the document, unjudged. `base` defaults to the caller's own current
 * revision, which is what an ordinary editor sends. */
export function putResponsibility(
  actor: Actor,
  folderId: string,
  memberId: string,
  content: ResponsibilityDocument,
  base: string,
): Promise<RawResponse> {
  return actor.browser.json(
    `/folders/${folderId}/members/${memberId}/responsibility`,
    'PUT',
    { content, base_revision: base },
  )
}

export interface CommitAnswer {
  committed: boolean
  responsibility: Standing
}

/** PUT against the current revision, asserted 200, reading the base first so
 * the caller does not have to. */
export async function commitOk(
  actor: Actor,
  folderId: string,
  memberId: string,
  content: ResponsibilityDocument,
): Promise<CommitAnswer> {
  const before = await standingOf(actor, folderId, memberId)
  const response = await putResponsibility(
    actor,
    folderId,
    memberId,
    content,
    before.revision,
  )
  expectStatus(
    response,
    200,
    'PUT /folders/:id/members/:userId/responsibility must commit for an authorized actor (#209 R10)',
  )
  return response.json() as CommitAnswer
}

export function setSelfEditGrant(
  actor: Actor,
  folderId: string,
  memberId: string,
  enabled: boolean,
): Promise<RawResponse> {
  return actor.browser.json(
    `/folders/${folderId}/members/${memberId}/self-edit-grant`,
    'PUT',
    { enabled },
  )
}

export async function setSelfEditGrantOk(
  actor: Actor,
  folderId: string,
  memberId: string,
  enabled: boolean,
): Promise<void> {
  const response = await setSelfEditGrant(actor, folderId, memberId, enabled)
  expectStatus(
    response,
    200,
    'PUT /folders/:id/members/:userId/self-edit-grant must answer Full control (#209 R7 section O)',
  )
}

export function readResponsibilityHistory(
  actor: Actor,
  folderId: string,
  memberId: string,
): Promise<RawResponse> {
  return actor.browser.json(
    `/folders/${folderId}/members/${memberId}/responsibility/history`,
    'GET',
  )
}

export function readMemberDetails(
  actor: Actor,
  folderId: string,
  memberId: string,
): Promise<RawResponse> {
  return actor.browser.json(`/folders/${folderId}/members/${memberId}`, 'GET')
}

/* ------------------------------------------------------------------ *
 * The record, read from the table
 * ------------------------------------------------------------------ */

export interface RecordEntry {
  id: string
  member_id: string
  responsibility_id: string | null
  transition: ResponsibilityTransition
  revision_no: number | null
  content: unknown
  content_hash: string | null
  actor_id: string
  effective_at: string
}

/**
 * The folder's Responsibility record, oldest first, read from the table.
 *
 * From the table rather than through the route for R9 section 12's reason
 * read across to R10: the record is the authority and the routes render it,
 * so a criterion about what was recorded asks the record. AC-570 drives the
 * route separately, which is the different question of who may read it.
 */
export async function recordOf(
  db: Db,
  folderId: string,
  memberId?: string,
): Promise<RecordEntry[]> {
  const scope =
    memberId === undefined ? sql`` : sql` AND member_id = ${memberId}::uuid`
  const found = await rows(
    db,
    sql`SELECT id, member_id, responsibility_id, transition, revision_no,
               content, content_hash, actor_id, effective_at
          FROM folder_responsibility_history
         WHERE folder_id = ${folderId}::uuid${scope}
         ORDER BY effective_at ASC, id ASC`,
  )
  return found.map((row) => ({
    id: String(row.id),
    member_id: String(row.member_id),
    responsibility_id:
      row.responsibility_id === null || row.responsibility_id === undefined
        ? null
        : String(row.responsibility_id),
    transition: String(row.transition) as ResponsibilityTransition,
    revision_no:
      row.revision_no === null || row.revision_no === undefined
        ? null
        : Number(row.revision_no),
    content: row.content ?? null,
    content_hash:
      row.content_hash === null || row.content_hash === undefined
        ? null
        : String(row.content_hash),
    actor_id: String(row.actor_id),
    effective_at: String(row.effective_at),
  }))
}

/** Only the entries carrying a content snapshot: R10's revisions proper. */
export function revisionsOf(entries: readonly RecordEntry[]): RecordEntry[] {
  return entries.filter((entry) => entry.revision_no !== null)
}

export function transitionsOf(
  entries: readonly RecordEntry[],
): ResponsibilityTransition[] {
  return entries.map((entry) => entry.transition)
}

/**
 * Writes `count` grant-toggle entries straight into the record, stamped one
 * second apart into the future so that they are unambiguously the newest.
 *
 * **A fixture rather than an act, and the one thing in this file that writes
 * the record without going through a route.** The cap on the history read is
 * 200, and a case that drives it through the API would be 200 HTTP round
 * trips to prove an ordering; the toggles carry no content and no revision
 * number, so nothing about a document's own immutability is being faked here.
 * The entry each one imitates is the one the grant route really writes.
 */
export async function seedGrantEntries(
  db: Db,
  folderId: string,
  memberId: string,
  actorId: string,
  count: number,
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const transition =
      index % 2 === 0 ? 'self_edit_granted' : 'self_edit_revoked'
    await db.execute(
      sql`INSERT INTO folder_responsibility_history
            (folder_id, member_id, responsibility_id, transition, actor_id,
             effective_at)
          VALUES (${folderId}::uuid, ${memberId}::uuid, NULL, ${transition},
                  ${actorId}::uuid,
                  now() + (${String(index + 1)} || ' seconds')::interval)`,
    )
  }
}

/** The current document row, read from the table. */
export interface DocumentRow {
  id: string
  content: unknown
  content_hash: string
  current_revision_no: number
  updated_by: string
  ended_at: string | null
}

export async function documentRows(
  db: Db,
  folderId: string,
  memberId?: string,
): Promise<DocumentRow[]> {
  const scope =
    memberId === undefined ? sql`` : sql` AND member_id = ${memberId}::uuid`
  const found = await rows(
    db,
    sql`SELECT id, content, content_hash, current_revision_no, updated_by,
               ended_at
          FROM folder_responsibilities
         WHERE folder_id = ${folderId}::uuid${scope}
         ORDER BY created_at ASC, id ASC`,
  )
  return found.map((row) => ({
    id: String(row.id),
    content: row.content ?? null,
    content_hash: String(row.content_hash),
    current_revision_no: Number(row.current_revision_no),
    updated_by: String(row.updated_by),
    ended_at:
      row.ended_at === null || row.ended_at === undefined
        ? null
        : String(row.ended_at),
  }))
}

/** The stored self-edit grant, read from the column rather than from any
 * projection: a projection is the thing #209 says must never authorize. */
export async function storedGrant(
  db: Db,
  folderId: string,
  userId: string,
): Promise<boolean | null> {
  const found = await rows(
    db,
    sql`SELECT can_edit_own_responsibilities FROM folder_members
         WHERE folder_id = ${folderId}::uuid AND user_id = ${userId}::uuid`,
  )
  const row = found[0]
  if (row === undefined) return null
  return row.can_edit_own_responsibilities === true
}

/**
 * Writes the self-edit grant straight into the column, bypassing the route.
 *
 * **Used for exactly one thing: giving the grant to somebody the route would
 * refuse to give it to**, which in M1 is the structural owner -- R7 section M
 * keeps the owner's own standing out of another administrator's hands, so
 * AC-563's proof that the grant widens nothing cannot reach "the owner holds
 * the grant" through the endpoint.
 *
 * It writes no record entry, deliberately. These are fixtures rather than
 * acts, and AC-563 makes every toggle it *reads* through the route that
 * records one.
 */
export async function forceGrant(
  db: Db,
  folderId: string,
  userId: string,
  enabled: boolean,
): Promise<void> {
  await db.execute(
    sql`UPDATE folder_members SET can_edit_own_responsibilities = ${enabled}
         WHERE folder_id = ${folderId}::uuid AND user_id = ${userId}::uuid`,
  )
}

/** A compact rendering, so a failure says what the record holds rather than
 * dumping objects. */
export function shapeOf(entry: RecordEntry): string {
  return `${entry.transition}#${String(entry.revision_no ?? '-')}`
}

export function expectDocumentsEqual(
  actual: unknown,
  expected: ResponsibilityDocument,
  why: string,
): void {
  expect(actual, why).toEqual(expected)
}
