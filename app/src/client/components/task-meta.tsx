/*
The one task meta line (round 4). Every view draws a task's right side through
here so a task looks the same everywhere, in fixed positions:

  date (or start – due) · [extras] · subtasks n/m · repeat glyph · star

- The date is the label `dueDisplay` made on the viewer's clock (12/24h), in
  the day/month order of the viewer's locale (`lib/dates.ts`, the one formatter).
- Overdue is the destructive ink, and said to screen readers.
- The star is a lighter tone than the title, even when set, so it never
  competes with it; unset, it shows on hover or focus of the enclosing
  `group/row`.
*/
import type { ReactNode } from "react"

import { Repeat2, Star } from "../lib/icons.js"

import { Face } from "./person-face.js"
import { RowLabels, type LabelLook } from "./label-chip.js"
import { cn } from "./ui/utils.js"

export interface TaskMetaProps {
  readonly due?: { readonly label: string; readonly overdue?: boolean }
  /** The Schedule's start where it is not the due day: "24 Sep – Fri" with a due date; alone, the whole phrase ("Started yesterday", "Starts Mon"). */
  readonly starts?: string
  /** Late is not coloured where the list already says every row is late. */
  readonly overdueGiven?: boolean
  readonly steps?: { readonly done: number; readonly total: number }
  /** The repeat's short wording, for its tooltip; absent when it does not repeat. */
  readonly recurrence?: string
  /** Anything a view adds between the date and the counts (folder, face). */
  readonly extras?: readonly ReactNode[]
  readonly star?: {
    readonly important: boolean
    readonly tooltip?: string
    readonly onToggle: () => void
    /** Work rows/cards keep the action reachable on touch instead of deferring to the Task page. */
    readonly touchReachable?: boolean
  }
  readonly className?: string
}

export function TaskMeta({ due, starts, overdueGiven, steps, recurrence, extras, star, className }: TaskMetaProps) {
  const late = Boolean(due?.overdue) && !overdueGiven
  return (
    <span className={cn("flex min-w-0 items-center gap-3 text-xs text-muted-foreground", className)}>
      <span className="flex min-w-0 items-center gap-3 overflow-hidden">
        {due ? (
          <span className="shrink-0 whitespace-nowrap tabular-nums">
            {/* A phone keeps the title's room and says the deadline alone. */}
            {starts === undefined ? null : <span className="max-sm:hidden">{`${starts} – `}</span>}
            <span className={cn(late && "text-destructive")}>
              {late ? <span className="sr-only">Overdue, </span> : null}
              {due.label}
            </span>
          </span>
        ) : starts === undefined ? null : (
          <span className="shrink-0 whitespace-nowrap tabular-nums">{starts}</span>
        )}
        {extras}
        {steps && steps.total > 0 ? (
          <span className="shrink-0 whitespace-nowrap tabular-nums" title={`${steps.done} of ${steps.total} subtasks done`}>
            {steps.done}/{steps.total}
          </span>
        ) : null}
        {recurrence !== undefined ? (
          <span className="flex shrink-0 items-center" title={repeatTitle(recurrence)}>
            <Repeat2 className="size-3.5" strokeWidth={1.75} aria-label="Repeats" />
          </span>
        ) : null}
      </span>
      {star ? <TaskStar {...star} /> : null}
    </span>
  )
}

/** "Repeats weekly"; "Repeats" where the rule is not known. */
function repeatTitle(recurrence: string): string {
  return recurrence === "" || recurrence === "Repeats" ? "Repeats" : `Repeats ${recurrence.toLowerCase()}`
}

/** What a view knows about a task, in the row's display shape. */
export interface RowMetaSource {
  readonly due?: { readonly label: string; readonly overdue?: boolean }
  readonly starts?: string
  readonly folder?: { readonly name: string }
  readonly assignee?: { readonly initials: string; readonly name: string; readonly image?: string; readonly id?: string } | null
  readonly assignees?: readonly { readonly initials: string; readonly name: string; readonly image?: string; readonly id?: string }[]
  readonly steps?: { readonly done: number; readonly total: number }
  readonly recurrence?: string
  readonly blockedBy?: number
  readonly finished?: boolean
  readonly important?: boolean
  readonly importantTooltip?: string
  /** The task's Labels (#208), drawn before the folder. */
  readonly labels?: readonly LabelLook[]
}

