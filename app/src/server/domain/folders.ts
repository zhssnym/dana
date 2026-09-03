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
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'

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
  /** The folder's name, which the share-grant email renders and links a
   * person to (RFC 0005 change control item 32). It rides this read rather
   * than a second one because every share-grant call site resolves access
   * before it grants, and the row is already open in front of it. */
  name: string
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
    sql`SELECT (f.owner_id = ${viewerId}) AS is_owner, f.is_default, f.name
        FROM folders f
        JOIN folder_members m ON m.folder_id = f.id
        WHERE f.id = ${folderId} AND m.user_id = ${viewerId}
          AND f.deleted_at IS NULL`,
  )
  const row = found[0]
  if (row === undefined) return null
  return {
    isOwner: row.is_owner === true,
    isDefault: row.is_default === true,
    name: String(row.name),
  }
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
    icon: nullableString(row.icon),
    color: nullableString(row.color),
    cover_file_id: nullableString(row.cover_file_id),
    cover_preset: nullableString(row.cover_preset),
    cover_focal_y: Number(row.cover_focal_y ?? 50),
    description: nullableString(row.description),
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
           f.icon, f.color, f.cover_file_id, f.cover_preset, f.cover_focal_y,
           f.description,
           m.label AS my_label, m.color AS my_color,
           (SELECT count(*)::int FROM folder_members mm
             WHERE mm.folder_id = f.id) AS member_count,
           (SELECT count(*)::int FROM tasks t
             WHERE t.folder_id = f.id AND t.status = 'pending'
               AND t.deleted_at IS NULL) AS pending,
           (SELECT count(*)::int FROM tasks t
             WHERE t.folder_id = f.id AND t.status = 'completed'
               AND t.deleted_at IS NULL) AS completed
    FROM folder_members m
    JOIN folders f ON f.id = m.folder_id
    WHERE m.user_id = ${viewerId} AND f.deleted_at IS NULL${scope}
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

/*
The 10.3 cap counts custom folders only, the default one being INV-2's rather
than the account's to spend.

The count, the insert and the owner's membership row are one transaction
behind a lock, for the reason the P3 shape review gave for the other two caps
in this directory: nothing sits under this number either, so a count that is
not tied to its insert is a suggestion. Two creates arriving together at 199
both read 199 and both insert.

The lock is the owner's user row, because the set being counted is "the
folders this account owns" and the account is the only row that names it. The
folders themselves cannot be locked: the row that would break the cap is the
one neither caller has created yet. Nothing else in the system holds that row
while waiting on a folder, so it queues rather than deadlocks: 7.1's
provisioning inserts a user rather than locking one, PATCH /me takes it alone,
and 8.10 takes it last, after it is done with folders and memberships.
*/
export async function createFolder(
  db: Db,
  viewerId: string,
  name: string,
): Promise<CreateFolderResult> {
  return inTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT 1 FROM users WHERE id = ${viewerId} FOR UPDATE`)

    // Trashed folders are out of the count: a person who deleted their way
    // under the cap has done exactly what the cap asks of them, and the
    // purge would otherwise change what an account may do 30 days late.
    const owned = await rowsOf(
      tx,
      sql`SELECT count(*)::int AS n FROM folders
          WHERE owner_id = ${viewerId} AND NOT is_default
            AND deleted_at IS NULL`,
    )
    if (Number(owned[0]?.n ?? 0) >= 200) return { kind: 'folder_cap' }

    // 7.4: folder plus owner membership, one transaction, which this now
    // shares with the guard that admitted them.
    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO folders (owner_id, name)
          VALUES (${viewerId}::uuid, ${name})
          RETURNING id`,
    )
    const id = String(inserted[0]?.id)
    await tx.execute(
      sql`INSERT INTO folder_members (folder_id, user_id)
          VALUES (${id}::uuid, ${viewerId}::uuid)`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'created',
      subjectKind: 'folder',
      subjectId: id,
      subjectName: name,
      folderId: id,
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
        icon: null,
        color: null,
        cover_file_id: null,
        cover_preset: null,
        cover_focal_y: 50,
        description: null,
      },
    }
  })
}

/* ------------------------------------------------------------------ *
 * PATCH /folders/:id (rename; caller has resolved owner access)
 * ------------------------------------------------------------------ */

