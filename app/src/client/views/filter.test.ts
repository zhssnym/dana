import { describe, expect, it } from 'vitest'

import type { TaskCard } from '../../shared/tasks.js'
import { NO_TASK_FILTER, taskFilterChips, taskMatchesFilter } from './filter.js'

const labeled = {
  status: 'pending', assignee: null, assignees: [], start_date: null, due_date: null,
  important: true, is_recurring: false,
  labels: { personal: [{ id: 'personal', archived: false }], folder: [{ id: 'work', archived: false }] },
} as unknown as TaskCard
const unlabeled = { ...labeled, labels: { personal: [], folder: [] } } as TaskCard

describe('Work label filtering', () => {
  it('includes only tasks wearing the label and combines with the other axes', () => {
    const filter = { ...NO_TASK_FILTER, label: 'work', important: true, statuses: ['pending'] as const }
    expect(taskMatchesFilter(labeled, filter, '2026-10-02')).toBe(true)
    expect(taskMatchesFilter(unlabeled, filter, '2026-10-02')).toBe(false)
    expect(taskMatchesFilter({ ...labeled, important: false }, filter, '2026-10-02')).toBe(false)
  })

  it('removes only the label with its chip and clears it with the whole filter', () => {
    const filter = { ...NO_TASK_FILTER, label: 'work', important: true }
    const chips = taskFilterChips(filter, () => '', () => 'Research', '2026-10-02')
    expect(chips.find((chip) => chip.key === 'label')?.cleared).toEqual({ ...filter, label: null })
    expect(NO_TASK_FILTER.label).toBeNull()
  })
})
