// The task row and the list around it: checkbox, title, muted meta, star. The list adds
// drag, the hold that makes a page of two tasks, and Shift/Cmd-click selection.

import { InlineInput } from "./ui/inline-field.js"
import {
  FolderPlus,
} from "../lib/icons.js"
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"

import { FolderMark } from "./folder-mark.js"
import { folderLibrary } from "../lib/folder-library.js"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.js"
import { COMPLETE_TASK, MARK_AS_NOT_DONE } from "./ui/copy.js"
import { useTaskWriter } from "../tasks/task-writer.js"
import {
  repeatShort,
  stepCount,
  type ConceptLabel,
  type ConceptStep,
  type ConceptTask,
} from "../tasks/task-model.js"
import { useSortableList } from "../lib/use-sortable-list.js"
import type { SortableItemState } from "../lib/use-sortable-list.js"
import { cn } from "./ui/utils.js"
import { RowMeta } from "./task-meta.js"
import { CheckMark } from "./ui/checkbox.js"

export const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
export const T_BASE = "duration-[var(--duration-base)] ease-[var(--ease-enter)]"

// Drag reorders; resting 1.5s on a row arms a merge into a new page, shown by a filling
// ring. Built on `lib/use-sortable-list.ts`, not HTML5 drag-and-drop. Release opens a
// naming panel that can be cancelled.

export const DWELL_MS = 1500

// The countdown ring closes around the page mark over exactly the dwell duration.
export function MergeBadge({ armed }: { armed: boolean }) {
  const [grown, setGrown] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const radius = 10
  const circumference = 2 * Math.PI * radius

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-1 transition-[background-color,transform]",
        T_FAST,
        armed
          ? "scale-[1.03] bg-primary text-primary-foreground"
          : "bg-background text-primary ring-1 ring-border",
      )}
    >
      <span className="relative flex size-6 shrink-0 items-center justify-center">
        {armed ? (
          <span aria-hidden="true" className="absolute inset-0 rounded-full bg-white/20" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            // Rotated so the ring closes from twelve o'clock.
            className="absolute inset-0 size-6 -rotate-90"
          >
            <circle
              cx="12"
              cy="12"
              r={radius}
              fill="none"
              strokeWidth="2"
              className="stroke-border"
            />
            <circle
              cx="12"
              cy="12"
              r={radius}
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              className="stroke-primary"
              style={{
                strokeDasharray: circumference,
                strokeDashoffset: grown ? 0 : circumference,
                transition: `stroke-dashoffset ${DWELL_MS}ms linear`,
              }}
            />
          </svg>
        )}
        <FolderPlus
          className={cn(
            "size-3.5",
            armed ? "text-primary-foreground" : "text-primary",
          )}
          strokeWidth={2}
          aria-hidden="true"
        />
      </span>
      <span className="text-xs font-medium whitespace-nowrap">
        {armed ? "Release to make a page" : "Hold to make a page"}
      </span>
    </span>
  )
}


export type PendingAction =
  | { kind: "merge"; ids: string[]; titles: string[] }
  | { kind: "promote"; id: string; title: string; steps: number }
  // Every "New folder…" path lands in the same naming panel.
  | { kind: "folder-for"; ids: string[] }
  | { kind: "steps-to-folder"; taskId: string; indices: number[] }

export function suggestFolderName(pending: PendingAction) {
  if (pending.kind === "promote") return pending.title
  if (pending.kind !== "merge") return "New page"

  // The longest word both titles share: "Book the venue" and "Pay the venue deposit" give "Venue".
  const words = (title: string) =>
    title
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((word) => word.length > 3)
  const first = words(pending.titles[0] ?? "")
  const shared = words(pending.titles[1] ?? "").filter((word) => first.includes(word))
  const best = shared.sort((a, b) => b.length - a.length)[0]
  return best ? best.charAt(0).toUpperCase() + best.slice(1) : "New page"
}

