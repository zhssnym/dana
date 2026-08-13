/*
The seam between our API shapes and the designer's display props.

RFC 0002 replaces what renders the data and nothing that fetches it, so this
client now has two halves that were written against different objects. Ours
answers 7.0: a `TaskCard` carrying `due_date` and `due_time`, a folder stub
with an id, an assignee with an id, and two step counts. His components take
what a row paints: a due label with a boolean beside it, a folder as a name
and a colour with no id, an assignee as initials and a name, and steps as a
done-and-total pair. This module is the whole of that mapping, and it exists
as one file rather than as a helper beside each page because the two halves
meet in exactly one place or they meet in six places that drift.

**No acceptance criterion sees this file.** The criteria address rendered
roles, names, regions and copy, and every one of them would still pass if a
label here read the wrong date, because they assert that a due badge exists
and never what it says. That is why the module is pure and unit-tested here:
these tests are the only thing that checks it.

**Nothing here reads a clock.** `api/tz.ts` is the only place this client
evaluates a date, and its own header says so; `presenterToday()` below is a
one-line pass-through to it, and every function that needs today takes it as
an argument. That keeps the module a function of its inputs, which is what
makes a due label testable at all, and it keeps the answer the same one the
`tz` parameter on the request that fetched the row was computed against.

**Three orderings that look like they belong here do not.** His prototype
carries `plannedServerOrder`, `importantServerOrder` and `doneGroups`, because
his screens run on `fixtures.ts` and have no server. Ours are fixed by section
6 and arrive already ordered, section 6's own sentence being "every view
returns rows already ordered; clients never re-sort", and 7.11 makes a rule
that exists only in the client a specification violation. None of the three is
ported and none should be.

What this module deliberately does not carry, so that a later session does not
go looking: the shapes of his `task-form`, `search-overlay`, `sharing-panel`
and `app-sidebar` are not mapped, because those components arrive at R5 to R9
and a mapping written against props that do not exist yet is a guess.
*/
import { todayInBrowserZone } from '../api/tz.js'
import { paths } from '../routes.js'
import type { Folder } from '../../shared/folders.js'
import type { TaskCard } from '../../shared/tasks.js'
import type { FolderGroupOption } from '../components/folder-group-dialog.js'
import type { FolderRowProps } from '../components/folder-row.js'
import type { TaskRowProps } from '../components/task-row.js'

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
The wording, derived rather than copied.

**The three cases are 8.10's boundary statement, exactly:** "a task with
due_date D is due today when D = today(V), overdue when D < today(V), future
when D > today(V)". So a label has three forms and no more.

**The overdue form is restricted to pending rows, and that restriction is
Q3C's sentence rather than a nicety:** "Pending renders normal (overdue styled
on past dates), completed faded and checked, abandoned faded and struck". A
finished task's date is history and the alert on it would be an alarm about
something already dealt with; the designer's own state lab agrees, its
STATE-03 completed row carrying "Due 9 Aug" on a date before its fixture's
today while STATE-02 carries "Overdue · 6 Aug".

**The format is the design's and this specification says so in as many
words.** 9.1's sections paragraph: "the format of a date is the design's and
this section has never spelled one". What the design gives is the literal
strings its rows show, "Due today", "Due 14 Aug" and "Overdue · 6 Aug", read
off the running prototype rather than off a formatter, because it has no
formatter: every due label in `fixtures.ts` and in `shell-page.tsx` is a
hand-written string. There was therefore nothing to port and the rule below is
this session's, built to reproduce those strings exactly.

**The time is carried when the row has one, on Q4's sentence:** dated rows
"show due date and time like a Planned row". 24-hour notation, per the
corpus-wide convention, and to minute precision because that is 4.11's.

**The month names are a fixed table and not `Intl`.** A locale-driven
formatter renders "août" on a French browser beside section 9's English copy,
and this machine's own tooling answers in French; the design's screens are
English and section 9's strings are normative English. A table also makes the
function total: it constructs no `Date`, so it cannot read a clock, cannot
shift a civil date across a zone, and cannot depend on an ICU version.
*/

