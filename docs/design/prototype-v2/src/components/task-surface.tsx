/*
The task surface: one task held five ways — a dialog, full screen, a sidebar
on either edge, or a floating card — plus the sixth way that is really the
page bar's: opened as a tab.

**A task in a surface is a page, not a row** — Imran's ruling, 2026-08-18
(DES-136). The first build rendered `TaskRow` forced open, and every list
affordance turned to noise the moment the list was gone: the collapse chevron
left a naked row floating in an empty screen, the hover machinery answered
questions nobody was asking, and a 14px row title stood as the largest text
on a full page. What leaves is the row; what stays is the card. The surface
composes its own header — the title at page scale renaming in place
(DES-095), a deliberate completion control, the star — over the same
`TaskCard` blocks the inline row opens, wired through the same
`useCardWiring` layer, so DES-117's one-artifact promise stays checkable:
same fields, same commit-as-it-is-made behaviour, two compositions.

The view switcher is the icon strip, labels on hover — the same grammar as
the conversation's homes. Escape closes; the chrome closes; the card's own
footer offers neither, because two closes in one surface is one too many.
*/

import { useEffect, useRef, useState, type ReactNode } from "react"

import { Star, X } from "@/lib/icons"
import { TaskCard } from "@/components/task-card"
import {
  Check,
  TASK_OPEN_OPTIONS,
  useCardWiring,
  type TaskOpenMode,
  type TaskRowProps,
} from "@/components/task-row"
import { ViewStrip } from "@/components/view-strip"
import { setTaskSurfacePreference } from "@/lib/task-surface-preference"
import { cn } from "@/lib/utils"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

export type TaskSurfaceMode = Exclude<TaskOpenMode, "tab">

/* The side panel's width, remembered like every other display preference
   (DES-138): a person who widens it once should not widen it again on the
   next task. Clamped so the panel can never eat the page or vanish. */
const PANEL_KEY = "dana.taskPanelWidth"
const PANEL_MIN = 360
const PANEL_MAX = 720
const PANEL_DEFAULT = 440

function readPanelWidth() {
  try {
    const stored = Number(localStorage.getItem(PANEL_KEY))
    if (!Number.isFinite(stored) || stored <= 0) return PANEL_DEFAULT
    return Math.min(PANEL_MAX, Math.max(PANEL_MIN, stored))
  } catch {
    return PANEL_DEFAULT
  }
}

/* The grab edge, mirrored: a right panel is widened by dragging left, a left
   panel by dragging right, so the arithmetic flips with the side. Keyboard
   resizing comes along, as it does on the app sidebar. */
function PanelResizeHandle({
  side,
  width,
  onChange,
  onCommit,
  onReset,
}: {
  side: "left" | "right"
  width: number
  onChange: (next: number) => void
  onCommit: (next: number) => void
  onReset: () => void
}) {
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number; current: number } | null>(null)

  const clamp = (value: number) =>
    Math.min(PANEL_MAX, Math.max(PANEL_MIN, value))

  return (
    <div
      role="separator"
      aria-label="Resize task panel"
      aria-orientation="vertical"
      aria-valuemin={PANEL_MIN}
      aria-valuemax={PANEL_MAX}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onDoubleClick={onReset}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.focus()
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startWidth: width,
          current: width,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return
        const delta = event.clientX - drag.current.startX
        const next = clamp(
          drag.current.startWidth + (side === "right" ? -delta : delta),
        )
        drag.current.current = next
        onChange(next)
      }}
      onPointerUp={(event) => {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return
        onCommit(drag.current.current)
        drag.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 24 : 8
        let next: number | null = null
        if (event.key === "ArrowLeft") next = clamp(width + (side === "right" ? step : -step))
        else if (event.key === "ArrowRight") next = clamp(width + (side === "right" ? -step : step))
        else if (event.key === "Home") next = PANEL_MIN
        else if (event.key === "End") next = PANEL_MAX
        if (next === null) return
        event.preventDefault()
        onChange(next)
        onCommit(next)
      }}
      className={cn(
        "absolute inset-y-0 z-10 w-1.5 cursor-col-resize transition-colors",
        T_FAST,
        FOCUS,
        "hover:bg-[var(--color-dana-accent-200)] focus-visible:bg-[var(--color-dana-accent-200)]",
        side === "right" ? "left-0" : "right-0",
      )}
    />
  )
}

