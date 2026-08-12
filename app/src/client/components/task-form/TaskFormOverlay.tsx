/*
The surface 9.3's form is opened onto, and the only thing in this directory
that reads or writes.

`src/client/README.md` settles that a page calls exactly one hook per surface
and that nothing below a page fetches. This overlay is a surface in that
sense: it is opened over whatever page is beneath it and is mounted once by
the layout, so the reads are here and `TaskForm` below takes values and
callbacks as props. That is what lets the same form serve creation and
editing without either path knowing which endpoint the other uses.

**Nothing renders until the form can be filled correctly.** 9.3's entry-point
table names Inbox, which is 4.3's default folder rather than a folder called
one, and edit mode pre-fills from TaskDetail. Both are reads. A form that
rendered first and filled itself afterwards would show an empty folder and an
empty title for as long as the request took, which is a form whose first
observable state is wrong; the chrome already holds the folder list on every
page, so the wait is a cache hit in practice.

**Two ways in, and the second is this role's addition.** `openTaskForm` is the
chrome's, carrying 9.3's entry-point defaults, because that table keys them by
where the person clicked. `openTask` is `open.ts`, carrying a task id, because
9.5 opens a task from a row, a calendar cell and a search result. Its
`upcoming` flag is 9.5's ghost path and puts the banner on that path alone: a
client showing the banner for every repeating task passes AC-098 as written
and tells the person something false every time they open a repeat from its
own day.
*/
import { useEffect, useRef, useState } from 'react'

import {
  useAddStep,
  useCreateTask,
  useDeleteReminder,
  useDeleteStep,
  useDeleteTask,
  useUpdateStep,
  usePutReminder,
  useUpdateTask,
} from '../../api/mutations.js'
import { useFolders, useMe, useTask } from '../../api/queries.js'
import { onOpenTaskForm } from '../../shell/overlays.js'
import type { TaskFormDefaults } from '../../shell/overlays.js'
import type {
  PatchTaskBody,
  PostTasksBody,
  ReminderInput,
} from '../../../shared/tasks.js'
import { UPCOMING_OCCURRENCE } from './copy.js'
import { onOpenTask } from './open.js'
import { initialForCreate, initialForEdit, TaskForm } from './TaskForm.js'

interface OpenState {
  /** Bumped on every open, so the form remounts with fresh state. */
  readonly seq: number
  readonly taskId: string | null
  readonly defaults: TaskFormDefaults
  readonly upcoming: boolean
}

