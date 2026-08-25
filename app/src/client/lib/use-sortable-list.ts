/*
The designer's `src/lib/use-sortable-list.ts`, ported at S11.

**One drag engine, total.** RFC 0004's S11 row says so in its acceptance
column, and the reason is 11.15's task-row hazard one axis over: the sidebar's
arrangement, a list's rows, a board's cards, a card's steps and a page's blocks
are five surfaces asking one question, and five answers to it drift apart the
week after they are written. The S9 close moved DES-171's sidebar drag here
rather than let it build a second engine for this one to replace.

What the engine is for, in the designer's own reasoning: HTML5 drag-and-drop
gives you a drop target, which is the least interesting half of the problem.
What a person needs to see is where the thing will land, so the row picked up
follows the pointer exactly, the rows it passes slide out of its way by its own
height, and on release it settles into the gap they left. Nothing is outlined,
because the space is the answer.

Two gestures share the one drag and stillness separates them (DES-103,
DES-171). Travelling proposes a slot. Resting on a row for `dwellMs` proposes
that the two become a container, and while that arms the list relaxes back to
its resting order, because a list still shifting for a reorder nobody is
proposing is a list lying about what a release will do. Resting inside another
container proposes that container instead, through `onOver`.

Keyboard sorting is here too, since a gesture only available to a mouse is not
finished: the handle is a real button, arrows move the item, and focus follows
it so the next press keeps working.

**Four differences from his file, and nothing else moves.**

1. Protocol section 7's prose rules, which are this repository's and not his:
   no em dashes in a Dana comment, and this repository's quoting and semicolon
   style. The sentences are otherwise his.
2. `noUncheckedIndexedAccess`. His file indexes its measurement arrays freely,
   which is safe there and does not compile here, so every read is guarded and
   an unmeasured row makes the engine decline to move rather than be read as
   sitting at zero, where it would capture every proposal in the list.
3. **The geometry is lifted out of the hook as three pure functions**, exported
   and unit-tested beside this file. This repository has no component test leg
   (`tsconfig.client.json` anticipates one and nothing has written it), so a
   hook's arithmetic is otherwise measured by nothing at all, and the slot
   arithmetic is the half of this module that is easiest to get wrong.
   The hook calls them; they hold no state and know nothing about React.
4. The two escape paths that were written out twice, the Escape key's and the
   shrinking list's, are one `release` here. His file repeated four lines in
   both places, which is how the two come to disagree about what abandoning a
   drag clears.

The seams `onDropAt` and `onOver` are his, and DES-171 names both: a directory
holds one list per container, so a row on its way into another one has to stop
being drawn as a slot in the list it is leaving.
*/

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

/* A press travels this far before it becomes a drag, so a click on the handle
   is still a click and a thumb resting on the row does not start moving it. */
const LIFT_PX = 4
/* How still a pointer has to be to count as resting rather than travelling. */
const STILL_PX = 6
/* How near the edge of the scroller the pointer gets before it follows, and
   how fast it may follow at the very edge. */
const EDGE_PX = 72
const MAX_SPEED_PX = 16
/* How long the dwell holds before it arms. DES-171: making a container is a
   larger act than using one, so it takes a deliberate hold. */
const DWELL_MS = 1500
/* The settle band: how long the carried row is given to travel to the slot the
   list has been holding open, before the array underneath it is rearranged. */
const SETTLE_MS = 220

export interface SortableItemState {
  /** The row you picked up. It follows the pointer and casts a shadow. */
  isActive: boolean
  /** The row a release would merge with. Only ever set while dwelling. */
  isTarget: boolean
  /** Resting on this row; the bar is filling. */
  isDwelling: boolean
  /** The bar filled. Releasing now makes a container rather than reordering. */
  isArmed: boolean
  /** Pixels to shift by, to make or fill space. */
  offset: number
  /**
   * True for the one frame band after release, while the row travels to its
   * new slot. Transforms transition during it and snap instantly otherwise.
   */
  isSettling: boolean
}

const RESTING: SortableItemState = {
  isActive: false,
  isTarget: false,
  isDwelling: false,
  isArmed: false,
  offset: 0,
  isSettling: false,
}

/** Where every row was when the drag began, in viewport coordinates. */
export interface Metrics {
  tops: number[]
  bottoms: number[]
  /**
   * The picked-up row's height plus the gap below it: exactly how far every
   * row it passes has to move.
   */
  stride: number
}

