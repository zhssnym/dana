// Which folder controls to draw, from the server's own table (`shared/folder-actions.ts`).
// Not authorization: the route decides. State refusals (the default folder, the last
// Full-control member's exit) are checked after the table.
import { mayPerform } from '../../shared/folder-actions.js'
import type { FolderAction, FolderActorFacts } from '../../shared/folder-actions.js'
import type { FolderAccessPreset } from '../../shared/folder-access.js'
import type { FolderMember } from '../../shared/folders.js'

/** `FolderActorFacts` minus the id and name, which only a route needs. */
export interface FolderViewerFacts {
  /** The viewer's own current preset, `folder_members.access`. */
  readonly access: FolderAccessPreset
  /** `folders.owner_id`: custody, never access. */
  readonly isOwner: boolean
  /** The personal folder, which cannot be deleted, left or transferred. */
  readonly isDefault: boolean
  /**
   * Whether anyone other than the viewer holds Full control; `undefined` where the
   * surface has no roster (the sidebar).
   */
  readonly otherFullControl?: boolean
}

/**
 * The viewer's own membership, or null before the roster arrives. Never inferred from
 * `is_owner`: an owner may lower their own preset.
 */
export function viewerMembership(
  members: readonly FolderMember[],
  viewerId: string | null,
): FolderMember | null {
  if (viewerId === null) return null
  return members.find((member) => member.user.id === viewerId) ?? null
}

/** Null while the folder or roster is loading, so a menu does not flicker owner acts. */
export function viewerFacts(
  folder: { readonly is_owner: boolean; readonly is_default: boolean } | undefined,
  members: readonly FolderMember[],
  viewerId: string | null,
): FolderViewerFacts | null {
  if (folder === undefined) return null
  const own = viewerMembership(members, viewerId)
  if (own === null) return null
  return {
    access: own.access,
    isOwner: folder.is_owner,
    isDefault: folder.is_default,
    otherFullControl: members.some(
      (member) => member.user.id !== viewerId && member.access === 'full_control',
    ),
  }
}

/**
 * A stand-in actor id. A projection answers "what does this preset allow", so the only
 * use is asking a `requiresAuthor` rule with this same id as author.
 */
const PROJECTED_ACTOR_ID = 'the-viewer'

// The fields `mayPerform` wants that no drawing decision reads.
const NOT_READ_BY_A_PROJECTION = {
  folderId: '',
  actorId: PROJECTED_ACTOR_ID,
  name: '',
} as const

/**
 * The table's answer for one action. `target` is narrowed to `authorId` on purpose: an
 * assignee would let a projection grant an assignment-scoped act, which only the
 * server may decide under the row lock. The type is the guard.
 */
export function mayDraw(
  facts: FolderViewerFacts,
  action: FolderAction,
  // Deliberately not `FolderActionTarget`. See above.
  target: { readonly authorId?: string } = {},
): boolean {
  const actorFacts: FolderActorFacts = {
    ...NOT_READ_BY_A_PROJECTION,
    access: facts.access,
    isOwner: facts.isOwner,
    isDefault: facts.isDefault,
  }
  return mayPerform(actorFacts, action, target).allowed
}

/**
 * Which of a folder's acts to offer. Surfaces spread this over their handlers, and
 * `actsFor` draws only acts with a handler.
 */
export interface FolderGates {
  /** Rename and the rest of the folder's identity: Can edit and above. */
  readonly identity: boolean
  /** Moving the whole folder to Trash: Full control; custody does not confer it (AC-015). */
  readonly trash: boolean
  /**
   * Any member may leave, except the owner (who transfers first) and the last
   * Full-control member (AC-019, AC-520).
   */
  readonly leave: boolean
  /** The owner's alone; Full control does not confer it. */
  readonly transferOwnership: boolean
  /** Full control only (AC-024). */
  readonly addMember: boolean
  /** Changing someone else's access (AC-512). */
  readonly administerAccess: boolean
  /**
   * Removing someone else's comment. A comment's author deleting their own is per comment;
   * `lib/thread.ts` adds the two together.
   */
  readonly moderate: boolean
  /** Permanently destroying a trashed task: Full control, ownership ignored (AC-790). */
  readonly destroyTask: boolean
  /**
   * Permanently destroying a trashed folder: Full control and the owner, so narrower
   * than `destroyTask`.
   */
  readonly destroyFolder: boolean
  /**
   * Changing one's own comment, the standing half only (Can comment or better);
   * `lib/thread.ts` multiplies it by authorship (AC-790).
   */
  readonly mutateOwnComment: boolean
  /** Liking: Can comment and above, per folder (AC-790). */
  readonly likeComment: boolean
  /**
   * Writing into the conversation: Can comment and above. The composer is disabled with
   * a reason, not hidden, below that (AC-790).
   */
  readonly createComment: boolean
  /** Managing the folder's label vocabulary: Can edit and above (AC-480, AC-800). */
  readonly labels: boolean
  /**
   * The folder-wide floor for `label.apply`: false for Can contribute, who may still label
   * a task assigned to them. That per-task grant is the server's; never pass an assignee
   * into `mayDraw` (AC-800).
   */
  readonly applyLabel: boolean
}

export function folderGates(facts: FolderViewerFacts): FolderGates {
  // `undefined` means unknown: offer Leave and let the server refuse, rather than hide
  // someone's only way out.
  const strands = facts.access === 'full_control' && facts.otherFullControl === false

  return {
    identity: mayDraw(facts, 'folder.profile.edit'),
    trash: mayDraw(facts, 'folder.trash') && !facts.isDefault,
    leave:
      mayDraw(facts, 'member.leave') &&
      !facts.isDefault &&
      !facts.isOwner &&
      !strands,
    transferOwnership:
      mayDraw(facts, 'folder.ownership.transfer') && !facts.isDefault,
    addMember: mayDraw(facts, 'member.add'),
    administerAccess: mayDraw(facts, 'member.access.change'),
    moderate: mayDraw(facts, 'comment.moderate'),
    // Neither reads `isDefault`; `folder-authority.test.ts` asserts that.
    destroyTask: mayDraw(facts, 'task.destroy'),
    destroyFolder: mayDraw(facts, 'folder.destroy'),
    // "If this comment were mine, could I change it." Without the target this answers false
    // at every preset.
    mutateOwnComment: mayDraw(facts, 'comment.mutate.own', {
      authorId: PROJECTED_ACTOR_ID,
    }),
    likeComment: mayDraw(facts, 'comment.like'),
    createComment: mayDraw(facts, 'comment.create'),
    labels: mayDraw(facts, 'label.vocabulary.manage'),
    applyLabel: mayDraw(facts, 'label.apply'),
  }
}

/**
 * Ownership may go only to another member who holds Full control (the server's
 * `isEligibleSuccessor`). No default successor; roster order.
 */
export function eligibleSuccessors(
  members: readonly FolderMember[],
  viewerId: string | null,
): FolderMember[] {
  return members.filter(
    (member) =>
      member.user.id !== viewerId && member.access === 'full_control',
  )
}

/** The other members: what "shared" means and what the owner's delete question counts. */
export function otherMembers(
  members: readonly FolderMember[],
  viewerId: string | null,
): FolderMember[] {
  return members.filter((member) => member.user.id !== viewerId)
}
