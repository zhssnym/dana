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
import { markIcon } from '../components/page/icon-manifest.js'
import type { LucideIcon } from '../lib/icons.js'
import { paths } from '../routes.js'
import type { Folder } from '../../shared/folders.js'
import type { TaskCard } from '../../shared/tasks.js'
import type { FolderGroupOption } from '../components/folder-group-dialog.js'
import type { FolderRowProps } from '../components/folder-row.js'
import type { TaskRowProps } from '../components/task-row.js'
import { formatTime } from '../lib/time-format.js'
import type { TimeFormat } from '../lib/time-format.js'

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
"show due date and time like a Planned row", to minute precision because that
is 4.11's. **On the viewer's own clock since S17b**, where this read "24-hour
notation, per the corpus-wide convention": that convention is this
repository's for its documents, and 9.7 gives the person the choice for their
rows. The notation therefore arrives on the context rather than being decided
here, and a fresh account reads 12-hour, which is `lib/time-format.ts`'s
default and Imran's ruling of 2026-08-18.

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
 * 4.11's wall-clock time as a row shows it, on the viewer's own clock.
 *
 * The column is rendered by Postgres as HH:MM:SS and read tolerantly by the
 * shared shape, so the seconds are dropped here rather than assumed absent.
 *
 * **It was fixed at 24-hour until S17b, and that was the clock preference's
 * missing half.** `lib/time-format.ts` has been "the one place a time becomes
 * words" since S11 and this was a second place, invisible because the two
 * agreed whenever a person had not chosen: 12-hour is that module's default
 * and this was not it, so a fresh account read 17:30 on its rows and 5:30 PM
 * in its pickers. 9.7 names the control, S17b built it, and a control that
 * changed the picker and left every row alone would be a setting nobody could
 * see, which is the defect item 30 records one level up.
 */
