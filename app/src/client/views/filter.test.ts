/*
The filter model's own unit tests. Not acceptance criteria: those belong to
`tests/e2e/` and to persona 11. What is measured here is the arithmetic three
surfaces depend on and none of them can show, because a page that renders the
right rows for the wrong reason looks identical.

Four properties earn their tests.

The neutral filter narrows nothing, which is the sentence every page's opening
state rests on. Turning an axis off restores exactly the rows it hid, which is
AC-167's second half expressed over the function rather than over the browser.
The empty assignee list means anyone and never nobody, which is DES-156's own
rule and the one an implementation gets backwards. And a saved definition
round-trips, which is what makes a view survive a client that gains an axis.
*/
import { describe, expect, test } from 'vitest'

import type { TaskCard } from '../../shared/tasks.js'
import {
  NO_FILTER,
  UNASSIGNED,
  applyFilter,
  filterChips,
  filterFromDefinition,
  isNarrowed,
  viewDefinition,
} from './filter.js'

const TODAY = '2026-08-25'

function card(overrides: Partial<TaskCard> & { id: string }): TaskCard {
  return {
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    status: overrides.status ?? 'pending',
    important: overrides.important ?? false,
    due_date: overrides.due_date ?? null,
    due_time: null,
    folder: overrides.folder ?? { id: 'folder-1', name: 'Groceries', is_default: false },
    assignee: overrides.assignee ?? null,
    is_recurring: overrides.is_recurring ?? false,
    steps_done: 0,
    steps_total: 0,
    pulled: false,
    pending_invite_email: null,
    created_at: overrides.created_at ?? '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  }
}

const hassan = { id: 'user-h', display_name: 'Hassan', avatar_url: null }
const imran = { id: 'user-i', display_name: 'Imran', avatar_url: null }

const ROWS: readonly TaskCard[] = [
  card({ id: 'a', due_date: TODAY, important: true, assignee: hassan }),
  card({ id: 'b', due_date: '2026-08-20', assignee: imran }),
  card({ id: 'c', assignee: null, is_recurring: true }),
  card({ id: 'd', status: 'abandoned' }),
]

describe('the neutral filter', () => {
  test('narrows nothing and says so', () => {
    expect(isNarrowed(NO_FILTER)).toBe(false)
    expect(applyFilter(ROWS, NO_FILTER, TODAY)).toEqual(ROWS)
    expect(filterChips(NO_FILTER, () => 'nobody')).toEqual([])
  })

  test('an empty assignee list means anyone, never nobody', () => {
    expect(applyFilter(ROWS, { ...NO_FILTER, assignees: [] }, TODAY)).toHaveLength(4)
    expect(
      applyFilter(ROWS, { ...NO_FILTER, assignees: [UNASSIGNED] }, TODAY).map((row) => row.id),
    ).toEqual(['c', 'd'])
    expect(
      applyFilter(ROWS, { ...NO_FILTER, assignees: [hassan.id, imran.id] }, TODAY).map(
        (row) => row.id,
      ),
    ).toEqual(['a', 'b'])
  })
})

describe('each axis narrows and un-narrows', () => {
  test('turning an axis off restores exactly what it hid', () => {
    const on = { ...NO_FILTER, important: true }
    expect(applyFilter(ROWS, on, TODAY).map((row) => row.id)).toEqual(['a'])
    // AC-167's second half over the function: the source array is never
    // mutated, so the rows come back rather than being re-fetched.
    expect(applyFilter(ROWS, NO_FILTER, TODAY)).toEqual(ROWS)
  })

  test('due presence and the two named ranges', () => {
    const ids = (due: 'with' | 'without' | 'overdue' | 'today' | 'week'): string[] =>
      applyFilter(ROWS, { ...NO_FILTER, due }, TODAY).map((row) => row.id)
    expect(ids('with')).toEqual(['a', 'b'])
    expect(ids('without')).toEqual(['c', 'd'])
    expect(ids('overdue')).toEqual(['b'])
    expect(ids('today')).toEqual(['a'])
    expect(ids('week')).toEqual(['a'])
  })

  test('repeating and show-abandoned', () => {
    expect(
      applyFilter(ROWS, { ...NO_FILTER, repeating: true }, TODAY).map((row) => row.id),
    ).toEqual(['c'])
    expect(
      applyFilter(ROWS, { ...NO_FILTER, showAbandoned: false }, TODAY).map((row) => row.id),
    ).toEqual(['a', 'b', 'c'])
  })

  test('manual sort leaves the order section 6 fixed', () => {
    expect(applyFilter(ROWS, NO_FILTER, TODAY).map((row) => row.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
    expect(
      applyFilter(ROWS, { ...NO_FILTER, sort: 'title' }, TODAY).map((row) => row.id),
    ).toEqual(['a', 'b', 'c', 'd'])
    expect(
      applyFilter(ROWS, { ...NO_FILTER, sort: 'due' }, TODAY).map((row) => row.id),
    ).toEqual(['b', 'a', 'c', 'd'])
  })
})

describe('the chips are one per narrowing axis, each clearing its own', () => {
  test('a chip clears its axis and leaves the rest', () => {
    const filter = { ...NO_FILTER, important: true, repeating: true, due: 'today' as const }
    const chips = filterChips(filter, () => 'Hassan')
    expect(chips.map((chip) => chip.key)).toEqual(['due', 'important', 'repeating'])
    const withoutImportant = chips.find((chip) => chip.key === 'important')?.cleared
    expect(withoutImportant?.important).toBe(false)
    expect(withoutImportant?.repeating).toBe(true)
    expect(withoutImportant?.due).toBe('today')
  })

  test('the important chip is not named the string 9.1 spends on a star', () => {
    const chips = filterChips({ ...NO_FILTER, important: true }, () => 'Hassan')
    expect(chips[0]?.label).toBe('Important only')
    expect(chips[0]?.label).not.toBe('Important')
  })
})

describe('a saved definition round-trips', () => {
  test('and carries ids rather than names', () => {
    const filter = {
      ...NO_FILTER,
      assignees: [hassan.id, UNASSIGNED],
      important: true,
      groupBy: 'person' as const,
    }
    const definition = viewDefinition(filter, 'scheduled')
    expect(JSON.stringify(definition)).not.toContain('Hassan')
    expect(filterFromDefinition(definition)).toEqual(filter)
  })

  test('a definition written by an older client fills its gaps', () => {
    expect(filterFromDefinition({ important: true })).toEqual({
      ...NO_FILTER,
      important: true,
    })
  })
})
