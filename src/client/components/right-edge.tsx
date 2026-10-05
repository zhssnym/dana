// Right-edge panels take room from the page instead of covering it. Each mounted
// owner publishes a width and the shell keeps the widest. A CSS variable used as
// padding resolved to 0px, so the shell reads a number from this store.

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react"

let reserved = 0
const reservations = new Map<symbol, number>()
const listeners = new Set<() => void>()

function publish(width: number) {
  if (reserved === width) return
  reserved = width
  listeners.forEach((notify) => notify())
}

function recomputeReservation(): void {
  let next = 0
  for (const width of reservations.values()) next = Math.max(next, width)
  publish(next)
}

function setReservation(owner: symbol, width: number): void {
  reservations.set(owner, Math.round(width))
  recomputeReservation()
}

function clearReservation(owner: symbol): void {
  reservations.delete(owner)
  recomputeReservation()
}

// What the page should keep clear on its right, in pixels.
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

// A modal surface makes the page behind it `aria-hidden` and `inert`, so neither a
// screen reader nor a click reaches the rows behind it (AC-219, AC-220).
let modal = 0
const modalListeners = new Set<() => void>()

function publishModal(next: number) {
  if (modal === next) return
  modal = next
  modalListeners.forEach((notify) => notify())
}

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

/** Renders nothing; marks what is around it as a modal surface. */
export function HoldsTheDocument({ children }: { children: ReactNode }) {
  useEffect(() => {
    publishModal(modal + 1)
    return () => publishModal(modal - 1)
  }, [])
  return <>{children}</>
}

// The hook form, for a page that reserves from inside rather than wrapping. Each
// mounted hook owns one reservation, so one surface cannot clear another's room.
export function useReserveRightEdge(width: number, open: boolean) {
  const owner = useRef<symbol | null>(null)
  if (owner.current === null) owner.current = Symbol('right-edge-reservation')
  useEffect(() => {
    const key = owner.current
    if (!open || key === null) return undefined
    setReservation(key, width)
    return () => clearReservation(key)
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
