/*
Fixtures for the AC-510 to AC-523 criteria, which are issue #228's twenty-five
required proofs of the Folder Access model (#209 R8A / R9 / R10B).

**Why a harness rather than per-file setup.** Nearly every one of those
criteria needs the same shape: a folder owned by one person, with one other
person in it at a chosen preset, and often a task assigned to one of them.
Written per file that is fourteen copies of a five-step dance -- connect the
roster, create the folder, add the member, set their preset -- and a
difference between two copies would read as a difference between two
criteria.

**Setup goes through the API wherever the API is the thing under test**, the
folders-harness rule. Presets arrive through `POST /folders/:id/members` and
`PATCH /folders/:id/members/:userId`, both of which are #228's own surface, so
a broken grant fails the criterion that is about grants rather than silently
producing a row no endpoint would write. The one exception is
`forcePreset`, which writes the column directly and says at its definition
exactly why it must exist.
*/
import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import type { Db } from '../../db/client.js'
import type {
  FolderAccessPreset,
  FolderAccessTransition,
} from '../../src/shared/folder-access.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { rows } from './helpers.js'
import type { RawResponse } from './http-client.js'

/* ------------------------------------------------------------------ *
 * Building a folder with people in it
 * ------------------------------------------------------------------ */

/**
 * A shared folder owned by `owner`, with every entry of `members` admitted at
 * the preset it names.
 *
 * The roster connection is made first because `POST /folders/:id/members`
 * refuses a target the actor has no connection with (5.3 row 1), which is a
 * guard about people rather than about Access and would otherwise fail every
 * case here for the wrong reason.
 */
export async function sharedFolder(
  app: AuthTestApp,
  owner: Actor,
  name: string,
  members: readonly (readonly [Actor, FolderAccessPreset])[] = [],
): Promise<string> {
  const folderId = await createFolder(owner, name)
  for (const [member, access] of members) {
    await connect(app.db, owner.id, member.id)
    await addMemberOk(owner, folderId, member.id, access)
  }
  return folderId
}

/**
 * Writes a membership's preset straight into the column, bypassing the API.
 *
 * **Used for exactly one thing: putting the *actor* at a preset the API would
 * refuse to leave them at.** The continuity invariant will not let the last
 * Full-control member be demoted, and the owner cannot be demoted by anybody
 * else, so a case that needs "the owner, holding Can view" cannot reach that
 * state through `PATCH /folders/:id/members/:userId` without first inventing a
 * second administrator it is not about.
 *
 * It writes no history row, deliberately. These are fixtures rather than
 * acts, and AC-522 -- the criterion that is about history -- makes every
 * transition it reads through the endpoint that records one.
 */
export async function forcePreset(
  db: Db,
  folderId: string,
  userId: string,
  access: FolderAccessPreset,
): Promise<void> {
  await db.execute(
    sql`UPDATE folder_members SET access = ${access}
        WHERE folder_id = ${folderId}::uuid AND user_id = ${userId}::uuid`,
  )
}

/** The preset a membership row currently holds, read from the column rather
 * than from any projection: a projection is the thing #209 says must never
 * authorize, so a criterion about what somebody may do reads the truth. */
export async function storedPreset(
  db: Db,
  folderId: string,
  userId: string,
): Promise<string | null> {
  const found = await rows(
    db,
    sql`SELECT access FROM folder_members
        WHERE folder_id = ${folderId}::uuid AND user_id = ${userId}::uuid`,
  )
  const row = found[0]
  return row === undefined ? null : String(row.access)
}

/* ------------------------------------------------------------------ *
 * The Access-administration surface
 * ------------------------------------------------------------------ */

/** PATCH /folders/:id/members/:userId, unjudged. */
export function setAccess(
  actor: Actor,
  folderId: string,
  targetId: string,
  access: FolderAccessPreset,
  expected?: FolderAccessPreset,
): Promise<RawResponse> {
  return actor.browser.json(
    `/folders/${folderId}/members/${targetId}`,
    'PATCH',
    expected === undefined ? { access } : { access, expected_access: expected },
  )
}

