// Responsibility documents, their append-only revisions, and the self-edit grant. Authority comes only from
// folder-access.ts; never parse the prose to grant permission. A commit is a whole canonical state, compared by hash.
// Every write runs in the caller's transaction behind the folder row lock.
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import {
  EMPTY_RESPONSIBILITY,
  responsibilityDocument,
} from '../../shared/responsibility.js'
import type {
  ResponsibilityDocument,
  ResponsibilityHistoryEntry,
  ResponsibilityStanding,
  ResponsibilityTransition,
} from '../../shared/responsibility.js'
import { LIST_ROW_CAP } from '../../shared/list-cap.js'
import { richContent } from '../../shared/rich-content.js'
import type { RichContent } from '../../shared/rich-content.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { documentHash } from './document-hash.js'
import { recordEvent } from './events.js'
import { lockedMembership, mayPerform } from './folder-access.js'
import type { FolderActorFacts } from './folder-access.js'
import type { FolderAccessPreset } from '../../shared/folder-access.js'

/** sha256 over the canonical payload, via the same `documentHash` the page transaction uses. */
export function responsibilityHash(content: ResponsibilityDocument): string {
  return documentHash(content)
}

/** The hash a member with no document has; a first save sends it as `base_revision`. */
export const EMPTY_RESPONSIBILITY_HASH = responsibilityHash(
  EMPTY_RESPONSIBILITY,
)

