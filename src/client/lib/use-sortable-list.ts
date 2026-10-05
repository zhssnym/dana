// The one drag engine for every sortable surface: passed items slide aside to show the gap.
// Resting on an item for `dwellMs` proposes a merge; `onOver`/`onDropAt` let an item leave
// for another container. The slot arithmetic is pure and unit-tested.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

// A press travels this far before it becomes a drag, so a click is still a click.
const LIFT_PX = 4
// How still a pointer must be to count as resting.
const STILL_PX = 6
// How near the scroller's edge the pointer gets before it follows, and the top speed.
const EDGE_PX = 72
const MAX_SPEED_PX = 16
// Exported so the countdown ring closes exactly when the hold fires.
export const DWELL_MS = 1500
// How long the carried item gets to reach its slot before the array is rearranged.
const SETTLE_MS = 220

export interface SortableItemState {
  /** The item picked up. It follows the pointer. */
  isActive: boolean
  /** The item a release would merge with. Only set while dwelling. */
  isTarget: boolean
  /** Resting on this item; the bar is filling. */
  isDwelling: boolean
  /** Releasing now makes a container rather than reordering. */
  isArmed: boolean
  /** Pixels to shift along the list's axis; the caller applies it as translateX or Y. */
  offset: number
  /** Pixels across the axis, for the carried item when `followAcross` is set; else zero. */
  crossOffset: number
  /** True during the settle after release, while transforms transition. */
  isSettling: boolean
}

const RESTING: SortableItemState = {
  isActive: false,
  isTarget: false,
  isDwelling: false,
  isArmed: false,
  offset: 0,
  crossOffset: 0,
  isSettling: false,
}

/** Which way the list runs: a column on y, a tab strip on x. */
export type SortAxis = 'x' | 'y'

/** Each item's extent along the list's axis at drag start, in viewport coordinates. */
export interface Metrics {
  starts: number[]
  ends: number[]
  /** The carried item's extent plus the gap after it: how far passed items move. */
  stride: number
}

interface DragSnapshot {
  from: number
  over: number
  /** Pixels the active item has travelled from where it started. */
  delta: number
  dwellAt: number | null
  armed: boolean
  /** The container the pointer is inside, or null for an ordinary slot in this list. */
  into: string | null
  /** Pixels travelled across the axis; 0 unless `followAcross`. */
  cross: number
}

const NO_DRAG: DragSnapshot = {
  from: -1,
  over: -1,
  delta: 0,
  dwellAt: null,
  armed: false,
  into: null,
  cross: 0,
}

/**
 * The slot the carried item proposes: its centre against other items' midpoints, using
 * drag-start geometry. Unmeasured items are skipped, or they would capture every proposal.
 */
export function slotFor(
  metrics: Metrics,
  delta: number,
  from: number,
  count: number,
): number {
  const start = metrics.starts[from]
  const end = metrics.ends[from]
  if (start === undefined || end === undefined) return from
  const centre = (start + end) / 2 + delta
  let slot = from
  for (let index = 0; index < count; index += 1) {
    if (index === from) continue
    const otherStart = metrics.starts[index]
    const otherEnd = metrics.ends[index]
    if (otherStart === undefined || otherEnd === undefined) continue
    const mid = (otherStart + otherEnd) / 2
    if (index < from && centre < mid) return index
    if (index > from && centre > mid) slot = index
  }
  return slot
}

/** One stride, only for the items between the start and the proposed slot. */
export function offsetFor(
  index: number,
  from: number,
  over: number,
  stride: number,
): number {
  if (over > from && index > from && index <= over) return -stride
  if (over < from && index >= over && index < from) return stride
  return 0
}

/** An index outside the list returns it unchanged rather than dropping an item. */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return [...list]
  const next = [...list]
  const carried = next.splice(from, 1)[0]
  if (carried === undefined) return [...list]
  next.splice(to, 0, carried)
  return next
}

/**
 * The engine does not capture the pointer, so the browser still clicks whatever is under
 * the release. Pass this as `onLift` to swallow that one click.
 */
export function swallowNextClick(): void {
  const swallow = (event: MouseEvent): void => {
    event.stopPropagation()
    event.preventDefault()
  }
  window.addEventListener('click', swallow, true)
  window.addEventListener(
    'pointerup',
    () => {
      window.setTimeout(() => {
        window.removeEventListener('click', swallow, true)
      }, 0)
    },
    { once: true },
  )
}

