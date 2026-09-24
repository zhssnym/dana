/*
Where a task stands in the story of its page: future, present or past. The
Linear view draws these as its three parts and the Board as its three columns
(Not started, In progress, Done), so both read this one rule.

In progress is not a stored state: a pending task whose start date is today or
earlier has started. Starting a step writes its start date; putting it back in
the queue clears it. See scratchpad r4/linear/DECISIONS.md.
*/
import type { TaskCard } from '../../../shared/tasks.js'

export type Stage = 'future' | 'present' | 'past'

export function stageOf(task: Pick<TaskCard, 'status' | 'start_date'>, today: string): Stage {
  if (task.status !== 'pending') return 'past'
  return task.start_date !== null && task.start_date <= today ? 'present' : 'future'
}

/** The start date that starts a task today. The server holds start <= due, so
 * an overdue task starts on its due day. */
export function startDay(task: Pick<TaskCard, 'due_date'>, today: string): string {
  return task.due_date !== null && task.due_date < today ? task.due_date : today
}
