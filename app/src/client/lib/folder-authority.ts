/*
What a folder's surfaces may offer this viewer, answered from the server's own
rules rather than from a second copy of them (issue #228; #209 R8A; R6
section 2).

## Why this file exists

Until #228 the client decided all of this from `is_owner`. That was right
while ownership *was* the authority: the owner renamed and deleted, and a
member left. R8A replaces it with a capability ladder, and ownership becomes
custody — a small set of acts about the folder's custodian and nothing else —
so `is_owner` is now neither necessary nor sufficient for anything a menu
draws. The two measured consequences of leaving it in place, both on this
branch, were a **Full-control member who is not the owner offered no Rename**
and an **owner whose Access had been lowered still offered Delete**.

So the gate moved, and the interesting part is *where it moved to*. The
answer is `src/shared/folder-actions.ts`, which is the table the routes
themselves resolve against: `mayPerform(facts, 'folder.profile.edit')` here is
the same call `PATCH /folders/:id` makes. **Nothing in this file states a bar.**
A rule that changes in the table changes here on the next build, which is the
only arrangement that cannot drift — and drift is exactly what put the two
defects above on the screen.

## What this file is not

**It is not authorization.** Every function here answers "should this control
be drawn", on a projection that was true when the response was written and may
not be now. The answer to "may this happen" is the route's, on facts read in
the transaction that writes, and a client that draws a control it should not
have is refused there. That is why these are pure functions over data the page
already holds rather than anything that asks the server a question.

## The two Label gates answer nothing on any screen today, and say so

`labels` and `applyLabel` arrived with issue #274, which put the twelve Label
mutation routes behind `mayPerform`. **No surface consumes them**, because no
surface offers a Label control: measured 2026-09-20, `grep -rn "/labels"
app/src/client` finds one read — the folder page fetching the vocabulary to
write a workflow file — and not one mutation. So #274's fourth point, "if any
screen offers a label control on the strength of membership, it now offers an
action that 403s", found nothing to fix.

They are here rather than left for the first Label control to invent, and that
is the whole argument for two gates with no caller: the defect this file
exists for is a screen deciding authority for itself, and the shortest path to
committing it again is a control built where nothing offers the table's
answer. Anything that draws a Label control reads these, and if the first one
needs a shape these do not have — the per-Task answer in `applyLabel`'s note
below is the known case — it changes them rather than writing a second ladder.

## The two things the table does not answer

`mayPerform` reads the preset and the owner fact. Two refusals a person meets
on these surfaces are **state** rather than preset, and the server checks them
after the gate, so they are checked here after it too:

- **INV-2**, which makes the default folder undeletable and unleavable;
- **the Full-control continuity invariant**, which refuses the last remaining
  Full-control member's exit (`STRANDED` in `routes/folders.ts`), and the
  owner's ordinary leave outright until they have transferred (R6 section 2).

The first is computed from the folder itself and costs nothing anywhere. The
second needs the member list, which the folder page already reads and the
sidebar does not: `GET /folders` carries `member_count` and not who holds Full
control. So the sidebar leaves `otherFullControl` undefined and `folderGates`
offers Leave, letting the route's 409 be the refusal, which is the honest
direction — hiding somebody's only way out of a folder on a guess is worse than
offering an act that may be declined.
*/
import { mayPerform } from '../../shared/folder-actions.js'
import type { FolderAction, FolderActorFacts } from '../../shared/folder-actions.js'
import type { FolderAccessPreset } from '../../shared/folder-access.js'
import type { FolderMember } from '../../shared/folders.js'

/**
 * Everything these answers depend on, as the folder page holds it.
 *
 * It is `FolderActorFacts` minus the two fields only a route needs — the
 * folder's id and name ride the facts on the server because the share-grant
 * email renders them, and no drawing decision reads either.
 */
