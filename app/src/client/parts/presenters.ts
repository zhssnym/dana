/*
The seam between our API shapes and the components' display props.

Ours answers 7.0: a `TaskCard` carrying `due_date` and `due_time`, a folder stub
with an id, an assignee with an id, and two step counts. The components take
what a row paints: a due label with a boolean beside it, a folder as a name and
a colour, an assignee as initials and a name, and steps as a done-and-total
pair. This module is the whole of that mapping, and it exists as one file rather
than as a helper beside each page because the two halves meet in exactly one
place or they meet in six places that drift.

**No acceptance criterion sees this file.** The criteria address rendered roles,
names, regions and copy, and would still pass if a label here read the wrong
date, because they assert that a due badge exists and never what it says. That
is why the module is pure and unit-tested here: these tests are the only thing
that checks it.

**Nothing here reads a clock.** `api/tz.ts` is the only place this client
evaluates a date, and its own header says so; `presenterToday()` below is a
one-line pass-through to it, and every function that needs today takes it as an
argument. That keeps the module a function of its inputs, which is what makes a
due label testable at all, and it keeps the answer the same one the `tz`
parameter on the request that fetched the row was computed against.

**No orderings live here.** Section 6 fixes every view's order and rows arrive
already ordered, section 6's own sentence being "every view returns rows already
ordered; clients never re-sort", and 7.11 makes a rule that exists only in the
client a specification violation.
*/
import { todayInBrowserZone } from '../api/tz.js'
import { markIcon } from '../components/page/icon-manifest.js'
import type { LucideIcon } from '../lib/icons.js'
import { paths } from '../routes.js'
import type { Folder } from '../../shared/folders.js'
import type { TaskCard } from '../../shared/tasks.js'
import { parseRecurrenceRule } from '../../shared/recurrence.js'
import type { FolderGroupOption } from '../components/folder-group-dialog.js'
import type { FolderRowProps } from '../components/folder-row.js'
import type { TaskRowProps } from '../components/task-row.js'
import { formatClockTime, formatDate, formatDay, formatDayInline, formatDayTime } from '../lib/dates.js'
import type { TimeFormat } from '../lib/time-format.js'
import { activationDateOf } from './schedule.js'

/* ------------------------------------------------------------------ *
 * Today
 * ------------------------------------------------------------------ */

/**
 * Today's civil date in the browser's zone, as 4.11's YYYY-MM-DD.
 *
 * The single clock read this module is allowed, and it is a pass-through: the
 * evaluation lives in `api/tz.ts`, whose header records that it is the only
 * place this client evaluates a date. It is re-exported through this name so
 * that a page assembling row props reaches for one import rather than two,
 * and so that grepping this directory for a second clock finds nothing.
 */
export function presenterToday(): string {
  return todayInBrowserZone()
}

/* ------------------------------------------------------------------ *
 * The due label
 * ------------------------------------------------------------------ */

/*
The due label is `lib/dates.ts`'s plain form: "Today", "Tomorrow", "Mon",
"24 Sep", plus the time on the viewer's clock when the row has one. No "Due"
or "Overdue" words: overdue is the `overdue` flag, which the row paints red,
and only a pending row can be overdue (Q3C).
*/

/** A due date as the absolute form: "6 Aug", "6 Aug 2027" outside today's year. */
export function formatDueDate(dueDate: string, today: string): string {
  return formatDate(dueDate, today)
}

/** What `TaskRowProps['due']` is, named so the rule below has a return type. */
export type DueDisplay = NonNullable<TaskRowProps['due']>

/**
 * The due badge for one card, or undefined when the task has no **deadline**.
 *
 * `status` decides only whether the overdue form is reachable; the comparison
 * itself is 8.10's. Both operands are 4.11 dates, so the lexicographic
 * comparison is the chronological one, which is the property that format was
 * chosen for.
 *
 * **It reads `due_date` and only `due_date`, and since issue #216 that is a
 * decision rather than the only reading available.** 8.1 makes overdue, due
 * today and future relations to the deadline alone, and 9.5 says in terms
 * that "a Start Date passing is not overdue and is not styled as one". So a
 * Start-only card draws no badge here: it has nothing that can pass. What
 * places it on a page is `parts/schedule.ts`'s schedule date, which is a
 * different question and a different function.
 */
