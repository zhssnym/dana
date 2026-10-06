/*
 * Where a task stands: future, present or past, in one order. In progress is not stored: a pending task whose
 * start date is today or earlier has started.
 */
import type { TaskCard } from '../../../shared/tasks.js'

export type Stage = 'future' | 'present' | 'past'

export function stageOf(task: Pick<TaskCard, 'status' | 'start_date'>, today: string): Stage {
  if (task.status !== 'pending') return 'past'
  return task.start_date !== null && task.start_date <= today ? 'present' : 'future'
}
