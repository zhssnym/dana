/*
The Folder action table and its pure resolver, shared so a screen hides the
same controls the route refuses. The client may hide a control from this;
nothing computed on the client permits anything. Each `why` is shown to the
refused person. Pass the assignee (and other target facts) read under the
row lock in the writing transaction, never a projection.
*/
import { FOLDER_ACCESS_PRESETS, folderAccessPreset } from './folder-access.js'
import type { FolderAccessPreset } from './folder-access.js'

/** The ladder's order, most authority first: FOLDER_ACCESS_PRESETS order matters here. */
const RANK = new Map<FolderAccessPreset, number>(
  FOLDER_ACCESS_PRESETS.map((preset, index) => [preset, index]),
)

/** "At least as much authority as". An unknown preset counts as the least. */
export function atLeast(
  held: FolderAccessPreset,
  required: FolderAccessPreset,
): boolean {
  const heldRank = RANK.get(held)
  const requiredRank = RANK.get(required)
  if (heldRank === undefined || requiredRank === undefined) return false
  return heldRank <= requiredRank
}

/** An unreadable stored preset is refused rather than defaulted. */
export function presetOf(value: unknown): FolderAccessPreset | null {
  const parsed = folderAccessPreset.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * Every Folder action, closed. `personal: true` actions are governed by
 * membership alone.
 */
export const FOLDER_ACTIONS = [
  'folder.read',
  'folder.profile.edit',
  'folder.page.edit',
  'folder.section.manage',
  'folder.duplicate',
  'folder.trash',
  'folder.restore',
  'folder.destroy',
  'folder.ownership.transfer',
  'owner.custody_recovery',
  'member.add',
  'member.remove',
  'member.leave',
  'member.access.change',
  'member.access.history.read',
  'responsibility.read',
  'responsibility.history.read',
  'responsibility.manage',
  'responsibility.edit.own',
  'responsibility.self_edit_grant.manage',
  'invite.create',
  'invite.administer',
  'invite.view',
  'task.create',
  'task.edit',
  'task.assign',
  'task.move',
  'task.status.complete',
  'task.status.abandon',
  'task.trash',
  'task.restore',
  'task.destroy',
  'task.duplicate',
  'task.dependency.manage',
  'task.reminder.manage',
  'step.toggle',
  'label.vocabulary.manage',
  'label.apply',
  'comment.create',
  'comment.mutate.own',
  'comment.moderate',
  'comment.like',
  'file.upload.comment',
  'file.upload.page',
  'file.delete',
  'personal.my_day',
  'personal.membership_label',
  'personal.reminder_snooze',
  'personal.label',
  'personal.view_preferences',
  /* Facets. Arranging private facets is `personal.view_preferences`. */
  'facet.read',
  'facet.create',
  'facet.rename',
  'facet.hide',
  'facet.reorder',
  'facet.delete',
  'facet.convert_to_shared',
  /* Discussions; comments inside one use the `comment.*` actions. */
  'discussion.read',
  'discussion.create',
  'discussion.edit',
  'discussion.resolve',
  'discussion.reopen',
  'discussion.trash',
  'discussion.restore',
  'discussion.trash.own_unshared',
  'discussion.purge',
  /* Input rounds; reading them is `discussion.read`. */
  'input_round.open',
  'input_round.close',
  'input_round.respond',
] as const

export type FolderAction = (typeof FOLDER_ACTIONS)[number]

/** How ownership participates: `ignored` (preset decides), `required` (owner
 * and the preset bar), `sufficient` (owner, or anyone meeting the bar). */
type OwnerRule = 'ignored' | 'required' | 'sufficient'

interface ActionRule {
  /** Least preset for any target; `null` means only the owner rule decides. */
  atLeast: FolderAccessPreset | null
  /** Presets admitted when the target Task's current assignee is the actor. */
  whenAssignedToActor?: readonly FolderAccessPreset[]
  /** Any preset, when the target member is the actor and their self-edit grant is set (#230). */
  whenSelfEditGranted?: true
  /** Any preset, when the target facet is the actor's private facet. */
  whenOwnPrivateFacet?: true
  /** Also admitted when the actor created the target and holds at least this preset. */
  whenCreatorAtLeast?: FolderAccessPreset
  owner?: OwnerRule
  /** The actor must also be the target's author: an extra condition, never a substitute. */
  requiresAuthor?: boolean
  personal?: boolean
  /** The refusal sentence the person reads. */
  why: string
}

/*
Can edit is the bar for ordinary shared work, including the Folder's profile
and page. Full control is the bar for anything irreversible or about people.
*/
const RULES: Record<FolderAction, ActionRule> = {
  'folder.read': {
    atLeast: 'can_view',
    why: 'You need Can view access to see this folder.',
  },
  'folder.profile.edit': {
    atLeast: 'can_edit',
    why: 'You need Can edit access to rename this folder or change its description, icon, color or cover.',
  },
  'folder.page.edit': {
    atLeast: 'can_edit',
    why: 'You need Can edit access to edit pages in this folder.',
  },
  'folder.section.manage': {
    atLeast: 'can_edit',
    /* The page-actions route asks this for every page edit, so the sentence
       names both page and sections. */
    why: "You need Can edit access to edit this folder's page or its sections.",
  },
  'folder.duplicate': {
    atLeast: 'can_edit',
    why: 'You need Can edit access to duplicate this folder.',
  },
  'folder.trash': {
    atLeast: 'full_control',
    /* Narrower reading of a recoverable act: widening later is easier than
       taking a power away. */
    why: 'Only people with Full control can move this folder to Trash.',
  },
  'folder.restore': {
    atLeast: 'full_control',
    owner: 'sufficient',
    /* The owner can always restore, even after lowering their own Access. */
    why: "Only the folder's owner or people with Full control can restore this folder from Trash.",
  },
  'folder.destroy': {
    atLeast: 'full_control',
    owner: 'required',
    /* Both: the owner, and only while they hold Full control. */
    why: "Only the folder's owner, while they have Full control, can permanently delete this folder.",
  },
  'folder.ownership.transfer': {
    atLeast: null,
    owner: 'required',
    /* Ownership is custody, not Access. */
    why: "Only the folder's owner can transfer ownership of this folder.",
  },
  'owner.custody_recovery': {
    atLeast: null,
    owner: 'required',
    why: "Only the folder's owner can restore their own access to Full control.",
  },
  'member.add': {
    atLeast: 'full_control',
    why: 'Only people with Full control can add members to this folder.',
  },
  'member.remove': {
    atLeast: 'full_control',
    why: 'Only people with Full control can remove members from this folder.',
  },
  'member.leave': {
    atLeast: 'can_view',
    /* Owner and last-Full-control refusals are state; the route answers 409. */
    why: 'You need Can view access to leave this folder.',
  },
  'member.access.change': {
    atLeast: 'full_control',
    why: "Only people with Full control can change a member's access.",
  },
  'member.access.history.read': {
    atLeast: 'can_view',
    why: "You need Can view access to see this folder's access history.",
  },
  'responsibility.read': {
    atLeast: 'can_view',
    why: "You need Can view access to see a member's Responsibilities.",
  },
  'responsibility.history.read': {
    atLeast: 'can_view',
    why: "You need Can view access to see earlier versions of a member's Responsibilities.",
  },
  'responsibility.manage': {
    atLeast: 'full_control',
    why: "Only people with Full control can edit a member's Responsibilities.",
  },
  'responsibility.edit.own': {
    atLeast: null,
    whenSelfEditGranted: true,
    /* Asked after `responsibility.manage` refuses, so the sentence fits both cases. */
    why: 'Only people with Full control can edit Responsibilities, unless you have been given permission to edit your own.',
  },
  'responsibility.self_edit_grant.manage': {
    atLeast: 'full_control',
    /* Otherwise a member could grant themselves the thing it withholds. */
    why: 'Only people with Full control can let a member edit their own Responsibilities.',
  },
  'invite.create': {
    atLeast: 'full_control',
    why: 'Only people with Full control can invite people to this folder.',
  },
  'invite.administer': {
    atLeast: 'full_control',
    /* Having sent an invite is not authority; a downgraded inviter loses this. */
    why: 'Only people with Full control can cancel or resend invitations to this folder.',
  },
  'invite.view': {
    atLeast: 'full_control',
    /* An invite carries an email address and the Access it grants. */
    why: "Only people with Full control can see this folder's pending invitations.",
  },
  'task.create': {
    atLeast: 'can_contribute',
    why: 'You need Can contribute access to add tasks to this folder.',
  },
  'task.edit': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute'],
    why: 'You need Can edit access to edit this task, or Can contribute access if it is assigned to you.',
  },
  'task.assign': {
    atLeast: 'can_edit',
    /* Reassigning is planning authority, even over one's own task. */
    why: 'You need Can edit access to change who this task is assigned to.',
  },
  'task.move': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute'],
    /* A move into another folder also needs Can edit there; the caller passes no
       assignee for that check, so this arm cannot cross folders. */
    why: 'You need Can edit access to move this task, or Can contribute access to move a task assigned to you within its folder.',
  },
  'task.status.complete': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute', 'assigned_work'],
    why: 'You need Can edit access to complete or reopen this task, or Assigned work access if it is assigned to you.',
  },
  'task.status.abandon': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute'],
    /* Abandon changes the plan, so Assigned work may not, even on its own task. */
    why: 'You need Can edit access to abandon or restore this task, or Can contribute access if it is assigned to you.',
  },
  'task.trash': {
    atLeast: 'can_edit',
    why: 'You need Can edit access to move this task to Trash.',
  },
  'task.restore': {
    atLeast: 'can_edit',
    why: 'You need Can edit access to restore this task from Trash.',
  },
  'task.destroy': {
    atLeast: 'full_control',
    /* Also the rule for permanently deleting a facet, hence "items". */
    why: 'Only people with Full control can permanently delete items from Trash.',
  },
  'task.duplicate': {
    atLeast: 'can_edit',
    /* The copy keeps the source's assignee, so contributors could mint tasks
       assigned to someone else. */
    why: 'You need Can edit access to duplicate this task.',
  },
  'task.dependency.manage': {
    atLeast: 'can_edit',
    /* A dependency affects whoever holds the other task, so no assignee arm. */
    why: 'You need Can edit access to add or remove task dependencies.',
  },
  'task.reminder.manage': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute', 'assigned_work'],
    /* The reminder goes to the assignee, so it is theirs to manage. */
    why: "You need Can edit access to set or clear this task's reminder, or Assigned work access if it is assigned to you.",
  },
  'step.toggle': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute', 'assigned_work'],
    /* Ticking a checklist item is execution; editing items is `task.edit`. */
    why: "You need Can edit access to check or uncheck this task's checklist, or Assigned work access if it is assigned to you.",
  },
  'label.vocabulary.manage': {
    atLeast: 'can_edit',
    why: "You need Can edit access to create, edit or archive this folder's labels.",
  },
  'label.apply': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute'],
    why: 'You need Can edit access to add or remove labels on this task, or Can contribute access if it is assigned to you.',
  },
  'comment.create': {
    atLeast: 'can_comment',
    why: 'You need Can comment access to comment in this folder.',
  },
  'comment.mutate.own': {
    atLeast: 'can_comment',
    requiresAuthor: true,
    /* A member downgraded to Can view keeps their words but cannot change them. */
    why: 'You need Can comment access to edit or delete your comments.',
  },
  'comment.moderate': {
    atLeast: 'full_control',
    why: "Only people with Full control can remove other people's comments.",
  },
  'comment.like': {
    atLeast: 'can_comment',
    why: 'You need Can comment access to like or unlike comments.',
  },
  'file.upload.comment': {
    atLeast: 'can_comment',
    why: 'You need Can comment access to attach files or voice notes to comments.',
  },
  'file.upload.page': {
    atLeast: 'can_edit',
    why: 'You need Can edit access to upload images, covers, audio or video to this folder.',
  },
  'file.delete': {
    atLeast: 'full_control',
    /* Not the uploader: authorship must not become hidden power after a downgrade. */
    why: 'Only people with Full control can delete files from this folder.',
  },
  'personal.my_day': {
    atLeast: 'can_view',
    personal: true,
    why: 'You need Can view access to add this task to My Day.',
  },
  'personal.membership_label': {
    atLeast: 'can_view',
    personal: true,
    why: 'You need Can view access to set your own label and color for this folder.',
  },
  'personal.reminder_snooze': {
    atLeast: 'can_view',
    personal: true,
    why: 'You need Can view access to snooze this reminder.',
  },
  'personal.label': {
    atLeast: 'can_view',
    personal: true,
    why: 'You need Can view access to use your personal labels in this folder.',
  },
  'personal.view_preferences': {
    atLeast: 'can_view',
    personal: true,
    why: 'You need Can view access to arrange your own view of this folder.',
  },
  'facet.read': {
    atLeast: null,
    whenOwnPrivateFacet: true,
    /* Full control and the owner never read a member's private facet. */
    why: 'Only the person a private facet belongs to can see it.',
  },
  'facet.create': {
    atLeast: 'can_edit',
    whenOwnPrivateFacet: true,
    why: 'You need Can edit access to add a shared facet, but you can add a private one.',
  },
  'facet.rename': {
    atLeast: 'can_edit',
    whenOwnPrivateFacet: true,
    why: 'You need Can edit access to rename a shared facet.',
  },
  'facet.hide': {
    atLeast: 'can_edit',
    why: 'You need Can edit access to hide or show this facet.',
  },
  'facet.reorder': {
    atLeast: 'can_edit',
    whenOwnPrivateFacet: true,
    /* A private facet's place is written through `personal.view_preferences`. */
    why: "You need Can edit access to reorder this folder's shared facets.",
  },
  'facet.delete': {
    atLeast: 'can_edit',
    whenOwnPrivateFacet: true,
    /* Also the rule for restoring a facet from Trash. */
    why: 'You need Can edit access to move a shared facet to Trash or restore it.',
  },
  'facet.convert_to_shared': {
    atLeast: 'can_edit',
    whenOwnPrivateFacet: true,
    why: 'You need Can edit access to share this facet, unless it is your own private facet.',
  },
  /* Discussions. Row state ("while open", "no shared activity") is checked by
     the route under the Discussion's lock; this table answers who. */
  'discussion.read': {
    atLeast: 'can_view',
    why: '#320: Can view reads Discussions, Outcomes and their conversation',
  },
  'discussion.create': {
    atLeast: 'can_comment',
    why: '#320 and R8A: Can comment participates in Consultation, which includes opening a Discussion',
  },
  'discussion.edit': {
    atLeast: 'can_edit',
    whenCreatorAtLeast: 'can_comment',
    why: "#320: a Discussion's title and context are edited by its creator while they still have Can comment, or by Can edit, and only while it is open",
  },
  'discussion.resolve': {
    atLeast: 'can_edit',
    whenCreatorAtLeast: 'can_comment',
    why: '#320: a Discussion is resolved, with its Outcome, by its creator while they still have Can comment, or by Can edit',
  },
  'discussion.reopen': {
    atLeast: 'can_edit',
    whenCreatorAtLeast: 'can_comment',
    why: '#320: a Discussion is reopened by its creator while they still have Can comment, or by Can edit',
  },
  'discussion.trash': {
    atLeast: 'can_edit',
    why: '#320: removing a Discussion other people have contributed to is governed shared Work, Can edit and above, and it goes to Trash rather than away',
  },
  'discussion.restore': {
    atLeast: 'can_edit',
    why: '#320: restoring a trashed Discussion is the same governed lifecycle as trashing it',
  },
  'discussion.trash.own_unshared': {
    atLeast: null,
    whenCreatorAtLeast: 'can_comment',
    /* The route admits this only while nobody else has contributed and there is
       no Outcome, and uses it for restore too. Can edit+ is asked `discussion.trash` first. */
    why: '#320: a creator with Can comment may remove their own Discussion only while nobody else has contributed to it and it has no Outcome',
  },
  'discussion.purge': {
    atLeast: 'full_control',
    why: '#320: permanently deleting a Discussion destroys shared history and may break links to it, so it is Full control\'s, like every permanent delete',
  },
  /* Input rounds. The creator is the Discussion's creator; row state is checked
     by the domain under the Discussion's lock. */
  'input_round.open': {
    atLeast: 'can_edit',
    whenCreatorAtLeast: 'can_comment',
    why: "#321: asking for input is the Discussion's creator's while they still have Can comment, or Can edit's in any open Discussion",
  },
  'input_round.close': {
    atLeast: 'can_edit',
    whenCreatorAtLeast: 'can_comment',
    why: "#321: an input round is closed by its Discussion's creator while they still have Can comment, or by Can edit",
  },
  'input_round.respond': {
    atLeast: 'can_comment',
    why: '#321: Can comment submits, changes and withdraws their own response while the round is open; Can view only reads',
  },
}

