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

import { ChevronDown, ChevronUp, Maximize2, MessageSquare, Plus, X } from "../lib/icons.js"
import { TITLE_REQUIRED, tooLong } from "./task-copy.js"
/* 10.3's number for the field, from the shared contract rather than restated. */
import { TASK_TITLE_LIMIT } from "../../shared/tasks.js"
import { HistorySheet } from "./history-sheet.js"
import { TaskCard, TaskStatus } from "./task-card.js"
import { DropdownMenuItem, DropdownMenuSeparator } from "./ui/dropdown-menu.js"
import { useTaskThreadLive } from "../api/consultation.js"
import { useCardWiring, type TaskRowProps } from "./task-row.js"
import { ReservesRightEdge } from "./right-edge.js"
import { ObjectMenu } from "./object-menu.js"
import { copyTaskLink, duplicateTask } from "../tasks/task-acts.js"
import { cn } from "./ui/utils.js"
import { ReferencedFrom } from "./links/referenced-from.js"
import { Button } from "./ui/button.js"
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
          "text-[length:var(--text-title-size)] leading-[var(--text-title-line)] font-semibold hover:bg-transparent focus:bg-transparent",
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
The task's one "…": history, copy link, duplicate, delete. Status carries
abandon and restore, and the breadcrumb says where the task lives.
*/
function TaskMenu({
  id,
  title,
  onDelete,
  onAddProperty,
  onStartDiscussion,
}: {
  id: string
  title: string
  onDelete?: () => void
  onAddProperty: () => void
  /** Absent once a discussion exists: the tab is there instead. */
  onStartDiscussion?: () => void
}) {
  const [historyOpen, setHistoryOpen] = useState(false)
  return (
    <>
      <ObjectMenu
        kind="task"
        name={title}
        width="w-56"
        extra={
          <>
            <DropdownMenuItem onClick={onAddProperty}>
              <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
              <span className="flex-1">Add property</span>
              <span className="text-xs text-muted-foreground">;</span>
            </DropdownMenuItem>
            {onStartDiscussion ? (
              <DropdownMenuItem onClick={onStartDiscussion}>
                <MessageSquare className="size-4" strokeWidth={1.75} aria-hidden="true" />
                Start discussion
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
          </>
        }
        handlers={{
          history: () => setHistoryOpen(true),
          "copy-link": () => copyTaskLink(id),
          duplicate: () => duplicateTask(id, title),
          delete: onDelete,
        }}
      />
      <HistorySheet
        kind="task"
        subject={id}
        name={title}
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
  disabled = false,
  onClick,
  children,
}: {
  label: string
  keys?: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-keyshortcuts={keys}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

/*
The task as one page, whichever way it is shown: a side peek, a center peek or
the full page. A peek draws its controls in a bar beside its breadcrumb; the
full page draws them on the title line, as the folder page does, since the
app's own bar is its breadcrumb.
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
  const [addOpen, setAddOpen] = useState(false)
  /* The Work and Discussion tabs draw only once the task has a discussion,
     or the person has asked to start one. */
  const thread = useTaskThreadLive(task.folder?.id ?? null, task.id)
  const [discussSignal, setDiscussSignal] = useState(0)
  const discussion = (thread.data?.comments.length ?? 0) > 0 || discussSignal > 0
  const startDiscussion = discussion ? undefined : () => setDiscussSignal((n) => n + 1)
  /* A menu item that opens another menu waits for its own to close first. */
  const openAdd = () => globalThis.setTimeout(() => setAddOpen(true), 0)

  /* ";" opens "Add property" when the person is not typing. */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== ";" || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase()
        if (tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable) return
      }
      if (document.querySelector('[role="menu"], [role="alertdialog"], [role="listbox"]')) return
      event.preventDefault()
      setAddOpen(true)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const controls = (
    <div className="flex shrink-0 items-center gap-1">
      {task.abandoned ? <span className="px-2 text-xs text-muted-foreground">Abandoned</span> : null}
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
        <HeaderButton label="Open as full page" onClick={onOpenFull}>
          <Maximize2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </HeaderButton>
      ) : null}
      <TaskMenu
        id={props.id}
        title={task.title}
        onAddProperty={openAdd}
        {...(startDiscussion === undefined ? {} : { onStartDiscussion: startDiscussion })}
        {...(props.onDelete === undefined ? {} : { onDelete: props.onDelete })}
      />
      {onClose ? (
        <HeaderButton label="Close task" onClick={onClose}>
          <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </HeaderButton>
      ) : null}
    </div>
  )

  /* The status as the list's checkbox, left of the title; a discreet
     "Discuss" on hover while the task has no discussion. */
  const title = (
    <div className="group/title flex min-w-0 items-start gap-1">
      <span className="flex h-[var(--text-title-line)] shrink-0 items-center">
        <TaskStatus task={task} patch={patch} />
      </span>
      <div className="min-w-0 flex-1">
        <Title
          /* A different task is a fresh draft. */
          key={props.id}
          value={task.title}
          done={Boolean(task.done)}
          onRename={(title) => patch(task.id, { title })}
        />
      </div>
      {startDiscussion ? (
        <span className="flex h-[var(--text-title-line)] shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={startDiscussion}
            className="text-muted-foreground opacity-0 group-hover/title:opacity-100 focus-visible:opacity-100"
          >
            <MessageSquare className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            Discuss
          </Button>
        </span>
      ) : null}
    </div>
  )

  const rest = (
    <>
      <TaskCard
        task={task}
        patch={patch}
        {...cardHandlers}
        addOpen={addOpen}
        onAddOpenChange={setAddOpen}
        discussion={discussion}
        discussSignal={discussSignal}
      />
      {/* #214: the documents that link to this Task. Absent while none do. */}
      <ReferencedFrom kind="task" id={props.id} />
    </>
  )

  if (kind === "page") {
    /* Straight in the shell's column, as the folder page is, so the two share
       one measure. The page scrolls, not an inner box. */
    return (
      <div className="flex flex-col gap-4 pt-2 pb-24">
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">{title}</div>
          {controls}
        </div>
        {rest}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 px-3">
        {/* The task's path, as the top bar draws it on its full page. It takes
            the slack so the controls stay at the right edge. */}
        <div data-peek-breadcrumb="" className="flex min-w-0 flex-1 items-center">
          <PeekTrail taskId={task.id} />
        </div>
        {controls}
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto pb-16",
          kind === "center" ? "px-14 pt-2 max-md:px-4" : "px-6",
        )}
      >
        <div className="flex flex-col gap-4">
          {title}
          {rest}
        </div>
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

Focus moves into the peek and returns, on close, to what had it before; when
that was nothing (a mouse press on a canvas task focuses nothing), or the peek
has since stepped to another task, it goes to the row of the task on screen.
*/
type Phase = "starting" | "open" | "ending"

/** Longer than any exit on the motion tokens; only a missed end event waits for it. */
const EXIT_FALLBACK_MS = 250

/* The focusable home of a task's row under the peek: the row, or the nearest
   focusable wrapper holding that one task, or its first control. */
function rowFocusTarget(taskId: string, peek: HTMLElement | null): HTMLElement | null {
  const rows = document.querySelectorAll<HTMLElement>(`[data-task-id="${CSS.escape(taskId)}"]`)
  const row = Array.from(rows).find((node) => peek?.contains(node) !== true)
  if (row === undefined) return null
  if (row.tabIndex >= 0) return row
  const wrapper = row.parentElement?.closest<HTMLElement>("[tabindex]:not([tabindex=\"-1\"])")
  if (
    wrapper != null &&
    Array.from(wrapper.querySelectorAll<HTMLElement>("[data-task-id]")).every(
      (node) => node.dataset.taskId === taskId,
    )
  ) {
    return wrapper
  }
  return row.querySelector<HTMLElement>("button, a[href], [tabindex]:not([tabindex=\"-1\"])")
}

function usePeekMotion(
  onClose: () => void,
  self: React.RefObject<HTMLElement | null>,
  taskId: string,
) {
  const shownId = useRef(taskId)
  shownId.current = taskId
  const [phase, setPhase] = useState<Phase>("starting")
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const done = useRef(false)

  useEffect(() => {
    const opened = shownId.current
    const peek = self.current
    const active = document.activeElement
    const opener = active instanceof HTMLElement && active !== document.body ? active : null
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
      const back =
        opener?.isConnected === true && shownId.current === opened
          ? opener
          : rowFocusTarget(shownId.current, peek)
      back?.focus({ preventScroll: true })
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
  const { phase, requestClose, finish } = usePeekMotion(onClose, self, task.id)
  const steps = usePeekSteps(task.id, self)
  usePeekKeys(requestClose, self, steps)

  return (
    <ReservesRightEdge width={TASK_PANEL_WIDTH}>
      <aside
        ref={self}
        aria-label={task.title}
        tabIndex={-1}
        data-focus="self"
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
  const { phase, requestClose, finish, motion } = usePeekMotion(onClose, self, task.id)
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
        data-focus="self"
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
