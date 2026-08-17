/*
The V3 candidate rows, drawn so they can be compared by looking.

Every concept here renders its OWN markup rather than configuring
`components/task-row.tsx`. That is deliberate: the shipping row stays exactly
what it is until Imran picks, so nothing in this file can change a screen by
accident, and a rejected concept is deleted rather than unwound.

The directions come from the V3 research pass of 2026-08-17. Each carries the
principle it rests on, because a row that cannot say why it is shaped that way
is a preference rather than a design.
*/

import {
  CalendarClock,
  CircleAlert,
  CircleDashed,
  Eye,
  Folder,
  ListChecks,
  MoreHorizontal,
  Pause,
  Pin,
  Repeat2,
  Star,
} from "lucide-react"
import type { ReactNode } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/* ---------------------------------------------------------------- data -- */

export interface ConceptTask {
  title: string
  folder?: { name: string; color: string }
  due?: { label: string; overdue?: boolean }
  assignee?: { initials: string; name: string }
  steps?: { done: number; total: number }
  recurrence?: boolean
  pulled?: boolean
  important?: boolean
  abandoned?: boolean
  notes?: string
  /* Future only. Never v1; drawn so the shape can be judged now. */
  agent?: {
    state: "waiting" | "working" | "blocked" | "review"
    detail: string
  }
}

const VIOLET = "var(--color-folder-violet)"
const FERN = "var(--color-folder-fern)"
const TEAL = "var(--color-folder-teal)"

/* The sample is fixed across every concept, and it is chosen so the hard
   cases never leave the screen: a bare task, a long title, an overdue one,
   one carrying nearly everything at once, a repeating pulled one, and an
   abandoned one. A concept that only survives short titles has not been
   tested. */
export const SAMPLE: ConceptTask[] = [
  { title: "Renew the library card" },
  {
    title: "Confirm final guest count and send it to the caterer before Thursday",
    folder: { name: "Wedding", color: VIOLET },
    due: { label: "Due 14 Aug" },
    steps: { done: 2, total: 5 },
    notes: "The caterer needs the final number by Thursday lunchtime.",
  },
  {
    title: "Send the venue deposit",
    folder: { name: "Wedding", color: VIOLET },
    due: { label: "Overdue · 6 Aug", overdue: true },
    important: true,
  },
  {
    title: "Review the community grant application",
    folder: { name: "Community planning committee", color: FERN },
    due: { label: "Overdue · 8 Aug", overdue: true },
    steps: { done: 2, total: 4 },
    assignee: { initials: "SK", name: "Sara" },
    recurrence: true,
    notes: "Second draft is in the shared folder.",
  },
  {
    title: "Water the balcony plants",
    folder: { name: "Home", color: TEAL },
    due: { label: "Due today" },
    recurrence: true,
    pulled: true,
  },
  {
    title: "Keep the backup chair reservation",
    folder: { name: "Wedding", color: VIOLET },
    due: { label: "12 Aug" },
    abandoned: true,
  },
]

/* Agent work, for direction H only. Section 9 knows nothing about any of
   this; it is drawn to test whether the row has room for the vision, not to
   propose shipping it. */
export const AGENT_SAMPLE: ConceptTask[] = [
  {
    title: "Draft the sponsor thank-you letters",
    folder: { name: "Community planning committee", color: FERN },
    due: { label: "Due today" },
    assignee: { initials: "IW", name: "Imran" },
    agent: { state: "working", detail: "Working · started 4m ago" },
  },
  {
    title: "Collect the venue accessibility details",
    folder: { name: "Wedding", color: VIOLET },
    assignee: { initials: "IW", name: "Imran" },
    agent: { state: "blocked", detail: "Blocked · needs the venue address" },
  },
  {
    title: "Summarise the grant criteria",
    folder: { name: "Community planning committee", color: FERN },
    due: { label: "Due 18 Aug" },
    assignee: { initials: "SK", name: "Sara" },
    agent: { state: "review", detail: "Ready for review" },
  },
  {
    title: "Compare three catering quotes",
    folder: { name: "Wedding", color: VIOLET },
    assignee: { initials: "IW", name: "Imran" },
    agent: { state: "waiting", detail: "Waiting" },
  },
]