export function dueDisplay(
  task: Pick<TaskCard, 'status' | 'due_date' | 'due_time'>,
  today: string,
  /* The viewer's clock (9.7, 4.19). Defaulted to the module's own default so
     the callers that draw a date and never a time need not thread it. */
  clock: TimeFormat = '12',
): DueDisplay | undefined {
  const { due_date: dueDate, due_time: dueTime } = task
  if (dueDate === null) return undefined
  const label = formatDayTime(dueDate, dueTime, today, clock)
  const overdue = task.status === 'pending' && dueDate < today
  return overdue ? { label, overdue: true } : { label }
}

/**
 * The start of a Schedule as the row says it, in the due label's own words
 * ("Today", "Mon", "24 Sep"), or undefined where there is no start or it is
 * the due day itself, which the due label already says (#215). Never
 * overdue: a start passing is not late (9.5).
 */
export function startsLabel(
  task: Pick<TaskCard, 'start_date' | 'due_date'>,
  today: string,
): string | undefined {
  const { start_date: start, due_date: due } = task
  if (start === null || start === due) return undefined
  return formatDay(start, today)
}

/**
 * A Schedule drawn as a range (m2): both ends in one language, "22 Sep –
 * 29 Sep", where `startsLabel` and `dueDisplay` alone would read "22 Sep – Mon"
 * and leave the reader to work out which Monday. Undefined when there is no
 * range to draw, and the row keeps its relative words ("Mon", "Today").
 */
export function rangeDisplay(
  task: Pick<TaskCard, 'status' | 'start_date' | 'due_date' | 'due_time'>,
  today: string,
  clock: TimeFormat = '12',
): { readonly starts: string; readonly due: DueDisplay } | undefined {
  const { start_date: start, due_date: dueDate } = task
  if (start === null || dueDate === null || start === dueDate) return undefined
  const at = formatClockTime(task.due_time, clock)
  const end = formatDate(dueDate, today)
  const label = at === '' ? end : `${end} ${at}`
  const overdue = task.status === 'pending' && dueDate < today
  return { starts: formatDate(start, today), due: overdue ? { label, overdue: true } : { label } }
}

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

/**
 * 4.1's rendering of a scrubbed account: "null after deletion, rendered
 * 'Deleted user'".
 *
 * Reachable from an assignee only in theory, because 8.10 step 4 clears the
 * deleted account's assignments before it scrubs the row, so the branch below
 * is a truth held rather than a case seen. It is this specification's own
 * string and not a second one invented for the same fact.
 */
export const DELETED_USER = 'Deleted user'

/**
 * The initials an avatar shows, from the name beside it.
 *
 * The specification is silent on initials, so this is the design's: the first
 * letter of the first word, plus the first letter of the last word when there
 * is more than one, upper-cased, never more than two ("S" beside "Sara").
 *
 * Taken from the rendered name rather than from the record, so the two can
 * never disagree: a deleted author's chip reads "DU" beside "Deleted user"
 * instead of an empty circle beside a name.
 *
 * Code points rather than UTF-16 units, because a name beginning outside the
 * basic plane would otherwise contribute half a character.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word !== '')
  const first = words[0]
  if (first === undefined) return ''
  const last = words.length > 1 ? words[words.length - 1] : undefined
  const firstLetter = Array.from(first)[0] ?? ''
  const lastLetter = last === undefined ? '' : (Array.from(last)[0] ?? '')
  return `${firstLetter}${lastLetter}`.toUpperCase()
}

/** What `TaskRowProps['assignee']` is: precomputed initials plus a name, and
 *  the picture where the person has one. */
export type AssigneeDisplay = NonNullable<TaskRowProps['assignee']>

