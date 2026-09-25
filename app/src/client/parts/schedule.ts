/*
The Task Schedule, as the client reads it: one module for the three questions
four seams were each answering for themselves.

Issue #216 gave a task a Schedule - a Start Date, a Due Date, or both - and
moved the server's view predicates onto it. Four client seams kept reading
`due_date` alone, and the reason none of them failed is in this repository's
own test factories: `ladder.test.ts`, `order.test.ts`, `filter.test.ts`,
`grouping.test.ts` and `presenters.test.ts` each hardcode `start_date: null`,
so not one client test in the tree exercised a non-null start date. A seam
that spells a predicate itself is a seam that can drift from the server's
without anything going red, which is what happened, so the three expressions
the server names in `views/cards.ts` are written once here and imported.

**These are the same three expressions and deliberately the same names.**
`scheduleDateOf` is SCHEDULE_DATE, `coalesce(due_date, start_date)`: where a
task is placed, which keeps a list deadline-oriented (Q3, 9.5).
`activationDateOf` is ACTIVATION_DATE, `coalesce(start_date, due_date)`: when
a Schedule begins, which is what Today's automatic clause compares against
(Q1, 8.1, 8.2). `isScheduled` is SCHEDULED. They are functions here rather
than SQL, and nothing else about them differs.

**What this module does not do is decide overdue.** 8.1 makes overdue,
due today and future relations to the **deadline** alone, so they read
`due_date` and never one of the expressions below. `parts/presenters.ts`'s
`dueDisplay` is the one that draws it and `views/ladder.ts` the one that
buckets by it; both are commented where they make that choice.
*/
import type { TaskCard } from '../../shared/tasks.js'
import { addDays, daysBetween } from '../lib/dates.js'

/** The two dates every function here reads, and nothing else of a card. */
export type Schedule = Pick<TaskCard, 'start_date' | 'due_date'>

/**
 * Q3's SCHEDULE_DATE, `coalesce(due_date, start_date)`: the Due Date where a
 * task has one and the Start Date where it has only that.
 *
 * This is the date the server sorted Scheduled by, so it is the date a client
 * bucket must read: rungs over a stream sorted by one date and bucketed by
 * another stop being buckets, and the walk reopens a rung it had closed.
 *
 * Null exactly when the task is in Anytime, which is what lets Q4's two
 * blocks split on this one expression.
 */
export function scheduleDateOf(task: Schedule): string | null {
  return task.due_date ?? task.start_date
}

/**
 * Q1's ACTIVATION_DATE, `coalesce(start_date, due_date)`: the day a Schedule
 * begins, which is the date Today's automatic clause admits at or before
 * today (8.1, issue #217).
 *
 * The opposite coalesce from the one above, and the two are the two ends of
 * the same span: `tasks_start_before_due_check` makes the start no later than
 * the due date wherever both exist.
 */
export function activationDateOf(task: Schedule): string | null {
  return task.start_date ?? task.due_date
}

/** Q3's SCHEDULED: "a Task belongs to Scheduled when it has either a Start
 * Date or a Due Date", and to Anytime "only when it has neither". */
export function isScheduled(task: Schedule): boolean {
  return scheduleDateOf(task) !== null
}

/**
 * Which end of the Schedule a drag onto a day writes: `range` for a Start+Due
 * pair, which moves whole, or null where the row has no date to move.
 *
 * Q3C, since issue #216: "Dragging moves a Due-only task's Due Date, a
 * Start-only task's Start Date, and a Start+Due range whole, preserving its
 * day span; there is no edge resizing." `shiftedSchedule` below is the whole
 * move.
 */
export function movableEnd(task: Schedule): 'start_date' | 'due_date' | 'range' | null {
  if (task.start_date !== null && task.due_date !== null) return 'range'
  if (task.due_date !== null) return 'due_date'
  if (task.start_date !== null) return 'start_date'
  return null
}

/**
 * What a drop writes when the row drawn on `from` lands on `to`: the one end a
 * single-date row carries, or both ends of a pair moved by the same number of
 * days. Null when there is nothing to move or nothing moves.
 */
export function shiftedSchedule(
  task: Schedule,
  from: string,
  to: string,
): { start_date?: string; due_date?: string } | null {
  const end = movableEnd(task)
  if (end === null || from === to) return null
  if (end === 'due_date') return { due_date: to }
  if (end === 'start_date') return { start_date: to }
  const by = daysBetween(from, to)
  return {
    start_date: addDays(task.start_date ?? to, by),
    due_date: addDays(task.due_date ?? to, by),
  }
}
