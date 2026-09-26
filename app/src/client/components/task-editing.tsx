/*
Editing an existing task, as one hook, wherever the card is drawn.

The detail read, 9.5's un-complete confirmation, and the write path through `tasks/task-writer.tsx`, used by the
dialog and the panel through `task-surface-host.tsx` and by `/app/tasks/:id`,
the task's own address and the "Tab" of 9.3's three homes, so the page is the
editor rather than a weaker third card.

The host still owns the create path, which is a draft with no id and belongs to
the surface that opens over a page; a task with an address already exists. Both
consumers hand the same `ConceptTask` to the same `TaskSurface` composition.
*/

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

/** A `ConceptTask` as `TaskSurface` takes one: the row's flat props, with the
    whole concept riding `detail` so nothing about it has to be flattened. */
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
    /* Both of #169's empties are "no chip": `TaskRowProps['assignee']` carries
       a person or nothing, null being a patch's word and never a row's. */
    ...(task.assignee === undefined || task.assignee === null
      ? {}
      : { assignee: task.assignee }),
    ...(task.pulled === undefined ? {} : { pulled: task.pulled }),
    detail: task,
  }
}

export interface TaskEditing {
  /** 7.6's detail, undefined until it has been read. */
  readonly detail: TaskDetail | undefined
  /** Whether the read failed or is still on its way, for the page's states. */
  readonly query: ReturnType<typeof useTask>
  /** The task as the card reads it, or null until read. */
  readonly concept: ConceptTask | null
  /** The one write path out of the card for this task. */
  readonly write: (taskId: string, fields: Partial<ConceptTask>) => void
  /** 9.5's confirmation when it is owed, mounted by the consumer. */
  readonly confirm: ReactNode
}

export function useTaskEditing(editing: string | null): TaskEditing {
  const folders = useFolders()
  const clock = useTimeFormat()
  const patch = useApiTaskPatch()
  const task = useTask(editing)

  /*
  **9.5's confirmation, on the surface that has no screen behind it.**

  9.3 gives the card's completion control 9.5's rule "unchanged": an un-complete
  that takes a G-SERIES successor confirms first, because 5.1 deletes that
  successor in the same transaction and the parenthesis is the part the person
  cannot see, "any edits already made to the next occurrence go with it". A row
  gets this from its page; a surface has no page behind it, so it is here, in
  the one component that owns the surface's write.

  Only on the branch that has one: a task with no rule generates no successor,
  so there is nothing to warn about and a confirmation with an empty consequence
  is a dead control.
  */
  const [uncompleting, setUncompleting] = useState<(() => void) | null>(null)

  const rows = folders.data
  const concept: ConceptTask | null =
    task.data === undefined || rows === undefined
      ? null
      : toConceptTask(task.data, { today: presenterToday(), folders: rows, clock })

  function write(_taskId: string, fields: Partial<ConceptTask>): void {
    if (editing === null) return
    /*
    **The condition is not "does it repeat".** Completing a rule-carrying task
    moves the rule to the successor, so the completed occurrence carries a
    `series_id` and no rule at all: a client asking whether the task repeats
    gets "no" from the one row where the confirm is owed.
    */
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
