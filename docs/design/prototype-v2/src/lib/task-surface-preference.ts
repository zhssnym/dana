/*
Where a task opens, remembered.

Scope A of Imran's flexible-workspace ruling, 2026-08-18 (DES-138). The
customisation people actually use is not "let me position a window" — it is
"open things the way I opened the last one". So the surface's mode is a
preference: choose the right sidebar once and every task opens there until
you say otherwise.

Same shape as `lib/row-density.ts` and `lib/time-format.ts`, and for the same
reason those chose it over a context: the mode is read by every screen's row,
by the shell's surface host and by the folder page's, and a provider around
all of that is a provider around the application. A module store reaches them
all and needs nobody to remember anything.

**A one-off choice is not a preference.** Picking a mode from the row's
"Open in…" strip opens the task that way *and* remembers it, because that is
what a person means by choosing. Switching modes from inside an open surface
also remembers — it is the same decision, made later. What is deliberately
not remembered is `tab`: a tab is an action rather than a place, and a person
who opens one tab has not asked for every task to become one.

Lane 1: the browser. Syncing it to the account is the same Lane 2
conversation DES-113 and DES-121 are already parked in — the three should go
to Hassan together rather than one at a time.
*/

import { useSyncExternalStore } from "react"

/* Kept in step with TaskSurfaceMode by the type-check at its call sites; the
   union is restated here so this module depends on no component. */
export type TaskSurfacePreference = "dialog" | "right"

const KEY = "dana.taskSurface"
const MODES: TaskSurfacePreference[] = ["dialog", "right"]

function read(): TaskSurfacePreference {
  try {
    const stored = localStorage.getItem(KEY)
    return MODES.includes(stored as TaskSurfacePreference)
      ? (stored as TaskSurfacePreference)
      : "dialog"
  } catch {
    /* Private modes and sandboxed frames throw rather than return null. A
       display preference is not worth failing a render over. */
    return "dialog"
  }
}

let current: TaskSurfacePreference = read()
const listeners = new Set<() => void>()

export function setTaskSurfacePreference(next: TaskSurfacePreference) {
  if (next === current) return
  current = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* Remembered for this session only, which is the honest fallback. */
  }
  listeners.forEach((notify) => notify())
}

/* The stored answer without subscribing — for the handlers that open a task
   and only need to know where it goes. */
export function taskSurfacePreference(): TaskSurfacePreference {
  return current
}

export function useTaskSurfacePreference(): TaskSurfacePreference {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => {
        listeners.delete(notify)
      }
    },
    () => current,
    () => "dialog",
  )
}
