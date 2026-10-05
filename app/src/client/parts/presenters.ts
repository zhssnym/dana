/*
 * Maps API shapes (`TaskCard` and friends) to the components' display props. Pure and unit-tested: no
 * acceptance criterion checks these words. Nothing here reads a clock or re-sorts.
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

/** Pass-through to `api/tz.ts`, the client's only date evaluation. */
export function presenterToday(): string {
  return todayInBrowserZone()
}

/* The due label is `lib/dates.ts`'s plain form plus the time. No "Due" or "Overdue" words: overdue is a flag. */

/** A due date as the absolute form: "6 Aug", "6 Aug 2027" outside today's year. */
export function formatDueDate(dueDate: string, today: string): string {
  return formatDate(dueDate, today)
}

export type DueDisplay = NonNullable<TaskRowProps['due']>

/** Reads `due_date` only: a start date passing is not overdue (spec 9.5), so a Start-only card has no badge. */
export function dueDisplay(
  task: Pick<TaskCard, 'status' | 'due_date' | 'due_time'>,
  today: string,
  /* Defaults to '12' so callers that draw no time need not pass it. */
  clock: TimeFormat = '12',
): DueDisplay | undefined {
  const { due_date: dueDate, due_time: dueTime } = task
  if (dueDate === null) return undefined
  const label = formatDayTime(dueDate, dueTime, today, clock)
  const overdue = task.status === 'pending' && dueDate < today
  return overdue ? { label, overdue: true } : { label }
}

/**
 * The start as the row says it, or undefined with no start or when it is the due day. Never overdue: a start
 * passing is not late.
 */
export function startsLabel(
  task: Pick<TaskCard, 'start_date' | 'due_date'>,
  today: string,
): string | undefined {
  const { start_date: start, due_date: due } = task
  if (start === null || start === due) return undefined
  if (due !== null) return formatDay(start, today)
  /* Alone, the start is the whole phrase: "Started yesterday", "Starts Mon". */
  const day = formatDayInline(start, today)
  return start <= today ? `Started ${day}` : `Starts ${day}`
}

/** A range in one language ("22 Sep – 29 Sep") instead of "22 Sep – Mon". Undefined when there is no range. */
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

/** Spec 4.1's string for a scrubbed account. */
export const DELETED_USER = 'Deleted user'

/**
 * First letter of the first word plus the last word's, upper-cased, at most two. From the rendered name, so
 * "Deleted user" reads "DU". Code points, not UTF-16 units.
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

export type AssigneeDisplay = NonNullable<TaskRowProps['assignee']>

/* The picture is the default and initials the fallback. `avatar_url` is optional: some callers have none. */
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

/** The fallback for a null identity colour, as a token so it follows the theme. */
export const DEFAULT_FOLDER_COLOR = 'var(--color-graphite-900)'

export type FolderDisplay = NonNullable<TaskRowProps['folder']>

/*
 * The one resolver for a folder's mark, used by every surface. No chosen glyph answers the plain folder. A
 * value, not a hook: the caller holds the `/folders` list.
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

/** A shelf's mark through the same resolver and glyph table. */
export function shelfMark(shelf: {
  readonly icon: string | null
  readonly color: string | null
}): FolderMark {
  return {
    icon: markIcon(shelf.icon),
    color: shelf.color ?? DEFAULT_FOLDER_COLOR,
  }
}

/** Resolved by id against the folder list; the card's stub name is the fallback until the list arrives. */
export function folderDisplay(
  stub: { id: string; name: string },
  folders: readonly Folder[],
): FolderDisplay {
  const folder = folders.find((candidate) => candidate.id === stub.id)
  const mark = folderMark(folder)
  /* The row resolves the mark itself; it needs the id for the assignee menu and for moves. */
  return {
    id: stub.id,
    name: folder?.name ?? stub.name,
    color: mark.color,
  }
}

export type FolderRowDisplay = Pick<
  FolderRowProps,
  'name' | 'color' | 'icon' | 'href'
>

/** No count: a sidebar row is its mark and its name. */
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
 * `FolderGroupDialog` returns display names, but the write needs ids. Names are not unique, so one name maps to
 * every id carrying it, and a label goes to all of them.
 */

export function folderGroupOptions(
  folders: readonly Folder[],
): FolderGroupOption[] {
  return folders.map((folder) => ({
    name: folder.name,
    color: folderMark(folder).color,
    label: folder.my_shelf,
  }))
}

/** Every id whose folder carries a selected name, in `folders` order. */
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
 * Labels and shelf names together, ascending by `localeCompare`: they are one namespace. "Move to shelf" must
 * offer empty shelves, and the group dialog must refuse a shelf's name.
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

