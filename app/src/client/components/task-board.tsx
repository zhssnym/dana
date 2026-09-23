/*
The board: a page's grouping, drawn side by side instead of stacked.

**A view is a shape, not a question.** The page decides which tasks; `Group by`
decides what they are grouped by; a view decides only how those groups are
drawn. So this is not a second way of arranging a page, it is the arrangement
the page already has, turned ninety degrees. Which is also why there is one
board rather than one per screen: the folder page's sections and Today's folders
are the same list of groups.

**Geometry here, meaning at the call site.** A card released over a column is a
question only this component can answer, it owns the columns' rectangles, and an
act only the page can perform: on a folder that means putting the task in a
section, on Today it means moving it to another folder, and in the Done column
it means completing it. So the board hit-tests and reports the column; the page
decides what landing there means. Same seam as `onDropAt` one level down, and
the same reason.

Two columns per row, because a one-row board is too short.
*/

import { useEffect, useRef, useState, type ReactNode } from "react"

import { ListChecks, MessageSquare, Plus, Star } from "../lib/icons.js"
import { InlineInput } from "./ui/inline-field.js"
import { Face } from "./person-face.js"
import {
  FOCUS,
  T_FAST,
  TaskList,
  type TaskListWiring,
  type TaskOpenMode,
  type TaskRowProps,
} from "./task-row.js"
import { commentCount } from "../tasks/task-model.js"
import { cn } from "./ui/utils.js"

export type BoardTask = TaskRowProps & { id: string }

export interface BoardColumn {
  key: string
  label: string
  tasks: BoardTask[]
  /* A folder's mark, a person's face, a calendar, whatever the group's own
     kind of thing is. The same marks `GroupedList` puts on its headings. */
  mark?: ReactNode
  /* Cards in here are finished. Their titles strike through and their
     details are dropped, exactly as a completed row's are. */
  done?: boolean
  /* A group nobody made: No section, Unassigned, No due date. Named in the
     quieter tone the list's own headings use for them. */
  quiet?: boolean
  /*
  Whether a release can land here at all (AC-228). A column grouping by a
  relation to today — Overdue — has no value a drop could write, so it must not
  promise one while a card is over it. Absent means it takes drops, which is
  every column's answer but that one.
  */
  takes?: boolean
}

/* -------------------------------------------------------------- capture, */

/*
Capture inside a column: a ghost that becomes a real field.

**Adding here means adding with this column's value**, that is the whole reason
a board has one per column rather than one button for the page. A task typed
into the Home column is in Home; one typed into Sara's column is Sara's. The
column already says where the task will land, which is what a capture point
should do and what a floating button cannot.

Every board has it, so a board can be worked in and not only looked at.
*/
export function BoardQuickAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState("")

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] leading-4 text-[var(--color-graphite-400)] transition-colors hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-700)]",
          T_FAST,
          FOCUS,
        )}
      >
        <Plus className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
        Add task
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
      className={cn(
        "h-9 w-full rounded-md border border-[var(--color-graphite-300)] bg-card px-2.5 text-[13px] leading-5 outline-none",
        "placeholder:text-[var(--color-graphite-400)] focus-visible:border-[var(--color-dana-accent-600)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-100)]",
      )}
    />
  )
}

/*
A new column, where a column is a thing you can make.

A column on this board is a *value* of the axis it is grouped by, so whether you
can add one is not the board's decision, it is a fact about the axis. Sections
are things a person makes, and so are folders, so those boards offer it and say
the name of the thing. A person is not something you create because you wanted a
column for them, and every date already exists, so those boards do not offer it
at all rather than offering it and refusing.
*/
export function BoardAddColumn({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-10 items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--color-graphite-300)] text-[12px] leading-4 text-[var(--color-graphite-400)] transition-colors hover:border-[var(--color-graphite-400)] hover:text-[var(--color-graphite-600)]",
        T_FAST,
        FOCUS,
      )}
    >
      <Plus className="size-3.5" strokeWidth={2} aria-hidden="true" />
      {label}
    </button>
  )
}

/* ---------------------------------------------------------------- card, */

