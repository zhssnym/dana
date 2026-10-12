import { describe, expect, it } from 'vitest'
import type { TaskCard } from '../../../shared/tasks.js'
import { expandedMonthWeekSteps, MONTH_RANGE_LANES, weekRanges } from './ranges.js'

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
  it('expands an all-range week even when there are no single-day Tasks', () => {
    const spanning = [
      task('a', '2026-09-28', '2026-10-04'),
      task('b', '2026-09-28', '2026-10-04'),
      task('c', '2026-09-28', '2026-10-04'),
    ]
    const compact = weekRanges(spanning, week, MONTH_RANGE_LANES)
    expect(compact.visible).toHaveLength(2)
    expect(compact.hidden.get('2026-09-30')).toBe(1)

    const steps = expandedMonthWeekSteps(spanning, week, new Map(), 0)
    expect(steps).toBe(1)
    const expanded = weekRanges(spanning, week, MONTH_RANGE_LANES + steps)
    expect(expanded.visible).toHaveLength(3)
    expect(expanded.hidden.size).toBe(0)
    // Expanding again must not shrink an already enlarged week.
    expect(expandedMonthWeekSteps(spanning, week, new Map(), steps)).toBe(steps)
  })

  it('also accounts for dated Task rows when expanding a week', () => {
    const spanning = [
      task('a', '2026-09-28', '2026-10-04'),
      task('b', '2026-09-28', '2026-10-04'),
      task('c', '2026-09-28', '2026-10-04'),
    ]
    const counts = new Map([['2026-09-30', 2]])
    expect(expandedMonthWeekSteps(spanning, week, counts, 0)).toBe(2)
    expect(expandedMonthWeekSteps([], week, new Map([['2026-09-30', 4]]), 0)).toBe(1)
    expect(expandedMonthWeekSteps([], week, new Map(), 0)).toBe(0)
  })

})