/*
A person as the components take one, from 7.0's person shape.

**The picture is the default and the initials are the fallback.** Every card on
the wire carries `avatar_url`, and `components/person-face.tsx` takes an
`image`, so a person's own photograph appears on a row exactly as on a card and
on a board.

`avatar_url` is optional in the parameter rather than required, because two
callers pass a shape that genuinely has no such column: `lib/history.ts` reads
this for the name alone, and the unit tests pin the two-key answer. Absent and
null are the same answer here, which is the disc.
*/
export function personDisplay(person: {
  id?: string
  display_name: string | null
  avatar_url?: string | null
}): AssigneeDisplay {
  const name = person.display_name ?? DELETED_USER
  const image = person.avatar_url ?? null
  return {
    ...(person.id === undefined ? {} : { id: person.id }),
    initials: initialsOf(name),
    name,
    ...(image === null ? {} : { image }),
  }
}

/* ------------------------------------------------------------------ *
 * Folders
 * ------------------------------------------------------------------ */

/**
 * The mark's colour for a folder whose identity carries none.
 *
 * A token reference and not a raw value, so 11.4's rule that raw colours live
 * only in `tokens.css` is untouched. It is the same colour
 * `parts/identity-colors.ts` spells as a hex for the wire, and the two
 * spellings are not a duplication: 4.3's CHECK stores a literal because the
 * value is shared data read by every member in every colourway, and this side
 * draws it, where a token is what follows the viewer's theme.
 *
 * This is the fallback for a null 4.3 identity colour; 7.4's `my_color` is not
 * read by any surface here (9.6).
 */
export const DEFAULT_FOLDER_COLOR = 'var(--color-graphite-900)'

/** What `TaskRowProps['folder']` is: a name, a colour and the folder's mark. */
export type FolderDisplay = NonNullable<TaskRowProps['folder']>

/*
One resolver for a folder's mark, and every surface asks it.

A folder's identity lives in 4.3's shared columns, and an identity that only
some surfaces honour is not an identity; it is a decoration on one screen. So
the sidebar, the task row, the tab menu and the folder page all draw the glyph a
person picked through this one function.

**A folder with no chosen glyph answers the plain folder.** `markIcon` is
`components/page/icon-manifest.ts`'s, the manifest that joins 4.3's forty-two
keys to their drawings for the picker and for the folder page's own mark, so
there is one glyph table as well as one resolver.

**It is a value rather than a hook**, and the difference is at the call sites: a
row's chip takes a component and a colour as props and the shell's tab face
takes them somewhere else, so a component that could only be rendered whole
would force each of them to be rewritten around it. Here the store is the
`/folders` read the chrome already made, so the lookup is by id against a list
the caller is holding, and nothing in this module fetches.
*/
export interface FolderMark {
  readonly icon: LucideIcon
  readonly color: string
}

export function folderMark(folder: Folder | undefined): FolderMark {
  return {
    icon: markIcon(folder?.icon ?? null),
    color: folder?.color ?? DEFAULT_FOLDER_COLOR,
  }
}

/**
 * A shelf's mark, through the same resolver.
 *
 * 4.18 gives a shelf the same two identity columns 4.3 gives a folder, an icon
 * key and a colour, and 9.10 calls the shelf "the folder page one level up"
 * with "a mark (icon and colour)" of its own. So the resolution is the same
 * resolution and this is a second signature rather than a second
 * implementation: one glyph table, one default, and a shelf that has chosen
 * nothing answering the plain glyph exactly as a folder does. Writing
 * `markIcon(shelf.icon)` at the sidebar's call site would be shorter and would
 * be a second resolver.
 */
export function shelfMark(shelf: {
  readonly icon: string | null
  readonly color: string | null
}): FolderMark {
  return {
    icon: markIcon(shelf.icon),
    color: shelf.color ?? DEFAULT_FOLDER_COLOR,
  }
}

/**
 * A folder's display trio, resolved by id.
 *
 * This is the mismatch this module exists for. 7.0's `TaskCard` carries a
 * folder stub of `{id, name, is_default}` and neither colour nor icon, because
 * the identity rides the Folder object and a card carrying it would be
 * answering a question the card never asks. His row takes a name, a colour and
 * a mark and no id. So the id is the key, `useFolders()` is the table, and the
 * stub's own name is the fallback for the window in which the folder list has
 * not arrived yet or a task names a folder that list does not hold.
 */
