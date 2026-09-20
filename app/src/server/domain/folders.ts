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
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { FolderAccessPreset } from '../../shared/folder-access.js'
import type { Folder } from '../../shared/folders.js'
import type { LabelRef } from '../../shared/labels.js'
import type { ResponsibilityDocument } from '../../shared/responsibility.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'
import {
  folderActorFacts,
  lockedMembership,
  otherFullControlCount,
  presetOf,
  recordAccessTransition,
} from './folder-access.js'
import type { FolderActorFacts } from './folder-access.js'
import { folderPersonalLabelsFor } from './labels.js'
import {
  createInitialResponsibility,
  endResponsibilityStanding,
} from './responsibility.js'
import { ensureShelf } from './shelves.js'

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

/**
 * What every call site of `accessOf` has always had -- ownership, the default
 * flag and the folder's name, which the share-grant email renders (RFC 0005
 * change control item 32) -- plus, since issue #228, the member's persisted
 * Access preset and the two ids the resolver needs.
 *
 * It *is* `FolderActorFacts` rather than a shape of its own, so that the
 * twenty-odd existing gates can hand what they already resolved straight to
 * `mayPerform` without a second read and without a conversion that could
 * lose a field.
 */
export type FolderAccess = FolderActorFacts

/** Null means the folder does not exist, is in Trash, or the viewer is not a
 * member, which 10.2 makes the same answer: 404, never 403.
 *
 * The executor rather than the handle, so a caller inside a transaction
 * resolves access against the same snapshot it will write in; P3's task
 * moves need exactly that, and every Db is an Executor.
 *
 * The body moved to `domain/folder-access.ts` at issue #228. The name stays
 * here because twenty-two call sites across twelve files spell it, and
 * because "resolve the folder" and "decide the action" are two steps that
 * should keep two names. */
export async function accessOf(
  executor: Executor,
  viewerId: string,
  folderId: string,
): Promise<FolderAccess | null> {
  return folderActorFacts(executor, viewerId, folderId)
}

/* ------------------------------------------------------------------ *
 * The Folder object (7.0) and the 7.4 list
 * ------------------------------------------------------------------ */

function folderFromRow(
  row: Record<string, unknown>,
  personalLabels: LabelRef[],
): Folder {
  /* The viewer's own preset (7.4's amendment of 2026-09-20, Hassan's Ruling 4
     on issue #228). It is read exactly as `membersOf` reads a member's: from
     the column, through `presetOf`, and refused rather than defaulted when it
     is unreadable, because every default here would be a guess about
     authority. The row it comes from is `m`, which `folderSelect` joins on
     `m.user_id = viewerId` -- the *viewer's* membership and never the
     owner's, which is the confusion this field invites and AC-674 exists to
     refuse. */
  const myAccess = presetOf(row.my_access)
  if (myAccess === null) {
    throw new Error(
      `folder_members.access holds an unknown preset for the viewer of folder ${String(row.id)}`,
    )
  }
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
    my_shelf: nullableString(row.my_shelf),
    /* The same value under the key an old bundle reads, for the deploy
       window `shared/folders.ts` describes: one column, two keys, and #247
       drops this one. It is read from `my_shelf`'s own source rather than
       from `folder_members.label`, so the two can never disagree on the wire
       even if the expand half's second write were ever to lapse. */
    my_label: nullableString(row.my_shelf),
    my_color: nullableString(row.my_color),
    my_access: myAccess,
    /* The M1 Label projection (issue #226): the viewer's own Personal Labels
       on this folder, and never a Folder Label, which classifies the tasks in
       its folder rather than the folder (#208 R4). */
    personal_labels: personalLabels,
    icon: nullableString(row.icon),
    color: nullableString(row.color),
    cover_file_id: nullableString(row.cover_file_id),
    cover_preset: nullableString(row.cover_preset),
    cover_focal_y: Number(row.cover_focal_y ?? 50),
    description: nullableString(row.description),
  }
}

