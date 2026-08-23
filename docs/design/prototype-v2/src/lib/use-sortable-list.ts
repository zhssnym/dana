/*
Pointer-driven sorting for the lab's reorderable lists: the task list, a
card's steps, and a card's blocks.

It replaces the HTML5 drag-and-drop the first version used. That API was the
reason the gesture never felt finished, and the faults were its own rather
than ours: the drag image is a translucent snapshot the browser composites and
we cannot style, `dragleave` fires when the pointer crosses onto a child so
the highlight flickers, there is no auto-scroll, and none of it exists on
touch at all. What it gave in return was a drop target, which is the least
interesting half of the problem.

What a person actually needs to see is where the thing will land, and the way
to show that is to move the list rather than to outline a row. So: the row you
picked up follows the pointer exactly, the rows it passes slide out of its way
by exactly its own height, and on release it settles into the gap they left.
Nothing is outlined, because nothing needs to be — the space is the answer.

Two gestures share the one drag, and stillness is what separates them. Moving
means reorder. Resting on a row for `dwellMs` means make a folder of the two,
and while that is arming the list relaxes back to its resting order, because a
list still shifting for a reorder you are no longer proposing is a list that
is lying about what will happen. See DES-103; the folder half needs a backend
and is not approved.

Keyboard sorting is here too, since a gesture only available to a mouse is not
finished. The handle is a real button: arrows move the item, and focus follows
it so the next press keeps working.
*/

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"

/* A press travels this far before it becomes a drag, so a click on the handle
   is still a click and a thumb resting on the row does not start moving it. */
const LIFT_PX = 4
/* How still a pointer has to be to count as resting rather than travelling. */
const STILL_PX = 6
/* How near the edge of the scroller the pointer gets before it follows, and
   how fast it may follow at the very edge. */
const EDGE_PX = 72
const MAX_SPEED_PX = 16

export interface SortableItemState {
  /* The row you picked up. It follows the pointer and casts a shadow. */
  isActive: boolean
  /* The row a release would merge with. Only ever set while dwelling. */
  isTarget: boolean
  /* Resting on this row; the bar is filling. */
  isDwelling: boolean
  /* The bar filled. Releasing now makes a folder rather than reordering. */
  isArmed: boolean
  /* Pixels to shift by, to make or fill space. */
  offset: number
  /* True for the one frame band after release, while the row travels to its
     new slot. Transforms transition during it and snap instantly otherwise. */
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

interface Metrics {
  /* Where every row was when the drag began, in viewport coordinates. */
  tops: number[]
  bottoms: number[]
  /* The picked-up row's height plus the gap below it: exactly how far every
     row it passes has to move. */
  stride: number
}

interface DragSnapshot {
  from: number
  over: number
  /* Pixels the active row has travelled from where it started. */
  delta: number
  dwellAt: number | null
  armed: boolean
  /* The container the pointer is inside, when the list is being told there is
     one. Null means the proposal is an ordinary slot in this list. */
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

export interface UseSortableListOptions {
  count: number
  onReorder: (from: number, to: number) => void
  /* Omit and the dwell never arms, which is what the card's blocks want:
     they only ever change places. */
  onDwell?: (from: number, to: number) => void
  dwellMs?: number
  disabled?: boolean
  /* Called the moment a press becomes a drag. The task row needs it: a
     press-and-hold there starts selecting, and without this the selection
     would arm itself 400ms into a drag that had already begun. */
  onLift?: () => void
  /* Announced to screen readers after a keyboard move. */
  describe?: (index: number) => string
  /*
  Where the drag was let go, offered before this list reorders itself.

  A list can only sort what it holds, and a folder page holds one list per
  section — so dragging a task from "Venue & vendors" into "Invitations" had
  nowhere to land, because the two lists cannot see each other. This is the
  seam that lets them: the page hit-tests the release point against its own
  sections and, if the task belongs somewhere else now, says so by returning
  `true` and the list leaves its own order alone.

  Deliberately a question rather than a command — the list still owns sorting
  within itself, and only the page knows what else is on it.
  */
  onDropAt?: (from: number, point: { x: number; y: number }) => boolean
  /*
  The same question, asked while the drag is still in the air.

  `onDropAt` was F5's answer to "this went somewhere else", and it is only
  half of one: it settles what happens on release and says nothing before it.
  A row on its way into another container went on being drawn as a slot in
  this one, and the list held a gap open for something that was never going to
  land there. A list that lies about what a release will do is worse than one
  that cannot do it at all.

  So this is asked as the pointer moves. Returning a key means the pointer is
  inside something: the list stops proposing a slot, the dwell stops arming,
  and the key comes back as `overKey` for whoever draws that container to
  answer with. Returning null puts the ordinary reorder back.

  Two seams rather than one, because the two questions have different costs —
  what a drag *would* do has to be cheap enough to ask sixty times a second,
  and what it *did* is allowed to change the world.
  */
  onOver?: (from: number, point: { x: number; y: number }) => string | null
}

export function useSortableList({
  count,
  onReorder,
  onDwell,
  dwellMs = 1500,
  disabled = false,
  onLift,
  describe,
  onDropAt,
  onOver,
}: UseSortableListOptions) {
  const [drag, setDrag] = useState<DragSnapshot>(NO_DRAG)
  const [settlingFrom, setSettlingFrom] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState("")

  /* Every value a pointer handler reads lives in a ref as well as in state.
     Handlers fire far more often than React re-renders, and one that closes
     over `drag` reads whatever it held when the handler was made — which is
     the bug that drops a row one place off, roughly one time in five. */
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
    (index: number) => (element: HTMLElement | null) => {
      items.current[index] = element
    },
    [],
  )