export function folderDisplay(
  stub: { id: string; name: string },
  folders: readonly Folder[],
): FolderDisplay {
  const folder = folders.find((candidate) => candidate.id === stub.id)
  const mark = folderMark(folder)
  /*
  **The mark is not in this trio; the id is.**

  The row resolves a folder's glyph itself, through
  `components/folder-mark.tsx`, because the call sites need the two values
  separately: the row's chip takes `icon` and `color` as props, the card takes
  them somewhere else. A mark passed in here would be a second answer to a
  question that surface already asks.

  What the row cannot resolve for itself is the id, which 7.0's folder stub
  carries. Two things on the surface need it: the assignee menu, whose roster is
  4.4's members of that folder, and every write that moves a task.

  `folderMark` stays exported. The sidebar, the tab face and the shelf row all
  ask it.
  */
  return {
    id: stub.id,
    name: folder?.name ?? stub.name,
    color: mark.color,
  }
}

/** The display half of a sidebar folder row; the rest is the shell's. */
export type FolderRowDisplay = Pick<
  FolderRowProps,
  'name' | 'color' | 'icon' | 'href'
>

/**
 * One folder as the sidebar row takes it.
 *
 * No count: a sidebar row is its mark and its name. `href` is 9.1's routes table read through `routes.ts` rather than
 * spelled again here. AC-175 names the row as a link to this path, and AC-243
 * its mark as the one that folder's own page draws.
 */
export function folderRowDisplay(folder: Folder): FolderRowDisplay {
  const mark = folderMark(folder)
  return {
    name: folder.name,
    color: mark.color,
    icon: mark.icon,
    href: paths.folder(folder.id),
  }
}

/*
The one place the components' model is keyed by a name and ours is keyed by an
id.

9.1 makes a folder group "the label of 7.4's my-membership and nothing else", so
a group is a string on both sides and needs no bridge. `FolderGroupDialog` is
the exception: it takes `folders` as `{name, color, label}` and hands back
`onSubmit(label, folderNames)`, so the folders a group is being written onto
come back as display names, while the write is PATCH /folders/:id/my-membership
and needs ids.

**Folder names are not unique and 4.3 does not make them so.** Its only unique
index is one Inbox per account; two folders a person can see may carry the same
name, one their own and one shared with them. So the resolution below is one
name to every id that carries it, deliberately, and a caller writing a label
through it writes it to all of them. That is the honest reading of a choice the
person made by pointing at a name: the alternative, picking one of two
identically labelled rows, writes to a folder they did not choose and gives them
no way to tell which. It is a limitation of the dialog's shape rather than a
defect in either half.
*/

/** Every folder as the group dialog lists one. */
export function folderGroupOptions(
  folders: readonly Folder[],
): FolderGroupOption[] {
  return folders.map((folder) => ({
    name: folder.name,
    color: folderMark(folder).color,
    label: folder.my_shelf,
  }))
}

/**
 * The ids behind a set of display names, in the order `folders` holds them.
 *
 * Every id whose folder carries a selected name, for the reason above.
 */
export function folderIdsForNames(
  names: readonly string[],
  folders: readonly Folder[],
): string[] {
  const selected = new Set(names)
  return folders
    .filter((folder) => selected.has(folder.name))
    .map((folder) => folder.id)
}

/**
 * The personal labels in use, ascending, which is 9.1's own order for the
 * sidebar's groups, and the `groupLabels` and `existingLabels` props.
 *
 * `localeCompare` rather than a code-unit sort: 9.1 says "labels ascending" and
 * spells no collation, and a person's own label is free text they wrote.
 *
 * **The shelves join the labels**, and the two callers are why it is one list
 * rather than two. This feeds the "Move to shelf" submenu, which has to offer a
 * shelf holding nothing or a person can never put the first folder on one; and
 * it feeds the group dialog's duplicate check, which has to refuse a name a
 * shelf already carries or the create below it hits 7.16's own refusal with a
 * message about groups. 4.18 makes them one namespace, a shelf's name being its
 * folders' label, so a union is what that namespace is.
 */