/** 4.11's YYYY-MM-DD split into its three integers, with no `Date` involved. */
function parseCivilDate(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) return null
  const [, year, month, day] = match
  if (year === undefined || month === undefined || day === undefined) return null
  const monthNumber = Number(month)
  if (monthNumber < 1 || monthNumber > 12) return null
  return { year: Number(year), month: monthNumber, day: Number(day) }
}

const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/**
 * A due date as the design writes one: "6 Aug", and "6 Aug 2027" when the year
 * is not the year the reader is standing in.
 *
 * The year is this session's decision and is named as one in the report: the
 * design's screens show no year because every date on them falls inside the
 * fixture's own year, so they settle the same-year form and say nothing about
 * any other. Two dates twelve months apart rendering identically is the
 * failure the suffix exists to prevent, and it changes no string the design
 * actually shows.
 */
export function formatDueDate(dueDate: string, today: string): string {
  const parsed = parseCivilDate(dueDate)
  if (parsed === null) return dueDate
  const month = MONTH_ABBREVIATIONS[parsed.month - 1]
  if (month === undefined) return dueDate
  const dayAndMonth = `${String(parsed.day)} ${month}`
  const thisYear = parseCivilDate(today)?.year
  return thisYear === parsed.year ? dayAndMonth : `${dayAndMonth} ${String(parsed.year)}`
}

/**
 * 4.11's wall-clock time as a row shows it: HH:MM, 24-hour.
 *
 * The column is rendered by Postgres as HH:MM:SS and read tolerantly by the
 * shared shape, so the seconds are dropped here rather than assumed absent.
 */
function formatDueTime(dueTime: string): string {
  const match = /^(\d{2}):(\d{2})/.exec(dueTime)
  return match === null ? dueTime : `${match[1] ?? ''}:${match[2] ?? ''}`
}

/** What `TaskRowProps['due']` is, named so the rule below has a return type. */
export type DueDisplay = NonNullable<TaskRowProps['due']>

/**
 * The due badge for one card, or undefined when the task has no date.
 *
 * `status` decides only whether the overdue form is reachable; the comparison
 * itself is 8.10's. Both operands are 4.11 dates, so the lexicographic
 * comparison is the chronological one, which is the property that format was
 * chosen for.
 */