interface DragSnapshot {
  from: number
  over: number
  /** Pixels the active row has travelled from where it started. */
  delta: number
  dwellAt: number | null
  armed: boolean
  /**
   * The container the pointer is inside, when the list is being told there is
   * one. Null means the proposal is an ordinary slot in this list.
   */
  into: string | null
}

const NO_DRAG: DragSnapshot = {
  from: -1,
  over: -1,
  delta: 0,
  dwellAt: null,
  armed: false,
  into: null,
}

/* ------------------------------------------------------------ geometry -- */

/**
 * Which slot the picked-up row is currently proposing.
 *
 * Its own centre against the midpoint of every other row, using the geometry
 * from drag start, because that is the order being rearranged. A row whose
 * measurement is missing is skipped rather than read as sitting at zero: an
 * unmeasured row reads as being at the top of the viewport, where it would
 * capture every proposal the list makes.
 */
export function slotFor(
  metrics: Metrics,
  delta: number,
  from: number,
  count: number,
): number {
  const top = metrics.tops[from]
  const bottom = metrics.bottoms[from]
  if (top === undefined || bottom === undefined) return from
  const centre = (top + bottom) / 2 + delta
  let slot = from
  for (let index = 0; index < count; index += 1) {
    if (index === from) continue
    const otherTop = metrics.tops[index]
    const otherBottom = metrics.bottoms[index]
    if (otherTop === undefined || otherBottom === undefined) continue
    const mid = (otherTop + otherBottom) / 2
    if (index < from && centre < mid) return index
    if (index > from && centre > mid) slot = index
  }
  return slot
}

/**
 * How far a passed-over row shifts, to make or fill the space.
 *
 * Exactly one stride, and only for the rows between where the carried row
 * started and the slot it is proposing. Everything outside that span stays
 * where it is, which is what makes the gap read as one opening rather than as
 * a list drifting.
 */
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

/**
 * The list with the item at `from` moved to `to`.
 *
 * The reorder every caller ends up writing, kept here so that they do not each
 * write it. An index outside the list returns it unchanged rather than
 * dropping an item: a drag outliving the list it was sorting is a thing that
 * happens, and losing a row to it is not an acceptable answer.
 */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return [...list]
  const next = [...list]
  const carried = next.splice(from, 1)[0]
  if (carried === undefined) return [...list]
  next.splice(to, 0, carried)
  return next
}

/* ---------------------------------------------------------------- hook -- */

export interface UseSortableListOptions {
  count: number
  onReorder: (from: number, to: number) => void
  /**
   * Omit and the dwell never arms, which is what a card's blocks want: they
   * only ever change places.
   */
  onDwell?: (from: number, to: number) => void
  dwellMs?: number
  disabled?: boolean
  /**
   * Called the moment a press becomes a drag. The task row needs it: a
   * press-and-hold there starts selecting, and without this the selection
   * would arm itself 400ms into a drag that had already begun.
   */
  onLift?: () => void
  /** Announced to screen readers after a keyboard move. */
  describe?: (index: number) => string
  /**
   * Where the drag was let go, offered before this list reorders itself.
   *
   * A list can only sort what it holds, and a directory holds one list per
   * container, so dragging a folder from the loose column into a group has
   * nowhere to land: the two lists cannot see each other. This is the seam
   * that lets them. The owner hit-tests the release point against its own
   * containers and, if the row belongs somewhere else now, says so by
   * returning `true`, and the list leaves its own order alone.
   *
   * Deliberately a question rather than a command: the list still owns sorting
   * within itself, and only the owner knows what else is on the surface.
   */
  onDropAt?: (from: number, point: { x: number; y: number }) => boolean
  /**
   * The same question, asked while the drag is still in the air.
   *
   * `onDropAt` settles what happens on release and says nothing before it, so
   * a row on its way into another container went on being drawn as a slot in
   * this one and the list held a gap open for something that was never going
   * to land there. DES-171: a list that lies about what a release will do is
   * worse than one that cannot do it at all.
   *
   * Returning a key means the pointer is inside something: the list stops
   * proposing a slot, the dwell stops arming, and the key comes back as
   * `overKey` for whoever draws that container to answer with. Returning null
   * puts the ordinary reorder back.
   *
   * Two seams rather than one, because the two questions have different costs.
   * What a drag would do has to be cheap enough to ask sixty times a second,
   * and what it did is allowed to change the world.
   */
  onOver?: (from: number, point: { x: number; y: number }) => string | null
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
  /**
   * Whichever container `onOver` last named, for drawing it as the answer.
   * Null whenever the proposal is an ordinary slot.
   */
  overKey: string | null
  /** Fed to an aria-live region so a keyboard move is heard, not just seen. */
  announcement: string
  dwellMs: number
}

