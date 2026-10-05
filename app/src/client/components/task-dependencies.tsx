// The task page's "Blocked by" and "Blocks" lines. Nothing draws until an edge exists
// or `/Blocked by` opens the picker. "Blocks…" posts the reverse edge. A 422 (self,
// cycle) is worded here and kept out of the toasts.
import { useEffect, useMemo, useState } from "react"

import { useFolderOpenTasks, useReferenceSearch, useTaskDependencies } from "../api/queries.js"
import { useAddTaskDependency, useRemoveTaskDependency } from "../api/mutations.js"
import { ApiError } from "../api/http.js"
import type { TaskDependencyEdge } from "../../shared/task-dependencies.js"
import { CheckCircle2, X } from "../lib/icons.js"
import { openTask } from "./task-open.js"
import { cn } from "./ui/utils.js"
import { PROPERTY_LABEL } from "./task-pickers.js"

type Mode = "depends_on" | "blocks"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const DEPENDS_ON_ACTION = "Blocked by…"
export const BLOCKS_ACTION = "Blocks…"
export const BLOCKED_BY_HEADING = "Blocked by"
export const BLOCKS_HEADING = "Blocks"

/** Why an add was refused, in words for the person. */
function refusalOf(error: unknown, mode: Mode): string {
  if (error instanceof ApiError && error.status === 422) {
    if (/itself/.test(error.message)) return "A task can't depend on itself."
    return mode === "depends_on"
      ? "Can't add: that task already waits on this one, directly or through others, so this would make a loop."
      : "Can't add: this task already waits on that one, directly or through others, so this would make a loop."
  }
  if (error instanceof ApiError && error.status === 404) {
    return "That task isn't available to you."
  }
  return "Couldn't add the dependency. Try again."
}

interface DependenciesProps {
  taskId: string
  folderId: string | undefined
  /** `/Blocked by` was chosen in the body: open on the picker. */
  opening?: boolean
  /** The block went back to having nothing to show. */
  onIdle?: () => void
}

/** Whether the server can hold a relation for this id. */
export function isRelatableTask(taskId: string): boolean {
  return UUID.test(taskId)
}

export function TaskDependencies(props: DependenciesProps) {
  // A lab fixture's id is its title; only a real task has relations.
  if (!UUID.test(props.taskId)) return null
  return <Dependencies {...props} />
}

function Dependencies({ taskId, folderId, opening = false, onIdle }: DependenciesProps) {
  const read = useTaskDependencies(taskId)
  const add = useAddTaskDependency()
  const remove = useRemoveTaskDependency()
  const [mode, setMode] = useState<Mode | null>(opening ? "depends_on" : null)
  const [refusal, setRefusal] = useState<string | null>(null)
  useEffect(() => {
    if (opening) setMode("depends_on")
  }, [opening])

  const dependsOn = read.data?.depends_on ?? []
  const blocks = read.data?.blocks ?? []
  const related = useMemo(
    () =>
      new Set(
        [...dependsOn, ...blocks].flatMap((edge) => (edge.task ? [edge.task.id] : [])),
      ),
    [dependsOn, blocks],
  )

  function pick(otherId: string) {
    if (mode === null) return
    const current = mode
    setRefusal(null)
    add.mutate(
      current === "depends_on"
        ? { dependentId: taskId, blockingId: otherId }
        : { dependentId: otherId, blockingId: taskId },
      {
        onSuccess: () => setMode(null),
        onError: (error) => setRefusal(refusalOf(error, current)),
      },
    )
  }

  const picker =
    mode === null ? null : (
      <DependencyPicker
        key={mode}
        mode={mode}
        taskId={taskId}
        folderId={folderId}
        exclude={related}
        busy={add.isPending}
        refusal={refusal}
        onPick={pick}
        onCancel={() => {
          setMode(null)
          setRefusal(null)
        }}
      />
    )

  const empty = dependsOn.length === 0 && blocks.length === 0
  const idle = empty && mode === null
  useEffect(() => {
    if (idle && read.data !== undefined) onIdle?.()
  }, [idle, read.data, onIdle])
  if (idle) return null

  return (
    <div className="flex flex-col">
      {dependsOn.length > 0 ? (
        <EdgeList
          heading={BLOCKED_BY_HEADING}
          edges={dependsOn}
          folderId={folderId}
          direction="depends_on"
          onRemove={(edge) => remove.mutate({ taskId, dependencyId: edge.id })}
        />
      ) : null}
      {blocks.length > 0 ? (
        <EdgeList
          heading={BLOCKS_HEADING}
          edges={blocks}
          folderId={folderId}
          direction="blocks"
          onRemove={(edge) => remove.mutate({ taskId, dependencyId: edge.id })}
        />
      ) : null}
      {picker === null ? null : (
        <div className={PROPERTY_LINE}>
          <span className={LINE_LABEL}>{mode === "blocks" ? BLOCKS_HEADING : BLOCKED_BY_HEADING}</span>
          {picker}
        </div>
      )}
    </div>
  )
}

