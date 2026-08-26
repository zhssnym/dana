/*
The undo bar: what happened, and one press to take it back.

Rendered once by the shell, never by a screen — see `lib/undo.ts` for why the
entries come from the mutators rather than from the surfaces.

Placement is bottom-left, deliberately. The capture button sits bottom-right
(`app-shell`), and a transient bar that lands on top of the one control people
press most would be a worse fault than the one it fixes. Left also puts it
nearest the sidebar, which is where the eye already returns between actions.

It expires rather than waiting to be dismissed: a bar that stays until you
deal with it turns every completed task into a small piece of admin. Eight
seconds is the interval this genre has settled on — long enough to notice a
mistake, short enough that it is gone before you have finished the next thing.
**Expiring hides the bar, it does not clear the stack**: Ctrl/Cmd+Z still
reaches the act afterwards, so the timer governs the furniture and never the
capability.
*/

import { useEffect, useState } from "react"

import { RotateCcw, X } from "@/lib/icons"
import { T_FAST } from "@/components/task-row"
import { undoLast, undoShortcutApplies, useUndoStack } from "@/lib/undo"
import { cn } from "@/lib/utils"

const VISIBLE_MS = 8000

export function UndoBar() {
  const stack = useUndoStack()
  const top = stack[0]
  const [dismissed, setDismissed] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  /* One timer that ends with the entry it belongs to, rather than one per
     push — a stack of overlapping timers is how a bar ends up flickering
     back after a second action. */
  useEffect(() => {
    if (!top) return
    setNow(Date.now())
    const timer = window.setTimeout(() => setNow(Date.now() + VISIBLE_MS), VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [top])

  /* The shortcut lives with the bar because they are one feature: the bar is
     the discoverable half and the keystroke is the fast half, and separating
     them is how one of them ends up wired and the other forgotten. */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return
      if (event.shiftKey) return
      if (!undoShortcutApplies(event.target)) return
      event.preventDefault()
      undoLast()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  if (!top) return null
  if (dismissed === top.at) return null
  if (now - top.at >= VISIBLE_MS) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "absolute bottom-6 left-6 z-30 flex h-10 items-center gap-1 rounded-lg bg-[var(--color-graphite-900)] pr-1 pl-3 text-white shadow-[var(--elevation-2)]",
        "duration-[var(--duration-slow)] ease-[var(--ease-enter)] animate-in fade-in slide-in-from-bottom-2",
      )}
    >
      <span className="truncate text-[13px] leading-5">{top.label}</span>
      {top.undo ? (
      <button
        type="button"
        onClick={() => undoLast()}
        className={cn(
          "ml-1 flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] leading-5 font-medium text-white transition-colors hover:bg-white/15",
          T_FAST,
          "outline-none focus-visible:ring-2 focus-visible:ring-white/60",
        )}
      >
        <RotateCcw className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
        Undo
      </button>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(top.at)}
        className={cn(
          "flex size-8 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/15 hover:text-white",
          T_FAST,
          "outline-none focus-visible:ring-2 focus-visible:ring-white/60",
        )}
      >
        <X className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  )
}
