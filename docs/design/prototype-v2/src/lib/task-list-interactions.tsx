/*
Dragging and selecting rows in a list.

**Everything here is Lane 2 and must not reach `app/`.** It is drawn because
the register says a Lane 2 idea belongs in the prototype, marked, rather than
missing — "excluded from the port by that mark rather than by being
invisible". The entries that own each behaviour: DES-071 and DES-103 for
reordering and the folder gesture, DES-112 for what a selection can do,
DES-104 for turning a task into a folder.

It lives in its own module for exactly that reason. `task-row.tsx` is the
component that ports; this is a layer a list wraps around it, so the port is a
question of whether this file comes too, answered once, rather than a hunt
through a component for behaviour that should not travel.

The two gestures and why they are shaped this way:

- **Press and hold to select**, then tap to add — the gesture people already
  know from every messaging app. A hidden gesture is only affordable when it
  is one somebody already has.
- **Drag to reorder, hold 1.5s to group.** One gesture with two meanings, and
  a dwell separating them. A gesture that changes meaning after a delay is a
  hidden mode, so the target fills a bar over exactly the dwell and then says
  in words what releasing will do. If that bar is ever dropped, drop the
  feature with it.
*/

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react"
import { Check, Copy, FolderInput, Pin, Star, Trash2, X } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const DWELL_MS = 1500
const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const T_BASE = "duration-[var(--duration-base)] ease-[var(--ease-enter)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

export interface ListFolder {
  name: string
  color: string
}

interface Handlers {
  onReorder: (fromId: string, toId: string) => void
  onMergeIntoFolder: (ids: string[]) => void
  onBulk: (ids: string[], change: "complete" | "important" | "myday") => void
  onDuplicate: (ids: string[]) => void
  onDelete: (ids: string[]) => void
  onMoveToFolder: (ids: string[], folder: ListFolder) => void
  folders: ListFolder[]
}

/* The bar that makes the dwell visible. Mounted only while one is running, so
   its width transition starts from zero every time. */
function DwellBar() {
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-full"
    >
      <span
        className="block h-full rounded-full bg-[var(--color-dana-accent-600)]"
        style={{
          width: grown ? "100%" : "0%",
          transition: `width ${DWELL_MS}ms linear`,
        }}
      />
    </span>
  )
}

