/*
The Folder action table and the pure resolver over it (issue #228; product
authority accepted #209 R8A for the ladder, #228's own authorization-resolver
section for this shape).

## Why this is in `src/shared/` and not beside the routes

It was in `src/server/domain/folder-access.ts` until 2026-09-20, and the whole
of it moved here unchanged when the client came to need it. The reason is the
reason `src/shared/` exists at all, and it is the defect this move was made to
close rather than a tidying.

**A screen decides what to draw from the same rule the route decides by.** The
sidebar's folder menu gated Rename on `folder.is_owner` while the route gated
it on Can edit, so a Full-control member who was not the owner was offered no
Rename and an owner whose Access had been lowered was still offered Delete.
That is one authority rule written twice, which is what `src/shared/` is for
(the file next door says the same thing about R8A's labels, and
`shared/tasks.ts` has already paid for a second definition once).

So the table below has exactly one copy, both sides import it, and a client
that wants to know whether to draw a control asks `mayPerform` the same
question the route asks.

**That is not the client authorizing anything, and the distinction has to
survive this move.** A projection decides what to *draw*. The answer to "may
this happen" is only ever this table's, reached through a route, on facts the
server read in the transaction that writes. A client that skipped the control
still has to be refused by the route, and every one of the AC-511 to AC-523
criteria drives a real request for exactly that reason. The rule is: **the
client may hide a control it computes here; nothing the client computes here
permits anything.**

`domain/folder-access.ts` keeps everything impure -- reading the facts,
locking the row, writing the history -- and re-exports these names, so a
server caller sees no change.

## The `why` strings are product copy

**Every `why` below is on the wire.** A refused request answers
`{"error":{"code":"forbidden","message":<why>}}`, the client's write-failure
toast shows a 403's message as written, and the folder page shows the same
string when a link asks for an act the person may not perform. So each one is
a single plain sentence for the person refused: it says what the act needs --
an Access level, the folder's owner, or the task being assigned to them -- and
nothing about where the rule came from.

The reasoning behind a rule is a comment beside it, in plain words, and the
product rules themselves are the spec's, 5.4's permission matrix above all. A
`why` has to change whenever its rule's bar or arms do; nothing checks that
the two agree.

## What this table is, and what it is not

**No single place can decide whether a Folder action is authorized**, because
what counts as authorized depends on what is being asked for. What this file is, is the one place that knows *the answer* for every Folder action, so
that the hand-written gates scattered across the routes stop each carrying a
rule of their own.

The distinction matters and is not pedantry. A route decides which action it is performing and which target facts it must read --
that part is irreducibly per-route -- but the answer comes from
`mayPerform` and from nowhere else. #228's authorization-resolver section
asks for exactly that and forbids the two things either side of it -- "do not
scatter independent role checks route-by-route and do not build a generic
RBAC/policy engine": scattered `if (role === ...)`
conditions, and a generic RBAC/policy engine. The vocabulary below is fixed,
enumerable and small on purpose.

## The three durable facts, and the one that is not durable

Authorization resolves from:

- **active Folder membership** -- absent, the answer is 404 and never 403,
  because 10.2 refuses to confirm that a Folder exists to somebody outside it;
- **the persisted Access preset** -- `folder_members.access`, R8A's six;
- **the structural owner fact** -- `folders.owner_id`, custody and not Access.

and, for the two presets whose authority is bounded by the current
assignment, from **the target Task's authoritative current assignee**.

That last one is the dangerous one, and it is why `FolderActionTarget` is a
separate argument rather than a field on the facts. #228's Assigned-work
rule is that the assignee condition be evaluated in the same
transaction and snapshot as the mutation it authorizes: a projection saying
"assigned to me", however fresh, must never authorize after a reassignment. In
this codebase the row lock that makes that true already exists -- `lockedTask`
in `domain/tasks.ts` takes `FOR UPDATE OF t` and returns `assigneeId` -- so the
rule for a caller is simply: pass the assignee you read under that lock, in
that transaction, and nothing else.

**A browser has none of those guarantees**, which is the other half of the
projection rule above: a client's `access` came from a response that was true
when it was written, and the assignee it holds is a projection by definition.
That is enough to decide whether to draw a button and is never enough to
decide whether something may happen.
*/
import { FOLDER_ACCESS_PRESETS, folderAccessPreset } from './folder-access.js'
import type { FolderAccessPreset } from './folder-access.js'

