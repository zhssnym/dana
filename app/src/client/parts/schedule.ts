/*
 * The Task Schedule read in one place: the same three expressions the server names in `views/cards.ts`. Overdue
 * is not decided here: it reads `due_date` only.
 */
import type { TaskCard } from '../../shared/tasks.js'
import { addDays, daysBetween } from '../lib/dates.js'

export type Schedule = Pick<TaskCard, 'start_date' | 'due_date'>

/**
 * `coalesce(due_date, start_date)`: where a task is placed. The server sorts Scheduled by it, so buckets must
 * too. Null exactly when the task is in Anytime.
 */
export function scheduleDateOf(task: Schedule): string | null {
  return task.due_date ?? task.start_date
}

/** `coalesce(start_date, due_date)`: the day a Schedule begins, which Today's automatic clause compares. */
export function activationDateOf(task: Schedule): string | null {
  return task.start_date ?? task.due_date
}

/** Scheduled when it has a start or a due date; Anytime only when it has neither. */
export function isScheduled(task: Schedule): boolean {
  return scheduleDateOf(task) !== null
}

/** Which end a drag onto a day writes: `range` moves a Start+Due pair whole. No edge resizing. */
export function movableEnd(task: Schedule): 'start_date' | 'due_date' | 'range' | null {
  if (task.start_date !== null && task.due_date !== null) return 'range'
  if (task.due_date !== null) return 'due_date'
  if (task.start_date !== null) return 'start_date'
  return null
}

/** What a drop from `from` onto `to` writes: one end, or both shifted by the same days. Null when nothing moves. */
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
