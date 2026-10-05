// Editing an existing task as one hook: the detail read, the un-complete
// confirmation and the write path, shared by every surface that draws the card.

import { useState } from 'react'
import type { ReactNode } from 'react'

import { useFolders, useTask } from '../api/queries.js'
import { useTimeFormat } from '../lib/time-format.js'
import { presenterToday } from '../parts/presenters.js'
import { toConceptTask } from '../tasks/task-concept.js'
import type { ConceptTask } from '../tasks/task-model.js'
import { useApiTaskPatch } from '../tasks/task-writer.js'
import { UNCOMPLETE_SERIES_CONFIRM } from './task-copy.js'
import { ConfirmDialog } from './ui/ConfirmDialog.js'
import type { TaskRowProps } from './task-row.js'
import type { TaskDetail } from '../../shared/tasks.js'

/** The row's flat props, with the whole concept in `detail`. */
export function surfaceTask(
  id: string,
  task: ConceptTask,
): TaskRowProps & { id: string } {
  return {
    id,
    title: task.title,
    ...(task.folder === undefined ? {} : { folder: task.folder }),
    ...(task.due === undefined ? {} : { due: task.due }),
    status: task.abandoned ? 'abandoned' : task.done ? 'completed' : 'pending',
    ...(task.important === undefined ? {} : { important: task.important }),
    // `null` is a patch's word, never a row's; both empties mean no chip.
    ...(task.assignee === undefined || task.assignee === null
      ? {}
      : { assignee: task.assignee }),
    ...(task.assignees === undefined ? {} : { assignees: task.assignees }),
    ...(task.pulled === undefined ? {} : { pulled: task.pulled }),
    detail: task,
  }
}

export interface TaskEditing {
  readonly detail: TaskDetail | undefined
  /** Whether the read failed or is pending, for the page's states. */
  readonly query: ReturnType<typeof useTask>
  /** The task as the card reads it, or null until read. */
  readonly concept: ConceptTask | null
  /** The one write path out of the card for this task. */
  readonly write: (taskId: string, fields: Partial<ConceptTask>) => void
  /** The un-complete confirmation when owed, mounted by the consumer. */
  readonly confirm: ReactNode
}

export function useTaskEditing(editing: string | null): TaskEditing {
  const folders = useFolders()
  const clock = useTimeFormat()
  const patch = useApiTaskPatch()
  const task = useTask(editing)

  // Un-completing a task whose successor would be deleted asks first (spec 9.5). A row
  // gets this from its page; a surface has none, so it lives here.
  const [uncompleting, setUncompleting] = useState<(() => void) | null>(null)

  const rows = folders.data
  const concept: ConceptTask | null =
    task.data === undefined || rows === undefined
      ? null
      : toConceptTask(task.data, { today: presenterToday(), folders: rows, clock })

  function write(_taskId: string, fields: Partial<ConceptTask>): void {
    if (editing === null) return
    // Not "does it repeat": completing moves the rule to the successor, so the completed
    // occurrence has a `series_id` and no rule.
    const takesSuccessor =
      fields.done === false &&
      task.data?.series_id != null &&
      task.data.recurrence_rule === null
    if (takesSuccessor) {
      const id = editing
      setUncompleting(() => () => {
        patch(id, fields)
      })
      return
    }
    patch(editing, fields)
  }

  const confirm =
    uncompleting === null ? null : (
      <ConfirmDialog
        message={UNCOMPLETE_SERIES_CONFIRM}
        onContinue={() => {
          const run = uncompleting
          setUncompleting(null)
          run()
        }}
        onCancel={() => setUncompleting(null)}
      />
    )

  return { detail: task.data, query: task, concept, write, confirm }
}