export interface FolderViewerFacts {
  /** The viewer's own current preset, `folder_members.access` (R8A's six). */
  readonly access: FolderAccessPreset
  /** `folders.owner_id`, custody and never Access. */
  readonly isOwner: boolean
  /** INV-2's personal folder, which cannot be deleted, left or transferred. */
  readonly isDefault: boolean
  /**
   * Whether anybody *other than the viewer* currently holds Full control.
   * This is the client's half of the continuity invariant; `undefined` where
   * the surface does not know, which is the sidebar, whose list carries no
   * roster.
   */
  readonly otherFullControl?: boolean
}

/** The viewer's own membership element, or null when the roster has not
 * arrived. Never inferred from `is_owner`: an owner's preset is an ordinary
 * one and R5 lets them lower it. */
export function viewerMembership(
  members: readonly FolderMember[],
  viewerId: string | null,
): FolderMember | null {
  if (viewerId === null) return null
  return members.find((member) => member.user.id === viewerId) ?? null
}

/**
 * The facts for a folder page that has both the folder and its roster.
 * Null while either is still loading, which is what keeps a menu from
 * flickering the owner's acts on before the roster lands.
 */
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
 * The stand-in id this file gives the viewer.
 *
 * `mayPerform` compares `facts.actorId` against a target's author or assignee,
 * and a projection has no real id to offer — the page knows who the viewer is
 * but the answer being computed here is "what does this *preset* allow",
 * never "is this particular row mine". So the one way this value is ever
 * used is deliberate and is right below: an action whose rule sets
 * `requiresAuthor` is asked with this same id as the author, which makes the
 * table answer the **standing** half of the question and leave the
 * per-row half to the caller. Nothing else may pass it.
 */
const PROJECTED_ACTOR_ID = 'the-viewer'

/* The two fields `mayPerform` wants that no drawing decision reads. Named
   rather than spelled at each call so that the next field added to
   `FolderActorFacts` for the server's benefit lands in one place here. */
const NOT_READ_BY_A_PROJECTION = {
  folderId: '',
  actorId: PROJECTED_ACTOR_ID,
  name: '',
} as const

/**
 * The table's answer for one action, on this viewer's facts.
 *
 * The one function in this file that talks to `shared/folder-actions.ts`, and
 * the reason every bar below is a citation rather than a number.
 *
 * `target` exists for the one rule shape a projection can honestly satisfy:
 * `requiresAuthor`. See `mutateOwnComment` below.
 *
 * **It is narrower than `FolderActionTarget` on purpose, and the narrowing is
 * the guard rather than the comment above it.** That type also carries
 * `assigneeId`, and while this parameter was typed as the whole of it
 * `mayDraw(facts, 'task.edit', { assigneeId: PROJECTED_ACTOR_ID })` compiled
 * and answered `true` for Can contribute — measured rather than reasoned:
 * `mayPerform` on those facts answers `true` at Can contribute with that id
 * as the assignee and `false` without it — a projection granting an
 * assignment-scoped act, which is precisely what #228 forbids: assignment
 * authority is resolvable only under the row lock of the transaction that
 * writes, and a client's idea of an assignee is a projection by definition.
 * Nothing did that, and a sentence saying "must not" was all that stood
 * between here and somebody doing it. Now it does not compile, and the
 * typecheck is the proof (found by the review of #268, 2026-09-20).
 */
