/*
The domain module for invites per spec 7.5, the 5.2 lifecycle table, V-INV
and the instant-share conversion of 8.7, and the acceptance transaction.
Routes validate and serialize; every decision that touches rows is here,
behind the 10.2 rule that nothing leaves this file without being scoped to
the viewer or to a folder the caller has already resolved access on.

Results are discriminated unions rather than thrown statuses, the folders
module's convention, so the route layer owns the mapping onto 7.0's taxonomy and this
file stays testable without HTTP.

Two rules are load-bearing here and are named where they act rather than
only in this header: the 10.3 member cap binds every membership 8.7 grants,
and a bare invite to an email already on the inviter's roster answers 409
(7.5's appended paragraph).
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import { accessOf, mayPerform, presetOf } from './folder-access.js'
import { projectOf, recordAccessTransition } from './folder-access.js'
import type { FolderAccessPreset } from '../../shared/folder-access.js'
import type { FolderActorFacts } from './folder-access.js'
import type { FolderAccess } from './folder-access.js'
import { inTransaction, rowsOf } from '../database.js'
import { recordEvent } from './events.js'
import { createInitialResponsibility } from './responsibility.js'
import { responsibilityDocument } from '../../shared/responsibility.js'
import type { ResponsibilityDocument } from '../../shared/responsibility.js'
import type { Executor } from '../database.js'

/** 10.3's members-per-folder limit, the number every 8.7 grant checks. It is
 * spelled here as well as in folders.ts because the two modules grant
 * membership by different paths and a constant imported across them would
 * still be two call sites; what must not differ is the number, and both
 * name 10.3. */
const MEMBER_CAP = 25

/** 5.2's resend guard, one resend per invite per 24 hours, anchored on
 * last_sent_at (10.4's per-invite line, which is a state guard rather than
 * the middleware rate limiting). */
const RESEND_WINDOW_HOURS = 24

/* ------------------------------------------------------------------ *
 * Serialization
 * ------------------------------------------------------------------ */

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/*
The invite as this surface reports it. 7.5 enumerates no element for
POST /invites' 201 body or for GET /invites/sent, and src/shared/invites.ts
stopped there deliberately, recording that the strongest candidate reading
is that the two are one object. This is that object: it satisfies the shared floor (an id) and carries the columns of
4.9 a client can act on.

folder_name rides beside folder_id because the pending list 7.5 does
enumerate carries the name rather than the id, and the inviter's own list
renders the same sentence about the same folder. accepted_by is deliberately
absent: it is a bare user id this surface offers no person shape for.
*/
export interface InviteElement {
  id: string
  email: string
  folder_id: string | null
  folder_name: string | null
  task_id: string | null
  status: string
  created_at: string
  last_sent_at: string
  responded_at: string | null
}

function inviteFromRow(row: Record<string, unknown>): InviteElement {
  return {
    id: String(row.id),
    email: String(row.email),
    folder_id: nullableString(row.folder_id),
    folder_name: nullableString(row.folder_name),
    task_id: nullableString(row.task_id),
    status: String(row.status),
    created_at: toIso(row.created_at),
    last_sent_at: toIso(row.last_sent_at),
    responded_at: row.responded_at === null ? null : toIso(row.responded_at),
  }
}

const INVITE_COLUMNS = sql`i.id, i.email, i.folder_id, f.name AS folder_name,
                           i.task_id, i.status, i.created_at, i.last_sent_at,
                           i.responded_at`

async function inviteElementById(
  executor: Executor,
  inviteId: string,
): Promise<InviteElement> {
  const found = await rowsOf(
    executor,
    sql`SELECT ${INVITE_COLUMNS}
        FROM invites i
        LEFT JOIN folders f ON f.id = i.folder_id
        WHERE i.id = ${inviteId}`,
  )
  const row = found[0]
  if (row === undefined) {
    // The row was written in this transaction; not finding it is a state the
    // contract has no shape for, and the precedent (the vanished
    // membership in the folders module) is to fail loudly rather than answer a degenerate body.
    throw new Error(`invite ${inviteId} vanished between insert and read`)
  }
  return inviteFromRow(row)
}

/** One invite, by id, in the element shape above. The route reads it after a
 * transition so a 200 answers what a fresh read would, the convention 7.1,
 * 7.2 and 7.4 each carry on their mutations; 7.5 names no body for
 * decline, cancel and resend. */
