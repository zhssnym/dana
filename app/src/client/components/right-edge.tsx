/*
A panel that takes room from the page rather than covering it.

A panel sitting *over* the page hides the row the task came from, which is the
one thing a side-by-side view exists to keep; if covering were acceptable, the
dialog would already be the better answer. The task surface and the conversation
panel share this right edge, which is why this is a component rather than two
effects that happen to agree.

**The width is a number in a store**, and the shell reads it with a hook and
writes a plain pixel margin. Nothing resolves at paint time, nothing depends on
inheritance, and the value that lays the page out is the value you can print. A
CSS custom property consumed as `padding-right` was tried and resolved to `0px`
for reasons nobody could account for: **a layout that cannot be explained cannot
be relied on.**

**The width is published rather than lifted.** A panel owns its own width, the
task surface's is resizable and remembered, so threading a live number up
through the shell so the shell can hand it back down is a lot of wiring for a
fact with one owner.

One number for both panels, because they share one edge. Two open at once would
overlap each other long before the page noticed, so a single value is not a
limitation but an honest description of the space.

`HoldsTheDocument` and `useReserveRightEdge` below each carry their own note.
*/

import { useEffect, useSyncExternalStore, type ReactNode } from "react"

let reserved = 0
const listeners = new Set<() => void>()

function publish(width: number) {
  if (reserved === width) return
  reserved = width
  listeners.forEach((notify) => notify())
}

/* What the page should keep clear on its right, in pixels. */
export function useRightEdge() {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    () => reserved,
    () => 0,
  )
}

/*
**A modal surface makes the page behind it inert.**

9.1's roles table makes the task surface "a dialog when opened as one", and a
dialog that is modal owes the rest of the document exactly this: it is not there
while the dialog is.

A row's due and repeat chips are controls, so a page of forty rows holds forty
buttons named "Due date". A test that reaches for a chip page-wide and takes the
first would find a row's, sitting behind an open dialog, and the click would
time out against the chrome strip that covers it (AC-219, AC-220).

**So this is the rule rather than an accommodation.** `aria-hidden` takes the
page out of the accessible tree, which is what "modal" means and what every
dialog primitive in this client already does; `inert` takes it out of the
pointer and the tab order, which is what stops the click landing somewhere
nobody can see. The two together are the platform saying what the role already
claimed.

Published rather than lifted, for `useRightEdge`'s own reason one export up: the
surface owns whether it is modal, and threading that up through the shell so the
shell can hand it back down is a lot of wiring for a fact with one owner.
*/
let modal = 0
const modalListeners = new Set<() => void>()

function publishModal(next: number) {
  if (modal === next) return
  modal = next
  modalListeners.forEach((notify) => notify())
}

/** Whether a modal surface is open over the page. */
export function useModalOpen() {
  return useSyncExternalStore(
    (notify) => {
      modalListeners.add(notify)
      return () => modalListeners.delete(notify)
    },
    () => modal > 0,
    () => false,
  )
}

/** Renders nothing; says that what is around it is a modal surface. */
export function HoldsTheDocument({ children }: { children: ReactNode }) {
  useEffect(() => {
    publishModal(modal + 1)
    return () => publishModal(modal - 1)
  }, [])
  return <>{children}</>
}

/*
**The same effect as a hook, and the reason this file has both.**

There is one store for the right edge: two module stores of one number would be
a broken feature, a panel publishing into one while the shell read the other and
covered the page it was supposed to narrow. `pages/FolderPage.tsx` reserves from
inside the page that owns the panels rather than wrapping them, so it wants a
hook.

So the effect is written once and offered twice. `open` is the difference
between the two shapes: a component reserves while it is mounted, a hook
reserves while a flag says the panel is showing.
*/
export function useReserveRightEdge(width: number, open: boolean) {
  useEffect(() => {
    if (!open) return undefined
    publish(Math.round(width))
    return () => publish(0)
  }, [width, open])
}

export function ReservesRightEdge({
  width,
  children,
}: {
  width: number
  children: ReactNode
}) {
  useReserveRightEdge(width, true)
  return <>{children}</>
}
