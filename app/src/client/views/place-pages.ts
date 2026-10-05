/*
 * The place pages as one table: names, View menu choices and capture defaults, so a task made on a page appears
 * there. Keys and paths are the server's; only on-screen names differ ("Upcoming", "Assigned").
 */
import type { LucideIcon } from '../lib/icons.js'
import {
  CalendarDays,
  Layers3,
  SunMedium,
  UserRoundCheck,
} from '../lib/icons.js'
import { paths } from '../routes.js'
import { movableEnd, shiftedSchedule } from '../parts/schedule.js'
import type { Schedule } from '../parts/schedule.js'
import type { GroupBy } from './filter.js'
import type { ViewMode } from './view-mode.js'

export type PlaceKey =
  | 'today'
  | 'scheduled'
  | 'assignments'
  | 'focus'

export type CaptureKind = 'inline' | 'none'

/** `none` is the page's own arrangement: "Default" on every list. */
export interface GroupChoice {
  readonly value: GroupBy
  readonly label: string
}

export interface PlaceSpine {
  readonly key: PlaceKey
  readonly name: string
  readonly path: string
  /** A page's one-line prose, where it still draws one. */
  readonly question?: string
  readonly icon: LucideIcon
  /** A page with one has no Layout item. */
  readonly views: readonly ViewMode[]
  /** Empty means no Group by item. */
  readonly groups: readonly GroupChoice[]
  readonly completed: boolean
  readonly capture: CaptureKind
  /** What a board groups by when Group by is the page's own arrangement. */
  readonly boardAxis: Exclude<GroupBy, 'none'>
  /** The Sort name for the page's own order where rows cannot be hand-ordered. Absent: "Manual". */
  readonly ownOrder?: string
}

const LIST_AND_BOARD: readonly ViewMode[] = ['list', 'board']

export const PLACES: Record<PlaceKey, PlaceSpine> = {
  today: {
    key: 'today',
    name: 'Today',
    path: paths.today,
    icon: SunMedium,
    views: ['list'],
    groups: [
      /* Today's own groups: Carried over, Today, In progress, Added to Today. */
      { value: 'none', label: 'Default' },
      { value: 'folder', label: 'Page' },
    ],
    completed: true,
    capture: 'inline',
    boardAxis: 'folder',
    ownOrder: 'Default',
  },
  scheduled: {
    key: 'scheduled',
    name: 'Upcoming',
    path: paths.scheduled,
    icon: CalendarDays,
    views: ['list', 'calendar'],
    groups: [
      /* Upcoming's own groups: the date ladder (Overdue, In progress, Today, ...). */
      { value: 'none', label: 'Default' },
      { value: 'folder', label: 'Page' },
    ],
    completed: true,
    capture: 'inline',
    boardAxis: 'folder',
    ownOrder: 'Default',
  },
  assignments: {
    key: 'assignments',
    name: 'Assigned',
    path: paths.assignments,
    icon: UserRoundCheck,
    views: LIST_AND_BOARD,
    groups: [
      /* Assigned's own groups: one per person. */
      { value: 'none', label: 'Default' },
      { value: 'folder', label: 'Page' },
    ],
    completed: true,
    capture: 'inline',
    boardAxis: 'person',
    ownOrder: 'Default',
  },
  /* An added Focus list. No capture: a filter such as Overdue has no value a new task could carry. */
  focus: {
    key: 'focus',
    name: 'List',
    path: '',
    icon: Layers3,
    views: LIST_AND_BOARD,
    groups: [
      { value: 'none', label: 'Default' },
      { value: 'folder', label: 'Page' },
      { value: 'person', label: 'Person' },
      { value: 'date', label: 'Date' },
    ],
    completed: false,
    capture: 'none',
    boardAxis: 'folder',
    ownOrder: 'Default',
  },
}

/** A column's own value, written over the page's defaults. A relation column (Overdue) has none. */
export interface ColumnValue {
  readonly assignee_ids?: string[]
  readonly folder_id?: string
  readonly assignee_id?: string | null
  readonly due_date?: string | null
  /** Written by a drop only; a capture never writes it. */
  readonly start_date?: string | null
  /** Null is the loose list, which a drop out of a section writes. */
  readonly section_block_id?: string | null
}

/** A date column's day lands on the end of the Schedule the row carries; a Start+Due pair moves whole. */
export function scheduleLanding(
  task: Schedule,
  landing: ColumnValue,
): ColumnValue | null {
  if (landing.due_date === undefined) return landing
  const end = movableEnd(task)
  if (end === null) return null
  if (end === 'due_date') return landing
  const { due_date: day, ...rest } = landing
  if (end === 'start_date') return { ...rest, start_date: day }
  /* The deadline lands on the day and the start keeps its distance. It cannot move into "No date". */
  if (day === null || task.due_date === null) return null
  const moved = shiftedSchedule(task, task.due_date, day)
  return moved === null ? null : { ...rest, ...moved }
}

export interface CaptureDefaults {
  readonly folder_id?: string
  readonly due_date?: string | null
  readonly important?: boolean
  readonly assignee_id?: string | null
  /** Today's capture posts the task, then pulls it into Today. */
  readonly pullIntoToday: boolean
}

/** 9.3's entry defaults for the page a person is on, a column's value over them. */
export function captureDefaults(
  place: PlaceKey,
  today: string,
  column?: ColumnValue,
): CaptureDefaults {
  const base = placeDefaults(place, today)
  return {
    ...base,
    ...(column?.folder_id === undefined ? {} : { folder_id: column.folder_id }),
    ...(column?.due_date === undefined ? {} : { due_date: column.due_date }),
    ...(column?.assignee_id === undefined ? {} : { assignee_id: column.assignee_id }),
  }
}

function placeDefaults(place: PlaceKey, today: string): CaptureDefaults {
  switch (place) {
    case 'today':
      return { due_date: today, important: false, pullIntoToday: true }
    /* Dated today, or the task would vanish from Upcoming. */
    case 'scheduled':
      return { due_date: today, important: false, pullIntoToday: false }
    /* The server defaults `assignee_id` to the caller, so the task lands under "You". */
    case 'assignments':
    case 'focus':
      return { due_date: null, important: false, pullIntoToday: false }
  }
}
