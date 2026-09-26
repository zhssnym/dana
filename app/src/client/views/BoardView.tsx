/*
What is left of the page's Board view (M4 cut the Board: three states do not
need columns). Only its status rule survives, because `components/task-card.tsx`
still reads a task's status through it: a task's stage (`linear/stage.ts`:
future, present, past), by name. Delete this file once nothing imports it.
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

/** Which status a task has: its stage (`linear/stage.ts`), by name. */
export function boardStatusOf(task: TaskCard, today: string): BoardStatus {
  return COLUMN_OF[stageOf(task, today)]
}
