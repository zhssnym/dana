/*
The one place a task surface is opened, and what replaces the task form.

9.3's v2 opens "There is no task form. A task is its row, its card, and its
page." So `components/task-form/**` retires whole at S23 and this is what the
layout mounts in its place: `components/task-surface.tsx`'s `TaskSurface`,
over this client's query layer, opened by the same two buses the form was
opened by.

**The buses do not move, and that is deliberate.** `shell/overlays.ts`'s
`openTaskForm(defaults)` carries 9.3's entry-point defaults, which are the
chrome's because that table keys them by where the person clicked, and
`openTask(id)` carries a task, which a row, a calendar cell and a search
result all raise. Both are subscribable modules rather than contexts, "so a
control anywhere in the chrome can raise one without the two being in the same
tree". Nothing about that changed when the surface behind them did, so the
callers are untouched by this row: the calendar, the search overlay and every
page still call what they called.

**Where a task opens is the person's**, 9.3: "Where a task opens (dialog,
panel, or tab) is a client-side preference; a row offers the choice and
remembers it." `lib/task-surface-preference.ts` is the record and the seam
onto 4.19's `task_open` column.

**The create path holds a draft and the edit path does not, which is not two
artifacts.** 9.3's "no Save control and no draft state" is about what a person
does: there is no button, and a task exists the moment it is named. But a
value cannot be written to a row that does not exist yet, and frozen 7.6
requires a title of 1 to 300 to make one. So a capture opens over a local
`ConceptTask` seeded from the entry defaults, every chip answered before the
title rides the create body, and the first non-empty title commit is the
`POST`. From that moment the surface is on the created id and every further
edit goes through `lib/task-writer.tsx` like any other. This is the
arrangement the retired chip strip already used and stated: "on a creation
there is no row to write to, so the value goes into the form's own state and
rides the create body. Both paths set the same form state, so the strip and
the fields below it never disagree about what the surface holds."

**Nothing renders until the surface can be drawn correctly**, which is the
retired overlay's rule and its reason survives whole: 9.3's entry-point table
names the default folder, which is a read, and an edit pre-fills from
`TaskDetail`, which is another. "A form that rendered first and filled itself
afterwards would show an empty folder and an empty title for as long as the
request took, which is a form whose first observable state is wrong; the
chrome already holds the folder list on every page, so the wait is a cache hit
in practice."

**9.5's upcoming banner keeps its one path.** A ghost opens the series' current
occurrence, which shows a date the person did not click, so the banner belongs
on that path and on no other: "a client showing the banner for every repeating
task passes AC-098 as written and tells the person something false every time
they open a repeat from its own day."
*/

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { useCreateTask } from '../api/mutations.js'
import { useFolders, useMe, useTask } from '../api/queries.js'
import { useTimeFormat } from '../lib/time-format.js'
import { presenterToday } from '../parts/presenters.js'
import { conceptPatchToBody, toConceptTask } from '../lib/task-concept.js'
import type { ConceptTask } from '../lib/task-model.js'
import { TaskWriter, useApiTaskPatch } from '../lib/task-writer.js'
import {
  useTaskSurfacePreference,
  setTaskSurfacePreference,
} from '../lib/task-surface-preference.js'
import { onOpenTaskForm } from '../shell/overlays.js'
import type { TaskFormDefaults } from '../shell/overlays.js'
import { onOpenTask } from './task-open.js'
import { UPCOMING_OCCURRENCE } from './task-copy.js'
import { TaskSurface, type TaskSurfaceMode } from './task-surface.js'
import type { TaskRowProps } from './task-row.js'

interface OpenState {
  /** Bumped on every open, so the surface remounts with fresh state. */
  readonly seq: number
  readonly taskId: string | null
  readonly defaults: TaskFormDefaults
  readonly upcoming: boolean
}

/** A `ConceptTask` as `TaskSurface` takes one: the row's flat props, with the
    whole concept riding `detail` so nothing about it has to be flattened. */
function surfaceTask(
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
    ...(task.assignee === undefined ? {} : { assignee: task.assignee }),
    ...(task.pulled === undefined ? {} : { pulled: task.pulled }),
    detail: task,
  }
}

