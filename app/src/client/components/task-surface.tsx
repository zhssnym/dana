/*
A task's page, in the three ways it is shown (ROUND2-SPEC "Task"):

- **Center peek** (`TaskCenterPeek`), the default (round 3): a centered sheet,
  ~960px, over the dimmed page, like Notion's center peek.
- **Side peek** (`TaskPanel`): a panel at the right edge; the page makes room
  rather than being covered, so the list stays visible and usable, and
  clicking another row swaps the peek's task.
- **Full page** (`TaskView kind="page"`, from `pages/TaskPage.tsx`):
  /app/tasks/:id in the app's own shell, and always so on a phone.

Settings > Appearance > "Open tasks in" chooses. The peeks carry ↑/↓ to step
through the tasks listed under them (also Ctrl/Cmd+Shift+K and J, Notion's
keys), "Open as full page" and a close; Escape closes them. Both ease in and
out on the motion tokens rather than snapping. The view is one: a header with the
task's one "…", the title renaming in place, and `TaskCard` (properties, then
the Work and Discussion tabs).
*/

import { InlineTextarea } from "./ui/inline-field.js"
import { useCallback, useEffect, useRef, useState } from "react"

import { ChevronDown, ChevronUp, Maximize2, MoreHorizontal, X } from "../lib/icons.js"
import { TITLE_REQUIRED, tooLong } from "./task-copy.js"
/* 10.3's number for the field, from the shared contract rather than restated. */
import { TASK_TITLE_LIMIT } from "../../shared/tasks.js"
import { HistorySheet } from "./history-sheet.js"
import { TaskCard } from "./task-card.js"
import { useCardWiring, type TaskRowProps } from "./task-row.js"
import { ReservesRightEdge } from "./right-edge.js"
import { ObjectMenu } from "./object-menu.js"
import { MORE_ACTIONS } from "./ui/copy.js"
import { copyTaskLink, duplicateTask } from "../tasks/task-acts.js"
import { cn } from "./ui/utils.js"
import { ReferencedFrom } from "./links/referenced-from.js"
import { pageBodyClass } from "./page-head.js"
import { openTask } from "./task-open.js"
import { BreadcrumbTrail } from "./breadcrumb-trail.js"
import { prefetchTask, useTask } from "../api/queries.js"
import { useQueryClient } from "@tanstack/react-query"

/* Page / Sub / Task, the same trail the top bar draws for a task's full page. */
function PeekTrail({ taskId }: { taskId: string }) {
  const task = useTask(taskId)
  if (task.data === undefined) return null
  return <BreadcrumbTrail folderId={task.data.folder.id} current={task.data.title} />
}

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** The panel's width on a desktop. Fixed: the page beside it is the thing
    that flexes. */
export const TASK_PANEL_WIDTH = 480

/* The title, big, renaming in place. Required, 1 to 300, refused with a
   reason where the person is looking (9.3, AC-161); the server enforces the
   same bounds. Enter commits, Escape puts it back. */
function Title({
  value,
  done,
  onRename,
}: {
  value: string
  done: boolean
  onRename: (title: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  function commit(next: string): void {
    const trimmed = next.replace(/\s+/g, " ").trim()
    if (trimmed === "") {
      setRefusal(TITLE_REQUIRED)
      return
    }
    if (trimmed.length > TASK_TITLE_LIMIT) {
      setRefusal(tooLong(TASK_TITLE_LIMIT))
      return
    }
    setRefusal(null)
    setEditing(false)
    if (trimmed !== value) onRename(trimmed)
  }

  return (
    <div className="flex flex-col gap-1">
      <InlineTextarea
        rows={1}
        value={editing ? draft : value}
        /* 9.3's field name; tests address the title as a field. */
        aria-label="title"
        aria-invalid={refusal !== null}
        onFocus={() => {
          setDraft(value)
          setEditing(true)
        }}
        onChange={(event) => {
          setDraft(event.target.value)
          if (refusal !== null) setRefusal(null)
        }}
        onBlur={() => commit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commit(draft)
            event.currentTarget.blur()
          }
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            setDraft(value)
            setRefusal(null)
            setEditing(false)
            event.currentTarget.blur()
          }
        }}
        className={cn(
          "text-[length:var(--text-title-size)] leading-[var(--text-title-line)] font-bold hover:bg-transparent focus:bg-transparent focus:ring-0",
          done ? "text-muted-foreground line-through" : "text-foreground",
        )}
      />
      {refusal === null ? null : (
        <p role="status" className="text-xs text-destructive">
          {refusal}
        </p>
      )}
    </div>
  )
}