function formatDueTime(dueTime: string, clock: TimeFormat): string {
  const match = /^(\d{2}):(\d{2})/.exec(dueTime)
  if (match === null) return dueTime
  return formatTime(`${match[1] ?? ''}:${match[2] ?? ''}`, clock) ?? dueTime
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
  /* The viewer's clock (9.7, 4.19). Defaulted to the module's own default so
     the callers that draw a date and never a time need not thread it. */
  clock: TimeFormat = '12',
): DueDisplay | undefined {
  const { due_date: dueDate, due_time: dueTime } = task
  if (dueDate === null) return undefined

  const suffix = dueTime === null ? '' : ` ${formatDueTime(dueTime, clock)}`
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
 * The mark's colour for a folder whose identity carries none.
 *
 * A token reference and not a raw value, so 11.4's rule that raw colours live
 * only in `tokens.css` is untouched. It is the same colour
 * `parts/identity-colors.ts` spells as a hex for the wire, and the two
 * spellings are not a duplication: 4.3's CHECK stores a literal because the
 * value is shared data read by every member in every colourway, and this side
 * draws it, where a token is what follows the viewer's theme.
 *
 * **Rewritten at S17a**, where it read "the dot's colour ... a folder's real
 * colour is 7.4's `my_color`". 9.6 retires that column from every v2 surface
 * in terms, so this is the fallback for a null 4.3 identity colour and no
 * longer for a null personal one.
 */
export const DEFAULT_FOLDER_COLOR = 'var(--color-graphite-900)'

/** What `TaskRowProps['folder']` is: a name, a colour and the folder's mark. */
export type FolderDisplay = NonNullable<TaskRowProps['folder']>

/*
One resolver for a folder's mark, and every surface asks it.

**This is the mechanism S17a exists to fix, and the designer's own header
warns it will recur.** DES-130 put a folder's identity in 4.3's shared columns
and only the surfaces written *after* that ruling ever read it, so the folder
page and the shelf row drew the glyph a person picked while the sidebar drew a
colour dot, the task row a literal folder and the tab menu a generic icon.
Imran, 2026-08-22: "This thing needs consistency not only in Assignments page,
in all task rows wherever they might be." An identity that only some surfaces
honour is not an identity; it is a decoration on one screen.

**A folder with no chosen glyph still answers the plain folder**, which is why
this can replace the literal safely: the default is the thing it is replacing.
`markIcon` is `components/page/icon-manifest.ts`'s, the manifest that already
joins 4.3's forty-two keys to their drawings for the picker and for the folder
page's own mark, so there is one glyph table as well as one resolver.

**It is a value rather than a hook**, and the difference is at the call sites:
a row's chip takes a component and a colour as props and the shell's tab face
takes them somewhere else, so a component that could only be rendered whole
would have forced each of them to be rewritten around it. That is the
designer's own reason for exporting `useFolderMark` rather than a component.
Here the store is the `/folders` read the chrome already made, so the lookup is
by id against a list the caller is holding, and nothing in this module fetches.
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
 * A shelf's mark, through the same resolver, added at S17b when shelves
 * reached the Library.
 *
 * 4.18 gives a shelf the same two identity columns 4.3 gives a folder, an
 * icon key and a colour, and 9.10 calls the shelf "the folder page one level
 * up" with "a mark (icon and colour)" of its own. So the resolution is the
 * same resolution and this is a second signature rather than a second
 * implementation: one glyph table, one default, and a shelf that has chosen
 * nothing answering the plain glyph exactly as a folder does. Writing
 * `markIcon(shelf.icon)` at the sidebar's call site would have been shorter
 * and would have been the second resolver DES-130 exists to prevent.
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
  **Seam, S23: the mark leaves this trio and the id joins it.**

  The v2 row resolves a folder's glyph itself, through
  `components/folder-mark.tsx`, which is the designer's own arrangement and
  his own reason for it: "the call sites need the two values separately, the
  row's chip takes `icon` and `color` as props, the card takes them somewhere
  else, and a component that could only be rendered whole would have forced
  each of them to be rewritten around it." A mark passed in here would be a
  second answer to a question that surface already asks, which is the fault
  DES-130 names and this module's own header repeats.

  What the row cannot resolve for itself is the id, because 7.0's folder stub
  carries one and `TaskRowProps['folder']` did not until this row widened it.
  Two things on the surface need it: the assignee menu, whose roster is 4.4's
  members of that folder, and every write that moves a task.

  `folderMark` stays exported and unchanged. The sidebar, the tab face and the
  shelf row all still ask it, and none of them is a lifted surface.
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
  'name' | 'color' | 'icon' | 'pending' | 'href'
>

/**
 * One folder as his sidebar row takes it.
 *
 * `pending` is 8.11's pending tally, which 7.4 already puts on the Folder
 * object, and `href` is 9.1's routes table read through `routes.ts` rather
 * than spelled again here. AC-175 asserts that the row is a link to this path,
 * and AC-243 that its mark is the one that folder's own page draws.
 */
export function folderRowDisplay(folder: Folder): FolderRowDisplay {
  const mark = folderMark(folder)
  return {
    name: folder.name,
    color: mark.color,
    icon: mark.icon,
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
    color: folderMark(folder).color,
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
 *
 * **The shelves join the labels at S17b**, and the two callers are why it is
 * one list rather than two. This feeds the "Move to shelf" submenu, which has
 * to offer a shelf holding nothing or a person can never put the first folder
 * on one; and it feeds the group dialog's duplicate check, which has to refuse
 * a name a shelf already carries or the create below it hits 7.16's own
 * refusal with a message about groups. 4.18 makes them one namespace, a
 * shelf's name being its folders' label, so a union is what that namespace is.
 */
export function folderGroupLabels(
  folders: readonly Folder[],
  shelves: readonly { readonly name: string }[] = [],
): string[] {
  const labels = new Set<string>()
  for (const folder of folders) {
    if (folder.my_label !== null) labels.add(folder.my_label)
  }
  for (const shelf of shelves) labels.add(shelf.name)
  return [...labels].sort((a, b) => a.localeCompare(b))
}

/** What 9.6's "Label and color" dialog opens holding. */
export interface FolderLabelFields {
  /** The personal label, empty where the folder carries none. */
  readonly label: string
  /**
   * The chosen colour as `#RRGGBB`, or undefined where none was chosen.
   *
   * Undefined rather than a hex of this module's own, and the distinction is
   * 11.4's: a folder's colour is the person's runtime choice on 7.4's
   * `my_color` and a client that supplied one from its own swatches would be
   * telling them they picked a colour they did not. `DEFAULT_FOLDER_COLOR`
   * above is the token a dot is *painted* with when there is no choice, which
   * is a CSS variable and not a value a colour control can hold.
   */
  readonly color: string | undefined
}

/**
 * A folder as 9.6's dialog takes it: the personal label and the colour
 * together, "both being the two fields of 7.4's my-membership and neither
 * meaning anything without the other".
 *
 * The mapping is null-to-absent in both directions, which is the whole of the
 * shape: 4.4 makes each column nullable, a text box holds "" rather than null,
 * and a colour control holds a hex or nothing at all.
 */
export function folderLabelFields(folder: {
  my_label: string | null
  my_color: string | null
}): FolderLabelFields {
  return {
    label: folder.my_label ?? '',
    color: folder.my_color ?? undefined,
  }
}

/* ------------------------------------------------------------------ *
 * Invites
 * ------------------------------------------------------------------ */

/** One row of 9.8's invite gate, as the gate draws one. */
export interface InviteRowDisplay {
  readonly id: string
  /** 9.8's row sentence, which is also how a test tells two rows apart. */
  readonly sentence: string
  /** The inviter's display name, which is what the disc's tint is a function
      of (`parts/person-tint.ts`) and what the sentence already names. */
  readonly inviter: string
  /** The inviter's initials, for the row's avatar. */
  readonly initials: string
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
  inviter: { display_name: string | null }
  folder_name: string | null
}): InviteRowDisplay {
  const who = invite.inviter.display_name ?? 'Someone'
  return {
    id: invite.id,
    sentence: `${who} invited you to ${invite.folder_name ?? 'connect'}`,
    inviter: who,
    initials: initialsOf(who),
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
 * The display half of his task row: everything but the callbacks.
 *
 * It used to read "everything but the callbacks and the visual-state props his
 * state lab drives", and the second half went with those props at S11: nothing
 * in this client ever drove them, which is DES-184 one axis over.
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
  | 'createdBy'
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

  return {
    title: task.title,
    folder: showFolder ? folderDisplay(task.folder, folders) : undefined,
    due: showDue ? dueDisplay(task, today, clock) : undefined,
    status: task.status,
    important: task.important,
    importantTooltip: importantTooltipFor(task, starTooltip),
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
    /*
    9.5's from half, drawn where the page asks for it.

    The name is the creator's own and never a fallback to the viewer: 4.5
    makes `created_by` NOT NULL, so a card with no creator on the wire is a
    response older than RFC 0005 unit 12a rather than a task nobody made, and
    the honest drawing of that is no chip. `DELETED_USER` covers the other
    case, an account that has since gone, which 7.4 already answers with a
    stub carrying a null display name.
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
    /* polish: places F8. The inline card built from this row said "Does not
       repeat" over a task the panel beside it called weekly, because this
       was never set. The card cannot know the rule from a row (7.0 puts it
       on the detail alone), so the word is the fact the row does carry:
       that it repeats. */
    recurrence: task.is_recurring ? 'Repeats' : undefined,
  }
}