/*
A board card, on the same drag engine as a row.

`TaskList` carries the cards and this keeps only the presentation, so the board
can do as much with a task as the list beside it: a card is the row's kin, not a
stranger, completed and starred where it stands, wearing the row's own marks.

**Opening is registered rather than handled.** A press that stays still opens
the task and one that travels drags it, and only the engine knows which; a plain
`onClick` fires after a drag too, on whatever card happened to be under the
cursor. So the card hands its opener to the list, exactly as `TaskRow` does.
*/
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
  /* What the board and the page have already said, the same contract the row
     reads. It reaches here because a card is the row's kin. */
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

  const threadCount = commentCount(task.comments)
  const showDue = Boolean(task.due) && !given?.due
  const showFace = Boolean(task.assignee) && !given?.assignee
  const drag = wiring.dragState
  const carried = Boolean(drag?.isActive) && !drag?.isSettling

  return (
    <div
      ref={wiring.itemRef}
      {...wiring.listProps}
      /*
      A list item, not a button. 9.1's roles table fixes "a board column is a
      named region; its cards, list items or rows", and the card sits inside
      `TaskList`'s own `role="list"`, so a `button` there would be an item of a
      list announcing itself as a control. AC-228 addresses exactly this,
      `regionOf(column).getByRole('listitem')`.

      Nothing operable is given up. The `tabIndex` and the Enter/Space handler
      below stay, so the card is still reached and opened from the keyboard;
      what changes is the word a screen reader says, and the word 9.1 chose is
      the one that tells a person how many cards the column holds. The row does
      the same, on this element rather than an inner one and for the same
      reason: this is what the list holds and what the drag engine moves.
      */
      role="listitem"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen()
        }
      }}
      style={{
        /* The carried card tracks the pointer exactly; the ones making space
           for it ease. Same arrangement as the row's ExpandShell. */
        transform:
          drag && drag.offset !== 0 ? `translate3d(0, ${drag.offset}px, 0)` : undefined,
        transition: carried
          ? "box-shadow var(--duration-fast) var(--ease-standard)"
          : "transform var(--duration-base) var(--ease-enter), box-shadow var(--duration-base) var(--ease-enter)",
        zIndex: carried ? 30 : undefined,
      }}
      className={cn(
        "group/card relative cursor-pointer rounded-md border border-[var(--color-graphite-200)] bg-card px-2.5 py-2 transition-shadow hover:shadow-[var(--elevation-1)]",
        T_FAST,
        FOCUS,
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
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded",
            FOCUS,
          )}
        >
          <span
            className={cn(
              "flex size-4 items-center justify-center rounded-[3px] border transition-[background-color,border-color]",
              T_FAST,
              done
                ? "border-[var(--color-success-600)] bg-[var(--color-success-600)]"
                : "border-input bg-background",
            )}
          >
            <svg viewBox="0 0 20 20" className="size-3" aria-hidden="true">
              <path
                d="M4 10.5 L8.2 14.5 L16 5.8"
                fill="none"
                className="stroke-[var(--color-graphite-0)]"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  strokeDasharray: 20,
                  strokeDashoffset: done ? 0 : 20,
                  transition: "stroke-dashoffset var(--duration-base) var(--ease-enter)",
                }}
              />
            </svg>
          </span>
        </button>
        <span
          className={cn(
            "min-w-0 flex-1 text-[14px] leading-5 text-[var(--color-graphite-800)]",
            (done || task.status === "abandoned") &&
              "text-[var(--color-graphite-500)] line-through decoration-[var(--color-graphite-400)]",
          )}
        >
          {task.title}
        </span>
        <button
          type="button"
          /* The names are 9.1's and 9.5's, "Important" when on and "Mark as
             important" when off, the same control as the row's star. */
          aria-label={task.important ? "Important" : "Mark as important"}
          aria-pressed={task.important || undefined}
          onClick={(event) => {
            event.stopPropagation()
            onStar()
          }}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded transition-opacity",
            T_FAST,
            FOCUS,
            task.important && !given?.important
              ? "text-[var(--color-graphite-900)] opacity-100"
              : task.important
                ? "text-[var(--color-graphite-600)] opacity-100"
                : "text-[var(--color-graphite-400)] opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 hover:text-[var(--color-graphite-600)]",
          )}
        >
          <Star
            className={cn(
              "size-4 data-[size=sm]:size-4",
              task.important && !given?.important && "fill-current",
            )}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </button>
      </span>
      {(showDue || task.steps || threadCount > 0 || showFace) && !done ? (
        <span className="mt-1.5 flex items-center gap-2.5 pl-7">
          {showDue && task.due ? (
            <span
              className={cn(
                "text-[12px] leading-4",
                task.due.overdue && !given?.overdue
                  ? "font-medium text-[var(--color-danger-700)]"
                  : "text-[var(--color-graphite-500)]",
              )}
            >
              {task.due.label}
            </span>
          ) : null}
          {task.steps ? (
            <span className="inline-flex items-center gap-1 text-[12px] leading-4 text-[var(--color-graphite-500)] tabular-nums">
              <ListChecks
                className="size-3.5 data-[size=sm]:size-3.5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {task.steps.complete}/{task.steps.total}
            </span>
          ) : null}
          {threadCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-[12px] leading-4 text-[var(--color-graphite-500)] tabular-nums">
              <MessageSquare
                className="size-3.5 data-[size=sm]:size-3.5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {threadCount}
            </span>
          ) : null}
          {showFace && task.assignee ? (
            <Face person={task.assignee} className="ml-auto" />
          ) : null}
        </span>
      ) : null}
      {/*
      **What a release would do, said in words.**

      The rule is the same at both ends of a drag, "a container takes the drop
      and says so", words rather than an outline, and AC-228 reads "Into
      {column}" while the pointer is still down, which is the one moment it
      exists. `TaskList` hands the card the engine's answer. Same slot and same
      treatment as the row's, so a card and a row say the same thing the same
      way.
       */}
      {wiring.proposal === undefined ? null : (
        <span className="pointer-events-none absolute top-1/2 right-2 z-40 -translate-y-1/2 rounded-full bg-[var(--color-graphite-900)] px-2 py-0.5 text-[0.625rem] font-medium whitespace-nowrap text-[var(--color-graphite-50)]">
          {wiring.proposal}
        </span>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- board, */

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
}: {
  columns: BoardColumn[]
  onOpenTask: (taskId: string, mode?: TaskOpenMode) => void
  onToggleComplete: (taskId: string, done: boolean) => void
  onToggleImportant: (taskId: string) => void
  /*
  A card was released over this column. Return true if the page took it, so
  the column's own list leaves its order alone, the same contract
  `use-sortable-list` uses one level down, and the same reason: only the page
  knows what landing somewhere *means*.
  */
  onDropIn: (taskId: string, columnKey: string) => boolean
  /* What this board's columns and its page have already said. */
  given?: TaskRowProps["given"]
  /* Anything the column's heading needs before its mark, the folder page's
     grip, which is the one board where columns are a person's own order. */
  columnLead?: (column: BoardColumn) => ReactNode
  /* The folder page reorders columns by pointer and needs their elements. */
  columnRef?: (column: BoardColumn) => (element: HTMLElement | null) => void
  /* Capture inside a column: adding here means adding *with this group's
     value*, which is the whole reason a board has one per column. */
  quickAdd?: (column: BoardColumn) => ReactNode
  /* After the last column, the folder page's "Add section". */
  footer?: ReactNode
}) {
  const zones = useRef(new Map<string, HTMLElement>())

  function columnAt(point: { x: number; y: number }) {
    for (const [key, node] of zones.current) {
      const box = node.getBoundingClientRect()
      if (
        point.x >= box.left &&
        point.x <= box.right &&
        point.y >= box.top &&
        point.y <= box.bottom
      ) {
        return key
      }
    }
    return null
  }

  return (
    <div className="grid grid-cols-2 items-start gap-3 pb-4">
      {columns.map((column) => (
        /*
        9.1's regions rule makes a board column "a named region, named by its
        value", and AC-221, AC-228 and AC-259 all reach a column through
        `regionOf(page, name)`. A `section` carrying an accessible name is a
        region; the label is the column's own, which is the value the region is
        named by.
        */
        <section
          key={column.key}
          aria-label={column.label}
          data-board-column={column.key}
          ref={(node) => {
            if (node) zones.current.set(column.key, node)
            else zones.current.delete(column.key)
            columnRef?.(column)(node)
          }}
          className="flex min-h-[280px] flex-col rounded-lg bg-[var(--color-graphite-50)] p-2 transition-shadow"
        >
          <div className="group/col flex h-7 items-center gap-1.5 px-1">
            {columnLead?.(column)}
            {column.mark}
            <span
              className={cn(
                "min-w-0 truncate text-[12px] leading-4 font-medium",
                column.quiet
                  ? "text-[var(--color-graphite-400)]"
                  : "text-[var(--color-graphite-600)]",
              )}
            >
              {column.label}
            </span>
            <span className="text-[12px] leading-4 text-[var(--color-graphite-400)] tabular-nums">
              {column.tasks.length}
            </span>
          </div>

          <TaskList
            className="flex-1 gap-1.5"
            tasks={column.tasks}
            onTaskOpen={onOpenTask}
            onDropAt={(taskId, point) => {
              const landing = columnAt(point)
              if (landing === null || landing === column.key) return false
              return onDropIn(taskId, landing)
            }}
            /*
            The words the carried card wears, from this board's own geometry. It
            is the same hit test the drop uses, asked one moment earlier, so
            what the card promises and what the release does cannot come apart.
            A column the page has nothing to write into is not proposed, which
            is `onDropIn` answering false for it.
            */
            onOver={(_taskId, point) => {
              const landing = columnAt(point)
              if (landing === null || landing === column.key) return null
              const named = columns.find((entry) => entry.key === landing)
              /* And a column that cannot take the release is not proposed, so
                 the promise and the act agree. */
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

          {quickAdd ? <div className="mt-auto pt-1">{quickAdd(column)}</div> : null}
        </section>
      ))}
      {footer}
    </div>
  )
}