export function TaskSurfaceHost(): React.JSX.Element | null {
  const [open, setOpen] = useState<OpenState | null>(null)
  /* A counter rather than state, so subscribing happens once: a listener set
     that resubscribed on every open would drop the open that caused it. */
  const seq = useRef(0)
  /* The draft a capture holds until its title exists. Cleared on every open,
     which the `seq` key below makes a remount rather than a reset. */
  const [draft, setDraft] = useState<ConceptTask | null>(null)
  const [created, setCreated] = useState<string | null>(null)

  const preference = useTaskSurfacePreference()
  const [mode, setMode] = useState<TaskSurfaceMode | null>(null)
  const navigate = useNavigate()

  const me = useMe()
  const folders = useFolders()
  const clock = useTimeFormat()
  const create = useCreateTask()
  const patch = useApiTaskPatch()

  const editing = open?.taskId ?? created
  const task = useTask(editing)

  useEffect(() => {
    const offForm = onOpenTaskForm((defaults) => {
      seq.current += 1
      setDraft(null)
      setCreated(null)
      setMode(null)
      setOpen({ seq: seq.current, taskId: null, defaults, upcoming: false })
    })
    const offTask = onOpenTask((taskId, options) => {
      seq.current += 1
      setDraft(null)
      setCreated(null)
      setMode(null)
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

  if (open === null) return null

  const rows = folders.data
  if (rows === undefined) return null
  if (editing !== null && task.data === undefined) return null

  const context = { today: presenterToday(), folders: rows, clock }

  /*
  9.3's entry defaults, "derived from the page's own spine so a made task
  appears where it was made". The folder column reads Desk for five of its six
  rows, and Desk is 4.3's default folder rather than a folder that happens to
  be called one; the assignee defaults to the viewer.
  */
  function seed(): ConceptTask {
    const fallback = rows?.find((folder) => folder.is_default) ?? rows?.[0]
    const chosen =
      open?.defaults.folder_id === undefined
        ? fallback
        : (rows?.find((folder) => folder.id === open.defaults.folder_id) ?? fallback)
    const viewer = me.data?.user
    return {
      id: 'new',
      title: '',
      important: open?.defaults.important ?? false,
      ...(chosen === undefined
        ? {}
        : { folder: { id: chosen.id, name: chosen.name, color: chosen.color ?? '' } }),
      ...(viewer === undefined
        ? {}
        : {
            assignee: {
              id: viewer.id,
              name: viewer.display_name ?? '',
              initials: '',
            },
          }),
      ...(open?.defaults.due_date == null
        ? {}
        : { due: { label: `Due ${open.defaults.due_date}` } }),
    }
  }

  const held = editing === null ? (draft ?? seed()) : null
  const concept =
    task.data === undefined
      ? (held ?? seed())
      : toConceptTask(task.data, context)
  const id = editing ?? 'new'

  /*
  The write path, forked once and only once.

  An existing task reports through `lib/task-writer.tsx`, which is the one way
  an edit leaves a card and which fans a `Partial<ConceptTask>` out to the
  endpoints 7.6, 7.7, 7.8 and 7.9 put each field on. A capture reports into
  the draft, and the title is the field that ends the fork: the moment it
  commits non-empty, the draft becomes the create body and everything after it
  takes the first path.
  */
  function write(_taskId: string, fields: Partial<ConceptTask>): void {
    if (editing !== null) {
      patch(editing, fields)
      return
    }
    const next: ConceptTask = { ...(draft ?? seed()), ...fields }
    if (next.title.trim() === '') {
      setDraft(next)
      return
    }
    const body = conceptPatchToBody(next)
    create.mutate(
      {
        title: next.title.trim(),
        ...(body.folder_id === undefined ? {} : { folder_id: body.folder_id }),
        ...(body.assignee_id === undefined ? {} : { assignee_id: body.assignee_id }),
        ...(next.important === undefined ? {} : { important: next.important }),
        ...(open?.defaults.due_date == null
          ? {}
          : { due_date: open.defaults.due_date }),
      },
      { onSuccess: (detail) => setCreated(detail.id) },
    )
    setDraft(next)
  }

  function close(): void {
    setOpen(null)
    setDraft(null)
    setCreated(null)
  }

  return (
    <TaskWriter patch={write}>
      {open.upcoming ? (
        <p role="status" className="sr-only">
          {UPCOMING_OCCURRENCE}
        </p>
      ) : null}
      <TaskSurface
        key={open.seq}
        task={surfaceTask(id, concept)}
        mode={mode ?? preference}
        onModeChange={(next) => {
          setMode(next)
          setTaskSurfacePreference(next)
        }}
        {...(editing === null
          ? {}
          : {
              onOpenInTab: () => {
                close()
                void navigate(`/app/tasks/${editing}`)
              },
            })}
        onClose={close}
      />
    </TaskWriter>
  )
}