/* The title at page scale, renaming in place by the row's own rule. */
function PageTitle({
  value,
  done,
  onRename,
}: {
  value: string
  done: boolean
  onRename: (title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const metrics = cn(
    "min-w-0 flex-1 text-left text-2xl leading-8 font-semibold",
    done
      ? "text-[var(--color-graphite-500)] line-through decoration-[var(--color-graphite-400)]"
      : "text-foreground",
  )

  if (editing) {
    return (
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        value={draft}
        aria-label="Task name"
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          onRename(draft.trim() || value)
          setEditing(false)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            onRename(draft.trim() || value)
            setEditing(false)
          }
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            setDraft(value)
            setEditing(false)
          }
        }}
        className={cn(
          metrics,
          "-mx-1 rounded-md bg-background px-1 outline-none ring-2 ring-[var(--color-dana-accent-600)]",
        )}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value)
        setEditing(true)
      }}
      className={cn(
        metrics,
        "-mx-1 cursor-text truncate rounded-md px-1 transition-colors",
        T_FAST,
        FOCUS,
        "hover:bg-[var(--color-graphite-100)]",
      )}
    >
      {value}
    </button>
  )
}

/*
The task as a page: the surface's composition and the tab's. Exported so the
tab view renders exactly this with no chrome around it — a tab already has
its close in the strip.
*/
export function TaskPage({ task: props }: { task: TaskRowProps & { id: string } }) {
  const { task, patch, cardHandlers } = useCardWiring(props)

  return (
    <div>
      <header className="flex items-start gap-3 pb-2 pl-1">
        <span className="mt-1">
          <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
        </span>
        <PageTitle
          value={task.title}
          done={Boolean(task.done)}
          onRename={(title) => patch(task.id, { title })}
        />
        <button
          type="button"
          aria-pressed={Boolean(task.important)}
          aria-label={task.important ? "Remove from Important" : "Mark as Important"}
          onClick={() => {
            patch(task.id, { important: !task.important })
            props.onToggleImportant?.()
          }}
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md transition-[background-color,opacity] hover:bg-[var(--color-graphite-100)] active:scale-90",
            T_FAST,
            FOCUS,
            task.important
              ? "opacity-100"
              : "opacity-40 hover:opacity-100",
          )}
        >
          <Star
            className={cn(
              "size-5",
              task.important
                ? "fill-[var(--color-warning-500)] text-[var(--color-warning-500)]"
                : "text-[var(--color-graphite-500)]",
            )}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </button>
      </header>
      {/* The same card, the same wiring — the page differs only in what
          stands above it. The card keeps its own left gutter (pl-7), which
          here lines the blocks up under the title rather than under a row. */}
      <TaskCard
        task={task}
        patch={patch}
        {...cardHandlers}
        chrome="surface"
        onClose={() => {}}
      />
    </div>
  )
}

function SurfaceChrome({
  title,
  mode,
  onModeChange,
  onOpenInTab,
  onClose,
  children,
}: {
  title: string
  mode: TaskSurfaceMode
  onModeChange: (mode: TaskSurfaceMode) => void
  onOpenInTab?: () => void
  onClose: () => void
  children: ReactNode
}) {
  /* The strip offers every mode; "tab" is an action rather than a state, so
     selecting it hands the task to the page bar instead of switching. */
  const options = TASK_OPEN_OPTIONS.filter(
    (option) => option.key !== "tab" || Boolean(onOpenInTab),
  )

  return (
    <>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--color-graphite-100)] pr-2 pl-4">
        <span className="min-w-0 flex-1 truncate text-[12px] leading-4 font-medium text-[var(--color-graphite-500)]">
          {title}
        </span>
        <ViewStrip
          ariaLabel="Where this task opens"
          value={mode}
          options={options}
          onSelect={(key) => {
            if (key === "tab") {
              onOpenInTab?.()
              return
            }
            /* Switching from inside the surface is the same decision made
               later, so it is remembered too (DES-138). */
            setTaskSurfacePreference(key as TaskSurfaceMode)
            onModeChange(key as TaskSurfaceMode)
          }}
        />
        <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-[var(--color-graphite-200)]" />
        <button
          type="button"
          aria-label="Close task"
          onClick={onClose}
          className={cn(
            "flex size-7 items-center justify-center rounded-md text-[var(--color-graphite-500)] transition-colors hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)]",
            T_FAST,
            FOCUS,
          )}
        >
          <X className="size-4 data-[size=sm]:size-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {children}
    </>
  )
}

