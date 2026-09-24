/*
A task's page, in the three ways it is shown (ROUND2-SPEC "Task"):

- **Side peek** (`TaskPanel`), the default: a panel at the right edge; the page
  makes room rather than being covered, so the list stays visible and usable,
  and clicking another row swaps the peek's task.
- **Center peek** (`TaskCenterPeek`): a centered sheet, ~900px, over the
  dimmed page.
- **Full page** (`TaskView kind="page"`, from `pages/TaskPage.tsx`):
  /app/tasks/:id in the app's own shell, and always so on a phone.

Settings > Appearance > "Open tasks in" chooses. The peeks carry "Open as full
page" and a close, and Escape closes them. The view is one: a header with the
task's one "…", the title renaming in place, and `TaskCard` (properties, then
the Notes and Discussion tabs).
*/

import { InlineTextarea } from "./ui/inline-field.js"
import { useEffect, useRef, useState } from "react"

import { CheckCircle2, Maximize2, MoreHorizontal, X } from "../lib/icons.js"
import { TITLE_REQUIRED, tooLong } from "./task-copy.js"
/* 10.3's number for the field, from the shared contract rather than restated. */
import { TASK_TITLE_LIMIT } from "../../shared/tasks.js"
import { HistorySheet } from "./history-sheet.js"
import { TaskCard } from "./task-card.js"
import { useCardWiring, type TaskRowProps } from "./task-row.js"
import { ReservesRightEdge } from "./right-edge.js"
import { ObjectMenu } from "./object-menu.js"
import { DropdownMenuItem, DropdownMenuSeparator } from "./ui/dropdown-menu.js"
import { COMPLETE_TASK, MARK_AS_NOT_DONE, MORE_ACTIONS } from "./ui/copy.js"
import { copyTaskLink, duplicateTask } from "../tasks/task-acts.js"
import { cn } from "./ui/utils.js"
import { ReferencedFrom } from "./links/referenced-from.js"
import { pageBodyClass } from "./page-head.js"

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
          "text-2xl leading-8 font-semibold hover:bg-transparent focus:bg-transparent focus:ring-0",
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
The task's one "…": complete (or not), history, copy link, duplicate, abandon
(or restore), delete. Moving is the Folder row's, in the properties block, so
it has one home.
*/
function TaskMenu({
  task,
  id,
  onToggleDone,
  onRestore,
  onAbandon,
  onDelete,
}: {
  task: { title: string; done?: boolean; abandoned?: boolean }
  id: string
  onToggleDone: () => void
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
        extra={
          <>
            <DropdownMenuItem onClick={onToggleDone}>
              <CheckCircle2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {task.done ? MARK_AS_NOT_DONE : COMPLETE_TASK}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        }
        handlers={{
          history: () => setHistoryOpen(true),
          "copy-link": () => copyTaskLink(id, task.title),
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
}: {
  task: TaskRowProps & { id: string }
  /** The close control; absent draws none. */
  onClose?: () => void
  /** "Open as full page"; absent (the full page itself) draws none. */
  onOpenFull?: () => void
  kind?: "side" | "center" | "page"
}) {
  const { task, patch, cardHandlers } = useCardWiring(props)
  const page = kind === "page"

  const header = (
    <div className={cn("flex h-12 shrink-0 items-center justify-end gap-1", page ? "-mr-2" : "px-3")}>
      {task.abandoned ? (
        <span className={cn("mr-auto text-xs text-muted-foreground", page ? "" : "px-3")}>Abandoned</span>
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
        onToggleDone={() => patch(task.id, { done: !task.done })}
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
        {header}
        <div className="pt-6 max-md:pt-2">{body}</div>
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
*/
function useEscapeCloses(onClose: () => void, self: React.RefObject<HTMLElement | null>) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase()
        if (tag === "input" || tag === "textarea" || target.isContentEditable) return
      }
      const open = document.querySelectorAll(
        '[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"]',
      )
      for (const node of open) if (node !== self.current) return
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
Side peek: a panel at the right edge. It reserves its width, so the page
narrows rather than being covered and the list beside it stays usable. It
slides in once, 150ms.
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
  useEscapeCloses(onClose, self)

  return (
    <ReservesRightEdge width={TASK_PANEL_WIDTH}>
      <aside
        ref={self}
        aria-label={task.title}
        style={{ width: TASK_PANEL_WIDTH }}
        className="fixed inset-y-0 right-0 z-40 flex max-w-full flex-col border-l border-border bg-background animate-in fade-in-0 slide-in-from-right-4 duration-150 ease-out"
      >
        <TaskView key={task.id} task={task} onClose={onClose} {...(onOpenFull ? { onOpenFull } : {})} />
      </aside>
    </ReservesRightEdge>
  )
}

/** The center peek's width on a desktop. */
export const TASK_PEEK_WIDTH = 900

/*
Center peek: the page in a centered sheet over the dimmed page. A press on the
dimmed page, the close or Escape closes it.
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
  useEscapeCloses(onClose, self)
  useEffect(() => {
    self.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/20 pt-[8vh] pb-[4vh] motion-fade"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={self}
        role="dialog"
        aria-modal="true"
        aria-label={task.title}
        tabIndex={-1}
        style={{ width: `min(${TASK_PEEK_WIDTH}px, calc(100vw - 32px))` }}
        className="flex h-full max-h-full flex-col overflow-hidden rounded-lg bg-background shadow-md outline-none motion-float"
      >
        <TaskView
          key={task.id}
          kind="center"
          task={task}
          onClose={onClose}
          {...(onOpenFull ? { onOpenFull } : {})}
        />
      </div>
    </div>
  )
}