export interface UseSortableListOptions {
  count: number
  onReorder: (from: number, to: number) => void
  /** Defaults to a column. */
  axis?: SortAxis
  /**
   * Also edge-scroll across the axis, for a board whose columns run off the window
   * (AC-228). Default false.
   */
  crossAxis?: boolean
  /** Omit and the dwell never arms. */
  onDwell?: (from: number, to: number) => void
  dwellMs?: number
  disabled?: boolean
  /** Called the moment a press becomes a drag. */
  onLift?: () => void
  /** Announced to screen readers after a keyboard move. */
  describe?: (index: number) => string
  /**
   * Asked on release before this list reorders; return true when the owner took the item
   * into another container.
   */
  onDropAt?: (from: number, point: { x: number; y: number }) => boolean
  /**
   * The same question mid-drag. A key means the pointer is inside that container: no slot,
   * no dwell, and `overKey` names it. Kept cheap: it runs on every move.
   */
  onOver?: (from: number, point: { x: number; y: number }) => string | null
  /** The carried item follows the pointer across the axis too, for board columns. */
  followAcross?: boolean
}

export interface SortableList {
  setItemRef: (index: number) => (element: HTMLElement | null) => void
  handleProps: (index: number) => {
    'data-sort-handle': boolean
    style: { touchAction: 'none' }
    onPointerDown: (event: ReactPointerEvent) => void
    onKeyDown: (event: ReactKeyboardEvent) => void
  }
  surfaceProps: (
    index: number,
    onTap?: () => void,
  ) => { onPointerDown: (event: ReactPointerEvent) => void }
  itemState: (index: number) => SortableItemState
  isDragging: boolean
  activeIndex: number | null
  /** Whichever container `onOver` last named; null for an ordinary slot. */
  overKey: string | null
  /** For an aria-live region, so a keyboard move is heard. */
  announcement: string
  dwellMs: number
}