/* ------------------------------------------------------------------ *
 * The ladder
 * ------------------------------------------------------------------ */

/** The ladder's own order, most authority first. This is the one place the
 * order of `FOLDER_ACCESS_PRESETS` is load-bearing. */
const RANK = new Map<FolderAccessPreset, number>(
  FOLDER_ACCESS_PRESETS.map((preset, index) => [preset, index]),
)

/** "at least as much authority as", by the R8A ladder. A preset not in the
 * map cannot happen -- the column's CHECK and the shared enum agree on the
 * six -- and is treated as the least authority rather than the most, which is
 * the only safe direction for an impossible value. */
export function atLeast(
  held: FolderAccessPreset,
  required: FolderAccessPreset,
): boolean {
  const heldRank = RANK.get(held)
  const requiredRank = RANK.get(required)
  if (heldRank === undefined || requiredRank === undefined) return false
  return heldRank <= requiredRank
}

/** Parses a stored preset. An unreadable value is refused rather than
 * defaulted, because every default here would be a guess about authority. */
export function presetOf(value: unknown): FolderAccessPreset | null {
  const parsed = folderAccessPreset.safeParse(value)
  return parsed.success ? parsed.data : null
}

/* ------------------------------------------------------------------ *
 * The fixed action vocabulary
 * ------------------------------------------------------------------ */

/**
 * Every Folder action Dana can perform in M1. The list is closed: an action
 * that is not here is either outside Folder Access (personal, account or
 * system state, and the audit in the pull request says which) or it has not
 * been thought about, and the second must not be able to hide inside the
 * first.
 *
 * Five of them carry `personal: true` below. Those are governed by membership
 * and by nothing else, because #228's personal-actions rule puts personal
 * state outside Folder Access outright: a Can-view member may still put a Task they can see on
 * their own My Day. They are listed here rather than left unlisted so that the
 * mapping is total and provable, which is acceptance proof 24.
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
  'step.manage',
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
  /* The M1-F facet framework (issue #210): seven rows and one per-rule flag.

     There is deliberately **no eighth action for the private order write**.
     Arranging the private facets only you can see is the existing
     `personal.view_preferences`, which is #228's personal-actions rule
     putting a member's own arrangement outside Folder Access entirely. */
  'facet.read',
  'facet.create',
  'facet.rename',
  'facet.hide',
  'facet.reorder',
  'facet.delete',
  'facet.convert_to_shared',
  /* Consultation (issue #320): Discussions and their Outcomes. Commenting
     inside a Discussion stays on the `comment.*` rows above; these govern
     the Discussion itself. Outcomes have no action of their own because an
     Outcome is only ever created by resolving and is never edited. */
  'discussion.read',
  'discussion.create',
  'discussion.edit',
  'discussion.resolve',
  'discussion.reopen',
  'discussion.trash',
  'discussion.restore',
  'discussion.trash.own_unshared',
  'discussion.purge',
  /* Consultation structured input (issue #321): "Ask for input" rounds
     inside a Discussion. Reading rounds, responses and counts is
     `discussion.read`; these govern the round and one's own response. */
  'input_round.open',
  'input_round.close',
  'input_round.respond',
] as const

export type FolderAction = (typeof FOLDER_ACTIONS)[number]

/** How the structural owner fact participates in an action.
 *
 * - `ignored`   -- ownership says nothing; the preset decides (the usual case,
 *                  and R5's whole point: ordinary Work and member
 *                  administration follow Access, not ownership);
 * - `required`  -- a custody act: the actor must be the owner, *and* meet the
 *                  preset bar where one is named;
 * - `sufficient`-- custody recovery: the owner may do it whatever their
 *                  ordinary preset, and so may anyone meeting the bar.
 */
