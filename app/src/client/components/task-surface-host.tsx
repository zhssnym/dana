/*
Where a task opens (M4): always its one page, /app/tasks/:id. There is no
peek and no "Open tasks in" choice.

**Opening** is `openTask(id)` (`components/task-open.ts`), raised by a list
row, a canvas task block, the calendar, search and a dependency link; this
host, mounted once by the shell, turns it into a navigation.

**Old addresses still land.** A `?task=<id>` from before M4 (a bookmark, a
shared link to a peek) is replaced by the task's page.

**9.5's upcoming banner keeps its one path**: a calendar ghost opens the
series' current occurrence, and the page says so to a screen reader (AC-098),
from the history entry's state.
*/

import { useEffect, useRef, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { paths } from '../routes.js'
import { onOpenTask } from './task-open.js'
import { usePrefetchTaskOnIntent } from './task-surface.js'

/** The search parameter a pre-M4 peek rode; read only to redirect. */
const TASK_PARAM = 'task'

/** What an open leaves on the history entry. */
export interface TaskOpenState {
  readonly upcomingTask?: boolean
}

export function TaskSurfaceHost(): ReactNode {
  const location = useLocation()
  const navigate = useNavigate()
  usePrefetchTaskOnIntent()

  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  useEffect(
    () =>
      onOpenTask((id, options) => {
        void navigateRef.current(paths.task(id), {
          state: { upcomingTask: options.upcoming === true } satisfies TaskOpenState,
        })
      }),
    [],
  )

  const legacy = new URLSearchParams(location.search).get(TASK_PARAM)
  useEffect(() => {
    if (legacy === null || legacy === '') return
    void navigate(paths.task(legacy), { replace: true })
  }, [legacy, navigate])

  return null
}
