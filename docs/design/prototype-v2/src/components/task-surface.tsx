/*
The task surface: one task, held four ways — full screen, a sidebar on either
edge, or a floating dock — plus the fifth way that is really the page bar's:
opened as a tab.

This is DES-117's missing half finally drawn. "One form, two presentations"
promised a full-screen presentation for the places with no row to expand; the
answer turns out to be stronger than a second presentation: **the surface
renders the same `TaskRow`, forced open.** The row is the task even at full
screen, so every behaviour — steps, notes, pickers, comments, completion —
exists here because it exists there, and nothing can drift.

Imran's direction, 2026-08-18: opened from a board card; switchable between
full screen, sidebar (left or right), and floating; and a full screen can
become a tab. The mode lives in a small view menu rather than an icon row, so
each choice says its name.

Lane 1 in substance (presentation over the existing row), except "open as a
tab", which rides the tab strip's own entry. Escape closes; focus returns to
the opener.
*/

import { useEffect, useRef, type ReactNode } from "react"

import {
  ChevronDown,
  Maximize2,
  X,
} from "@/lib/icons"
import { TaskRow, type TaskRowProps } from "@/components/task-row"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

export type TaskSurfaceMode = "full" | "right" | "left" | "float"

const MODE_NAMES: Record<TaskSurfaceMode, string> = {
  full: "Full screen",
  right: "Sidebar · right",
  left: "Sidebar · left",
  float: "Floating",
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
  return (
    <>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--color-graphite-100)] pr-2 pl-4">
        <span className="min-w-0 flex-1 truncate text-[12px] leading-4 font-medium text-[var(--color-graphite-500)]">
          {title}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className={cn(
                  "flex h-7 items-center gap-1 rounded-md px-2 text-[12px] leading-4 font-medium text-[var(--color-graphite-600)] transition-colors hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)]",
                  T_FAST,
                  FOCUS,
                )}
              >
                {MODE_NAMES[mode]}
                <ChevronDown className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuRadioGroup
              value={mode}
              onValueChange={(value) => onModeChange(value as TaskSurfaceMode)}
            >
              {(Object.keys(MODE_NAMES) as TaskSurfaceMode[]).map((key) => (
                <DropdownMenuRadioItem key={key} value={key} closeOnClick>
                  {MODE_NAMES[key]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {onOpenInTab ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onOpenInTab}>
                  <Maximize2 className="size-4" />Open as a tab
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
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

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  /* The row, forced open, keyed by task and mode so a mode switch remounts
     it cleanly rather than carrying transient drag state across layouts. */
  const row = (
    <div role="list" className="py-2">
      <TaskRow key={`${task.id}-${mode}`} {...task} defaultOpen />
    </div>
  )

  if (mode === "full") {
    return (
      <div className="fixed inset-x-0 top-[var(--shell-pagebar-height)] bottom-0 z-50 flex flex-col bg-background duration-[var(--duration-base)] ease-[var(--ease-enter)] animate-in fade-in-0">
        <SurfaceChrome
          title={task.title}
          mode={mode}
          onModeChange={onModeChange}
          onOpenInTab={onOpenInTab}
          onClose={onClose}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[var(--content-list)] px-10 py-6">
              {row}
            </div>
          </div>
        </SurfaceChrome>
      </div>
    )
  }

  if (mode === "float") {
    return (
      <div className="fixed right-6 bottom-6 z-50 flex max-h-[72vh] w-[480px] flex-col overflow-hidden rounded-xl border border-[var(--color-graphite-200)] bg-card shadow-[var(--elevation-2)] duration-[var(--duration-base)] ease-[var(--ease-enter)] animate-in fade-in-0 slide-in-from-bottom-2">
        <SurfaceChrome
          title={task.title}
          mode={mode}
          onModeChange={onModeChange}
          onOpenInTab={onOpenInTab}
          onClose={onClose}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-3">{row}</div>
        </SurfaceChrome>
      </div>
    )
  }

  return (
    <aside
      aria-label={task.title}
      className={cn(
        "fixed top-[var(--shell-pagebar-height)] bottom-0 z-50 flex w-[440px] flex-col bg-card shadow-[var(--elevation-2)] duration-[var(--duration-slow)] ease-[var(--ease-enter)] animate-in",
        mode === "right"
          ? "right-0 border-l border-[var(--color-graphite-200)] slide-in-from-right"
          : "left-0 border-r border-[var(--color-graphite-200)] slide-in-from-left",
      )}
    >
      <SurfaceChrome
        title={task.title}
        mode={mode}
        onModeChange={onModeChange}
        onOpenInTab={onOpenInTab}
        onClose={onClose}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-3">{row}</div>
      </SurfaceChrome>
    </aside>
  )
}
