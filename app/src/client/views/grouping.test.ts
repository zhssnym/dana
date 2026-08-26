/*
Grouping's own unit tests.

Two rules here are stated in prose in two different documents and are true or
false only in this function: 9.5's "the viewer's own group first, 'Unassigned'
last", and DES-182's "capture in a column means capture with that column's
value", including the columns that carry none. Both are asserted.

The third is quieter and is the one a refactor breaks: a group keeps the order
its rows arrived in, because section 6 already fixed that order and a client
never re-sorts.
*/
import { describe, expect, test } from 'vitest'

import type { TaskCard } from '../../shared/tasks.js'
import { groupRows } from './grouping.js'
import { UNASSIGNED } from './filter.js'

const TODAY = '2026-08-25'
const VIEWER = 'user-h'

function card(
  id: string,
  folder: { id: string; name: string },
  assignee: { id: string; display_name: string | null } | null,
  due: string | null = null,
): TaskCard {
  return {
    id,
    title: id,
    status: 'pending',
    important: false,
    due_date: due,
    due_time: null,
    folder: { ...folder, is_default: false },
    assignee: assignee === null ? null : { ...assignee, avatar_url: null },
    is_recurring: false,
    steps_done: 0,
    steps_total: 0,
    pulled: false,
    pending_invite_email: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  }
}

const groceries = { id: 'f-g', name: 'Groceries' }
const work = { id: 'f-w', name: 'Work' }
const viewer = { id: VIEWER, display_name: 'Hassan' }
const other = { id: 'user-i', display_name: 'Imran' }

describe('the folder axis', () => {
  const rows = [
    card('a', groceries, viewer),
    card('b', work, other),
    card('c', groceries, null),
  ]

  test('names a column by the folder, and captures with its id', () => {
    const columns = groupRows(rows, 'folder', TODAY, VIEWER)
    expect(columns.map((column) => column.name)).toEqual(['Groceries', 'Work'])
    expect(columns[0]?.capture).toEqual({ folder_id: groceries.id })
    expect(columns[0]?.rows.map((row) => row.id)).toEqual(['a', 'c'])
  })
})

describe('the person axis', () => {
  const rows = [
    card('a', groceries, other),
    card('b', groceries, null),
    card('c', groceries, viewer),
  ]

  test("the viewer's own group first and Unassigned last", () => {
    const columns = groupRows(rows, 'person', TODAY, VIEWER)
    expect(columns.map((column) => column.name)).toEqual(['You', 'Imran', 'Unassigned'])
    expect(columns[2]?.key).toBe(UNASSIGNED)
  })

  test('a column captures with the person it names', () => {
    const columns = groupRows(rows, 'person', TODAY, VIEWER)
    expect(columns[0]?.capture).toEqual({ assignee_id: VIEWER })
    expect(columns[2]?.capture).toEqual({ assignee_id: null })
  })
})

describe('the date axis', () => {
  test('shares the ladder, and a relation carries no value to write', () => {
    const rows = [
      card('late', groceries, null, '2026-08-01'),
      card('now', groceries, null, TODAY),
      card('none', groceries, null, null),
    ]
    const columns = groupRows(rows, 'date', TODAY, VIEWER)
    expect(columns.map((column) => column.name)).toEqual(['Overdue', 'Today', 'No date'])
    expect(columns[0]?.capture).toBeNull()
    expect(columns[1]?.capture).toEqual({ due_date: TODAY })
  })
})

describe('a seeded column survives having no rows', () => {
  test('so a board always offers somewhere to capture', () => {
    const columns = groupRows([], 'folder', TODAY, VIEWER, [
      {
        key: groceries.id,
        name: 'Groceries',
        capture: { folder_id: groceries.id },
        mark: { kind: 'folder', folderId: groceries.id },
        rows: [],
      },
    ])
    expect(columns).toHaveLength(1)
    expect(columns[0]?.rows).toEqual([])
    expect(columns[0]?.capture).toEqual({ folder_id: groceries.id })
  })
})
