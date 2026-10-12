// The board: a page's groups drawn side by side. It hit-tests which column a card is
// released over; the page decides what landing there means.

import { useEffect, useId, useRef, useState, type ReactNode } from "react"

import { ChevronRight, Plus } from "../lib/icons.js"
import { InlineInput } from "./ui/inline-field.js"
import { CheckMark } from "./ui/checkbox.js"
import { useRowKeys } from "./row-keys.js"
import { RowMeta, TaskStar } from "./task-meta.js"
import {
  T_FAST,
  TaskList,
  type TaskListWiring,
  type TaskOpenMode,
  type TaskRowProps,
} from "./task-row.js"
import { cn } from "./ui/utils.js"

export type BoardTask = TaskRowProps & { id: string; sectionPath?: string }

export interface BoardColumn {
  key: string
  label: string
  tasks: BoardTask[]
  /** Work keeps finished cards at the end of their own group. */
  completedTasks?: BoardTask[]
  /** Nested Work sections stay inside their root column. */
  children?: BoardColumn[]
  // The group's own mark, as `GroupedList` puts on its headings.
  mark?: ReactNode
  // Cards in here are finished: titles struck through, details dropped.
  done?: boolean
  // A group nobody made (No section, Unassigned), in the quieter tone.
  quiet?: boolean
  // Whether a release can land here (AC-228). A relative column like Overdue has no value
  // a drop could write. Absent means it takes drops.
  takes?: boolean
  /** Keep an empty destination out of the layout until a card is carried. */
  revealEmptyOnDrag?: boolean
}

function columnCount(column: BoardColumn): number {
  return column.tasks.length + (column.completedTasks?.length ?? 0) + (column.children ?? []).reduce((total, child) => total + columnCount(child), 0)
}

function boardColumnAt(zones: Map<string, HTMLElement>, point: { x: number; y: number }): string | null {
  let inside: { key: string; node: HTMLElement } | null = null
  let rootBelow: { key: string; top: number } | null = null
  for (const [key, node] of zones) {
    const box = node.getBoundingClientRect()
    if (point.x < box.left || point.x > box.right || point.y < box.top) continue
    if (point.y <= box.bottom) {
      // A parent board contains its children; the smallest containing board wins.
      if (inside === null || inside.node.contains(node)) inside = { key, node }
    } else if (node.parentElement?.closest('[data-board-column]') === null && (rootBelow === null || box.top > rootBelow.top)) {
      // Keep the existing target below a short root column.
      rootBelow = { key, top: box.top }
    }
  }
  return inside?.key ?? rootBelow?.key ?? null
}

// Capture inside a column: a task added here takes the column's value.
export function BoardQuickAdd({
  onAdd,
  label = "New task",
}: {
  onAdd: (title: string) => void
  // The accessible name includes the column's, so identical rows are told apart.
  label?: string
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState("")

  if (!editing) {
    return (
      <button
        type="button"
        aria-label={label}
        onClick={() => setEditing(true)}
        className={cn(
          "flex h-[var(--control-height)] w-full items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-hover hover:text-foreground",
          // Shown on column hover or focus, always on touch, and always in an empty column.
          "opacity-0 group-hover/column:opacity-100 focus-visible:opacity-100 group-data-[empty]/column:opacity-100 [@media(hover:none)]:opacity-100",
          T_FAST,
        )}
      >
        <Plus className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        New task
      </button>
    )
  }

  return (
    <InlineInput
      autoFocus
      value={title}
      placeholder="Task name"
      aria-label="New task name"
      onChange={(event) => setTitle(event.target.value)}
      onBlur={() => {
        // Typed words are kept rather than lost to a stray click.
        const trimmed = title.trim()
        if (trimmed) onAdd(trimmed)
        setEditing(false)
        setTitle("")
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          const trimmed = title.trim()
          if (trimmed) onAdd(trimmed)
          setTitle("")
        }
        if (event.key === "Escape") {
          setEditing(false)
          setTitle("")
        }
      }}
      // One focus style only: the inline field's own ring.
      className="mx-0 h-[var(--control-height)] w-full px-2 text-sm"
    />
  )
}