/*
The task's one "…": history, copy link, duplicate, abandon (or restore),
delete. Moving is the Folder row's and done is the Status row's, in the
properties block, so each has one home.
*/
function TaskMenu({
  task,
  id,
  onRestore,
  onAbandon,
  onDelete,
}: {
  task: { title: string; done?: boolean; abandoned?: boolean }
  id: string
  onRestore: () => void
  onAbandon?: () => void
  onDelete?: () => void
}) {
  const [historyOpen, setHistoryOpen] = useState(false)
  return (
    <>
      <ObjectMenu
        kind="task"
        name={task.title}
        width="w-56"
        trigger={
          <button
            type="button"
            aria-label={MORE_ACTIONS}
            className={cn(
              "flex size-8 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground data-popup-open:bg-accent",
              FOCUS,
            )}
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        }
        handlers={{
          history: () => setHistoryOpen(true),
          "copy-link": () => copyTaskLink(id),
          duplicate: () => duplicateTask(id, task.title),
          abandon: onAbandon && !task.abandoned ? onAbandon : undefined,
          restore: task.abandoned ? onRestore : undefined,
          delete: onDelete,
        }}
      />
      <HistorySheet
        kind="task"
        subject={id}
        name={task.title}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </>
  )
}

/** The tasks before and after the open one, in the order the page shows them. */
export interface PeekSteps {
  readonly prev: string | null
  readonly next: string | null
}

function HeaderButton({
  label,
  keys,
  disabled,
  onClick,
  children,
}: {
  label: string
  keys: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-keyshortcuts={keys}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        FOCUS,
      )}
    >
      {children}
    </button>
  )
}

/*
The task as one page, whichever way it is shown: a side peek, a center peek or
the full page. The header carries the task's one "…", "Open as full page" in
the peeks, and the close.
*/
export function TaskView({
  task: props,
  onClose,
  onOpenFull,
  kind = "side",
  steps,
}: {
  task: TaskRowProps & { id: string }
  /** The close control; absent draws none. */
  onClose?: () => void
  /** "Open as full page"; absent (the full page itself) draws none. */
  onOpenFull?: () => void
  kind?: "side" | "center" | "page"
  /** A peek's neighbours in the list under it; absent draws no arrows. */
  steps?: PeekSteps
}) {
  const { task, patch, cardHandlers } = useCardWiring(props)
  const page = kind === "page"

  const header = (
    <div className={cn("flex h-12 shrink-0 items-center justify-end gap-1", page ? "-mr-2" : "px-3")}>
      {page ? null : (
        /* The task's path, as the top bar draws it on its full page. It takes
           the slack so the controls stay at the right edge. */
        <div data-peek-breadcrumb="" className="flex min-w-0 flex-1 items-center">
          <PeekTrail taskId={task.id} />
        </div>
      )}
      {task.abandoned ? (
        <span className={cn("text-xs text-muted-foreground", page ? "mr-auto" : "px-2")}>Abandoned</span>
      ) : null}
      {steps && (steps.prev !== null || steps.next !== null) ? (
        <>
          <HeaderButton
            label="Previous task"
            keys="Control+Shift+K"
            disabled={steps.prev === null}
            onClick={() => steps.prev !== null && openTask(steps.prev)}
          >
            <ChevronUp className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </HeaderButton>
          <HeaderButton
            label="Next task"
            keys="Control+Shift+J"
            disabled={steps.next === null}
            onClick={() => steps.next !== null && openTask(steps.next)}
          >
            <ChevronDown className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </HeaderButton>
        </>
      ) : null}
      {onOpenFull ? (
        <button
          type="button"
          aria-label="Open as full page"
          title="Open as full page"
          onClick={onOpenFull}
          className={cn(
            "flex size-8 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground",
            FOCUS,
          )}
        >
          <Maximize2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      ) : null}
      <TaskMenu
        task={task}
        id={props.id}
        onRestore={() => patch(task.id, { abandoned: false })}
        {...(props.onAbandon === undefined ? {} : { onAbandon: props.onAbandon })}
        {...(props.onDelete === undefined ? {} : { onDelete: props.onDelete })}
      />
      {onClose ? (
        <button
          type="button"
          aria-label="Close task"
          onClick={onClose}
          className={cn(
            "flex size-8 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground",
            FOCUS,
          )}
        >
          <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )

  const body = (
    <div className="flex flex-col gap-4">
      <Title
        /* A different task is a fresh draft. */
        key={props.id}
        value={task.title}
        done={Boolean(task.done)}
        onRename={(title) => patch(task.id, { title })}
      />
      <TaskCard task={task} patch={patch} {...cardHandlers} />
      {/* #214: the documents that link to this Task. Absent while none do. */}
      <ReferencedFrom kind="task" id={props.id} />
    </div>
  )

  if (page) {
    /* The folder page's own reading column, so a task page and a folder page
       share one measure. The page scrolls, not an inner box. */
    return (
      <div className={pageBodyClass("pb-24 max-md:px-4")}>
        <div className="pt-4 max-md:pt-0">{header}</div>
        <div className="pt-2">{body}</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto pb-16",
          kind === "center" ? "px-14 pt-2 max-md:px-4" : "px-6 max-md:px-0",
        )}
      >
        {body}
      </div>
    </div>
  )
}

/*
Escape closes a peek, unless the key was meant for something inside it: a
field being edited, or an open menu, picker or another dialog, each of which
handles Escape itself. The peek's own element is not "another dialog".

Ctrl/Cmd+Shift+K and J step to the previous and next task (Notion's keys),
from anywhere in the peek, the editor included: nothing inside claims them.
*/
function usePeekKeys(
  onClose: () => void,
  self: React.RefObject<HTMLElement | null>,
  steps: PeekSteps,
) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const stepsRef = useRef(steps)
  stepsRef.current = steps

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented) return
      const key = event.key.toLowerCase()
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && (key === "j" || key === "k")) {
        const to = key === "j" ? stepsRef.current.next : stepsRef.current.prev
        /* Always ours while a peek is open: Ctrl+Shift+K must not also open
           search, whose listener answers any Ctrl+K. */
        event.preventDefault()
        event.stopPropagation()
        if (to !== null) openTask(to)
        return
      }
      if (event.key !== "Escape") return
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase()
        if (tag === "input" || tag === "textarea" || target.isContentEditable) return
      }
      const open = document.querySelectorAll(
        '[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"]',
      )
      for (const node of open) {
        if (node === self.current) continue
        /* A menu still easing out after its own Escape is already closed:
           the next Escape is the peek's. */
        if (node.hasAttribute("data-ending-style") || node.hasAttribute("data-closed")) continue
        return
      }
      closeRef.current()
    }
    /* Capture: the page under a peek (the folder canvas) stops Escape's
       propagation for its own selection, and a peek over it must still
       hear the key. */
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [self])
}