export async function setAccessOk(
  actor: Actor,
  folderId: string,
  targetId: string,
  access: FolderAccessPreset,
): Promise<void> {
  const response = await setAccess(actor, folderId, targetId, access)
  expectStatus(
    response,
    200,
    `PATCH /folders/:id/members/:userId must set ${access} for an authorized administrator (issue #228, R9 section 7)`,
  )
}

/** POST /folders/:id/owner-recovery, unjudged. */
export function recoverOwnership(
  actor: Actor,
  folderId: string,
): Promise<RawResponse> {
  return actor.browser.json(`/folders/${folderId}/owner-recovery`, 'POST', {})
}

/** POST /folders/:id/transfer-ownership, unjudged. */
export function transferOwnership(
  actor: Actor,
  folderId: string,
  toUserId: string,
): Promise<RawResponse> {
  return actor.browser.json(
    `/folders/${folderId}/transfer-ownership`,
    'POST',
    { to: toUserId },
  )
}

/* ------------------------------------------------------------------ *
 * Access history
 * ------------------------------------------------------------------ */

export interface HistoryEntry {
  member_id: string
  previous_access: string | null
  new_access: string | null
  actor_id: string | null
  transition: string
  effective_at: string
}

/**
 * The folder's Access history read **from the table**, oldest first.
 *
 * Read from the table rather than through `GET /folders/:id/access-history`
 * on purpose: the route is one reader of this record and R9 section 12 is
 * explicit that the record is the authority and the renderings are not, so a
 * criterion about what was recorded asks the record. AC-522 drives the route
 * separately, which is a different question -- who may read it.
 */
export async function historyOf(
  db: Db,
  folderId: string,
  memberId?: string,
): Promise<HistoryEntry[]> {
  const scope =
    memberId === undefined ? sql`` : sql` AND member_id = ${memberId}::uuid`
  const found = await rows(
    db,
    sql`SELECT member_id, previous_access, new_access, actor_id, transition,
               effective_at
        FROM folder_access_history
        WHERE folder_id = ${folderId}::uuid${scope}
        ORDER BY effective_at ASC, id ASC`,
  )
  return found.map((row) => ({
    member_id: String(row.member_id),
    previous_access:
      row.previous_access === null || row.previous_access === undefined
        ? null
        : String(row.previous_access),
    new_access:
      row.new_access === null || row.new_access === undefined
        ? null
        : String(row.new_access),
    actor_id:
      row.actor_id === null || row.actor_id === undefined
        ? null
        : String(row.actor_id),
    transition: String(row.transition),
    effective_at: String(row.effective_at),
  }))
}

/** A compact `from -> to (kind, by)` rendering, so a failure message says
 * what the history actually holds rather than dumping objects. */
export function shapeOf(entry: HistoryEntry): string {
  return `${entry.previous_access ?? 'null'} -> ${entry.new_access ?? 'null'} (${entry.transition})`
}

export function transitionsOf(
  entries: readonly HistoryEntry[],
): FolderAccessTransition[] {
  return entries.map((entry) => entry.transition as FolderAccessTransition)
}

/* ------------------------------------------------------------------ *
 * Driving one mutation per preset
 * ------------------------------------------------------------------ */

/** A folder-scoped task, created by the owner and assigned where asked. */
export async function taskIn(
  owner: Actor,
  folderId: string,
  title: string,
  assigneeId: string | null,
): Promise<string> {
  const made = await owner.browser.json('/tasks', 'POST', {
    title,
    folder_id: folderId,
    assignee_id: assigneeId,
  })
  expectStatus(made, 201, `the owner creates ${title} (spec 7.6)`)
  const body = made.json() as { id?: unknown }
  expect(typeof body.id, 'the 201 body opens with the task id').toBe('string')
  return body.id as string
}