export function folderGroupLabels(
  folders: readonly Folder[],
  shelves: readonly { readonly name: string }[] = [],
): string[] {
  const labels = new Set<string>()
  for (const folder of folders) {
    if (folder.my_shelf !== null) labels.add(folder.my_shelf)
  }
  for (const shelf of shelves) labels.add(shelf.name)
  return [...labels].sort((a, b) => a.localeCompare(b))
}

/* ------------------------------------------------------------------ *
 * Invites
 * ------------------------------------------------------------------ */

/** One row of 9.8's invite gate, as the gate draws one. */
export interface InviteRowDisplay {
  readonly id: string
  /** 9.8's row sentence, which is also how a test tells two rows apart. */
  readonly sentence: string
  /** The inviter's user id, which their face is a function of
      (`parts/person-tint.ts`), so it matches the face they wear elsewhere. */
  readonly inviterId?: string
  /** The inviter's display name, which the sentence names. */
  readonly inviter: string
  /** The inviter's initials, for the row's avatar. */
  readonly initials: string
  /**
   * 7.15's picture, which 7.5's element carries beside the name.
   */
  readonly image?: string
  /** Whether this invite grants a folder, which 7.5's null discriminates. */
  readonly isFolder: boolean
}

/**
 * The sentence 9.8 writes, in its two forms, with the row's avatar beside it.
 *
 * `folder_name` is null for a bare invite, which 7.5 makes the discriminator
 * this whole surface turns on, so the fallback is the word "connect" rather
 * than a folder that is not there. The inviter's display name is nullable in
 * 7.5's element as it is everywhere else a person is rendered, and "Someone" is
 * what this client says when it is absent: not `DELETED_USER`, because 8.10
 * scrubs an account's own invites and a null here is a person who never set a
 * name rather than one who is gone.
 */
export function inviteRowDisplay(invite: {
  id: string
  inviter: { id?: string; display_name: string | null; avatar_url?: string | null }
  folder_name: string | null
}): InviteRowDisplay {
  const who = invite.inviter.display_name ?? 'Someone'
  const image = invite.inviter.avatar_url ?? null
  return {
    id: invite.id,
    sentence: `${who} invited you to ${invite.folder_name ?? 'connect'}`,
    ...(invite.inviter.id === undefined ? {} : { inviterId: invite.inviter.id }),
    inviter: who,
    initials: initialsOf(who),
    ...(image === null ? {} : { image }),
    isFolder: invite.folder_name !== null,
  }
}

/* ------------------------------------------------------------------ *
 * The task row
 * ------------------------------------------------------------------ */

/**
 * Which way this page's stars point.
 *
 * Q4 gives the outward tooltip to Important alone, so it is a property of the
 * page and never of the row, and it arrives here as the page's answer for the
 * same reason `useRowActions.ts` already carries it: a component that read the
 * route would behave differently depending on where it was mounted.
 */
export type StarTooltipMode = 'inward' | 'outward'

/**
 * Everything the page knows that the card does not.
 *
 * Each field is a page-level fact section 9 or section 6 makes one, and none
 * of them is derivable from a `TaskCard`.
 */