/** A stored payload re-parsed into the canonical shape. Throws rather than serving a document nobody can round-trip. */
function storedDocument(value: unknown, where: string): ResponsibilityDocument {
  const parsed = responsibilityDocument.safeParse(value)
  if (!parsed.success) {
    throw new Error(
      `a stored Responsibility document is not readable at ${where}`,
    )
  }
  return parsed.data
}

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableIso(value: unknown): string | null {
  return value === null || value === undefined ? null : toIso(value)
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

interface Person {
  id: string
  display_name: string | null
  avatar_url: string | null
}

function personFrom(
  id: unknown,
  displayName: unknown,
  avatarUrl: unknown,
): Person | null {
  if (id === null || id === undefined) return null
  return {
    id: String(id),
    display_name: nullableString(displayName),
    avatar_url: nullableString(avatarUrl),
  }
}

/** The standing of a member who has never written anything. Built, never stored. */
export function emptyStanding(): ResponsibilityStanding {
  return {
    responsibility_id: null,
    revision: EMPTY_RESPONSIBILITY_HASH,
    current_revision_id: null,
    revision_no: 0,
    content: null,
    updated_at: null,
    updated_by: null,
    active: true,
  }
}

/**
 * The standing of every named member of one Folder, in one statement however many are named.
 * Ended documents are included as `active: false`; `activeStandingOf` excludes them.
 */
export async function standingOf(
  executor: Executor,
  folderId: string,
  memberIds: readonly string[],
): Promise<Map<string, ResponsibilityStanding>> {
  const standings = new Map<string, ResponsibilityStanding>()
  for (const memberId of memberIds) standings.set(memberId, emptyStanding())
  if (memberIds.length === 0) return standings

  const ids = JSON.stringify([...memberIds])
  const found = await rowsOf(
    executor,
    sql`SELECT r.id, r.member_id, r.content, r.content_hash,
               r.current_revision_no, r.updated_at, r.ended_at,
               h.id AS revision_id,
               u.id AS actor_id, u.display_name AS actor_display_name,
               u.avatar_url AS actor_avatar_url
          FROM folder_responsibilities r
          JOIN jsonb_array_elements_text(${ids}::jsonb) AS wanted(member_id)
            ON wanted.member_id::uuid = r.member_id
          LEFT JOIN folder_responsibility_history h
            ON h.responsibility_id = r.id
           AND h.revision_no = r.current_revision_no
          LEFT JOIN users u ON u.id = r.updated_by
         WHERE r.folder_id = ${folderId}::uuid
         ORDER BY (r.ended_at IS NULL) ASC, r.ended_at ASC, r.created_at ASC`,
  )
  /* The ORDER BY puts the active row last, so it wins over an ended one for a member who rejoined. */
  for (const row of found) {
    const memberId = String(row.member_id)
    const endedAt = nullableIso(row.ended_at)
    standings.set(memberId, {
      responsibility_id: String(row.id),
      revision: String(row.content_hash),
      current_revision_id: nullableString(row.revision_id),
      revision_no: Number(row.current_revision_no),
      content: storedDocument(
        row.content,
        `folder_responsibilities ${String(row.id)}`,
      ),
      updated_at: nullableIso(row.updated_at),
      updated_by: personFrom(
        row.actor_id,
        row.actor_display_name,
        row.actor_avatar_url,
      ),
      active: endedAt === null,
    })
  }
  return standings
}

/** One member's active standing, or the empty standing. An ended document never shows. */
export async function activeStandingOf(
  executor: Executor,
  folderId: string,
  memberId: string,
): Promise<ResponsibilityStanding> {
  const all = await standingOf(executor, folderId, [memberId])
  const standing = all.get(memberId) ?? emptyStanding()
  return standing.active ? standing : emptyStanding()
}

interface HistoryInput {
  folderId: string
  memberId: string
  responsibilityId: string | null
  transition: ResponsibilityTransition
  revisionNo: number | null
  content: ResponsibilityDocument | null
  actorId: string
}

/** One append-only entry in the caller's transaction. There is no update or delete: corrections are new revisions. */
async function recordResponsibilityTransition(
  tx: Executor,
  entry: HistoryInput,
): Promise<void> {
  const content =
    entry.content === null ? null : JSON.stringify(entry.content)
  const hash =
    entry.content === null ? null : responsibilityHash(entry.content)
  await tx.execute(
    sql`INSERT INTO folder_responsibility_history
          (folder_id, member_id, responsibility_id, transition, revision_no,
           content, content_hash, actor_id)
        VALUES (${entry.folderId}::uuid, ${entry.memberId}::uuid,
                ${entry.responsibilityId}::uuid, ${entry.transition},
                ${entry.revisionNo}, ${content}::jsonb, ${hash},
                ${entry.actorId}::uuid)`,
  )
}

/**
 * A Responsibility record page, newest first, capped at `LIST_ROW_CAP`, with `truncated` set when the cap cut.
 * Joins nothing to folder_members: entries outlive membership.
 */
export interface ResponsibilityHistoryPage {
  entries: ResponsibilityHistoryEntry[]
  truncated: boolean
}

export async function responsibilityHistoryOf(
  executor: Executor,
  folderId: string,
  options: { memberId?: string; limit?: number } = {},
): Promise<ResponsibilityHistoryPage> {
  const member =
    options.memberId === undefined
      ? sql``
      : sql` AND h.member_id = ${options.memberId}`
  const limit = Math.min(
    Math.max(options.limit ?? LIST_ROW_CAP, 1),
    LIST_ROW_CAP,
  )
  /* One row past the cap answers `truncated` without a COUNT.
  The id tie-break is random. Today each transaction appends one entry per member, so no tie arises;
  a writer that appends two for one member must add a monotonic tie-break. */
  const found = await rowsOf(
    executor,
    sql`SELECT h.id, h.folder_id, h.member_id, h.responsibility_id,
               h.transition, h.revision_no, h.content, h.effective_at,
               u.id AS actor_id, u.display_name AS actor_display_name,
               u.avatar_url AS actor_avatar_url
          FROM folder_responsibility_history h
          JOIN users u ON u.id = h.actor_id
         WHERE h.folder_id = ${folderId}::uuid${member}
         ORDER BY h.effective_at DESC, h.id DESC
         LIMIT ${limit + 1}`,
  )
  const truncated = found.length > limit
  const page = truncated ? found.slice(0, limit) : found
  const entries = page.map((row) => {
    const actor = personFrom(
      row.actor_id,
      row.actor_display_name,
      row.actor_avatar_url,
    )
    if (actor === null) {
      // Unreachable behind NOT NULL; throw rather than invent a historical actor.
      throw new Error(
        `a Responsibility history row has no actor at ${String(row.id)}`,
      )
    }
    return {
      id: String(row.id),
      folder_id: String(row.folder_id),
      member_id: String(row.member_id),
      responsibility_id: nullableString(row.responsibility_id),
      transition: String(row.transition) as ResponsibilityTransition,
      revision_no:
        row.revision_no === null || row.revision_no === undefined
          ? null
          : Number(row.revision_no),
      content:
        row.content === null || row.content === undefined
          ? null
          : storedDocument(
              row.content,
              `folder_responsibility_history ${String(row.id)}`,
            ),
      actor,
      effective_at: toIso(row.effective_at),
    }
  })
  return { entries, truncated }
}

/** The locked current document of one member, or null when they have none. */
interface LockedDocument {
  id: string
  contentHash: string
  revisionNo: number
}

async function lockedDocument(
  tx: Executor,
  folderId: string,
  memberId: string,
): Promise<LockedDocument | null> {
  const found = await rowsOf(
    tx,
    sql`SELECT id, content_hash, current_revision_no
          FROM folder_responsibilities
         WHERE folder_id = ${folderId}::uuid
           AND member_id = ${memberId}::uuid
           AND ended_at IS NULL
         FOR UPDATE`,
  )
  const row = found[0]
  if (row === undefined) return null
  return {
    id: String(row.id),
    contentHash: String(row.content_hash),
    revisionNo: Number(row.current_revision_no),
  }
}

/** Upsert the document, append its revision and record the History line, in the caller's transaction. Caller has authorized. */
async function writeRevision(
  tx: Executor,
  folderId: string,
  memberId: string,
  actorId: string,
  content: ResponsibilityDocument,
  existing: LockedDocument | null,
  folderName: string,
): Promise<{ responsibilityId: string; revisionNo: number }> {
  const hash = responsibilityHash(content)
  const payload = JSON.stringify(content)
  let responsibilityId: string
  let revisionNo: number
  if (existing === null) {
    const created = await rowsOf(
      tx,
      sql`INSERT INTO folder_responsibilities
            (folder_id, member_id, content, content_hash,
             current_revision_no, updated_by)
          VALUES (${folderId}::uuid, ${memberId}::uuid, ${payload}::jsonb,
                  ${hash}, 1, ${actorId}::uuid)
          RETURNING id`,
    )
    const row = created[0]
    if (row === undefined) {
      throw new Error('the Responsibility document insert returned no row')
    }
    responsibilityId = String(row.id)
    revisionNo = 1
  } else {
    responsibilityId = existing.id
    revisionNo = existing.revisionNo + 1
    await tx.execute(
      sql`UPDATE folder_responsibilities
             SET content = ${payload}::jsonb, content_hash = ${hash},
                 current_revision_no = ${revisionNo},
                 updated_at = now(), updated_by = ${actorId}::uuid
           WHERE id = ${responsibilityId}::uuid`,
    )
  }
  await recordResponsibilityTransition(tx, {
    folderId,
    memberId,
    responsibilityId,
    transition: revisionNo === 1 ? 'responsibility_created' : 'responsibility_updated',
    revisionNo,
    content,
    actorId,
  })
  /* The History line is a projection of the structured revision; it rides 'edited' because the verb list is a CHECK. */
  const subject = await rowsOf(
    tx,
    sql`SELECT display_name FROM users WHERE id = ${memberId}::uuid`,
  )
  const name = nullableString(subject[0]?.display_name)
  await recordEvent(tx, {
    actorId,
    verb: 'edited',
    subjectKind: 'folder',
    subjectId: folderId,
    subjectName: folderName,
    folderId,
    detail:
      actorId === memberId
        ? 'updated their Responsibilities'
        : `updated ${name ?? 'a member'}'s Responsibilities`,
    recipients: actorId === memberId ? undefined : [memberId],
  })
  return { responsibilityId, revisionNo }
}

export type CommitResponsibilityResult =
  | { kind: 'committed'; standing: ResponsibilityStanding }
  /** The content sent already is the current content, so nothing was written. */
  | { kind: 'unchanged'; standing: ResponsibilityStanding }
  /** `base_revision` and content both differ from the current state: someone else committed in between. */
  | { kind: 'stale'; standing: ResponsibilityStanding }
  /** The named person is not an active member of this Folder. */
  | { kind: 'not_member' }
  | { kind: 'forbidden'; reason: string }

/**
 * Commit a Responsibility state. Order: lock the Folder row, lock the target's membership and read its grant,
 * decide with `mayPerform`, treat equal content as a no-op whatever the base says, then refuse a stale base, then write.
 */
export async function commitResponsibility(
  db: Db,
  facts: FolderActorFacts,
  memberId: string,
  body: { content: ResponsibilityDocument; base_revision: string },
): Promise<CommitResponsibilityResult> {
  const folderId = facts.folderId
  const actorId = facts.actorId
  return inTransaction(db, async (tx) => {
    await tx.execute(
      sql`SELECT 1 FROM folders WHERE id = ${folderId} FOR UPDATE`,
    )
    const target = await lockedMembership(tx, folderId, memberId)
    if (target === null) return { kind: 'not_member' } as const

    const decision = mayPerform(facts, 'responsibility.manage', {
      memberId,
      selfEditGranted: target.canEditOwnResponsibilities,
    }).allowed
      ? { allowed: true as const }
      : mayPerform(facts, 'responsibility.edit.own', {
          memberId,
          selfEditGranted: target.canEditOwnResponsibilities,
        })
    if (!decision.allowed) {
      return { kind: 'forbidden', reason: decision.reason } as const
    }

    const existing = await lockedDocument(tx, folderId, memberId)
    const currentHash = existing?.contentHash ?? EMPTY_RESPONSIBILITY_HASH
    const nextHash = responsibilityHash(body.content)

    if (nextHash === currentHash) {
      return {
        kind: 'unchanged',
        standing: await activeStandingOf(tx, folderId, memberId),
      } as const
    }
    if (body.base_revision !== currentHash) {
      return {
        kind: 'stale',
        standing: await activeStandingOf(tx, folderId, memberId),
      } as const
    }

    const named = await rowsOf(
      tx,
      sql`SELECT name FROM folders WHERE id = ${folderId}::uuid`,
    )
    await writeRevision(
      tx,
      folderId,
      memberId,
      actorId,
      body.content,
      existing,
      String(named[0]?.name ?? ''),
    )
    return {
      kind: 'committed',
      standing: await activeStandingOf(tx, folderId, memberId),
    } as const
  })
}

/**
 * The first revision for a member activated with initial content, in the activation's transaction.
 * The actor is the grantor, never the recipient. Canonically empty content writes no row.
 */
export async function createInitialResponsibility(
  tx: Executor,
  folderId: string,
  memberId: string,
  grantorId: string,
  content: ResponsibilityDocument,
  folderName: string,
): Promise<void> {
  if (responsibilityHash(content) === EMPTY_RESPONSIBILITY_HASH) return
  await writeRevision(
    tx,
    folderId,
    memberId,
    grantorId,
    content,
    null,
    folderName,
  )
}

/**
 * End a member's active standing in the membership operation's transaction: stamp `ended_at`, append one entry,
 * delete nothing. A member with no document records nothing.
 */
export async function endResponsibilityStanding(
  tx: Executor,
  folderId: string,
  memberId: string,
  actorId: string,
): Promise<void> {
  const ended = await rowsOf(
    tx,
    sql`UPDATE folder_responsibilities SET ended_at = now()
         WHERE folder_id = ${folderId}::uuid
           AND member_id = ${memberId}::uuid
           AND ended_at IS NULL
        RETURNING id`,
  )
  const row = ended[0]
  if (row === undefined) return
  await recordResponsibilityTransition(tx, {
    folderId,
    memberId,
    responsibilityId: String(row.id),
    transition: 'responsibility_ended',
    revisionNo: null,
    content: null,
    actorId,
  })
}

export type SetSelfEditGrantResult =
  | { kind: 'changed'; enabled: boolean }
  | { kind: 'unchanged'; enabled: boolean }
  | { kind: 'not_member' }
  /** The target is the owner: other administrators may not toggle the owner's grant. */
  | { kind: 'target_is_owner' }

/**
 * Toggle one member's self-edit grant with its history entry, atomically. An unchanged toggle records nothing.
 * The owner is refused: their way back to authority is custody recovery.
 */
export async function setSelfEditGrant(
  db: Db,
  actorId: string,
  folderId: string,
  memberId: string,
  enabled: boolean,
): Promise<SetSelfEditGrantResult> {
  return inTransaction(db, async (tx) => {
    await tx.execute(
      sql`SELECT 1 FROM folders WHERE id = ${folderId} FOR UPDATE`,
    )
    const target = await lockedMembership(tx, folderId, memberId)
    if (target === null) return { kind: 'not_member' } as const
    if (target.isOwner) return { kind: 'target_is_owner' } as const
    if (target.canEditOwnResponsibilities === enabled) {
      return { kind: 'unchanged', enabled } as const
    }
    await tx.execute(
      sql`UPDATE folder_members
             SET can_edit_own_responsibilities = ${enabled}
           WHERE folder_id = ${folderId}::uuid AND user_id = ${memberId}::uuid`,
    )
    const document = await rowsOf(
      tx,
      sql`SELECT id FROM folder_responsibilities
           WHERE folder_id = ${folderId}::uuid
             AND member_id = ${memberId}::uuid
             AND ended_at IS NULL`,
    )
    await recordResponsibilityTransition(tx, {
      folderId,
      memberId,
      responsibilityId: nullableString(document[0]?.id),
      transition: enabled ? 'self_edit_granted' : 'self_edit_revoked',
      revisionNo: null,
      content: null,
      actorId,
    })
    const named = await rowsOf(
      tx,
      sql`SELECT f.name,
                 (SELECT u.display_name FROM users u WHERE u.id = ${memberId})
                   AS target_name
            FROM folders f WHERE f.id = ${folderId}`,
    )
    await recordEvent(tx, {
      actorId,
      verb: 'edited',
      subjectKind: 'folder',
      subjectId: folderId,
      subjectName: String(named[0]?.name ?? ''),
      folderId,
      detail: enabled
        ? `enabled ${String(named[0]?.target_name ?? 'a member')} to edit their own Responsibilities`
        : `stopped ${String(named[0]?.target_name ?? 'a member')} editing their own Responsibilities`,
      recipients: [memberId],
    })
    return { kind: 'changed', enabled } as const
  })
}

export interface MemberDetailsRow {
  user: Person
  isOwner: boolean
  joinedAt: string
  bio: string | null
  bioContent: RichContent | null
  bioAuthor: Person | null
  bioLastEditor: Person | null
  bioUpdatedAt: string | null
  access: FolderAccessPreset
  canEditOwnResponsibilities: boolean
  assignedOpenTaskCount: number
  responsibility: ResponsibilityStanding
}

/**
 * Member details for the named members in a constant number of statements (never one per member).
 * Returns domain rows; the route computes viewer permissions, since a projection must not authorize.
 */
export async function memberDetailsOf(
  executor: Executor,
  folderId: string,
  memberIds: readonly string[],
): Promise<Map<string, MemberDetailsRow>> {
  const details = new Map<string, MemberDetailsRow>()
  if (memberIds.length === 0) return details
  const ids = JSON.stringify([...memberIds])

  const members = await rowsOf(
    executor,
    sql`SELECT u.id, u.display_name, u.avatar_url, m.access, m.bio, m.bio_content,
               m.bio_updated_at,
               author.id AS bio_author_id, author.display_name AS bio_author_name, author.avatar_url AS bio_author_avatar,
               editor.id AS bio_editor_id, editor.display_name AS bio_editor_name, editor.avatar_url AS bio_editor_avatar,
               m.can_edit_own_responsibilities, m.created_at AS joined_at,
               (m.user_id = f.owner_id) AS is_owner
          FROM folder_members m
          JOIN folders f ON f.id = m.folder_id
          JOIN users u ON u.id = m.user_id
          LEFT JOIN users author ON author.id = m.bio_author_id
          LEFT JOIN users editor ON editor.id = m.bio_last_editor_id
          JOIN jsonb_array_elements_text(${ids}::jsonb) AS wanted(member_id)
            ON wanted.member_id::uuid = m.user_id
         WHERE m.folder_id = ${folderId}::uuid`,
  )
  const counts = await rowsOf(
    executor,
    sql`SELECT wanted.member_id, count(*)::int AS n
          FROM tasks t
          JOIN jsonb_array_elements_text(${ids}::jsonb) AS wanted(member_id)
            ON wanted.member_id::uuid = ANY(t.assignee_ids)
         WHERE t.project_id = ${folderId}::uuid
           AND t.deleted_at IS NULL
           AND t.status = 'pending'
         GROUP BY wanted.member_id`,
  )
  const byMember = new Map<string, number>()
  for (const row of counts) {
    byMember.set(String(row.member_id), Number(row.n))
  }
  const standings = await standingOf(
    executor,
    folderId,
    members.map((row) => String(row.id)),
  )

  for (const row of members) {
    const id = String(row.id)
    const standing = standings.get(id) ?? emptyStanding()
    details.set(id, {
      user: {
        id,
        display_name: nullableString(row.display_name),
        avatar_url: nullableString(row.avatar_url),
      },
      isOwner: row.is_owner === true,
      joinedAt: toIso(row.joined_at),
      bio: nullableString(row.bio),
      bioContent: row.bio_content === null ? null : richContent.parse(row.bio_content),
      bioAuthor: row.bio_author_id === null ? null : {
        id: String(row.bio_author_id),
        display_name: nullableString(row.bio_author_name),
        avatar_url: nullableString(row.bio_author_avatar),
      },
      bioLastEditor: row.bio_editor_id === null ? null : {
        id: String(row.bio_editor_id),
        display_name: nullableString(row.bio_editor_name),
        avatar_url: nullableString(row.bio_editor_avatar),
      },
      bioUpdatedAt: row.bio_updated_at === null ? null : toIso(row.bio_updated_at),
      access: String(row.access) as FolderAccessPreset,
      canEditOwnResponsibilities: row.can_edit_own_responsibilities === true,
      assignedOpenTaskCount: byMember.get(id) ?? 0,
      /* A rejoined member with only an ended document reads as having none. */
      responsibility: standing.active ? standing : emptyStanding(),
    })
  }
  return details
}
