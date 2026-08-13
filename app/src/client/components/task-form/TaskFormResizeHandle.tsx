/*
The designer's `TaskFormResizeHandle`, from `src/components/task-form.tsx`,
ported at P8R session R7.

**The name is 9.1's.** Its names table took the two resize handles at the P8R
mid-package change control on 2026-08-13 and gave them "Resize sidebar" and
"Resize task form"; his prototype already carried both strings, so nothing here
is a correction. AC-182 addresses the handle by the `separator` role, which is
what a control splitting two resizable panes is, and drags it.

**One change, and it is the same one `SidebarResizeHandle` made.** His component
reads its bounds from module constants in the file it lives in; here they are
`width.ts`'s, because a preference's bounds belong beside the preference. The
pointer capture, the keyboard steps and the double-click reset are his
unchanged: they are behaviour no numbered section names, and 9.3's sentence
about the width is what admits them.

The arithmetic is mirrored rather than shared with the sidebar's handle, and the
mirror is not an accident: this handle sits on the left edge of a right-hand
sheet, so dragging left widens it and the delta is `startX - clientX`, where the
sidebar's is `clientX - startX`. Two lines that look like a copy with a typo in
it are two different geometries, which is why this comment exists.
*/
import { useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

import {
  clampTaskFormWidth,
  TASK_FORM_MAX_WIDTH,
  TASK_FORM_MIN_WIDTH,
} from './width.js'

/** 9.1's names table. A fixed string; the sidebar's handle has its own. */
const RESIZE_TASK_FORM = 'Resize task form'

export function TaskFormResizeHandle({
  value,
  onChange,
  onCommit,
  onReset,
}: {
  readonly value: number
  readonly onChange: (value: number) => void
  readonly onCommit: (value: number) => void
  readonly onReset: () => void
}): React.JSX.Element {
  const drag = useRef<{
    pointerId: number
    startX: number
    startWidth: number
    currentWidth: number
  } | null>(null)

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus()
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: value,
      currentWidth: value,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const current = drag.current
    if (current === null || current.pointerId !== event.pointerId) return
    const nextWidth = clampTaskFormWidth(
      current.startWidth + current.startX - event.clientX,
    )
    current.currentWidth = nextWidth
    onChange(nextWidth)
  }

  function finishPointerResize(event: ReactPointerEvent<HTMLDivElement>): void {
    const current = drag.current
    if (current === null || current.pointerId !== event.pointerId) return
    onCommit(current.currentWidth)
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    let nextWidth: number | null = null
    if (event.key === 'ArrowLeft') {
      nextWidth = clampTaskFormWidth(value + (event.shiftKey ? 24 : 8))
    } else if (event.key === 'ArrowRight') {
      nextWidth = clampTaskFormWidth(value - (event.shiftKey ? 24 : 8))
    } else if (event.key === 'Home') {
      nextWidth = TASK_FORM_MIN_WIDTH
    } else if (event.key === 'End') {
      nextWidth = TASK_FORM_MAX_WIDTH
    }
    if (nextWidth === null) return
    event.preventDefault()
    onChange(nextWidth)
    onCommit(nextWidth)
  }

  return (
    <div
      data-task-form-resize-handle
      role="separator"
      aria-label={RESIZE_TASK_FORM}
      aria-orientation="vertical"
      aria-valuemin={TASK_FORM_MIN_WIDTH}
      aria-valuemax={TASK_FORM_MAX_WIDTH}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${String(Math.round(value))} pixels`}
      tabIndex={0}
      title={RESIZE_TASK_FORM}
      className="absolute inset-y-0 -left-1 z-[80] w-2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent hover:after:bg-[var(--color-graphite-300)] focus-visible:after:bg-[var(--color-dana-accent-600)]"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerResize}
      onPointerCancel={finishPointerResize}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
    />
  )
}
