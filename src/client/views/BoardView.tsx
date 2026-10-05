/*
 * What remains of the Board view: its status rule, still read by `components/task-card.tsx`. Delete once
 * unused.
 */
import type { TaskCard } from '../../shared/tasks.js'
import { stageOf } from './linear/stage.js'
import type { Stage } from './linear/stage.js'

export type BoardStatus = 'not_started' | 'in_progress' | 'done'

const COLUMN_OF: Record<Stage, BoardStatus> = {
  future: 'not_started',
  present: 'in_progress',
  past: 'done',
}

export function boardStatusOf(task: TaskCard, today: string): BoardStatus {
  return COLUMN_OF[stageOf(task, today)]
}
