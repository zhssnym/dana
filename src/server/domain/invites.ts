// Invites (7.5, 5.2, 8.7): creation, instant-share conversion, transitions and acceptance.
// Results are discriminated unions; routes map them to statuses. Everything is scoped to the viewer or a resolved folder.
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

/** 10.3's members-per-folder limit, also spelled in folders.ts. */
const MEMBER_CAP = 25

/** 5.2's resend guard: one resend per invite per 24 hours, from last_sent_at. */
const RESEND_WINDOW_HOURS = 24

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

// The invite as POST /invites and GET /invites/sent return it. accepted_by is left out: it has no person shape.
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
    // Written in this transaction, so a missing row is a bug: fail loudly.
    throw new Error(`invite ${inviteId} vanished between insert and read`)
  }
  return inviteFromRow(row)
}

/** One invite in the element shape, read after a transition so a 200 matches a fresh read. */
export async function inviteById(
  db: Db,
  inviteId: string,
): Promise<InviteElement> {
  return inviteElementById(db, inviteId)
}

/** 7.5: the viewer's sent invites, newest first, any status. */
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

// Q12: pending invites addressed to the viewer's lowercased email. Matching is exact equality (8.7).
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

export interface CreateInviteInput {
  email: string
  folder_id?: string
  task_id?: string
  /** Present exactly when `folder_id` is; the shared schema refuses other combinations. */
  access?: FolderAccessPreset
  /** Optional initial Responsibility content, only with a folder. */
  responsibility?: ResponsibilityDocument
}

export type CreateInviteResult =
  /** Parked: 201 { invite }, plus one invite email (5.2). */
  | { kind: 'created'; invite: InviteElement; inviterName: string | null }
  /** 8.7's instant share: 200, a membership now, no invite row, and a share-grant email. */
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
  /** A tab has its project's people; the project is shared. */
  | { kind: 'already_member' }
  | { kind: 'task_not_in_folder' }
  | { kind: 'already_connected' }
  | { kind: 'duplicate'; existingId: string }
  | { kind: 'member_cap' }
  | { kind: 'forbidden'; reason: string }

/** The active account holding an address, if any. Soft-deleted rows are not accounts. */
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

