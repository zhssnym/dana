/*
The Focus lists under the sidebar's Focus heading. Today and Upcoming for
everyone, and Assigned only for a viewer on a page that has another member,
because for someone alone it is every task they have (M4). The rest (Important,
Overdue, No date, All open) are lists a viewer adds from the heading's "+":
saved filters over the open tasks of every page, drawn by
`pages/FocusListPage.tsx` at `/app/lists/<key>`.

The viewer's choice and order live on the account (`focus_lists`, migration
0050). A key left out is a hidden list, and the "+" offers it back. Each list
also carries its own identity, an icon, colour and cover (#353, #355).
*/
import { useEffect } from 'react'

import type { TaskCard } from '../../shared/tasks.js'
import { DEFAULT_FOCUS_LISTS, FOCUS_LISTS } from '../../shared/bundle.js'
import type { FocusAppearance, FocusListKey } from '../../shared/bundle.js'
import { markIcon } from '../components/page/icon-manifest.js'
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
  /** A default is hidden rather than removed: its page stays, only the row goes. */
  readonly isDefault: boolean
}

export interface FocusMark {
  readonly icon: LucideIcon
  readonly color?: string
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
 * The one resolver for a Focus destination's mark. An absent override keeps
 * Dana's native icon and graphite colour; a stored icon is resolved through
 * the same manifest Pages and Collections use. Every compact surface asks this
 * function rather than inventing its own Focus icon map.
 */
export function focusMark(
  key: FocusListKey,
  appearance: FocusAppearance | undefined,
): FocusMark {
  const list = focusList(key)
  const override = appearance?.[key]
  return {
    icon: override?.icon == null ? list.icon : markIcon(override.icon),
    ...(override?.color == null ? {} : { color: override.color }),
  }
}

/**
 * Durable native-place cover rows that represent each Focus destination.
 * `anytime` is the former No date page and `all` the former All open page, so
 * those existing per-viewer stores keep serving the renamed Focus lists.
 * Issue #353 added `overdue`, so every Focus list now has the same cover path.
 */
export function focusIdentityKey(key: FocusListKey): string {
  switch (key) {
    case 'today':
    case 'scheduled':
    case 'assignments':
    case 'important':
    case 'overdue':
      return key
    case 'undated':
      return 'anytime'
    case 'open':
      return 'all'
  }
}

/** Every list the "+" can offer, in its order, less the ones already shown. */
export function focusOffers(shown: readonly FocusListKey[]): readonly FocusList[] {
  return FOCUS_LISTS.filter((key) => !shown.includes(key)).map(focusList)
}

export function isFocusKey(value: string | undefined): value is FocusListKey {
  return (FOCUS_LISTS as readonly string[]).includes(value ?? '')
}

/**
 * Which of the viewer's stored lists the sidebar draws: all of them, less
 * Assigned for a viewer with no page shared with anyone (M4).
 */
export function focusRows(lists: readonly FocusListKey[], shared: boolean): readonly FocusList[] {
  return lists.filter((key) => shared || key !== 'assignments').map(focusList)
}

/**
 * Upcoming's rows: from tomorrow on, for what Today already lists. Today (Q1)
 * holds the viewer's own late, started and due-today work, and any task the
 * viewer pulled in, so those are said once, there. A teammate's or an
 * unassigned task that is late, started or due today is on no Today, so it
 * stays here under its own heading rather than vanishing from both lists.
 */
export function upcomingRows(
  rows: readonly TaskCard[],
  today: string,
  viewerId: string | null,
): readonly TaskCard[] {
  return rows.filter((task) => {
    if (task.pulled) return false
    const rung = rungForTask(task, today).key
    if (rung === 'undated') return false
    const onToday = viewerId !== null && task.assignee?.id === viewerId
    return !onToday || (rung !== 'overdue' && rung !== 'started' && rung !== 'today')
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
