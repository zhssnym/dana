/*
 * The sidebar's Focus lists: Today and Upcoming for everyone, Assigned only for a viewer with a shared page,
 * plus lists added from "+". All read GET /views/focus. The choice and order live on the account
 * (`focus_lists`).
 */
import { useEffect } from 'react'

import { DEFAULT_FOCUS_LISTS, FOCUS_LISTS } from '../../shared/bundle.js'
import type { FocusAppearance, FocusListKey } from '../../shared/bundle.js'
import { markIcon } from '../components/page/icon-manifest.js'
import type { LucideIcon } from '../lib/icons.js'
import { CalendarDays, CalendarX, CircleAlert, ListTodo, Star, SunMedium, UserRoundCheck } from '../lib/icons.js'
import type { FocusAsk } from '../api/queries.js'
import { paths } from '../routes.js'
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

export const FOCUS_ASKS: Partial<Record<FocusListKey, FocusAsk>> = {
  important: { when: 'any', important: true, group: 'none' },
  overdue: { when: 'overdue', group: 'none' },
  undated: { when: 'undated', group: 'none' },
  open: { when: 'any', group: 'none' },
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

/** The one resolver for a Focus list's mark. No override keeps the native icon and graphite colour. */
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
 * The cover store key per list. `anytime` and `all` are the old No date and All open keys, kept so stored
 * covers still apply.
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

export function focusOffers(shown: readonly FocusListKey[]): readonly FocusList[] {
  return FOCUS_LISTS.filter((key) => !shown.includes(key)).map(focusList)
}

export function isFocusKey(value: string | undefined): value is FocusListKey {
  return (FOCUS_LISTS as readonly string[]).includes(value ?? '')
}

/** All stored lists, less Assigned for a viewer with no shared page. */
export function focusRows(lists: readonly FocusListKey[], shared: boolean): readonly FocusList[] {
  return lists.filter((key) => shared || key !== 'assignments').map(focusList)
}

/**
 * Focus pages have no View settings, so clear a Label filter an older client stored: it would otherwise label
 * every task made here, unseen.
 */
export function useNoStoredLabel(place: Pick<Place, 'filter' | 'setFilter'>): void {
  const { filter, setFilter } = place
  useEffect(() => {
    if (filter.label !== null) setFilter({ ...filter, label: null })
  }, [filter, setFilter])
}
