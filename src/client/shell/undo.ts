/*
 * Undo: one bar for the whole window (spec 9.1). The forward write goes out at once; this store holds only the
 * way back (AC-225). Entries come from `parts/useRowActions.ts`, so every page gets undo. No redo.
 */
import { useSyncExternalStore } from 'react'

export interface UndoEntry {
  /** Past tense, the thing quoted: `Deleted “{title}”`. */
  readonly label: string
  /** Runs after the entry leaves the stack; see `undoLast`. */
  readonly undo: () => void
  /** Stamped on push; read only to expire the bar. */
  readonly at: number
}

/** Spec 9.1's five seconds. Expiry only stops offering the entry; nothing is undone or redone. */
export const UNDO_WINDOW_MS = 5_000

/* Deep enough to walk back a run of quick completions with the shortcut; the bar shows one. */
const DEPTH = 20

let stack: readonly UndoEntry[] = []
const listeners = new Set<() => void>()

function publish(): void {
  for (const notify of listeners) notify()
}

/** `at` is stamped here so no caller can supply a wrong one. */
export function pushUndo(label: string, undo: () => void): void {
  stack = [{ label, undo, at: Date.now() }, ...stack].slice(0, DEPTH)
  publish()
}

/** Runs `act` and keeps what it registers as one entry: undo runs `first`, waits, then each folded inverse. */
export function foldUndo(act: () => void, first: () => Promise<unknown>): void {
  const before = stack
  act()
  const added = stack.filter((entry) => !before.includes(entry))
  const top = added[0]
  if (top === undefined) return
  const undo = (): void => { void first().catch(() => undefined).then(() => { for (const entry of added) entry.undo() }) }
  stack = [{ label: top.label, undo, at: top.at }, ...stack.filter((entry) => !added.includes(entry))]
  publish()
}

/**
 * The entry leaves the stack before its inverse runs, so an inverse that registers does not loop, and one that
 * throws leaves no poisoned entry.
 */
export function undoLast(): void {
  const [entry, ...rest] = stack
  if (entry === undefined) return
  stack = rest
  publish()
  entry.undo()
}

export function useUndoStack(): readonly UndoEntry[] {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => {
        listeners.delete(notify)
      }
    },
    () => stack,
    () => stack,
  )
}

/** Text inputs keep their own Ctrl+Z. */
export function undoShortcutApplies(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true
  return target.closest("input, textarea, select, [contenteditable='true']") === null
}

/** Built one way so call sites cannot drift into different phrasings. */
export function undoLabel(verb: string, title: string): string {
  return `${verb} “${title}”`
}
