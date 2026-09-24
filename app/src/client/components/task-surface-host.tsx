/*
The one place a task is opened (ROUND2-SPEC "Task").

**Where** is the person's choice, Settings > Appearance > "Open tasks in":
Center peek (the default), Side peek or Full page. A phone always opens the
full page. Sub-pages are places, not items, and navigate (Notion's rule):
only tasks open here.

**The address is the state.** An open peek is `?task=<id>` on whatever page is
showing, so it survives a reload, Back closes it, and the list under it is the
list the person was on. `/app/tasks/:id` is the full page and the shareable
address (`pages/TaskPage.tsx`).

**Opening** is `openTask(id)` (`components/task-open.ts`), raised by a list
row, a canvas task block, a board card, the calendar, search and a dependency
link. For a peek it writes the parameter, replacing rather than pushing when a
peek is already open so that walking down a list does not fill the history;
for the full page, or on a phone, it navigates to the page.

**There is no create form.** A task is made inline (the "New task" row, which
`N` and a calendar day both lead to); an unsaved task
has no panel.

**9.5's upcoming banner keeps its one path**: a calendar ghost opens the
series' current occurrence, and says so to a screen reader (AC-098).
*/

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, type Location } from 'react-router'

import { useRowActions } from '../parts/useRowActions.js'
import { paths } from '../routes.js'
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
import { TaskWriter } from '../tasks/task-writer.js'
import { TaskCenterPeek, TaskPanel } from './task-surface.js'
import { useTaskOpenPreference } from '../lib/task-surface-preference.js'

/** The search parameter an open task rides. */
export const TASK_PARAM = 'task'

/** What a panel open leaves on the history entry. */
interface PanelState {
  readonly taskPanel?: boolean
  readonly upcomingTask?: boolean
}

/** Below this width a task is a page, not a panel (`ui/use-mobile.ts`). */
const PHONE_WIDTH = 768

export function isPhoneWidth(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < PHONE_WIDTH
}

/** The same location with the task parameter set, or removed with null. */
export function withTask(location: Pick<Location, 'pathname' | 'search'>, id: string | null) {
  const params = new URLSearchParams(location.search)
  if (id === null) params.delete(TASK_PARAM)
  else params.set(TASK_PARAM, id)
  const search = params.toString()
  return { pathname: location.pathname, search: search === '' ? '' : `?${search}` }
}

interface PendingAct {
  readonly message: string
  readonly run: () => void
  readonly confirmLabel?: string
  readonly cancelLabel?: string
}

export function TaskSurfaceHost(): ReactNode {
  const location = useLocation()
  const navigate = useNavigate()
  const taskId = new URLSearchParams(location.search).get(TASK_PARAM)
  const state = (location.state ?? null) as PanelState | null

  const editing = useTaskEditing(taskId === '' ? null : taskId)
  const acts = useRowActions()
  const [pending, setPending] = useState<PendingAct | null>(null)
  const mode = useTaskOpenPreference()
  /* What was last drawn, held while a stepped-to task loads. */
  const shown = useRef<ReactNode>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode

  /* Read inside the listeners, which are attached once. */
  const locationRef = useRef(location)
  locationRef.current = location
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  useEffect(() => {
    function open(id: string, upcoming: boolean): void {
      if (isPhoneWidth() || modeRef.current === 'tab') {
        void navigateRef.current(paths.task(id), { state: { upcomingTask: upcoming } })
        return
      }
      const here = locationRef.current
      const already = new URLSearchParams(here.search).has(TASK_PARAM)
      void navigateRef.current(withTask(here, id), {
        replace: already,
        state: {
          /* Replacing keeps the flag of the entry it replaces: Back from a
             swapped panel still lands on the list without one. */
          taskPanel: already ? (here.state as PanelState | null)?.taskPanel === true : true,
          upcomingTask: upcoming,
        } satisfies PanelState,
      })
    }

    const offTask = onOpenTask((id, options) => open(id, options.upcoming === true))

    return () => {
      offTask()
    }
  }, [])

  /* A parameter naming a task this viewer cannot read closes quietly. */
  const failed = taskId !== null && editing.query.isError
  useEffect(() => {
    if (!failed) return
    void navigate(withTask(location, null), { replace: true })
  }, [failed, location, navigate])

  /* A phone has no room for a panel: the task is its page. */
  const phoneOpen = taskId !== null && taskId !== '' && isPhoneWidth()
  useEffect(() => {
    if (phoneOpen) void navigate(paths.task(taskId), { replace: true })
  }, [phoneOpen, taskId, navigate])

  if (taskId === null || taskId === '' || phoneOpen) {
    shown.current = null
    return null
  }
  /* Nothing renders until the task can be drawn correctly: a panel that
     filled itself in afterwards would show an empty title first. Stepping to
     the next task keeps the one on screen until the next can be drawn, so
     the peek neither blinks nor plays its entrance again. */
  const detail = editing.detail
  if (editing.concept === null || detail === undefined) return shown.current

  function openFull(): void {
    if (taskId === null) return
    setPending(null)
    /* The peek's own history entry becomes the page, so Back from the page
       lands on the list rather than on the peek it grew out of. */
    void navigate(paths.task(taskId), { replace: state?.taskPanel === true })
  }

  function close(): void {
    setPending(null)
    if (state?.taskPanel === true) {
      void navigate(-1)
      return
    }
    void navigate(withTask(location, null), { replace: true })
  }

  const task = {
    ...surfaceTask(taskId, editing.concept),
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

  shown.current = (
    <TaskWriter patch={editing.write}>
      {editing.confirm}
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
      {state?.upcomingTask === true ? (
        <p role="status" className="sr-only">
          {UPCOMING_OCCURRENCE}
        </p>
      ) : null}
      {mode === 'dialog' ? (
        <TaskCenterPeek task={task} onClose={close} onOpenFull={openFull} />
      ) : (
        <TaskPanel task={task} onClose={close} onOpenFull={openFull} />
      )}
    </TaskWriter>
  )
  return shown.current
}
