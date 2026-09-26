/*
The Focus lists under the sidebar's Focus heading (M4): Today and Upcoming for
everyone, and Assigned only for a viewer on a page that has another member,
because for someone alone it is every task they have. The order is fixed and
nothing is added, hidden or reordered.

`focus_lists` on the account (migration 0050) is no longer read to decide the
rows. Its stored keys, removed lists included (Important, Overdue, No date,
All open), are left exactly as they are: never rewritten, never an error.
`/app/lists/<key>` redirects to Today (`pages/FocusListPage.tsx`).
*/
import { useEffect } from 'react'

import type { TaskCard } from '../../shared/tasks.js'
import type { FocusListKey } from '../../shared/bundle.js'
import type { LucideIcon } from '../lib/icons.js'
import { CalendarDays, CalendarX, CircleAlert, ListTodo, Star, SunMedium, UserRoundCheck } from '../lib/icons.js'
import { paths } from '../routes.js'
import { rungForTask } from '../views/ladder.js'
import type { Place } from '../views/usePlace.js'

export type { FocusListKey }

export interface FocusList {
  readonly key: FocusListKey
  readonly name: string
  readonly path: string
  readonly icon: LucideIcon
}

/* Every stored key keeps a name, so an old in-app tab on a retired list still
   has a title; only the first three are ever drawn in the sidebar. */
const TABLE: Record<FocusListKey, Omit<FocusList, 'key'>> = {
  today: { name: 'Today', path: paths.today, icon: SunMedium },
  scheduled: { name: 'Upcoming', path: paths.scheduled, icon: CalendarDays },
  assignments: { name: 'Assigned', path: paths.assignments, icon: UserRoundCheck },
  important: { name: 'Important', path: paths.focusList('important'), icon: Star },
  overdue: { name: 'Overdue', path: paths.focusList('overdue'), icon: CircleAlert },
  undated: { name: 'No date', path: paths.focusList('undated'), icon: CalendarX },
  open: { name: 'All open', path: paths.focusList('open'), icon: ListTodo },
}

export function focusList(key: FocusListKey): FocusList {
  return { key, ...TABLE[key] }
}

/** The sidebar's Focus rows: Assigned only when somebody else could assign. */
export function focusRows(shared: boolean): readonly FocusList[] {
  const keys: FocusListKey[] = shared ? ['today', 'scheduled', 'assignments'] : ['today', 'scheduled']
  return keys.map(focusList)
}

const KNOWN = Object.keys(TABLE)

export function isFocusKey(value: string | undefined): value is FocusListKey {
  return KNOWN.includes(value ?? '')
}

/**
 * Upcoming's rows: from tomorrow on. What is late, started or due today is
 * Today's ("Carried over", "Started", "Today"), and so is a later task the
 * viewer pulled into Today ("Added to Today"): one task is said once.
 */
export function upcomingRows(rows: readonly TaskCard[], today: string): readonly TaskCard[] {
  return rows.filter((task) => {
    if (task.pulled) return false
    const rung = rungForTask(task, today).key
    return rung !== 'overdue' && rung !== 'started' && rung !== 'today' && rung !== 'undated'
  })
}

/** An open list's rows: a dropped task leaves the list; a done one lingers until the list refreshes. */
export function withoutDropped(rows: readonly TaskCard[]): readonly TaskCard[] {
  return rows.filter((task) => task.status !== 'abandoned')
}

/**
 * The Focus pages keep no View settings (M4: no Group by, Sort, Label or
 * Show completed). A Label narrowing stored by an older client would still
 * put that Label on every task made here, unseen, so it is cleared.
 */
export function useNoStoredLabel(place: Pick<Place, 'filter' | 'setFilter'>): void {
  const { filter, setFilter } = place
  useEffect(() => {
    if (filter.label !== null) setFilter({ ...filter, label: null })
  }, [filter, setFilter])
}