// A property row's grid (`PROPERTY_ROW`) without fixed height or hover, so one line
// can list several tasks.
const PROPERTY_LINE = "grid w-full grid-cols-[6rem_minmax(0,1fr)] items-start gap-2 px-2 text-sm"
const LINE_LABEL = cn(PROPERTY_LABEL, "leading-[var(--control-height)]")

function EdgeList({
  heading,
  edges,
  folderId,
  direction,
  onRemove,
}: {
  heading: string
  edges: TaskDependencyEdge[]
  folderId: string | undefined
  direction: Mode
  onRemove: (edge: TaskDependencyEdge) => void
}) {
  return (
    <div className={PROPERTY_LINE}>
      <span className={LINE_LABEL}>{heading}</span>
      <ul className="flex min-w-0 flex-col" aria-label={heading}>
        {edges.map((edge) => (
          <EdgeRow
            key={edge.id}
            edge={edge}
            direction={direction}
            // Name the folder only when it is not this task's own.
            showFolder={edge.task !== null && edge.task.folder.id !== folderId}
            onRemove={() => onRemove(edge)}
          />
        ))}
      </ul>
    </div>
  )
}

// For "Blocks" the far task is the one waiting, so only its being finished is worth a word.
function stateWord(edge: TaskDependencyEdge, direction: Mode): string | null {
  if (edge.task === null) return null
  if (direction === "blocks") return edge.task.status === "completed" ? "Done" : null
  switch (edge.state) {
    case "satisfied":
      return "Done"
    case "unresolved":
      return "Dropped, still blocking"
    default:
      return null
  }
}

function EdgeRow({
  edge,
  direction,
  showFolder,
  onRemove,
}: {
  edge: TaskDependencyEdge
  direction: Mode
  showFolder: boolean
  onRemove: () => void
}) {
  const done = edge.task?.status === "completed"
  const word = stateWord(edge, direction)
  const title = edge.task?.title ?? "Private task"
  return (
    <li className="group/dep flex min-h-[var(--control-height)] min-w-0 items-center gap-2 text-sm">
      {done ? (
        <CheckCircle2
          className="size-3.5 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      ) : (
        <span
          aria-hidden="true"
          className="mx-[3px] size-2 shrink-0 rounded-full border border-border"
        />
      )}
      {edge.task === null ? (
        // The far task is not the viewer's to see: draw nothing beyond the relation.
        <span className="min-w-0 truncate text-muted-foreground italic">{title}</span>
      ) : (
        <button
          type="button"
          onClick={() => edge.task && openTask(edge.task.id)}
          className={cn(
            "min-w-0 truncate text-left text-foreground hover:underline focus-visible:underline focus-visible:outline-none",
            done && "text-muted-foreground line-through",
          )}
        >
          {title}
        </button>
      )}
      {showFolder && edge.task !== null ? (
        <span className="shrink-0 truncate text-muted-foreground">
          {edge.task.folder.name}
        </span>
      ) : null}
      {word ? (
        <span
          className={cn(
            "shrink-0 text-muted-foreground",
            edge.state === "unresolved" && direction === "depends_on" && "text-destructive",
          )}
        >
          {word}
        </span>
      ) : null}
      <button
        type="button"
        aria-label={`Remove dependency on ${title}`}
        title="Remove"
        onClick={onRemove}
        className="ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/dep:opacity-100 hover:text-foreground focus-visible:opacity-100"
      >
        <X className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </li>
  )
}

