/*
A task's one page (M4): /app/tasks/:id, in the app's shell, on every screen.
There is no peek. One column: the title with its state mark and the task's
one "…", then `TaskCard` (properties and the task's document). History lives
behind that same "…" rather than taking a row at the end of the page.
*/

import { InlineTextarea } from "./ui/inline-field.js"
import { useEffect, useRef, useState } from "react"

import { X } from "../lib/icons.js"
import { TITLE_REQUIRED, tooLong } from "./task-copy.js"
/* 10.3's number for the field, from the shared contract rather than restated. */
import { TASK_TITLE_LIMIT } from "../../shared/tasks.js"
import { TaskCard, stateOf } from "./task-card.js"
import { useCardWiring, type TaskRowProps } from "./task-row.js"
import { ObjectMenu } from "./object-menu.js"
import { TaskHistory } from "./thread/TaskHistory.js"
import { copyTaskLink, duplicateTask } from "../tasks/task-acts.js"
import { cn } from "./ui/utils.js"
import { Button } from "./ui/button.js"
import { StateMark } from "./thread/timeline/state.js"
import { prefetchTask } from "../api/queries.js"
import { useQueryClient } from "@tanstack/react-query"

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
  /* Enter and Escape settle the field themselves and then blur it; the blur
     that follows must not commit again (a second PATCH on Enter, and on
     Escape the stale draft, which put back the very edit Escape refused). */
  const settled = useRef(false)

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
      {/* The page's heading and the tab's name (app-shell reads data-page-title);
          the field below is where it is read and renamed. */}
      <h1 data-page-title="" className="sr-only">{value}</h1>
      <InlineTextarea
        rows={1}
        value={editing ? draft : value}
        /* 9.3's field name; tests address the title as a field. */
        aria-label="title"
        aria-invalid={refusal !== null}
        onFocus={() => {
          settled.current = false
          setDraft(value)
          setEditing(true)
        }}
        onChange={(event) => {
          setDraft(event.target.value)
          if (refusal !== null) setRefusal(null)
        }}
        onBlur={() => {
          if (settled.current) {
            settled.current = false
            return
          }
          commit(draft)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commit(draft)
            settled.current = true
            event.currentTarget.blur()
          }
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            setDraft(value)
            setRefusal(null)
            setEditing(false)
            settled.current = true
            event.currentTarget.blur()
          }
        }}
        className={cn(
          "text-[length:var(--text-title-size)] leading-[var(--text-title-line)] font-title hover:bg-transparent focus:bg-transparent",
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

/* The task's one "…": history, copy link, duplicate, delete. Status carries
   Drop and Restore, so those are not repeated here. */
function TaskMenu({
  id,
  title,
  onHistory,
  onDelete,
}: {
  id: string
  title: string
  onHistory: () => void
  onDelete?: () => void
}) {
  return (
    <ObjectMenu
      kind="task"
      name={title}
      width="w-56"
      handlers={{
        history: onHistory,
        "copy-link": () => copyTaskLink(id),
        duplicate: () => duplicateTask(id, title),
        delete: onDelete,
      }}
    />
  )
}

export function TaskView({
  task: props,
  onClose,
}: {
  task: TaskRowProps & { id: string }
  /** The phone's close; absent draws none. */
  onClose?: () => void
}) {
  const { task, patch, cardHandlers } = useCardWiring(props)
  const state = stateOf(task)
  const [historyOpen, setHistoryOpen] = useState(false)

  return (
    <div className="flex flex-col gap-4 pt-2 pb-24">
      <div className="flex min-w-0 items-start gap-2">
        <span className="flex h-[var(--text-title-line)] shrink-0 items-center">
          <StateMark state={state} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Title
            /* A different task is a fresh draft. */
            key={props.id}
            value={task.title}
            done={state !== "open"}
            onRename={(title) => patch(task.id, { title })}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <TaskMenu
            id={props.id}
            title={task.title}
            onHistory={() => setHistoryOpen(true)}
            {...(props.onDelete === undefined ? {} : { onDelete: props.onDelete })}
          />
          {onClose ? (
            <Button type="button" variant="ghost" size="icon" aria-label="Close task" title="Close task" onClick={onClose}>
              <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
      <TaskCard task={task} patch={patch} {...cardHandlers} />
      <TaskHistory
        key={task.id}
        taskId={task.id}
        folderId={task.folder?.id ?? null}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  )
}

/*
Opening a task waits for its read. Start it when a row is pressed, or hovered
for a moment, so by the click's end the data is usually here and the page
draws at once. Mounted once, by the host.
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
