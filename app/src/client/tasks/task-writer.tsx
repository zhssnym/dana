/*
The one way an edit gets out of a card, wherever that card is.

`docs/design/prototype-v2/src/lib/task-writer.tsx`, read at `7d2064c`; that
prototype is deleted (`a7886df`, 2026-09-01) and is in git history before that
commit. The context and the hook cross verbatim; what is added below them is
this client's implementation of the one function they carry.

Imran, 2026-08-22: "A sidebar view of a task row does not carry the edits (in
steps, notes, links, and attachments) which are added in inline view of it...
dialog, sidebar, inline, and maybe more are just views of the same task row,
so the data inside them should be the same and updated simultaneously."

**Why a context, when this repository keeps refusing them.** The prototype's
answer is the right one here too and it is worth carrying whole: "`row-density`
and `time-format` are module stores precisely because a provider around
everything that reads them is a provider around the application. This is the
opposite shape: it is not a value read in fifty places, it is *one function*
owned by the one component that already wraps every screen. Threading it as a
prop would mean touching twenty-four list call sites in eleven files and hoping
the twenty-fifth remembers, which is the fault DES-154 exists to name."

**A row still wins if it is given a handler.** `onPatch` on the row overrides
this, because a lab or a preview may have its own idea of where an edit goes,
or none at all.

**The seam, and it is the whole of the difference.** In the prototype the
patch reaches a `useState` and the shell keeps the copy; here it reaches the
API and TanStack Query keeps the copy, which is the same architecture one
level down and is why the ledger's L-073 names this row for the adapter and
S23 for the surfaces. Two consequences follow and neither is optional.

The first is that **a `Partial<ConceptTask>` is not one endpoint**. The card
reports a title and a completion and a step through one call; section 7 puts
those on `PATCH /tasks/:id`, `POST /tasks/:id/complete` and the step routes.
So this function fans out, and `writtenElsewhere` in `tasks/task-concept.ts` is
the single list of which field takes which verb, so the mapper and this cannot
disagree about it.

The second is that **there is no optimistic copy here and there must not be**.
8.3 is this client's whole invalidation strategy: refetch on focus and after
each own mutation, no realtime channel, nothing else. A writer that also held
a local copy would be the second source of truth the prototype's fault was
made of, rebuilt on the other side of the port.

**What this writer does not send, and why each is somebody else's row.** A
due date, a reminder and a repeat rule arrive here as the *words a chip says*
rather than as values, because that is what `ConceptTask` holds; their pickers
carry the values and their own endpoints (7.6's PATCH, 7.9's PUT), and those
pickers are `components/task-pickers.tsx`, which lands at S23. The steps are
7.7's routes and need a diff against the task's current list rather than a
field copy; that diff is `tasks/task-acts.ts`'s `writeSteps` since the
loose-ends row (RFC 0005 change control item 58), the card having landed at
S23 without it. Comments are 9.6's and mount at S26. Each of the rest is
dropped here rather than half-sent, and `unwritten()` below names what was
dropped so a caller can assert on it.
*/

import { createContext, useCallback, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'

import {
  usePullIntoMyDay,
  useRemoveFromMyDay,
  useTransitionTask,
  useUpdateTask,
} from '../api/mutations.js'
import { useFolders } from '../api/queries.js'
import { writeSteps } from './task-acts.js'
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
      Completion first, and separately, because it is 7.7's verb rather than a
      field. The prototype keeps the same separation for a reason worth
      carrying: its log wrote two lines for one press, a completion and an
      edit in the same millisecond, and "a change already spoken for by a
      stronger verb is not also an edit".
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
      /* 7.7's routes, as the diff this file always said they needed
         (`tasks/task-acts.ts`'s `writeSteps`, item 58). */
      if (fields.steps !== undefined) writeSteps(taskId, fields.steps)

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

/**
 * The provider a shell mounts once, around everything that draws a card.
 *
 * Separate from `TaskWriter` above so that the lifted component contract and
 * this client's wiring of it stay two things: a lab, a test or a preview
 * mounts `TaskWriter` with a patch of its own and never reaches the API, which
 * is the prototype's own "a row still wins if it is given a handler" read one
 * level up.
 */
export function ApiTaskWriter({ children }: { children: ReactNode }): React.JSX.Element {
  const patch = useApiTaskPatch()
  return useMemo(() => <TaskWriter patch={patch}>{children}</TaskWriter>, [children, patch])
}
