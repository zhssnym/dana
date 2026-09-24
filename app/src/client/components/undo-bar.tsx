/*
The undo bar: what happened, and one press to take it back.

Rendered once, inside the shell's one notice column (`state/ToastRegion.tsx`),
so it shares the toasts' place and look. Entries come from the mutators (see
`shell/undo.ts`).

It expires after 9.1's five seconds (`UNDO_WINDOW_MS`, AC-225) and has no
dismiss control, since it leaves by itself. Expiring hides the bar and never
clears the stack: Ctrl/Cmd+Z still reaches the act afterwards.
*/

import { useEffect, useState } from 'react'

import { undoLast, undoShortcutApplies, UNDO_WINDOW_MS, useUndoStack } from '../shell/undo.js'
import { NOTICE, NOTICE_BUTTON } from '../state/ToastRegion.js'
import { Button } from './ui/button.js'

export function UndoBar(): React.JSX.Element | null {
  const stack = useUndoStack()
  const top = stack[0]
  const [now, setNow] = useState(() => Date.now())

  /* One timer that ends with the entry it belongs to. */
  useEffect(() => {
    if (!top) return
    setNow(Date.now())
    const timer = window.setTimeout(() => setNow(Date.now() + UNDO_WINDOW_MS), UNDO_WINDOW_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [top])

  /* The shortcut lives with the bar: the bar is the discoverable half. */
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
  if (now - top.at >= UNDO_WINDOW_MS) return null

  return (
    <div role="status" aria-live="polite" className={NOTICE}>
      <span className="truncate">{top.label}</span>
      <Button
        variant="ghost"
        size="sm"
        className={NOTICE_BUTTON}
        onClick={() => {
          undoLast()
        }}
      >
        Undo
      </Button>
    </div>
  )
}