export interface RowContext {
  /** 4.11's today, from `presenterToday()`. Never read from a clock here. */
  readonly today: string
  /** The signed-in person, so 9.4's "assignee chip when not the viewer" can be. */
  readonly viewerId: string | null
  /** `useFolders()`'s rows, the table the folder colour is resolved against. */
  readonly folders: readonly Folder[]
  /**
   * Q3's "unassigned" chip is conditional on the folder holding more than one
   * member, and the brief scopes the chip to Planned and the calendar, so a
   * page that does not show it passes nothing rather than an empty set.
   * `useMultiMemberFolderIds()` already answers this.
   */
  readonly multiMemberFolderIds?: ReadonlySet<string>
  /** Default inward, per 9.5; Important passes outward, per Q4. */
  readonly starTooltip?: StarTooltipMode
  /**
   * Q2 gives a Tasks row no folder label, the group heading above it being the
   * folder. Every other page shows one, so the default is true.
   */
  readonly showFolder?: boolean
  /** 9.4's pulled marker and un-pull control are My Day's alone. */
  readonly showPullMarker?: boolean
  /**
   * 9.5's from half: "the 'from' half of a row names the creator, Dana
   * recording no assigner". Assignments is the page that sentence is written
   * about and the only caller that passes this, because a creator on every
   * row of every page is the row repeating what nobody asked about.
   */
  readonly showCreator?: boolean
  /**
   * 9.5's v2 Done bullet: rows there "drop the spent due-date echo under
   * headings that already group by completion". Every other page shows one,
   * so the default is true, and Done is the only caller that passes false.
   */
  readonly showDue?: boolean
  /**
   * The viewer's clock (9.7, stored at 4.19), which decides how a due time is
   * written and never which times can be reached.
   *
   * Carried on the context rather than read inside this module, because
   * nothing here reads a store any more than it reads a date: the same rule
   * this file's header states for `today`, and for the same reason, that a
   * pure function of its inputs is the only kind these unit tests can pin.
   * `useRowBasis` subscribes and puts the answer here, so every row on a page
   * redraws together when the preference moves.
   */
  readonly clock?: TimeFormat
}

/**
 * The display half of the task row: everything but the callbacks.
 *
 * Written as a `Pick` of the row's own interface rather than as a fresh shape,
 * so a prop that changes name or type in `task-row.tsx` fails the typecheck
 * here instead of silently going unmapped.
 */
export type TaskRowDisplay = Pick<
  TaskRowProps,
  | 'title'
  | 'folder'
  | 'due'
  | 'starts'
  | 'status'
  | 'important'
  | 'importantTooltip'
  | 'assignee'
  | 'unassigned'
  | 'createdBy'
  | 'pulled'
  | 'invitePending'
  | 'blockedBy'
  | 'steps'
  | 'recurrence'
>

/*
Q4's outward tooltip: "Also in Upcoming, due tomorrow" for a dated row, "Also in
Upcoming, starts 28 Sep" for a Start-only row (it sits in the dated block,
issue #216), and "Also in Anytime, in Work" for an undated one.
*/
function importantTooltipFor(
  task: Pick<TaskCard, 'important' | 'start_date' | 'due_date' | 'folder'>,
  mode: StarTooltipMode,
  today: string,
): string | undefined {
  if (mode === 'inward') return undefined
  if (task.due_date !== null) {
    return `Also in Upcoming, due ${formatDayInline(task.due_date, today)}`
  }
  if (task.start_date !== null) {
    return `Also in Upcoming, starts ${formatDayInline(task.start_date, today)}`
  }
  return `Also in Anytime, in ${task.folder.name}`
}

/*
9.4's parenthesis, that the un-pull control is "absent when the row also
qualifies automatically", and 7.8 is why it has to be: DELETE removes the
viewer's entry and the task stays in My Day while it still qualifies, so a
control offered on such a row promises a removal it cannot perform.

Q1's automatic disjunct is the whole condition, assigned to the viewer with an
**activation date** on or before today. Nothing on the wire reports it, 7.0's
card carrying the row rather than the reason it is on this page, so the client
derives it; today here is the same civil date the request that fetched the row
carried, so the two agree by construction. The residual is a midnight crossed
between fetch and render, which the next refetch of 8.3 corrects.

**The date is `coalesce(start_date, due_date)`** (issue #217), mirroring Q1's
clause on the server: a task assigned to the viewer that started three days ago
and is due next week qualifies automatically, and must not be offered an un-pull
that would delete the entry and leave the row where it was.
*/
function qualifiesAutomatically(
  task: Pick<TaskCard, 'assignee' | 'start_date' | 'due_date'>,
  viewerId: string | null,
  today: string,
): boolean {
  const activation = activationDateOf(task)
  return (
    viewerId !== null &&
    task.assignee?.id === viewerId &&
    activation !== null &&
    activation <= today
  )
}

/**
 * One 7.0 `TaskCard` as `TaskRow` takes it.
 *
 * The only function in this file a page calls per row, and the reason the
 * others are exported anyway is that the folder page, the sharing panel and the
 * task form need the same pieces without a card in hand.
 */
