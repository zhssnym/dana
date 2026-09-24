/*
The one place a task surface is opened.

9.3: "There is no task form. A task is its row, its card, and its page." This is
what the layout mounts: `components/task-surface.tsx`'s `TaskSurface`, over this
client's query layer, opened by two buses.

**The buses.** `shell/overlays.ts`'s `openTaskForm(defaults)` carries 9.3's
entry-point defaults, which are the chrome's because that table keys them by
where the person clicked, and `openTask(id)` carries a task, which a row, a
calendar cell and a search result all raise. Both are subscribable modules
rather than contexts, so a control anywhere in the chrome can raise one without
the two being in the same tree.

**Where a task opens is the person's.** The account's `task_open` value is the
record for dialog, panel, or tab, while `lib/task-surface-preference.ts` keeps a
browser mirror for the first read before the account bundle arrives.

**The create path holds a draft and the edit path does not, which is not two
artifacts.** 9.3's "no Save control and no draft state" is about what a person
does: there is no button, and a task exists the moment it is named. But a value
cannot be written to a row that does not exist yet, and 7.6 requires a title of
1 to 300 to make one. So a capture opens over a local `ConceptTask` seeded from
the entry defaults, every chip answered before the title rides the create body,
and the first non-empty title commit is the `POST`. From that moment the surface
is on the created id and every further edit goes through `tasks/task-writer.tsx`
like any other.

**Nothing renders until the surface can be drawn correctly.** 9.3's entry-point
table names the default folder, which is a read, and an edit pre-fills from
`TaskDetail`, which is another. A surface that rendered first and filled itself
afterwards would show an empty folder and an empty title for as long as the
request took, which is a first observable state that is wrong; the chrome
already holds the folder list on every page, so the wait is a cache hit in
practice.

**9.5's upcoming banner keeps its one path.** A ghost opens the series' current
occurrence, which shows a date the person did not click, so the banner belongs
on that path and on no other: a client showing the banner for every repeating
task tells the person something false every time they open a repeat from its own
day (AC-098).
*/

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { useCreateTask, useUpdateTask } from '../api/mutations.js'
import { useFolders, useMe } from '../api/queries.js'
import { conceptPatchToBody } from '../tasks/task-concept.js'
import type { ConceptTask } from '../tasks/task-model.js'
import { isoDay, parseDueLabel } from '../tasks/task-model.js'
import { dueDisplay, presenterToday } from '../parts/presenters.js'
import { TaskWriter } from '../tasks/task-writer.js'
import {
  surfacePreferenceFor,
  useTaskOpenPreference,
} from '../lib/task-surface-preference.js'
import { useRowActions } from '../parts/useRowActions.js'
import { paths } from '../routes.js'
import { onOpenTaskForm } from '../shell/overlays.js'
import type { TaskFormDefaults } from '../shell/overlays.js'
import { onOpenTask } from './task-open.js'
import { UPCOMING_OCCURRENCE } from './task-copy.js'
import { surfaceTask, useTaskEditing } from './task-editing.js'
import { ConfirmDialog } from './ui/ConfirmDialog.js'
import {
  ABANDON_CONFIRM,
  DELETE_CONFIRM_LABEL,
  DELETE_TASK_CONFIRM,
  keepLabel,
} from './ui/copy.js'
import { TaskSurface, type TaskSurfaceMode } from './task-surface.js'

interface OpenState {
  /** Bumped on every open, so the surface remounts with fresh state. */
  readonly seq: number
  readonly taskId: string | null
  readonly defaults: TaskFormDefaults
  readonly upcoming: boolean
}

/* The confirm a surface asks before it abandons or deletes the task it is
   showing, the row's two sentences over the row's two acts. */
interface PendingAct {
  readonly message: string
  readonly run: () => void
  readonly confirmLabel?: string
  readonly cancelLabel?: string
}