// A board card on the same drag engine as a row. Opening is registered with the list
// because only the engine knows whether a press was a click or a drag.
function BoardCard({
  task,
  done,
  given,
  wiring,
  onOpen,
  onCheck,
  onStar,
}: {
  task: BoardTask
  done: boolean
  // The same `given` contract the row reads.
  given?: TaskRowProps["given"]
  wiring: TaskListWiring
  onOpen: () => void
  onCheck: () => void
  onStar: () => void
}) {
  useEffect(() => {
    wiring.onRegisterOpen(onOpen)
    return () => wiring.onRegisterOpen(null)
  })

  // A plain card keeps the star on its title line, so toggling it never resizes the card.
  const finished = done || task.status === "abandoned"
  const hasMeta =
    ((task.due !== undefined || task.starts !== undefined) && !given?.due && !done) ||
    (task.folder !== undefined && !given?.folder) ||
    ((task.blockedBy ?? 0) > 0 && !finished) ||
    ((task.assignees?.length ?? (task.assignee ? 1 : 0)) > 0 && !given?.assignee) ||
    (task.steps !== undefined && task.steps.total > 0) ||
    task.recurrence !== undefined ||
    (task.labels !== undefined && task.labels.length > 0)
  const drag = wiring.dragState
  const carried = Boolean(drag?.isActive) && !drag?.isSettling

  return (
    <div
      ref={wiring.itemRef}
      {...wiring.listProps}
      data-task-id={task.id}
      data-task-title={task.title}
      // A list item, not a button: the card sits inside `TaskList`'s `role="list"`, and
      // AC-228 addresses cards as list items. tabIndex and Enter/Space keep it operable.
      role="listitem"
      // The keyboard path (`row-keys.ts`): one Tab stop, arrows between cards.
      data-row-key=""
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === "Enter") {
          event.preventDefault()
          onOpen()
        } else if (event.key === " ") {
          event.preventDefault()
          onCheck()
        }
      }}
      style={{
        // The carried card tracks the pointer exactly, across columns too; others ease.
        transform:
          drag && (drag.offset !== 0 || (drag.crossOffset ?? 0) !== 0)
            ? `translate3d(${drag.crossOffset ?? 0}px, ${drag.offset}px, 0)`
            : undefined,
        transition: carried
          ? "box-shadow var(--duration-fast) var(--ease-standard)"
          : "transform var(--duration-base) var(--ease-enter), box-shadow var(--duration-base) var(--ease-enter)",
        zIndex: carried ? 30 : undefined,
      }}
      className={cn(
        "group/row @container/card relative cursor-pointer rounded-md border border-border bg-background px-2.5 py-2 transition-colors hover:bg-hover",
        T_FAST,
        carried && "cursor-grabbing shadow-[var(--elevation-2)]",
      )}
    >
      <span className="flex items-start gap-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
          onClick={(event) => {
            event.stopPropagation()
            onCheck()
          }}
          className="relative mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm pointer-coarse:before:absolute pointer-coarse:before:-inset-2"
        >
          <CheckMark checked={done} />
        </button>
        <span
          className={cn(
            "min-w-0 flex-1 text-sm text-foreground",
            (done || task.status === "abandoned") && "text-muted-foreground",
            (done || task.status === "abandoned") &&
              "line-through decoration-muted-foreground",
          )}
        >
          {task.title}
        </span>
        {!hasMeta ? <TaskStar
          important={Boolean(task.important)}
          {...(task.importantTooltip === undefined ? {} : { tooltip: task.importantTooltip })}
          onToggle={onStar}
          touchReachable
        /> : null}
      </span>
      {task.sectionPath ? <span className="block truncate pl-7 text-xs text-muted-foreground">{task.sectionPath}</span> : null}
      {/* The shared meta line (`task-meta.tsx`). A finished card drops its date. */}
      {hasMeta ? (
        <RowMeta
          className={"-mb-1 mt-0.5 w-full justify-between pl-7"}
          source={{
            ...(task.due === undefined ? {} : { due: task.due }),
            ...(task.starts === undefined ? {} : { starts: task.starts }),
            ...(task.folder === undefined ? {} : { folder: task.folder }),
            ...(task.assignee === undefined ? {} : { assignee: task.assignee }),
            ...(task.assignees === undefined ? {} : { assignees: task.assignees }),
            ...(task.steps === undefined ? {} : { steps: { done: task.steps.complete, total: task.steps.total } }),
            ...(task.recurrence === undefined ? {} : { recurrence: task.recurrence }),
            ...(task.labels === undefined ? {} : { labels: task.labels }),
            blockedBy: task.blockedBy ?? 0,
            finished,
            important: Boolean(task.important),
            ...(task.importantTooltip === undefined ? {} : { importantTooltip: task.importantTooltip }),
          }}
          given={{ ...given, ...(done ? { due: true } : {}) }}
          onToggleImportant={onStar}
          starTouchReachable
        />
      ) : null}
      {/* What a release would do, in words (AC-228 reads "Into {column}" mid-drag). */}
      {wiring.proposal === undefined ? null : (
        <span className="pointer-events-none absolute top-1/2 right-2 z-40 -translate-y-1/2 rounded-sm bg-foreground px-2 py-0.5 text-xs font-medium whitespace-nowrap text-background">
          {wiring.proposal}
        </span>
      )}
    </div>
  )
}