export async function inviteById(
  db: Db,
  inviteId: string,
): Promise<InviteElement> {
  return inviteElementById(db, inviteId)
}

/* ------------------------------------------------------------------ *
 * GET /invites/sent and GET /invites/pending
 * ------------------------------------------------------------------ */

/** 7.5: V's invites, newest first, any status. The order is the row's own
 * (created_at DESC, id DESC), the tie-break convention section 6 uses
 * everywhere a sequence must be total. */
export async function sentInvites(
  db: Db,
  inviterId: string,
): Promise<InviteElement[]> {
  const found = await rowsOf(
    db,
    sql`SELECT ${INVITE_COLUMNS}
        FROM invites i
        LEFT JOIN folders f ON f.id = i.folder_id
        WHERE i.inviter_id = ${inviterId}
        ORDER BY i.created_at DESC, i.id DESC`,
  )
  return found.map(inviteFromRow)
}

export interface PendingInviteForRecipient {
  id: string
  inviter: { id: string; display_name: string | null; avatar_url: string | null }
  folder_name: string | null
  created_at: string
}

/*
Q12, the login surface: invites addressed to the viewer's lowercased email
with status pending. The element is 7.5's, and its inviter is 7.0's person
shape: the id is there so the inviter's default face matches the one they
wear everywhere else (`shared/invites.ts`).

Scoped by the viewer's own address rather than by an id, because that is what
an invite names (4.9 stores an email, not a user), and it is why an account
whose address differs by one dot sees nothing: 8.7 makes matching equality
and nothing more.

Newest first, the sent list's order, so the two 7.5 lists read alike; 7.5
fixes an order for neither.
*/
export async function pendingInvitesFor(
  db: Db,
  viewerId: string,
): Promise<PendingInviteForRecipient[]> {
  const found = await rowsOf(
    db,
    sql`SELECT i.id, i.created_at, f.name AS folder_name,
               u.id AS inviter_id, u.display_name, u.avatar_url
        FROM invites i
        JOIN users me ON me.id = ${viewerId}
        JOIN users u ON u.id = i.inviter_id
        LEFT JOIN folders f ON f.id = i.folder_id
        WHERE i.status = 'pending'
          AND me.deleted_at IS NULL
          AND i.email = lower(me.email)
        ORDER BY i.created_at DESC, i.id DESC`,
  )
  return found.map((row) => ({
    id: String(row.id),
    inviter: {
      id: String(row.inviter_id),
      display_name: nullableString(row.display_name),
      avatar_url: nullableString(row.avatar_url),
    },
    folder_name: nullableString(row.folder_name),
    created_at: toIso(row.created_at),
  }))
}

/* ------------------------------------------------------------------ *
 * POST /invites: V-INV (8.7) and the conversion
 * ------------------------------------------------------------------ */

export interface CreateInviteInput {
  email: string
  folder_id?: string
  task_id?: string
  /** R9 section 5's intended preset. Present exactly when `folder_id` is;
   * the shared schema refuses every other combination. */
  access?: FolderAccessPreset
  /** Issue #230's optional initial Responsibility content, admitted only with
   * a folder. Absent means the member arrives with no document; R10 forbids
   * fabricating one. */
  responsibility?: ResponsibilityDocument
}

export type CreateInviteResult =
  /** Parked: 201 { invite }, and one invite email rides it (5.2). */
  | { kind: 'created'; invite: InviteElement; inviterName: string | null }
  /** The instant share of 8.7: 200, a membership now, no invite row, and a
   * share-grant email to the target. */
  | {
      kind: 'converted'
      folderId: string
      folderName: string
      targetId: string
      targetEmail: string | null
      assignedTaskId: string | null
      inviterName: string | null
    }
  | { kind: 'own_email' }
  | { kind: 'folder_not_found' }
  | { kind: 'default_folder' }
  /** Step 7: a tab has its project's people; the project is shared. */
  | { kind: 'already_member' }
  | { kind: 'task_not_in_folder' }
  | { kind: 'already_connected' }
  | { kind: 'duplicate'; existingId: string }
  | { kind: 'member_cap' }
  /** The folder is visible to the inviter and inviting into it is not theirs
   * to do (issue #228). */
  | { kind: 'forbidden'; reason: string }

/** The active account holding an address, if any. Soft-deleted rows are not
 * accounts: 4.1 scrubs the email at deletion, and 8.7 says "active user". */