export function dueDisplay(
  task: Pick<TaskCard, 'status' | 'due_date' | 'due_time'>,
  today: string,
): DueDisplay | undefined {
  const { due_date: dueDate, due_time: dueTime } = task
  if (dueDate === null) return undefined

  const suffix = dueTime === null ? '' : ` ${formatDueTime(dueTime)}`
  const overdue = task.status === 'pending' && dueDate < today

  if (overdue) {
    return { label: `Overdue · ${formatDueDate(dueDate, today)}${suffix}`, overdue: true }
  }
  if (dueDate === today) return { label: `Due today${suffix}` }
  return { label: `Due ${formatDueDate(dueDate, today)}${suffix}` }
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
 * The specification is silent on initials at every section, so this is the
 * design's: brief section 6 gives an assigned row "a small avatar chip with
 * their name", and the running prototype renders "S" beside "Sara" and "IH"
 * for a two-word name. So: the first letter of the first word, plus the first
 * letter of the last word when there is more than one, upper-cased, never more
 * than two.
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

/** What `TaskRowProps['assignee']` is: precomputed initials plus a name. */
export type AssigneeDisplay = NonNullable<TaskRowProps['assignee']>

/** A person as his components take one, from 7.0's person shape. */
export function personDisplay(person: {
  display_name: string | null
}): AssigneeDisplay {
  const name = person.display_name ?? DELETED_USER
  return { initials: initialsOf(name), name }
}

/* ------------------------------------------------------------------ *
 * Folders
 * ------------------------------------------------------------------ */

/**
 * The dot's colour for a folder whose viewer has set none.
 *
 * A token reference and not a raw value, so 11.4's rule that raw colours live
 * only in `tokens.css` is untouched: this names the swatch the designer's own
 * fixtures give every folder in his sidebar and every folder chip in his rows.
 * A folder's real colour is 7.4's `my_color`, per member and free-form under
 * 4.4, which 4.4 makes nullable, so this is the value for the null and never a
 * substitute for a value the person chose.
 */
export const DEFAULT_FOLDER_COLOR = 'var(--color-graphite-900)'

/** What `TaskRowProps['folder']` is: a name and a colour, with no id. */
export type FolderDisplay = NonNullable<TaskRowProps['folder']>

/**
 * A folder's display pair, resolved by id.
 *
 * This is the mismatch this module exists for. 7.0's `TaskCard` carries a
 * folder stub of `{id, name, is_default}` and no colour, because the colour is
 * the viewer's own `my_color` on 7.4's membership and a card that carried it
 * would be answering a question the card never asks. His row takes a name and
 * a colour and no id. So the id is the key, `useFolders()` is the table, and
 * the stub's own name is the fallback for the window in which the folder list
 * has not arrived yet or a task names a folder that list does not hold.
 */
export function folderDisplay(
  stub: { id: string; name: string },
  folders: readonly Folder[],
): FolderDisplay {
  const folder = folders.find((candidate) => candidate.id === stub.id)
  return {
    name: folder?.name ?? stub.name,
    color: folder?.my_color ?? DEFAULT_FOLDER_COLOR,
  }
}

/** The display half of a sidebar folder row; the rest is the shell's. */
export type FolderRowDisplay = Pick<
  FolderRowProps,
  'name' | 'color' | 'pending' | 'href'
>

/**
 * One folder as his sidebar row takes it.
 *
 * `pending` is 8.11's pending tally, which 7.4 already puts on the Folder
 * object, and `href` is 9.1's routes table read through `routes.ts` rather
 * than spelled again here. AC-175 asserts that the row is a link to this path.
 */
export function folderRowDisplay(folder: Folder): FolderRowDisplay {
  return {
    name: folder.name,
    color: folder.my_color ?? DEFAULT_FOLDER_COLOR,
    pending: folder.counts.pending,
    href: paths.folder(folder.id),
  }
}

/*
The one place his model is keyed by a name and ours is keyed by an id.

9.1 makes a folder group "the label of 7.4's my-membership and nothing else",
so a group is a string on both sides and needs no bridge. His
`FolderGroupDialog` is the exception: it takes `folders` as `{name, color,
label}` and hands back `onSubmit(label, folderNames)`, so the folders a group
is being written onto come back as display names, while the write is PATCH
/folders/:id/my-membership and needs ids.

**Folder names are not unique and 4.3 does not make them so.** Its only unique
index is one Inbox per account; two folders a person can see may carry the
same name, one their own and one shared with them. So the resolution below is
one name to every id that carries it, deliberately, and a caller writing a
label through it writes it to all of them. That is the honest reading of a
choice the person made by pointing at a name: the alternative, picking one of
two identically labelled rows, writes to a folder they did not choose and
gives them no way to tell which. Recorded in the session report as a real
limitation of his dialog's shape rather than as a defect in either half.
*/

/** Every folder as his group dialog lists one. */
export function folderGroupOptions(
  folders: readonly Folder[],
): FolderGroupOption[] {
  return folders.map((folder) => ({
    name: folder.name,
    color: folder.my_color ?? DEFAULT_FOLDER_COLOR,
    label: folder.my_label,
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
 * sidebar's groups and his `groupLabels` and `existingLabels` props.
 *
 * `localeCompare` rather than a code-unit sort: 9.1 says "labels ascending"
 * and spells no collation, and a person's own label is free text they wrote.
 */
export function folderGroupLabels(folders: readonly Folder[]): string[] {
  const labels = new Set<string>()
  for (const folder of folders) {
    if (folder.my_label !== null) labels.add(folder.my_label)
  }
  return [...labels].sort((a, b) => a.localeCompare(b))
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
}

/**
 * The display half of his task row: everything but the callbacks and the
 * visual-state props his state lab drives.
 *
 * Written as a `Pick` of his own interface rather than as a fresh shape, so a
 * prop that changes name or type in `task-row.tsx` fails the typecheck here
 * instead of silently going unmapped.
 */
export type TaskRowDisplay = Pick<
  TaskRowProps,
  | 'title'
  | 'folder'
  | 'due'
  | 'status'
  | 'important'
  | 'importantTooltip'
  | 'assignee'
  | 'unassigned'
  | 'pulled'
  | 'invitePending'
  | 'steps'
  | 'recurrence'
>

/*
Q4's outward tooltip, in Q4's own words: "Also in Planned, due 2026-07-28" for
a dated row and "Also in Tasks, in Work" for an undated one. The date is
rendered as the card carries it, which is the form Q4's example writes and
therefore the one place in this file where a date is not the design's format.
*/
function importantTooltipFor(
  task: Pick<TaskCard, 'important' | 'due_date' | 'folder'>,
  mode: StarTooltipMode,
): string | undefined {
  if (mode === 'inward') return undefined
  return task.due_date === null
    ? `Also in Tasks, in ${task.folder.name}`
    : `Also in Planned, due ${task.due_date}`
}

/*
9.4's parenthesis, that the un-pull control is "absent when the row also
qualifies automatically", and 7.8 is why it has to be: DELETE removes the
viewer's entry and the task stays in My Day while it still qualifies, so a
control offered on such a row promises a removal it cannot perform.

Q1's automatic disjunct is the whole condition, assigned to the viewer with a
due date on or before today. Nothing on the wire reports it, 7.0's card
carrying the row rather than the reason it is on this page, so the client
derives it; today here is the same civil date the request that fetched the row
carried, so the two agree by construction. The residual is a midnight crossed
between fetch and render, which the next refetch of 8.3 corrects.
*/
function qualifiesAutomatically(
  task: Pick<TaskCard, 'assignee' | 'due_date'>,
  viewerId: string | null,
  today: string,
): boolean {
  return (
    viewerId !== null &&
    task.assignee?.id === viewerId &&
    task.due_date !== null &&
    task.due_date <= today
  )
}

/**
 * One 7.0 `TaskCard` as his `TaskRow` takes it.
 *
 * The only function in this file a page calls per row, and the reason the
 * others are exported anyway is that the folder page, the sharing panel and
 * the task form need the same pieces without a card in hand.
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

  return {
    title: task.title,
    folder: showFolder ? folderDisplay(task.folder, folders) : undefined,
    due: dueDisplay(task, today),
    status: task.status,
    important: task.important,
    importantTooltip: importantTooltipFor(task, starTooltip),
    assignee,
    // Q3: null assignee in a folder with more than one member.
    unassigned:
      task.assignee === null && multiMemberFolderIds?.has(task.folder.id) === true,
    pulled:
      showPullMarker &&
      task.pulled &&
      !qualifiesAutomatically(task, viewerId, today),
    invitePending: task.pending_invite_email ?? undefined,
    // 4.6's counts, and no adornment when a task has no steps.
    steps:
      task.steps_total === 0
        ? undefined
        : { complete: task.steps_done, total: task.steps_total },
    /*
    Never set, and the omission is a request rather than an oversight.

    The brief's state table asks a repeating row for "a small repeat glyph",
    and his `task-row.tsx` renders that glyph only when `recurrence` carries
    the rule as prose, announcing it as `Repeats {recurrence}`. Frozen 7.0
    gives a card `is_recurring: boolean` and puts `recurrence_rule` on
    TaskDetail alone, so nothing this function receives can fill that string,
    and the two values that would fill it are both wrong: a rule invented here
    is copy no numbered section carries, which RFC 0002 names as this
    package's most likely failure, and a placeholder renders "Repeats" twice
    over or once ungrammatically.

    So the glyph is absent until `task-row.tsx` admits the boolean it can
    actually be given. That file is the Component and Design System
    engineer's; the request is in the session report with this reasoning, and
    the visual review of section 13 item 33 is where the missing glyph shows.
    */
    recurrence: undefined,
  }
}