export function PendingPanel({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingAction
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(() => suggestFolderName(pending))

  const destroys = pending.kind === "promote"
  const going: string[] =
    pending.kind === "merge"
      ? pending.titles
      : pending.kind === "promote"
        ? [`${pending.steps} subtask${pending.steps === 1 ? "" : "s"} become tasks`]
        : pending.kind === "folder-for"
          ? [`${pending.ids.length} task${pending.ids.length === 1 ? "" : "s"}`]
          : [
              `${pending.indices.length} subtask${
                pending.indices.length === 1 ? " becomes a task" : "s become tasks"
              }`,
            ]

  return (
    <div
      className={cn(
        "mb-2 overflow-hidden rounded-md bg-background ring-1 ring-border",
        T_BASE,
      )}
    >
      <div className="flex items-start gap-3 px-3 pt-3">
        {/* The same mark the dwell badge closes its ring around. */}
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <FolderPlus
            className="size-4 text-primary"
            strokeWidth={2}
            aria-hidden="true"
          />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {destroys ? "Turn this task into a page" : "New page"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {destroys
              ? "The task itself stops existing. This cannot be undone from here."
              : "Nothing is changed except where these live."}
          </p>

          <InlineInput
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter" && name.trim()) onConfirm(name.trim())
              if (event.key === "Escape") onCancel()
            }}
            placeholder="Page name"
            aria-label="Page name"
            className={cn(
              "mt-2.5 h-9 w-full rounded-sm border border-border bg-background px-2.5 text-sm text-foreground outline-none",
              "placeholder:text-muted-foreground focus-visible:border-primary",
            )}
          />

          {/* The titles themselves, so a person can check they grabbed the right tasks. */}
          <ul className="mt-2 flex flex-col gap-1">
            {going.map((line, index) => (
              <li
                key={`${line}-${index}`}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <span
                  aria-hidden="true"
                  className="ml-1 size-1.5 shrink-0 rounded-full bg-border"
                />
                <span className="truncate">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1 bg-muted px-3 py-2">
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            "rounded-sm px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
            T_FAST,
          )}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => onConfirm(name.trim())}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-[background-color,transform] hover:bg-primary/90 active:scale-95 disabled:pointer-events-none disabled:opacity-40",
            T_FAST,
          )}
        >
          <FolderPlus className="size-3.5" strokeWidth={2} aria-hidden="true" />
          {destroys ? "Convert" : "Create page"}
        </button>
      </div>
    </div>
  )
}

// Row selection: Shift- or Cmd/Ctrl-click adds a row; while selecting, a plain click
// toggles too. Escape or Clear leaves. Dragging is suspended while selecting.
export type BulkDate = "today" | "tomorrow" | "next-week" | null

