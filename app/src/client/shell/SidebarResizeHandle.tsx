/*
 * The sidebar resize handle ("Resize sidebar", a `separator`; AC-182). Bounds come from `preferences.ts`. A
 * drag starts from the painted width, because the default lives only in `tokens.css`.
 */
import { useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

import { clampSidebarWidth, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from './preferences.js'

/** 9.1's names table. A fixed string; the task form's handle has its own. */
const RESIZE_SIDEBAR = 'Resize sidebar'

export function SidebarResizeHandle({
  value,
  onChange,
  onCommit,
  onReset,
}: {
  /** The chosen width, or null while the design's default is in force. */
  readonly value: number | null
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

  /** The handle sits inside the element that carries the width, so its offset parent is that box. */
  function paintedWidth(handle: HTMLDivElement): number {
    const painted = handle.offsetParent?.getBoundingClientRect().width
    if (painted === undefined || painted <= 0) return value ?? SIDEBAR_MIN_WIDTH
    return painted
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus()
    const startWidth = paintedWidth(event.currentTarget)
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth,
      currentWidth: clampSidebarWidth(startWidth),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const current = drag.current
    if (current === null || current.pointerId !== event.pointerId) return
    const nextWidth = clampSidebarWidth(
      current.startWidth + event.clientX - current.startX,
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
    const current = paintedWidth(event.currentTarget)
    let nextWidth: number | null = null
    if (event.key === 'ArrowLeft') {
      nextWidth = clampSidebarWidth(current - (event.shiftKey ? 24 : 8))
    } else if (event.key === 'ArrowRight') {
      nextWidth = clampSidebarWidth(current + (event.shiftKey ? 24 : 8))
    } else if (event.key === 'Home') {
      nextWidth = SIDEBAR_MIN_WIDTH
    } else if (event.key === 'End') {
      nextWidth = SIDEBAR_MAX_WIDTH
    }
    if (nextWidth === null) return
    event.preventDefault()
    onChange(nextWidth)
    onCommit(nextWidth)
  }

  return (
    <div
      data-sidebar="resize-handle"
      role="separator"
      aria-label={RESIZE_SIDEBAR}
      aria-orientation="vertical"
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      aria-valuenow={value === null ? undefined : Math.round(value)}
      aria-valuetext={value === null ? undefined : `${Math.round(value)} pixels`}
      /* Out of the Tab order. A press still focuses it, so arrows and Home/End work after a click. */
      tabIndex={-1}
      title={RESIZE_SIDEBAR}
      className="absolute inset-y-0 -right-1 z-30 hidden w-2 cursor-col-resize touch-none outline-none md:block after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent hover:after:bg-border focus-visible:after:bg-ring"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerResize}
      onPointerCancel={finishPointerResize}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
    />
  )
}
