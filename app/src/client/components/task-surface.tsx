/*
The task's one home (REDESIGN-SPEC "Open a task", "Task panel").

On a desktop a task opens in a side panel at the right edge: the page makes
room rather than being covered, so the list the task came from stays visible
and usable, and clicking another row swaps the panel's task. Escape or the
close control shuts it. On a phone the same view is the whole page
(`pages/TaskPage.tsx`).

There is no dialog, no "Open in" choice and no new-tab arm any more: one
place, so a person never has to learn which of five a task will appear in.

The view itself is small: a header carrying the task's one "…" and the close,
the title renaming in place, and `TaskCard` for everything else.
*/

import { InlineTextarea } from "./ui/inline-field.js"
import { useEffect, useRef, useState } from "react"

import { CheckCircle2, MoreHorizontal, X } from "../lib/icons.js"
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
The task as one view, the panel's body and the phone's page alike.
*/
export function TaskView({
  task: props,
  onClose,
}: {
  task: TaskRowProps & { id: string }
  /** The close control; absent draws none. */
  onClose?: () => void
}) {
  const { task, patch, cardHandlers } = useCardWiring(props)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-end gap-1 px-3">
        {task.abandoned ? (
          <span className="mr-auto px-3 text-xs text-muted-foreground">Abandoned</span>
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
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-16 max-md:px-0">
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
      </div>
    </div>
  )
}

/*
The side panel. It reserves its width at the right edge, so the shell's page
narrows rather than being covered, and it slides in once, 150ms.

Escape closes it, unless the key was meant for something inside: a field being
edited, or an open menu or picker, each of which handles Escape itself.
*/
export function TaskPanel({
  task,
  onClose,
}: {
  task: TaskRowProps & { id: string }
  onClose: () => void
}) {
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
      if (document.querySelector('[role="menu"], [role="dialog"], [role="listbox"]')) return
      closeRef.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <ReservesRightEdge width={TASK_PANEL_WIDTH}>
      <aside
        aria-label={task.title}
        style={{ width: TASK_PANEL_WIDTH }}
        className="fixed inset-y-0 right-0 z-40 flex max-w-full flex-col border-l border-border bg-background animate-in fade-in-0 slide-in-from-right-4 duration-150 ease-out"
      >
        <TaskView key={task.id} task={task} onClose={onClose} />
      </aside>
    </ReservesRightEdge>
  )
}
