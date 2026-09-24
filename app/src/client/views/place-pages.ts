/*
The place-pages as one table: what each is called, which layouts and groupings
its View menu offers, and what a task made on it carries. Capture defaults are
decided here once, so a task made on a page appears on that page.

Keys and paths are the server's and the router's (`scheduled`, `assignments`);
only the names on screen are the redesign's ("Upcoming", "Assigned").
*/
import type { LucideIcon } from '../lib/icons.js'
import {
  CalendarDays,
  Layers3,
  SunMedium,
  UserRoundCheck,
} from '../lib/icons.js'
import { paths } from '../routes.js'
import { movableEnd } from '../parts/schedule.js'
import type { Schedule } from '../parts/schedule.js'
import type { GroupBy } from './filter.js'
import type { ViewMode } from './view-mode.js'

export type PlaceKey =
  | 'today'
  | 'scheduled'
  | 'assignments'
  | 'folder'

/** Where a page's always-visible capture point is, or that it has none. */
export type CaptureKind = 'floating' | 'inline' | 'none'

/** One Group by choice. `none` is the page's own arrangement, named for it. */
export interface GroupChoice {
  readonly value: GroupBy
  readonly label: string
}

export interface PlaceSpine {
  readonly key: PlaceKey
  /** The name on screen. */
  readonly name: string
  readonly path: string
  /** A page's one-line prose, where it still draws one. */
  readonly question?: string
  readonly icon: LucideIcon
  /** The View menu's Layout choices; a page with one has no Layout item. */
  readonly views: readonly ViewMode[]
  /** The View menu's Group by choices; empty means no Group by item. */
  readonly groups: readonly GroupChoice[]
  /** Whether the page has completed tasks to show. */
  readonly completed: boolean
  readonly capture: CaptureKind
  /** What a board groups by when Group by is the page's own arrangement. */
  readonly boardAxis: Exclude<GroupBy, 'none'>
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
      { value: 'none', label: 'None' },
      { value: 'folder', label: 'Folder' },
    ],
    completed: true,
    capture: 'floating',
    boardAxis: 'folder',
  },
  scheduled: {
    key: 'scheduled',
    name: 'Upcoming',
    path: paths.scheduled,
    icon: CalendarDays,
    views: ['list', 'calendar'],
    groups: [
      { value: 'none', label: 'Date' },
      { value: 'folder', label: 'Folder' },
    ],
    completed: true,
    capture: 'inline',
    boardAxis: 'folder',
  },
  assignments: {
    key: 'assignments',
    name: 'Assigned',
    path: paths.assignments,
    icon: UserRoundCheck,
    views: LIST_AND_BOARD,
    groups: [
      { value: 'none', label: 'Person' },
      { value: 'folder', label: 'Folder' },
    ],
    completed: false,
    capture: 'floating',
    boardAxis: 'person',
  },
  /*
  The folder page. Its name, path and capture are placeholders: it draws its own
  head, its address carries an id, and it supplies its own capture. It never
  groups by folder, and its board's columns are its sections.
  */
  folder: {
    key: 'folder',
    name: 'Folder',
    path: '',
    icon: Layers3,
    views: LIST_AND_BOARD,
    groups: [
      { value: 'none', label: 'None' },
      { value: 'person', label: 'Person' },
      { value: 'date', label: 'Date' },
    ],
    completed: true,
    capture: 'inline',
    boardAxis: 'section',
  },
}

/** The place a path is, or null where the path is not a place-page. */
export function placeAt(pathname: string): PlaceSpine | null {
  for (const spine of Object.values(PLACES)) {
    if (spine.path === pathname) return spine
  }
  return null
}

/**
 * A board column's own value, which a capture inside it writes over the page's
 * defaults. A column that is a relation rather than a value (Overdue) has none.
 */
export interface ColumnValue {
  readonly folder_id?: string
  readonly assignee_id?: string | null
  readonly due_date?: string | null
  /** Written by a drop alone (issue #216); a capture never writes it. */
  readonly start_date?: string | null
  /** Null is the loose list, which a drop out of a section writes. */
  readonly section_block_id?: string | null
}

/**
 * What a drop writes: a date column's day lands on the end of the Schedule the
 * row carries (Q3C), and a Start+Due pair is refused rather than half-moved.
 */
export function scheduleLanding(
  task: Schedule,
  landing: ColumnValue,
): ColumnValue | null {
  if (landing.due_date === undefined) return landing
  const end = movableEnd(task)
  if (end === null) return null
  if (end === 'due_date') return landing
  const { due_date: day, ...rest } = landing
  return { ...rest, start_date: day }
}

export interface CaptureDefaults {
  readonly folder_id?: string
  readonly due_date?: string | null
  readonly important?: boolean
  readonly assignee_id?: string | null
  /** Today's capture posts the task and then pulls it into Today (7.8). */
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
    /* Dated today, or the task would vanish from Upcoming, which holds dated rows only. */
    case 'scheduled':
      return { due_date: today, important: false, pullIntoToday: false }
    /* Assigned: 7.6 defaults `assignee_id` to the caller, so the task lands under "You". */
    case 'assignments':
    case 'folder':
      return { due_date: null, important: false, pullIntoToday: false }
  }
}