export function taskRowDisplay(task: TaskCard, context: RowContext): TaskRowDisplay {
  const {
    today,
    viewerId,
    folders,
    multiMemberFolderIds,
    starTooltip = 'inward',
    showFolder = true,
    showPullMarker = false,
    showDue = true,
    showCreator = false,
    clock = '12',
  } = context

  /*
  9.4: "assignee chip when not the viewer". Q2 and Q3 add the same exception
  from the other side, no chip on a row in the viewer's own default folder,
  which the glossary already makes redundant, Inbox having exactly one member
  who is its owner. Both are written because both are the specification's, and
  because a card whose folder stub says is_default is by Q2's own parenthesis
  the viewer's own.
  */
  const assignee =
    task.assignee !== null &&
    task.assignee.id !== viewerId &&
    !task.folder.is_default
      ? personDisplay(task.assignee)
      : undefined

  const range = showDue ? rangeDisplay(task, today, clock) : undefined

  return {
    title: task.title,
    folder: showFolder ? folderDisplay(task.folder, folders) : undefined,
    due: showDue ? (range?.due ?? dueDisplay(task, today, clock)) : undefined,
    starts: showDue ? (range?.starts ?? startsLabel(task, today)) : undefined,
    status: task.status,
    important: task.important,
    importantTooltip: importantTooltipFor(task, starTooltip, today),
    assignee,
    // Q3: null assignee in a folder with more than one member. Pending rows
    // only: the state lab scopes the chip ("Shared Planned context only"),
    // and on an abandoned row the Abandoned chip is the state that matters.
    unassigned:
      task.status === 'pending' &&
      task.assignee === null &&
      multiMemberFolderIds?.has(task.folder.id) === true,
    pulled:
      showPullMarker &&
      task.pulled &&
      !qualifiesAutomatically(task, viewerId, today),
    invitePending: task.pending_invite_email ?? undefined,
    // #225: 7.25's unfinished-blocker count; the row draws nothing at 0.
    blockedBy: task.blocked_by_count ?? 0,
    /*
    9.5's from half, drawn where the page asks for it.

    The name is the creator's own and never a fallback to the viewer: 4.5 makes
    `created_by` NOT NULL, so a card with no creator on the wire is an old
    response rather than a task nobody made, and the honest drawing of that is
    no chip. `DELETED_USER` covers the other case, an account that has since
    gone, which 7.4 already answers with a stub carrying a null display name.
    */
    createdBy:
      showCreator && task.created_by !== null
        ? (task.created_by.display_name ?? DELETED_USER)
        : undefined,
    // 4.6's counts, and no adornment when a task has no steps.
    steps:
      task.steps_total === 0
        ? undefined
        : { complete: task.steps_done, total: task.steps_total },
    /*
    Never set, deliberately.

    `task-row.tsx` renders the repeat glyph only when `recurrence` carries the
    rule as prose, announcing it as `Repeats {recurrence}`. 7.0 gives a card
    `is_recurring: boolean` and puts `recurrence_rule` on TaskDetail alone, so
    nothing this function receives can fill that string, and the two values that
    would fill it are both wrong: a rule invented here is copy no numbered
    section carries, and a placeholder renders "Repeats" twice over or once
    ungrammatically.

    So the glyph is absent until `task-row.tsx` admits the boolean it can
    actually be given.
    */
    /* The inline card built from this row must not say "Does not repeat" over a
       weekly task. The card cannot know the rule from a row (7.0 puts it on the
       detail alone), so the word is the fact the row does carry: that it
       repeats. */
    recurrence: task.is_recurring ? repeatWord(task.recurrence_rule) : undefined,
  }
}

/* The frequency the card's rule names, in the word `task-row.tsx` maps back to
   a repeat unit; "Repeats" when the rule cannot be read, which names no unit
   and so never claims one. */
const REPEAT_WORDS = { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly', YEARLY: 'Yearly' } as const
function repeatWord(rule: string | null): string {
  const parsed = rule === null ? null : parseRecurrenceRule(rule)
  return parsed !== null && parsed.ok ? REPEAT_WORDS[parsed.rule.freq] : 'Repeats'
}
