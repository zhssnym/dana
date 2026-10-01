import { useSyncExternalStore, type CSSProperties } from 'react'

type CoverEntry = {
  readonly owner: symbol
  readonly style: CSSProperties
}

const entries = new Map<symbol, CSSProperties>()
const listeners = new Set<() => void>()
let current: CoverEntry | null = null

function publish(): void {
  const all = [...entries.entries()]
  const last = all[all.length - 1]
  const next = last === undefined ? null : { owner: last[0], style: last[1] }
  if (current?.owner === next?.owner && current?.style === next?.style) return
  current = next
  listeners.forEach((listener) => listener())
}

export function setCoverChrome(owner: symbol, style: CSSProperties): void {
  entries.delete(owner)
  entries.set(owner, style)
  publish()
}

export function clearCoverChrome(owner: symbol): void {
  if (!entries.delete(owner)) return
  publish()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useCoverChrome(): CSSProperties | null {
  return useSyncExternalStore(
    subscribe,
    () => current?.style ?? null,
    () => null,
  )
}