export function TaskSurfaceHost(): React.JSX.Element | null {
  const [open, setOpen] = useState<OpenState | null>(null)
  /* A counter rather than state, so subscribing happens once: a listener set
     that resubscribed on every open would drop the open that caused it. */
  const seq = useRef(0)
  /* The draft a capture holds until its title exists. Cleared on every open,
     which the `seq` key below makes a remount rather than a reset. */
  const [draft, setDraft] = useState<ConceptTask | null>(null)
  const draftRef = useRef<ConceptTask | null>(null)
  draftRef.current = draft
  const [created, setCreated] = useState<string | null>(null)
  const making = useRef(false)
  const [pending, setPending] = useState<PendingAct | null>(null)

  const taskOpenPreference = useTaskOpenPreference()
  const preference = surfacePreferenceFor(taskOpenPreference)
  const [mode, setMode] = useState<TaskSurfaceMode | null>(null)
  const navigate = useNavigate()

  const me = useMe()
  const folders = useFolders()
  const create = useCreateTask()
  const update = useUpdateTask()
  const acts = useRowActions()

  const editing = open?.taskId ?? created
  /* The edit path is `useTaskEditing`'s, shared with the task's own page, so
     the dialog, the panel and the tab edit one way. */
  const editingTask = useTaskEditing(editing)

  /*
  Read inside the listeners below without resubscribing them: the listeners
  are attached once, and what they need is whatever these hold at the moment
  an open is raised.
  */
  const foldersRef = useRef(folders.data)
  foldersRef.current = folders.data
  const viewerRef = useRef(me.data?.user)
  viewerRef.current = me.data?.user
  const createRef = useRef(create)
  createRef.current = create
  const updateRef = useRef(update)
  updateRef.current = update
  const taskOpenRef = useRef(taskOpenPreference)
  taskOpenRef.current = taskOpenPreference
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  useEffect(() => {
    const offForm = onOpenTaskForm((defaults) => {
      seq.current += 1
      setDraft(null)
      setCreated(null)
      setMode(null)
      setPending(null)
      making.current = false
      setOpen({ seq: seq.current, taskId: null, defaults, upcoming: false })
      /*
      "Open full form" from a quick-add carries the words already typed, and a
      title is all 7.6 needs to make the task, so it is made at once and the
      surface opens on it: what the person typed is never sitting in one box
      while an empty one asks for it again.
      */
      const title = defaults.title?.trim() ?? ''
      if (title === '') return
      const rows = foldersRef.current ?? []
      const fallback = rows.find((folder) => folder.is_default) ?? rows[0]
      const chosen =
        defaults.folder_id === undefined
          ? fallback
          : (rows.find((folder) => folder.id === defaults.folder_id) ?? fallback)
      const viewer = viewerRef.current
      making.current = true
      createRef.current.mutate(
        {
          title,
          ...(chosen === undefined ? {} : { folder_id: chosen.id }),
          ...(viewer === undefined ? {} : { assignee_id: viewer.id }),
          ...(defaults.important === undefined ? {} : { important: defaults.important }),
          ...(defaults.due_date == null ? {} : { due_date: defaults.due_date }),
          ...(defaults.section_block_id === undefined
            ? {}
            : { section_block_id: defaults.section_block_id }),
        },
        {
          onSuccess: (detail) => {
            /* Notes typed while this create was in flight are on the draft. */
            const latest = draftRef.current?.notes
            if (latest !== undefined && latest.trim() !== '') {
              updateRef.current.mutate({ id: detail.id, body: { notes: latest } })
            }
            setCreated(detail.id)
          },
          onError: () => {
            making.current = false
          },
        },
      )
    })
    const offTask = onOpenTask((taskId, options) => {
      /*
      9.3's third home: with "Where a task opens" set to Tab, a task opens at
      its own address, which is the card as a page, rather than in the dialog. A
      ghost's upcoming occurrence keeps the dialog, its banner living there.
      */
      if (taskOpenRef.current === 'tab' && options.upcoming !== true) {
        void navigateRef.current(paths.task(taskId))
        return
      }
      seq.current += 1
      setDraft(null)
      setCreated(null)
      setMode(null)
      setPending(null)
      making.current = false
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
  /*
  An *opened* task waits for its detail and a *made* one does not.

  The wait is the retired overlay's rule and it is right for the edit path: a
  surface that rendered first and filled itself afterwards shows an empty
  title for as long as the request takes, which is a first observable state
  that is wrong. It would be wrong for the create path, where the draft
  already holds everything the surface is showing: waiting there would blank
  the dialog for a round trip immediately after the person named the task,
  which is the same fault seen from the other side.
  */
  if (open.taskId !== null && editingTask.concept === null) return null

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
      title: open?.defaults.title?.trim() ?? '',
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
        : {
            /* The row's own wording ("Due 26 Sep"), never the ISO day. */
            due: dueDisplay(
              { status: 'pending', due_date: open.defaults.due_date, due_time: null },
              presenterToday(),
            ) ?? { label: open.defaults.due_date },
          }),
    }
  }

  /* The server's answer the moment there is one, and the draft until then. */
  const concept = editingTask.concept ?? draft ?? seed()
  const id = editing ?? 'new'

  /*
  The write path, forked once and only once.

  An existing task reports through `tasks/task-writer.tsx`, which is the one way
  an edit leaves a card and which fans a `Partial<ConceptTask>` out to the
  endpoints 7.6, 7.7, 7.8 and 7.9 put each field on. A capture reports into
  the draft, and the title is the field that ends the fork: the moment it
  commits non-empty, the draft becomes the create body and everything after it
  takes the first path.
  */
  function write(taskId: string, fields: Partial<ConceptTask>): void {
    if (editing !== null) {
      editingTask.write(taskId, fields)
      return
    }
    const next: ConceptTask = { ...(draft ?? seed()), ...fields }
    draftRef.current = next
    setDraft(next)
    /* 9.3: the title is required, 1 to 300, and 7.6 refuses a create without
       one. So an unnamed capture holds its answers and makes nothing, which is
       also what a person means by opening a capture and changing their mind. */
    if (next.title.trim() === '') return
    /* One create per capture, whatever a fast blur does. `create.isPending`
       is not enough on its own: two blurs inside one tick both read false. */
    if (making.current) return
    making.current = true
    const body = conceptPatchToBody(next)
    /* A day picked in the capture lives on the draft as its label; the
       entry point's default day stands until one is picked. */
    const pickedDue = next.due === undefined ? null : parseDueLabel(next.due.label)
    const dueDate =
      pickedDue !== null
        ? isoDay(pickedDue)
        : next.due === undefined && 'due' in next
          ? null
          : open?.defaults.due_date
    const notes = next.notes?.trim() ? next.notes : undefined
    create.mutate(
      {
        title: next.title.trim(),
        ...(body.folder_id === undefined ? {} : { folder_id: body.folder_id }),
        ...(body.assignee_id === undefined ? {} : { assignee_id: body.assignee_id }),
        ...(next.important === undefined ? {} : { important: next.important }),
        ...(dueDate == null ? {} : { due_date: dueDate }),
        ...(notes === undefined ? {} : { notes }),
        ...(open?.defaults.section_block_id === undefined
          ? {}
          : { section_block_id: open.defaults.section_block_id }),
      },
      {
        onSuccess: (detail) => {
          /* Notes typed while the create was in flight went to the draft
             after the body left; they follow as an edit, never dropped. */
          const latest = draftRef.current?.notes
          if (latest !== undefined && latest !== (notes ?? '') && latest.trim() !== '') {
            update.mutate({ id: detail.id, body: { notes: latest } })
          }
          setCreated(detail.id)
        },
        onError: () => {
          /* The capture keeps its draft and may be named again. A surface that
             swallowed the refusal would look like a task that had been made. */
          making.current = false
        },
      },
    )
  }

  function close(): void {
    setOpen(null)
    setDraft(null)
    setCreated(null)
    setPending(null)
  }

  /*
  The card's menu carries what the row's carries: the two acts that end a task
  are the page layer's, with the row's confirms and the row's undo entries, and
  the surface closes on either because the task it was showing has left the list
  beneath it.
  */
  const detail = editingTask.detail
  const surface = surfaceTask(id, concept)
  const withActs =
    detail === undefined
      ? surface
      : {
          ...surface,
          onAbandon: () => {
            setPending({
              message: ABANDON_CONFIRM,
              run: () => {
                acts.onAbandon(detail)
                close()
              },
            })
          },
          onDelete: () => {
            setPending({
              message: DELETE_TASK_CONFIRM,
              confirmLabel: DELETE_CONFIRM_LABEL,
              cancelLabel: keepLabel(1),
              run: () => {
                acts.onDelete(detail)
                close()
              },
            })
          },
        }

  return (
    <TaskWriter patch={write}>
      {editingTask.confirm}
      {pending === null ? null : (
        <ConfirmDialog
          message={pending.message}
          onContinue={() => {
            const run = pending.run
            setPending(null)
            run()
          }}
          onCancel={() => setPending(null)}
          {...(pending.confirmLabel === undefined ? {} : { confirmLabel: pending.confirmLabel })}
          {...(pending.cancelLabel === undefined ? {} : { cancelLabel: pending.cancelLabel })}
        />
      )}
      {open.upcoming ? (
        <p role="status" className="sr-only">
          {UPCOMING_OCCURRENCE}
        </p>
      ) : null}
      <TaskSurface
        key={open.seq}
        task={withActs}
        mode={mode ?? preference}
        onModeChange={(next) => {
          setMode(next)
        }}
        {...(editing === null
          ? {}
          : {
              onOpenInTab: () => {
                close()
                void navigate(paths.task(editing))
              },
            })}
        onClose={close}
      />
    </TaskWriter>
  )
}
