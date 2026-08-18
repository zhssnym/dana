/*
The task row, as approved at session V3.

This is the port of the concept lab's winner, not a concept. What changed from
the row it replaces, and the entry that approved each:

- **Two densities, two lines by default** (DES-113). The density comes from
  `useRowDensity()` rather than a prop, so no screen had to change to get it.
  The rule that keeps it affordable: the densities differ in height and in
  where the details sit, and in nothing else.
- **A row is as tall as it needs to be** (DES-111). A task with no details is
  one line even in the two-line density, so the height is paid only by rows
  with something to show for it.
- **Rename in place** (DES-095). Click the title and type. Present only when
  `onRename` is supplied, so a read-only surface stays read-only.
- **Restore moves to the trailing action slot** (V3's R3). It was a labelled
  button sitting after the title, pushing the metadata around on exactly the
  rows that were hardest to read; it is now an icon in the gutter, revealed on
  hover like the other actions.
- **The details are the same vocabulary the card uses** (DES-094), at the
  metadata sizes DES-015 and DES-021 set — 12/16 type, 14px marks.

The public props are unchanged. Every screen, and the states page, renders
this component exactly as before; the additions are optional.

One thing deliberately NOT ported yet: the expandable card. It needs task
detail the list does not carry — notes, step rows, attachments — which in the
real product arrives from `GET /tasks/:id`. The chevron and the card follow in
their own change rather than being faked from fixtures here.
*/

import { useState, type ReactNode } from "react"
import {
  Ban,
  ChevronDown,
  CircleAlert,
  Folder,
  ListChecks,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Pin,
  Repeat2,
  RotateCcw,
  Star,
  Trash2,
  UserRound,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Item, ItemMedia } from "@/components/ui/item"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Reveal } from "@/components/task-card"
import { useRowDensity } from "@/lib/density"
import { cn } from "@/lib/utils"

/* What a list hands a row so it can open in place. One object rather than
   three props, so a screen forwards it without knowing how expansion works. */
export interface TaskExpansion {
  openId: string | null
  toggle: (taskId: string) => void
  render: (taskId: string) => import("react").ReactNode
}

export type TaskStatus = "pending" | "completed" | "abandoned"
export type TaskRowVisualState = "default" | "hover" | "focus" | "selected"

const rowActionHover = "hover:!bg-transparent aria-expanded:!bg-transparent"

export interface TaskRowProps {
  title: string
  folder?: {
    name: string
    color: string
  }
  due?: {
    label: string
    overdue?: boolean
  }
  status?: TaskStatus
  important?: boolean
  importantTooltip?: string
  assignee?: {
    initials: string
    name: string
    image?: string
  }
  unassigned?: boolean
  pulled?: boolean
  invitePending?: string
  steps?: {
    complete: number
    total: number
  }
  attachments?: number
  recurrence?: string
  notes?: boolean
  visualState?: TaskRowVisualState
  showSecondaryActions?: boolean
  menuOpen?: boolean
  completionPreview?: boolean
  collapsing?: boolean
  onOpen?: () => void
  /* Supplying this makes the title editable in place (DES-095). Omit it and
     the title is plain text, which is what a read-only surface wants. */
  onRename?: (title: string) => void
  onToggleComplete?: (completed: boolean) => void
  onToggleImportant?: () => void
  onRemoveFromMyDay?: () => void
  onAbandon?: () => void
  onDelete?: () => void
  /* Supplying an expanded node makes the row openable in place (DES-093).
     The row does not build the card itself, because the card needs task
     detail the list does not carry — in the product that is a GET /tasks/:id
     the moment somebody expands, not something the list should be made to
     fetch for every row it renders. */
  expanded?: ReactNode
  isExpanded?: boolean
  onToggleExpanded?: () => void
}

function CompletionControl({
  status,
  onToggle,
}: {
  status: TaskStatus
  onToggle?: (completed: boolean) => void
}) {
  const completed = status === "completed"

  return (
    <Checkbox
      checked={completed}
      onCheckedChange={onToggle}
      onClick={(event) => event.stopPropagation()}
      aria-label={completed ? "Mark as not done" : "Complete task"}
      className="size-[var(--control-height)] !border-transparent !bg-transparent after:inset-auto after:size-[var(--checkbox-size)] after:rounded-[4px] after:border after:border-input after:bg-background after:content-[''] focus-visible:ring-0 focus-visible:after:ring-2 focus-visible:after:ring-ring/30 data-checked:!border-transparent data-checked:!bg-transparent data-checked:after:border-[var(--color-graphite-700)] data-checked:after:bg-[var(--color-graphite-700)] [&_[data-slot=checkbox-indicator]]:z-10"
    />
  )
}

