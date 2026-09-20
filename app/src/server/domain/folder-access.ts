/*
The Folder action authorization layer (issue #228; product authority
accepted #209 R8A for the ladder, #228's own authorization-resolver section
for this shape, R9 for the history).

## Which record every line below cites, and why it is not R7

An earlier draft of this file grounded most of the table in "#209 R7 section
X". **R7 is marked "(PROPOSED, not accepted)" in #209 and R8A supersedes it**
-- "R8A supersedes the five-level recommendation in R7 and earlier R4 matrices
where they conflict" -- so it is authority for nothing, and a citation pointing
at a superseded record is worse than none because it reads as authoritative.
Corrected on 2026-09-20 under Hassan's ruling,
https://github.com/zhssnym/dana/issues/228#issuecomment-5750892771.

Every `why` below now names one of four records, and they are the only four:

- **accepted R8A** -- "Status: ACCEPTED by owner" -- for the six presets and
  what each of them is *for*;
- **#228's capability boundaries**, the product issue's own per-preset lists,
  whose stated canonical authority is accepted R8A and R10B, for the rules
  finer-grained than R8A's six lines;
- **governing R5/R6**, which R8A's supersession clause keeps governing for
  structural ownership and explicit owner succession;
- **Hassan's ruling of 2026-09-20**, named as his, for `folder.trash`, which
  R8A does not settle either way.

**These `why` strings are on the wire.** A refused mutation answers
`{"error":{"code":"forbidden","message":<why>}}`, so this is product copy read
by a person and not only a comment read by the next agent.

## Why this file exists at all

`docs/workflow/backend/README.md` says, correctly, that **there is no
authorization chokepoint and there cannot be one**, because what counts as
authorized depends on what is being asked for. That remains true. What this
file is, is the one place that knows *the answer* for every Folder action, so
that the hand-written gates scattered across the routes stop each carrying a
rule of their own.

The distinction matters and is not pedantry. Before this file, a route decided
both *which* question to ask and *what the answer was*; the second half was
duplicated, drifted, and was invisible to the suite. After it, a route still
decides which action it is performing and which target facts it must read --
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

**Projections never authorize.** The client may hide a control; the answer to
"may this happen" is only ever this file's, reached through a route.
*/
import { sql } from 'drizzle-orm'

import {
  FOLDER_ACCESS_PRESETS,
  folderAccessPreset,
} from '../../shared/folder-access.js'
import type {
  FolderAccessPreset,
  FolderAccessTransition,
} from '../../shared/folder-access.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'

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
the Folder's own trip to Trash is Hassan's ruling of 2026-09-20, which R8A
does not settle.
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

  const qualified = byPreset || byAssignment
  const owner = rule.owner ?? 'ignored'

  const allowed =
    owner === 'ignored'
      ? qualified
      : owner === 'sufficient'
        ? qualified || facts.isOwner
        : facts.isOwner && (rule.atLeast === null || qualified)

  return allowed ? { allowed: true } : { allowed: false, reason: rule.why }
}

/* ------------------------------------------------------------------ *
 * Reading the facts
 * ------------------------------------------------------------------ */

/**
 * The actor's durable facts about one Folder, or null when the Folder does
 * not exist, is in Trash, or the actor is not a member -- which 10.2 makes
 * one answer, 404, never 403.
 *
 * Takes an `Executor` rather than a handle so a caller inside a transaction
 * resolves against the same snapshot it will write in. Every `Db` is an
 * `Executor`, so the ordinary read costs nothing extra.
 *
 * `includeTrashed` is for the two acts 7.13 performs *on* a trashed Folder --
 * restore and permanent destruction -- which must resolve access to a row the
 * ordinary predicate hides.
 */