/*
The tasks listed under the peek, in the order they are drawn: every task row
carries `data-task-id` (a canvas task block wraps one), so the page's own
order is the order, whichever view drew it. Rows inside the peek are not the
list. A task opened from somewhere that lists nothing (search, the calendar)
has no neighbours, and the arrows do not draw.
*/
export function usePeekSteps(taskId: string, self: React.RefObject<HTMLElement | null>): PeekSteps {
  const [steps, setSteps] = useState<PeekSteps>({ prev: null, next: null })
  useEffect(() => {
    const read = () => {
      const ids: string[] = []
      for (const node of document.querySelectorAll<HTMLElement>("[data-task-id]")) {
        if (self.current?.contains(node)) continue
        const id = node.dataset.taskId
        if (id !== undefined && id !== "" && !ids.includes(id)) ids.push(id)
      }
      const at = ids.indexOf(taskId)
      const prev = at < 0 ? null : (ids[at - 1] ?? null)
      const next = at < 0 ? null : (ids[at + 1] ?? null)
      setSteps((current) =>
        current.prev === prev && current.next === next ? current : { prev, next },
      )
    }
    read()
    /* A cold load with ?task= opens the peek before the list has rendered;
       re-read whenever rows arrive, leave or reorder. */
    let frame = 0
    const observer = new MutationObserver(() => {
      if (frame !== 0) return
      frame = requestAnimationFrame(() => {
        frame = 0
        read()
      })
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-task-id"],
    })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [taskId, self])
  return steps
}

/*
Opening a peek waits for the task's read. Start it when a row is pressed, or
hovered for a moment, so by the click's end the data is usually here and the
peek opens at once. Mounted once, by the host.
*/
const HOVER_INTENT_MS = 120

export function usePrefetchTaskOnIntent(): void {
  const client = useQueryClient()
  useEffect(() => {
    let timer = 0
    const idOf = (event: Event): string | null => {
      const target = event.target instanceof Element ? event.target : null
      const row = target?.closest<HTMLElement>("[data-task-id]")
      const id = row?.dataset.taskId
      return id === undefined || id === "" ? null : id
    }
    const onDown = (event: PointerEvent) => {
      const id = idOf(event)
      if (id !== null) prefetchTask(client, id)
    }
    const onOver = (event: PointerEvent) => {
      window.clearTimeout(timer)
      if (event.pointerType !== "mouse") return
      const id = idOf(event)
      if (id !== null) timer = window.setTimeout(() => prefetchTask(client, id), HOVER_INTENT_MS)
    }
    document.addEventListener("pointerdown", onDown, true)
    document.addEventListener("pointerover", onOver, true)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("pointerdown", onDown, true)
      document.removeEventListener("pointerover", onOver, true)
    }
  }, [client])
}

