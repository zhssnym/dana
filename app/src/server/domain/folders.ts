/*
The P2 domain module: folders and membership per spec 7.4, the 5.3 and 5.4
tables, R-CLEAN, ownership transfer (8.9), the deletion transaction (8.8),
and the 8.11 counts. Routes validate and serialize; every decision that
touches rows is here, behind the 10.2 rule that no query leaves this file
without being scoped to the viewer or to a folder the caller has already
resolved access on.

Results are discriminated unions rather than thrown statuses, so the route
layer owns the mapping onto 7.0's taxonomy and this file stays testable
without HTTP.
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { Folder } from '../../shared/folders.js'
import { inTransaction, rowsOf } from './db.js'
import type { Executor } from './db.js'

/* ------------------------------------------------------------------ *
 * Serialization
 * ------------------------------------------------------------------ */

/** Timestamps leave the drivers as Date on both backends; the wire format
 * is the ISO instant either way. */
function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/* ------------------------------------------------------------------ *
 * Access resolution: the 10.2 chokepoint fact
 * ------------------------------------------------------------------ */

export interface FolderAccess {
  isOwner: boolean
  isDefault: boolean
}

/** Null means the folder does not exist or the viewer is not a member,
 * which 10.2 makes the same answer: 404, never 403.
 *
 * The executor rather than the handle, so a caller inside a transaction
 * resolves access against the same snapshot it will write in; P3's task
 * moves need exactly that, and every Db is an Executor. */
export async function accessOf(
  executor: Executor,
  viewerId: string,
  folderId: string,
): Promise<FolderAccess | null> {
  const found = await rowsOf(
    executor,
    sql`SELECT (f.owner_id = ${viewerId}) AS is_owner, f.is_default
        FROM folders f
        JOIN folder_members m ON m.folder_id = f.id
        WHERE f.id = ${folderId} AND m.user_id = ${viewerId}`,
  )
  const row = found[0]
  if (row === undefined) return null
  return { isOwner: row.is_owner === true, isDefault: row.is_default === true }
}

/* ------------------------------------------------------------------ *
 * The Folder object (7.0) and the 7.4 list
 * ------------------------------------------------------------------ */

function folderFromRow(row: Record<string, unknown>): Folder {
  return {
    id: String(row.id),
    name: String(row.name),
    is_default: row.is_default === true,
    is_owner: row.is_owner === true,
    member_count: Number(row.member_count),
    counts: {
      pending: Number(row.pending),
      completed: Number(row.completed),
    },
    my_label: nullableString(row.my_label),
    my_color: nullableString(row.my_color),
  }
}

/** One query serves the list and the single view: the membership join is
 * the scope (10.2), label and color ride the viewer's own row (4.4), and
 * the counts are 8.11's, abandoned on neither side. */
function folderSelect(viewerId: string, folderId?: string) {
  const scope =
    folderId === undefined ? sql`` : sql` AND f.id = ${folderId}`
  return sql`
    SELECT f.id, f.name, f.is_default,
           (f.owner_id = ${viewerId}) AS is_owner,
           m.label AS my_label, m.color AS my_color,
           (SELECT count(*)::int FROM folder_members mm
             WHERE mm.folder_id = f.id) AS member_count,
           (SELECT count(*)::int FROM tasks t
             WHERE t.folder_id = f.id AND t.status = 'pending') AS pending,
           (SELECT count(*)::int FROM tasks t
             WHERE t.folder_id = f.id AND t.status = 'completed') AS completed
    FROM folder_members m
    JOIN folders f ON f.id = m.folder_id
    WHERE m.user_id = ${viewerId}${scope}
    ORDER BY f.is_default DESC, lower(f.name) ASC, f.id ASC`
}

/** GET /folders, in 7.4's order: is_default first, then lower(name), id. */
export async function listFolders(db: Db, viewerId: string): Promise<Folder[]> {
  const found = await rowsOf(db, folderSelect(viewerId))
  return found.map(folderFromRow)
}

export async function folderView(
  db: Db,
  viewerId: string,
  folderId: string,
): Promise<Folder | null> {
  const found = await rowsOf(db, folderSelect(viewerId, folderId))
  const row = found[0]
  return row === undefined ? null : folderFromRow(row)
}

/* ------------------------------------------------------------------ *
 * POST /folders
 * ------------------------------------------------------------------ */

export type CreateFolderResult =
  | { kind: 'created'; folder: Folder }
  | { kind: 'folder_cap' }

/** The 10.3 cap counts custom folders only; the guard is an API guard, so
 * it reads before the transaction rather than locking anything. */