export function useSortableList({
  count,
  onReorder,
  onDwell,
  dwellMs = DWELL_MS,
  disabled = false,
  onLift,
  describe,
  onDropAt,
  onOver,
}: UseSortableListOptions): SortableList {
  const [drag, setDrag] = useState<DragSnapshot>(NO_DRAG)
  const [settlingFrom, setSettlingFrom] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')

  /* Every value a pointer handler reads lives in a ref as well as in state.
     Handlers fire far more often than React re-renders, and one that closes
     over `drag` reads whatever it held when the handler was made, which is the
     bug that drops a row one place off, roughly one time in five. */
  const live = useRef<DragSnapshot>(NO_DRAG)
  const metrics = useRef<Metrics | null>(null)
  const items = useRef<(HTMLElement | null)[]>([])
  const scroller = useRef<HTMLElement | null>(null)
  const pointerY = useRef(0)
  const pointerX = useRef(0)
  const originY = useRef(0)
  const stillAt = useRef(0)
  const stillY = useRef(0)
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

  /* Abandoning a drag without committing anything: Escape asks for it, and a
     list that shrank under one takes it too. */
  const release = useCallback((): void => {
    stopFrame()
    apply(NO_DRAG)
    metrics.current = null
    document.body.style.removeProperty('cursor')
    document.body.style.removeProperty('user-select')
  }, [apply, stopFrame])

  /* Where a row sits right now, transform included, which is what the pointer
     is actually over. Hit-testing the rects measured at drag start would be
     testing against a layout the person can no longer see. */
  const rowUnderPointer = useCallback((y: number, exclude: number): number => {
    for (let index = 0; index < items.current.length; index += 1) {
      if (index === exclude) continue
      const element = items.current[index]
      if (!element) continue
      const rect = element.getBoundingClientRect()
      if (y >= rect.top && y <= rect.bottom) return index
    }
    return -1
  }, [])

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

    /* Asked before the dwell and before the reorder, because "this went
       somewhere else" outranks both: neither a container proposal nor a slot
       in this list means anything once the row has left it. */
    if (onDropAt?.(from, { x: pointerX.current, y: pointerY.current })) return

    if (armed && dwellAt !== null && dwellAt >= 0) {
      onDwell?.(from, dwellAt)
      return
    }
    if (over === from || over < 0) return

    /* Let the row travel to the slot the list has been holding open, and only
       then rearrange the array underneath it. Committing first would teleport
       it, which undoes the one thing this whole module is for. */
    setSettlingFrom(from)
    onReorder(from, over)
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      setSettlingFrom(null)
      settleTimer.current = null
    }, SETTLE_MS)
  }, [apply, onDropAt, onDwell, onReorder, stopFrame])

  /* Auto-scroll. Runs as its own loop rather than off pointermove, because a
     pointer held still near the edge stops sending events and the list would
     stop following exactly when somebody is waiting for it to. */
  const followEdges = useCallback((): void => {
    frame.current = requestAnimationFrame(followEdges)
    if (live.current.from < 0) return

    const box = scroller.current
    const top = box ? box.getBoundingClientRect().top : 0
    const bottom = box ? box.getBoundingClientRect().bottom : window.innerHeight
    const y = pointerY.current

    let speed = 0
    if (y < top + EDGE_PX) speed = -((top + EDGE_PX - y) / EDGE_PX) * MAX_SPEED_PX
    else if (y > bottom - EDGE_PX) {
      speed = ((y - (bottom - EDGE_PX)) / EDGE_PX) * MAX_SPEED_PX
    }
    if (speed === 0) return

    const clamped = Math.max(-MAX_SPEED_PX, Math.min(MAX_SPEED_PX, speed))
    if (box) box.scrollTop += clamped
    else window.scrollBy(0, clamped)

    /* The rows moved under a pointer that did not, so the proposal changes
       even though nothing was dragged. Recompute against the new scroll. */
    const measured = metrics.current
    if (measured === null) return
    for (let i = 0; i < measured.tops.length; i += 1) {
      const topAt = measured.tops[i]
      const bottomAt = measured.bottoms[i]
      if (topAt !== undefined) measured.tops[i] = topAt - clamped
      if (bottomAt !== undefined) measured.bottoms[i] = bottomAt - clamped
    }
    originY.current -= clamped
    const delta = pointerY.current - originY.current
    const over = proposedSlot(delta, live.current.from)
    /* The containers moved too, so which one the pointer is in can change
       without the pointer having gone anywhere. */
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
  }, [apply, onOver, proposedSlot])

  const onPointerMove = useCallback(
    (event: PointerEvent): void => {
      if (live.current.from < 0) return
      pointerY.current = event.clientY
      pointerX.current = event.clientX
      const from = live.current.from
      const delta = event.clientY - originY.current
      const over = proposedSlot(delta, from)
      const into = onOver ? onOver(from, { x: event.clientX, y: event.clientY }) : null

      /* Travelling cancels any dwell and restores the reorder proposal. */
      if (Math.abs(event.clientY - stillY.current) > STILL_PX) {
        stillY.current = event.clientY
        stillAt.current = event.timeStamp
        apply({ ...live.current, delta, over, into, dwellAt: null, armed: false })
        return
      }

      /* Inside a container, there is nothing to dwell towards: the proposal is
         already "in there", and a ring closing on top of it would be two
         answers to one gesture. */
      if (into !== null) {
        apply({ ...live.current, delta, over, into, dwellAt: null, armed: false })
        return
      }

      if (!onDwell) {
        apply({ ...live.current, delta, over, into })
        return
      }

      const resting = event.timeStamp - stillAt.current
      const target = rowUnderPointer(event.clientY, from)
      const armed = resting >= dwellMs && target >= 0
      const dwellAt = target >= 0 && resting > 90 ? target : null

      if (
        delta !== live.current.delta ||
        over !== live.current.over ||
        into !== live.current.into ||
        dwellAt !== live.current.dwellAt ||
        armed !== live.current.armed
      ) {
        apply({ ...live.current, delta, over, into, dwellAt, armed })
      }
    },
    [apply, dwellMs, onDwell, onOver, proposedSlot, rowUnderPointer],
  )

  /* The dwell has to arm on a pointer that has stopped moving, and a pointer
     that has stopped moving sends no events. So the clock runs on its own. */
  useEffect(() => {
    if (drag.from < 0 || !onDwell) return
    if (drag.armed) return
    const id = window.setInterval(() => {
      if (live.current.from < 0 || live.current.armed) return
      if (live.current.into !== null) return
      const resting = performance.now() - stillAt.current
      const target = rowUnderPointer(pointerY.current, live.current.from)
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
  }, [apply, drag.armed, drag.from, dwellMs, onDwell, rowUnderPointer])

  useEffect(() => {
    if (drag.from < 0) return

    function onUp(): void {
      finish()
    }
    function onKey(event: KeyboardEvent): void {
      /* Escape abandons the whole gesture: no reorder, no container. */
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

  /* A drag that outlives the list it was sorting would be reordering indexes
     that no longer mean anything. */
  useEffect(() => {
    if (live.current.from >= count) release()
  }, [count, release])

  const begin = useCallback(
    (index: number, startY: number, startX: number): void => {
      const tops: number[] = []
      const bottoms: number[] = []
      for (let i = 0; i < countRef.current; i += 1) {
        const rect = items.current[i]?.getBoundingClientRect()
        tops.push(rect ? rect.top : 0)
        bottoms.push(rect ? rect.bottom : 0)
      }
      const own = (bottoms[index] ?? 0) - (tops[index] ?? 0)
      const below = index + 1 < countRef.current ? tops[index + 1] : undefined
      const gap = below === undefined ? 0 : Math.max(0, below - (bottoms[index] ?? 0))
      metrics.current = { tops, bottoms, stride: own + gap }

      /* The nearest ancestor that actually scrolls, so a list inside a card
         follows its own box rather than the page behind it. */
      let node = items.current[index]?.parentElement ?? null
      scroller.current = null
      while (node) {
        const overflow = getComputedStyle(node).overflowY
        if (
          (overflow === 'auto' || overflow === 'scroll') &&
          node.scrollHeight > node.clientHeight
        ) {
          scroller.current = node
          break
        }
        node = node.parentElement
      }

      onLift?.()
      originY.current = startY
      pointerY.current = startY
      pointerX.current = startX
      stillY.current = startY
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
      })
      stopFrame()
      frame.current = requestAnimationFrame(followEdges)
    },
    [apply, followEdges, onLift, stopFrame],
  )

  /*
  The press-then-travel watcher both entry points share. Committing on the
  first movement rather than on pointerdown is what lets a row still be
  clicked, a title still be selected, and a handle still take focus.

  A press on the row's own surface is ambiguous until it ends: move far enough
  and it is a drag, let go without moving and it was a tap. The engine is the
  only thing that knows which, so it is the engine that reports it.

  This exists because a plain `onClick` on the row cannot work. The press is
  already being tracked here, and once a lift begins the pointer is captured,
  so the browser's click lands on the capturing element rather than on whatever
  was under the cursor: a row that opened on click would open sometimes and not
  others, which is worse than not opening at all. Resolving the gesture where
  it is tracked makes tap and drag one decision instead of two racing ones.

  `onTap` therefore fires only for a press that stayed still, on the row's
  surface, and never for one that became a drag.
  */
  const watchForLift = useCallback(
    (index: number, startX: number, startY: number, onTap?: () => void): void => {
      let lifted = false
      function watch(move: PointerEvent): void {
        if (
          Math.abs(move.clientY - startY) < LIFT_PX &&
          Math.abs(move.clientX - startX) < LIFT_PX
        ) {
          return
        }
        lifted = true
        stop()
        begin(index, move.clientY, move.clientX)
      }
      function ended(): void {
        stop()
        if (!lifted) onTap?.()
      }
      function stop(): void {
        window.removeEventListener('pointermove', watch)
        window.removeEventListener('pointerup', ended)
        window.removeEventListener('pointercancel', stop)
      }
      window.addEventListener('pointermove', watch)
      window.addEventListener('pointerup', ended)
      window.addEventListener('pointercancel', stop)
    },
    [begin],
  )

  const arrowKeys = useCallback(
    (index: number) =>
      (event: ReactKeyboardEvent): void => {
        if (disabled) return
        const to =
          event.key === 'ArrowUp'
            ? index - 1
            : event.key === 'ArrowDown'
              ? index + 1
              : null
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
    [describe, disabled, onReorder],
  )

  /* An explicit grip. Everything on it is the drag, so there is nothing to
     guard against. */
  const handleProps = useCallback(
    (index: number) => ({
      'data-sort-handle': true,
      /* The browser's own panning must not compete with the drag, or a touch
         gesture scrolls the page instead of moving the row. */
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

  /* The whole row as the drag surface, which is what a task list wants: the
     thing you move is the thing you grabbed, and no new affordance had to be
     invented for it.

     The guard is the whole trick. A press that lands on a control belongs to
     that control, a chip opens its picker, a title starts renaming, a checkbox
     ticks, and only a press on the row itself becomes a drag. */
  const surfaceProps = useCallback(
    (index: number, onTap?: () => void) => ({
      onPointerDown: (event: ReactPointerEvent): void => {
        if (disabled || event.button !== 0) return
        const target = event.target as HTMLElement | null
        if (
          target?.closest(
            "button, a, input, textarea, select, [contenteditable='true'], [role='menuitem'], [role='menuitemradio'], [data-no-drag]",
          )
        ) {
          return
        }
        watchForLift(index, event.clientX, event.clientY, onTap)
      },
    }),
    [disabled, watchForLift],
  )

  /* Focus travels with the row. Without this the handle is left behind on
     whatever item slid into the old index, and the second arrow press moves
     the wrong thing. */
  useEffect(() => {
    const wanted = focusWanted.current
    if (wanted === null) return
    focusWanted.current = null
    const handle = items.current[wanted]?.querySelector<HTMLElement>('[data-sort-handle]')
    handle?.focus()
  })

  const itemState = useCallback(
    (index: number): SortableItemState => {
      if (settlingFrom !== null) {
        return { ...RESTING, isSettling: true, isActive: index === settlingFrom }
      }
      const { from, over, delta, dwellAt, armed, into } = drag
      if (from < 0) return RESTING
      const measured = metrics.current

      if (index === from) {
        return {
          isActive: true,
          isTarget: false,
          isDwelling: dwellAt !== null,
          isArmed: armed,
          offset: delta,
          isSettling: false,
        }
      }

      const target = dwellAt === index
      /* Armed means the proposal is a container, not a slot, so the list stops
         holding a space open for something that is no longer going there.
         Being inside another container is the same statement, made about a
         place rather than about a pair. */
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
