/*
The undo bar of 9.1: one bar for the whole window, bottom-left, naming the
act it can take back, for five seconds.

**One bar and not one per surface**, which is the reason the store exists.
Before this, two surfaces had grown their own undo with their own timer and
their own bar, because there was nothing to reach for; that is DES-154's
class of fault, and a bar per screen is how it looks in the corner of a
window.

**Bottom-left, which is where the section puts it** and is also the one
corner nothing else occupies: the floating capture button of 9.1 sits bottom
right on the three pages that have it, and a notice competing with the
capture control is a notice that arrives under the person's pointer.

**It announces itself and does not steal focus.** A `status` region tells a
screen reader what happened without moving the caret out of whatever the
person was doing, which matters most for the act this bar most often
describes: a completion made from the keyboard, where focus is still on the
list. The keyboard route to the act is the shortcut rather than this button,
which is why the button is not focused on arrival.
*/
import { useEffect, useState } from 'react'

import { Button } from '../components/ui/button.js'
import { Undo2 } from '../lib/icons.js'

import { undoLast, UNDO_WINDOW_MS, useUndoStack } from './undo.js'

export function UndoBar(): React.JSX.Element | null {
  const stack = useUndoStack()
  const entry = stack[0]

  /*
  A tick that retires the bar when its window closes.

  The store is not on a timer: an entry's age is a fact about when it was
  pushed, and nothing about the act changes five seconds later. What changes
  is whether this bar draws, so the clock lives here, is set for exactly the
  remaining time of the entry on screen, and is cleared when that entry is
  replaced. A polling interval would redraw the whole bar four times a second
  to learn something it can be told once.
  */
  const [, setNow] = useState(0)
  useEffect(() => {
    if (entry === undefined) return
    const remaining = entry.at + UNDO_WINDOW_MS - Date.now()
    if (remaining <= 0) return
    const timer = setTimeout(() => setNow(Date.now()), remaining)
    return () => clearTimeout(timer)
  }, [entry])

  if (entry === undefined) return null
  if (Date.now() - entry.at >= UNDO_WINDOW_MS) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-4 z-50 flex justify-start"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg bg-[var(--color-graphite-900)] py-2 pr-2 pl-4 text-sm text-[var(--color-graphite-0)] shadow-[var(--elevation-2)]">
        <span className="max-w-[42ch] truncate">{entry.label}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-[var(--color-graphite-0)] hover:bg-[var(--color-graphite-800)] hover:text-[var(--color-graphite-0)]"
          onClick={() => undoLast()}
        >
          <Undo2 className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          Undo
        </Button>
      </div>
    </div>
  )
}