export function mayDraw(
  facts: FolderViewerFacts,
  action: FolderAction,
  /* Deliberately not `FolderActionTarget`. See above. */
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
 * Which of a folder's acts to offer this viewer.
 *
 * `actsFor` in `lib/object-acts.ts` draws an act when a surface supplies a
 * handler for it, so a surface spreads this over its handlers and cannot
 * accidentally offer what it cannot do. The names are the act keys that file
 * declares, except `identity`, which is the same authority worn by the
 * header's controls rather than by a menu item.
 */
export interface FolderGates {
  /** Rename, and with it the icon, colour, cover and description: accepted
   * R8A makes a folder's identity ordinary shared Folder work, which Can edit
   * and above change and nobody below does (AC-011, AC-012, AC-193). */
  readonly identity: boolean
  /** Moving the whole folder to Trash. Full control's (R8A settles it neither
   * way), and custody does not confer it, so an owner below Full control is not offered it (AC-015). */
  readonly trash: boolean
  /** Leaving. Any member may (governing R6), except the owner, who transfers
   * first, and except the last Full-control member, whom the continuity
   * invariant refuses (AC-019, AC-520). INV-2 excludes the default folder. */
  readonly leave: boolean
  /** Handing custody on. The owner's alone, and Full control does not confer
   * it (governing R5 and R6). */
  readonly transferOwnership: boolean
  /** Adding a member: administering members, which accepted R8A gives to Full
   * control and denies Can edit by name (AC-024). */
  readonly addMember: boolean
  /** Changing somebody else's Access: administering Access, R8A's other half
   * of the same sentence (AC-512). */
  readonly administerAccess: boolean
  /**
   * Removing **somebody else's** comment.
   *
   * #228's Full-control list makes moderating another member's words member
   * administration, and `DELETE /comments/:id` has resolved it that way since
   * R8A landed. This member of the interface is the half that did not move:
   * both conversation surfaces went on offering Delete on `is_owner`, so a
   * Full-control administrator who owns nothing was offered nothing and a
   * demoted owner was offered a control the route answers 403 (AC-790).
   *
   * **It is not the whole of what a surface draws.** A comment's own author
   * deletes their own words under `comment.mutate.own`, which is authorship
   * and therefore per comment rather than per folder; `lib/thread.ts` is
   * where the two are added together, one comment at a time.
   */
  readonly moderate: boolean
  /**
   * Destroying a **trashed task** permanently, `DELETE /trash/tasks/:id`.
   *
   * #228's Full-control list: an irreversible administrative act. Ownership
   * is **ignored** by it, which is the surprising half — a Full-control
   * member who owns nothing destroys, and an owner below Full control does
   * not (AC-790).
   */
  readonly destroyTask: boolean
  /**
   * Destroying a **trashed folder** permanently,
   * `DELETE /trash/folders/:id`.
   *
   * The same Full-control bar **and** the owner, both at once: #228 with
   * governing R5, which keeps permanent destruction of the whole folder with
   * custody. So this is strictly narrower than `destroyTask`, and the two
   * cannot be one member — which is exactly what `purgeable` was until
   * 2026-09-20, one boolean off `is_owner` answering for both (AC-790).
   */
  readonly destroyFolder: boolean
  /**
   * Changing or removing **one's own** comment: the standing half only.
   *
   * `comment.mutate.own` is two conditions — the actor is the author, *and*
   * they currently hold Can comment or better — and #228's authorship rule is
   * that the first is provenance rather than authority. Authorship is per
   * comment and this member cannot know it, so what is answered here is the
   * second condition alone, and `lib/thread.ts` multiplies it by `mine`.
   *
   * **Not `mine` alone** (issue #268): a member reduced to Can view would be
   * offered both on every comment they ever left and answered 403 by the
   * route, which AC-518 pins from the other side (AC-790).
   */
  readonly mutateOwnComment: boolean
  /**
   * Liking and unliking, `comment.like`: #228's Can-comment list carries the
   * pair, and Can view reads a thread and leaves no mark on it. Per folder
   * and not per comment, a like being nobody's property (AC-790).
   */
  readonly likeComment: boolean
  /**
   * Writing into the conversation at all: `comment.create`, which accepted
   * R8A gives to Can comment as the preset that names participation, and
   * which Can view does not have — it reads the thread and does not write to
   * it, the whole of the distinction between R8A's two lowest rungs.
   *
   * Reply is the same act as a first comment and is gated on this too. The
   * composer is **not hidden** on it: it is disabled and says what standing
   * commenting needs, because it carries a fact a Can-view member may read —
   * that this conversation takes comments — and hiding it would hide the
   * fact with the act (#268; AC-790).
   */
  readonly createComment: boolean
  /** Managing the folder's shared Label vocabulary — create, rename, recolour,
   * describe, archive, restore. Can edit and above, and custody is no part of
   * it (`label.vocabulary.manage`; AC-480, AC-800). */
  readonly labels: boolean
  /**
   * Putting one of the folder's Labels on a Task, or taking it off.
   *
   * **This is the folder-wide floor, and it is deliberately not the whole of
   * `label.apply`.** It answers `label.apply` at Can edit — "may they do this
   * to anything here" — which is what a folder-level control such as a bulk
   * action or a picker in the folder header needs, and it **ignores the
   * action's `whenAssignedToActor: ['can_contribute']` arm**. So it is false
   * for Can contribute, who may in fact classify the Task **currently
   * assigned to them**.
   *
   * **That per-Task grant is the server's to make and cannot be made here.**
   * The route reads the Task's current assignee under the mutation's own row
   * lock, in the same transaction and snapshot as the write, and answers 403
   * or 200; anything the client believes about an assignee is a projection of
   * a value that may already have changed. A surface that wants to offer the
   * control to a contributor therefore has two honest choices, and no third:
   * **accept the over-refusal at Can contribute and hide it**, or **draw it
   * and let the server refuse**, reporting what comes back.
   *
   * **What it must never do is pass an assignee into `mayDraw`.** #268
   * narrowed that parameter to `{ authorId?: string }` for exactly this
   * reason, and the typecheck is the guard: widening it back to reach this
   * case would hand a client the assignment-scoped grant #228 places under
   * the row lock. See `mayDraw` above, which carries the measurement.
   *
   * (AC-800 drives both halves — the folder-wide bar and the contributor's
   * own assigned Task — against the server.)
   */
  readonly applyLabel: boolean
}

export function folderGates(facts: FolderViewerFacts): FolderGates {
  /* The one place the continuity invariant is read. `undefined` means the
     surface cannot know, and the honest reading of "I do not know whether
     anybody else holds Full control" is to let the person try and be told by
     the server, rather than to hide their only way out of a folder. */
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
    /* Both read the table and neither reads `isDefault`, so a Trash row that
       does not carry one may pass anything. `folder-authority.test.ts`
       asserts that rather than this comment asserting it, because a table
       that started reading it would otherwise make a fixture's `false` into
       a silent grant. */
    destroyTask: mayDraw(facts, 'task.destroy'),
    destroyFolder: mayDraw(facts, 'folder.destroy'),
    /* The one `requiresAuthor` rule a projection may ask about, and the
       stand-in id above is how: "if this comment were mine, could I change
       it". Asking without the target would answer false at every preset,
       which is the shape of wrong that reads as a working gate. */
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
 * Who this folder's ownership may be transferred to.
 *
 * **Governing R6 section 2, and the list is the whole of the rule**: an active
 * member who currently holds Full control, and nobody else. The server's
 * `isEligibleSuccessor` is the same predicate — one row of `folder_members`
 * with `access = 'full_control'` — and a target outside this list is answered
 * `422 to: must be a member of this folder who currently has Full control.`
 *
 * **There is no default successor and no order that means anything.** The
 * "longest-standing member" this list used to be sorted by, and labelled with,
 * was 8.9's automatic succession rule, which R6 section 2 removed outright:
 * joining first is not evidence that anybody intended you to hold custody.
 * The order is the roster's own, so that the picker reads the same way as the
 * Share panel the person just came from.
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

/** The other members, whoever they are: what "this folder is shared" means,
 * and what the owner's delete question counts. Not a successor list. */
export function otherMembers(
  members: readonly FolderMember[],
  viewerId: string | null,
): FolderMember[] {
  return members.filter((member) => member.user.id !== viewerId)
}