type OwnerRule = 'ignored' | 'required' | 'sufficient'

interface ActionRule {
  /** The least preset that may perform this on any target. `null` means no
   * preset qualifies and the owner rule alone decides. */
  atLeast: FolderAccessPreset | null
  /** Presets that may perform it on a Task whose authoritative current
   * assignee is the actor. Evaluated only when the caller supplies an
   * assignee, because an action with no Task target has no such boundary. */
  whenAssignedToActor?: readonly FolderAccessPreset[]
  /**
   * R7 section O's explicit narrow grant (issue #230): the action is admitted
   * at *any* preset when the target member is the actor themselves and that
   * member's `can_edit_own_responsibilities` is set.
   *
   * It is deliberately a per-action flag rather than a preset, because R7
   * section O says what it is not: "not a sixth Access level ... this
   * permission is explicit and narrow; it must not silently widen any other
   * Work permission". Exactly one action carries it, and AC-563 enumerates
   * every other action in the vocabulary to prove the grant moves none of
   * them -- forty-nine of them when #230 wrote it, fifty-six since #210 added
   * the facet family, and the loop counts them rather than naming a number.
   */
  whenSelfEditGranted?: true
  /**
   * Issue #210's facet grant, and it behaves exactly as
   * `whenSelfEditGranted` above does: the action is admitted at *any* preset
   * when `target.facetOwnerId` is the actor themselves.
   *
   * It is a per-action flag rather than a preset for the same reason that
   * one is. #209's rule that ownership is custody and never authority is
   * preserved exactly: this moves **one action, for one row, for one
   * person**, and widens nothing else. A private facet is a document nobody
   * but its owner can read, so the alternative -- a preset bar -- would have
   * meant either that Full control reads a member's private facet, which is
   * the one place custody-is-not-authority actually bites, or that its owner
   * cannot rename their own.
   *
   * Read under the facet row's lock **in the transaction that writes**,
   * which is the transactional requirement `assigneeId` and `memberId` carry
   * and is not weakened here: a projection saying "this facet is mine",
   * however fresh, must never authorize after a conversion to shared.
   */
  whenOwnPrivateFacet?: true
  /**
   * Issue #320's creator stewardship: the action is also admitted when
   * `target.creatorId` is the actor **and** the actor's preset is at least
   * this one. Both halves are load-bearing: authorship is provenance and
   * never standing authority (#228), so a creator lowered below the bar
   * loses the power at once. Read `creatorId` under the Discussion row's
   * lock in the writing transaction, as `facetOwnerId` is.
   */
  whenCreatorAtLeast?: FolderAccessPreset
  owner?: OwnerRule
  /** The actor must also be the author of the target (a comment). Authorship
   * is provenance and never standing authority, so this is an *extra*
   * condition on top of `atLeast` and never a substitute for it. */
  requiresAuthor?: boolean
  /** Personal state that Folder Access does not govern beyond membership. */
  personal?: boolean
  /** The sentence a refusal carries, read by the person refused: what the act
   * needs, in the product's words. The reason the rule is what it is belongs
   * in a comment beside it, never here. */
  why: string
}