/** One query serves the list and the single view: the membership join is
 * the scope (10.2), shelf, color and Access ride the viewer's own row (4.4),
 * and the counts are 8.11's, abandoned on neither side.
 *
 * **`m` is the viewer's membership and nothing else.** The `WHERE
 * m.user_id = <viewer>` below is what makes that true, and it is the whole of
 * why `my_access` costs no extra read: this query already had the row the
 * preset lives on. The mistake the field invites is reading the *owner's*
 * preset instead — `is_owner` sits two lines above it and comes from
 * `f.owner_id` — which would answer the same value to everybody in the folder
 * and would be invisible on a folder whose owner happens to hold Full control,
 * which is most of them. AC-674 drives two members at two presets through this
 * query in one folder for exactly that reason. */
function folderSelect(viewerId: string, folderId?: string) {
  const scope =
    folderId === undefined ? sql`` : sql` AND f.id = ${folderId}`
  return sql`
    SELECT f.id, f.name, f.is_default,
           (f.owner_id = ${viewerId}) AS is_owner,
           f.icon, f.color, f.cover_file_id, f.cover_preset, f.cover_focal_y,
           f.description,
           m.shelf_name AS my_shelf, m.color AS my_color,
           m.access AS my_access,
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

/**
 * Both reads' second statement, and the reason there is exactly one of them.
 *
 * A folder carries many Personal Labels, so joining them into the select
 * above would multiply its rows and every count inside it would then have to
 * be de-duplicated. The ids the first statement produced go to
 * `folderPersonalLabelsFor` in one batch instead, which is the same seam
 * `readCards` uses for tasks: two statements for a list of any length, never
 * one per row (issue #226, AC-474).
 */
async function withPersonalLabels(
  db: Db,
  viewerId: string,
  rows: Record<string, unknown>[],
): Promise<Folder[]> {
  const labels = await folderPersonalLabelsFor(
    db,
    viewerId,
    rows.map((row) => String(row.id)),
  )
  return rows.map((row) => folderFromRow(row, labels.get(String(row.id)) ?? []))
}

/** GET /folders, in 7.4's order: is_default first, then lower(name), id. */
export async function listFolders(db: Db, viewerId: string): Promise<Folder[]> {
  return withPersonalLabels(db, viewerId, await rowsOf(db, folderSelect(viewerId)))
}

export async function folderView(
  db: Db,
  viewerId: string,
  folderId: string,
): Promise<Folder | null> {
  const found = await rowsOf(db, folderSelect(viewerId, folderId))
  if (found.length === 0) return null
  const [folder] = await withPersonalLabels(db, viewerId, found)
  return folder ?? null
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

The description is written by this insert and not by a PATCH behind it (7.4's
dated paragraph of 2026-09-04, issues #21 and #70): making a folder is one
request, which AC-279 states on the wire — states rather than checks, its test file
having gone in the 2026-09-20 cut — and the sentence a new folder opens
with has to arrive in it. Defaulted to null so the callers that name only a
folder keep the NULL every folder made before this carries.

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
  description: string | null = null,
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
      sql`INSERT INTO folders (owner_id, name, description)
          VALUES (${viewerId}::uuid, ${name}, ${description})
          RETURNING id`,
    )
    const id = String(inserted[0]?.id)
    /* R8A and R5: the creator starts owner *and* Full control, and the two
       are separate facts from this line onward -- the owner may later be
       lowered, and a Full-control member who is not the owner may later
       exist. The transition is written in the same transaction as the
       membership, which is R9 section 3's atomicity rule, and it is
       `created_owner` rather than `member_added` so that the Folder's very
       first standing is distinguishable in history from a grant somebody
       made afterwards. */
    await tx.execute(
      sql`INSERT INTO folder_members (folder_id, user_id, access)
          VALUES (${id}::uuid, ${viewerId}::uuid, 'full_control')`,
    )
    await recordAccessTransition(tx, {
      folderId: id,
      memberId: viewerId,
      previousAccess: null,
      newAccess: 'full_control',
      actorId: viewerId,
      transition: 'created_owner',
    })
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
        my_shelf: null,
        my_label: null,
        my_color: null,
        /* The membership this transaction just wrote, spelled as the literal
           it is rather than read back: the `INSERT INTO folder_members` above
           names `full_control` and the creator is the only member there is. It is
           the creator's *own* preset, which is what `my_access` means
           everywhere (7.4's amendment of 2026-09-20), and here the creator,
           the owner and the sole member are one person -- which is exactly
           the case in which the owner-versus-viewer confusion is invisible,
           so nothing about this line is evidence the projection is right.
           AC-674 asks the question on a shared folder. */
        my_access: 'full_control',
        personal_labels: [],
        icon: null,
        color: null,
        cover_file_id: null,
        cover_preset: null,
        cover_focal_y: 50,
        description,
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
    /* **This gate takes no copy, and 7.19's rule 1 is stated over folders
       anyway.** The clause below requires the named file to be a file *of
       this folder*, so a folder's cover is already a `cover` or an `image` in
       the page's own scope and there is nothing for `coverFileFor` to
       normalise; nor can a folder cover suffer the fault the copy exists to
       close, since you cannot leave a folder and still be looking at its
       page. 7.19 says the rule for all three page kinds regardless, against
       the day this clause widens: whoever widens it adds the copy here in the
       same change, or a folder cover starts breaking the way a shelf's used
       to (issue #116). */
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
  /** The Shelf this folder sits on for this viewer. `label` until issue #226
   * renamed it with its column; the concept never moved. */
  shelf?: string | null
  color?: string | null
}

/**
 * Any subset semantics from the shared schema: absent leaves the column
 * alone, null clears it (4.4 stores null for both). An empty patch is a
 * no-op by construction.
 *
 * **A shelf name written here names a shelf, and makes it if there is not one
 * (issue #65).** 4.18's membership *is* this column, and its own sentence is
 * that the API holds the membership and the shelf's name in step in one
 * transaction; `patchShelf` and `deleteShelf` have always done that in their
 * direction and this is the direction that was missing. Without it a person
 * can hold a folder group the Library draws as a heading with nothing behind
 * it: no id, so no `/app/shelves/:id` to link to, no page, no mark and none
 * of 9.10's acts. The one-off repair for the memberships already stored is
 * migration 0011; this is what stops the state being reachable again.
 *
 * Clearing the membership leaves the shelf standing, which is deliberate and
 * is 9.1's model since S17b: "a shelf outlives its folders", the shelf being
 * the thing and this column its membership. Taking the last folder off a
 * shelf therefore empties it rather than deleting it, exactly as it already
 * did for a shelf made through 7.16.
 *
 * The UPDATE and the INSERT ride one transaction so that a folder never
 * carries a membership whose shelf is not there.
 *
 * The field was called `label` on both sides until issue #226. It is the same
 * rule; #208's Label model needed the word back.
 *
 * **The write goes to two columns for one release, and the second one is not
 * redundant.** Migration 0022 is the expand half of an expand-and-contract
 * pair: `shelf_name` is the column this code reads, and `label` is still
 * there because Render runs the old instance until the new one is healthy, so
 * for the length of a deploy something is still selecting `label` and needs
 * to see current data rather than a stale membership. Issue #247 drops the
 * column and this second assignment together, after 0022 is live.
 */
export async function setMyMembership(
  db: Db,
  viewerId: string,
  folderId: string,
  patch: MyMembershipPatch,
): Promise<void> {
  const sets: SQL[] = []
  if (patch.shelf !== undefined) {
    sets.push(sql`shelf_name = ${patch.shelf}`)
    // The expand half's second write, #247 removes it.
    sets.push(sql`label = ${patch.shelf}`)
  }
  if (patch.color !== undefined) sets.push(sql`color = ${patch.color}`)
  if (sets.length === 0) return
  const shelf = patch.shelf
  await inTransaction(db, async (tx) => {
    await tx.execute(
      sql`UPDATE folder_members SET ${sql.join(sets, sql`, `)}
          WHERE folder_id = ${folderId} AND user_id = ${viewerId}`,
    )
    if (typeof shelf === 'string') await ensureShelf(tx, viewerId, shelf)
  })
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
  /** The member's current Access preset (issue #228, R8A). */
  access: FolderAccessPreset
  joined_at: string
  is_owner: boolean
}

export interface PendingInviteElement {
  id: string
  email: string
  task_id: string | null
  /** The Access preset this invite will grant on acceptance (R9 section 5).
   * Member-administration data, and the route shows the whole element to
   * Full control alone. */
  access: FolderAccessPreset | null
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
               m.role, m.access, m.created_at AS joined_at,
               (m.user_id = f.owner_id) AS is_owner
        FROM folder_members m
        JOIN folders f ON f.id = m.folder_id
        JOIN users u ON u.id = m.user_id
        WHERE m.folder_id = ${folderId}
        ORDER BY m.created_at ASC, u.id ASC`,
  )
  return found.map((row) => {
    const access = presetOf(row.access)
    if (access === null) {
      throw new Error(
        `folder_members.access holds an unknown preset in ${folderId}`,
      )
    }
    return {
      user: {
        id: String(row.id),
        display_name: nullableString(row.display_name),
        avatar_url: nullableString(row.avatar_url),
      },
      role: String(row.role),
      /* Issue #228: the member's current Access preset, Folder-visible to
         every member under R9 section 13. `role` stays beside it and stays
         'member': it expressed no authority before this and expresses none
         now, and removing a column from a frozen response is not this
         change's to make. */
      access,
      joined_at: toIso(row.joined_at),
      is_owner: row.is_owner === true,
    }
  })
}