/* Rename in place (DES-095). The input carries the label's exact metrics so
   that entering and leaving edit moves nothing on screen; a field that jumps
   when it focuses teaches people to distrust the click. */
function TaskTitle({
  title,
  struck,
  dimmed,
  truncate,
  onRename,
}: {
  title: string
  struck: boolean
  dimmed: boolean
  truncate: boolean
  onRename?: (title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)

  const metrics = cn(
    "block min-w-0 text-[14px] leading-5",
    truncate ? "max-w-full truncate" : "w-full",
  )

  if (editing && onRename) {
    return (
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        value={draft}
        onFocus={(event) => event.currentTarget.select()}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          onRename(draft.trim() || title)
          setEditing(false)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
          }
          if (event.key === "Enter") {
            onRename(draft.trim() || title)
            setEditing(false)
          }
          if (event.key === "Escape") {
            setDraft(title)
            setEditing(false)
          }
        }}
        aria-label="Task title"
        className={cn(
          metrics,
          "-mx-1 w-full rounded-[4px] bg-background px-1 text-[var(--color-graphite-800)] outline-none ring-2 ring-[var(--color-dana-accent-600)]",
        )}
      />
    )
  }

  const colour = struck
    ? "text-[var(--color-graphite-600)] line-through decoration-[var(--color-graphite-500)]"
    : dimmed
      ? "text-[var(--color-graphite-600)]"
      : "text-[var(--color-graphite-800)]"

  if (!onRename) {
    return (
      <span className={cn(metrics, colour)} title={title}>
        {title}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        setDraft(title)
        setEditing(true)
      }}
      title={title}
      className={cn(
        metrics,
        colour,
        "-mx-1 cursor-text rounded-[4px] px-1 text-left transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-graphite-200)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:outline-none",
      )}
    >
      {title}
    </button>
  )
}

