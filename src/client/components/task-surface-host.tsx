// Turns `openTask(id)` into navigation to /app/tasks/:id. Old `?task=<id>` links are
// redirected. A calendar ghost's open marks the history entry for the upcoming banner.

import { useEffect, useRef, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { paths } from '../routes.js'
import { onOpenTask } from './task-open.js'
import { usePrefetchTaskOnIntent } from './task-surface.js'
import { TaskContextMenuHost } from './task-context-menu.js'

/** The old peek parameter; read only to redirect. */
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
    void navigate(paths.task(encodeURIComponent(legacy)), { replace: true })
  }, [legacy, navigate])

  return <TaskContextMenuHost />
}
