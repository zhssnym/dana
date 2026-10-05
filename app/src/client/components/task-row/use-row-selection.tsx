import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"

import type { ConceptTask } from "../../tasks/task-model.js"
import { BulkBar } from "./BulkBar.js"

/* Shift or Cmd/Ctrl-click adds a row; while selecting, a plain click toggles too.
   Dragging is suspended while selecting. */
export type BulkDate = "today" | "tomorrow" | "next-week" | null

export function useRowSelection({
  onMove,
  onNewFolder,
  onBulk,
  onDate,
  onDelete,
}: {
  onMove: (ids: string[], folder: { id: string; name: string; color: string }) => void
  onNewFolder: (ids: string[]) => void
  onBulk: (ids: string[], fields: Partial<ConceptTask>) => void
  /* Absent: the bar offers no date. */
  onDate?: (ids: string[], when: BulkDate) => void
  /* Accepted from old call sites; the bar no longer offers Duplicate. */
  onDuplicate?: (ids: string[]) => void
  onDelete: (ids: string[]) => void
}) {
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  /* The drag engine reports a tap on pointerup, before the click lands, so a
     modified press is recorded here to stop it opening the task. */
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

  /* Read once by the list's opener. */
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
    /* A no-op, kept so the drag engine's lift hook stays wired. */
    clearPress: () => {},
    bar,
  }
}