export interface FolderProfilePatch {
  name?: string
  icon?: string | null
  color?: string | null
  coverFileId?: string | null
  coverPreset?: string | null
  coverFocalY?: number
  description?: string | null
}

export type PatchProfileResult = 'patched' | 'cover_not_here'

/** The 7.4 rename and the 4.3 identity in one write, because they arrive
 * in one PATCH: the route has already split who may send what (name the
 * owner's, the dressing any member's, DES-225), and one mutation is one
 * event whichever fields it carried. A cover must be a file of this
 * folder's own, image-kinded, or the reference would smuggle a read. */
export async function patchFolderProfile(
  db: Db,
  actorId: string,
  folderId: string,
  patch: FolderProfilePatch,
): Promise<PatchProfileResult> {
  return inTransaction(db, async (tx) => {
    if (patch.coverFileId !== undefined && patch.coverFileId !== null) {
      const cover = await rowsOf(
        tx,
        sql`SELECT 1 AS present FROM files
            WHERE id = ${patch.coverFileId} AND folder_id = ${folderId}
              AND kind IN ('cover', 'image')`,
      )
      if (cover.length === 0) return 'cover_not_here' as const
    }
    const sets = []
    if (patch.name !== undefined) sets.push(sql`name = ${patch.name}`)
    if (patch.icon !== undefined) sets.push(sql`icon = ${patch.icon}`)
    if (patch.color !== undefined) sets.push(sql`color = ${patch.color}`)
    /* One source (4.3 as widened by item 58): a file arriving clears the
       preset and a preset arriving clears the file, so the client never has
       to send the null it means. */
    if (patch.coverFileId !== undefined) {
      sets.push(sql`cover_file_id = ${patch.coverFileId}`)
      if (patch.coverFileId !== null) sets.push(sql`cover_preset = NULL`)
    }
    if (patch.coverPreset !== undefined) {
      sets.push(sql`cover_preset = ${patch.coverPreset}`)
      if (patch.coverPreset !== null) sets.push(sql`cover_file_id = NULL`)
    }
    if (patch.coverFocalY !== undefined) {
      sets.push(sql`cover_focal_y = ${patch.coverFocalY}`)
    }
    if (patch.description !== undefined) {
      sets.push(sql`description = ${patch.description}`)
    }
    if (sets.length === 0) return 'patched' as const
    const named = await rowsOf(
      tx,
      sql`UPDATE folders SET ${sql.join(sets, sql`, `)}
          WHERE id = ${folderId} RETURNING name`,
    )
    // subject_name is the name at act time (4.13): after a rename, the new
    // one, the name the line will be read under.
    await recordEvent(tx, {
      actorId,
      verb: patch.name !== undefined ? 'renamed' : 'edited',
      subjectKind: 'folder',
      subjectId: folderId,
      subjectName: String(named[0]?.name ?? ''),
      folderId,
      detail: patch.name !== undefined ? undefined : 'changed the look',
    })
    return 'patched' as const
  })
}

/* ------------------------------------------------------------------ *
 * DELETE /folders/:id (caller has resolved owner access, non-default)
 * ------------------------------------------------------------------ */

export interface DeletedCounts {
  tasks_open: number
  tasks_completed: number
  tasks_abandoned: number
}

/** 8.8 as split by RFC 0005 (7.13): count for the confirmation response,
 * then mark the folder rather than delete it, one transaction. The named
 * cascades still do the rest, they just fire at the purge (11.7), and the
 * counts and the mark share the transaction so the response can never
 * describe rows the mark did not move. The members hear about it (4.14):
 * a shared folder disappearing without a word is the fan-out's clearest
 * case. */
