// A task's page: title with its state mark and "…" menu, then `TaskCard`. History opens
// from the menu.

import { CoverLine } from "./page-head.js"
import { InlineTextarea } from "./ui/inline-field.js"
import { useEffect, useRef, useState } from "react"

import { MessagesSquare, X } from "../lib/icons.js"
import { TITLE_REQUIRED, tooLong } from "./task-copy.js"
import { TASK_TITLE_LIMIT } from "../../shared/tasks.js"
import { TaskCard, stateOf } from "./task-card.js"
import { useCardWiring, type TaskRowProps } from "./task-row.js"
import { ObjectMenu } from "./object-menu.js"
import { TaskHistory } from "./thread/TaskHistory.js"
import { copyTaskLink, duplicateTask } from "../tasks/task-acts.js"
import { cn } from "./ui/utils.js"
import { Button } from "./ui/button.js"
import { prefetchTask, useFolder, useTask } from "../api/queries.js"
import { useDiscussTask } from "../api/consultation.js"
import { closeChatDock, openChatDock, useChatDock } from "../state/chat-dock.js"
import { useQueryClient } from "@tanstack/react-query"

// The title, renamed in place. Required, 1 to 300, refused inline (AC-161).
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
  // Enter and Escape settle the field and then blur it; the blur must not commit again.
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
      {/* The page heading and tab name (app-shell reads data-page-title). */}
      <h1 data-page-title="" className="sr-only">{value}</h1>
      <InlineTextarea
        rows={1}
        value={editing ? draft : value}
        // Tests address the title as a field by this name.
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

// Status carries Drop and Restore, so the menu does not repeat them.
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

// Opens the task's discussion in the sidebar, creating one if needed. Shown once the
// project has a teammate or the task already has a thread.
function OpenDiscussion({ taskId }: { taskId: string }) {
  const detail = useTask(taskId)
  const discuss = useDiscussTask()
  const dockOpen = useChatDock() !== null
  const folder = detail.data?.folder
  const page = useFolder(folder?.id ?? "", folder !== undefined && !folder.is_default)
  const projectId = page.data?.project_id ?? null
  const project = useFolder(projectId ?? "", projectId !== null)
  if (detail.data === undefined || folder === undefined || folder.is_default) return null
  const linked = detail.data.linked_discussions[0]
  const teammates = (project.data?.members.length ?? 0) > 1
  if (linked === undefined && !teammates) return null

  function toggle(): void {
    if (folder === undefined) return
    if (dockOpen) {
      closeChatDock()
      return
    }
    if (linked !== undefined) {
      openChatDock({ folderId: folder.id, discussionId: linked.id })
      return
    }
    discuss.mutate(taskId, {
      onSuccess: ({ discussion }) => {
        openChatDock({ folderId: folder.id, discussionId: discussion.id })
      },
    })
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={dockOpen ? "Close discussion" : "Discuss this task"}
      title={dockOpen ? "Close discussion" : "Discuss this task"}
      aria-pressed={dockOpen}
      className={dockOpen ? "bg-hover text-foreground" : undefined}
      disabled={discuss.isPending}
      onClick={toggle}
    >
      <MessagesSquare className="size-4" strokeWidth={1.75} aria-hidden="true" />
    </Button>
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
  // Keyed to the task id: task routes can replace this view in place, and a boolean
  // would leave the next task's History open.
  const [historyFor, setHistoryFor] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4 pt-2 pb-24">
      {/* The cover line's height, so the title starts where a page title does. */}
      <div className="-mb-3"><CoverLine /></div>
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <Title
            // A different task is a fresh draft.
            key={props.id}
            value={task.title}
            done={state !== "open"}
            onRename={(title) => patch(task.id, { title })}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <OpenDiscussion taskId={props.id} />
          <TaskMenu
            id={props.id}
            title={task.title}
            onHistory={() => setHistoryFor(task.id)}
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
        open={historyFor === task.id}
        onOpenChange={(open) => setHistoryFor(open ? task.id : null)}
      />
    </div>
  )
}

// Prefetch a task when its row is pressed or hovered briefly, so the page draws at once.
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