export async function folderActorFacts(
  executor: Executor,
  actorId: string,
  folderId: string,
  options: { includeTrashed?: boolean } = {},
): Promise<FolderActorFacts | null> {
  const trashed =
    options.includeTrashed === true ? sql`` : sql` AND f.deleted_at IS NULL`
  const found = await rowsOf(
    executor,
    sql`SELECT (f.owner_id = ${actorId}) AS is_owner, f.is_default, f.name,
               m.access
        FROM folders f
        JOIN folder_members m ON m.folder_id = f.id
        WHERE f.id = ${folderId} AND m.user_id = ${actorId}${trashed}`,
  )
  const row = found[0]
  if (row === undefined) return null
  const access = presetOf(row.access)
  if (access === null) {
    // Unreachable behind the column's CHECK, and loud rather than guessed:
    // every default here would be a guess about what somebody may do.
    throw new Error(
      `folder_members.access holds an unknown preset for ${actorId} in ${folderId}`,
    )
  }
  return {
    folderId,
    actorId,
    access,
    isOwner: row.is_owner === true,
    isDefault: row.is_default === true,
    name: String(row.name),
  }
}

/* ------------------------------------------------------------------ *
 * The Full-control continuity invariant
 * ------------------------------------------------------------------ */

/**
 * How many *other* active members of this Folder hold Full control.
 *
 * "Human" is every member in M1: Dana has no AI member rows, and R8A is
 * explicit that a future AI Full control must not satisfy the sole-custodian
 * invariant. When those rows arrive, this predicate is the one place that has
 * to learn to exclude them, which is why it is a named function with this
 * paragraph attached rather than a count inlined at four call sites.
 *
 * Callers take the Folder row `FOR UPDATE` first. The count is only true for
 * as long as nothing else may change a membership row, and every operation
 * that could -- demote, remove, leave, transfer -- takes that same lock in
 * the same order, so they queue rather than interleave.
 */
export async function otherFullControlCount(
  tx: Executor,
  folderId: string,
  excludingUserId: string,
): Promise<number> {
  const found = await rowsOf(
    tx,
    sql`SELECT count(*)::int AS n FROM folder_members
        WHERE folder_id = ${folderId} AND user_id <> ${excludingUserId}
          AND access = 'full_control'`,
  )
  return Number(found[0]?.n ?? 0)
}

/**
 * Whether removing, demoting or releasing `userId`'s Full control would leave
 * the Folder with no active human Full-control member.
 *
 * A Folder whose subject does not hold Full control cannot be the last one,
 * so the answer is false without a count; that ordering also keeps the
 * personal default Folder, which has exactly one member, out of the invariant
 * entirely when it is being left through a path that never had Full control.
 */
export async function wouldStrandFolder(
  tx: Executor,
  folderId: string,
  userId: string,
  heldAccess: FolderAccessPreset,
): Promise<boolean> {
  if (heldAccess !== 'full_control') return false
  return (await otherFullControlCount(tx, folderId, userId)) === 0
}

/* ------------------------------------------------------------------ *
 * The append-only history (R9)
 * ------------------------------------------------------------------ */

export interface AccessTransition {
  folderId: string
  memberId: string
  previousAccess: FolderAccessPreset | null
  newAccess: FolderAccessPreset | null
  /** Null only for a governed system transition, which in M1 is migration
   * initialization and nothing else; the table's CHECK agrees. */
  actorId: string | null
  transition: FolderAccessTransition
}

/**
 * One append-only transition row, written in the caller's transaction.
 *
 * It takes an `Executor` and opens nothing, which is R9 section 3's atomicity
 * requirement expressed as a type: the Access write and its history row must
 * commit together or not at all, and a function that opened its own
 * transaction could not promise that however carefully it were called.
 *
 * There is deliberately no update and no delete beside it. R9 section 15
 * makes corrections a new transition rather than a rewrite of the past.
 */
export async function recordAccessTransition(
  tx: Executor,
  entry: AccessTransition,
): Promise<void> {
  await tx.execute(
    sql`INSERT INTO folder_access_history
          (folder_id, member_id, previous_access, new_access, actor_id,
           transition)
        VALUES (${entry.folderId}::uuid, ${entry.memberId}::uuid,
                ${entry.previousAccess}, ${entry.newAccess},
                ${entry.actorId}::uuid, ${entry.transition})`,
  )
}