/** What the list or column around the task has already said. */
export interface RowMetaGiven {
  readonly folder?: boolean
  readonly assignee?: boolean
  readonly due?: boolean
  readonly overdue?: boolean
}

/**
 * The meta line built from a task's display, the same on a list row, a board
 * card and a Linear step: date · folder · Blocked · face · n/m · repeat · star.
 */
export function RowMeta({
  source,
  given = {},
  onToggleImportant,
  starTouchReachable,
  className,
}: {
  readonly source: RowMetaSource
  readonly given?: RowMetaGiven
  readonly onToggleImportant: () => void
  readonly starTouchReachable?: boolean
  readonly className?: string
}) {
  const folderName = given.folder ? undefined : source.folder?.name.trim()
  const extras: ReactNode[] = []
  /* Two or more other things on the line leave a narrow card no room for a
     long label name beside them. */
  const crowded =
    [
      (source.due !== undefined || source.starts !== undefined) && !given.due,
      source.steps !== undefined,
      source.recurrence !== undefined,
      Boolean(folderName),
      (source.blockedBy ?? 0) > 0 && !source.finished,
      Boolean(source.assignee || source.assignees?.length) && !given.assignee,
    ].filter(Boolean).length >= 2
  if (source.labels !== undefined && source.labels.length > 0) {
    extras.push(<RowLabels key="labels" labels={source.labels} crowded={crowded} />)
  }
  if (folderName) {
    extras.push(
      <span key="folder" className="min-w-0 max-w-[10rem] truncate max-md:hidden">
        {folderName}
      </span>,
    )
  }
  if ((source.blockedBy ?? 0) > 0 && !source.finished) {
    extras.push(
      <span key="blocked" className="shrink-0 whitespace-nowrap">
        Blocked
      </span>,
    )
  }
  const assignees = source.assignees ?? (source.assignee ? [source.assignee] : [])
  if (assignees.length > 0 && !given.assignee) {
    extras.push(
      <span key="assignee" className="flex shrink-0 items-center gap-0.5" title={assignees.map((person) => person.name).join(', ')}>
        {assignees.slice(0, 3).map((person, index) =>
          <Face key={person.id ?? index} person={person} className="size-5 data-[size=sm]:size-5" />)}
        {assignees.length > 3 ? <span>+{assignees.length - 3}</span> : null}
      </span>,
    )
  }
  return (
    <TaskMeta
      className={className}
      {...(source.due === undefined || given.due ? {} : { due: source.due })}
      {...(source.starts === undefined || given.due ? {} : { starts: source.starts })}
      {...(given.overdue === undefined ? {} : { overdueGiven: given.overdue })}
      {...(source.steps === undefined ? {} : { steps: source.steps })}
      {...(source.recurrence === undefined ? {} : { recurrence: source.recurrence })}
      extras={extras}
      star={{
        important: Boolean(source.important),
        ...(source.importantTooltip === undefined ? {} : { tooltip: source.importantTooltip }),
        onToggle: onToggleImportant,
        ...(starTouchReachable === undefined ? {} : { touchReachable: starTouchReachable }),
      }}
    />
  )
}

/*
Reserved space and opacity only, so hovering or focusing never shifts the meta.
Most lists keep the old phone rule (the Task page owns starring there); Work can
opt into a visible, tappable star because its rows/cards are direct work surfaces.
*/
export function TaskStar({ important, tooltip, onToggle, touchReachable }: NonNullable<TaskMetaProps["star"]>) {
  const label = important ? "Important" : "Mark as important"
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      aria-pressed={important}
      title={tooltip ?? label}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-sm text-quiet-foreground transition-[opacity,color] hover:text-muted-foreground",
        important ? "opacity-100" : "opacity-0 group-hover/row:opacity-100 group-focus/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100",
        touchReachable ? "[@media(hover:none)]:opacity-100" : "[@media(hover:none)]:pointer-events-none",
        !important && !touchReachable && "[@media(hover:none)]:invisible",
      )}
    >
      <span className="sr-only">{label}</span>
      <Star className={cn("size-3.5", important && "fill-current [&_svg]:fill-current")} strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}