export async function createFolder(
  db: Db,
  viewerId: string,
  name: string,
): Promise<CreateFolderResult> {
  const owned = await rowsOf(
    db,
    sql`SELECT count(*)::int AS n FROM folders
        WHERE owner_id = ${viewerId} AND NOT is_default`,
  )
  if (Number(owned[0]?.n ?? 0) >= 200) return { kind: 'folder_cap' }

  // 7.4: folder plus owner membership, one transaction.
  const id = await inTransaction(db, async (tx) => {
    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO folders (owner_id, name)
          VALUES (${viewerId}::uuid, ${name})
          RETURNING id`,
    )
    const folderId = String(inserted[0]?.id)
    await tx.execute(
      sql`INSERT INTO folder_members (folder_id, user_id)
          VALUES (${folderId}::uuid, ${viewerId}::uuid)`,
    )
    return folderId
  })

  return {
    kind: 'created',
    folder: {
      id,
      name,
      is_default: false,
      is_owner: true,
      member_count: 1,
      counts: { pending: 0, completed: 0 },
      my_label: null,
      my_color: null,
    },
  }
}

/* ------------------------------------------------------------------ *
 * PATCH /folders/:id (rename; caller has resolved owner access)
 * ------------------------------------------------------------------ */

export async function renameFolder(
  db: Db,
  folderId: string,
  name: string,
): Promise<void> {
  await db.execute(
    sql`UPDATE folders SET name = ${name} WHERE id = ${folderId}`,
  )
}

/* ------------------------------------------------------------------ *
 * DELETE /folders/:id (caller has resolved owner access, non-default)
 * ------------------------------------------------------------------ */

export interface DeletedCounts {
  tasks_open: number
  tasks_completed: number
  tasks_abandoned: number
}

/** 8.8: count for the confirmation response, then delete the folder row and
 * let the named cascades do the rest, one transaction. The counts and the
 * delete share the transaction so the response can never describe rows the
 * delete did not remove. */
export async function deleteFolder(
  db: Db,
  folderId: string,
): Promise<DeletedCounts> {
  return inTransaction(db, async (tx) => {
    const counts = (
      await rowsOf(
        tx,
        sql`SELECT
              (count(*) FILTER (WHERE status = 'pending'))::int AS open,
              (count(*) FILTER (WHERE status = 'completed'))::int AS completed,
              (count(*) FILTER (WHERE status = 'abandoned'))::int AS abandoned
            FROM tasks WHERE folder_id = ${folderId}`,
      )
    )[0]
    await tx.execute(sql`DELETE FROM folders WHERE id = ${folderId}`)
    return {
      tasks_open: Number(counts?.open ?? 0),
      tasks_completed: Number(counts?.completed ?? 0),
      tasks_abandoned: Number(counts?.abandoned ?? 0),
    }
  })
}

/* ------------------------------------------------------------------ *
 * PATCH /folders/:id/my-membership (caller has resolved membership)
 * ------------------------------------------------------------------ */

export interface MyMembershipPatch {
  label?: string | null
  color?: string | null
}

/** Any subset semantics from the shared schema: absent leaves the column
 * alone, null clears it (4.4 stores null for both). An empty patch is a
 * no-op by construction. */
export async function setMyMembership(
  db: Db,
  viewerId: string,
  folderId: string,
  patch: MyMembershipPatch,
): Promise<void> {
  const sets = []
  if (patch.label !== undefined) sets.push(sql`label = ${patch.label}`)
  if (patch.color !== undefined) sets.push(sql`color = ${patch.color}`)
  if (sets.length === 0) return
  await db.execute(
    sql`UPDATE folder_members SET ${sql.join(sets, sql`, `)}
        WHERE folder_id = ${folderId} AND user_id = ${viewerId}`,
  )
}

/* ------------------------------------------------------------------ *
 * GET /folders/:id composition
 * ------------------------------------------------------------------ */

export interface MemberElement {
  user: {
    id: string
    display_name: string | null
    avatar_url: string | null
  }
  role: string
  joined_at: string
  is_owner: boolean
}

export interface PendingInviteElement {
  id: string
  email: string
  task_id: string | null
  created_at: string
  last_sent_at: string
}

/** 7.4's members array. The user object is 7.0's person shape (id,
 * display_name, avatar_url), the TaskCard-assignee object, per the shape
 * review's ruling: 7.3's roster email is the contract's explicit
 * exception, and the 9.x sharing panel never renders a member's address.
 * is_owner derives from folders.owner_id, the single ownership source
 * (4.3, 8.9). Ordered by join instant then id, section 6's tie-break
 * convention. */
export async function membersOf(
  db: Db,
  folderId: string,
): Promise<MemberElement[]> {
  const found = await rowsOf(
    db,
    sql`SELECT u.id, u.display_name, u.avatar_url,
               m.role, m.created_at AS joined_at,
               (m.user_id = f.owner_id) AS is_owner
        FROM folder_members m
        JOIN folders f ON f.id = m.folder_id
        JOIN users u ON u.id = m.user_id
        WHERE m.folder_id = ${folderId}
        ORDER BY m.created_at ASC, u.id ASC`,
  )
  return found.map((row) => ({
    user: {
      id: String(row.id),
      display_name: nullableString(row.display_name),
      avatar_url: nullableString(row.avatar_url),
    },
    role: String(row.role),
    joined_at: toIso(row.joined_at),
    is_owner: row.is_owner === true,
  }))
}

export async function pendingInvitesOf(
  db: Db,
  folderId: string,
): Promise<PendingInviteElement[]> {
  const found = await rowsOf(
    db,
    sql`SELECT id, email, task_id, created_at, last_sent_at
        FROM invites
        WHERE folder_id = ${folderId} AND status = 'pending'
        ORDER BY created_at ASC, id ASC`,
  )
  return found.map((row) => ({
    id: String(row.id),
    email: String(row.email),
    task_id: nullableString(row.task_id),
    created_at: toIso(row.created_at),
    last_sent_at: toIso(row.last_sent_at),
  }))
}

/* ------------------------------------------------------------------ *
 * POST /folders/:id/members
 * ------------------------------------------------------------------ */

export type AddMemberResult =
  | { kind: 'added'; targetEmail: string | null }
  | { kind: 'default_folder' }
  | { kind: 'already_member' }
  | { kind: 'not_connected' }
  | { kind: 'member_cap' }

/*
The 5.3 add row, guards in 7.4's order: 409 default folder, 409 already
member, 422 no roster connection between the actor and the target (the
actor's roster, not the folder's collective one), 422 at the 25 cap. The
insert itself is ON CONFLICT DO NOTHING so a raced double add resolves at
the primary key rather than as an unhandled unique violation: zero rows
back means this caller lost and is told what the sequential caller would
be told, already a member (INV-10). A nonexistent target holds no roster
connection with anyone, so it answers through the connection guard, and
nothing here leaks whether the id names a real account.

The guards and the insert are one transaction behind a lock on the folder
row, which they were not when this landed at P2. The P3 shape review found
the 50-step cap counting without one and the Steward routed the same finding
here, where it is the worse of the two: these statements were not in a
transaction at all, so nothing tied the count to the insert, and the reason
P2 went green anyway is that ON CONFLICT answers the only race the suite
runs. AC-021 races two members adding the same person, and the primary key
settles that one whatever the count said. Two members adding two different
people to a folder holding 24 both read 24, both pass, and both insert,
leaving 26 against a number 10.3 calls server-enforced, and no acceptance run
can show it: PGlite is single-connection (11.15).

The lock is the folder row, which is what "this folder's membership set" is
named by, and it is taken as the first statement of the transaction. Removal
does not take it, deliberately: the cap guards additions, a concurrent
removal can only free a slot, and the drop-to-one sweep of R-CLEAN reasons
about a folder that has fewer members rather than more. The one ordering that
matters is against 8.9's transfer, which takes the same folder row before it
touches any membership row, so the two agree on order and queue rather than
deadlock.
*/
export async function addMember(
  db: Db,
  actorId: string,
  folderId: string,
  targetId: string,
  access: FolderAccess,
): Promise<AddMemberResult> {
  // The default-folder refusal reads no row: INV-2 fixes is_default at
  // creation and no endpoint moves it, so this answer cannot go stale inside
  // the transaction it precedes.
  if (access.isDefault) return { kind: 'default_folder' }

  return inTransaction(db, async (tx) => {
    await tx.execute(
      sql`SELECT 1 FROM folders WHERE id = ${folderId} FOR UPDATE`,
    )

    const already = await rowsOf(
      tx,
      sql`SELECT 1 AS present FROM folder_members
          WHERE folder_id = ${folderId} AND user_id = ${targetId}`,
    )
    if (already.length > 0) return { kind: 'already_member' }

    const connected = await rowsOf(
      tx,
      sql`SELECT 1 AS present FROM connections
          WHERE user_a_id = least(${actorId}::uuid, ${targetId}::uuid)
            AND user_b_id = greatest(${actorId}::uuid, ${targetId}::uuid)`,
    )
    if (connected.length === 0) return { kind: 'not_connected' }

    const count = await rowsOf(
      tx,
      sql`SELECT count(*)::int AS n FROM folder_members
          WHERE folder_id = ${folderId}`,
    )
    if (Number(count[0]?.n ?? 0) >= 25) return { kind: 'member_cap' }

    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO folder_members (folder_id, user_id)
          VALUES (${folderId}::uuid, ${targetId}::uuid)
          ON CONFLICT DO NOTHING
          RETURNING user_id`,
    )
    if (inserted.length === 0) return { kind: 'already_member' }

    // The share-grant email goes to the target's address (5.3). A null can
    // only mean a soft-deleted account, whose connections 8.10 removes, so
    // the row is a belt for a state that should not exist; the caller skips
    // the send rather than mailing nobody.
    const target = await rowsOf(
      tx,
      sql`SELECT email FROM users
          WHERE id = ${targetId} AND deleted_at IS NULL`,
    )
    return { kind: 'added', targetEmail: nullableString(target[0]?.email) }
  })
}

