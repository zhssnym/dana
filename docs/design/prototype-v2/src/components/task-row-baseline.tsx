/*
The row that shipped at v1, kept as the concept lab's C0 control.

It is a byte-for-byte copy of `task-row.tsx` as it stood before the V3 design
was ported into that file on 2026-08-18. The lab measures every concept against
this one, and `row-lab.tsx` says why it must not be touched: "it is the
control, and a control you have improved is not a control." Once `task-row.tsx`
became the new design, the lab needed the old one to still exist somewhere, and
this is that somewhere.

Nothing but the lab may import this. It is a museum piece, not a component.
*/
import {
  Ban,
  CircleAlert,
  Folder,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Pin,
  Repeat2,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type TaskStatus = "pending" | "completed" | "abandoned"
type TaskRowVisualState = "default" | "hover" | "focus" | "selected"

const rowActionHover =
  "hover:!bg-transparent aria-expanded:!bg-transparent"

export interface BaselineTaskRowProps {
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
  }
  unassigned?: boolean
  pulled?: boolean
  invitePending?: string
  steps?: {
    complete: number
    total: number
  }
  recurrence?: string
  visualState?: TaskRowVisualState
  showSecondaryActions?: boolean
  menuOpen?: boolean
  completionPreview?: boolean
  collapsing?: boolean
  onOpen?: () => void
  onToggleComplete?: (completed: boolean) => void
  onToggleImportant?: () => void
  onRemoveFromMyDay?: () => void
  onAbandon?: () => void
  onDelete?: () => void
}

function CompletionControl({
  status,
  onToggle,
}: {
  status: TaskStatus
  onToggle?: (completed: boolean) => void
}) {
  if (status === "abandoned") {
    return (
      <span
        role="img"
        className="flex size-[var(--control-height)] items-center justify-center text-muted-foreground"
        aria-label="Abandoned task"
      >
        <Ban className="size-5" strokeWidth={1.75} aria-hidden="true" />
      </span>
    )
  }

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
    <span className="inline-flex min-w-0 shrink-0 items-center gap-2">
      <Folder
        className="size-4 shrink-0"
        style={{ color }}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span className="truncate">{name}</span>
    </span>
  )
}

function AssigneeMeta({ initials, name }: { initials: string; name: string }) {
  return (
    <span className="inline-flex min-w-0 shrink-0 items-center gap-2">
      <Avatar size="sm" className="size-5">
        <AvatarFallback className="text-[0.625rem] font-medium">
          {initials}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{name}</span>
    </span>
  )
}