  /* --------------------------------------------------------------- drag -- */

  const apply = useCallback((next: DragSnapshot) => {
    live.current = next
    setDrag(next)
  }, [])

  const stopFrame = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [])

  /* Where a row sits right now, transform included, which is what the pointer
     is actually over. Hit-testing the rects we measured at drag start would
     be testing against a layout the person can no longer see. */
  const rowUnderPointer = useCallback((y: number, exclude: number) => {
    for (let index = 0; index < items.current.length; index += 1) {
      if (index === exclude) continue
      const element = items.current[index]
      if (!element) continue
      const rect = element.getBoundingClientRect()
      if (y >= rect.top && y <= rect.bottom) return index
    }
    return -1
  }, [])

  /* Which slot the picked-up row is currently proposing. Its own centre
     against the midpoint of every other row, using the geometry from drag
     start, because that is the order being rearranged. */
  const slotFor = useCallback((delta: number, from: number) => {
    const m = metrics.current
    if (!m) return from
    const centre = (m.tops[from] + m.bottoms[from]) / 2 + delta
    let slot = from
    for (let index = 0; index < countRef.current; index += 1) {
      if (index === from) continue
      const mid = (m.tops[index] + m.bottoms[index]) / 2
      if (index < from && centre < mid) return index
      if (index > from && centre > mid) slot = index
    }
    return slot
  }, [])