/* ------------------------------------------------------------------ *
 * DELETE /folders/:id/members/:userId
 * ------------------------------------------------------------------ */

export async function isMember(
  db: Db,
  folderId: string,
  userId: string,
): Promise<boolean> {
  const found = await rowsOf(
    db,
    sql`SELECT 1 AS present FROM folder_members
        WHERE folder_id = ${folderId} AND user_id = ${userId}`,
  )
  return found.length > 0
}

export async function otherMemberCount(
  db: Db,
  folderId: string,
  excludingUserId: string,
): Promise<number> {
  const found = await rowsOf(
    db,
    sql`SELECT count(*)::int AS n FROM folder_members
        WHERE folder_id = ${folderId} AND user_id <> ${excludingUserId}`,
  )
  return Number(found[0]?.n ?? 0)
}

/*
R-CLEAN (5.3), with the 8.9 transfer riding ahead of it on the owner-leave
shape, one transaction for the lot:

1. Owner leave only: hand folders.owner_id to the remaining member with
   the earliest join instant, ties to the lower user id. Both keys are the
   database's own ordering, which is what makes least() in the acceptance
   harness and this ORDER BY agree on uuids.
2. Unassign the leaver's tasks in the folder, no status carve-out. The
   membership delete's composite FK would do this too (4.5); 8.8 does it
   anyway, so the row is deterministic rather than a side effect.
3. Delete the leaver's My Day entries for this folder's tasks, theirs
   alone.
4. Delete the membership row.
5. When exactly one member remains, assign every unassigned task in the
   folder to them, every status (INV-5 says every task), which sweeps up
   the rows step 2 just freed.

The leaver's pending invites for the folder stay standing (5.3).
*/
export async function removeMembership(
  db: Db,
  folderId: string,
  leaverId: string,
  options: { transferOwnership: boolean },
): Promise<void> {
  await inTransaction(db, async (tx) => {
    if (options.transferOwnership) {
      await transferOwnership(tx, folderId, leaverId)
    }

    await tx.execute(
      sql`UPDATE tasks SET assignee_id = NULL, updated_at = now()
          WHERE folder_id = ${folderId} AND assignee_id = ${leaverId}`,
    )
    await tx.execute(
      sql`DELETE FROM my_day_entries
          WHERE user_id = ${leaverId}
            AND task_id IN (SELECT id FROM tasks WHERE folder_id = ${folderId})`,
    )
    await tx.execute(
      sql`DELETE FROM folder_members
          WHERE folder_id = ${folderId} AND user_id = ${leaverId}`,
    )

    const remaining = await rowsOf(
      tx,
      sql`SELECT user_id FROM folder_members WHERE folder_id = ${folderId}`,
    )
    const only = remaining.length === 1 ? remaining[0] : undefined
    if (only !== undefined) {
      await tx.execute(
        sql`UPDATE tasks SET assignee_id = ${String(only.user_id)}, updated_at = now()
            WHERE folder_id = ${folderId} AND assignee_id IS NULL`,
      )
    }
  })
}

/** 8.9, both callers' rule: earliest folder_members.created_at, ties to
 * the lower user id; owner_id is the one thing that changes, the new
 * owner's membership row is untouched and role stays 'member'. */
async function transferOwnership(
  tx: Executor,
  folderId: string,
  departingOwnerId: string,
): Promise<void> {
  const successor = await rowsOf(
    tx,
    sql`SELECT user_id FROM folder_members
        WHERE folder_id = ${folderId} AND user_id <> ${departingOwnerId}
        ORDER BY created_at ASC, user_id ASC
        LIMIT 1`,
  )
  const heir = successor[0]
  if (heir === undefined) {
    // The route guards this with the sole-member 409; reaching here means
    // the guard was bypassed, and violating INV-2's RESTRICT is worse.
    throw new Error(`folder ${folderId} has no member to transfer to (8.9)`)
  }
  await tx.execute(
    sql`UPDATE folders SET owner_id = ${String(heir.user_id)}
        WHERE id = ${folderId}`,
  )
}
