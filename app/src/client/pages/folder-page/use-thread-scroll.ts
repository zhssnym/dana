// Keeps and restores the thread's scroll position across a trip to a task.
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router'

/*
Where the thread was when a task was opened from it, so Back lands there.

The shell's one scroll region (`[data-shell-scroll]`) outlives the route, so the
browser restores nothing; this page does. Held in memory for the session, per
page, and only read on a Back (a POP) onto the very history entry the task was
opened from, never on a fresh visit or on a Back into a later visit of the page.
*/
const threadScroll = new Map<
  string,
  { readonly top: number; readonly taskId: string; readonly entry: string }
>()
const TASK_PATH = '/app/tasks/'

export function useThreadScroll(folderId: string, ready: boolean): void {
  const navigationType = useNavigationType()
  const { key } = useLocation()
  const restoredFor = useRef<string | null>(null)
  /* Kept on the way out: at unmount the address is already the next one, so a
     task page's path names the task that was opened. A layout effect, because
     its cleanup runs before the thread leaves the DOM; a passive one would read
     a scroll position already clamped to the next page's height. */
  useLayoutEffect(() => {
    const scroller = document.querySelector<HTMLElement>('[data-shell-scroll]')
    return () => {
      /* Only a task opened from the thread is a trip Back returns from; a
         remount on this same page must not overwrite the kept place. */
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
    /* Keyed to the history entry: coming back by the sidebar and later
       pressing Back into that newer visit must not replay an old position. */
    if (saved === undefined || saved.entry !== key || scroller === null) return
    /* The canvas measures and lays out after its data arrives, so the height
       the position needs may come late: try until the opened task is drawn and
       the position fits, or about two seconds have gone. */
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
      /* Marked done only here: an effect cancelled mid-wait (a re-run, or
         React's development double mount) tries again. */
      restoredFor.current = key
      /* Used once: a later Back into this page, after leaving it some other
         way, keeps wherever the reader had scrolled to since. */
      threadScroll.delete(folderId)
      scroller.scrollTop = saved.top
      task?.scrollIntoView({ block: 'nearest' })
    }
    handle = requestAnimationFrame(settle)
    return () => cancelAnimationFrame(handle)
  }, [folderId, ready, key, navigationType])
}