export interface InviteRowDisplay {
  readonly id: string
  /** Also how a test tells two rows apart. */
  readonly sentence: string
  /** The inviter's id, so the face matches the one they wear elsewhere. */
  readonly inviterId?: string
  readonly inviter: string
  readonly initials: string
  readonly image?: string
  readonly isFolder: boolean
}

/**
 * "connect" for a bare invite (null `folder_name`). A null inviter name is "Someone", not `DELETED_USER`: the
 * server scrubs a deleted account's own invites.
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

/** A property of the page, not the row: Important alone points outward (Q4). */
export type StarTooltipMode = 'inward' | 'outward'

export interface RowContext {
  /** From `presenterToday()`; never read from a clock here. */
  readonly today: string
  /** So a row can show the assignee chip only when it is not the viewer. */
  readonly viewerId: string | null
  /** The table the folder colour is resolved against. */
  readonly folders: readonly Folder[]
  /** The "unassigned" chip needs a folder with more than one member. Pages that do not show it pass nothing. */
  readonly multiMemberFolderIds?: ReadonlySet<string>
  /** Default inward; Important passes outward. */
  readonly starTooltip?: StarTooltipMode
  /** Default true. A Tasks row omits the folder: the group heading names it. */
  readonly showFolder?: boolean
  /** The pulled marker and un-pull control are My Day's alone. */
  readonly showPullMarker?: boolean
  /** Only Assignments passes this: elsewhere a creator on every row is noise. */
  readonly showCreator?: boolean
  /** Default true; Done passes false, since its headings already group by completion. */
  readonly showDue?: boolean
  /** Carried on the context so this module stays pure; `useRowBasis` subscribes. */
  readonly clock?: TimeFormat
}

/** A `Pick` of the row's own props, so a renamed prop fails the typecheck here. */
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
  | 'assignees'
  | 'unassigned'
  | 'createdBy'
  | 'pulled'
  | 'invitePending'
  | 'blockedBy'
  | 'labels'
  | 'steps'
  | 'recurrence'
>

/*
 * "Also in Upcoming, due tomorrow" for a dated row, "…, starts 28 Sep" for Start-only, "Also in Anytime, in
 * Work" undated.
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
 * The un-pull control is absent when the row also qualifies automatically: DELETE would leave the task in My
 * Day. Mirrors Q1: assigned to the viewer with `coalesce(start_date, due_date)` on or before today.
 */
function qualifiesAutomatically(
  task: Pick<TaskCard, 'assignee' | 'assignees' | 'start_date' | 'due_date'>,
  viewerId: string | null,
  today: string,
): boolean {
  const activation = activationDateOf(task)
  return (
    viewerId !== null &&
    (task.assignees?.some((person) => person.id === viewerId)
      ?? task.assignee?.id === viewerId) &&
    activation !== null &&
    activation <= today
  )
}

/** Personal labels, then the page's; active only. */
function rowLabels(task: TaskCard): NonNullable<TaskRowDisplay['labels']> {
  /* Guarded: a hand-built stub card may carry no labels. */
  return [...(task.labels?.personal ?? []), ...(task.labels?.folder ?? [])]
    .filter((label) => !label.archived)
    .map((label) => ({ id: label.id, name: label.name, color: label.color, scope: label.scope }))
}

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

  /* No assignee chip for the viewer, nor on a row in the viewer's default folder. */
  const visibleAssignees = !task.folder.is_default
    ? (task.assignees ?? (task.assignee === null ? [] : [task.assignee]))
        .filter((person) => person.id !== viewerId)
        .map(personDisplay)
    : []
  const assignee = visibleAssignees[0]

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
    assignees: visibleAssignees,
    // Q3: null assignee in a multi-member folder, pending rows only.
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
    labels: rowLabels(task),
    /* The creator's own name, never the viewer's. No creator on the wire draws no chip. */
    createdBy:
      showCreator && task.created_by !== null
        ? (task.created_by.display_name ?? DELETED_USER)
        : undefined,
    // 4.6's counts, and no adornment when a task has no steps.
    steps:
      task.steps_total === 0
        ? undefined
        : { complete: task.steps_done, total: task.steps_total },
    /* The row has only `is_recurring`, so the card shows the repeat word, never "Does not repeat". */
    recurrence: task.is_recurring ? repeatWord(task.recurrence_rule) : undefined,
  }
}

/* The rule's frequency word, which `task-row.tsx` maps back to a unit; "Repeats" when the rule is unreadable. */
const REPEAT_WORDS = { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly', YEARLY: 'Yearly' } as const
function repeatWord(rule: string | null): string {
  const parsed = rule === null ? null : parseRecurrenceRule(rule)
  return parsed !== null && parsed.ok ? REPEAT_WORDS[parsed.rule.freq] : 'Repeats'
}