export function useSortableList({
  count,
  onReorder,
  axis = 'y',
  crossAxis = false,
  onDwell,
  dwellMs = DWELL_MS,
  disabled = false,
  onLift,
  describe,
  onDropAt,
  onOver,
  followAcross = false,
}: UseSortableListOptions): SortableList {
  // The one place the axis is read as a coordinate.
  const along = useCallback(
    (point: { x: number; y: number }): number => (axis === 'x' ? point.x : point.y),
    [axis],
  )
  const edgesOf = useCallback(
    (rect: DOMRect): { start: number; end: number } =>
      axis === 'x'
        ? { start: rect.left, end: rect.right }
        : { start: rect.top, end: rect.bottom },
    [axis],
  )
  // The same readings across the axis, for `crossAxis`.
  const across = useCallback(
    (point: { x: number; y: number }): number => (axis === 'x' ? point.y : point.x),
    [axis],
  )
  const crossEdgesOf = useCallback(
    (rect: DOMRect): { start: number; end: number } =>
      axis === 'x'
        ? { start: rect.top, end: rect.bottom }
        : { start: rect.left, end: rect.right },
    [axis],
  )
  const [drag, setDrag] = useState<DragSnapshot>(NO_DRAG)
  const [settlingFrom, setSettlingFrom] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')

  // Handlers read refs, not state: a stale closure dropped items one place off.
  const live = useRef<DragSnapshot>(NO_DRAG)
  const metrics = useRef<Metrics | null>(null)
  const items = useRef<(HTMLElement | null)[]>([])
  const scroller = useRef<HTMLElement | null>(null)
  // The cross-axis scroller, found only when `crossAxis` asks.
  const crossScroller = useRef<HTMLElement | null>(null)
  const pointerY = useRef(0)
  const pointerX = useRef(0)
  const originAcross = useRef(0)
  // Where the drag began and last stood still, along the list's axis.
  const origin = useRef(0)
  const stillAt = useRef(0)
  const stillAlong = useRef(0)
  const frame = useRef<number | null>(null)
  const settleTimer = useRef<number | null>(null)
  const focusWanted = useRef<number | null>(null)
  const countRef = useRef(count)
  countRef.current = count

  const setItemRef = useCallback(
    (index: number) =>
      (element: HTMLElement | null): void => {
        items.current[index] = element
      },
    [],
  )

  const apply = useCallback((next: DragSnapshot): void => {
    live.current = next
    setDrag(next)
  }, [])

  const stopFrame = useCallback((): void => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [])

  // Abandon a drag without committing: Escape, or a list that shrank under it.
  const release = useCallback((): void => {
    stopFrame()
    apply(NO_DRAG)
    metrics.current = null
    document.body.style.removeProperty('cursor')
    document.body.style.removeProperty('user-select')
  }, [apply, stopFrame])

  // Hit-test current rects (transforms included), which is what the pointer is over.
  const itemUnderPointer = useCallback(
    (position: number, exclude: number): number => {
      for (let index = 0; index < items.current.length; index += 1) {
        if (index === exclude) continue
        const element = items.current[index]
        if (!element) continue
        const { start, end } = edgesOf(element.getBoundingClientRect())
        if (position >= start && position <= end) return index
      }
      return -1
    },
    [edgesOf],
  )

  const proposedSlot = useCallback((delta: number, from: number): number => {
    const measured = metrics.current
    if (measured === null) return from
    return slotFor(measured, delta, from, countRef.current)
  }, [])

  const finish = useCallback((): void => {
    stopFrame()
    const { from, over, armed, dwellAt } = live.current
    apply(NO_DRAG)
    metrics.current = null
    document.body.style.removeProperty('cursor')
    document.body.style.removeProperty('user-select')

    if (from < 0) return

    // Before the dwell and the reorder: an item that left this list makes both moot.
    if (onDropAt?.(from, { x: pointerX.current, y: pointerY.current })) return

    if (armed && dwellAt !== null && dwellAt >= 0) {
      onDwell?.(from, dwellAt)
      return
    }
    if (over === from || over < 0) return

    // Let the item travel to its slot before rearranging the array, or it teleports.
    setSettlingFrom(from)
    onReorder(from, over)
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      setSettlingFrom(null)
      settleTimer.current = null
    }, SETTLE_MS)
  }, [apply, onDropAt, onDwell, onReorder, stopFrame])

  // Its own animation loop: a pointer held still near the edge sends no events.
  const followEdges = useCallback((): void => {
    frame.current = requestAnimationFrame(followEdges)
    if (live.current.from < 0) return

    const box = scroller.current
    const viewport = axis === 'x' ? window.innerWidth : window.innerHeight
    const bounds = box ? edgesOf(box.getBoundingClientRect()) : { start: 0, end: viewport }
    const position = along({ x: pointerX.current, y: pointerY.current })

    // Cross-axis scrolling moves another surface, so it changes no slot here.
    const sideways = crossScroller.current
    if (sideways !== null) {
      const crossBounds = crossEdgesOf(sideways.getBoundingClientRect())
      const crossAt = across({ x: pointerX.current, y: pointerY.current })
      let crossSpeed = 0
      if (crossAt < crossBounds.start + EDGE_PX) {
        crossSpeed = -((crossBounds.start + EDGE_PX - crossAt) / EDGE_PX) * MAX_SPEED_PX
      } else if (crossAt > crossBounds.end - EDGE_PX) {
        crossSpeed = ((crossAt - (crossBounds.end - EDGE_PX)) / EDGE_PX) * MAX_SPEED_PX
      }
      if (crossSpeed !== 0) {
        const clampedCross = Math.max(-MAX_SPEED_PX, Math.min(MAX_SPEED_PX, crossSpeed))
        if (axis === 'x') sideways.scrollTop += clampedCross
        else sideways.scrollLeft += clampedCross
      }
    }

    let speed = 0
    if (position < bounds.start + EDGE_PX) {
      speed = -((bounds.start + EDGE_PX - position) / EDGE_PX) * MAX_SPEED_PX
    } else if (position > bounds.end - EDGE_PX) {
      speed = ((position - (bounds.end - EDGE_PX)) / EDGE_PX) * MAX_SPEED_PX
    }
    if (speed === 0) return

    const clamped = Math.max(-MAX_SPEED_PX, Math.min(MAX_SPEED_PX, speed))
    if (box) {
      if (axis === 'x') box.scrollLeft += clamped
      else box.scrollTop += clamped
    } else if (axis === 'x') window.scrollBy(clamped, 0)
    else window.scrollBy(0, clamped)

    // The items moved under a still pointer, so recompute the proposal.
    const measured = metrics.current
    if (measured === null) return
    for (let i = 0; i < measured.starts.length; i += 1) {
      const startAt = measured.starts[i]
      const endAt = measured.ends[i]
      if (startAt !== undefined) measured.starts[i] = startAt - clamped
      if (endAt !== undefined) measured.ends[i] = endAt - clamped
    }
    origin.current -= clamped
    const delta = position - origin.current
    const over = proposedSlot(delta, live.current.from)
    // The containers moved too.
    const into = onOver
      ? onOver(live.current.from, { x: pointerX.current, y: pointerY.current })
      : null
    if (
      delta !== live.current.delta ||
      over !== live.current.over ||
      into !== live.current.into
    ) {
      apply({ ...live.current, delta, over, into })
    }
  }, [across, along, apply, axis, crossEdgesOf, edgesOf, onOver, proposedSlot])

  const onPointerMove = useCallback(
    (event: PointerEvent): void => {
      if (live.current.from < 0) return
      pointerY.current = event.clientY
      pointerX.current = event.clientX
      const from = live.current.from
      const position = along({ x: event.clientX, y: event.clientY })
      const delta = position - origin.current
      const over = proposedSlot(delta, from)
      const into = onOver ? onOver(from, { x: event.clientX, y: event.clientY }) : null
      const cross = followAcross
        ? across({ x: event.clientX, y: event.clientY }) - originAcross.current
        : 0

      // Travelling cancels any dwell and restores the reorder proposal.
      if (Math.abs(position - stillAlong.current) > STILL_PX) {
        stillAlong.current = position
        stillAt.current = event.timeStamp
        apply({ ...live.current, delta, over, into, cross, dwellAt: null, armed: false })
        return
      }

      // Inside a container there is nothing to dwell towards.
      if (into !== null) {
        apply({ ...live.current, delta, over, into, cross, dwellAt: null, armed: false })
        return
      }

      if (!onDwell) {
        apply({ ...live.current, delta, over, into, cross })
        return
      }

      const resting = event.timeStamp - stillAt.current
      const target = itemUnderPointer(position, from)
      const armed = resting >= dwellMs && target >= 0
      const dwellAt = target >= 0 && resting > 90 ? target : null

      if (
        delta !== live.current.delta ||
        over !== live.current.over ||
        into !== live.current.into ||
        cross !== live.current.cross ||
        dwellAt !== live.current.dwellAt ||
        armed !== live.current.armed
      ) {
        apply({ ...live.current, delta, over, into, cross, dwellAt, armed })
      }
    },
    [across, along, apply, dwellMs, followAcross, itemUnderPointer, onDwell, onOver, proposedSlot],
  )

  // The dwell must arm on a still pointer, which sends no events, so it runs on a timer.
  useEffect(() => {
    if (drag.from < 0 || !onDwell) return
    if (drag.armed) return
    const id = window.setInterval(() => {
      if (live.current.from < 0 || live.current.armed) return
      if (live.current.into !== null) return
      const resting = performance.now() - stillAt.current
      const target = itemUnderPointer(
        along({ x: pointerX.current, y: pointerY.current }),
        live.current.from,
      )
      if (target < 0) {
        if (live.current.dwellAt !== null) apply({ ...live.current, dwellAt: null })
        return
      }
      if (resting >= dwellMs) apply({ ...live.current, dwellAt: target, armed: true })
      else if (resting > 90 && live.current.dwellAt !== target) {
        apply({ ...live.current, dwellAt: target })
      }
    }, 60)
    return () => {
      window.clearInterval(id)
    }
  }, [along, apply, drag.armed, drag.from, dwellMs, itemUnderPointer, onDwell])

  useEffect(() => {
    if (drag.from < 0) return

    function onUp(): void {
      finish()
    }
    function onKey(event: KeyboardEvent): void {
      // Escape abandons the whole gesture.
      if (event.key === 'Escape') release()
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [drag.from, finish, onPointerMove, release])

  useEffect(() => {
    return () => {
      stopFrame()
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current)
    }
  }, [stopFrame])

  // A drag that outlives its list would reorder meaningless indexes.
  useEffect(() => {
    if (live.current.from >= count) release()
  }, [count, release])

  const begin = useCallback(
    (index: number, startY: number, startX: number): void => {
      const starts: number[] = []
      const ends: number[] = []
      for (let i = 0; i < countRef.current; i += 1) {
        const element = items.current[i]
        const edges = element ? edgesOf(element.getBoundingClientRect()) : null
        starts.push(edges ? edges.start : 0)
        ends.push(edges ? edges.end : 0)
      }
      const own = (ends[index] ?? 0) - (starts[index] ?? 0)
      const after = index + 1 < countRef.current ? starts[index + 1] : undefined
      const gap = after === undefined ? 0 : Math.max(0, after - (ends[index] ?? 0))
      metrics.current = { starts, ends, stride: own + gap }

      // The nearest ancestor that scrolls along this axis.
      let node = items.current[index]?.parentElement ?? null
      scroller.current = null
      while (node) {
        const style = getComputedStyle(node)
        const overflow = axis === 'x' ? style.overflowX : style.overflowY
        const overflows =
          axis === 'x'
            ? node.scrollWidth > node.clientWidth
            : node.scrollHeight > node.clientHeight
        if ((overflow === 'auto' || overflow === 'scroll') && overflows) {
          scroller.current = node
          break
        }
        node = node.parentElement
      }

      // The same walk across the axis; the nearest scroller there is a different ancestor.
      crossScroller.current = null
      if (crossAxis) {
        let sideways = items.current[index]?.parentElement ?? null
        while (sideways) {
          const style = getComputedStyle(sideways)
          const overflow = axis === 'x' ? style.overflowY : style.overflowX
          const overflows =
            axis === 'x'
              ? sideways.scrollHeight > sideways.clientHeight
              : sideways.scrollWidth > sideways.clientWidth
          if ((overflow === 'auto' || overflow === 'scroll') && overflows) {
            crossScroller.current = sideways
            break
          }
          sideways = sideways.parentElement
        }
      }

      onLift?.()
      origin.current = along({ x: startX, y: startY })
      originAcross.current = across({ x: startX, y: startY })
      pointerY.current = startY
      pointerX.current = startX
      stillAlong.current = origin.current
      stillAt.current = performance.now()
      document.body.style.setProperty('cursor', 'grabbing')
      document.body.style.setProperty('user-select', 'none')
      apply({
        from: index,
        over: index,
        delta: 0,
        dwellAt: null,
        armed: false,
        into: null,
        cross: 0,
      })
      stopFrame()
      frame.current = requestAnimationFrame(followEdges)
    },
    [across, along, apply, axis, edgesOf, followEdges, onLift, stopFrame],
  )

  // Commit on first movement, not on pointerdown, so a still press stays a tap. The engine
  // reports `onTap`, because once a drag starts a plain `onClick` lands on the wrong element.
  const watchForLift = useCallback(
    (index: number, startX: number, startY: number, onTap?: () => void): void => {
      let lifted = false
      function watch(move: PointerEvent): void {
        if (lifted) {
          // Forward moves after the lift: the engine's own listener attaches one render later, and a
          // fast programmatic drag could finish before it.
          onPointerMove(move)
          return
        }
        if (
          Math.abs(move.clientY - startY) < LIFT_PX &&
          Math.abs(move.clientX - startX) < LIFT_PX
        ) {
          return
        }
        lifted = true
        begin(index, move.clientY, move.clientX)
      }
      function ended(): void {
        stop()
        if (!lifted) {
          onTap?.()
          return
        }
        // The release too, for the same gap. Safe twice: `finish` clears the drag first.
        finish()
      }
      // A cancel in the same gap must end the lift, or the item stays carried (AC-227).
      function cancelled(): void {
        stop()
        if (lifted) finish()
      }
      // Block native drag for the gesture: folder rows are anchors, and a native drag fires
      // `pointercancel` and kills the gesture (AC-227).
      function suppressNativeDrag(event: Event): void {
        event.preventDefault()
      }
      function stop(): void {
        window.removeEventListener('pointermove', watch)
        window.removeEventListener('pointerup', ended)
        window.removeEventListener('pointercancel', cancelled)
        window.removeEventListener('dragstart', suppressNativeDrag, true)
      }
      window.addEventListener('pointermove', watch)
      window.addEventListener('pointerup', ended)
      window.addEventListener('pointercancel', cancelled)
      window.addEventListener('dragstart', suppressNativeDrag, true)
    },
    [begin, finish, onPointerMove],
  )

  // Up/Down for a column, Left/Right for a strip.
  const [back, forward] =
    axis === 'x' ? (['ArrowLeft', 'ArrowRight'] as const) : (['ArrowUp', 'ArrowDown'] as const)

  const arrowKeys = useCallback(
    (index: number) =>
      (event: ReactKeyboardEvent): void => {
        if (disabled) return
        const to =
          event.key === back ? index - 1 : event.key === forward ? index + 1 : null
        if (to === null || to < 0 || to >= countRef.current) return
        event.preventDefault()
        event.stopPropagation()
        onReorder(index, to)
        focusWanted.current = to
        setAnnouncement(
          describe
            ? `${describe(index)}, position ${String(to + 1)} of ${String(countRef.current)}`
            : '',
        )
      },
    [back, describe, disabled, forward, onReorder],
  )

  // An explicit grip: everything on it is the drag.
  const handleProps = useCallback(
    (index: number) => ({
      'data-sort-handle': true,
      // Stop touch panning from competing with the drag.
      style: { touchAction: 'none' as const },
      onPointerDown: (event: ReactPointerEvent): void => {
        if (disabled || event.button !== 0) return
        event.stopPropagation()
        watchForLift(index, event.clientX, event.clientY)
      },
      onKeyDown: arrowKeys(index),
    }),
    [arrowKeys, disabled, watchForLift],
  )

  // The whole row as the drag surface; a press on a control inside it stays the control's.
  const surfaceProps = useCallback(
    (index: number, onTap?: () => void) => ({
      onPointerDown: (event: ReactPointerEvent): void => {
        if (disabled || event.button !== 0) return
        const target = event.target as HTMLElement | null
        const control = target?.closest(
          "button, a, input, textarea, select, [contenteditable='true'], [role='menuitem'], [role='menuitemradio'], [data-no-drag]",
        )
        if (control) {
          // `data-drag-through` arms the lift but leaves a still press to the control, so a row-wide
          // title can still be dragged (AC-278).
          if (control.matches("[data-drag-through]")) {
            watchForLift(index, event.clientX, event.clientY)
          }
          return
        }
        watchForLift(index, event.clientX, event.clientY, onTap)
      },
    }),
    [disabled, watchForLift],
  )

  // Focus follows the moved item: the item itself if it is the handle (a tab), else the
  // handle inside it.
  useEffect(() => {
    const wanted = focusWanted.current
    if (wanted === null) return
    focusWanted.current = null
    const element = items.current[wanted]
    if (element === null || element === undefined) return
    const target = element.matches('[data-sort-handle]')
      ? element
      : element.querySelector<HTMLElement>('[data-sort-handle]')
    target?.focus()
  })

  const itemState = useCallback(
    (index: number): SortableItemState => {
      if (settlingFrom !== null) {
        return { ...RESTING, isSettling: true, isActive: index === settlingFrom }
      }
      const { from, over, delta, dwellAt, armed, into, cross } = drag
      if (from < 0) return RESTING
      const measured = metrics.current

      if (index === from) {
        return {
          isActive: true,
          isTarget: false,
          isDwelling: dwellAt !== null,
          isArmed: armed,
          offset: delta,
          crossOffset: cross,
          isSettling: false,
        }
      }

      const target = dwellAt === index
      // Armed, or inside another container, means no slot is held open here.
      const offset =
        !armed && into === null && measured !== null
          ? offsetFor(index, from, over, measured.stride)
          : 0

      return {
        isActive: false,
        isTarget: target && armed,
        isDwelling: target && !armed,
        isArmed: target && armed,
        offset,
        crossOffset: 0,
        isSettling: false,
      }
    },
    [drag, settlingFrom],
  )

  return {
    setItemRef,
    handleProps,
    surfaceProps,
    itemState,
    isDragging: drag.from >= 0,
    activeIndex: drag.from >= 0 ? drag.from : null,
    overKey: drag.into,
    announcement,
    dwellMs,
  }
}