function BarAction({
  icon: Icon,
  label,
  onClick,
  tone = "neutral",
}: {
  icon: typeof Check
  label: string
  onClick: () => void
  tone?: "neutral" | "danger"
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            onClick={(event) => {
              event.stopPropagation()
              onClick()
            }}
            className={cn(
              "flex size-7 items-center justify-center rounded-md transition-[background-color,color]",
              T_FAST,
              FOCUS,
              tone === "danger"
                ? "text-[var(--color-graphite-600)] hover:bg-[var(--color-danger-100)] hover:text-[var(--color-danger-700)]"
                : "text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)]",
            )}
          >
            <Icon className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        }
      />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

export function useTaskListInteractions(handlers: Handlers) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [dwellId, setDwellId] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  /* Drag handlers fire far more often than React re-renders, so their view of
     state has to come from a ref. Reading `dragId` inside one gives whatever
     it was when the handler was created, which lands a drop on the wrong row
     about one time in five. */
  const live = useRef({ dragId: null as string | null, dwellId: null as string | null })
  const dwellTimer = useRef<number | null>(null)
  const pressTimer = useRef<number | null>(null)
  const longPressAt = useRef(0)
  const lastCount = useRef(0)

  useEffect(() => {
    if (!selecting) return
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelecting(false)
        setSelected([])
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selecting])

  function clearTimers() {
    if (dwellTimer.current !== null) window.clearTimeout(dwellTimer.current)
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current)
    dwellTimer.current = null
    pressTimer.current = null
  }
  useEffect(() => clearTimers, [])

  function exit() {
    setSelecting(false)
    setSelected([])
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id]
      /* Emptying the selection leaves the mode, as it does in a messaging app.
         A mode you must dismiss separately after deselecting everything is a
         mode people get stuck in. */
      if (next.length === 0) setSelecting(false)
      else lastCount.current = next.length
      return next
    })
  }

  function rowProps(id: string) {
    return {
      draggable: !selecting,
      onDragStart: (event: DragEvent) => {
        event.dataTransfer.effectAllowed = "move"
        event.dataTransfer.setData("text/plain", id)
        live.current = { dragId: id, dwellId: null }
        setDragId(id)
        setHoverId(null)
        setDwellId(null)
      },
      onDragEnd: () => {
        clearTimers()
        live.current = { dragId: null, dwellId: null }
        setDragId(null)
        setHoverId(null)
        setDwellId(null)
      },
      onDragOver: (event: DragEvent) => {
        event.preventDefault()
        const current = live.current
        if (!current.dragId || current.dragId === id) return
        if (hoverId === id) return
        clearTimers()
        setHoverId(id)
        setDwellId(null)
        dwellTimer.current = window.setTimeout(() => {
          live.current = { ...live.current, dwellId: id }
          setDwellId(id)
        }, DWELL_MS)
      },
      onDragLeave: () => {
        if (hoverId !== id) return
        clearTimers()
        setHoverId(null)
        setDwellId(null)
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault()
        clearTimers()
        const { dragId: from, dwellId: dwelt } = live.current
        live.current = { dragId: null, dwellId: null }
        setDragId(null)
        setHoverId(null)
        setDwellId(null)
        if (!from || from === id) return
        if (dwelt === id) handlers.onMergeIntoFolder([from, id])
        else handlers.onReorder(from, id)
      },
      onPointerDown: () => {
        if (selecting) return
        clearTimers()
        pressTimer.current = window.setTimeout(() => {
          longPressAt.current = Date.now()
          lastCount.current = 1
          setSelecting(true)
          setSelected([id])
        }, 400)
      },
      onPointerUp: clearTimers,
      onPointerLeave: clearTimers,
      onClick: () => {
        /* Ignore only the click belonging to the press just made. A boolean
           flag here would stay raised when no click follows — touch suppresses
           it — and swallow the next tap. */
        if (selecting && Date.now() - longPressAt.current > 300) toggle(id)
      },
    }
  }

  function rowState(id: string) {
    return {
      isDragging: dragId === id,
      isDropTarget: hoverId === id && dwellId !== id,
      isDwelt: dwellId === id,
      isSelected: selected.includes(id),
    }
  }

  /* Decoration a row draws for itself, kept here so a list does not have to
     know what a dwell looks like. */
  function rowDecoration(id: string): ReactNode {
    const state = rowState(id)
    return (
      <>
        {state.isDropTarget ? <DwellBar /> : null}
        {state.isDwelt ? (
          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
            <span className="rounded-full bg-[var(--color-dana-accent-600)] px-2 py-0.5 text-[12px] leading-4 font-medium text-white">
              Release to make a folder
            </span>
          </span>
        ) : null}
      </>
    )
  }

  const bar = selecting ? (
    <div className="mb-2 flex items-center gap-1 rounded-md bg-[var(--color-dana-accent-50)] px-2 py-1.5">
      <button
        type="button"
        onClick={exit}
        aria-label="Leave selection"
        className={cn(
          "flex size-6 items-center justify-center rounded text-[var(--color-dana-accent-800)] transition-colors hover:bg-[var(--color-dana-accent-100)]",
          T_FAST,
          FOCUS,
        )}
      >
        <X className="size-4" strokeWidth={2} aria-hidden="true" />
      </button>
      <span className="mr-auto text-[12px] leading-4 font-medium text-[var(--color-dana-accent-800)]">
        {selected.length || lastCount.current} selected
      </span>

      <BarAction
        icon={Check}
        label="Mark complete"
        onClick={() => {
          handlers.onBulk(selected, "complete")
          exit()
        }}
      />
      <BarAction
        icon={Star}
        label="Mark important"
        onClick={() => {
          handlers.onBulk(selected, "important")
          exit()
        }}
      />
      <BarAction
        icon={Pin}
        label="Add to My Day"
        onClick={() => {
          handlers.onBulk(selected, "myday")
          exit()
        }}
      />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label="Move to a folder"
              className={cn(
                "flex size-7 items-center justify-center rounded-md text-[var(--color-graphite-600)] transition-[background-color,color] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)]",
                T_FAST,
                FOCUS,
              )}
            >
              <FolderInput
                className="size-3.5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </button>
          }
        />
        <DropdownMenuContent align="end">
          {handlers.folders.map((folder) => (
            <DropdownMenuItem
              key={folder.name}
              label={folder.name}
              onClick={() => {
                handlers.onMoveToFolder(selected, folder)
                exit()
              }}
            >
              {folder.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            label="New folder"
            onClick={() => {
              handlers.onMergeIntoFolder(selected)
              exit()
            }}
          >
            New folder…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <BarAction
        icon={Copy}
        label="Duplicate"
        onClick={() => {
          handlers.onDuplicate(selected)
          exit()
        }}
      />
      <span
        aria-hidden="true"
        className="mx-0.5 h-4 w-px bg-[var(--color-dana-accent-200)]"
      />
      <BarAction
        icon={Trash2}
        label="Delete"
        tone="danger"
        onClick={() => {
          handlers.onDelete(selected)
          exit()
        }}
      />
    </div>
  ) : null

  /* Classes a list puts on the row's wrapper. Kept as a string so the caller
     does not have to know which states exist. */
  function rowClass(id: string) {
    const state = rowState(id)
    return cn(
      "relative transition-[opacity,background-color,box-shadow]",
      T_BASE,
      state.isDragging && "opacity-40",
      state.isSelected &&
        "rounded-lg bg-[var(--color-dana-accent-100)] ring-1 ring-[var(--color-dana-accent-200)]",
      state.isDwelt &&
        "rounded-lg bg-[var(--color-dana-accent-50)] ring-2 ring-[var(--color-dana-accent-600)]",
    )
  }

  return { rowProps, rowState, rowClass, rowDecoration, bar, selecting }
}
