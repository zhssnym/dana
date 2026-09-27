/*
The one way an edit gets out of a card, wherever that card is.

Dialog, sidebar, inline row and any other presentation are views of the same
task, so the edits made in one (steps, notes, links, attachments) must be the
edits every other one shows.

**Why a context, when this repository keeps refusing them.** `row-density` and
`time-format` are module stores precisely because a provider around everything
that reads them is a provider around the application. This is the opposite
shape: it is not a value read in fifty places, it is *one function* owned by the
one component that already wraps every screen. Threading it as a prop would mean
touching every list call site and hoping the next one remembers.

**A row still wins if it is given a handler.** `onPatch` on the row overrides
this, because a lab or a preview may have its own idea of where an edit goes, or
none at all.

**The patch reaches the API and TanStack Query keeps the copy.** Two
consequences follow and neither is optional.

The first is that **a `Partial<ConceptTask>` is not one endpoint**. The card
reports a title and a completion and a step through one call; section 7 puts
those on `PATCH /tasks/:id`, `POST /tasks/:id/complete` and the step routes. So
this function fans out, and `writtenElsewhere` in `tasks/task-concept.ts` is the
single list of which field takes which verb, so the mapper and this cannot
disagree about it.

The second is that **there is no optimistic copy here and there must not be**.
8.3 is this client's whole invalidation strategy: refetch on focus and after
each own mutation, no realtime channel, nothing else. A writer that also held a
local copy would be a second source of truth.

**What this writer does not send.** A due date, a reminder and a repeat rule
arrive here as the *words a chip says* rather than as values, because that is
what `ConceptTask` holds; their pickers carry the values and their own endpoints
(7.6's PATCH, 7.9's PUT), in `components/task-pickers.tsx`. The steps are the
checklist items of the task's body, written by its composer. Comments are 9.6's
conversation. Each of the rest is dropped here rather than half-sent, and
`unwritten()` below names what was dropped so a caller can assert on it.
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

/**
 * The fields of a report this client cannot send, given what it was handed.
 *
 * Pure and exported so the seam is assertable rather than believed. A field is
 * unwritten when it has a verb of its own that this writer does not perform,
 * and a folder or an assignee named without an id is unwritten too: a name is
 * not an address here, per `tasks/task-concept.ts`.
 */
export function unwritten(fields: Partial<ConceptTask>): (keyof ConceptTask)[] {
  const dropped = writtenElsewhere.filter(
    (key) =>
      key !== 'done' && key !== 'abandoned' && key !== 'pulled' && key !== 'steps' && key in fields,
  )
  if (fields.folder !== undefined && fields.folder.id === undefined) dropped.push('folder')
  return dropped
}

/**
 * The patch function this client puts in the context.
 *
 * Held as one `useCallback` so the provider's value is stable and every card
 * under it does not re-render when the shell does.
 *
 * **A folder named without an id is resolved against the folder table here,
 * and only here.** `conceptPatchToBody` refuses to do it so that a name-keyed
 * call site fails rather than quietly working, and this is the one place where
 * a name is all the caller could have had: a lifted card sets
 * `{name, color}` because that is the shape its picker knew. The lookup takes
 * the first match, folder names not being unique per person, and a caller with
 * the id in hand never reaches it.
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
      /*
      Completion first, and separately, because it is its own verb rather than a
      field: a change already spoken for by a stronger verb is not also an edit,
      and one press must not log a completion and an edit in the same
      millisecond.
      */
      if (fields.done !== undefined) {
        transition.mutate({ id: taskId, event: fields.done ? 'complete' : 'uncomplete' })
      }
      if (fields.abandoned !== undefined) {
        transition.mutate({ id: taskId, event: fields.abandoned ? 'abandon' : 'restore' })
      }
      /* 7.8's pull and its DELETE, which 9.4 draws as My Day's own marker. */
      if (fields.pulled === true) pull.mutate(taskId)
      if (fields.pulled === false) unpull.mutate(taskId)

      const body = conceptPatchToBody(
        fields.folder === undefined
          ? fields
          : { ...fields, folder: { ...fields.folder, id: resolveFolderId(fields.folder) } },
      )
      /* An empty body is a report that was entirely verbs, which is the common
         case for a checkbox. 7.6 would answer 422 on one, and sending it would
         also invalidate every query for a write that changed nothing. */
      if (Object.keys(body).length > 0) update.mutate({ id: taskId, body })
    },
    [pull, resolveFolderId, transition, unpull, update],
  )
}