export function ruleFor(action: FolderAction): Readonly<ActionRule> {
  return RULES[action]
}

export interface FolderActorFacts {
  folderId: string
  actorId: string
  /** The persisted preset, never inferred from ownership, authorship or assignment. */
  access: FolderAccessPreset
  isOwner: boolean
  isDefault: boolean
  /** Rendered by the share-grant email. */
  name: string
  /** Profile Docs use source grants and do not provide a new project workspace. */
  profileDoc?: boolean
}

export interface FolderActionTarget {
  /**
   * The Task's current assignee, read under the mutation's row lock in the same
   * transaction. `undefined`: no Task target; `null`: unassigned.
   */
  assigneeId?: string | null
  authorId?: string | null
  /** The target member and their self-edit grant, read under the same lock (lockedMembership). */
  memberId?: string | null
  selfEditGranted?: boolean
  /**
   * `owner_id` of the target facet, read under the write's row lock. On
   * `facet.create`, pass the actor's id only for a private_blank facet owned by the actor.
   */
  facetOwnerId?: string | null
  /** `discussions.created_by`, read under the Discussion's lock in the writing transaction. */
  creatorId?: string | null
}

export type FolderActionDecision =
  | { allowed: true }
  | { allowed: false; reason: string }

/** The whole answer, as a pure function of durable facts and target facts. */
export function mayPerform(
  facts: FolderActorFacts,
  action: FolderAction,
  target: FolderActionTarget = {},
): FolderActionDecision {
  const rule = RULES[action]

  if (facts.profileDoc === true && !(
    action === 'folder.read' ||
    action === 'folder.page.edit' ||
    action === 'folder.section.manage' ||
    action === 'folder.trash' ||
    action === 'folder.restore' ||
    action === 'folder.destroy' ||
    action === 'file.upload.page' ||
    action === 'file.upload.comment' ||
    action === 'file.delete' ||
    (action === 'folder.profile.edit' && facts.access === 'full_control')
  )) {
    return { allowed: false, reason: 'This action is not available on a profile Doc.' }
  }

  if (rule.requiresAuthor === true) {
    if (target.authorId === undefined || target.authorId !== facts.actorId) {
      return {
        allowed: false,
        reason: 'Only the author can change their own comment.',
      }
    }
  }

  const byPreset =
    rule.atLeast !== null && atLeast(facts.access, rule.atLeast)

  const byAssignment =
    !byPreset &&
    rule.whenAssignedToActor !== undefined &&
    target.assigneeId !== undefined &&
    target.assigneeId !== null &&
    target.assigneeId === facts.actorId &&
    rule.whenAssignedToActor.includes(facts.access)

  /* The memberId === actorId comparison is the actor binding: without it a
     granted member's document would be writable by the whole folder. */
  const bySelfEditGrant =
    !byPreset &&
    rule.whenSelfEditGranted === true &&
    target.selfEditGranted === true &&
    target.memberId !== undefined &&
    target.memberId !== null &&
    target.memberId === facts.actorId

  /* A null or absent facetOwnerId authorizes nothing. */
  const byOwnPrivateFacet =
    !byPreset &&
    rule.whenOwnPrivateFacet === true &&
    target.facetOwnerId !== undefined &&
    target.facetOwnerId !== null &&
    target.facetOwnerId === facts.actorId

  /* A creator below the floor is refused. */
  const byCreator =
    !byPreset &&
    rule.whenCreatorAtLeast !== undefined &&
    target.creatorId !== undefined &&
    target.creatorId !== null &&
    target.creatorId === facts.actorId &&
    atLeast(facts.access, rule.whenCreatorAtLeast)

  const qualified =
    byPreset ||
    byAssignment ||
    bySelfEditGrant ||
    byOwnPrivateFacet ||
    byCreator
  const owner = rule.owner ?? 'ignored'

  const allowed =
    owner === 'ignored'
      ? qualified
      : owner === 'sufficient'
        ? qualified || facts.isOwner
        : facts.isOwner && (rule.atLeast === null || qualified)

  return allowed ? { allowed: true } : { allowed: false, reason: rule.why }
}