/*
**Motion.** A peek eases in and out on the floating-layer utilities
(`motion-float`, `motion-fade` in tokens.css), which animate between
`data-starting-style` / `data-ending-style` and rest. Base UI sets those for
its own popups; a peek is not one, so this does the same by hand: it mounts
"starting", rests two frames later, and on close goes "ending" and only then
calls `onClose`, once its exit has run (or after a short fallback, since
reduced motion or a hidden tab may never fire the end event).

Focus moves into the peek and returns, on close, to what had it before.
*/
type Phase = "starting" | "open" | "ending"

/** Longer than any exit on the motion tokens; only a missed end event waits for it. */
const EXIT_FALLBACK_MS = 250

function usePeekMotion(onClose: () => void, self: React.RefObject<HTMLElement | null>) {
  const [phase, setPhase] = useState<Phase>("starting")
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const done = useRef(false)

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        setPhase((current) => (current === "starting" ? "open" : current))
      })
    })
    self.current?.focus({ preventScroll: true })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
      if (opener?.isConnected === true) opener.focus({ preventScroll: true })
    }
  }, [self])

  const finish = useCallback(() => {
    if (done.current) return
    done.current = true
    closeRef.current()
  }, [])

  const requestClose = useCallback(() => {
    setPhase("ending")
  }, [])

  useEffect(() => {
    if (phase !== "ending") return
    const fallback = window.setTimeout(finish, EXIT_FALLBACK_MS)
    return () => window.clearTimeout(fallback)
  }, [phase, finish])

  const motion: Record<string, string> = {
    ...(phase === "starting" ? { "data-starting-style": "" } : {}),
    ...(phase === "ending" ? { "data-ending-style": "" } : {}),
  }
  return { phase, requestClose, finish, motion }
}

/*
Side peek: a panel at the right edge. It reserves its width, so the page
narrows rather than being covered and the list beside it stays usable. It
slides in and out on the motion tokens.
*/
export function TaskPanel({
  task,
  onClose,
  onOpenFull,
}: {
  task: TaskRowProps & { id: string }
  onClose: () => void
  onOpenFull?: () => void
}) {
  const self = useRef<HTMLElement>(null)
  const { phase, requestClose, finish } = usePeekMotion(onClose, self)
  const steps = usePeekSteps(task.id, self)
  usePeekKeys(requestClose, self, steps)

  return (
    <ReservesRightEdge width={TASK_PANEL_WIDTH}>
      <aside
        ref={self}
        aria-label={task.title}
        tabIndex={-1}
        style={{ width: TASK_PANEL_WIDTH }}
        onAnimationEnd={(event) => {
          if (phase === "ending" && event.target === event.currentTarget) finish()
        }}
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex max-w-full flex-col border-l border-border bg-background outline-none",
          phase === "ending"
            ? "animate-out fade-out-0 slide-out-to-right-4 fill-mode-forwards duration-(--duration-fast) ease-(--ease-exit)"
            : "animate-in fade-in-0 slide-in-from-right-4 duration-(--duration-base) ease-(--ease-enter)",
        )}
      >
        <TaskView
          key={task.id}
          task={task}
          onClose={requestClose}
          steps={steps}
          {...(onOpenFull ? { onOpenFull } : {})}
        />
      </aside>
    </ReservesRightEdge>
  )
}

/** The center peek's width on a desktop. */
export const TASK_PEEK_WIDTH = 960

/*
Center peek, the default: the page in a centered sheet over the dimmed page,
as Notion's center peek. The scrim fades; the sheet fades and rises into
place. A press on the dimmed page, the close or Escape closes it, easing out
first.
*/
export function TaskCenterPeek({
  task,
  onClose,
  onOpenFull,
}: {
  task: TaskRowProps & { id: string }
  onClose: () => void
  onOpenFull?: () => void
}) {
  const self = useRef<HTMLDivElement>(null)
  const { phase, requestClose, finish, motion } = usePeekMotion(onClose, self)
  const steps = usePeekSteps(task.id, self)
  usePeekKeys(requestClose, self, steps)

  return (
    <div
      {...motion}
      className="fixed inset-0 z-40 flex items-start justify-center bg-scrim pt-[6vh] pb-[4vh] motion-fade"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <div
        {...motion}
        ref={self}
        role="dialog"
        aria-modal="true"
        aria-label={task.title}
        tabIndex={-1}
        style={{ width: `min(${TASK_PEEK_WIDTH}px, calc(100vw - 32px))` }}
        onTransitionEnd={(event) => {
          if (phase === "ending" && event.target === event.currentTarget) finish()
        }}
        className="flex h-full max-h-full flex-col overflow-hidden rounded-lg bg-popover shadow-md outline-none motion-float"
      >
        <TaskView
          key={task.id}
          kind="center"
          task={task}
          onClose={requestClose}
          steps={steps}
          {...(onOpenFull ? { onOpenFull } : {})}
        />
      </div>
    </div>
  )
}
