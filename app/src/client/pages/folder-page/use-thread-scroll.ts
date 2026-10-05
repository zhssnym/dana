// Keeps and restores the thread's scroll position across a trip to a task.
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router'

/* The shell's scroll region outlives the route, so the browser restores nothing.
   Read only on a Back (POP) onto the history entry the task was opened from. */
const threadScroll = new Map<
  string,
  { readonly top: number; readonly taskId: string; readonly entry: string }
>()
const TASK_PATH = '/app/tasks/'

export function useThreadScroll(folderId: string, ready: boolean): void {
  const navigationType = useNavigationType()
  const { key } = useLocation()
  const restoredFor = useRef<string | null>(null)
  /* At unmount the address is already the task's. A layout effect: a passive
     cleanup would read a scroll position clamped to the next page's height. */
  useLayoutEffect(() => {
    const scroller = document.querySelector<HTMLElement>('[data-shell-scroll]')
    return () => {
      /* A remount on this same page must not overwrite the kept place. */
      const next = window.location.pathname
      if (scroller === null || !next.startsWith(TASK_PATH)) return
      threadScroll.set(folderId, {
        top: scroller.scrollTop,
        taskId: decodeURIComponent(next.slice(TASK_PATH.length)),
        entry: key,
      })
    }
  }, [folderId, key])
  useEffect(() => {
    if (!ready || navigationType !== 'POP' || restoredFor.current === key) return
    const saved = threadScroll.get(folderId)
    const scroller = document.querySelector<HTMLElement>('[data-shell-scroll]')
    /* Keyed to the history entry, so Back into a newer visit replays nothing. */
    if (saved === undefined || saved.entry !== key || scroller === null) return
    /* The canvas lays out after its data arrives: retry until the task is drawn
       and the position fits, for about two seconds. */
    let frames = 0
    let handle = 0
    const settle = (): void => {
      frames += 1
      const task = document.querySelector(`[data-canvas-task-id="${CSS.escape(saved.taskId)}"]`)
      const fits = scroller.scrollHeight - scroller.clientHeight >= saved.top
      if ((!fits || task === null) && frames < 120) {
        handle = requestAnimationFrame(settle)
        return
      }
      /* Marked done only here, so an effect cancelled mid-wait tries again. */
      restoredFor.current = key
      /* Used once, so a later Back keeps wherever the reader scrolled since. */
      threadScroll.delete(folderId)
      scroller.scrollTop = saved.top
      task?.scrollIntoView({ block: 'nearest' })
    }
    handle = requestAnimationFrame(settle)
    return () => cancelAnimationFrame(handle)
  }, [folderId, ready, key, navigationType])
}
