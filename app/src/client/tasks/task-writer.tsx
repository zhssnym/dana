/*
 * The one way a card's edits reach the API, provided as context by the shell. A row's own `onPatch` wins. A
 * report fans out by verb (`writtenElsewhere`). No optimistic copy: the query cache refetches after each write.
 * Fields with no sendable form are dropped, and `unwritten()` names them.
 */

import { createContext, useCallback, useContext } from 'react'
import type { ReactNode } from 'react'

import {
  usePullIntoMyDay,
  useRemoveFromMyDay,
  useTransitionTask,
  useUpdateTask,
} from '../api/mutations.js'
import { useFolders } from '../api/queries.js'
import { conceptPatchToBody, writtenElsewhere } from './task-concept.js'
import type { ConceptTask } from './task-model.js'

export type TaskPatch = (taskId: string, fields: Partial<ConceptTask>) => void

const TaskWriterContext = createContext<TaskPatch | null>(null)

export function TaskWriter({
  patch,
  children,
}: {
  patch: TaskPatch
  children: ReactNode
}): React.JSX.Element {
  return <TaskWriterContext value={patch}>{children}</TaskWriterContext>
}

export function useTaskWriter(): TaskPatch | null {
  return useContext(TaskWriterContext)
}

/** Pure and exported so the seam can be tested. A folder or assignee without an id is unwritten. */
export function unwritten(fields: Partial<ConceptTask>): (keyof ConceptTask)[] {
  const dropped = writtenElsewhere.filter(
    (key) =>
      key !== 'done' && key !== 'abandoned' && key !== 'pulled' && key !== 'steps' && key in fields,
  )
  if (fields.folder !== undefined && fields.folder.id === undefined) dropped.push('folder')
  return dropped
}

/**
 * One `useCallback`, so the provider value is stable. A folder named without an id is resolved here only,
 * taking the first match (names are not unique).
 */
export function useApiTaskPatch(): TaskPatch {
  const update = useUpdateTask()
  const transition = useTransitionTask()
  const pull = usePullIntoMyDay()
  const unpull = useRemoveFromMyDay()
  const folders = useFolders()
  const rows = folders.data

  const resolveFolderId = useCallback(
    (folder: NonNullable<ConceptTask['folder']>): string | undefined =>
      folder.id ?? rows?.find((row) => row.name === folder.name)?.id,
    [rows],
  )

  return useCallback(
    (taskId, fields) => {
      /* Completion first, as its own verb, so one press is not also an edit. */
      if (fields.done !== undefined) {
        transition.mutate({ id: taskId, event: fields.done ? 'complete' : 'uncomplete' })
      }
      if (fields.abandoned !== undefined) {
        transition.mutate({ id: taskId, event: fields.abandoned ? 'abandon' : 'restore' })
      }
      /* My Day's pull and its removal. */
      if (fields.pulled === true) pull.mutate(taskId)
      if (fields.pulled === false) unpull.mutate(taskId)

      const body = conceptPatchToBody(
        fields.folder === undefined
          ? fields
          : { ...fields, folder: { ...fields.folder, id: resolveFolderId(fields.folder) } },
      )
      /* An all-verb report leaves an empty body; the server would answer 422, and nothing changed. */
      if (Object.keys(body).length > 0) update.mutate({ id: taskId, body })
    },
    [pull, resolveFolderId, transition, unpull, update],
  )
}