interface Candidate {
  id: string
  label: string
}

function DependencyPicker({
  mode,
  taskId,
  folderId,
  exclude,
  busy,
  refusal,
  onPick,
  onCancel,
}: {
  mode: Mode
  taskId: string
  folderId: string | undefined
  exclude: ReadonlySet<string>
  busy: boolean
  refusal: string | null
  onPick: (id: string) => void
  onCancel: () => void
}) {
  const [q, setQ] = useState("")
  const [active, setActive] = useState(0)
  const searching = q.trim().length >= 2
  const search = useReferenceSearch(q, folderId ?? null)

  const nearby = useNearby(folderId)
  const raw: Candidate[] = searching
    ? (search.data?.results ?? [])
        .filter((result) => result.kind === "task")
        .map((result) => ({ id: result.id, label: result.label }))
    : nearby
  const candidates = raw.filter((c) => c.id !== taskId && !exclude.has(c.id)).slice(0, 8)
  const listId = `dep-picker-${taskId}`
  const clamped = Math.min(active, Math.max(candidates.length - 1, 0))

  let status: string | null = null
  if (searching && search.isPending) status = "Searching…"
  else if (candidates.length === 0)
    status = searching ? "No matching tasks." : "Type to search your tasks."

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-card p-1.5">
      <input
        autoFocus
        role="combobox"
        aria-expanded={candidates.length > 0}
        aria-controls={listId}
        aria-activedescendant={candidates.length > 0 ? `${listId}-${clamped}` : undefined}
        aria-label={mode === "depends_on" ? "Find the task this one depends on" : "Find the task this one blocks"}
        placeholder={mode === "depends_on" ? "This task depends on…" : "This task blocks…"}
        value={q}
        disabled={busy}
        onChange={(event) => {
          setQ(event.target.value)
          setActive(0)
        }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault()
            setActive(Math.min(clamped + 1, candidates.length - 1))
          } else if (event.key === "ArrowUp") {
            event.preventDefault()
            setActive(Math.max(clamped - 1, 0))
          } else if (event.key === "Enter") {
            event.preventDefault()
            const chosen = candidates[clamped]
            if (chosen) onPick(chosen.id)
          } else if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            onCancel()
          }
        }}
        className="h-[var(--control-height)] w-full rounded bg-transparent px-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
      {refusal ? (
        <p role="alert" className="px-1.5 text-xs leading-4 text-destructive">
          {refusal}
        </p>
      ) : null}
      <ul id={listId} role="listbox" className="flex flex-col">
        {candidates.map((candidate, index) => (
          <li
            key={candidate.id}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === clamped}
            onMouseEnter={() => setActive(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(candidate.id)}
            className={cn(
              "flex h-[var(--control-height)] cursor-pointer items-center truncate rounded px-1.5 text-sm text-foreground",
              index === clamped && "bg-muted",
            )}
          >
            {candidate.label}
          </li>
        ))}
      </ul>
      {status ? (
        <p className="px-1.5 pb-0.5 text-xs leading-4 text-muted-foreground">{status}</p>
      ) : null}
    </div>
  )
}

// The empty picker offers this folder's open tasks; without a folder it asks to type.
function useNearby(folderId: string | undefined): Candidate[] {
  const read = useFolderOpenTasks(folderId ?? "", folderId !== undefined)
  if (!folderId || !read.data) return []
  return [...read.data.unscheduled, ...read.data.scheduled].map((task) => ({
    id: task.id,
    label: task.title,
  }))
}