  const finish = useCallback(() => {
    stopFrame()
    const { from, over, armed, dwellAt } = live.current
    apply(NO_DRAG)
    metrics.current = null
    document.body.style.removeProperty("cursor")
    document.body.style.removeProperty("user-select")

    if (from < 0) return

    /* Asked before the dwell and before the reorder, because "this went
       somewhere else" outranks both: neither a folder proposal nor a slot in
       this list means anything once the row has left it. */
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
    }, 220)
  }, [apply, onDropAt, onDwell, onReorder, stopFrame])

  /* Auto-scroll. Runs as its own loop rather than off pointermove, because a
     pointer held still near the edge stops sending events and the list would
     stop following exactly when somebody is waiting for it to. */
  const followEdges = useCallback(() => {
    frame.current = requestAnimationFrame(followEdges)
    if (live.current.from < 0) return

    const box = scroller.current
    const top = box ? box.getBoundingClientRect().top : 0
    const bottom = box ? box.getBoundingClientRect().bottom : window.innerHeight
    const y = pointerY.current

    let speed = 0
    if (y < top + EDGE_PX) speed = -((top + EDGE_PX - y) / EDGE_PX) * MAX_SPEED_PX
    else if (y > bottom - EDGE_PX) speed = ((y - (bottom - EDGE_PX)) / EDGE_PX) * MAX_SPEED_PX
    if (speed === 0) return

    const clamped = Math.max(-MAX_SPEED_PX, Math.min(MAX_SPEED_PX, speed))
    if (box) box.scrollTop += clamped
    else window.scrollBy(0, clamped)

    /* The rows moved under a pointer that did not, so the proposal changes
       even though nothing was dragged. Recompute against the new scroll. */
    const m = metrics.current
    if (!m) return
    const shift = clamped
    for (let i = 0; i < m.tops.length; i += 1) {
      m.tops[i] -= shift
      m.bottoms[i] -= shift
    }
    originY.current -= shift
    const delta = pointerY.current - originY.current
    const over = slotFor(delta, live.current.from)
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
  }, [apply, onOver, slotFor])

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (live.current.from < 0) return
      pointerY.current = event.clientY
      pointerX.current = event.clientX
      const from = live.current.from
      const delta = event.clientY - originY.current
      const over = slotFor(delta, from)
      const into = onOver ? onOver(from, { x: event.clientX, y: event.clientY }) : null

      /* Travelling cancels any dwell and restores the reorder proposal. */
      if (Math.abs(event.clientY - stillY.current) > STILL_PX) {
        stillY.current = event.clientY
        stillAt.current = event.timeStamp
        apply({ ...live.current, delta, over, into, dwellAt: null, armed: false })
        return
      }

      /* Inside a container, there is nothing to dwell towards: the proposal
         is already "in there", and a ring closing on top of it would be two
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
    [apply, dwellMs, onDwell, onOver, rowUnderPointer, slotFor],
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
    return () => window.clearInterval(id)
  }, [apply, drag.armed, drag.from, dwellMs, onDwell, rowUnderPointer])

  useEffect(() => {
    if (drag.from < 0) return

    function onUp() {
      finish()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      /* Escape abandons the whole gesture: no reorder, no folder. */
      stopFrame()
      apply(NO_DRAG)
      metrics.current = null
      document.body.style.removeProperty("cursor")
      document.body.style.removeProperty("user-select")
    }

    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      window.removeEventListener("keydown", onKey)
    }
  }, [apply, drag.from, finish, onPointerMove, stopFrame])

  useEffect(() => {
    return () => {
      stopFrame()
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current)
    }
  }, [stopFrame])

  /* A drag that outlives the list it was sorting would be reordering indexes
     that no longer mean anything. */
  useEffect(() => {
    if (live.current.from >= count) {
      stopFrame()
      apply(NO_DRAG)
      metrics.current = null
    }
  }, [apply, count, stopFrame])

  const begin = useCallback(
    (index: number, startY: number, startX: number) => {
      const tops: number[] = []
      const bottoms: number[] = []
      for (let i = 0; i < countRef.current; i += 1) {
        const rect = items.current[i]?.getBoundingClientRect()
        tops.push(rect ? rect.top : 0)
        bottoms.push(rect ? rect.bottom : 0)
      }
      const own = bottoms[index] - tops[index]
      const gap =
        index + 1 < countRef.current ? Math.max(0, tops[index + 1] - bottoms[index]) : 0
      metrics.current = { tops, bottoms, stride: own + gap }

      /* The nearest ancestor that actually scrolls, so a list inside a card
         follows its own box rather than the page behind it. */
      let node = items.current[index]?.parentElement ?? null
      scroller.current = null
      while (node) {
        const overflow = getComputedStyle(node).overflowY
        if (
          (overflow === "auto" || overflow === "scroll") &&
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
      document.body.style.setProperty("cursor", "grabbing")
      document.body.style.setProperty("user-select", "none")
      apply({ from: index, over: index, delta: 0, dwellAt: null, armed: false, into: null })
      stopFrame()
      frame.current = requestAnimationFrame(followEdges)
    },
    [apply, followEdges, onLift, stopFrame],
  )

  /* The press-then-travel watcher both entry points share. Committing on the
     first movement rather than on pointerdown is what lets a row still be
     clicked, a title still be selected, and a handle still take focus. */
  /*
  A press on the row's own surface is ambiguous until it ends: move far enough
  and it is a drag, let go without moving and it was a tap. The engine is the
  only thing that knows which, so it is the engine that reports it.

  This exists because a plain `onClick` on the row cannot work. The press is
  already being tracked here, and once a lift begins the pointer is captured,
  so the browser's click lands on the capturing element rather than on
  whatever was under the cursor — a row that opened on click would open
  sometimes and not others, which is worse than not opening at all. Resolving
  the gesture where it is tracked makes tap and drag one decision instead of
  two racing ones.

  `onTap` therefore fires only for a press that stayed still, on the row's
  surface, and never for one that became a drag.
  */
  const watchForLift = useCallback(
    (index: number, startX: number, startY: number, onTap?: () => void) => {
      let lifted = false
      function watch(move: PointerEvent) {
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
      function release() {
        stop()
        if (!lifted) onTap?.()
      }
      function stop() {
        window.removeEventListener("pointermove", watch)
        window.removeEventListener("pointerup", release)
        window.removeEventListener("pointercancel", stop)
      }
      window.addEventListener("pointermove", watch)
      window.addEventListener("pointerup", release)
      window.addEventListener("pointercancel", stop)
    },
    [begin],
  )

  const arrowKeys = useCallback(
    (index: number) => (event: ReactKeyboardEvent) => {
      if (disabled) return
      const to =
        event.key === "ArrowUp" ? index - 1 : event.key === "ArrowDown" ? index + 1 : null
      if (to === null || to < 0 || to >= countRef.current) return
      event.preventDefault()
      event.stopPropagation()
      onReorder(index, to)
      focusWanted.current = to
      setAnnouncement(
        describe ? `${describe(index)}, position ${to + 1} of ${countRef.current}` : "",
      )
    },
    [describe, disabled, onReorder],
  )

  /* An explicit grip. Everything on it is the drag, so there is nothing to
     guard against. */
  const handleProps = useCallback(
    (index: number) => ({
      "data-sort-handle": true,
      /* The browser's own panning must not compete with the drag, or a touch
         gesture scrolls the page instead of moving the row. */
      style: { touchAction: "none" as const },
      onPointerDown: (event: ReactPointerEvent) => {
        if (disabled || event.button !== 0) return
        event.stopPropagation()
        watchForLift(index, event.clientX, event.clientY)
      },
      onKeyDown: arrowKeys(index),
    }),
    [arrowKeys, disabled, watchForLift],
  )

  /* The whole row as the drag surface, which is what the task list wants: the
     thing you move is the thing you grabbed, and no new affordance had to be
     invented for it.

     The guard is the whole trick. A press that lands on a control belongs to
     that control — a chip opens its picker, a title starts renaming, a
     checkbox ticks — and only a press on the row itself becomes a drag. */
  const surfaceProps = useCallback(
    (index: number, onTap?: () => void) => ({
      onPointerDown: (event: ReactPointerEvent) => {
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
    const handle = items.current[wanted]?.querySelector<HTMLElement>("[data-sort-handle]")
    handle?.focus()
  })

  const itemState = useCallback(
    (index: number): SortableItemState => {
      if (settlingFrom !== null) {
        return { ...RESTING, isSettling: true, isActive: index === settlingFrom }
      }
      const { from, over, delta, dwellAt, armed, into } = drag
      if (from < 0) return RESTING
      const m = metrics.current

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
      /* Armed means the proposal is a folder, not a slot, so the list stops
         holding a space open for something that is no longer going there.
         Being inside another container is the same statement, made about a
         place rather than about a pair. */
      let offset = 0
      if (!armed && into === null && m) {
        if (over > from && index > from && index <= over) offset = -m.stride
        else if (over < from && index >= over && index < from) offset = m.stride
      }

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
    /* Whichever container `onOver` last named, for drawing it as the answer.
       Null whenever the proposal is an ordinary slot. */
    overKey: drag.into,
    /* Fed to an aria-live region so a keyboard move is heard, not just seen. */
    announcement,
    dwellMs,
  }
}