/* --------------------------------------------------------------- pieces -- */

const META = "text-xs text-[var(--color-graphite-600)]"

function Check({ dim = false }: { dim?: boolean }) {
  return (
    <span className="flex size-10 items-center justify-center">
      <span
        className={cn(
          "size-5 rounded-[4px] border border-input bg-background",
          dim && "opacity-60",
        )}
      />
    </span>
  )
}

function FolderBit({ folder }: { folder: NonNullable<ConceptTask["folder"]> }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <Folder
        className="size-4 shrink-0"
        style={{ color: folder.color }}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span className="truncate">{folder.name}</span>
    </span>
  )
}

function DueBit({ due }: { due: NonNullable<ConceptTask["due"]> }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[5.5rem] shrink-0 items-center justify-end gap-1.5",
        due.overdue && "font-medium text-[var(--color-danger-700)]",
      )}
    >
      {due.overdue ? (
        <CircleAlert className="size-4" strokeWidth={1.75} aria-hidden="true" />
      ) : null}
      {due.label}
    </span>
  )
}

function PersonBit({
  assignee,
}: {
  assignee: NonNullable<ConceptTask["assignee"]>
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <Avatar size="sm" className="size-5">
        <AvatarFallback className="text-[0.625rem] font-medium">
          {assignee.initials}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{assignee.name}</span>
    </span>
  )
}

function Actions({
  reserved = false,
  important = false,
}: {
  reserved?: boolean
  important?: boolean
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-end gap-1 transition-opacity",
        /* Reserved means the gutter is always there and only its opacity
           moves, so no row's metadata shifts when a neighbour is hovered. */
        reserved
          ? "w-20 opacity-35 group-hover/row:opacity-100"
          : "w-20 opacity-0 group-hover/row:opacity-100",
      )}
    >
      <Star
        className={cn(
          "size-5 text-[var(--color-graphite-600)]",
          important && "fill-current text-[var(--color-graphite-800)] opacity-100",
        )}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <MoreHorizontal
        className="size-5 text-[var(--color-graphite-600)]"
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </span>
  )
}

function Title({ task, className }: { task: ConceptTask; className?: string }) {
  return (
    <span
      className={cn(
        "min-w-0 truncate text-sm leading-5 text-[var(--color-graphite-800)]",
        task.abandoned &&
          "text-[var(--color-graphite-600)] line-through decoration-[var(--color-graphite-500)]",
        className,
      )}
    >
      {task.title}
    </span>
  )
}

const ROW =
  "group/row grid h-11 w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center rounded-md hover:bg-[var(--color-graphite-100)]"

/* ------------------------------------------------------------ concept A -- */
/* Disciplined: at most three facts at rest, the rest behind one pill. */

function RowA({ task }: { task: ConceptTask }) {
  const extras =
    (task.steps ? 1 : 0) + (task.recurrence ? 1 : 0) + (task.pulled ? 1 : 0)

  return (
    <div className={ROW}>
      <Check dim={task.abandoned} />
      <Title task={task} />
      <div className={cn("flex items-center justify-end gap-3 pr-2", META)}>
        {task.abandoned ? <Badge variant="secondary">Abandoned</Badge> : null}
        {extras > 0 ? (
          <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-[var(--color-graphite-100)] px-2 text-[11px] font-medium text-[var(--color-graphite-600)]">
            +{extras}
          </span>
        ) : null}
        {task.assignee ? <PersonBit assignee={task.assignee} /> : null}
        {task.folder ? <FolderBit folder={task.folder} /> : null}
        {task.due ? <DueBit due={task.due} /> : null}
        <Actions reserved important={task.important} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ concept E -- */
/* Editable chips: every fact is the control that changes it. */

function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "danger"
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-transparent px-1.5",
        "hover:border-[var(--color-graphite-300)] hover:bg-card",
        tone === "danger" && "font-medium text-[var(--color-danger-700)]",
      )}
    >
      {children}
    </span>
  )
}