export async function pendingInvitesOf(
  db: Db,
  folderId: string,
): Promise<PendingInviteElement[]> {
  const found = await rowsOf(
    db,
    sql`SELECT id, email, task_id, access, created_at, last_sent_at
        FROM invites
        WHERE folder_id = ${folderId} AND status = 'pending'
        ORDER BY created_at ASC, id ASC`,
  )
  return found.map((row) => ({
    id: String(row.id),
    email: String(row.email),
    task_id: nullableString(row.task_id),
    access: presetOf(row.access),
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
  /** The Access preset the administrator chose for the new member. R9
   * section 6 makes it explicit and required: a direct add records
   * `null -> preset` with the adding administrator as actor, and there is no
   * default, because a default here would be one person's authority chosen
   * by nobody. The route's schema refuses a body without it. */
  granted: FolderAccessPreset,
  /** Issue #230's optional initial Responsibility content. Absent means the
   * member arrives with no document at all: R10 forbids fabricating one, and
   * `createInitialResponsibility` refuses a canonically empty payload for the
   * same reason, so an explicit empty document writes nothing either. */
  initialResponsibility?: ResponsibilityDocument,
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
      sql`INSERT INTO folder_members (folder_id, user_id, access)
          VALUES (${folderId}::uuid, ${targetId}::uuid, ${granted})
          ON CONFLICT DO NOTHING
          RETURNING user_id`,
    )
    if (inserted.length === 0) return { kind: 'already_member' }

    // R9 section 6, in the same transaction as the grant it describes.
    await recordAccessTransition(tx, {
      folderId,
      memberId: targetId,
      previousAccess: null,
      newAccess: granted,
      actorId,
      transition: 'member_added',
    })

    /* R10 and #230: the initial document and the membership standing commit
       together, and the actor recorded on the first revision is the
       **administrator** who chose the content rather than the person it
       describes. That is R9 section 5's rule about Access read across to
       Responsibility, and AC-569 reads exactly this row back. */
    if (initialResponsibility !== undefined) {
      await createInitialResponsibility(
        tx,
        folderId,
        targetId,
        actorId,
        initialResponsibility,
        access.name,
      )
    }

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
    /* R9 section 9: the end of active membership is `current preset -> null`,
       written before the row is deleted because the row is where the current
       preset lives. The actor distinguishes the two directions of the same
       change -- the departing member for a leave, the administrator for a
       removal -- exactly as 4.13's two verbs do a few lines below.

       The read is not locked here on purpose. Every path that can change this
       row concurrently -- demote, remove, leave -- goes through the route
       gates added at issue #228, which take the folder row `FOR UPDATE`
       first; and the history row is about a membership this transaction is
       deleting, so a lost update would take the membership with it. */
    const standing = await rowsOf(
      tx,
      sql`SELECT access FROM folder_members
          WHERE folder_id = ${folderId} AND user_id = ${leaverId}`,
    )
    const heldAccess = presetOf(standing[0]?.access)
    if (heldAccess !== null) {
      await recordAccessTransition(tx, {
        folderId,
        memberId: leaverId,
        previousAccess: heldAccess,
        newAccess: null,
        actorId: options.actorId,
        transition:
          options.actorId === leaverId ? 'member_left' : 'member_removed',
      })
    }
    await runRClean(tx, folderId, leaverId, { actorId: options.actorId })
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
  /** Who ended this membership. Defaults to the leaver, which is true of the
   * two callers that do not name one: an ordinary leave, and 8.10's account
   * deletion, where the person ending every membership they hold is the
   * person deleting their own account. */
  options: { actorId?: string } = {},
): Promise<void> {
  /*
  R10, issue #230: "current active Responsibility standing ends in the same
  governed membership operation". It is written here rather than in
  `removeMembership` **because of where 8.10 enters**: account deletion step 4
  does not call `removeMembership` at all, it calls this function once per
  surviving membership, so a hook on the caller would have covered a leave and
  a removal and silently missed every account deletion. The same reasoning the
  header above already gives for R-CLEAN living here rather than being copied
  into the deletion module, applied to one more duty.

  And 8.10 is the case that cannot be got right by accident: step 7 *scrubs*
  the `users` row rather than deleting it, so no `ON DELETE` clause on a user
  foreign key ever fires for an account deletion — a cascade would have left
  the standing open forever and a person would keep appearing as an active
  Responsibility holder in a folder they are no longer in. Nothing here relies
  on one. The document and its revisions stay exactly where they are, which is
  R10's other half: history survives the membership it describes, and #230
  forbids scrubbing from fabricating a different historical actor.
  */
  await endResponsibilityStanding(
    tx,
    folderId,
    leaverId,
    options.actorId ?? leaverId,
  )
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

/* ------------------------------------------------------------------ *
 * Access administration (issue #228, #209 R8A / R9)
 * ------------------------------------------------------------------ */

export type ChangeAccessResult =
  | { kind: 'changed'; previous: FolderAccessPreset; next: FolderAccessPreset }
  /** The named person is not a member of this folder. */
  | { kind: 'not_member' }
  /** The target already holds the requested preset, so nothing changed and
   * nothing is recorded. R9 section 10's rule about ownership transfer not
   * fabricating a `Full control -> Full control` entry is the same rule read
   * from the other end: a transition record describes a change. */
  | { kind: 'unchanged'; access: FolderAccessPreset }
  /** `expected_access` was sent and does not match the authoritative current
   * value: another administrator got there first (R9 section 16). */
  | { kind: 'stale'; actual: FolderAccessPreset }
  /** The target is the structural owner and the actor is not: #228's
   * ownership rules forbid a Full-control member from demoting the owner. */
  | { kind: 'target_is_owner' }
  /** The change would leave the folder with no active human Full-control
   * member (R5's continuity invariant). */
  | { kind: 'would_strand' }

/**
 * Change one member's Access, atomically with its history row.
 *
 * This is R9 section 16's list of things the *same transaction* must enforce,
 * in its order: the affected member is still active, the old preset matches
 * authoritative current state, the owner restriction applies, the
 * last-Full-control-human invariant holds, then the write, then the append.
 * The actor's own authority is checked by the route through `mayPerform`
 * before this is called, and is re-read here only where the rule is about
 * *who the actor is relative to the target*, which the preset ladder cannot
 * express.
 *
 * The folder row is locked first, before any membership row is read. Every
 * other operation that can move a membership -- add, remove, leave, transfer
 * -- takes the same row in the same order, so they queue rather than
 * deadlock, and two racing Access changes serialize instead of both recording
 * a transition claiming the same `from`.
 *
 * Self-demotion is admitted here and distinguished in history: R9 section 8
 * asks for `self_demoted` where the actor is the affected member, because
 * "Omar lowered Sarah" and "Sarah lowered herself" are different facts about
 * the same row.
 */
export async function changeMemberAccess(
  db: Db,
  actorId: string,
  folderId: string,
  targetId: string,
  next: FolderAccessPreset,
  options: { expected?: FolderAccessPreset } = {},
): Promise<ChangeAccessResult> {
  return inTransaction(db, async (tx) => {
    await tx.execute(
      sql`SELECT 1 FROM folders WHERE id = ${folderId} FOR UPDATE`,
    )
    const target = await lockedMembership(tx, folderId, targetId)
    if (target === null) return { kind: 'not_member' } as const

    if (options.expected !== undefined && options.expected !== target.access) {
      return { kind: 'stale', actual: target.access } as const
    }
    if (target.access === next) {
      return { kind: 'unchanged', access: target.access } as const
    }
    /* #228's ownership rules: the owner's Access is the owner's. A
       Full-control member may administer every other member and not this
       one, which is what keeps
       a lowered owner's custody anchor from being administered away by the
       people they delegated to. */
    if (target.isOwner && targetId !== actorId) {
      return { kind: 'target_is_owner' } as const
    }
    /* R5's continuity invariant, and it binds self-demotion as much as
       anything else: an owner may lower their own Access only when another
       human Full-control member exists, which is this same count. */
    if (
      target.access === 'full_control' &&
      (await otherFullControlCount(tx, folderId, targetId)) === 0
    ) {
      return { kind: 'would_strand' } as const
    }

    await tx.execute(
      sql`UPDATE folder_members SET access = ${next}
          WHERE folder_id = ${folderId} AND user_id = ${targetId}`,
    )
    await recordAccessTransition(tx, {
      folderId,
      memberId: targetId,
      previousAccess: target.access,
      newAccess: next,
      actorId,
      transition: targetId === actorId ? 'self_demoted' : 'access_changed',
    })
    const named = await rowsOf(
      tx,
      sql`SELECT f.name,
                 (SELECT u.display_name FROM users u WHERE u.id = ${targetId})
                   AS target_name
          FROM folders f WHERE f.id = ${folderId}`,
    )
    /* The generic history line R9 section 12 permits: a projection of the
       structured transition above, never a second authoritative copy. 4.13's
       verb list is a CHECK constraint, so this rides 'edited' with the
       predicate in `detail`, exactly as a member's arrival does. */
    await recordEvent(tx, {
      actorId,
      verb: 'edited',
      subjectKind: 'folder',
      subjectId: folderId,
      subjectName: String(named[0]?.name ?? ''),
      folderId,
      detail: `changed ${String(named[0]?.target_name ?? 'a member')}'s access to ${next}`,
      recipients: targetId === actorId ? undefined : [targetId],
    })
    return { kind: 'changed', previous: target.access, next } as const
  })
}

export type OwnerRecoveryResult =
  | { kind: 'recovered'; previous: FolderAccessPreset }
  | { kind: 'unchanged' }
  | { kind: 'not_member' }

/**
 * The structural owner restoring their own ordinary Access to Full control
 * (governing R5 "Owner Access may be restricted", #228's ownership rules,
 * R9 section 8).
 *
 * It exists as its own act, rather than as a Full-control member granting
 * themselves something, because the recovery anchor has to work precisely
 * when there is nobody left willing to grant it. The route checks
 * `owner.custody_recovery`, which is owner-only and reads no preset at all,
 * so an owner who lowered themselves to Can view can always climb back and
 * nobody else can climb for them.
 *
 * The transition kind is distinct for R9 section 8's stated reason: ordinary
 * History must show a recovery as a recovery rather than as a normal manager
 * grant whose grantor nobody can find.
 */
export async function recoverOwnerFullControl(
  db: Db,
  ownerId: string,
  folderId: string,
): Promise<OwnerRecoveryResult> {
  return inTransaction(db, async (tx) => {
    await tx.execute(
      sql`SELECT 1 FROM folders WHERE id = ${folderId} FOR UPDATE`,
    )
    const held = await lockedMembership(tx, folderId, ownerId)
    if (held === null) return { kind: 'not_member' } as const
    if (held.access === 'full_control') return { kind: 'unchanged' } as const
    await tx.execute(
      sql`UPDATE folder_members SET access = 'full_control'
          WHERE folder_id = ${folderId} AND user_id = ${ownerId}`,
    )
    await recordAccessTransition(tx, {
      folderId,
      memberId: ownerId,
      previousAccess: held.access,
      newAccess: 'full_control',
      actorId: ownerId,
      transition: 'owner_recovered_full_control',
    })
    const named = await rowsOf(
      tx,
      sql`SELECT name FROM folders WHERE id = ${folderId}`,
    )
    await recordEvent(tx, {
      actorId: ownerId,
      verb: 'edited',
      subjectKind: 'folder',
      subjectId: folderId,
      subjectName: String(named[0]?.name ?? ''),
      folderId,
      detail: 'restored Full control using owner recovery',
    })
    return { kind: 'recovered', previous: held.access } as const
  })
}

/**
 * Whether `userId` currently holds Full control of `folderId`, which is the
 * M1 successor-eligibility test (R6 section 2: an active human Folder member
 * who is currently Full control).
 *
 * "Human" is every member in M1; the note on `otherFullControlCount` says
 * where that has to be taught otherwise when AI members arrive.
 */
export async function isEligibleSuccessor(
  executor: Executor,
  folderId: string,
  userId: string,
): Promise<boolean> {
  const found = await rowsOf(
    executor,
    sql`SELECT 1 AS present FROM folder_members
        WHERE folder_id = ${folderId} AND user_id = ${userId}
          AND access = 'full_control'`,
  )
  return found.length > 0
}

export interface OwnedSharedFolder {
  id: string
  name: string
  hasEligibleSuccessor: boolean
}

/**
 * The shared folders this account owns that somebody else is still in, with
 * whether each has an eligible successor.
 *
 * `DELETE /me` reads this before it does anything, because R6 section 3 makes
 * interactive account deletion resolve every owned shared Folder *first* --
 * choose a successor, transfer explicitly, then delete -- rather than letting
 * the deletion silently promote whoever happened to join earliest. The
 * default folder is excluded: INV-2 never lets one transfer and INV-3 never
 * lets one hold a second member, so it is nobody's to succeed to.
 */
export async function ownedSharedFolders(
  executor: Executor,
  ownerId: string,
): Promise<OwnedSharedFolder[]> {
  const found = await rowsOf(
    executor,
    sql`SELECT f.id, f.name,
               EXISTS (SELECT 1 FROM folder_members s
                        WHERE s.folder_id = f.id AND s.user_id <> ${ownerId}
                          AND s.access = 'full_control') AS heir
        FROM folders f
        WHERE f.owner_id = ${ownerId} AND NOT f.is_default
          AND f.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM folder_members m
                       WHERE m.folder_id = f.id AND m.user_id <> ${ownerId})
        ORDER BY lower(f.name) ASC, f.id ASC`,
  )
  return found.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    hasEligibleSuccessor: row.heir === true,
  }))
}
