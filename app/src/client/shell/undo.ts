/*
Undo: one bar for the whole window (9.1).

Ported from the prototype's `lib/undo.ts`, whose own closing paragraph
says what changes in the port: "a ported undo would post the compensating
mutation through section 7 exactly as the forward one went, so the shape is
portable even though this implementation is not." The shape is what arrived;
every inverse here is a real mutation.

**The one architectural clause, and it is the half a criterion reads.** 9.1:
"Undo issues the inverse mutation, no write is ever held back waiting for the
window to close." A queued write would be a lie on every other member's
screen for five seconds, and this product is shared by construction. So the
forward act goes out the instant it is asked for and this store holds only
the way back. AC-225 watches the wire for exactly that: a POST when the
checkbox is pressed, and a second, inverse POST when Ctrl+Z is.

**Where entries come from, and it is the whole point.** Not from screens.
`parts/useRowActions.ts` is the page layer every page spreads into its list,
so registering the inverse there gives every page undo without knowing it
exists, and a page written next year gets it too. A screen that had to
remember to call `pushUndo` is a screen that will forget.

**Undo, no redo**, which 9.1 states and which removes a control rather than
adding one: after un-deleting a task, "redo" means delete it again, which
nobody reaches for and everybody misreads.
*/
import { useSyncExternalStore } from 'react'

export interface UndoEntry {
  /**
   * What happened, in the past tense and in a person's words.
   *
   * 9.1 gives the form by example, `Deleted “{title}”`: the act named, with
   * the thing it acted on quoted, so the bar says which of five completions
   * a press is about to reverse. A permanently docked control never can.
   */
  readonly label: string
  /** Put it back. Runs after the entry leaves the stack; see `undoLast`. */
  readonly undo: () => void
  /** Stamped on push, and read only to expire the bar. */
  readonly at: number
}

/**
 * How long the bar stands, from 9.1: "for five seconds".
 *
 * The number is the specification's and the expiry is only the bar's: an
 * entry older than this stops being offered, and nothing about the act it
 * described is undone or re-done by the clock running out.
 */
export const UNDO_WINDOW_MS = 5_000

/* Deep enough that a run of quick completions can all be walked back,
   shallow enough that nothing is held past the point anybody remembers
   doing it. The bar shows one; the depth is what a repeated shortcut
   walks. */
const DEPTH = 20

let stack: readonly UndoEntry[] = []
const listeners = new Set<() => void>()

function publish(): void {
  for (const notify of listeners) notify()
}

/**
 * Register an act as reversible.
 *
 * `at` is stamped here rather than by the caller, so every entry is
 * comparable and no caller can supply a wrong one.
 */
export function pushUndo(label: string, undo: () => void): void {
  stack = [{ label, undo, at: Date.now() }, ...stack].slice(0, DEPTH)
  publish()
}

/**
 * Reverse the most recent act.
 *
 * The entry leaves the stack *before* its inverse runs, for two reasons that
 * are easy to discover the hard way: an inverse that itself goes through a
 * registering mutator would otherwise push its own entry on top of the one
 * being consumed, and undo would walk in a circle; and an inverse that throws
 * should not leave a poisoned entry at the top for the next press to hit.
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

/**
 * Whether a keystroke belongs to undo or to the field the person is typing in.
 *
 * Text inputs have their own undo and it is older, better understood, and
 * scoped to the words in front of them. Stealing Ctrl+Z from a half-written
 * task title to un-delete something three screens away would be the single
 * most alarming thing this feature could do.
 */
export function undoShortcutApplies(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true
  return target.closest("input, textarea, select, [contenteditable='true']") === null
}

/**
 * The sentence the bar shows, built the one way so five call sites cannot
 * drift into five phrasings.
 *
 * 9.1 fixes the form by example rather than fixing each verb, so the verbs
 * are the past tense of the acts 5.1 and 9.4 already name and the quoting is
 * the section's.
 */
export function undoLabel(verb: string, title: string): string {
  return `${verb} “${title}”`
}