export function useRowSelection({
  onMove,
  onNewFolder,
  onBulk,
  onDate,
  onDelete,
}: {
  // The choice carries the folder id the PATCH names.
  onMove: (ids: string[], folder: { id: string; name: string; color: string }) => void
  onNewFolder: (ids: string[]) => void
  onBulk: (ids: string[], fields: Partial<ConceptTask>) => void
  // Absent in a list with nowhere to write a date; the bar then offers none.
  onDate?: (ids: string[], when: BulkDate) => void
  // Accepted from old call sites; the bar no longer offers Duplicate.
  onDuplicate?: (ids: string[]) => void
  onDelete: (ids: string[]) => void
}) {
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  // A modified press is a selection, never a tap that opens the task. The drag engine
  // reports the tap on pointerup, before the click lands.
  const modifiedPress = useRef(false)

  useEffect(() => {
    if (!selecting) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") exit()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selecting])

  function exit() {
    setSelecting(false)
    setSelected([])
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
      setSelecting(next.length > 0)
      return next
    })
  }

  const modified = (event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) =>
    event.shiftKey || event.metaKey || event.ctrlKey

  function selectProps(id: string) {
    return {
      onPointerDown: (event?: ReactPointerEvent) => {
        modifiedPress.current = event !== undefined && modified(event)
      },
      // Shift-click would otherwise extend a text selection across the rows.
      onMouseDown: (event: ReactMouseEvent) => {
        if (modified(event)) event.preventDefault()
      },
      onClick: (event: ReactMouseEvent) => {
        if ((event.target as HTMLElement).closest('button, a, input, [role="checkbox"]')) return
        if (modified(event)) {
          event.preventDefault()
          toggle(id)
          return
        }
        if (selecting) toggle(id)
      },
    }
  }

  // Read once by the list's opener: true when the press it is about to treat as a tap
  // was a modified one.
  function takeModifiedPress() {
    const was = modifiedPress.current
    modifiedPress.current = false
    return was
  }

  const count = selected.length
  const act = cn(
    "h-7 rounded-sm px-2 text-sm whitespace-nowrap text-foreground transition-colors hover:bg-muted data-popup-open:bg-muted",
    T_FAST,
  )

  const bar = (
    selecting ? (
      <div
        role="toolbar"
        aria-label="Selected tasks"
        // Floating, so selecting never pushes the list it is selecting from.
        className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] animate-in max-md:bottom-20 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 shadow-[var(--elevation-2)] duration-150 fade-in-0 slide-in-from-bottom-1"
      >
        <span className="mr-2 px-1 text-sm whitespace-nowrap text-muted-foreground">
          {count} selected
        </span>
        <button
          type="button"
          className={act}
          onClick={() => {
            onBulk(selected, { done: true })
            exit()
          }}
        >
          Complete
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" className={act} />}>
            Move
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[14rem]">
            {folderLibrary().map((f) => (
              <DropdownMenuItem
                key={f.name}
                onClick={() => {
                  onMove(selected, f)
                  exit()
                }}
              >
                <FolderMark name={f.name} color={f.color} />
                {f.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onNewFolder(selected)
                exit()
              }}
            >
              <FolderPlus />
              New folder…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {onDate ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<button type="button" className={act} />}>
              Date
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(
                [
                  ["today", "Today"],
                  ["tomorrow", "Tomorrow"],
                  ["next-week", "Next week"],
                  [null, "No date"],
                ] as const
              ).map(([when, label]) => (
                <DropdownMenuItem
                  key={label}
                  onClick={() => {
                    onDate(selected, when)
                    exit()
                  }}
                >
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <button
          type="button"
          className={cn(act, "hover:text-destructive")}
          onClick={() => {
            onDelete(selected)
            exit()
          }}
        >
          Delete
        </button>
        <button type="button" className={cn(act, "text-muted-foreground")} onClick={exit}>
          Clear
        </button>
      </div>
    ) : null
  )

  return {
    selecting,
    selected,
    selectProps,
    takeModifiedPress,
    // Nothing to cancel any more; kept so the drag engine's lift hook stays wired.
    clearPress: () => {},
    bar,
  }
}

export function Check({
  task,
  onToggle,
}: {
  task: ConceptTask
  onToggle: () => void
}) {
  const done = Boolean(task.done)

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      // Spec 9.1 gives this control two fixed names, never the task's title (`ui/copy.ts`).
      aria-label={done ? MARK_AS_NOT_DONE : COMPLETE_TASK}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className="flex size-[var(--control-height)] items-center justify-center rounded-sm"
    >
      <CheckMark checked={done} className={cn("active:scale-90", !done && "hover:border-muted-foreground", task.abandoned && !done && "opacity-60")} />
    </button>
  )
}

export function rowProps(
  surface: { onPointerDown: (event: ReactPointerEvent) => void },
  select: ReturnType<ReturnType<typeof useRowSelection>["selectProps"]>,
) {
  return {
    ...select,
    onPointerDown: (event: ReactPointerEvent) => {
      select.onPointerDown(event)
      // A modified press selects; it must not also arm a drag.
      if (event.shiftKey || event.metaKey || event.ctrlKey) return
      surface.onPointerDown(event)
    },
  }
}

export function ExpandShell({
  open,
  row,
  card,
  drag,
  itemRef,
  isActive = false,
  isDwelling = false,
  isArmed = false,
  isSettling = false,
  offset = 0,
  crossOffset = 0,
  isSelected = false,
  proposal,
}: {
  open: boolean
  row: ReactNode
  card: ReactNode
  drag?: Record<string, unknown>
  itemRef?: (element: HTMLElement | null) => void
  // See the badge at the foot of this component.
  proposal?: string
  isActive?: boolean
  isDwelling?: boolean
  isArmed?: boolean
  isSettling?: boolean
  offset?: number
  crossOffset?: number
  isSelected?: boolean
}) {
  // The carried row has no transform transition, or it lags the pointer; the others
  // ease. Token durations let reduced motion turn this off.
  const carrying = isActive && !isSettling
  return (
    <div
      // The list item is this element, which the drag engine moves and which contains the
      // expanded card, so a locator for the row still finds the card.
      role="listitem"
      ref={itemRef}
      {...drag}
      style={{
        transform: offset === 0 && crossOffset === 0 ? undefined : `translate3d(${crossOffset}px, ${offset}px, 0)`,
        maxWidth: carrying && proposal !== undefined ? 'var(--drag-proposal-width)' : undefined,
        // `scale` as its own property, so the armed nudge can ease while the translate tracks
        // the pointer untransitioned.
        scale: isActive && isArmed ? "0.985" : undefined,
        transition: carrying
          ? "box-shadow var(--duration-fast) var(--ease-standard), scale var(--duration-fast) var(--ease-standard)"
          : [
              "transform var(--duration-base) var(--ease-enter)",
              "scale var(--duration-fast) var(--ease-standard)",
              "background-color var(--duration-base) var(--ease-enter)",
              "box-shadow var(--duration-base) var(--ease-enter)",
              "border-color var(--duration-base) var(--ease-enter)",
              "margin var(--duration-base) var(--ease-enter)",
            ].join(", "),
        // Above the rows it passes, or the lift reads as sliding underneath the list.
        zIndex: isActive ? 30 : undefined,
      }}
      className={cn(
        "relative rounded-sm",
        isSelected && "bg-primary/10",
        isActive && "cursor-grabbing bg-background shadow-[var(--elevation-2)]",
        isDwelling && !isArmed && "bg-muted ring-1 ring-border",
        isArmed && "bg-muted ring-2 ring-primary",
      )}
    >
      {row}
      {open ? card : null}
      {/* The badge rides the carried row: on the target it would be covered by the carried
         row at z-30. */}
      {isActive && (isDwelling || isArmed) ? (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
          <MergeBadge armed={isArmed} />
        </span>
      ) : null}
      {/* What a release onto a container would do, in words (AC-228). Same slot as the merge
         badge, never at the same time. */}
      {proposal === undefined ? null : (
        <span className="pointer-events-none absolute top-full left-1 z-40 mt-1 rounded-sm bg-foreground px-2 py-0.5 text-xs whitespace-nowrap text-background">
          {proposal}
        </span>
      )}
    </div>
  )
}

// The row the screens render. Facts the screen models come from props every render;
// what only the card edits is held here as local edits on top.

export type TaskStatus = "pending" | "completed" | "abandoned"

export type TaskOpenMode = "dialog" | "right" | "tab"

export interface TaskRowProps {
  id?: string
  title: string
  // Optional beside name and colour: the assignee roster and move writes need the id.
  folder?: { name: string; color: string; id?: string }
  // The task's section on its folder page, drawn after the folder chip as a path.
  // Absent under that section's own heading.
  section?: string
  // What the list around the row has already said, decided per list: a row cannot see
  // the heading above it.
  given?: {
    // Grouped by folder, or standing inside one.
    folder?: boolean
    // Grouped by person.
    assignee?: boolean
    // Grouped by date, or finished, where the deadline is spent.
    due?: boolean
    // Every row here is starred.
    important?: boolean
    // Every row here is late.
    overdue?: boolean
  }
  due?: { label: string; overdue?: boolean }
  // The schedule's start, in the due label's words, where it is not the due day.
  starts?: string
  status?: TaskStatus
  important?: boolean
  importantTooltip?: string
  assignee?: { initials: string; name: string; image?: string; id?: string }
  assignees?: { initials: string; name: string; image?: string; id?: string }[]
  pulled?: boolean
  steps?: { complete: number; total: number }
  recurrence?: string
  notes?: string
  // The parts only the card shows (steps, files). The row spreads this last, so card
  // edits survive being closed and reopened elsewhere.
  detail?: Partial<ConceptTask>
  unassigned?: boolean
  invitePending?: string
  // Unfinished blockers; absent or 0 draws nothing.
  blockedBy?: number
  // The labels this viewer sees on the task, archived ones left out.
  labels?: ConceptLabel[]
  // The person who made this task, drawn only where the page asks.
  createdBy?: string
  // What a release would do, drawn on the row being carried. See `ExpandShell`.
  proposal?: string
  completionPreview?: boolean
  collapsing?: boolean
  // Open the task elsewhere; a bare call means full.
  onOpen?: (mode?: TaskOpenMode) => void
  // Supplied by TaskList, which owns the naming panel; absent outside one.
  onNewFolder?: () => void
  // The write path out of the card. See `useCardWiring`.
  onPatch?: (fields: Partial<ConceptTask>) => void
  // Supplied by TaskList so a row can hand back its opener. Never passed by a screen.
  onRegisterOpen?: (open: (() => void) | null) => void
  onToggleComplete?: (completed: boolean) => void
  onToggleImportant?: () => void
  onRemoveFromMyDay?: () => void
  onAbandon?: () => void
  onDelete?: () => void
  // List wiring, supplied only by `TaskList`; a standalone row has none.
  itemRef?: (element: HTMLElement | null) => void
  listProps?: Record<string, unknown>
  dragState?: {
    isActive: boolean
    isDwelling: boolean
    isArmed: boolean
    isSettling: boolean
    offset: number
    crossOffset?: number
  }
  isSelected?: boolean
  selecting?: boolean
  // The task surface renders the row already expanded.
  defaultOpen?: boolean
}

// The presenter's frequency word back to the card's unit. "Repeats" leaves it unknown.
const REPEAT_UNIT_OF: Record<string, ConceptTask["repeatUnit"]> = {
  Daily: "day",
  Weekly: "week",
  Monthly: "month",
  Yearly: "year",
}

function toConceptTask(props: TaskRowProps): ConceptTask {
  const total = props.steps?.total ?? 0
  const complete = props.steps?.complete ?? 0
  const steps: ConceptStep[] | undefined = props.steps
    ? Array.from({ length: total }, (_, index) => ({
        title: `Step ${index + 1}`,
        done: index < complete,
      }))
    : undefined

  return {
    id: props.id ?? props.title,
    title: props.title,
    done: props.status === "completed",
    abandoned: props.status === "abandoned",
    folder: props.folder,
    due: props.due,
    assignee: props.assignee,
    assignees: props.assignees,
    pulled: props.pulled,
    important: props.important,
    notes: props.notes,
    // A fallback only: anything real arrives through `detail` below and wins.
    steps,
    ...(props.labels === undefined ? {} : { labels: props.labels }),
    recurrence: Boolean(props.recurrence),
    ...(REPEAT_UNIT_OF[props.recurrence ?? ""] === undefined
      ? {}
      : { repeatUnit: REPEAT_UNIT_OF[props.recurrence ?? ""] }),
    ...props.detail,
  }
}

// The card's wiring, shared so the task surface holds the same task the row holds.
export function useCardWiring(props: TaskRowProps) {
  const [edits, setEdits] = useState<Partial<ConceptTask>>({})
  // The server's steps win once they arrive. Keyed on content, not identity: every render
  // passes a fresh array, and clearing on identity would drop a tick before it landed.
  const serverSteps = JSON.stringify(props.steps ?? null)
  useEffect(() => {
    setEdits(({ steps: _dropped, ...rest }) => rest)
  }, [serverSteps])
  // The shell's write path, for a row nobody handed one to. `onPatch` still wins.
  const writer = useTaskWriter()

  // Props first, local edits over the top.
  const task: ConceptTask = { ...toConceptTask(props), ...edits }
  const counts = stepCount(task)
  const steps = task.steps ?? []

  // Every edit is reported to the task's owner: the handler, else the shell's writer.
  // The local copy shows the edit before the round trip.
  function report(fields: Partial<ConceptTask>) {
    if (props.onPatch) props.onPatch(fields)
    else if (writer && props.id) writer(props.id, fields)
  }

  function patch(_id: string, fields: Partial<ConceptTask>) {
    setEdits((current) => ({ ...current, ...fields }))
    // Where the screen supplies `onToggleComplete`, completion is the screen's: writing it
    // here too would send two transitions (409) and skip the screen's un-complete
    // confirmation (AC-162).
    const owned = { ...fields }
    if (props.onToggleComplete !== undefined) delete owned.done
    // Abandon is not stripped: nothing tells the screen about it, so Restore reaches the
    // server only through here (AC-097).
    if (Object.keys(owned).length > 0) report(owned)
    // Completion is the screen's fact, so it is told.
    if (fields.done !== undefined) props.onToggleComplete?.(fields.done)
  }

  // The card's subtasks are its body's checklist; nothing here writes them.
  const cardHandlers = {}

  return { task, patch, steps, counts, cardHandlers }
}

// One line: checkbox, title, meta, star. The whole row opens the task; the checkbox and
// star are the only controls inside it.
export function TaskRow(props: TaskRowProps) {
  const { task, patch } = useCardWiring(props)

  // The list's drag engine calls back on a tap, so tap-to-open is the row's property.
  const { onRegisterOpen, onOpen } = props
  useEffect(() => {
    if (!onRegisterOpen) return
    onRegisterOpen(onOpen ? () => onOpen() : null)
    return () => onRegisterOpen(null)
  }, [onRegisterOpen, onOpen])

  const given = props.given ?? {}
  const struck = Boolean(task.abandoned)
  const finished = Boolean(task.done) || struck

  const row = (
    <div
      // The peek steps through rows in the order they are drawn.
      data-task-id={props.id}
      // The keyboard path (`row-keys.ts`): Enter opens, Space completes.
      data-row-key=""
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === "Enter") {
          event.preventDefault()
          props.onOpen?.()
        } else if (event.key === " ") {
          event.preventDefault()
          patch(task.id, { done: !task.done })
        }
      }}
      onClick={
        // Only where no drag engine tracks the row; inside a list the engine resolves the tap.
        props.onOpen && !props.listProps
          ? (event) => {
              const target = event.target as HTMLElement
              if (target.closest('button, a, input, [role="checkbox"]')) return
              props.onOpen?.()
            }
          : undefined
      }
      className={cn(
        "group/row grid min-h-[var(--row-height)] w-full grid-cols-[var(--control-height)_minmax(0,1fr)_auto] items-center rounded-sm pr-1 text-sm transition-colors max-md:py-1 md:h-[var(--row-height)]",
        T_FAST,
        !props.isSelected && "hover:bg-muted",
        props.onOpen && "cursor-pointer",
      )}
    >
      <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
      <span
        title={task.title}
        className={cn(
          // A phone wraps the title to two lines rather than cutting it beside the meta.
          "min-w-0 truncate max-md:line-clamp-2 max-md:whitespace-normal",
          finished ? "text-muted-foreground" : "text-foreground",
          struck && "line-through",
        )}
      >
        {task.title || <span className="text-muted-foreground">Untitled task</span>}
      </span>
      {props.dragState?.isActive && props.proposal !== undefined ? null : <RowMeta
        className="max-w-[60vw] pl-3 md:max-w-none"
        source={{
          ...(task.due === undefined ? {} : { due: task.due }),
          ...(props.starts === undefined ? {} : { starts: props.starts }),
          ...(task.folder === undefined ? {} : { folder: task.folder }),
          ...(task.assignee === undefined ? {} : { assignee: task.assignee }),
          ...(task.assignees === undefined ? {} : { assignees: task.assignees }),
          ...(task.labels === undefined ? {} : { labels: task.labels }),
          ...(task.recurrence ? { recurrence: repeatShort(task) } : {}),
          blockedBy: props.blockedBy ?? 0,
          finished,
          important: Boolean(task.important),
          ...(props.importantTooltip === undefined ? {} : { importantTooltip: props.importantTooltip }),
        }}
        given={given}
        onToggleImportant={() => {
          patch(task.id, { important: !task.important })
          props.onToggleImportant?.()
        }}
      />}
    </div>
  )

  return (
    <ExpandShell
      open={false}
      card={null}
      row={row}
      itemRef={props.itemRef}
      drag={props.listProps}
      isSelected={props.isSelected}
      isActive={props.dragState?.isActive}
      isDwelling={props.dragState?.isDwelling}
      isArmed={props.dragState?.isArmed}
      isSettling={props.dragState?.isSettling}
      offset={props.dragState?.offset}
      crossOffset={props.dragState?.crossOffset}
      proposal={props.proposal}
    />
  )
}