async function activeUserByEmail(
  executor: Executor,
  email: string,
): Promise<{ id: string; email: string } | undefined> {
  const found = await rowsOf(
    executor,
    sql`SELECT id, email FROM users
        WHERE lower(email) = ${email} AND deleted_at IS NULL`,
  )
  const row = found[0]
  return row === undefined
    ? undefined
    : { id: String(row.id), email: String(row.email) }
}

async function areConnected(
  executor: Executor,
  a: string,
  b: string,
): Promise<boolean> {
  const found = await rowsOf(
    executor,
    sql`SELECT 1 AS present FROM connections
        WHERE user_a_id = least(${a}::uuid, ${b}::uuid)
          AND user_b_id = greatest(${a}::uuid, ${b}::uuid)`,
  )
  return found.length > 0
}

/** INV-11's scope, exactly: one pending invite per (inviter, email, folder),
 * the no-folder case counting as its own folder value, which is what the
 * partial unique index of 4.9 expresses with COALESCE. */
async function pendingDuplicateId(
  executor: Executor,
  inviterId: string,
  email: string,
  folderId: string | null,
): Promise<string | undefined> {
  const scope =
    folderId === null
      ? sql`folder_id IS NULL`
      : sql`folder_id = ${folderId}::uuid`
  const found = await rowsOf(
    executor,
    sql`SELECT id FROM invites
        WHERE inviter_id = ${inviterId} AND email = ${email}
          AND status = 'pending' AND ${scope}`,
  )
  const row = found[0]
  return row === undefined ? undefined : String(row.id)
}

