/*
Undo.

Imran, 2026-08-22: "Adding Undo feature in this prototype coz it's very
important, how to do it you know the best."

**What was there before, and why it was wrong.** The task card's footer carried
an Undo and a Redo button. They were dead — `undoDepth` started at zero, Undo
was disabled at `<= 0` and Redo at `>= 0`, and nothing but those two buttons
could move the number, so neither could ever become pressable by any route a
person could take. Four more beside them had no handler at all. But the deeper
fault was the metaphor, not the wiring: a card footer with Undo and Redo
promises **text-editor semantics**, and a to-do app does not have them. What
is "redo" after you have un-completed a task? What does the pair even refer to
when the card is closed and you are looking at a list?

**What people actually want to undo** is not a keystroke, it is a discrete act
with a name: I completed the wrong task, I deleted one, I abandoned one, I
dragged a row somewhere silly, I dropped a section. Every product that gets
this right — Gmail, Linear, Todoist, Things — answers it the same way, and it
is worth naming why the shape is what it is:

- **A transient bar that says what happened.** "Task deleted · Undo" tells you
  *which* act you are about to reverse, which a permanently docked button pair
  never can. It appears where the change was, and it leaves.
- **One shortcut, not a control per surface.** Ctrl/Cmd+Z reaches it from
  anywhere, so undo does not have to be drawn on every screen that can change
  something — which is what would otherwise happen, once per screen, slightly
  differently each time (DES-154).
- **Undo, no redo.** Redo is a text-editor idea. After un-deleting a task,
  "redo" means delete it again, which nobody reaches for and everybody
  misreads. Dropping it removes a control instead of adding one.

**Where the entries come from, and this is the whole point.** Not from
screens. The shell's own mutators — complete, abandon, delete, move, remove
from Today — register the inverse as they run, so every page gets undo without
knowing it exists, and a page written next year gets it too. A screen that had
to remember to call `pushUndo` is a screen that will forget, which is the
class of bug this repository has spent four sessions finding.

It also replaces the two bespoke undos already in the tree: the folder page
grew its own for section deletion and its own again for completion, each with
its own timer and its own bar, because there was nothing to reach for.

Fixtures-and-presentation: an inverse here is a client-side state change, and
none of it survives a reload. A ported undo would post the compensating
mutation through section 7 exactly as the forward one went, so the *shape* is
portable even though this implementation is not.
*/

import { useSyncExternalStore } from "react"

export interface UndoEntry {
  /* What happened, in the past tense and in a person's words — "Task
     deleted", "Venue deposit completed". It is the sentence in the bar, so it
     names the act rather than the mechanism. */
  label: string
  /*
  Put it back — or nothing, for an act with nothing to take back.

  "Link copied" changes no state, so offering Undo beside it would be a
  control that cannot mean anything ([[DES-144]]). But it still needs saying,
  and it belongs in the same place as everything else that just happened: one
  bar answering *what did I just do*, with the Undo button appearing only when
  there is an answer to it. A second floating notice would be a second thing
  in the corner competing with the capture button.
  */
  undo?: () => void
  /* Set when pushed, used only to expire the bar. */
  at: number
}

/* Deep enough that a run of quick completions can all be walked back, shallow
   enough that nothing is held long past the point anybody remembers doing it. */
const DEPTH = 20

let stack: UndoEntry[] = []
const listeners = new Set<() => void>()

function publish() {
  listeners.forEach((notify) => notify())
}

/*
Register something as reversible.

`at` is stamped here rather than by the caller so every entry is comparable,
and because a caller that had to supply a timestamp is a caller that can
supply a wrong one.
*/
export function pushUndo(label: string, undo: () => void) {
  stack = [{ label, undo, at: Date.now() }, ...stack].slice(0, DEPTH)
  publish()
}

/*
Something happened and there is nothing to take back.

Copying a link, saving a workflow, emptying the trash: the person needs to
know it worked, and Ctrl+Z must not reach it — so it goes on the stack as an
entry with no inverse, which `undoLast` skips past to the last real act.
*/
export function notice(label: string) {
  stack = [{ label, at: Date.now() }, ...stack].slice(0, DEPTH)
  publish()
}

/*
Reverse the most recent act.

The entry is removed *before* its inverse runs, for two reasons: an inverse
that itself goes through a mutator would otherwise push its own entry on top
of the one being consumed and undo would walk in a circle; and an inverse that
throws should not leave a poisoned entry at the top of the stack for the next
press to hit again.
*/
export function undoLast() {
  /* Past any notices at the top: they are things that happened, not things
     that can be unhappened, and a keystroke that consumed one silently would
     look like undo doing nothing. */
  const at = stack.findIndex((entry) => entry.undo)
  if (at < 0) return
  const entry = stack[at]!
  stack = stack.filter((_, index) => index !== at)
  publish()
  entry.undo?.()
}

/* Drop everything — for a surface that has invalidated the inverses it was
   holding, such as a reload of the fixture set. */
export function clearUndo() {
  if (!stack.length) return
  stack = []
  publish()
}

export function useUndoStack(): UndoEntry[] {
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

/*
Whether a keystroke belongs to undo or to the field the person is typing in.

Text inputs have their own undo and it is older, better understood, and
scoped to the words in front of them. Stealing Ctrl+Z from a half-written task
title to un-delete something three screens away would be the single most
alarming thing this feature could do.
*/
export function undoShortcutApplies(target: EventTarget | null) {
  const element = target as HTMLElement | null
  if (!element || !element.closest) return true
  return !element.closest("input, textarea, select, [contenteditable='true']")
}