export function TaskFormOverlay(): React.JSX.Element | null {
  const [open, setOpen] = useState<OpenState | null>(null)
  // A counter rather than state, so subscribing happens once: a listener set
  // that resubscribed on every open would drop the open that caused it.
  const seq = useRef(0)

  const me = useMe()
  const folders = useFolders()
  const task = useTask(open?.taskId ?? null)

  const create = useCreateTask()
  const update = useUpdateTask()
  const putReminder = usePutReminder()
  const dropReminder = useDeleteReminder()
  const remove = useDeleteTask()
  const addStep = useAddStep()
  const patchStep = useUpdateStep()
  const removeStep = useDeleteStep()

  useEffect(() => {
    const offForm = onOpenTaskForm((defaults) => {
      seq.current += 1
      setOpen({ seq: seq.current, taskId: null, defaults, upcoming: false })
    })
    const offTask = onOpenTask((taskId, options) => {
      seq.current += 1
      setOpen({
        seq: seq.current,
        taskId,
        defaults: {},
        upcoming: options.upcoming === true,
      })
    })
    return () => {
      offForm()
      offTask()
    }
  }, [])

  useEffect(() => {
    if (open === null) return undefined
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      setOpen(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (open === null) return null

  const ready =
    folders.data !== undefined && (open.taskId === null || task.data !== undefined)
  if (!ready) {
    return (
      <div className="dialog-scrim">
        <div role="dialog" aria-modal="true" aria-label="Task" className="dialog-panel">
          <p role="status">Loading</p>
        </div>
      </div>
    )
  }

  const detail = open.taskId === null ? null : (task.data ?? null)
  const initial =
    detail === null
      ? initialForCreate(open.defaults, folders.data ?? [], me.data?.user.id ?? null)
      : initialForEdit(detail)

  function close(): void {
    setOpen(null)
  }

  /*
  One save, and on the edit path two requests, because the contract puts the
  reminder on two endpoints rather than one.

  The create path is one request: frozen 7.6 gives the create body a reminder
  arm, and `TaskForm` has already folded it in, so nothing extra happens here.

  The edit path is the PATCH and frozen 7.9's PUT or DELETE, and **whether
  they are ordered or concurrent is decided by whether the PATCH can touch the
  reminder at all.**

  It can, in three ways, all of them 7.6's: clearing the due date deletes the
  reminder row through 8.4's cascade, clearing the due time deletes an offset
  reminder, and moving the date recomputes the fire instant through 8.6. Every
  one of the three is keyed on due_date or due_time. So when either moves, the
  reminder write is sequenced after the PATCH: written before it, it would land
  on the task's old shape and then be deleted or recomputed by the edit that
  followed it.

  When neither moves, the PATCH cannot reach the reminder and the two writes
  touch disjoint state, so they go together. That is worth doing rather than
  ordering everything for uniformity: the tests and the local database run on
  PGlite, which holds one connection (11.15), and a needlessly ordered pair is
  two serialised round trips with the 8.3 invalidation refetch contending
  between them.

  The DELETE fires only when the task had a reminder and now carries none. 7.9
  makes it idempotent, so firing it unconditionally would be correct and would
  put a request on the wire for every save of every task that never had one.

  The overlay closes once both have settled, so nobody watches the form close
  over a reminder that has not been written.
  */
  function onSave(
    body: PostTasksBody | null,
    patch: PatchTaskBody | null,
    reminder: ReminderInput | null,
  ): void {
    if (body !== null) {
      create.mutate(body, { onSuccess: close })
      return
    }
    if (patch === null || detail === null) return
    const taskId = detail.id
    const had = detail.reminder !== null

    /** The reminder write this save owes, or null when it owes none. */
    const writeReminder = (): Promise<unknown> | null => {
      if (reminder !== null) return putReminder.mutateAsync({ taskId, body: reminder })
      if (had) return dropReminder.mutateAsync(taskId)
      return null
    }

    // Whether the PATCH reaches the reminder, which is the whole of what
    // decides the shape below. Compared on the wire formats of 7.0, both
    // YYYY-MM-DD and HH:MM, so a server that answers seconds does not read as
    // a change.
    const sameDate = (patch.due_date ?? null) === detail.due_date
    const sameTime =
      (patch.due_time ?? null) === (detail.due_time === null ? null : detail.due_time.slice(0, 5))
    const independent = sameDate && sameTime

    // mutateAsync rejects where mutate does not, and the rejection is already
    // reported: the mutation cache raises 9.1's toast for every failed write
    // in this client. Swallowed here so a refused request does not also become
    // an unhandled rejection, and so a failed PATCH does not leave the
    // reminder write hanging.
    const quiet = (work: Promise<unknown> | null): Promise<unknown> =>
      work === null ? Promise.resolve() : work.catch(() => undefined)

    const patched = quiet(update.mutateAsync({ id: taskId, body: patch }))
    const written = independent
      ? quiet(writeReminder())
      : patched.then(() => quiet(writeReminder()))
    void Promise.all([patched, written]).then(close)
  }

  return (
    <div className="dialog-scrim">
      <div role="dialog" aria-modal="true" aria-label="Task" className="dialog-panel">
        {/* 9.5: a ghost opens the current occurrence with this banner, and its
            copy is normative like all copy in section 9. */}
        {open.upcoming ? <p role="status">{UPCOMING_OCCURRENCE}</p> : null}

        <TaskForm
          key={`${String(open.seq)}-${open.taskId ?? 'new'}`}
          initial={initial}
          task={detail}
          saving={
            create.isPending ||
            update.isPending ||
            putReminder.isPending ||
            dropReminder.isPending
          }
          onSave={onSave}
          onDelete={() => {
            if (detail === null) return
            remove.mutate(detail.id, { onSuccess: close })
          }}
          onAppendStep={(title) => {
            if (detail === null) return
            addStep.mutate({ taskId: detail.id, title })
          }}
          onToggleStep={(step) => {
            if (step.id === null) return
            patchStep.mutate({ stepId: step.id, body: { done: !step.done } })
          }}
          onDeleteStep={(step) => {
            if (step.id === null) return
            removeStep.mutate(step.id)
          }}
          onMoveStep={(step, position) => {
            if (step.id === null) return
            patchStep.mutate({ stepId: step.id, body: { position } })
          }}
        />

        <button type="button" className="button-base button-quiet" onClick={close}>
          Close
        </button>
      </div>
    </div>
  )
}
