/*
The designer's `src/components/task-row.tsx`, ported at P8R session R3.

His layout, his spacing and his class strings are unchanged. What changed is
named here and nowhere else, because RFC 0002 makes his prototype the source
this client is built from, so a silent difference between the two files is a
defect in the port rather than a decision.

**Four control names, section 9's words over his.** The owner ruled on
2026-08-13 that his design wins on structure and section 9 wins on labels, so
only the text moved: the overflow menu is 9.1's "More actions" where his read
"More task actions", and the star is 9.5's "Important" and "Mark as
important" where his read "Remove from Important" and "Mark important". The
restore control's accessible name is 9.5's "Restore", which is the text it
already showed; his `aria-label` of "Restore task" was overriding that text
with a different string, so it is gone rather than reworded.

**The star's name and its tooltip come apart, and they must.** 6 Q4 turns the
tooltip outward on Important, "Also in Planned, due ...", while the name has
to keep saying what pressing the control does, because AC-055's un-star asks
for it by name and AC-099 addresses the star on Important as "Important"
exactly. His component drove both attributes off one string, so pointing the
tooltip outward renamed the control. Here `importantTooltip` moves the
tooltip alone. Which way a page's stars point is the page layer's decision
and arrives as a plain prop: a component that read the route would behave
differently depending on where it was mounted.

**The row's action controls keep their box, which is the one departure from
his file that a reader will see.** His star, overflow and un-pull controls
animate from zero width, so at rest each has a bounding box of 0 by 40 and is
revealed by hover or by focus within the row. Measured against the running
prototype on 2026-08-13, which is what running it was for: four criteria act
on those controls without hovering first, and an element with an empty
bounding box is not visible to any of them. AC-157, AC-162 and AC-183 all
open a row's "More actions" from a page they have just loaded, and AC-165
asserts the un-pull control visible on My Day. 9.1's addressing sentence is
what settles it rather than the tests: every control section 9 names is
reachable by its role and its name, and 9.4 lists the star, the un-pull
control and the overflow as row elements. So the reveal is now opacity alone
and the width is always reserved. The visible cost is that a row's metadata
sits a fixed distance from its right edge instead of sliding as the controls
grow, which also removes the layout jitter that sliding produced. Flagged for
the human visual review of section 13 item 33.

Icons pass `strokeWidth` at the call site. That is his idiom and it is now
this client's: the global `.lucide` rule left with the old token file at R2.

**Three repairs at the R6 return, all of them things the P8 components this
file replaced already knew.** The port carried his markup faithfully, which is
what it was for, and in doing so dropped three fixes that were measured against
this suite rather than designed into his prototype. That is the failure mode of
a port, and it is worth naming as one: his file was never wrong, it was only
never subject to these measurements.

1. **The star is named by its content, never by an `aria-label`.** The whole
   argument is in `ui/StarButton.tsx`'s header, closed at P8 on 2026-08-11 and
   lost here. An `aria-label` is a *label*, and the acceptance suite's
   `formField` helper addresses 9.3's fields by label because those fields are
   ten different roles. 9.3's own "important" field is one of them, so any page
   holding a starred row with the form open had two elements answering to
   "Important", and AC-093 opens that form from five pages the seed stars a row
   on. The accessible name is unchanged, `getByRole('button', { name })` still
   finds it, and AC-055 and AC-099 address it exactly as they did.
2. **The tooltip is also a `title`, because a tooltip that exists only while it
   is open cannot be read.** `tooltipText` in the suite's harness names three
   faithful mechanisms and reads them immediately after a hover; the
   distribution's tooltip supplies its two only once the popup has mounted, so
   6 Q4's outward tooltip on Important read as the star's name instead. This is
   already the pairing the recurrence chip below uses, an attribute for what
   must be readable and his styled tooltip for the eye. The cost is that a
   native tooltip now follows his styled one on hover, which is a visible
   difference from his prototype and is flagged for section 13 item 33's review
   rather than left to be found there.
3. **The completion box shows what was asked for until the answer differs.** A
   box controlled by `status` alone snaps back while the request is in flight,
   which tells the person their click did nothing and is indistinguishable from
   a click that missed. The product reason is the P8 row's, in
   `ui/TaskRow.tsx`; the measured one is that 5.1 answers some transitions with
   a 409 and the status never moves, so a refused completion left the box
   unmoved and AC-157 could not reach its own assertion. The asked value is
   held against the status it was asked from, so the server's answer clears it
   and 8.3's refetch is still what decides.
*/
import { useState } from 'react'
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
} from 'lucide-react'

