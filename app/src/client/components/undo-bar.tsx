/*
The undo bar: what happened, and one press to take it back.

Lifted from `docs/design/prototype-v2/src/components/undo-bar.tsx` at S24,
read on `v2-build` at `102e855`. That prototype is deleted (`a7886df`,
2026-09-01); read it in git history before that commit. The lift discipline
of RFC 0004's prototype-lift section applies: this file diffs empty against
that original except at the seams named at the foot of this header. The
designer's own reasoning below is kept intact, being the design record for
what this does.

Rendered once by the shell, never by a screen, see `shell/undo.ts` for why the
entries come from the mutators rather than from the surfaces.

Placement is bottom-left, deliberately. The capture button sits bottom-right
(`app-shell`), and a transient bar that lands on top of the one control people
press most would be a worse fault than the one it fixes. Left also puts it
nearest the sidebar, which is where the eye already returns between actions.

It expires rather than waiting to be dismissed: a bar that stays until you
deal with it turns every completed task into a small piece of admin.
**Expiring hides the bar, it does not clear the stack**: Ctrl/Cmd+Z still
reaches the act afterwards, so the timer governs the furniture and never the
capability. That is ledger entry L-083, and S24 verified it against
`shell/undo.ts` rather than assuming it: the store carries no timer at all, an
entry's `at` is stamped once and read only here, and nothing in the module
expires anything. The rule was already true; what this file changes is which
component draws it.

**Three seams, and the first is the only one that changes behaviour.**

**The window is 9.1's five seconds, not the prototype's eight.** The original
names eight and gives the genre's reasoning for it; the section fixes "for five
seconds" and 11.13 makes the section the winner without a ruling, AC-225
reading the number by name. So the constant is `UNDO_WINDOW_MS` from the store
rather than a literal here, which also stops the bar and the criterion drifting
apart the way a second copy of a number always eventually does.

**Every entry has an inverse, so the Undo control is unconditional.** The
prototype's store carries `notice`, an entry with no way back, for acts like
"Link copied" that still need saying; this client says those with the toast
region 9.1 gives it, so `UndoEntry.undo` is required and the original's
`top.undo ?` guard has nothing to guard. Removing a branch that cannot be taken
is not a rewrite of the body; adding `notice` to the store would be, and it is
nobody's row.

**`fixed` where the original says `absolute`, which is a fact about where this
file is mounted rather than a disagreement about the design.** The prototype's
bar is a child of a positioned shell root and resolves against it; this
client's shell renders the bar as a sibling of that box, deliberately, so it is
not clipped by the shell's own layout and so there is exactly one of it however
many pages mount. `absolute` there resolves against the initial containing
block, which is the same rectangle right up until the document scrolls.
Bottom-left of the window is what 9.1 asks for, and `fixed` is what says it.

**The mechanical two**: the `@/` specifiers become this client's relative ESM
paths (11.4), and the em dashes leave under protocol section 7's writing
convention.
*/

import { useEffect, useState } from 'react'

import { RotateCcw, X } from '../lib/icons.js'
import { undoLast, undoShortcutApplies, UNDO_WINDOW_MS, useUndoStack } from '../shell/undo.js'
import { T_FAST } from './task-row.js'
import { cn } from './ui/utils.js'

export function UndoBar(): React.JSX.Element | null {
  const stack = useUndoStack()
  const top = stack[0]
  const [dismissed, setDismissed] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  /* One timer that ends with the entry it belongs to, rather than one per
     push, a stack of overlapping timers being how a bar ends up flickering
     back after a second action. */
  useEffect(() => {
    if (!top) return
    setNow(Date.now())
    const timer = window.setTimeout(() => setNow(Date.now() + UNDO_WINDOW_MS), UNDO_WINDOW_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [top])

  /* The shortcut lives with the bar because they are one feature: the bar is
     the discoverable half and the keystroke is the fast half, and separating
     them is how one of them ends up wired and the other forgotten. */
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      if (event.shiftKey) return
      if (!undoShortcutApplies(event.target)) return
      event.preventDefault()
      undoLast()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  if (!top) return null
  if (dismissed === top.at) return null
  if (now - top.at >= UNDO_WINDOW_MS) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-6 left-6 z-30 flex h-10 items-center gap-1 rounded-lg bg-[var(--color-graphite-900)] pr-1 pl-3 text-white shadow-[var(--elevation-2)]',
        'duration-[var(--duration-slow)] ease-[var(--ease-enter)] animate-in fade-in slide-in-from-bottom-2',
      )}
    >
      <span className="truncate text-[13px] leading-5">{top.label}</span>
      <button
        type="button"
        onClick={() => {
          undoLast()
        }}
        className={cn(
          'ml-1 flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] leading-5 font-medium text-white transition-colors hover:bg-white/15',
          T_FAST,
          'outline-none focus-visible:ring-2 focus-visible:ring-white/60',
        )}
      >
        <RotateCcw className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
        Undo
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(top.at)
        }}
        className={cn(
          'flex size-8 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/15 hover:text-white',
          T_FAST,
          'outline-none focus-visible:ring-2 focus-visible:ring-white/60',
        )}
      >
        <X className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  )
}