function CompletedCards({ column, columns, zones, onOpenTask, onToggleComplete, onToggleImportant, onDropIn, onDragStateChange, given }: {
  column: BoardColumn
  columns: BoardColumn[]
  zones: React.RefObject<Map<string, HTMLElement>>
  onOpenTask: (taskId: string, mode?: TaskOpenMode) => void
  onToggleComplete: (taskId: string, done: boolean) => void
  onToggleImportant: (taskId: string) => void
  onDropIn: (taskId: string, columnKey: string) => boolean
  onDragStateChange: (dragging: boolean) => void
  given?: TaskRowProps['given']
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const tasks = column.completedTasks
  if (tasks === undefined || tasks.length === 0) return null
  const columnAt = (point: { x: number; y: number }): string | null => boardColumnAt(zones.current, point)
  return <div className="pt-2">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}
      className="flex h-[var(--control-height)] w-full items-center gap-2 rounded-md px-2 text-left text-sm text-muted-foreground hover:bg-hover hover:text-foreground">
      <ChevronRight className={cn('size-4 transition-transform duration-[var(--duration-fast)]', open && 'rotate-90')} aria-hidden="true" />
      <span>Completed tasks</span><span className="text-xs tabular-nums text-quiet-foreground">{tasks.length}</span>
    </button>
    {open ? <div id={id} className="pt-1">
      <TaskList
        className="gap-1.5"
        tasks={tasks}
        followAcross
        onDragStateChange={onDragStateChange}
        onTaskOpen={onOpenTask}
        onDropAt={(taskId, point) => {
          const landing = columnAt(point)
          return landing !== null && landing !== column.key && onDropIn(taskId, landing)
        }}
        onOver={(_taskId, point) => {
          const landing = columnAt(point)
          if (landing === null || landing === column.key) return null
          const named = columns.find((entry) => entry.key === landing)
          return named === undefined || named.takes === false ? null : `Into ${named.label}`
        }}
        renderRow={(task, wiring) => <BoardCard key={task.id} task={task} done given={given} wiring={wiring}
          onOpen={() => onOpenTask(task.id)} onCheck={() => onToggleComplete(task.id, false)} onStar={() => onToggleImportant(task.id)} />}
      />
    </div> : null}
  </div>
}

