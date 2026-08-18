/*
Whether a task row is one line or two. DES-113.

This is the module the first port shipped as `lib/density.tsx` and the revert
(`89ca018`) deleted along with the rest of that attempt. It comes back in the
shape `lib/time-format.ts` settled on rather than the shape it had: a module
store read through `useSyncExternalStore`, not a React context.

The reason is the same one, and it is worth stating once for both. A context
has to wrap everything that reads it, and a row density is read by the row, by
every screen that draws a list of rows, by the states page and by a settings
control. A provider around all of that is a provider around the application,
which is a lot of machinery for one enum. A module store reaches all of them
and needs nobody to remember anything.

**Two lines is the default**, and DES-113 records why at length: the failure
modes are not symmetric. Seeing fewer tasks at once is visible and
self-correcting — you scroll, you notice, you come and change this. A truncated
title is invisible, because you do not know what you did not read. The default
is the mode whose downside announces itself.

**The rule that keeps two rows affordable**, from DES-113 and repeated here
because this file is where somebody will be standing when they break it: *the
two densities may differ in height and in where the details sit, and in nothing
else.* The moment one grows a behaviour the other lacks, the tax stops being
layout and becomes logic.

Lane 1: it lives in the browser and does not follow a person between devices.
Syncing it is Lane 2 and waits on an RFC, alongside the time format, which has
exactly the same question hanging over it.
*/

import { useSyncExternalStore } from "react"

export type RowDensity = "two" | "one"

const KEY = "dana.rowDensity"

function read(): RowDensity {
  try {
    return localStorage.getItem(KEY) === "one" ? "one" : "two"
  } catch {
    /* Private modes and sandboxed frames throw rather than return null. A
       display preference is not worth failing a render over. */
    return "two"
  }
}

let current: RowDensity = read()
const listeners = new Set<() => void>()

export function setRowDensity(next: RowDensity) {
  if (next === current) return
  current = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* Remembered for this session only, which is the honest fallback. */
  }
  listeners.forEach((notify) => notify())
}

export function useRowDensity(): RowDensity {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => {
        listeners.delete(notify)
      }
    },
    () => current,
    () => "two",
  )
}
