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
  useDeleteStep,
  useDeleteTask,
  useUpdateStep,
  useUpdateTask,
} from '../../api/mutations.js'
import { useFolders, useMe, useTask } from '../../api/queries.js'
import { onOpenTaskForm } from '../../shell/overlays.js'
import type { TaskFormDefaults } from '../../shell/overlays.js'
import type { PatchTaskBody, PostTasksBody } from '../../../shared/tasks.js'
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

  function onSave(body: PostTasksBody | null, patch: PatchTaskBody | null): void {
    if (body !== null) {
      create.mutate(body, { onSuccess: close })
      return
    }
    if (patch === null || detail === null) return
    update.mutate({ id: detail.id, body: patch }, { onSuccess: close })
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
          saving={create.isPending || update.isPending}
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