/*
The table. Each `why` is the sentence a refused person reads, so it says what
the act needs and nothing more. Where the reason for a rule is not obvious
from its bar, a comment beside the entry says why in plain words, because the
next person to read a line will otherwise have to reconstruct the argument
from the shape of the code, which is how a capability boundary drifts.

Two systematic notes rather than repeating them forty times.

**`can_edit` is the bar for all ordinary shared Work**, including the Folder's
identity -- its name, description, icon, color and cover -- and the Folder
page. Can edit plans and changes all of a Folder's shared work, and a Folder's
profile is part of that work rather than people administration.

**`full_control` is the bar for everything irreversible or about people**:
member and invite administration, moderating somebody else's comment, the
permanent deletes, and moving the Folder itself to Trash. Full control
administers members, Access, Responsibilities and all shared work; Can edit
changes the work but never administers people or Access. The Folder's own trip
to Trash is the one line that could be read either way, and the entry says
which reading was taken and why.
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
    /* Sections are the folder's structure. Can contribute may place their own
       task among the existing sections, but may not create, delete or reorder
       the sections themselves. The page-actions route asks this for every
       action its body can carry, ordinary page edits included, so the
       sentence names both. */
    why: "You need Can edit access to edit this folder's page or its sections.",
  },
  'folder.duplicate': {
    atLeast: 'can_edit',
    /* Copying a whole shared work structure is more than ordinary
       participation. */
    why: 'You need Can edit access to duplicate this folder.',
  },
  'folder.trash': {
    atLeast: 'full_control',
    /* The one line that could be read either way: moving a Folder to Trash is
       recoverable, like the shared work Can edit may change, and it is also
       administrative deletion. The narrower reading was taken because widening
       later is a decision while narrowing later takes away something people
       already had. AC-015 carries the argument. */
    why: 'Only people with Full control can move this folder to Trash.',
  },
  'folder.restore': {
    atLeast: 'full_control',
    owner: 'sufficient',
    /* Full control restores, and so does the owner whatever their own
       Access: recovery stays with custody, so an owner who lowered
       themselves can always get their folder back. */
    why: "Only the folder's owner or people with Full control can restore this folder from Trash.",
  },
  'folder.destroy': {
    atLeast: 'full_control',
    owner: 'required',
    /* Custody and current administrative authority at once: the owner, and
       only while they hold Full control. Either alone is refused. */
    why: "Only the folder's owner, while they have Full control, can permanently delete this folder.",
  },
  'folder.ownership.transfer': {
    atLeast: null,
    owner: 'required',
    /* Ownership is custody rather than Access, so Full control does not
       confer it. */
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
    /* Leaving is any member's. The refusals a leaver actually meets are
       state rather than Access -- the owner transfers ownership first, and
       the last Full-control member cannot walk out -- and the route answers
       each with a 409 and its own sentence. */
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
    /* Folder-visible: a statement of scope that coordinates shared work has
       to be readable by the people it coordinates. */
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
    /* A write `responsibility.manage` refuses is asked again here, and this
       is the sentence the refused person reads -- whether the document was
       their own or somebody else's -- so it has to be true of both. */
    why: 'Only people with Full control can edit Responsibilities, unless you have been given permission to edit your own.',
  },
  'responsibility.self_edit_grant.manage': {
    atLeast: 'full_control',
    /* Member administration: a member who could turn their own grant on
       would be granting themselves the thing it exists to withhold. */
    why: 'Only people with Full control can let a member edit their own Responsibilities.',
  },
  'invite.create': {
    atLeast: 'full_control',
    why: 'Only people with Full control can invite people to this folder.',
  },
  'invite.administer': {
    atLeast: 'full_control',
    /* Having sent an invite is provenance rather than standing authority, so
       an inviter who is later downgraded loses this. */
    why: 'Only people with Full control can cancel or resend invitations to this folder.',
  },
  'invite.view': {
    atLeast: 'full_control',
    /* A pending invitation carries an email address and the Access it would
       grant, which is member-administration data rather than ordinary work. */
    why: "Only people with Full control can see this folder's pending invitations.",
  },
  'task.create': {
    atLeast: 'can_contribute',
    /* Originating work, including choosing its first assignee. */
    why: 'You need Can contribute access to add tasks to this folder.',
  },
  'task.edit': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute'],
    /* Can contribute fully plans work currently assigned to them and nobody
       else's; Assigned work executes a plan and may not change it. */
    why: 'You need Can edit access to edit this task, or Can contribute access if it is assigned to you.',
  },
  'task.assign': {
    atLeast: 'can_edit',
    /* Changing who holds an existing task is planning authority, which Can
       contribute does not have even over their own. */
    why: 'You need Can edit access to change who this task is assigned to.',
  },
  'task.move': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute'],
    /* Can contribute moves their own current task among the existing
       sections. A move into another folder also needs Can edit there, which
       the caller asks with no assignee so that this arm cannot cross from one
       folder into the next. */
    why: 'You need Can edit access to move this task, or Can contribute access to move a task assigned to you within its folder.',
  },
  'task.status.complete': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute', 'assigned_work'],
    /* Completing and reopening are execution, which is what Assigned work
       is for. */
    why: 'You need Can edit access to complete or reopen this task, or Assigned work access if it is assigned to you.',
  },
  'task.status.abandon': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute'],
    /* Abandoning and restoring change the plan rather than execute it, so
       Assigned work is refused them even on their own task. */
    why: 'You need Can edit access to abandon or restore this task, or Can contribute access if it is assigned to you.',
  },
  'task.trash': {
    atLeast: 'can_edit',
    /* Can contribute may not trash shared tasks, their own included. */
    why: 'You need Can edit access to move this task to Trash.',
  },
  'task.restore': {
    atLeast: 'can_edit',
    why: 'You need Can edit access to restore this task from Trash.',
  },
  'task.destroy': {
    atLeast: 'full_control',
    /* Irreversible, so Full control's, and ownership plays no part. It is
       also the rule for permanently deleting a facet from Trash, which is why
       the sentence says items rather than tasks. */
    why: 'Only people with Full control can permanently delete items from Trash.',
  },
  'task.duplicate': {
    atLeast: 'can_edit',
    /* Not Can contribute: the copy keeps the source's assignee, so a
       contributor could mint copies of somebody else's task still assigned to
       that person. */
    why: 'You need Can edit access to duplicate this task.',
  },
  'task.dependency.manage': {
    atLeast: 'can_edit',
    /* A dependency imposes planning consequences on whoever holds the other
       task, so it has no assignee arm. */
    why: 'You need Can edit access to add or remove task dependencies.',
  },
  'task.reminder.manage': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute', 'assigned_work'],
    /* Dana delivers the reminder to the assignee, so setting and clearing it
       belongs to them. */
    why: "You need Can edit access to set or clear this task's reminder, or Assigned work access if it is assigned to you.",
  },
  'step.toggle': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute', 'assigned_work'],
    /* Ticking an existing step is execution. */
    why: "You need Can edit access to check or uncheck this task's steps, or Assigned work access if it is assigned to you.",
  },
  'step.manage': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute'],
    /* Adding, renaming, reordering, deleting or promoting a step rewrites the
       checklist that defines completion, which is not execution, so Assigned
       work is refused it. */
    why: "You need Can edit access to add, change or remove this task's steps, or Can contribute access if it is assigned to you.",
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
    /* Authorship is provenance rather than standing authority, so a member
       downgraded to Can view keeps their old words and loses the power to
       change them. */
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
    /* Not the uploader: authorship must not survive a downgrade as hidden
       power to delete. */
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
  /* ---------------------------------------------------------------- *
   * The facet framework (issue #210)
   * ---------------------------------------------------------------- */
  'facet.read': {
    atLeast: null,
    whenOwnPrivateFacet: true,
    /* No Access level qualifies: Full control and the folder's owner read no
       member's private facet, which is where custody-is-not-authority
       actually bites. */
    why: 'Only the person a private facet belongs to can see it.',
  },
  'facet.create': {
    atLeast: 'can_edit',
    whenOwnPrivateFacet: true,
    /* A shared facet is structure, like a section; a private facet of your
       own is yours to make. */
    why: 'You need Can edit access to add a shared facet, but you can add a private one.',
  },
  'facet.rename': {
    atLeast: 'can_edit',
    whenOwnPrivateFacet: true,
    why: 'You need Can edit access to rename a shared facet.',
  },
  'facet.hide': {
    atLeast: 'can_edit',
    /* Hiding a native facet changes what every member sees. */
    why: 'You need Can edit access to hide or show this facet.',
  },
  'facet.reorder': {
    atLeast: 'can_edit',
    whenOwnPrivateFacet: true,
    /* The shared order is folder data; a private facet's place is its
       owner's, written through `personal.view_preferences`. */
    why: "You need Can edit access to reorder this folder's shared facets.",
  },
  'facet.delete': {
    atLeast: 'can_edit',
    whenOwnPrivateFacet: true,
    /* Also the rule for restoring a facet from Trash, so the sentence names
       both. */
    why: 'You need Can edit access to move a shared facet to Trash or restore it.',
  },
  'facet.convert_to_shared': {
    atLeast: 'can_edit',
    whenOwnPrivateFacet: true,
    /* **The route requires the actor to be the owner as well**, and the two
       conditions are not interchangeable. Exposing content to the Folder
       creates shared Work, so it takes Can edit; and it is somebody's
       private writing, so it takes their consent. Neither alone is enough,
       and the second half cannot be expressed here because this table
       answers "may this preset do this" rather than "is this the right
       person". `routes/facets.ts` asks both, in that order. */
    why: 'You need Can edit access to share this facet, unless it is your own private facet.',
  },
  /* ---------------------------------------------------------------- *
   * Consultation (issue #320). "While open" and "no shared activity"
   * are facts about the row, not about the actor, and the route checks
   * them under the Discussion's lock; this table answers who.
   * ---------------------------------------------------------------- */
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
    /* The route admits this only while the Discussion has no comment from
       anyone but its creator, no structured-input response and no Outcome
       (#320's accidental-Discussion boundary), and uses it for restore as
       well as trash: a Discussion trashed on this path cannot have gained
       activity while in Trash. Can edit+ never needs it -- the route asks
       `discussion.trash` first. */
    why: '#320: a creator with Can comment may remove their own Discussion only while nobody else has contributed to it and it has no Outcome',
  },
  'discussion.purge': {
    atLeast: 'full_control',
    why: '#320: permanently deleting a Discussion destroys shared history and may break links to it, so it is Full control\'s, like every permanent delete',
  },
  /* Structured input (issue #321). "The Discussion is open and not in
     Trash" and "the round is open" are facts about rows, checked by the
     domain under the Discussion's lock; this table answers who. The creator
     here is the **Discussion's** creator (`target.creatorId`), which is
     #321's stewardship: there is no Poll Admin or Facilitator role. */
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

