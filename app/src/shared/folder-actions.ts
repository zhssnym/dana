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

## Which record every line below cites

The R-numbered records are in #209. Every `why` below names one of four, and
only these four: R7 is superseded by R8A and is authority for nothing.

- **accepted R8A** -- for the six presets and what each of them is *for*;
- **#228's capability boundaries**, the product issue's own per-preset lists,
  whose stated canonical authority is accepted R8A and R10B, for the rules
  finer-grained than R8A's six lines;
- **governing R5/R6**, which R8A's supersession clause keeps governing for
  structural ownership and explicit owner succession;
- **Hassan's ruling on #228** for `folder.trash`, which R8A does not settle
  either way.

**These `why` strings are on the wire.** A refused mutation answers
`{"error":{"code":"forbidden","message":<why>}}`, so this is product copy read
by a person and not only a comment read by the next developer.

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
  /** The sentence a refusal carries and the reason the rule is what it is. */
  why: string
}

/*
The table. Every entry cites the accepted rule it transcribes, because the
next person to read a line will otherwise have to reconstruct the argument
from the shape of the code, which is how a capability boundary drifts.

Two systematic notes rather than repeating them forty times.

**`can_edit` is the bar for all ordinary shared Work**, including Folder
identity and the Folder page: accepted R8A gives Can edit "plan/change all
shared Folder work", and #228's Can-edit list names "Folder
name/description/icon/color/cover" and the "Folder page/composer" inside it. A
Folder's profile is ordinary shared Work and not people administration.

**`full_control` is the bar for everything irreversible or about people**:
member and invite administration, moderating somebody else's comment, the
permanent deletes, and moving the Folder itself to Trash. Accepted R8A gives
Full control "administer members, Access, Responsibilities and all shared
Folder work" and denies Can edit the power to "administer people/Access";
#228's Full-control list carries the permanent deletes and the moderation; and
the Folder's own trip to Trash is Hassan's ruling on #228, which R8A does
not settle.
*/
const RULES: Record<FolderAction, ActionRule> = {
  'folder.read': {
    atLeast: 'can_view',
    why: 'accepted R8A: Can view is read only, so every preset reads ordinary Folder-visible content',
  },
  'folder.profile.edit': {
    atLeast: 'can_edit',
    why: "accepted R8A: Can edit plans and changes all shared Folder work, and #228 names a Folder's name, description, icon, colour and cover inside it",
  },
  'folder.page.edit': {
    atLeast: 'can_edit',
    why: "#228's Can-edit list: the Folder page and composer are ordinary shared Work",
  },
  'folder.section.manage': {
    atLeast: 'can_edit',
    why: "#228's Can-contribute list: they may place their own Task among existing Sections but may not create, delete or reorder the Sections themselves",
  },
  'folder.duplicate': {
    atLeast: 'can_edit',
    why: "#228's Can-edit list puts duplication of Folders and workflow content there: copying a whole shared work structure is more than ordinary read participation",
  },
  'folder.trash': {
    atLeast: 'full_control',
    /* The one line here that no accepted record settles. R8A's "Can edit may
       change all shared Folder work" reads either way for trashing the whole
       Folder; the narrower reading was taken because the recoverable
       direction of a wrong call is the restrictive one. AC-015 carries the
       argument in full. */
    why: "Hassan's ruling of 2026-09-20 on #228: moving a Folder to Trash is recoverable administrative deletion, which is Full control's",
  },
  'folder.restore': {
    atLeast: 'full_control',
    owner: 'sufficient',
    why: "#228's Full-control list -- trash/restore Folder administratively -- with governing R5 keeping recovery with custody, so the owner may restore a trashed Folder even when their ordinary Access is lower",
  },
  'folder.destroy': {
    atLeast: 'full_control',
    owner: 'required',
    why: '#228 and governing R5: permanent Folder destruction requires the owner and current Full control together, custody and active administrative authority at once',
  },
  'folder.ownership.transfer': {
    atLeast: null,
    owner: 'required',
    why: "governing R5 and R6: transferring ownership is the owner's alone, and Full control does not confer it",
  },
  'owner.custody_recovery': {
    atLeast: null,
    owner: 'required',
    why: 'R5 and R9 section 8: only the structural owner may restore their own Access to Full control, and the transition is recorded as recovery rather than as an ordinary grant',
  },
  'member.add': {
    atLeast: 'full_control',
    why: 'accepted R8A: administering members is Full control\'s, and Can edit cannot administer people or Access',
  },
  'member.remove': {
    atLeast: 'full_control',
    why: "accepted R8A and #228's Full-control list: only Full control removes a non-owner member",
  },
  'member.leave': {
    atLeast: 'can_view',
    why: "governing R6: leaving is any member's, subject to the continuity invariant and to the owner's transfer-first rule, which are state rather than preset",
  },
  'member.access.change': {
    atLeast: 'full_control',
    why: "accepted R8A: administering Access is Full control's, and a non-owner member's preset is changed by nobody below it",
  },
  'member.access.history.read': {
    atLeast: 'can_view',
    why: 'R9 section 13: effective Access-change history is visible to current Folder members',
  },
  'responsibility.read': {
    atLeast: 'can_view',
    why: 'R5 and R10: the Responsibility document is Folder-visible in M1, because a statement of scope that coordinates shared work has to be readable by the people it coordinates',
  },
  'responsibility.history.read': {
    atLeast: 'can_view',
    why: 'R10 "Prior versions": authorized current Folder members inspect prior revisions according to ordinary Folder visibility',
  },
  'responsibility.manage': {
    atLeast: 'full_control',
    why: "R7 section O and R10: without the explicit self-edit grant, only Full control may write a member's Responsibility document",
  },
  'responsibility.edit.own': {
    atLeast: null,
    whenSelfEditGranted: true,
    why: 'R7 section O: editing your own Responsibility needs the explicit self-edit grant, which only Full control may give you',
  },
  'responsibility.self_edit_grant.manage': {
    atLeast: 'full_control',
    why: "R7 section L and #230: turning a member's self-edit grant on or off is member administration, and a member who could turn their own on would be granting themselves the thing the grant exists to withhold",
  },
  'invite.create': {
    atLeast: 'full_control',
    why: 'accepted R8A: inviting into the Folder is administering members, which Can edit explicitly cannot do',
  },
  'invite.administer': {
    atLeast: 'full_control',
    why: '#228: managing pending Folder invitations is Full control\'s, and #228\'s authorship rule makes "I created the invite" provenance rather than standing authority',
  },
  'invite.view': {
    atLeast: 'full_control',
    why: '#228: pending-invitation projections carrying email and intended Access are member-administration data and are Full-control-only, not ordinary Work',
  },
  'task.create': {
    atLeast: 'can_contribute',
    why: 'accepted R8A: Can contribute originates new Task work, including choosing the initial assignee',
  },
  'task.edit': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute'],
    why: "accepted R8A: Can contribute fully plans work currently assigned to themselves and may not edit another member's existing Task; Assigned work may not materially replan",
  },
  'task.assign': {
    atLeast: 'can_edit',
    why: "#228's Can-contribute list refuses reassign and unassign outright: changing who holds an existing Task is planning authority, which Can contribute does not have even over their own",
  },
  'task.move': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute'],
    why: "#228's Can-contribute list: they may move their own current Task among existing Sections; moving another member's work, or between Folders, is Can edit's",
  },
  'task.status.complete': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute', 'assigned_work'],
    why: 'accepted R8A: Assigned work executes the existing plan for Tasks currently assigned to the member, which is exactly what completing one is',
  },
  'task.status.abandon': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute'],
    why: "#228's Assigned-work list refuses abandon and restore by name; accepted R8A gives them to Can contribute over their own current work",
  },
  'task.trash': {
    atLeast: 'can_edit',
    why: "#228's Can-contribute list: they may not trash shared Tasks, their own included",
  },
  'task.restore': {
    atLeast: 'can_edit',
    why: "#228's Can-edit list, which carries restore beside abandon and trash: restoring a Task from Trash sits with Can edit",
  },
  'task.destroy': {
    atLeast: 'full_control',
    why: '#228 gives permanently deleting a Task from Trash to Full control: it is an irreversible administrative act',
  },
  'task.duplicate': {
    atLeast: 'can_edit',
    why: '#228: duplication is Can edit\'s. Accepted R8A would extend it to Can contribute "where implementation can preserve the accepted boundary", and this implementation cannot -- see the refusals list in the pull request',
  },
  'task.dependency.manage': {
    atLeast: 'can_edit',
    why: "#228's Can-contribute list: a dependency imposes planning consequences on another member's existing work, which Can contribute may not create",
  },
  'task.reminder.manage': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute', 'assigned_work'],
    why: "#228's Assigned-work list carries the assignee-delivered reminder: Dana delivers it to the assignee, so setting and clearing it belongs to them",
  },
  'step.toggle': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute', 'assigned_work'],
    why: "#228's Assigned-work list: toggling an existing Step's completion is execution",
  },
  'step.manage': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute'],
    why: "#228's Assigned-work list refuses Step create, rename, reorder, delete and promote: rewriting the checklist that defines completion is not execution. Accepted R8A gives it to Can contribute over their own current work",
  },
  'label.vocabulary.manage': {
    atLeast: 'can_edit',
    why: "R8A and #228: members who may broadly edit Folder Work manage the shared Label vocabulary, superseding #208/#226's interim all-members rule",
  },
  'label.apply': {
    atLeast: 'can_edit',
    whenAssignedToActor: ['can_contribute'],
    why: 'R8: Can contribute applies and removes existing Folder Labels on work they may self-manage; Assigned work and below may not modify shared Labels',
  },
  'comment.create': {
    atLeast: 'can_comment',
    why: 'accepted R8A: Can comment participates in Consultation and discussion without changing shared Work state',
  },
  'comment.mutate.own': {
    atLeast: 'can_comment',
    requiresAuthor: true,
    why: "#228's authorship rule: authorship is provenance rather than standing authority, so a member downgraded to Can view keeps their old words and loses the power to change them",
  },
  'comment.moderate': {
    atLeast: 'full_control',
    why: "#228's Full-control list: removing or moderating another member's comment is member administration",
  },
  'comment.like': {
    atLeast: 'can_comment',
    why: "#228's Can-comment list, which carries like and unlike",
  },
  'file.upload.comment': {
    atLeast: 'can_comment',
    why: "#228's Can-comment list: attaching and removing a file through an allowed own-comment edit path is part of commenting",
  },
  'file.upload.page': {
    atLeast: 'can_edit',
    why: "#228's Can-edit list: a file used for Folder page content is ordinary shared Work",
  },
  'file.delete': {
    atLeast: 'full_control',
    why: "#228's authorship rule: direct permanent deletion of a Folder-scoped file is Full control's, superseding the uploader-or-owner rule, because uploader authorship must not survive a downgrade as hidden mutation authority",
  },
  'personal.my_day': {
    atLeast: 'can_view',
    personal: true,
    why: "#228's personal-actions rule: My Day is a private projection over Work the actor may already read",
  },
  'personal.membership_label': {
    atLeast: 'can_view',
    personal: true,
    why: "#228's personal-actions rule: a member's own label and colour for a Folder are their own arrangement",
  },
  'personal.reminder_snooze': {
    atLeast: 'can_view',
    personal: true,
    why: "#228's personal-actions rule: notification state is personal",
  },
  'personal.label': {
    atLeast: 'can_view',
    personal: true,
    why: "#228's personal-actions rule: Personal Labels are own-only at every preset",
  },
  'personal.view_preferences': {
    atLeast: 'can_view',
    personal: true,
    why: "#228's personal-actions rule: saved Views and view preferences are account state",
  },
  /* ---------------------------------------------------------------- *
   * The facet framework (issue #210)
   * ---------------------------------------------------------------- */
  'facet.read': {
    atLeast: null,
    whenOwnPrivateFacet: true,
    why: "#210 and #209: a private facet is visible only to its owner, and no preset qualifies -- Full control and the structural owner read no member's private facet, which is custody-is-not-authority applied to the one place it bites",
  },
  'facet.create': {
    atLeast: 'can_edit',
    whenOwnPrivateFacet: true,
    why: "#228 denies Can contribute the creation of Folder Sections, and a Work or shared blank facet is the same order of structure; a private facet of your own is yours to make",
  },
  'facet.rename': {
    atLeast: 'can_edit',
    whenOwnPrivateFacet: true,
    why: "#210 and #228's Can-edit list: naming Purpose and Results is shared Work, and a private facet's name is not",
  },
  'facet.hide': {
    atLeast: 'can_edit',
    why: "#210: hiding a native facet changes what every member sees, which makes it ordinary shared Work at #228's Can-edit bar",
  },
  'facet.reorder': {
    atLeast: 'can_edit',
    whenOwnPrivateFacet: true,
    why: "#210: the shared facet sequence is Folder data and is Can edit's to change for everyone; a private facet's place is its owner's",
  },
  'facet.delete': {
    atLeast: 'can_edit',
    whenOwnPrivateFacet: true,
    why: "#228's Can-contribute list: they may not trash shared work, their own included; a private facet of your own is yours to delete",
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
    why: '#210: converting a private facet to shared creates shared Work and exposes writing that was somebody\'s own, so it takes Can edit and the facet\'s owner together',
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
