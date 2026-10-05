import type { PointerEvent as ReactPointerEvent } from "react"

import type { useRowSelection } from "./use-row-selection.js"

export function rowProps(
  surface: { onPointerDown: (event: ReactPointerEvent) => void },
  select: ReturnType<ReturnType<typeof useRowSelection>["selectProps"]>,
) {
  return {
    ...select,
    onPointerDown: (event: ReactPointerEvent) => {
      select.onPointerDown(event)
      /* A modified press selects; it must not also arm a drag. */
      if (event.shiftKey || event.metaKey || event.ctrlKey) return
      surface.onPointerDown(event)
    },
  }
}