import { Avatar, AvatarFallback } from './ui/avatar.js'
import { Badge } from './ui/badge.js'
import { Button } from './ui/button.js'
import { Checkbox } from './ui/checkbox.js'
import {
  ABANDONED_CHIP,
  COMPLETE_TASK,
  MARK_AS_NOT_DONE,
  MORE_ACTIONS,
  REMOVE_FROM_MY_DAY,
  RESTORE,
  STAR_OFF,
  STAR_ON,
} from './ui/copy.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js'
import { Item, ItemContent, ItemMedia, ItemTitle } from './ui/item.js'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip.js'
import { cn } from './ui/utils.js'

export type TaskStatus = 'pending' | 'completed' | 'abandoned'
export type TaskRowVisualState = 'default' | 'hover' | 'focus' | 'selected'

const rowActionHover = 'hover:!bg-transparent aria-expanded:!bg-transparent'

/**
 * The resting treatment of a row's action controls: present, laid out, and
 * transparent until the row is hovered or holds focus. The file header gives
 * the reason this is opacity rather than his width animation.
 */
const revealOnRowHover =
  'pointer-events-none opacity-0 group-hover/task:pointer-events-auto group-hover/task:opacity-100 group-focus-within/task:pointer-events-auto group-focus-within/task:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100'

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
  /**
   * 6 Q4's outward tooltip, which replaces the tooltip alone and never the
   * accessible name. Supplied by the page layer on Important and nowhere
   * else.
   */
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
  // Held against the status it was asked from, so the server's answer clears
  // it and a refusal, which moves no status, does not.
  const [asked, setAsked] = useState<{ value: boolean; from: TaskStatus } | null>(
    null,
  )

  if (status === 'abandoned') {
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

  const completed =
    asked !== null && asked.from === status ? asked.value : status === 'completed'

  return (
    <Checkbox
      checked={completed}
      onCheckedChange={(next) => {
        setAsked({ value: next, from: status })
        onToggle?.(next)
      }}
      onClick={(event) => event.stopPropagation()}
      // 9.1's names table, which took both directions at the P8R change
      // control of 2026-08-13; 9.5 had already fixed the second for Done.
      aria-label={completed ? MARK_AS_NOT_DONE : COMPLETE_TASK}
      className="size-[var(--control-height)] !border-transparent !bg-transparent after:inset-auto after:size-[var(--checkbox-size)] after:rounded-[4px] after:border after:border-input after:bg-background after:content-[''] focus-visible:ring-0 focus-visible:after:ring-2 focus-visible:after:ring-ring/30 data-checked:!border-transparent data-checked:!bg-transparent data-checked:after:border-[var(--color-graphite-700)] data-checked:after:bg-[var(--color-graphite-700)] [&_[data-slot=checkbox-indicator]]:z-10"
    />
  )
}

function ImportanceControl({
  active,
  name,
  tooltip,
  visible,
  onToggle,
}: {
  active: boolean
  name: string
  tooltip: string
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
              'h-[var(--control-height)] w-[var(--control-height)] shrink-0 overflow-hidden border-0 p-0 transition-[opacity,color]',
              rowActionHover,
              active || visible ? 'opacity-100' : revealOnRowHover,
              active && 'text-[var(--color-graphite-800)]',
            )}
            title={tooltip}
            onClick={onToggle}
          >
            <Star
              className={cn('size-5', active && 'fill-current')}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            {/* The name, as content rather than as a label. The glyph stays
                `aria-hidden`, so a glyph swap is still never a rename. */}
            <span className="sr-only">{name}</span>
          </Button>
        }
      />
      <TooltipContent>{tooltip}</TooltipContent>
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