// The list wiring a screen spreads onto its own row when it keeps one.
export interface TaskListWiring {
  itemRef: (element: HTMLElement | null) => void
  listProps: Record<string, unknown>
  onNewFolder: () => void
  // The engine resolves tap versus drag, so a row hands the list its opener instead of
  // taking an `onClick`.
  onRegisterOpen: (open: (() => void) | null) => void
  dragState: {
    isActive: boolean
    isDwelling: boolean
    isArmed: boolean
    isSettling: boolean
    offset: number
    // Sideways travel of the carried row, when the list follows across.
    crossOffset?: number
  }
  // The board's "Into {column}" label (AC-228). Undefined on every row but the carried one.
  proposal?: string
  isSelected: boolean
  selecting: boolean
}

// A list of task rows: reorder, the hold that makes a page of two tasks, and multi-select.
// The list owns that state, so screens only pass tasks.

export function TaskList<T extends TaskRowProps & { id: string }>({
  tasks,
  onReorder,
  reorderable = true,
  onDropAt,
  onOver,
  followAcross = false,
  onDragStateChange,
  onMerge,
  onBulk,
  onDate,
  onDelete,
  onMove,
  onTaskOpen,
  onTaskToggleComplete,
  onTaskToggleImportant,
  onTaskRemoveFromMyDay,
  onTaskAbandon,
  onTaskDelete,
  renderRow,
  className,
  selection: sharedSelection,
  selectionChrome = true,
  ...perRow
}: {
  tasks: T[]
  /** A composed page shares one selection across its separate task-list islands. */
  selection?: ReturnType<typeof useRowSelection>
  /** The composed page draws the shared bar once above all of its islands. */
  selectionChrome?: boolean
  // The list's order is provisional until the screen answers: `true` once the order is
  // written and read back, `false` for a refusal. Either way the list then shows the
  // screen's rows (AC-266). Returning nothing keeps the list's own order.
  onReorder?: (from: number, to: number, next: string[]) => void | Promise<boolean>
  // A list that cannot keep an order does not open gaps while dragging; the dwell merge
  // still works.
  reorderable?: boolean
  // A row let go outside this list; return true when the page took it.
  onDropAt?: (taskId: string, point: { x: number; y: number }) => boolean
  // What a release here would do, as the words the carried row draws.
  onOver?: (taskId: string, point: { x: number; y: number }) => string | null
  // The carried row follows the pointer sideways too, for a board.
  followAcross?: boolean
  // Whether a row is being carried, for drop targets that exist only mid-drag. Pass a
  // stable setter.
  onDragStateChange?: (dragging: boolean) => void
  onMerge?: (ids: string[], name: string) => void
  onBulk?: (ids: string[], fields: Partial<ConceptTask>) => void
  onDate?: (ids: string[], when: BulkDate) => void
  onDuplicate?: (ids: string[]) => void
  onDelete?: (ids: string[]) => void
  // The id rides along; see `useRowSelection`.
  onMove?: (ids: string[], folder: { id: string; name: string; color: string }) => void
  // Required: the drag engine reports taps only to this, so without it rows silently
  // cannot be opened.
  onTaskOpen: (id: string, mode?: TaskOpenMode) => void
  onTaskToggleComplete?: (id: string, completed: boolean) => void
  onTaskToggleImportant?: (id: string) => void
  onTaskRemoveFromMyDay?: (id: string) => void
  onTaskAbandon?: (id: string) => void
  onTaskDelete?: (id: string) => void
  // For screens whose rows carry their own logic: they keep their row and get the wiring.
  renderRow?: (task: T, wiring: TaskListWiring) => ReactNode
  // Declared here so the compiler asks at the call site; `renderRow` screens pass it on
  // the row instead.
  given?: TaskRowProps["given"]
  className?: string
}) {
  const [order, setOrder] = useState<string[] | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)

  // The list holds its own order only after a drag; until then the screen's order rules.
  const ordered = order
    ? [...tasks].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    : tasks

  const cancelPress = useRef<() => void>(() => {})

  // A list with no order to keep does not slide rows aside; whether an order persists is
  // the page's fact.
  function stateOf(index: number): SortableItemState {
    const state = drag.itemState(index)
    if (reorderable || state.isActive) return state
    return { ...state, offset: 0 }
  }

  const dragging = useRef(false)
  const drag = useSortableList({
    count: ordered.length,
    onLift: () => cancelPress.current(),
    onDropAt: onDropAt
      ? (from, point) => {
          const task = ordered[from]
          return task ? onDropAt(task.id, point) : false
        }
      : undefined,
    onOver: onOver
      ? (from, point) => {
          const task = ordered[from]
          return task ? onOver(task.id, point) : null
        }
      : undefined,
    onReorder: (from, to) => {
      // A list with no order to keep never takes one.
      if (!reorderable) return
      const next = ordered.map((task) => task.id)
      const [moved] = next.splice(from, 1)
      if (moved) next.splice(to, 0, moved)
      setOrder(next)
      // Hold the local order while the screen answers, then drop it either way.
      const answer = onReorder?.(from, to, next)
      if (answer !== undefined) {
        void answer.then(() => setOrder(null))
      }
    },
    // Resting on a row proposes a page of the two; release opens a cancellable panel.
    onDwell: (from, to) => {
      const moved = ordered[from]
      const onto = ordered[to]
      if (moved && onto) {
        setPending({
          kind: "merge",
          ids: [moved.id, onto.id],
          titles: [moved.title, onto.title],
        })
      }
    },
    describe: (index) => ordered[index]?.title ?? "Task",
    followAcross,
  })

  // Each row registers its opener; the drag engine calls it on a tap.
  const openers = useRef(new Map<string, () => void>())

  const localSelection = useRowSelection({
    onMove: (ids, folder) => onMove?.(ids, folder),
    onNewFolder: (ids) => setPending({ kind: "folder-for", ids }),
    onBulk: (ids, fields) => onBulk?.(ids, fields),
    onDate,
    onDelete: (ids) => onDelete?.(ids),
  })
  const selection = sharedSelection ?? localSelection
  cancelPress.current = selection.clearPress
  // Read the selecting mode at release, not at press, so a press that selected does not
  // also open the task.
  const selectingNow = useRef(false)
  selectingNow.current = selection.selecting

  // Reported up so a page can show a drop target only while something is carried.
  useEffect(() => {
    if (dragging.current === drag.isDragging) return
    dragging.current = drag.isDragging
    onDragStateChange?.(drag.isDragging)
  }, [drag.isDragging, onDragStateChange])

  // A list unmounted mid-drag (a cross-list drop) would never report the end.
  useEffect(
    () => () => {
      if (dragging.current) onDragStateChange?.(false)
    },
    [onDragStateChange],
  )

  function confirm(name: string) {
    if (!pending) return
    if (pending.kind === "merge" || pending.kind === "folder-for") {
      onMerge?.(pending.ids, name)
    }
    setPending(null)
  }

  return (
    // A flex column with a gap, never `space-y-*`, which overrode the open card's margins.
    // A `listitem` needs this `list`.
    <div role="list" className={cn("flex flex-col", className)}>
      {selectionChrome ? selection.bar : null}
      {pending ? (
        <PendingPanel
          pending={pending}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      ) : null}
      {ordered.map((task, index) => {
        const wiring = {
          itemRef: drag.setItemRef(index),
          onNewFolder: () => setPending({ kind: "folder-for", ids: [task.id] }),
          // Selection and drag both want pointerdown, so they are chained; spreading would keep
          // only the later handler.
          listProps: selection.selecting
            ? selection.selectProps(task.id)
            : rowProps(
                // A still press opens the task, one that travels drags it; the engine decides. The tap
                // asks the row to open itself, so it works even where a screen forgot `onTaskOpen`.
                drag.surfaceProps(index, () => {
                  // See `selectingNow` above.
                  if (selectingNow.current || selection.takeModifiedPress()) return
                  openers.current.get(task.id)?.()
                }),
                selection.selectProps(task.id),
              ),
          // Spread with the rest of the wiring, so every `renderRow` screen gets it.
          onRegisterOpen: (open: (() => void) | null) => {
            if (open) openers.current.set(task.id, open)
            else openers.current.delete(task.id)
          },
          dragState: stateOf(index),
          // Only the carried row draws it, while a container is proposed.
          proposal:
            drag.itemState(index).isActive && drag.overKey !== null
              ? drag.overKey
              : undefined,
          isSelected: selection.selected.includes(task.id),
          selecting: selection.selecting,
        }
        if (renderRow) return renderRow(task, wiring)
        return (
        <TaskRow
          key={task.id}
          {...task}
          {...perRow}
          // The whole wiring, spread, so a new wiring field cannot be forgotten here. The explicit
          // handlers below still override.
          {...wiring}
          onOpen={onTaskOpen ? (mode) => onTaskOpen(task.id, mode) : undefined}
          onToggleComplete={
            onTaskToggleComplete
              ? (completed) => onTaskToggleComplete(task.id, completed)
              : undefined
          }
          onToggleImportant={
            onTaskToggleImportant ? () => onTaskToggleImportant(task.id) : undefined
          }
          onRemoveFromMyDay={
            onTaskRemoveFromMyDay ? () => onTaskRemoveFromMyDay(task.id) : undefined
          }
          onAbandon={onTaskAbandon ? () => onTaskAbandon(task.id) : undefined}
          onDelete={onTaskDelete ? () => onTaskDelete(task.id) : undefined}
          itemRef={wiring.itemRef}
          listProps={wiring.listProps}
          dragState={wiring.dragState}
          isSelected={wiring.isSelected}
          selecting={wiring.selecting}
        />
        )
      })}
    </div>
  )
}