function NestedBoardColumn({ column, columns, zones, onOpenTask, onToggleComplete, onToggleImportant, onDropIn, onDragStateChange, given, quickAdd, subsectionAdd }: {
  column: BoardColumn
  columns: BoardColumn[]
  zones: React.RefObject<Map<string, HTMLElement>>
  onOpenTask: (taskId: string, mode?: TaskOpenMode) => void
  onToggleComplete: (taskId: string, done: boolean) => void
  onToggleImportant: (taskId: string) => void
  onDropIn: (taskId: string, columnKey: string) => boolean
  onDragStateChange: (dragging: boolean) => void
  given?: TaskRowProps['given']
  quickAdd?: (column: BoardColumn) => ReactNode
  subsectionAdd?: (column: BoardColumn) => ReactNode
}) {
  const columnAt = (point: { x: number; y: number }): string | null => boardColumnAt(zones.current, point)
  return <section
    aria-label={column.label}
    data-board-column={column.key}
    data-empty={columnCount(column) === 0 ? '' : undefined}
    ref={(node) => { if (node) zones.current.set(column.key, node); else zones.current.delete(column.key) }}
    className="group/column ml-2 mt-2 border-l border-border pl-2"
  >
    <div className="mb-1 flex h-7 items-center gap-1.5 px-1 text-sm font-section">
      <span className="min-w-0 flex-1 truncate">{column.label}</span>
      <span className="text-xs text-quiet-foreground tabular-nums">{columnCount(column)}</span>
    </div>
    <TaskList
      className="gap-1.5"
      tasks={column.tasks}
      followAcross
      onDragStateChange={onDragStateChange}
      onTaskOpen={onOpenTask}
      onDropAt={(taskId, point) => {
        const landing = columnAt(point)
        return landing !== null && landing !== column.key && onDropIn(taskId, landing)
      }}
      onOver={(_taskId, point) => {
        const landing = columnAt(point)
        if (landing === null || landing === column.key) return null
        const named = columns.find((entry) => entry.key === landing)
        return named === undefined || named.takes === false ? null : `Into ${named.label}`
      }}
      renderRow={(task, wiring) => {
        const done = column.done || task.status === 'completed'
        return <BoardCard key={task.id} task={task} done={done} given={given} wiring={wiring} onOpen={() => onOpenTask(task.id)} onCheck={() => onToggleComplete(task.id, !done)} onStar={() => onToggleImportant(task.id)} />
      }}
    />
    {quickAdd ? <div className="pt-1">{quickAdd(column)}</div> : null}
    {column.children?.map((child) => <NestedBoardColumn key={child.key} column={child} columns={columns} zones={zones} onOpenTask={onOpenTask} onToggleComplete={onToggleComplete} onToggleImportant={onToggleImportant} onDropIn={onDropIn} onDragStateChange={onDragStateChange} given={given} quickAdd={quickAdd} subsectionAdd={subsectionAdd} />)}
    {subsectionAdd?.(column)}
    <CompletedCards column={column} columns={columns} zones={zones} onOpenTask={onOpenTask} onToggleComplete={onToggleComplete} onToggleImportant={onToggleImportant} onDropIn={onDropIn} onDragStateChange={onDragStateChange} given={given} />
  </section>
}