export function TaskRow({
  title,
  folder,
  due,
  status = 'pending',
  important = false,
  importantTooltip,
  assignee,
  unassigned = false,
  pulled = false,
  invitePending,
  steps,
  recurrence,
  visualState = 'default',
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
}: TaskRowProps) {
  const isCompleted = status === 'completed'
  const isAbandoned = status === 'abandoned'
  const actionsVisible =
    showSecondaryActions || visualState !== 'default' || menuOpen
  // 9.5: the star's name is its own state on every page. The tooltip is the
  // same string unless the page points it outward, which only Important does.
  const starName = important ? STAR_ON : STAR_OFF
  const starTooltip = importantTooltip ?? starName

  const overflowClass = cn(
    'h-[var(--control-height)] w-[var(--control-height)] shrink-0 overflow-hidden border-0 p-0 transition-opacity',
    rowActionHover,
    actionsVisible ? 'opacity-100' : revealOnRowHover,
  )

  const taskActions = (
    <div
      data-task-actions
      className="flex shrink-0 items-center gap-0"
      onClick={(event) => event.stopPropagation()}
    >
      <ImportanceControl
        active={important}
        name={starName}
        tooltip={starTooltip}
        visible={actionsVisible}
        onToggle={onToggleImportant}
      />

      <DropdownMenu defaultOpen={menuOpen} modal={!menuOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className={overflowClass}
              aria-label={MORE_ACTIONS}
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
          {status === 'pending' ? (
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
      // 9.1's roles table: a task row is a list item or a row, and 9.4
      // enumerates what one holds, so this is a real thing here rather than a
      // div the suite is guessing at. The list around it is the page's.
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
            'button, [role=button], [role=checkbox], [role=menuitem], input',
          )
        )
          return
        onOpen()
      }}
      onKeyDown={(event) => {
        if (!onOpen || event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      data-task-status={status}
      className={cn(
        'group/task grid h-[var(--task-row-height)] w-full cursor-pointer grid-cols-[var(--control-height)_minmax(0,1fr)_auto] items-center gap-0 overflow-hidden rounded-md border-0 bg-card p-0 transition-[height,opacity,transform,background-color] duration-200 ease-out hover:bg-[var(--color-graphite-100)] focus-within:bg-[var(--color-graphite-100)] focus-within:ring-2 focus-within:ring-ring/30',
        collapsing && 'pointer-events-none h-0 -translate-y-1 scale-[0.99] opacity-0',
        visualState === 'hover' && 'bg-[var(--color-graphite-100)]',
        visualState === 'focus' &&
          'bg-[var(--color-graphite-100)] ring-2 ring-ring/30',
        visualState === 'selected' &&
          'bg-[var(--color-dana-accent-50)] ring-1 ring-[var(--color-dana-accent-200)]',
      )}
    >
      <ItemMedia
        className="size-[var(--control-height)]"
        onClick={(event) => event.stopPropagation()}
      >
        <CompletionControl
          status={completionPreview ? 'completed' : status}
          onToggle={onToggleComplete}
        />
      </ItemMedia>

      <ItemContent className="min-w-0 flex-row items-center gap-0 pr-2">
        <ItemTitle
          className={cn(
            'min-w-0 shrink truncate text-sm leading-5 font-normal text-[var(--color-graphite-800)]',
            isCompleted && 'text-[var(--color-graphite-600)]',
            isAbandoned &&
              'text-[var(--color-graphite-600)] line-through decoration-[var(--color-graphite-500)]',
          )}
          title={title}
        >
          {title}
        </ItemTitle>

        {isAbandoned ? (
          <Button
            variant="ghost"
            className={cn(
              'h-[var(--control-height)] shrink-0 px-2 text-sm',
              rowActionHover,
            )}
            onClick={() => onToggleComplete?.(false)}
          >
            <RotateCcw
              data-icon="inline-start"
              className="size-4"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            {RESTORE}
          </Button>
        ) : null}

        {pulled ? (
          <Button
            variant="ghost"
            className={cn(
              'h-[var(--control-height)] max-w-44 shrink-0 overflow-hidden px-2 text-sm transition-opacity',
              rowActionHover,
              actionsVisible ? 'opacity-100' : revealOnRowHover,
            )}
            onClick={onRemoveFromMyDay}
          >
            {REMOVE_FROM_MY_DAY}
          </Button>
        ) : null}

      </ItemContent>

      <div
        data-task-metadata
        className={cn(
          'flex min-w-0 shrink-0 items-center justify-end gap-3 whitespace-nowrap pl-4 pr-2 text-xs text-[var(--color-graphite-600)]',
          isCompleted && 'text-[var(--color-graphite-400)]',
          isAbandoned && 'text-[var(--color-graphite-500)]',
        )}
      >
        {folder ? <FolderMeta {...folder} /> : null}

        {pulled ? (
          <span className="inline-flex shrink-0 items-center gap-1.5">
            <Pin className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Pulled
          </span>
        ) : null}

        {steps ? (
          <span className="inline-flex shrink-0 items-center gap-1.5">
            <ListChecks className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {steps.complete}/{steps.total}
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

        {isAbandoned ? <Badge variant="secondary">{ABANDONED_CHIP}</Badge> : null}

        {invitePending ? (
          <Badge
            variant="outline"
            className="max-w-64 border-[var(--color-info-200)] bg-[var(--color-info-100)] text-[var(--color-info-700)]"
          >
            <span className="truncate">Invite pending: {invitePending}</span>
          </Badge>
        ) : null}

        {unassigned ? <Badge variant="outline">Unassigned</Badge> : null}

        {assignee ? <AssigneeMeta {...assignee} /> : null}

        {due ? (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5',
              due.overdue && 'font-medium text-[var(--color-danger-700)]',
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
