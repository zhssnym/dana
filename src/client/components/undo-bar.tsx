// The undo bar, in the toasts' notice column. It hides after the undo window
// (`UNDO_WINDOW_MS`, AC-225) but never clears the stack: Ctrl/Cmd+Z still works.

import { useEffect, useState } from 'react'

import { undoLast, undoShortcutApplies, UNDO_WINDOW_MS, useUndoStack } from '../shell/undo.js'
import { NOTICE, NOTICE_BUTTON } from '../state/ToastRegion.js'
import { Button } from './ui/button.js'

export function UndoBar(): React.JSX.Element | null {
  const stack = useUndoStack()
  const top = stack[0]
  const [now, setNow] = useState(() => Date.now())

  // One timer that ends with the entry it belongs to.
  useEffect(() => {
    if (!top) return
    setNow(Date.now())
    const timer = window.setTimeout(() => setNow(Date.now() + UNDO_WINDOW_MS), UNDO_WINDOW_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [top])

  // The shortcut lives with the bar, the discoverable half.
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