/** The rule behind an action, for the audit criterion and for a refusal that
 * wants to say why. */
export function ruleFor(action: FolderAction): Readonly<ActionRule> {
  return RULES[action]
}

/* ------------------------------------------------------------------ *
 * The facts
 * ------------------------------------------------------------------ */

export interface FolderActorFacts {
  folderId: string
  actorId: string
  /** The persisted preset. Never inferred from ownership, authorship,
   * assignment, membership age or anything else (R8A). */
  access: FolderAccessPreset
  /** Structural custody, `folders.owner_id`. Not an Access preset. */
  isOwner: boolean
  isDefault: boolean
  /** The folder's name, which the share-grant email renders; it rides this
   * read because every grant call site resolves access first. */
  name: string
}

export interface FolderActionTarget {
  /**
   * The Task's authoritative current assignee, read in the *same*
   * transaction and snapshot as the mutation this authorizes, under the row
   * lock that mutation takes. `undefined` means the action has no Task
   * target; `null` means the Task is unassigned.
   */
  assigneeId?: string | null
  /** The author of the comment the action targets. */
  authorId?: string | null
  /**
   * The member whose Responsibility standing the action targets (issue #230),
   * and that member's explicit self-edit grant.
   *
   * These live here rather than on `FolderActorFacts` for the reason
   * `assigneeId` does, which is the whole of R7's transactional requirement
   * restated for a different column: the grant must be read in the *same*
   * transaction and snapshot as the write it authorizes, under the same row
   * lock, so that a grant revoked a moment ago cannot authorize through a
   * projection that is merely fresh. `lockedMembership` is where a caller
   * reads both.
   */
  memberId?: string | null
  selfEditGranted?: boolean
  /**
   * The `owner_id` of the facet the action targets (issue #210), which is
   * non-null for a `private_blank` facet and null for every other kind --
   * `folder_facets_owner_kind_check` makes that a database fact.
   *
   * It lives here rather than on `FolderActorFacts` for the reason
   * `assigneeId` and `memberId` do, and the reason is the same sentence
   * about transactions: it must be read in the *same* transaction and
   * snapshot as the write it authorizes, under the row lock that write
   * takes, so that a facet converted to shared a moment ago cannot
   * authorize through a projection that is merely fresh. `lockedFacet` in
   * `server/domain/facets.ts` is where a caller reads it.
   *
   * **On `facet.create` there is no row yet**, and the caller passes the
   * actor's own id exactly when the requested kind is `private_blank` and
   * the requested owner is the actor. Nothing else may pass it.
   */
  facetOwnerId?: string | null
  /**
   * `discussions.created_by` of the Discussion the action targets (issue
   * #320), read under that row's lock in the transaction that writes, for
   * the `authorId` reason. It authorizes only through a rule's
   * `whenCreatorAtLeast`, and only at that preset or above, so a creator
   * downgraded below Can comment loses every creator power at once.
   */
  creatorId?: string | null
}