export function TaskBoard({
  columns,
  onOpenTask,
  onToggleComplete,
  onToggleImportant,
  onDropIn,
  given,
  columnLead,
  columnRef,
  footer,
  quickAdd,
  subsectionAdd,
  grid = "grid-cols-2",
}: {
  columns: BoardColumn[]
  onOpenTask: (taskId: string, mode?: TaskOpenMode) => void
  onToggleComplete: (taskId: string, done: boolean) => void
  onToggleImportant: (taskId: string) => void
  // Return true if the page took the card, so the column's list leaves its order alone.
  onDropIn: (taskId: string, columnKey: string) => boolean
  // What this board's columns and page have already said.
  given?: TaskRowProps["given"]
  // Anything the column heading needs before its mark (the folder page's grip).
  columnLead?: (column: BoardColumn) => ReactNode
  // The folder page reorders columns by pointer and needs their elements.
  columnRef?: (column: BoardColumn) => (element: HTMLElement | null) => void
  // Capture inside a column, with that group's value.
  quickAdd?: (column: BoardColumn) => ReactNode
  /** Work's nested section creation, after a column's existing children. */
  subsectionAdd?: (column: BoardColumn) => ReactNode
  // After the last column: the folder page's "Add section".
  footer?: ReactNode
  // The column grid: two by default; a status board is three across.
  grid?: string
}) {
  const zones = useRef(new Map<string, HTMLElement>())
  const [dragging, setDragging] = useState(false)
  const keys = useRowKeys<HTMLDivElement>()
  const allColumns = (columns: BoardColumn[]): BoardColumn[] => columns.flatMap((column) => [column, ...allColumns(column.children ?? [])])
  const everyColumn = allColumns(columns)

  // Nested columns share their parent's box, so the innermost under the pointer wins.
  // Below a short root column its lane is still a target.
  function columnAt(point: { x: number; y: number }) {
    return boardColumnAt(zones.current, point)
  }

  return (
    <div ref={keys} className={cn("grid items-start gap-3 pb-4", grid)}>
      {columns.filter((column) => !column.revealEmptyOnDrag || columnCount(column) > 0 || dragging).map((column) => (
        // A named region per column; AC-221, AC-228 and AC-259 reach columns by name.
        <section
          key={column.key}
          aria-label={column.label}
          data-board-column={column.key}
          data-empty={columnCount(column) === 0 ? "" : undefined}
          ref={(node) => {
            if (node) zones.current.set(column.key, node)
            else zones.current.delete(column.key)
            columnRef?.(column)(node)
          }}
          // No frame: an empty column stays as short as its heading and "New task".
          className="group/column flex flex-col"
        >
          <div className="group/col mb-1 flex h-7 items-center gap-1.5 px-1">
            {columnLead?.(column)}
            {column.mark}
            {/* Plain heading text; groups nobody made (and Done) in the quieter ink. */}
            <span
              className={cn(
                "min-w-0 truncate text-sm font-section",
                column.quiet ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {column.label}
            </span>
            {/* The count sits at the far end, apart from the name. */}
            <span className="ml-auto text-xs text-quiet-foreground tabular-nums">
              {columnCount(column)}
            </span>
          </div>

          <TaskList
            className="gap-1.5"
            tasks={column.tasks}
            followAcross
            onDragStateChange={setDragging}
            onTaskOpen={onOpenTask}
            onDropAt={(taskId, point) => {
              const landing = columnAt(point)
              if (landing === null || landing === column.key) return false
              return onDropIn(taskId, landing)
            }}
            // The same hit test the drop uses, so the card's promise and the release agree.
            onOver={(_taskId, point) => {
              const landing = columnAt(point)
              if (landing === null || landing === column.key) return null
              const named = everyColumn.find((entry) => entry.key === landing)
              // A column that cannot take the release is not proposed.
              if (named === undefined || named.takes === false) return null
              return `Into ${named.label}`
            }}
            renderRow={(task, wiring) => {
              const done = column.done || task.status === "completed"
              return (
                <BoardCard
                  key={task.id}
                  task={task}
                  done={done}
                  given={given}
                  wiring={wiring}
                  onOpen={() => onOpenTask(task.id)}
                  onCheck={() => onToggleComplete(task.id, !done)}
                  onStar={() => onToggleImportant(task.id)}
                />
              )
            }}
          />

          {/* Right after the last card, not pinned to the column's foot. */}
          {quickAdd ? <div className="pt-1">{quickAdd(column)}</div> : null}
          {column.children?.map((child) => (
            <NestedBoardColumn key={child.key} column={child} columns={everyColumn} zones={zones} onOpenTask={onOpenTask} onToggleComplete={onToggleComplete} onToggleImportant={onToggleImportant} onDropIn={onDropIn} onDragStateChange={setDragging} given={given} quickAdd={quickAdd} subsectionAdd={subsectionAdd} />
          ))}
          {subsectionAdd?.(column)}
          <CompletedCards column={column} columns={everyColumn} zones={zones} onOpenTask={onOpenTask} onToggleComplete={onToggleComplete} onToggleImportant={onToggleImportant} onDropIn={onDropIn} onDragStateChange={setDragging} given={given} />
        </section>
      ))}
      {footer}
    </div>
  )
}