function RowE({ task }: { task: ConceptTask }) {
  return (
    <div className={ROW}>
      <Check dim={task.abandoned} />
      <Title task={task} />
      <div className={cn("flex items-center justify-end gap-1.5 pr-2", META)}>
        {task.abandoned ? <Badge variant="secondary">Abandoned</Badge> : null}
        {task.steps ? (
          <Chip>
            <ListChecks className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {task.steps.done}/{task.steps.total}
          </Chip>
        ) : null}
        {task.recurrence ? (
          <Chip>
            <Repeat2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </Chip>
        ) : null}
        {task.pulled ? (
          <Chip>
            <Pin className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Pulled
          </Chip>
        ) : null}
        {task.folder ? (
          <Chip>
            <FolderBit folder={task.folder} />
          </Chip>
        ) : null}
        {task.assignee ? (
          <Chip>
            <PersonBit assignee={task.assignee} />
          </Chip>
        ) : null}
        {task.due ? (
          <Chip tone={task.due.overdue ? "danger" : "neutral"}>
            {task.due.overdue ? (
              <CircleAlert className="size-4" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <CalendarClock
                className="size-4"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            )}
            {task.due.label}
          </Chip>
        ) : null}
        <Actions reserved important={task.important} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ concept F -- */
/* Two-line on selection: the row breathes where you are looking. */

function RowF({ task, selected }: { task: ConceptTask; selected?: boolean }) {
  if (!selected) return <RowA task={task} />

  return (
    <div className="grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-start rounded-md bg-[var(--color-graphite-100)] py-1.5">
      <Check dim={task.abandoned} />
      <div className="flex min-w-0 flex-col gap-1 pt-2.5">
        <Title task={task} />
        <div className="flex items-center gap-3 text-xs text-[var(--color-graphite-600)]">
          {task.steps ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-1 w-16 overflow-hidden rounded-full bg-[var(--color-graphite-200)]">
                <span
                  className="block h-full rounded-full bg-[var(--color-graphite-600)]"
                  style={{
                    width: `${(task.steps.done / task.steps.total) * 100}%`,
                  }}
                />
              </span>
              {task.steps.done}/{task.steps.total}
            </span>
          ) : null}
          {task.notes ? (
            <span className="truncate text-[var(--color-graphite-500)]">
              {task.notes}
            </span>
          ) : null}
        </div>
      </div>
      <div className={cn("flex items-center justify-end gap-3 pt-2.5 pr-2", META)}>
        {task.assignee ? <PersonBit assignee={task.assignee} /> : null}
        {task.folder ? <FolderBit folder={task.folder} /> : null}
        {task.due ? <DueBit due={task.due} /> : null}
        <Actions reserved important={task.important} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ concept H -- */
/* Actor and state: the row's left edge and one chip carry the future. */

const AGENT_STATE: Record<
  NonNullable<ConceptTask["agent"]>["state"],
  { rail: string; tint: string; ink: string; icon: typeof Pause }
> = {
  waiting: {
    rail: "var(--color-graphite-300)",
    tint: "var(--color-graphite-100)",
    ink: "var(--color-graphite-700)",
    icon: CircleDashed,
  },
  working: {
    rail: "var(--color-info-700)",
    tint: "var(--color-info-100)",
    ink: "var(--color-info-700)",
    icon: Repeat2,
  },
  blocked: {
    rail: "var(--color-warning-700)",
    tint: "var(--color-warning-100)",
    ink: "var(--color-warning-700)",
    icon: Pause,
  },
  review: {
    rail: "var(--color-success-700)",
    tint: "var(--color-success-100)",
    ink: "var(--color-success-700)",
    icon: Eye,
  },
}

function RowH({ task }: { task: ConceptTask }) {
  const state = task.agent ? AGENT_STATE[task.agent.state] : null
  const StateIcon = state?.icon

  return (
    <div className="group/row grid h-11 w-full grid-cols-[4px_40px_minmax(0,1fr)_auto] items-center rounded-md hover:bg-[var(--color-graphite-100)]">
      <span
        className="h-6 w-1 rounded-full"
        style={{ background: state ? state.rail : "transparent" }}
        aria-hidden="true"
      />
      {task.agent ? (
        /* Square, because shape carries kind: a person is round, an agent is
           not. Colour is left to state alone. */
        <span className="flex size-10 items-center justify-center">
          <span
            className="flex size-5 items-center justify-center rounded-[5px] border text-[10px] font-semibold"
            style={{ borderColor: state?.rail, color: state?.ink }}
          >
            AI
          </span>
        </span>
      ) : (
        <Check />
      )}
      <Title task={task} />
      <div className={cn("flex items-center justify-end gap-3 pr-2", META)}>
        {task.agent && state && StateIcon ? (
          <span
            className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium"
            style={{ background: state.tint, color: state.ink }}
          >
            <StateIcon className="size-3.5" strokeWidth={2} aria-hidden="true" />
            {task.agent.detail}
          </span>
        ) : null}
        {task.assignee ? (
          <span className="inline-flex shrink-0 items-center gap-1.5">
            <PersonBit assignee={task.assignee} />
            {task.agent ? (
              <span
                className="rounded-[3px] border px-1 text-[9px] font-semibold"
                style={{ borderColor: state?.rail, color: state?.ink }}
                title="Delegated to an agent; the person stays responsible"
              >
                AI
              </span>
            ) : null}
          </span>
        ) : null}
        {task.folder ? <FolderBit folder={task.folder} /> : null}
        {task.due ? <DueBit due={task.due} /> : null}
        <Actions reserved />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ concept D -- */
/* Expand in place, the list receding so the card reads as a new object. */

function PropertyRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid h-9 grid-cols-[110px_minmax(0,1fr)] items-center text-[13px]">
      <span className="text-[var(--color-graphite-600)]">{label}</span>
      <span className="text-sm text-[var(--color-graphite-800)]">{value}</span>
    </div>
  )
}

function ExpandedCard({ task }: { task: ConceptTask }) {
  return (
    <div className="rounded-lg border border-[var(--color-graphite-300)] bg-card shadow-[0_8px_24px_-12px_rgba(27,28,32,0.30)]">
      <div className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-start border-b border-[var(--color-graphite-200)] px-0 py-2">
        <Check />
        <span className="pt-1.5 text-[15px] leading-6 font-semibold text-[var(--color-graphite-900)]">
          {task.title}
        </span>
        <span className="flex items-center gap-1 pt-1.5 pr-3">
          <Star
            className="size-5 text-[var(--color-graphite-600)]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <MoreHorizontal
            className="size-5 text-[var(--color-graphite-600)]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </span>
      </div>

      <div className="px-3 py-2">
        <PropertyRow
          label="Folder"
          value={task.folder ? <FolderBit folder={task.folder} /> : "Inbox"}
        />
        <PropertyRow
          label="Assignee"
          value={
            task.assignee ? <PersonBit assignee={task.assignee} /> : "Imran Wafa"
          }
        />
        <PropertyRow label="Due" value={task.due?.label ?? "No date"} />
        <PropertyRow label="Reminder" value="No reminder" />
        <PropertyRow label="Repeat" value={task.recurrence ? "Weekly" : "Does not repeat"} />

        <div className="mt-2 border-t border-[var(--color-graphite-200)] pt-2">
          <p className="mb-1.5 text-[13px] text-[var(--color-graphite-600)]">Steps</p>
          <div className="flex h-8 items-center gap-2 text-sm">
            <span className="size-4 rounded-[3px] border border-input" />
            Confirm the numbers with the venue
          </div>
          <div className="flex h-8 items-center gap-2 text-sm">
            <span className="size-4 rounded-[3px] border border-input" />
            Send the final count
          </div>
        </div>

        <div className="mt-2 border-t border-[var(--color-graphite-200)] pt-2">
          <p className="mb-1.5 text-[13px] text-[var(--color-graphite-600)]">Notes</p>
          <p className="text-sm text-[var(--color-graphite-700)]">
            {task.notes ?? "—"}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[var(--color-graphite-200)] px-3 py-2">
        <span className="text-[11px] text-[var(--color-graphite-500)]">
          Created 4 Aug by Imran Wafa
        </span>
        <span className="flex items-center gap-2">
          <span className="rounded-md px-3 py-1.5 text-[13px] text-[var(--color-graphite-700)]">
            Cancel
          </span>
          <span className="rounded-md bg-[var(--color-graphite-900)] px-3 py-1.5 text-[13px] font-medium text-white">
            Save changes
          </span>
        </span>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- concepts -- */

export interface ConceptSpec {
  id: string
  name: string
  optimisesFor: string
  givesUp: string
  principle: string
  render: () => ReactNode
}

const list = (children: ReactNode) => (
  <div className="flex flex-col">{children}</div>
)

export const CONCEPTS: ConceptSpec[] = [
  {
    id: "A",
    name: "Hold the line",
    optimisesFor:
      "Scanning speed. At most three facts at rest, everything else behind one quiet pill, and the action gutter reserved so no row shifts when a neighbour is hovered.",
    givesUp:
      "You cannot see everything about a task without asking. Busy rows lose their folder colour.",
    principle:
      "Working memory holds about four chunks, and a regular layout is searched faster than an irregular one.",
    render: () => list(SAMPLE.map((t) => <RowA key={t.title} task={t} />)),
  },
  {
    id: "E",
    name: "Editable chips",
    optimisesFor:
      "The ninety percent edit. Every fact is the control that changes it, so a date or a person is one click and the list never moves.",
    givesUp:
      "A chip that looks like text but behaves like a button is a small lie until you hover. Targets must grow to stay accessible.",
    principle:
      "Fitts's law: the fastest target is the thing itself. Zoho removed inline field editing, users objected, and it came back.",
    render: () => list(SAMPLE.map((t) => <RowE key={t.title} task={t} />)),
  },
  {
    id: "F",
    name: "Two lines on selection",
    optimisesFor:
      "Answering what a task actually is without opening it. The selected row alone grows to two lines; the title never moves.",
    givesUp:
      "Row height stops being constant, and it only half solves the problem: you learn more but still cannot edit.",
    principle:
      "Recognition over recall, with height taking two fixed values rather than any value.",
    render: () =>
      list(
        SAMPLE.map((t, i) => (
          <RowF key={t.title} task={t} selected={i === 3} />
        )),
      ),
  },
  {
    id: "H",
    name: "Actor and state",
    optimisesFor:
      "Making the future cheap. A thin rail and one chip carry machine states, and an agent is a delegate attached to the person, never a replacement for them.",
    givesUp:
      "Four pixels of left gutter now for a payoff that cannot ship yet.",
    principle:
      "Shape carries kind, colour carries state, and no state is colour alone. Linear keeps the human responsible after delegating.",
    render: () => list(AGENT_SAMPLE.map((t) => <RowH key={t.title} task={t} />)),
  },
  {
    id: "D",
    name: "Expand in place",
    optimisesFor:
      "No context switch at all. The row becomes a card, the list recedes behind it, and the tasks around it stay as the frame of reference.",
    givesUp:
      "Width: a form that is comfortable at 540px has to stack inside a list column. Constant row height goes, and it needs a ruling because the spec calls the form a dialog.",
    principle:
      "Common region is what stops it reading as a bloated row. Things 3 fades the list for exactly this reason.",
    render: () => (
      <div className="flex flex-col gap-1">
        {SAMPLE.slice(0, 1).map((t) => (
          <div key={t.title} className="opacity-40">
            <RowA task={t} />
          </div>
        ))}
        <ExpandedCard task={SAMPLE[1]!} />
        {SAMPLE.slice(2).map((t) => (
          <div key={t.title} className="opacity-40">
            <RowA task={t} />
          </div>
        ))}
      </div>
    ),
  },
]