export function TaskSurface({
  task,
  mode,
  onModeChange,
  onOpenInTab,
  onClose,
}: {
  task: TaskRowProps & { id: string }
  mode: TaskSurfaceMode
  onModeChange: (mode: TaskSurfaceMode) => void
  onOpenInTab?: () => void
  onClose: () => void
}) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [panelWidth, setPanelWidth] = useState(readPanelWidth)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  /* Keyed by task and mode so a switch remounts the page cleanly rather
     than carrying transient state across layouts. */
  const page = <TaskPage key={`${task.id}-${mode}`} task={task} />

  const chrome = (body: ReactNode) => (
    <SurfaceChrome
      title={task.title}
      mode={mode}
      onModeChange={onModeChange}
      onOpenInTab={onOpenInTab}
      onClose={onClose}
    >
      {body}
    </SurfaceChrome>
  )

  if (mode === "dialog") {
    return (
      <div className="fixed inset-0 z-50 duration-[var(--duration-base)] ease-[var(--ease-enter)] animate-in fade-in-0">
        <button
          type="button"
          aria-label="Close task"
          onClick={onClose}
          className="absolute inset-0 cursor-default bg-[var(--color-graphite-950)]/30"
        />
        <div className="absolute inset-x-0 top-[8vh] mx-auto flex max-h-[84vh] w-full max-w-[680px] flex-col overflow-hidden rounded-xl border border-[var(--color-graphite-200)] bg-card shadow-[var(--elevation-2)] duration-[var(--duration-base)] ease-[var(--ease-enter)] animate-in fade-in-0 slide-in-from-top-2">
          {chrome(
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{page}</div>,
          )}
        </div>
      </div>
    )
  }

  if (mode === "full") {
    return (
      <div className="fixed inset-x-0 top-[var(--shell-pagebar-height)] bottom-0 z-50 flex flex-col bg-background duration-[var(--duration-base)] ease-[var(--ease-enter)] animate-in fade-in-0">
        {chrome(
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[var(--content-list)] px-10 py-6">
              {page}
            </div>
          </div>,
        )}
      </div>
    )
  }

  if (mode === "float") {
    return (
      <div className="fixed right-6 bottom-6 z-50 flex max-h-[72vh] w-[480px] flex-col overflow-hidden rounded-xl border border-[var(--color-graphite-200)] bg-card shadow-[var(--elevation-2)] duration-[var(--duration-base)] ease-[var(--ease-enter)] animate-in fade-in-0 slide-in-from-bottom-2">
        {chrome(
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{page}</div>,
        )}
      </div>
    )
  }

  function commitPanelWidth(next: number) {
    setPanelWidth(next)
    try {
      localStorage.setItem(PANEL_KEY, String(Math.round(next)))
    } catch {
      /* Remembered for this session only, the honest fallback. */
    }
  }

  return (
    <aside
      /* Keyed by side: React would otherwise reuse this element across a
         left/right switch, and `animate-in`'s fill-mode then holds the new
         animation's *start* state — the panel parks off-screen and never
         arrives. Verified: switching sides left it at x=-440. */
      key={mode}
      aria-label={task.title}
      style={{ width: panelWidth }}
      className={cn(
        "fixed top-[var(--shell-pagebar-height)] bottom-0 z-50 flex flex-col bg-card shadow-[var(--elevation-2)] duration-[var(--duration-slow)] ease-[var(--ease-enter)] animate-in",
        mode === "right"
          ? "right-0 border-l border-[var(--color-graphite-200)] slide-in-from-right"
          : "left-0 border-r border-[var(--color-graphite-200)] slide-in-from-left",
      )}
    >
      <PanelResizeHandle
        side={mode === "right" ? "right" : "left"}
        width={panelWidth}
        onChange={setPanelWidth}
        onCommit={commitPanelWidth}
        onReset={() => commitPanelWidth(PANEL_DEFAULT)}
      />
      {chrome(
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{page}</div>,
      )}
    </aside>
  )
}