export interface AccessHistoryRow {
  id: string
  folder_id: string
  member_id: string
  previous_access: FolderAccessPreset | null
  new_access: FolderAccessPreset | null
  actor: { id: string; display_name: string | null; avatar_url: string | null } | null
  transition: FolderAccessTransition
  effective_at: string
}

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/**
 * The Folder's Access history, or one member's slice of it, oldest first.
 *
 * R9A draws the boundary this read respects: #228 owns the truth of these
 * records and makes them renderable by Folder History and by a member-specific
 * recent view; filtering, search and grouping are the M2 History product's and
 * are deliberately absent. `limit` exists so a member panel can ask for the
 * last few without inventing a query language.
 *
 * The history survives the membership it describes (R9 section 9), so this
 * joins nothing to `folder_members`: a row about somebody who has left is the
 * point rather than an edge case.
 */
export async function accessHistoryOf(
  executor: Executor,
  folderId: string,
  options: { memberId?: string; limit?: number } = {},
): Promise<AccessHistoryRow[]> {
  const member =
    options.memberId === undefined
      ? sql``
      : sql` AND h.member_id = ${options.memberId}`
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500)
  const found = await rowsOf(
    executor,
    sql`SELECT h.id, h.folder_id, h.member_id, h.previous_access,
               h.new_access, h.transition, h.effective_at,
               u.id AS actor_id, u.display_name AS actor_display_name,
               u.avatar_url AS actor_avatar_url
        FROM folder_access_history h
        LEFT JOIN users u ON u.id = h.actor_id
        WHERE h.folder_id = ${folderId}${member}
        ORDER BY h.effective_at ASC, h.id ASC
        LIMIT ${limit}`,
  )
  return found.map((row) => ({
    id: String(row.id),
    folder_id: String(row.folder_id),
    member_id: String(row.member_id),
    previous_access: presetOf(row.previous_access),
    new_access: presetOf(row.new_access),
    actor:
      row.actor_id === null || row.actor_id === undefined
        ? null
        : {
            id: String(row.actor_id),
            display_name: nullableString(row.actor_display_name),
            avatar_url: nullableString(row.actor_avatar_url),
          },
    transition: String(row.transition) as FolderAccessTransition,
    effective_at: toIso(row.effective_at),
  }))
}

/* ------------------------------------------------------------------ *
 * The locked membership read every administration act begins with
 * ------------------------------------------------------------------ */

export interface LockedMembership {
  userId: string
  access: FolderAccessPreset
  isOwner: boolean
}

/**
 * One member's row, held for the rest of the transaction.
 *
 * R9 section 16 requires that two racing Access changes serialize or refuse
 * rather than both record a transition claiming the same `from`. This is the
 * lock that makes the first of those true: the row is taken `FOR UPDATE`, so
 * the second caller waits and then reads the first caller's result as its own
 * `from`. The optional `expected` preset in the request body is the second
 * half -- a caller who knows what it saw may insist on it.
 */
export async function lockedMembership(
  tx: Executor,
  folderId: string,
  userId: string,
): Promise<LockedMembership | null> {
  const found = await rowsOf(
    tx,
    sql`SELECT m.user_id, m.access, (f.owner_id = m.user_id) AS is_owner
        FROM folder_members m
        JOIN folders f ON f.id = m.folder_id
        WHERE m.folder_id = ${folderId} AND m.user_id = ${userId}
        FOR UPDATE OF m`,
  )
  const row = found[0]
  if (row === undefined) return null
  const access = presetOf(row.access)
  if (access === null) {
    throw new Error(
      `folder_members.access holds an unknown preset for ${userId} in ${folderId}`,
    )
  }
  return {
    userId: String(row.user_id),
    access,
    isOwner: row.is_owner === true,
  }
}
