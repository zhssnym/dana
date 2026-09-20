/*
The four Schedule states, read by the one module that answers for them.

Every seam that reads a task's dates goes through `parts/schedule.ts` since
2026-09-20: the row presenter, the list ladder, the board's date axis, the
calendar's cell placement, both drags and the folder list's hand order. The
seams have their own cases, and what this file pins is the three expressions
they share, over all four states at once, because the failure this module
exists to prevent is one seam quietly disagreeing with another about what
"has a date" means.

The states are 4.5's, with `tasks_start_before_due_check` making the start no
later than the due date wherever both exist: Due-only, Start-only, Start+Due,
and neither.
*/
import { describe, expect, test } from 'vitest'

import {
  activationDateOf,
  isScheduled,
  movableEnd,
  scheduleDateOf,
} from './schedule.js'
import type { Schedule } from './schedule.js'

const dueOnly: Schedule = { start_date: null, due_date: '2026-09-30' }
const startOnly: Schedule = { start_date: '2026-09-20', due_date: null }
const pair: Schedule = { start_date: '2026-09-20', due_date: '2026-09-30' }
const neither: Schedule = { start_date: null, due_date: null }

describe('scheduleDateOf: where a task is placed (Q3, 9.5)', () => {
  test('the due date where there is one, the start date where there is only that', () => {
    expect(scheduleDateOf(dueOnly)).toBe('2026-09-30')
    expect(scheduleDateOf(startOnly)).toBe('2026-09-20')
    // 9.5's own example: "a task starting 20 September and due 30 September
    // sits under the 30 September rung".
    expect(scheduleDateOf(pair)).toBe('2026-09-30')
    expect(scheduleDateOf(neither)).toBeNull()
  })
})

describe('activationDateOf: when a Schedule begins (Q1, 8.1, 8.2)', () => {
  test('the start date where there is one, the due date otherwise', () => {
    expect(activationDateOf(dueOnly)).toBe('2026-09-30')
    expect(activationDateOf(startOnly)).toBe('2026-09-20')
    expect(activationDateOf(pair)).toBe('2026-09-20')
    expect(activationDateOf(neither)).toBeNull()
  })

  test('and is never later than the placement date, which is the span', () => {
    for (const task of [dueOnly, startOnly, pair]) {
      const from = activationDateOf(task)
      const to = scheduleDateOf(task)
      expect(from !== null && to !== null && from <= to).toBe(true)
    }
  })
})

describe('isScheduled: Q3 against Q2 (6.1)', () => {
  test('holds every state carrying a date and only those', () => {
    expect([dueOnly, startOnly, pair].map(isScheduled)).toEqual([true, true, true])
    expect(isScheduled(neither)).toBe(false)
  })

  test('is exactly "the placement date exists", which is what Q4 splits on', () => {
    for (const task of [dueOnly, startOnly, pair, neither]) {
      expect(isScheduled(task)).toBe(scheduleDateOf(task) !== null)
    }
  })
})

describe('movableEnd: which end a drag writes (Q3C)', () => {
  test("a due-only task's due date and a start-only task's start date", () => {
    expect(movableEnd(dueOnly)).toBe('due_date')
    expect(movableEnd(startOnly)).toBe('start_date')
  })

  test('and nothing at all for a pair, whose whole-range drag is unbuilt', () => {
    expect(movableEnd(pair)).toBeNull()
    expect(movableEnd(neither)).toBeNull()
  })

  test('so the end it names is always a date the task already carries', () => {
    for (const task of [dueOnly, startOnly]) {
      const end = movableEnd(task)
      expect(end === null ? null : task[end]).not.toBeNull()
    }
  })
})