export function BaselineTaskRow({
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
  recurrence,
  visualState = "default",
  showSecondaryActions = false,
  menuOpen = false,
  completionPreview = false,
  collapsing = false,
  onOpen,
  onToggleComplete,
  onToggleImportant,
  onRemoveFromMyDay,
  onAbandon,
  onDelete,
}: BaselineTaskRowProps) {
  const isCompleted = status === "completed"
  const isAbandoned = status === "abandoned"
  const actionsVisible =
    showSecondaryActions || visualState !== "default" || menuOpen
  const starLabel =
    importantTooltip ?? (important ? "Remove from Important" : "Mark important")

  const overflowClass = cn(
    "h-[var(--control-height)] shrink-0 overflow-hidden border-0 p-0 transition-[width,opacity]",
    rowActionHover,
    actionsVisible
      ? "w-[var(--control-height)] opacity-100"
      : "pointer-events-none w-0 opacity-0 group-hover/task:pointer-events-auto group-hover/task:w-[var(--control-height)] group-hover/task:opacity-100 group-focus-within/task:pointer-events-auto group-focus-within/task:w-[var(--control-height)] group-focus-within/task:opacity-100",
  )

  const taskActions = (
    <div
      data-task-actions
      className="flex shrink-0 items-center gap-0"
      onClick={(event) => event.stopPropagation()}
    >
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
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            className="min-h-[var(--control-height)] text-sm"
            onClick={onOpen}
          >
            <Pencil className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Edit
          </DropdownMenuItem>
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
    </div>
  )

  return (
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
      className={cn(
        "group/task grid h-[var(--task-row-height)] w-full cursor-pointer grid-cols-[var(--control-height)_minmax(0,1fr)_auto] items-center gap-0 overflow-hidden rounded-md border-0 bg-card p-0 transition-[height,opacity,transform,background-color] duration-200 ease-out hover:bg-[var(--color-graphite-100)] focus-within:bg-[var(--color-graphite-100)] focus-within:ring-2 focus-within:ring-ring/30",
        collapsing && "pointer-events-none h-0 -translate-y-1 scale-[0.99] opacity-0",
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

      <ItemContent className="min-w-0 flex-row items-center gap-0 pr-2">
        <ItemTitle
          className={cn(
            "min-w-0 shrink truncate text-sm leading-5 font-normal text-[var(--color-graphite-800)]",
            isCompleted && "text-[var(--color-graphite-600)]",
            isAbandoned &&
              "text-[var(--color-graphite-600)] line-through decoration-[var(--color-graphite-500)]",
          )}
          title={title}
        >
          {title}
        </ItemTitle>

        {isAbandoned ? (
          <Button
            variant="ghost"
            className={cn(
              "h-[var(--control-height)] shrink-0 px-2 text-sm",
              rowActionHover,
            )}
            aria-label="Restore task"
            onClick={() => onToggleComplete?.(false)}
          >
            <RotateCcw
              data-icon="inline-start"
              className="size-4"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Restore
          </Button>
        ) : null}

        {pulled ? (
          <Button
            variant="ghost"
            className={cn(
              "h-[var(--control-height)] shrink-0 overflow-hidden text-sm transition-[max-width,padding,opacity]",
              rowActionHover,
              actionsVisible
                ? "max-w-44 px-2 opacity-100"
                : "pointer-events-none max-w-0 px-0 opacity-0 group-hover/task:pointer-events-auto group-hover/task:max-w-44 group-hover/task:px-2 group-hover/task:opacity-100 group-focus-within/task:pointer-events-auto group-focus-within/task:max-w-44 group-focus-within/task:px-2 group-focus-within/task:opacity-100",
            )}
            onClick={onRemoveFromMyDay}
          >
            Remove from My Day
          </Button>
        ) : null}

      </ItemContent>

      <div
        data-task-metadata
        className={cn(
          "flex min-w-0 shrink-0 items-center justify-end gap-3 whitespace-nowrap pl-4 pr-2 text-xs text-[var(--color-graphite-600)]",
          isCompleted && "text-[var(--color-graphite-400)]",
          isAbandoned && "text-[var(--color-graphite-500)]",
        )}
      >
        {/* One canonical slot order on every page (review L2): state chips,
            folder, pulled, recurrence, steps, assignee, then due as the
            right-aligned final data column, actions outermost. */}
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
            <Pin className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Pulled
          </span>
        ) : null}

        {recurrence ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  role="img"
                  className="inline-flex size-5 shrink-0 items-center justify-center"
                  aria-label={`Repeats ${recurrence.toLowerCase()}`}
                >
                  <Repeat2
                    className="size-4"
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
          <span className="inline-flex shrink-0 items-center gap-1.5">
            <ListChecks className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {steps.complete}/{steps.total}
          </span>
        ) : null}

        {assignee ? <AssigneeMeta {...assignee} /> : null}

        {due ? (
          <span
            className={cn(
              "inline-flex min-w-[5.5rem] shrink-0 items-center justify-end gap-1.5",
              due.overdue && "font-medium text-[var(--color-danger-700)]",
            )}
          >
            {due.overdue ? (
              <CircleAlert
                className="size-4"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            ) : null}
            {due.label}
          </span>
        ) : null}

        {taskActions}
      </div>
    </Item>
  )
}
