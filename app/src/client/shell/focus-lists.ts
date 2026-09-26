/*
The Focus lists (round 8): the cross-project lists under the sidebar's Focus
heading. Today, Upcoming and Assigned are the defaults and keep their own
pages; the rest are saved filters over the open tasks of every page, drawn by
`pages/FocusListPage.tsx` at `/app/lists/<key>`.

The viewer's choice and order live on the account (`focus_lists`, migration
0050). A key left out is a hidden list, and the heading's "+" offers it back.
*/
import type { TaskCard } from '../../shared/tasks.js'
import { DEFAULT_FOCUS_LISTS, FOCUS_LISTS } from '../../shared/bundle.js'
import type { FocusListKey } from '../../shared/bundle.js'
import type { LucideIcon } from '../lib/icons.js'
import { CalendarDays, CalendarX, CircleAlert, ListTodo, Star, SunMedium, UserRoundCheck } from '../lib/icons.js'
import { paths } from '../routes.js'

export type { FocusListKey }

export interface FocusList {
  readonly key: FocusListKey
  readonly name: string
  readonly path: string
  readonly icon: LucideIcon
  /** A default is hidden rather than removed: its page stays, only the row goes. */
  readonly isDefault: boolean
}

/** A filtered list's rows out of every open task, given today's date. */
export type FocusFilter = (task: TaskCard, today: string) => boolean

export const FOCUS_FILTERS: Partial<Record<FocusListKey, FocusFilter>> = {
  important: (task) => task.important,
  overdue: (task, today) => task.due_date !== null && task.due_date < today,
  undated: (task) => task.due_date === null && task.start_date === null,
  open: () => true,
}

export const FOCUS_EMPTY: Partial<Record<FocusListKey, string>> = {
  important: 'Nothing is starred. Star a task and it appears here.',
  overdue: 'Nothing is overdue.',
  undated: 'Every open task has a date.',
  open: 'No open tasks.',
}

const TABLE: Record<FocusListKey, Omit<FocusList, 'key' | 'isDefault'>> = {
  today: { name: 'Today', path: paths.today, icon: SunMedium },
  scheduled: { name: 'Upcoming', path: paths.scheduled, icon: CalendarDays },
  assignments: { name: 'Assigned', path: paths.assignments, icon: UserRoundCheck },
  important: { name: 'Important', path: paths.focusList('important'), icon: Star },
  overdue: { name: 'Overdue', path: paths.focusList('overdue'), icon: CircleAlert },
  undated: { name: 'No date', path: paths.focusList('undated'), icon: CalendarX },
  open: { name: 'All open', path: paths.focusList('open'), icon: ListTodo },
}

export function focusList(key: FocusListKey): FocusList {
  return { key, ...TABLE[key], isDefault: DEFAULT_FOCUS_LISTS.includes(key) }
}

/**
 * Existing 4.20 place rows that are semantically the same Focus destination.
 * `anytime` is the former No date page and `all` the former All open page, so
 * those durable per-viewer stores can keep serving the renamed Focus lists.
 * Overdue never had its own place row; returning undefined is the backend
 * boundary rather than inventing local-only identity state.
 */
export function focusIdentityKey(key: FocusListKey): string | undefined {
  switch (key) {
    case 'today':
    case 'scheduled':
    case 'assignments':
    case 'important':
      return key
    case 'undated':
      return 'anytime'
    case 'open':
      return 'all'
    case 'overdue':
      return undefined
  }
}

/** Every list the "+" can offer, in its order, less the ones already shown. */
export function focusOffers(shown: readonly FocusListKey[]): readonly FocusList[] {
  return FOCUS_LISTS.filter((key) => !shown.includes(key)).map(focusList)
}

export function isFocusKey(value: string | undefined): value is FocusListKey {
  return (FOCUS_LISTS as readonly string[]).includes(value ?? '')
}