/** INV-11: one pending invite per (inviter, email, folder), with no folder as its own value. */
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
V-INV order: own email, folder access and default flag, membership, task in folder, roster conversion or
refusal, then INV-11 dedupe. Own email outranks the folder's 409; access outranks the membership conflict.
One transaction; emails go out after commit, so a rollback never mails anyone.
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
    /* The same read gives the inviter's display_name for the templates; null after an 8.10 scrub. */
    const inviter = await rowsOf(
      tx,
      sql`SELECT email, display_name FROM users WHERE id = ${inviterId}`,
    )
    const inviterEmail = nullableString(inviter[0]?.email)
    const inviterName = nullableString(inviter[0]?.display_name)
    if (inviterEmail !== null && inviterEmail.toLowerCase() === email) {
      return { kind: 'own_email' }
    }

    let folderAccess: FolderAccess | null = null
    if (requestedFolderId !== null) {
      folderAccess = await accessOf(tx, inviterId, requestedFolderId)
      // 10.2: a folder the inviter is not a member of reads as nonexistent.
      if (folderAccess === null) return { kind: 'folder_not_found' }
      // INV-3: a default folder is never shared.
      if (folderAccess.isDefault) return { kind: 'default_folder' }
      /* Inviting into a Folder administers members, so it needs Full control. A bare roster invite needs nothing. */
      const admitted = mayPerform(folderAccess, 'invite.create')
      if (!admitted.allowed) {
        return { kind: 'forbidden', reason: admitted.reason }
      }
    }
    /* An invite on any page of a project is the project's. */
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
      // A task outside the named folder is a 422 on the task field.
      const inFolder = await rowsOf(
        tx,
        sql`SELECT 1 AS present FROM tasks
            WHERE id = ${taskId} AND project_id = ${folderId}
              AND deleted_at IS NULL`,
      )
      if (inFolder.length === 0) return { kind: 'task_not_in_folder' }
    }

    if (target !== undefined && (await areConnected(tx, inviterId, target.id))) {
      /* The instant share needs a folder, so a bare invite to a connected person is a 409. */
      if (folderId === null) return { kind: 'already_connected' }
      if (folderAccess === null) {
        // Unreachable: a non-null folderId means the access read ran. Throw rather than mail a blank folder name.
        throw new Error(
          'a folder invite reached the conversion arm without its folder read',
        )
      }

      // The 10.3 cap: lock the folder, then count, so the count and the insert are one decision.
      await tx.execute(
        sql`SELECT 1 FROM folders WHERE id = ${folderId} FOR UPDATE`,
      )
      const count = await rowsOf(
        tx,
        sql`SELECT count(*)::int AS n FROM folder_members
            WHERE folder_id = ${folderId}`,
      )
      if (Number(count[0]?.n ?? 0) >= MEMBER_CAP) return { kind: 'member_cap' }

      /* The instant share puts the chosen preset on the membership directly, with the inviter as actor.
      Asserted, not assumed, because this grants authority. */
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
      /* Initial Responsibility content lands with the membership, attributed to the inviter. */
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

      /* Membership first, then the assignment: INV-4's composite FK requires that order. */
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
    A new assignment-invite for a task clears task_id on earlier pending invites for it, keeping
    pending_invite_email single-valued. Those invites stay pending for their folder.
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
      /* Record the invite in the folder's history, as 'edited' (the verb list is a CHECK). */
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
      // A concurrent create won the race on 4.9's partial unique index; answer as the sequential caller would be answered.
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

/** What a transition endpoint needs about the caller, from one read. Undefined means no such invite. */
export interface InviteActorFacts {
  id: string
  status: string
  folderId: string | null
  /** The caller's display_name, for resend's email, which names the inviter. */
  viewerName: string | null
  isInviter: boolean
  isRecipient: boolean
  isFolderOwner: boolean
  isFolderMember: boolean
  /**
   * The caller's Folder facts for the invite's folder, or null. Whoever administers the Folder's members may cancel,
   * not just the original inviter. A bare roster invite stays the inviter's alone.
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
            /* Unreachable (NOT NULL with a CHECK); the fallback is the least authority. */
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
8.7's acceptance, all or nothing: connection upsert, Trash guard, membership under the 10.3 cap, conditional
assignment, then the invite moves to accepted by a guarded UPDATE (zero rows is 5.2's 409).
Refusals throw a marker so the connection row written earlier rolls back too.
 */
const CAP_ROLLBACK = Symbol('member cap refusal, rolling the acceptance back')

/* Refuse acceptance into a folder in Trash. A marker throw, for CAP_ROLLBACK's reason. */
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
      // An invite names its project's root. One on another page is invalidated, not widened to the whole project.
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

      // INV-9's canonical pair, upserted; the returned rows say whether a connection was created.
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
        One locking read answers both "in Trash?" and "cap free?", so the guard and the grant are one decision
        against a concurrent soft delete. Taken even when the acceptor is already a member.
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
          /* The preset comes from the invite, the actor is the inviter, and the time is now. A null preset is refused, not guessed. */
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
              /* Initial content activates with the membership, attributed to the inviter. An unparseable payload is skipped,
              not thrown, so acceptance still succeeds. */
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

      /* One guarded UPDATE: the task exists, is still in the folder, unassigned and not trashed. Otherwise skip silently (8.7). */
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

/** Decline and cancel: one guarded UPDATE each; the route resolved the actor. Zero rows is 5.2's 409. */
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
Resend: pending only, and 24 hours since last_sent_at, checked by the database in the statement that re-stamps it,
so a refusal leaves the anchor alone. Zero rows on a pending row is the throttle.
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
    // At least one second, so Retry-After is usable.
    retryAfterSeconds: Math.max(1, Number(state.retry_after ?? 1)),
  }
}