/*
V-INV on create, in the order the two spec texts give it when they are read
together: 8.7 lists the sequence and 7.5's bullet carries the already-member
refusal 8.7's list does not repeat. So: email syntax and lowercasing (the
shared schema, before this module is reached), own email, the folder's
accessibility and its default flag, the target's current membership, the
task's presence inside the folder, the roster conversion or its bare
refusal, then INV-11's dedupe. Rate limits are 10.4's middleware, not this
function's.

The order is not decoration. A self-invite naming a default folder answers
422, so the own-email check must outrank the folder's 409; a member's address
against a folder the caller cannot see answers 404, so access outranks the membership conflict and nothing
confirms the folder exists.

One transaction covers the lot, because two of the outcomes write: the
conversion grants a membership under the cap, and the parked path inserts an
invite against a uniqueness INV-11 shares with a concurrent caller. Sends are
deliberately not here; the route sends after the commit, the share-grant
convention, so a rolled-back transaction can never have mailed anybody.
*/
export async function createInvite(
  db: Db,
  inviterId: string,
  input: CreateInviteInput,
): Promise<CreateInviteResult> {
  const email = input.email
  const requestedFolderId = input.folder_id ?? null
  const taskId = input.task_id ?? null
  const granted = input.access ?? null
  const initialResponsibility = input.responsibility ?? null

  return inTransaction(db, async (tx) => {
    /*
    The same read that compares addresses now also answers who the email
    names. Both templates this transaction can produce render the inviter's
    display_name, and the row is already
    being opened, so naming a person costs no statement of its own. Null when
    8.10 has scrubbed the account; the template resolves the fallback.
    */
    const inviter = await rowsOf(
      tx,
      sql`SELECT email, display_name FROM users WHERE id = ${inviterId}`,
    )
    const inviterEmail = nullableString(inviter[0]?.email)
    const inviterName = nullableString(inviter[0]?.display_name)
    if (inviterEmail !== null && inviterEmail.toLowerCase() === email) {
      return { kind: 'own_email' }
    }

    // Held rather than dropped: the conversion arm below sends a share grant
    // that names the folder, and this is the read that already has it.
    let folderAccess: FolderAccess | null = null
    if (requestedFolderId !== null) {
      folderAccess = await accessOf(tx, inviterId, requestedFolderId)
      // 10.2: a folder the inviter is not a member of reads as nonexistent,
      // never as a status that confirms it exists.
      if (folderAccess === null) return { kind: 'folder_not_found' }
      // INV-3: a default folder is never shared, so it refuses every invite.
      if (folderAccess.isDefault) return { kind: 'default_folder' }
      /* Accepted R8A: inviting somebody into a Folder is administering
         members, which Can edit explicitly cannot do, so it is Full
         control's. Before #228 any member could invite anybody into any
         folder they were in, which is the same
         membership-only write path `POST /folders/:id/members` carried. A
         **bare** roster invite, with no folder, is untouched: it grants no
         Folder Access and is an ordinary personal act (7.5). */
      const admitted = mayPerform(folderAccess, 'invite.create')
      if (!admitted.allowed) {
        return { kind: 'forbidden', reason: admitted.reason }
      }
    }
    /* Step 8: people belong to the project, so an invite named on any page
       of it is the project's. */
    const folderId =
      requestedFolderId === null ? null : ((await projectOf(tx, requestedFolderId)) ?? requestedFolderId)

    const target = await activeUserByEmail(tx, email)

    if (folderId !== null && target !== undefined) {
      const member = await rowsOf(
        tx,
        sql`SELECT 1 AS present FROM folder_members
            WHERE folder_id = ${folderId} AND user_id = ${target.id}`,
      )
      if (member.length > 0) return { kind: 'already_member' }
    }

    if (taskId !== null) {
      // The other half of 4.9's CHECK: a task_id with no folder_id is the
      // shared schema's 422, and a task outside the named folder is this
      // one. Both name a field, because both are the request's own shape.
      const inFolder = await rowsOf(
        tx,
        sql`SELECT 1 AS present FROM tasks
            WHERE id = ${taskId} AND project_id = ${folderId}
              AND deleted_at IS NULL`,
      )
      if (inFolder.length === 0) return { kind: 'task_not_in_folder' }
    }

    if (target !== undefined && (await areConnected(tx, inviterId, target.id))) {
      /*
      The conversion arm is folder-conditional: the instant share creates a membership and only a folder
      defines one, so a bare invite to a connected person answers 409 and
      creates nothing. What separates the two answers is the folder
      and nothing else.
      */
      if (folderId === null) return { kind: 'already_connected' }
      if (folderAccess === null) {
        // Unreachable: a non-null folderId means the access read ran above
        // and returned or refused. Loud rather than a blank folder name in
        // somebody's email, which is what a silent fallback would send.
        throw new Error(
          'a folder invite reached the conversion arm without its folder read',
        )
      }

      // The 10.3 cap on every 8.7 grant: lock the folder, then count, so the
      // count and the insert are one decision.
      await tx.execute(
        sql`SELECT 1 FROM folders WHERE id = ${folderId} FOR UPDATE`,
      )
      const count = await rowsOf(
        tx,
        sql`SELECT count(*)::int AS n FROM folder_members
            WHERE folder_id = ${folderId}`,
      )
      if (Number(count[0]?.n ?? 0) >= MEMBER_CAP) return { kind: 'member_cap' }

      /* 8.7's instant share: the invite never becomes a row, so the preset
         the inviter chose has to land on the membership directly, and the
         `null -> preset` transition is recorded with the inviter as actor.
         `granted` is non-null here by the shared schema's refine -- a folder
         invite carries a preset -- and the assertion is written rather than
         assumed because this is a grant of authority. */
      if (granted === null) {
        throw new Error('a folder invite reached the share arm with no preset')
      }
      await tx.execute(
        sql`INSERT INTO folder_members (folder_id, user_id, access)
            VALUES (${folderId}::uuid, ${target.id}::uuid, ${granted})`,
      )
      await recordAccessTransition(tx, {
        folderId,
        memberId: target.id,
        previousAccess: null,
        newAccess: granted,
        actorId: inviterId,
        transition: 'member_added',
      })
      /* 8.7's instant share never becomes an invite row, so #230's initial
         content has to land here in the same transaction as the membership
         it belongs to -- attributed to the inviter, who wrote it, and never
         to the person it describes. */
      if (initialResponsibility !== null) {
        await createInitialResponsibility(
          tx,
          folderId,
          target.id,
          inviterId,
          initialResponsibility,
          folderAccess.name,
        )
      }

      /*
      8.7's third entry path: membership first, then the assignment applies,
      one transaction. The order is what INV-4's composite FK requires, and
      the assignment is unconditional here where the acceptance transaction's
      is conditional: nothing has had time to overtake a request that grants
      and assigns in the same statement pair, and the task was checked into
      this folder three statements ago.
      */
      if (taskId !== null) {
        await tx.execute(
          sql`UPDATE tasks
                 SET assignee_ids = array_append(assignee_ids, ${target.id}::uuid),
                     updated_at = now()
               WHERE id = ${taskId}
                 AND NOT ${target.id}::uuid = ANY(assignee_ids)`,
        )
      }

      return {
        kind: 'converted',
        folderId,
        folderName: folderAccess.name,
        targetId: target.id,
        targetEmail: target.email,
        assignedTaskId: taskId,
        inviterName,
      }
    }

    const duplicate = await pendingDuplicateId(tx, inviterId, email, folderId)
    if (duplicate !== undefined) {
      return { kind: 'duplicate', existingId: duplicate }
    }

    /*
    8.7's closing sentence: creating a new assignment-invite for a task
    clears task_id on any earlier pending invite for that task, which is what
    keeps 7.0's pending_invite_email single-valued. The older row
    stays pending and can still grant its folder; only its assignment intent
    is superseded.
    */
    if (taskId !== null) {
      await tx.execute(
        sql`UPDATE invites SET task_id = NULL
            WHERE task_id = ${taskId} AND status = 'pending'`,
      )
    }

    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO invites (inviter_id, email, folder_id, task_id, access,
                               responsibility)
          VALUES (${inviterId}::uuid, ${email}, ${folderId}::uuid,
                  ${taskId}::uuid, ${granted},
                  ${initialResponsibility === null ? null : JSON.stringify(initialResponsibility)}::jsonb)
          ON CONFLICT DO NOTHING
          RETURNING id`,
    )
    const insertedId = inserted[0]?.id
    if (insertedId !== undefined && folderId !== null) {
      /* Without this the folder's history would say nothing about an
         invite, and "who did I ask into this" would have no answer there. Recorded
         as 'edited' with the predicate in detail, the same way a member's
         arrival is (4.13's verb list being a CHECK constraint). */
      await recordEvent(tx, {
        actorId: inviterId,
        verb: 'edited',
        subjectKind: 'folder',
        subjectId: folderId,
        subjectName: folderAccess?.name ?? '',
        folderId,
        detail: `invited ${email}`,
      })
    }
    if (insertedId === undefined) {
      // The partial unique index of 4.9 caught a duplicate this transaction
      // did not see when it looked: a concurrent create won the race, and
      // the loser is told what the sequential caller would be told.
      const raced = await pendingDuplicateId(tx, inviterId, email, folderId)
      if (raced !== undefined) return { kind: 'duplicate', existingId: raced }
      throw new Error('the invite insert wrote nothing and no duplicate exists')
    }

    return {
      kind: 'created',
      invite: await inviteElementById(tx, String(insertedId)),
      inviterName,
    }
  })
}

/* ------------------------------------------------------------------ *
 * The 7.5 transition endpoints
 * ------------------------------------------------------------------ */

/**
 * What a transition endpoint needs to know before it acts: the invite's own
 * state, whether the caller is the inviter, whether the caller is the
 * matched recipient (5.2's lowercased-email equality), and whether the
 * caller owns or can see the attached folder. Undefined means no such
 * invite.
 *
 * One read answers all four, so no endpoint resolves the actor twice and
 * none of them can disagree about who the caller is.
 */
export interface InviteActorFacts {
  id: string
  status: string
  folderId: string | null
  /** The caller's own display_name. The read below already joins their row
   * to decide isRecipient, and resend is a call site whose email names the
   * inviter, who is the caller (5.2 gives resend one actor). */
  viewerName: string | null
  isInviter: boolean
  isRecipient: boolean
  isFolderOwner: boolean
  isFolderMember: boolean
  /**
   * The caller's durable Folder facts for the invite's folder, or null when
   * the invite carries no folder or the caller is not a member of it (issue
   * #228).
   *
   * It is what turns "the inviter may cancel" into "whoever currently
   * administers this Folder's members may cancel", which #228 asks
   * for in terms -- managing pending Folder invitations sits in its
   * Full-control list, and authorship is provenance rather than standing
   * authority: a former inviter who is later downgraded loses
   * Folder-invite administration, because "I created the invite" is not
   * permanent authority. A bare roster invite has no Folder and keeps its old
   * rule -- the inviter's alone -- because there is no Folder Access to
   * resolve.
   */
  folderFacts: FolderActorFacts | null
  lastSentAt: Date
}

export async function inviteFactsFor(
  executor: Executor,
  viewerId: string,
  inviteId: string,
): Promise<InviteActorFacts | undefined> {
  const found = await rowsOf(
    executor,
    sql`SELECT i.id, i.status, i.folder_id, i.last_sent_at,
               me.display_name AS viewer_name,
               (i.inviter_id = ${viewerId}) AS is_inviter,
               (me.deleted_at IS NULL AND i.email = lower(me.email))
                 AS is_recipient,
               (f.owner_id = ${viewerId}) AS is_folder_owner,
               (m.user_id IS NOT NULL) AS is_folder_member,
               m.access, f.name AS folder_name, f.is_default
        FROM invites i
        JOIN users me ON me.id = ${viewerId}
        LEFT JOIN folders f ON f.id = i.folder_id
        LEFT JOIN folder_members m
          ON m.folder_id = f.project_id AND m.user_id = ${viewerId}
        WHERE i.id = ${inviteId}`,
  )
  const row = found[0]
  if (row === undefined) return undefined
  return {
    id: String(row.id),
    status: String(row.status),
    folderId: nullableString(row.folder_id),
    viewerName: nullableString(row.viewer_name),
    isInviter: row.is_inviter === true,
    isRecipient: row.is_recipient === true,
    isFolderOwner: row.is_folder_owner === true,
    isFolderMember: row.is_folder_member === true,
    folderFacts:
      row.is_folder_member === true && row.folder_id !== null
        ? {
            folderId: String(row.folder_id),
            actorId: viewerId,
            /* A member row always carries a preset -- the column is NOT NULL
               with a CHECK -- so the fallback is unreachable. It is the least
               authority rather than the most, which is the only direction an
               impossible value about authorization may be resolved in. */
            access: presetOf(row.access) ?? 'can_view',
            isOwner: row.is_folder_owner === true,
            isDefault: row.is_default === true,
            name: String(row.folder_name ?? ''),
          }
        : null,
    lastSentAt:
      row.last_sent_at instanceof Date
        ? row.last_sent_at
        : new Date(String(row.last_sent_at)),
  }
}

export type AcceptInviteResult =
  | {
      kind: 'accepted'
      connectionCreated: boolean
      folderId: string | null
      assignedTaskId: string | null
    }
  | { kind: 'not_pending' }
  | { kind: 'member_cap' }
  | { kind: 'folder_in_trash' }

/*
The acceptance transaction of 8.7, in its order, all or nothing:

  connection upsert (INV-9, idempotent)
  the Trash guard when a folder is attached: a folder whose deleted_at is set
    is refused, and the acceptance rolls back whole (issue #28)
  membership grant when a folder is attached and the acceptor is not already
    a member, under the 10.3 cap that binds every 8.7 grant
  conditional assignment when a task is attached
  the invite itself moves to accepted

The status guard rides the same transaction as a guarded UPDATE rather than
being read first and trusted: two acceptances of one invite would otherwise
both pass a read and both grant. Zero rows updated means the invite was not
pending when this transaction reached it, which is 5.2's 409.

A refused acceptance rolls back whole, so the invite stays pending and can be
accepted once the folder has room. The
refusal is expressed by throwing a private marker rather than by returning,
because a return value commits the transaction and everything this function
has written by then, the connection row included, has to go with it.
*/
const CAP_ROLLBACK = Symbol('member cap refusal, rolling the acceptance back')

/*
The Trash guard, issue #28, written into 5.2's accept row and 8.7's
transaction.

Deleting a folder is soft: the row survives for thirty days in Trash, and
without this guard an acceptance inside that window would hand somebody a
membership on a folder no query but Trash will ever show them. The reasons
for refusing are 8.7's.

It is a rollback marker rather than a return for exactly the CAP_ROLLBACK
reason above: the connection row is already written by the time the folder is
read, and a refusal that kept it would mint a roster connection out of an
invite nobody accepted.
*/
const TRASH_ROLLBACK = Symbol('the folder is in Trash, rolling the acceptance back')

export async function acceptInvite(
  db: Db,
  acceptorId: string,
  inviteId: string,
): Promise<AcceptInviteResult> {
  try {
    return await inTransaction(db, async (tx) => {
      const claimed = await rowsOf(
        tx,
        sql`UPDATE invites
               SET status = 'accepted', accepted_by = ${acceptorId}::uuid,
                   responded_at = now()
             WHERE id = ${inviteId} AND status = 'pending'
             RETURNING inviter_id, folder_id, task_id, access,
                       responsibility`,
      )
      const invite = claimed[0]
      if (invite === undefined) return { kind: 'not_pending' }

      const inviterId = String(invite.inviter_id)
      // Step 8: people belong to the project, and an invite names its root.
      // One on any other page (the old instance's during a deploy, or a
      // root since moved into another project) meant that page, not the
      // whole project: it is invalidated rather than widened.
      const folderId = nullableString(invite.folder_id)
      if (folderId !== null && (await projectOf(tx, folderId)) !== folderId) {
        await tx.execute(
          sql`UPDATE invites SET status = 'invalidated', accepted_by = NULL
               WHERE id = ${inviteId}`,
        )
        return { kind: 'not_pending' }
      }
      const taskId = nullableString(invite.task_id)
      const granted = presetOf(invite.access)
      const initial = responsibilityDocument.safeParse(invite.responsibility)

      // INV-9's canonical pair, upserted: the connection is created once
      // however many invites the same two people exchange, and the returned
      // rows are what connection_created reports.
      const minted = await rowsOf(
        tx,
        sql`INSERT INTO connections (user_a_id, user_b_id)
            VALUES (least(${inviterId}::uuid, ${acceptorId}::uuid),
                    greatest(${inviterId}::uuid, ${acceptorId}::uuid))
            ON CONFLICT DO NOTHING
            RETURNING user_a_id`,
      )

      if (folderId !== null) {
        /*
        One read, locking the folder row, answering both questions this
        transaction has about it: is it in Trash, and is the cap free.

        The lock moves up from the counting branch below, where it used to
        sit, so that the Trash guard and the grant are one decision against a
        concurrent DELETE /folders/:id, which soft-deletes by updating this
        same row. A delete that commits first is read here and refuses; one
        that arrives later waits on this lock and lands after the grant. It
        is taken whether or not the acceptor is already a member, because the
        refusal is about the invite's folder rather than about the membership
        it would create: an invite into a folder sitting in Trash is refused
        even when accepting it would grant nothing, since the response's
        `folder` would otherwise name a folder the acceptor cannot open.
        */
        const target = await rowsOf(
          tx,
          sql`SELECT deleted_at FROM folders WHERE id = ${folderId} FOR UPDATE`,
        )
        if ((target[0]?.deleted_at ?? null) !== null) throw TRASH_ROLLBACK

        const already = await rowsOf(
          tx,
          sql`SELECT 1 AS present FROM folder_members
              WHERE folder_id = ${folderId} AND user_id = ${acceptorId}`,
        )
        if (already.length === 0) {
          const count = await rowsOf(
            tx,
            sql`SELECT count(*)::int AS n FROM folder_members
                WHERE folder_id = ${folderId}`,
          )
          if (Number(count[0]?.n ?? 0) >= MEMBER_CAP) throw CAP_ROLLBACK
          /*
          R9 section 5, and the sentence that shapes this block: **do not
          pretend the recipient granted themselves the preset merely because
          they clicked Accept.** The preset is the one the invite has carried
          since it was created, the actor recorded is the inviter who chose
          it, and the effective time is now -- the moment the membership
          actually becomes active -- rather than when the invite was written.

          The preset is read off the invite row rather than defaulted. Every
          folder invite carries one (the table's both-or-neither CHECK, and
          migration 0023's backfill for the rows that predate it), so a null
          here means a row nobody can account for, and a grant of authority is
          the last place to guess.
          */
          if (granted === null) {
            throw new Error(
              `invite ${inviteId} carries a folder and no access preset`,
            )
          }
          await tx.execute(
            sql`INSERT INTO folder_members (folder_id, user_id, access)
                VALUES (${folderId}::uuid, ${acceptorId}::uuid, ${granted})`,
          )
          await recordAccessTransition(tx, {
            folderId,
            memberId: acceptorId,
            previousAccess: null,
            newAccess: granted,
            actorId: inviterId,
            transition: 'invite_accepted',
          })
              /*
          Issue #230, and the sentence that shapes this block is R9 section
          5's read across from Access: **the initial content becomes active
          only when the membership does, and the actor is the inviter who
          wrote it.** History must not pretend the recipient authored the
          content merely by accepting, which is exactly what recording the
          acceptor here would do.

          A row whose stored payload does not parse is *skipped* rather than
          thrown on. The invite is being accepted, and refusing a membership
          over unreadable text somebody else wrote months ago would be worse
          than arriving with no Responsibility -- which is a state #230 makes
          ordinary. Nothing is fabricated either way.
          */
          if (initial.success) {
            const folderName = await rowsOf(
              tx,
              sql`SELECT name FROM folders WHERE id = ${folderId}::uuid`,
            )
            await createInitialResponsibility(
              tx,
              folderId,
              acceptorId,
              inviterId,
              initial.data,
              String(folderName[0]?.name ?? ''),
            )
          }
        }
      }

      /*
      The conditional assignment, its conditions read as one guarded UPDATE:
      the task exists, it is still in the invite's folder, it is still
      unassigned, and it is not waiting in Trash, a trashed
      task being 8.7's "moved on" in its newest form. Anything else is
      skipped silently (8.7), because a skipped assignment loses a
      convenience while a refusal would consume the recipient's one chance
      at the folder over a task that moved on.
      */
      let assignedTaskId: string | null = null
      if (taskId !== null && folderId !== null) {
        const assigned = await rowsOf(
          tx,
          sql`UPDATE tasks SET assignee_ids = array_append(assignee_ids, ${acceptorId}::uuid),
                               updated_at = now()
               WHERE id = ${taskId} AND project_id = ${folderId}::uuid
                 AND NOT ${acceptorId}::uuid = ANY(assignee_ids)
                 AND deleted_at IS NULL
               RETURNING id`,
        )
        assignedTaskId = nullableString(assigned[0]?.id)
      }

      return {
        kind: 'accepted',
        connectionCreated: minted.length > 0,
        folderId,
        assignedTaskId,
      }
    })
  } catch (error) {
    if (error === CAP_ROLLBACK) return { kind: 'member_cap' }
    if (error === TRASH_ROLLBACK) return { kind: 'folder_in_trash' }
    throw error
  }
}

/** decline and cancel: one guarded UPDATE each, the actor guard having been
 * resolved by the route. Zero rows means the invite was not pending, which
 * is 5.2's 409 for every terminal state. */
export async function settleInvite(
  db: Db,
  inviteId: string,
  status: 'declined' | 'canceled',
): Promise<boolean> {
  const moved = await rowsOf(
    db,
    sql`UPDATE invites SET status = ${status}, responded_at = now()
         WHERE id = ${inviteId} AND status = 'pending'
         RETURNING id`,
  )
  return moved.length > 0
}

export type ResendResult =
  | { kind: 'resent'; email: string }
  | { kind: 'not_pending' }
  | { kind: 'throttled'; retryAfterSeconds: number }

/*
5.2's resend row: the inviter alone (the route's guard), pending alone, and
at least 24 hours since last_sent_at. Terminal outranks the window, so the
status is guarded first and a canceled invite answers 409 however old its
anchor.

The window is evaluated by the database against the stored instant, in the
same statement that re-stamps it: a refusal must leave the anchor untouched,
or a client that retries in a loop would push the window ahead of itself
forever. Zero rows back with a pending row still there is therefore the
throttle, and the Retry-After the route needs is computed from the anchor
this function reads back.
*/
export async function resendInvite(
  db: Db,
  inviteId: string,
): Promise<ResendResult> {
  const resent = await rowsOf(
    db,
    sql`UPDATE invites SET last_sent_at = now()
         WHERE id = ${inviteId} AND status = 'pending'
           AND now() - last_sent_at >= ${`${String(RESEND_WINDOW_HOURS)} hours`}::interval
         RETURNING email`,
  )
  const row = resent[0]
  if (row !== undefined) return { kind: 'resent', email: String(row.email) }

  const current = await rowsOf(
    db,
    sql`SELECT status,
               ceil(extract(epoch from
                 (last_sent_at + ${`${String(RESEND_WINDOW_HOURS)} hours`}::interval - now())
               ))::int AS retry_after
        FROM invites WHERE id = ${inviteId}`,
  )
  const state = current[0]
  if (state === undefined || String(state.status) !== 'pending') {
    return { kind: 'not_pending' }
  }
  return {
    kind: 'throttled',
    // A window that has just closed rounds to zero or below between the two
    // statements; 7.0 wants a usable Retry-After, and one second is the
    // smallest honest one.
    retryAfterSeconds: Math.max(1, Number(state.retry_after ?? 1)),
  }
}
