import { describe, expect, it } from 'vitest'
import type { TaskCard } from '../../../shared/tasks.js'
import { weekRanges } from './ranges.js'

const week = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']
const task = (id: string, start_date: string, due_date: string): TaskCard =>
  ({ id, start_date, due_date } as TaskCard)

describe('weekly Calendar ranges', () => {
  it('draws each spanning Task once and reveals ranges beyond the compact month lanes', () => {
    const result = weekRanges([
      task('a', '2026-09-27', '2026-10-04'),
      task('b', '2026-09-29', '2026-10-01'),
      task('c', '2026-09-30', '2026-10-03'),
    ], week, 2)
    expect(result.visible.map((range) => [range.task.id, range.first, range.last, range.lane])).toEqual([
      ['a', 0, 6, 0],
      ['b', 1, 3, 1],
    ])
    expect(result.hidden.get('2026-09-30')).toBe(1)
    expect(result.hidden.get('2026-10-03')).toBe(1)
    expect(result.hidden.has('2026-09-29')).toBe(false)
    expect(weekRanges([task('a', '2026-09-27', '2026-10-04')], week).visible).toHaveLength(1)
    expect(weekRanges([task('same-day', '2026-10-01', '2026-10-01')], week).visible).toHaveLength(0)
  })
})