export type FolderActionDecision =
  | { allowed: true }
  | { allowed: false; reason: string }

/**
 * The whole answer, as a pure function of durable facts and target facts.
 *
 * Pure on purpose: it is the part that can be exhaustively tested without a
 * database, and the part a future API or agent caller can reach without going
 * through HTTP. Everything impure -- reading the facts, locking the row,
 * writing the history -- is the caller's, and the caller is a transaction.
 */
export function mayPerform(
  facts: FolderActorFacts,
  action: FolderAction,
  target: FolderActionTarget = {},
): FolderActionDecision {
  const rule = RULES[action]

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

  /* R7 section O, issue #230. Narrow in three ways at once, and each one is
     load-bearing: only an action whose rule opts in, only when the target
     member is the actor themselves, and only when the grant that was read
     under the write's own lock is set. A grant with no `memberId` beside it
     authorizes nothing, so a caller who forgets to say whose Responsibility
     this is gets a refusal rather than a self-edit of somebody else's.

     **`target.memberId === facts.actorId` is the whole of the actor binding
     and it is the dangerous one to lose.** The grant read here is the
     *target's*, which is right -- it is theirs to give -- so without this
     comparison the answer would depend only on facts about the subject, and
     a granted member's document would be writable by the whole folder.
     AC-563 drives that at every preset below the bar; deleting this line was
     measured on 2026-09-21 to leave every other file of #230 green. */
  const bySelfEditGrant =
    !byPreset &&
    rule.whenSelfEditGranted === true &&
    target.selfEditGranted === true &&
    target.memberId !== undefined &&
    target.memberId !== null &&
    target.memberId === facts.actorId

  /* Issue #210, and it is `bySelfEditGrant` above with one condition
     instead of two: only an action whose rule opts in, and only when the
     facet the caller read under the write's own lock is owned by the actor.
     A `facetOwnerId` of null -- which is every facet that is not a private
     blank, by `folder_facets_owner_kind_check` -- authorizes nothing, and so
     does an absent one, so a caller who forgets to say whose facet this is
     gets a refusal rather than a write on somebody else's.

     There is no `memberId`-style second binding to lose here, because the
     comparison *is* the binding: the value compared is the facet's own
     owner and the value it is compared against is the actor. */
  const byOwnPrivateFacet =
    !byPreset &&
    rule.whenOwnPrivateFacet === true &&
    target.facetOwnerId !== undefined &&
    target.facetOwnerId !== null &&
    target.facetOwnerId === facts.actorId

  /* Issue #320. The creator binding and the preset floor together: a
     creator below `whenCreatorAtLeast` is refused, which is "a downgrade
     below Can comment removes creator mutation powers". */
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