export async function deleteFolder(
  db: Db,
  actorId: string,
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
            FROM tasks WHERE folder_id = ${folderId} AND deleted_at IS NULL`,
      )
    )[0]
    const marked = await rowsOf(
      tx,
      sql`UPDATE folders SET deleted_at = now()
          WHERE id = ${folderId} RETURNING name`,
    )
    await recordEvent(tx, {
      actorId,
      verb: 'deleted',
      subjectKind: 'folder',
      subjectId: folderId,
      subjectName: String(marked[0]?.name ?? ''),
      folderId,
      detail: 'moved to Trash for 30 days',
      recipients: await memberIdsOf(tx, folderId),
    })
    return {
      tasks_open: Number(counts?.open ?? 0),
      tasks_completed: Number(counts?.completed ?? 0),
      tasks_abandoned: Number(counts?.abandoned ?? 0),
    }
  })
}

/** The recipients of a folder-scoped fan-out (4.14); recordEvent drops the
 * actor from whatever this answers. */
export async function memberIdsOf(
  executor: Executor,
  folderId: string,
): Promise<string[]> {
  const rows = await rowsOf(
    executor,
    sql`SELECT user_id FROM folder_members WHERE folder_id = ${folderId}`,
  )
  return rows.map((row) => String(row.user_id))
}

/** The whole of 8.8's deletion once the counts are taken: one statement, and
 * the database's named cascades take memberships, tasks, and through tasks
 * the steps, My Day entries, reminders, and the pending invites carrying the
 * folder (5.2's folder-deleted row). It is a function rather than a line
 * inside deleteFolder because 8.10 step 3 deletes folders too, and one
 * sentence about what a folder deletion is should have one home.
 *
 * The executor rather than the handle: both callers already hold a
 * transaction, and 8.8 and 8.10 alike are all-or-nothing. */
export async function deleteFolderRow(
  tx: Executor,
  folderId: string,
): Promise<void> {
  await tx.execute(sql`DELETE FROM folders WHERE id = ${folderId}`)
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
      sql`SELECT email, display_name FROM users
          WHERE id = ${targetId} AND deleted_at IS NULL`,
    )
    // A member add has no verb of its own in 4.13; 'edited' carries it with
    // the half a verb cannot. No fan-out: 4.14 does not name the added
    // member and the 5.3 share-grant email is already their notice.
    const named = await rowsOf(
      tx,
      sql`SELECT name FROM folders WHERE id = ${folderId}`,
    )
    await recordEvent(tx, {
      actorId,
      verb: 'edited',
      subjectKind: 'folder',
      subjectId: folderId,
      subjectName: String(named[0]?.name ?? ''),
      folderId,
      detail: `added ${String(target[0]?.display_name ?? 'a member')}`,
    })
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
  options: { transferOwnership: boolean; actorId: string },
): Promise<void> {
  await inTransaction(db, async (tx) => {
    if (options.transferOwnership) {
      await transferOwnership(tx, folderId, leaverId)
    }
    await runRClean(tx, folderId, leaverId)
    // 'left' when the leaver acted, 'removed' when someone removed them
    // (4.13's two verbs for the two directions of the same row change).
    const named = await rowsOf(
      tx,
      sql`SELECT f.name,
                 (SELECT u.display_name FROM users u
                   WHERE u.id = ${leaverId}) AS leaver_name
          FROM folders f WHERE f.id = ${folderId}`,
    )
    const left = options.actorId === leaverId
    await recordEvent(tx, {
      actorId: options.actorId,
      verb: left ? 'left' : 'removed',
      subjectKind: 'folder',
      subjectId: folderId,
      subjectName: String(named[0]?.name ?? ''),
      folderId,
      detail: left
        ? undefined
        : `removed ${String(named[0]?.leaver_name ?? 'a member')}`,
      recipients: left ? undefined : [leaverId],
    })
  })
}

/*
R-CLEAN itself, taking the executor so its three callers share one
implementation: member removal, leave, and 8.10 step 4, which the P5
amendment records as "not new machinery but 5.3's R-CLEAN, run once per
remaining membership by the deletion transaction". A second copy inside the
account deletion module would be the thing AC-136 exists to catch, an
implementation that revokes memberships without the cleanup, or sweeps My Day
entries by user rather than by the folder's tasks.
*/
export async function runRClean(
  tx: Executor,
  folderId: string,
  leaverId: string,
): Promise<void> {
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
}

/** 8.9, both callers' rule: earliest folder_members.created_at, ties to
 * the lower user id; owner_id is the one thing that changes, the new
 * owner's membership row is untouched and role stays 'member'.
 *
 * Exported for the second caller 8.9 names, the account deletion transaction
 * of 8.10 step 2, which runs it inside the one transaction it owns. */
export async function transferOwnership(
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
