/* Shift/Cmd-click selection of task rows, and its bar. */

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"

import type { ConceptTask } from "../../tasks/task-model.js"
import { BulkBar } from "./BulkBar.js"

/* Everything a concept needs: the task list, the drag layer, and the panel
   both folder gestures land in. Shared so that dragging behaves identically in
   every concept, for the same reason renaming does, a comparison should
   measure the row, not which concept got the better drag. */
/*
Selecting task rows: Shift-click or Cmd/Ctrl-click a row to add it, and while
a selection is held a plain click adds or removes too. Escape, "Clear", or
emptying the selection leaves. The bar says every act in words.

Dragging is suspended while selecting, because the list cannot serve both.
*/
export type BulkDate = "today" | "tomorrow" | "next-week" | null

export function useRowSelection({
  onMove,
  onNewFolder,
  onBulk,
  onDate,
  onDelete,
}: {
  /* The choice carries the folder id a PATCH /tasks/:id body names it by. */
  onMove: (ids: string[], folder: { id: string; name: string; color: string }) => void
  onNewFolder: (ids: string[]) => void
  onBulk: (ids: string[], fields: Partial<ConceptTask>) => void
  /* Absent in a list with nowhere to write a date; the bar then offers none. */
  onDate?: (ids: string[], when: BulkDate) => void
  /* Accepted from old call sites; the bar no longer offers Duplicate. */
  onDuplicate?: (ids: string[]) => void
  onDelete: (ids: string[]) => void
}) {
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  /* A modified press is a selection, never a tap that opens the task. The
     drag engine reports the tap on pointerup, before the click lands. */
  const modifiedPress = useRef(false)

  useEffect(() => {
    if (!selecting) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") exit()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selecting])

  function exit() {
    setSelecting(false)
    setSelected([])
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
      setSelecting(next.length > 0)
      return next
    })
  }

  const modified = (event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) =>
    event.shiftKey || event.metaKey || event.ctrlKey

  function selectProps(id: string) {
    return {
      onPointerDown: (event?: ReactPointerEvent) => {
        modifiedPress.current = event !== undefined && modified(event)
      },
      /* Shift-click would otherwise extend a text selection across the rows. */
      onMouseDown: (event: ReactMouseEvent) => {
        if (modified(event)) event.preventDefault()
      },
      onClick: (event: ReactMouseEvent) => {
        if ((event.target as HTMLElement).closest('button, a, input, [role="checkbox"]')) return
        if (modified(event)) {
          event.preventDefault()
          toggle(id)
          return
        }
        if (selecting) toggle(id)
      },
    }
  }

  /* Read once by the list's opener: true when the press it is about to treat
     as a tap was a modified one. */
  function takeModifiedPress() {
    const was = modifiedPress.current
    modifiedPress.current = false
    return was
  }

  const bar = (
    selecting ? (
      <BulkBar
        selected={selected}
        onMove={onMove}
        onNewFolder={onNewFolder}
        onBulk={onBulk}
        onDate={onDate}
        onDelete={onDelete}
        exit={exit}
      />
    ) : null
  )

  return {
    selecting,
    selected,
    selectProps,
    takeModifiedPress,
    /* Nothing to cancel any more; kept so the drag engine's lift hook stays wired. */
    clearPress: () => {},
    bar,
  }
}