function ImportanceControl({
  active,
  label,
  visible,
  onToggle,
}: {
  active: boolean
  label: string
  visible: boolean
  onToggle?: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            className={cn(
              "h-[var(--control-height)] shrink-0 overflow-hidden border-0 p-0 transition-[width,opacity,color]",
              rowActionHover,
              active || visible
                ? "w-[var(--control-height)] opacity-100"
                : "pointer-events-none w-0 opacity-0 group-hover/task:pointer-events-auto group-hover/task:w-[var(--control-height)] group-hover/task:opacity-100 group-focus-within/task:pointer-events-auto group-focus-within/task:w-[var(--control-height)] group-focus-within/task:opacity-100",
              active && "text-[var(--color-graphite-800)]",
            )}
            aria-label={label}
            onClick={onToggle}
          >
            <Star
              className={cn("size-5", active && "fill-current")}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function FolderMeta({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex min-w-0 shrink-0 items-center gap-1.5">
      <Folder
        className="size-3.5 shrink-0"
        style={{ color }}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span className="truncate">{name}</span>
    </span>
  )
}

function AssigneeMeta({
  initials,
  name,
  image,
}: {
  initials: string
  name: string
  image?: string
}) {
  return (
    <span className="inline-flex min-w-0 shrink-0 items-center gap-1.5">
      <Avatar size="sm" className="size-4 data-[size=sm]:size-4">
        {image ? <AvatarImage src={image} alt="" /> : null}
        <AvatarFallback className="text-[0.5rem] font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{name}</span>
    </span>
  )
}

export function TaskRow({
  title,
  folder,
  due,
  status = "pending",
  important = false,
  importantTooltip,
  assignee,
  unassigned = false,
  pulled = false,
  invitePending,
  steps,
  attachments,
  recurrence,
  notes = false,
  visualState = "default",
  showSecondaryActions = false,
  menuOpen = false,
  completionPreview = false,
  collapsing = false,
  onOpen,
  onRename,
  onToggleComplete,
  onToggleImportant,
  onRemoveFromMyDay,
  onAbandon,
  onDelete,
  expanded,
  isExpanded = false,
  onToggleExpanded,
}: TaskRowProps) {
  const { density } = useRowDensity()
  const isCompleted = status === "completed"
  const isAbandoned = status === "abandoned"
  const actionsVisible =
    showSecondaryActions || visualState !== "default" || menuOpen
  const starLabel =
    importantTooltip ?? (important ? "Remove from Important" : "Mark important")

  /* A row with nothing to say is one line whatever the density (DES-111), so
     the height is paid only by rows that have something to show for it. */
  const hasDetails = Boolean(
    folder ||
      due ||
      assignee ||
      steps ||
      recurrence ||
      pulled ||
      notes ||
      attachments ||
      unassigned ||
      invitePending ||
      isAbandoned,
  )
  const twoLine = density === "two" && hasDetails

  const overflowClass = cn(
    "h-[var(--control-height)] shrink-0 overflow-hidden border-0 p-0 transition-[width,opacity]",
    rowActionHover,
    actionsVisible
      ? "w-[var(--control-height)] opacity-100"
      : "pointer-events-none w-0 opacity-0 group-hover/task:pointer-events-auto group-hover/task:w-[var(--control-height)] group-hover/task:opacity-100 group-focus-within/task:pointer-events-auto group-focus-within/task:w-[var(--control-height)] group-focus-within/task:opacity-100",
  )

  /* One canonical slot order on every page and in both densities (review L2):
     state chips, folder, pulled, recurrence, steps, attachments, notes,
     assignee, then due as the final data column. */
  const metadata = (
    <>
      {isAbandoned ? <Badge variant="secondary">Abandoned</Badge> : null}

      {invitePending ? (
        <Badge
          variant="outline"
          className="max-w-64 border-[var(--color-info-200)] bg-[var(--color-info-100)] text-[var(--color-info-700)]"
        >
          <span className="truncate">Invite pending: {invitePending}</span>
        </Badge>
      ) : null}

      {unassigned ? <Badge variant="outline">Unassigned</Badge> : null}

      {folder ? <FolderMeta {...folder} /> : null}

      {pulled ? (
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <Pin className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          My Day
        </span>
      ) : null}

      {recurrence ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                role="img"
                className="inline-flex shrink-0 items-center"
                aria-label={`Repeats ${recurrence.toLowerCase()}`}
              >
                <Repeat2
                  className="size-3.5"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </span>
            }
          />
          <TooltipContent>Repeats {recurrence.toLowerCase()}</TooltipContent>
        </Tooltip>
      ) : null}

      {steps ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 tabular-nums">
          <ListChecks
            className="size-3.5"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {steps.complete}/{steps.total}
        </span>
      ) : null}

      {attachments ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 tabular-nums">
          <Paperclip
            className="size-3.5"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {attachments}
        </span>
      ) : null}

      {notes ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                role="img"
                className="inline-flex shrink-0 items-center"
                aria-label="Has notes"
              >
                <Pencil
                  className="size-3.5"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </span>
            }
          />
          <TooltipContent>Has notes</TooltipContent>
        </Tooltip>
      ) : null}

      {assignee ? <AssigneeMeta {...assignee} /> : null}

      {due ? (
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5",
            !twoLine && "min-w-[5.5rem] justify-end",
            due.overdue && "font-medium text-[var(--color-danger-700)]",
          )}
        >
          {due.overdue ? (
            <CircleAlert
              className="size-3.5"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          ) : null}
          {due.label}
        </span>
      ) : null}
    </>
  )

  const taskActions = (
    <div
      data-task-actions
      className="flex shrink-0 items-center gap-0"
      onClick={(event) => event.stopPropagation()}
    >
      {/* Restore leads the gutter (R3). It is the one action that appears
          because of a state rather than being on every row, so the permanent
          actions keep their positions behind it. */}
      {isAbandoned ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                className={overflowClass}
                aria-label="Restore task"
                onClick={() => onToggleComplete?.(false)}
              >
                <RotateCcw
                  className="size-5"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </Button>
            }
          />
          <TooltipContent>Restore</TooltipContent>
        </Tooltip>
      ) : null}

      <ImportanceControl
        active={important}
        label={starLabel}
        visible={actionsVisible}
        onToggle={onToggleImportant}
      />

      <DropdownMenu defaultOpen={menuOpen} modal={!menuOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className={overflowClass}
              aria-label="More task actions"
            >
              <MoreHorizontal
                className="size-5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            className="min-h-[var(--control-height)] text-sm"
            onClick={onOpen}
          >
            <Pencil className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Edit
          </DropdownMenuItem>
          {pulled ? (
            <DropdownMenuItem
              className="min-h-[var(--control-height)] text-sm"
              onClick={onRemoveFromMyDay}
            >
              <Pin className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Remove from My Day
            </DropdownMenuItem>
          ) : null}
          {status === "pending" ? (
            <DropdownMenuItem
              className="min-h-[var(--control-height)] text-sm"
              onClick={onAbandon}
            >
              <Ban className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Abandon…
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            className="min-h-[var(--control-height)] text-sm"
            onClick={onDelete}
          >
            <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {onToggleExpanded ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                className={cn(
                  "h-[var(--control-height)] w-[var(--control-height)] shrink-0 border-0 p-0 transition-opacity",
                  rowActionHover,
                  isExpanded
                    ? "opacity-100"
                    : "opacity-40 group-hover/task:opacity-100 group-focus-within/task:opacity-100",
                )}
                aria-expanded={isExpanded}
                aria-label={isExpanded ? "Collapse this task" : "Expand this task"}
                onClick={onToggleExpanded}
              >
                <ChevronDown
                  className={cn(
                    "size-5 transition-transform duration-[var(--duration-base)]",
                    isExpanded && "rotate-180",
                  )}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </Button>
            }
          />
          <TooltipContent>{isExpanded ? "Collapse" : "Expand"}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )

  const metadataClass = cn(
    "flex min-w-0 items-center whitespace-nowrap text-[12px] leading-4 text-[var(--color-graphite-600)]",
    isCompleted && "text-[var(--color-graphite-400)]",
    isAbandoned && "text-[var(--color-graphite-500)]",
  )

  const row = (
    <Item
      role="listitem"
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `Open task: ${title}` : undefined}
      onClick={(event) => {
        if (!onOpen) return
        const rowBounds = event.currentTarget.getBoundingClientRect()
        if (event.clientX <= rowBounds.left + 44) return
        const target = event.target as HTMLElement
        if (
          target.closest(
            "button, [role=button], [role=checkbox], [role=menuitem], input",
          )
        )
          return
        onOpen()
      }}
      onKeyDown={(event) => {
        if (!onOpen || event.target !== event.currentTarget) return
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen()
        }
      }}
      data-task-status={status}
      data-task-density={twoLine ? "two" : "one"}
      className={cn(
        "group/task grid w-full cursor-pointer grid-cols-[var(--control-height)_minmax(0,1fr)_auto] items-center gap-0 overflow-hidden rounded-md border-0 bg-card p-0 transition-[height,opacity,transform,background-color] duration-200 ease-out hover:bg-[var(--color-graphite-100)] focus-within:bg-[var(--color-graphite-100)] focus-within:ring-2 focus-within:ring-ring/30",
        twoLine ? "h-16" : "h-[var(--task-row-height)]",
        collapsing &&
          "pointer-events-none h-0 -translate-y-1 scale-[0.99] opacity-0",
        visualState === "hover" && "bg-[var(--color-graphite-100)]",
        visualState === "focus" &&
          "bg-[var(--color-graphite-100)] ring-2 ring-ring/30",
        visualState === "selected" &&
          "bg-[var(--color-dana-accent-50)] ring-1 ring-[var(--color-dana-accent-200)]",
      )}
    >
      <ItemMedia
        className="size-[var(--control-height)]"
        onClick={(event) => event.stopPropagation()}
      >
        <CompletionControl
          status={completionPreview ? "completed" : status}
          onToggle={onToggleComplete}
        />
      </ItemMedia>

      {twoLine ? (
        /* Two lines: the title owns a full-width line and never truncates,
           and the details sit beneath it, quieter in size, colour and
           position (DES-096). */
        <div className="flex min-w-0 flex-col justify-center gap-1 pr-2">
          <TaskTitle
            title={title}
            struck={isAbandoned}
            dimmed={isCompleted}
            truncate={false}
            onRename={onRename}
          />
          <div data-task-metadata className={cn(metadataClass, "gap-3")}>
            {metadata}
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 items-center pr-2">
          <TaskTitle
            title={title}
            struck={isAbandoned}
            dimmed={isCompleted}
            truncate
            onRename={onRename}
          />
        </div>
      )}

      <div
        className={cn(
          "flex shrink-0 items-center justify-end gap-3 pr-2 pl-4",
          twoLine && "self-center",
        )}
      >
        {twoLine ? null : (
          <div data-task-metadata className={cn(metadataClass, "gap-3")}>
            {metadata}
          </div>
        )}
        {taskActions}
      </div>
    </Item>
  )

  if (!expanded) return row

  return (
    <div
      data-task-expanded={isExpanded ? "true" : "false"}
      className={cn(
        "rounded-lg border transition-[background-color,box-shadow,margin,border-color] duration-[var(--duration-base)]",
        isExpanded
          ? "my-1 border-[var(--color-graphite-300)] bg-card shadow-[var(--elevation-1)]"
          : "my-0 border-transparent",
      )}
    >
      {row}
      <Reveal open={isExpanded}>{expanded}</Reveal>
    </div>
  )
}
