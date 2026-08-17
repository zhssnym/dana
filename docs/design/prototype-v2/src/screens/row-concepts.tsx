/*
The V3 candidate rows, drawn so they can be compared by using them.

Every concept renders its OWN markup rather than configuring
`components/task-row.tsx`. That is deliberate: the shipping row stays exactly
what it is until Imran picks, so nothing in this file can change a screen by
accident, and a rejected concept is deleted rather than unwound.

Everything here is live. Checkboxes complete, stars toggle, chips open, rows
expand, titles edit, steps tick off. A concept that is only a picture can be
admired; a concept that can be used can be judged, and this page exists to be
judged rather than admired.

Motion runs on the tokens opened alongside this file in `styles/tokens.css`:
--duration-fast for a colour or an opacity, --duration-base for anything that
changes size or position, --ease-enter for arrivals. Nothing here hardcodes a
millisecond, and the whole system flattens to 1ms under
prefers-reduced-motion without any component knowing.

Removed at Imran's direction, 2026-08-17: the "Actor and state" concept, which
drew agent work in the row. Machine states are not the current direction, and
a concept lab carrying a direction nobody is pursuing costs a reviewer real
attention on a question that is not being asked. Custom tags are recorded
instead, as DES-098, because that one needs a backend and so needs the
register rather than a drawing.
*/

import {
  AlignLeft,
  Ban,
  Bell,
  CalendarDays,
  ChevronDown,
  CircleAlert,
  Folder,
  ListChecks,
  MoreHorizontal,
  Pin,
  Repeat2,
  Star,
  UserRound,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useState, type ReactNode } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/* ---------------------------------------------------------------- data -- */

export interface ConceptStep {
  title: string
  done: boolean
}

export interface ConceptTask {
  id: string
  title: string
  done?: boolean
  folder?: { name: string; color: string }
  due?: { label: string; overdue?: boolean }
  assignee?: { initials: string; name: string }
  /* Steps are the items themselves rather than a count, so the count is
     derived and ticking one in an expanded card moves the number in the row
     behind it. A count that cannot be wrong is better than a count. */
  steps?: ConceptStep[]
  recurrence?: boolean
  pulled?: boolean
  important?: boolean
  abandoned?: boolean
  notes?: string
}

function stepCount(task: ConceptTask) {
  if (!task.steps || task.steps.length === 0) return null
  return {
    done: task.steps.filter((s) => s.done).length,
    total: task.steps.length,
  }
}

const VIOLET = "var(--color-folder-violet)"
const FERN = "var(--color-folder-fern)"
const TEAL = "var(--color-folder-teal)"

const FOLDERS = [
  { name: "Wedding", color: VIOLET },
  { name: "Community planning committee", color: FERN },
  { name: "Home", color: TEAL },
  { name: "Inbox", color: "var(--color-graphite-400)" },
]

const PEOPLE = [
  { initials: "IW", name: "Imran Wafa" },
  { initials: "SK", name: "Sara" },
  { initials: "HN", name: "Hassan" },
]

const DUES = [
  { label: "Due today" },
  { label: "Due tomorrow" },
  { label: "Due 21 Aug" },
  { label: "No date" },
]

/* The sample is fixed across every concept, and it is chosen so the hard
   cases never leave the screen: a bare task, a long title, an overdue one,
   one carrying nearly everything at once, a repeating pulled one, and an
   abandoned one. A concept that only survives short titles has not been
   tested. */
export const SAMPLE: ConceptTask[] = [
  { id: "t1", title: "Renew the library card" },
  {
    id: "t2",
    title: "Confirm final guest count and send it to the caterer before Thursday",
    folder: { name: "Wedding", color: VIOLET },
    due: { label: "Due 14 Aug" },
    steps: [
      { title: "Ask the venue for the final seating plan", done: true },
      { title: "Chase the four unanswered RSVPs", done: true },
      { title: "Confirm the numbers with the venue", done: false },
      { title: "Send the final count to the caterer", done: false },
      { title: "Pay the balance", done: false },
    ],
    notes: "The caterer needs the final number by Thursday lunchtime.",
  },
  {
    id: "t3",
    title: "Send the venue deposit",
    folder: { name: "Wedding", color: VIOLET },
    due: { label: "Overdue · 6 Aug", overdue: true },
    important: true,
  },
  {
    id: "t4",
    title: "Review the community grant application",
    folder: { name: "Community planning committee", color: FERN },
    due: { label: "Overdue · 8 Aug", overdue: true },
    steps: [
      { title: "Read the second draft", done: true },
      { title: "Check the budget table", done: true },
      { title: "Write the covering note", done: false },
      { title: "Send it to the committee", done: false },
    ],
    assignee: { initials: "SK", name: "Sara" },
    recurrence: true,
    notes: "Second draft is in the shared folder.",
  },
  {
    id: "t5",
    title: "Water the balcony plants",
    folder: { name: "Home", color: TEAL },
    due: { label: "Due today" },
    recurrence: true,
    pulled: true,
  },
  {
    id: "t6",
    title: "Keep the backup chair reservation",
    folder: { name: "Wedding", color: VIOLET },
    due: { label: "12 Aug" },
    abandoned: true,
  },
]

/* --------------------------------------------------------------- state -- */

/* Each concept gets its own copy of the sample, so completing a task in one
   concept does not quietly change the list somebody is comparing it against.
   The lab's per-concept Reset remounts the block, which is why nothing here
   needs a reset of its own. */
function useTaskList(initial: ConceptTask[]) {
  const [tasks, setTasks] = useState<ConceptTask[]>(() =>
    initial.map((t) => ({ ...t, steps: t.steps?.map((s) => ({ ...s })) })),
  )

  function patch(id: string, fields: Partial<ConceptTask>) {
    setTasks((list) => list.map((t) => (t.id === id ? { ...t, ...fields } : t)))
  }

  function toggleStep(id: string, index: number) {
    setTasks((list) =>
      list.map((t) =>
        t.id === id && t.steps
          ? {
              ...t,
              steps: t.steps.map((s, i) =>
                i === index ? { ...s, done: !s.done } : s,
              ),
            }
          : t,
      ),
    )
  }

  return { tasks, patch, toggleStep }
}

/* --------------------------------------------------------------- motion -- */

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const T_BASE = "duration-[var(--duration-base)] ease-[var(--ease-enter)]"

/* The height animation, done with grid rather than max-height, because
   max-height needs a guessed maximum and either clips a long note or spends
   the tail of the duration animating nothing. 0fr to 1fr measures itself. */
function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows]",
        T_BASE,
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
    >
      <div className="overflow-hidden">
        <div
          className={cn(
            "transition-[opacity,transform]",
            T_BASE,
            open ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- pieces -- */

const META = "text-xs text-[var(--color-graphite-600)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

function Check({
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
      aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className={cn("flex size-10 items-center justify-center rounded-md", FOCUS)}
    >
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded-[4px] border transition-[background-color,border-color,transform] active:scale-90",
          T_FAST,
          done
            ? "border-[var(--color-success-600)] bg-[var(--color-success-600)]"
            : "border-input bg-background hover:border-[var(--color-graphite-500)]",
          task.abandoned && !done && "opacity-60",
        )}
      >
        {/* The tick is drawn rather than switched on: a 20-unit dash offset
            retracting to zero over --duration-base. It is the one flourish on
            the page, and it is on the one action people take most. */}
        <svg viewBox="0 0 20 20" className="size-3.5" aria-hidden="true">
          <path
            d="M4 10.5 L8.2 14.5 L16 5.8"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 20,
              strokeDashoffset: done ? 0 : 20,
              transition:
                "stroke-dashoffset var(--duration-base) var(--ease-enter)",
            }}
          />
        </svg>
      </span>
    </button>
  )
}

/*
The title, and it is the same component in every concept on this page.

Editing a task's name where it sits started as concept J's idea, and the
moment it existed it stopped being an argument for J: renaming in place is
simply better than renaming in a sheet, and a concept that lacked it would
lose for a reason that has nothing to do with what it is actually proposing.
So it is baseline here, along with the drawn tick, the drawn strike, the
reserved action gutter and the tooltip on a truncated title.

This is the method rather than a courtesy. If concepts differ in polish, a
comparison measures polish. Hold everything constant except the one bet each
concept is making, and the comparison measures the bet.

The strike is a line that draws itself left to right rather than a
text-decoration that blinks into being. Same reason as the tick.
*/
function TaskTitle({
  task,
  onRename,
  className,
  truncate = true,
}: {
  task: ConceptTask
  onRename: (title: string) => void
  className?: string
  truncate?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.title)
  const struck = Boolean(task.done) || Boolean(task.abandoned)

  /* w-fit rather than w-full, because the strike-through is drawn as a rule
     across this box and a full-width box strikes a line across empty space to
     the right of a short title. max-w-full keeps truncation working. */
  const metrics = cn(
    "block w-fit max-w-full min-w-0 text-sm leading-5",
    truncate && "truncate",
    className,
  )

  if (editing) {
    return (
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        value={draft}
        /* Select on entry, so a rename is type-over rather than
           position-the-caret-then-select-then-type. Renaming is usually
           replacing, and the keyboard should assume the usual case. */
        onFocus={(e) => e.currentTarget.select()}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onRename(draft.trim() || task.title)
          setEditing(false)
        }}
        onKeyDown={(e) => {
          /* stopPropagation because these rows live inside clickable
             containers and, in the shipping app, under a global key handler.
             Enter must commit a rename, never also open the task. */
          if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault()
            e.stopPropagation()
          }
          if (e.key === "Enter") {
            onRename(draft.trim() || task.title)
            setEditing(false)
          }
          if (e.key === "Escape") {
            setDraft(task.title)
            setEditing(false)
          }
        }}
        className={cn(
          metrics,
          /* The field, unlike the label, takes the whole column: you are
             typing into it, so the room is worth more than the tidiness. */
          "-mx-1 w-full max-w-none rounded-[4px] bg-background px-1 text-[var(--color-graphite-800)] outline-none ring-2 ring-[var(--color-dana-accent-600)]",
        )}
        aria-label="Task title"
      />
    )
  }

  const button = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        setDraft(task.title)
        setEditing(true)
      }}
      className={cn(
        metrics,
        "relative -mx-1 cursor-text rounded-[4px] px-1 text-left transition-colors hover:bg-[var(--color-graphite-200)]",
        T_FAST,
        FOCUS,
        struck
          ? "text-[var(--color-graphite-500)]"
          : "text-[var(--color-graphite-800)]",
      )}
    >
      {task.title}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 left-1 h-px w-[calc(100%-8px)] origin-left bg-current transition-transform",
          T_BASE,
        )}
        style={{ transform: struck ? "scaleX(1)" : "scaleX(0)" }}
      />
    </button>
  )

  /* A truncated title is unreadable, and every concept but J truncates. The
     tooltip is the cheapest possible repair and belongs to all of them. */
  if (!truncate) return button

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="top">{task.title}</TooltipContent>
    </Tooltip>
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
      <span className="truncate">{assignee.name.split(" ")[0]}</span>
    </span>
  )
}

function ExpandButton({
  open,
  onToggle,
}: {
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      aria-expanded={open}
      aria-label={open ? "Collapse this task" : "Expand this task"}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-[var(--color-graphite-600)] transition-[background-color,opacity] hover:bg-[var(--color-graphite-200)]",
        T_FAST,
        FOCUS,
        open ? "opacity-100" : "opacity-40 group-hover/row:opacity-100",
      )}
    >
      <ChevronDown
        className={cn("size-[18px] transition-transform", T_BASE, open && "rotate-180")}
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </button>
  )
}

/* The action gutter. Reserved rather than revealed, so hovering a row never
   moves its neighbour's metadata; only opacity travels. */
function Actions({
  task,
  onStar,
  extra,
}: {
  task: ConceptTask
  onStar: () => void
  extra?: ReactNode
}) {
  return (
    <span className="flex shrink-0 items-center justify-end gap-0.5">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onStar()
        }}
        aria-pressed={Boolean(task.important)}
        aria-label={task.important ? "Remove from Important" : "Mark as Important"}
        className={cn(
          "flex size-7 items-center justify-center rounded-md transition-[opacity,background-color] hover:bg-[var(--color-graphite-200)] active:scale-90",
          T_FAST,
          FOCUS,
          task.important
            ? "opacity-100"
            : "opacity-0 group-hover/row:opacity-70 group-focus-within/row:opacity-100 hover:!opacity-100",
        )}
      >
        <Star
          className={cn(
            "size-[18px] transition-[transform,color]",
            T_FAST,
            task.important
              ? "scale-110 fill-[var(--color-warning-500)] text-[var(--color-warning-500)]"
              : "text-[var(--color-graphite-600)]",
          )}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label="More task actions"
              className={cn(
                "flex size-7 items-center justify-center rounded-md text-[var(--color-graphite-600)] transition-[opacity,background-color] hover:bg-[var(--color-graphite-200)] data-popup-open:opacity-100",
                T_FAST,
                FOCUS,
                "opacity-0 group-hover/row:opacity-70 group-focus-within/row:opacity-100 hover:!opacity-100",
              )}
            >
              <MoreHorizontal className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
            </button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem>Open</DropdownMenuItem>
          <DropdownMenuItem>Duplicate</DropdownMenuItem>
          <DropdownMenuItem>Move to folder…</DropdownMenuItem>
          <DropdownMenuItem>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {extra}
    </span>
  )
}

const ROW =
  "group/row grid h-11 w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center rounded-md transition-colors"
const ROW_HOVER = "hover:bg-[var(--color-graphite-100)]"

/* ----------------------------------------------------------------- card -- */
/*
The expanded card, shared by every concept that expands.

Restructured at Imran's direction, 2026-08-17. It used to be seven property
rows stacked one per line, which is what a form looks like when nobody has
decided what matters. It now has three parts and they are not the same kind of
thing:

- ONE header strip carrying everything that is a single short value: folder,
  assignee, due, reminder, repeat. These are five answers, not five sections,
  and giving each one a line of its own made the card tall enough to bury the
  two things people actually came to read.
- Steps, and then Notes, as their own blocks. These two are different in kind:
  they hold as much content as the task needs rather than one value, and they
  are the reason a person opens a task at all.

Both blocks collapse, and both start open, because the default should be the
answer to "what is this task" rather than a tidier card that makes you ask
again. Collapsing is for the person who has read the notes and wants them out
of the way, which is a second-visit need, not a first-visit one.

REVISED 2026-08-17, third pass, at Imran's direction: no rules anywhere inside
the card. It had a hairline above the property strip, above Steps, above Notes
and above the footer, and four lines across a card this small compartmentalise
it into a database record. Hierarchy is now carried by spacing and type alone —
a 16px gap between sections against a 2px gap inside one, headings smaller and
greyer than the content they own, and each section's content indented to sit
under its heading. The reference is Notion, where a page is a stack of blocks
that never needs a box drawn round it.

This is the harder version to get right, which is why it is worth saying what
"right" means: cover the headings and you should still see where one section
ends. If you cannot, the spacing is wrong, and the fix is more spacing rather
than a line put back.
*/

function PropChip({
  icon: Icon,
  value,
  color,
  muted = false,
  items,
}: {
  icon: LucideIcon
  value: string
  color?: string
  muted?: boolean
  items?: { key: string; label: ReactNode; onSelect: () => void }[]
}) {
  const body = (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-transparent px-2 text-[13px] transition-[background-color,border-color]",
        T_FAST,
        "hover:border-[var(--color-graphite-300)] hover:bg-card data-popup-open:border-[var(--color-graphite-300)] data-popup-open:bg-card",
        muted
          ? "text-[var(--color-graphite-500)]"
          : "text-[var(--color-graphite-800)]",
      )}
    >
      <Icon
        className="size-4 shrink-0"
        style={color ? { color } : undefined}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span className="truncate">{value}</span>
    </span>
  )

  if (!items) return body

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className={cn("rounded-md", FOCUS)}
          >
            {body}
          </button>
        }
      />
      <DropdownMenuContent align="start">
        {items.map((item) => (
          <DropdownMenuItem key={item.key} onClick={item.onSelect}>
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/*
A section of the card. No rule above it, and none below.

Rules were doing the work that spacing should do: five hairlines across a card
this small chop it into compartments and make a task feel like a database
record. Hierarchy here comes from three things instead — the gap above a
section is larger than any gap inside it, the heading is smaller and greyer
than the content it owns, and the content is indented to sit under the
heading's icon so the indent itself says "this belongs to that".

The test for whether it works: cover the headings and you should still see
where one section ends. If you cannot, the spacing is wrong and the fix is
spacing, not a line.
*/
function Disclosure({
  icon: Icon,
  label,
  badge,
  children,
}: {
  icon: LucideIcon
  label: string
  badge?: string
  children: ReactNode
}) {
  /* Open by default. See the block comment above TaskCard: the card's job on
     the first visit is to answer, not to tidy. */
  const [open, setOpen] = useState(true)

  return (
    <div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-expanded={open}
        className={cn(
          "group/sec -ml-1 flex h-7 items-center gap-1.5 rounded-md px-1 text-left transition-colors hover:bg-[var(--color-graphite-50)]",
          T_FAST,
          FOCUS,
        )}
      >
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-[var(--color-graphite-400)] transition-[transform,opacity]",
            T_BASE,
            !open && "-rotate-90",
            /* Quiet until you look at it, which is the Notion behaviour and
               the reason the heading reads as a label rather than a control. */
            open ? "opacity-40 group-hover/sec:opacity-100" : "opacity-100",
          )}
          strokeWidth={2}
          aria-hidden="true"
        />
        <Icon
          className="size-3.5 shrink-0 text-[var(--color-graphite-500)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span className="text-[12px] font-medium text-[var(--color-graphite-500)]">
          {label}
        </span>
        {badge ? (
          <span className="text-[12px] text-[var(--color-graphite-400)] tabular-nums">
            {badge}
          </span>
        ) : null}
      </button>
      <Reveal open={open}>
        {/* Indented to sit under the heading's icon, not its chevron. */}
        <div className="pt-0.5 pl-[18px]">{children}</div>
      </Reveal>
    </div>
  )
}

function TaskCard({
  task,
  patch,
  toggleStep,
  onClose,
}: {
  task: ConceptTask
  patch: (id: string, fields: Partial<ConceptTask>) => void
  toggleStep: (id: string, index: number) => void
  onClose: () => void
}) {
  const counts = stepCount(task)

  return (
    <div className="flex flex-col gap-4 px-3 pt-1 pb-3">
      {/* One header strip, not five rows — and no tint behind it. The strip
          reads as a group because its chips are tight together and the next
          thing is a whole line away, which is what proximity is for. */}
      <div className="-ml-1 flex flex-wrap items-center gap-0.5">
        <PropChip
          icon={Folder}
          value={task.folder?.name ?? "Inbox"}
          color={task.folder?.color}
          muted={!task.folder}
          items={FOLDERS.map((f) => ({
            key: f.name,
            label: (
              <span className="inline-flex items-center gap-2">
                <Folder
                  className="size-4"
                  style={{ color: f.color }}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                {f.name}
              </span>
            ),
            onSelect: () => patch(task.id, { folder: f }),
          }))}
        />
        <PropChip
          icon={UserRound}
          value={task.assignee?.name ?? "Imran Wafa"}
          items={PEOPLE.map((p) => ({
            key: p.name,
            label: p.name,
            onSelect: () => patch(task.id, { assignee: p }),
          }))}
        />
        <PropChip
          icon={task.due?.overdue ? CircleAlert : CalendarDays}
          value={task.due?.label ?? "No date"}
          muted={!task.due}
          color={task.due?.overdue ? "var(--color-danger-700)" : undefined}
          items={DUES.map((d) => ({
            key: d.label,
            label: d.label,
            onSelect: () =>
              patch(task.id, {
                due: d.label === "No date" ? undefined : { label: d.label },
              }),
          }))}
        />
        <PropChip icon={Bell} value="No reminder" muted />
        <PropChip
          icon={Repeat2}
          value={task.recurrence ? "Weekly" : "Does not repeat"}
          muted={!task.recurrence}
          items={[
            {
              key: "off",
              label: "Does not repeat",
              onSelect: () => patch(task.id, { recurrence: false }),
            },
            {
              key: "weekly",
              label: "Weekly",
              onSelect: () => patch(task.id, { recurrence: true }),
            },
          ]}
        />
      </div>

      <Disclosure
        icon={ListChecks}
        label="Steps"
        badge={counts ? `${counts.done}/${counts.total}` : undefined}
      >
        {task.steps && task.steps.length > 0 ? (
          <div className="flex flex-col">
            {task.steps.map((step, i) => (
              <button
                key={step.title}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleStep(task.id, i)
                }}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-1 text-left text-sm transition-colors hover:bg-[var(--color-graphite-50)]",
                  T_FAST,
                  FOCUS,
                )}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[3px] border transition-[background-color,border-color]",
                    T_FAST,
                    step.done
                      ? "border-[var(--color-success-600)] bg-[var(--color-success-600)]"
                      : "border-input bg-background",
                  )}
                >
                  <svg viewBox="0 0 20 20" className="size-3" aria-hidden="true">
                    <path
                      d="M4 10.5 L8.2 14.5 L16 5.8"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        strokeDasharray: 20,
                        strokeDashoffset: step.done ? 0 : 20,
                        transition:
                          "stroke-dashoffset var(--duration-base) var(--ease-enter)",
                      }}
                    />
                  </svg>
                </span>
                <span
                  className={cn(
                    "transition-colors",
                    T_BASE,
                    step.done
                      ? "text-[var(--color-graphite-500)] line-through decoration-[var(--color-graphite-400)]"
                      : "text-[var(--color-graphite-800)]",
                  )}
                >
                  {step.title}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="px-1 py-1 text-sm text-[var(--color-graphite-400)]">
            No steps yet
          </p>
        )}
      </Disclosure>

      <Disclosure icon={AlignLeft} label="Notes">
        <p className="py-1 text-sm leading-6 text-[var(--color-graphite-700)]">
          {task.notes ?? (
            <span className="text-[var(--color-graphite-400)]">
              Nothing written yet
            </span>
          )}
        </p>
      </Disclosure>

      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] text-[var(--color-graphite-500)]">
          Created 4 Aug by Imran Wafa
        </span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className={cn(
              "rounded-md px-3 py-1.5 text-[13px] text-[var(--color-graphite-700)] transition-colors hover:bg-[var(--color-graphite-100)]",
              T_FAST,
              FOCUS,
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className={cn(
              "rounded-md bg-[var(--color-graphite-900)] px-3 py-1.5 text-[13px] font-medium text-white transition-[background-color,transform] hover:bg-[var(--color-graphite-800)] active:scale-95",
              T_FAST,
              FOCUS,
            )}
          >
            Save changes
          </button>
        </span>
      </div>
    </div>
  )
}

/* The shell that lifts an expanded row out of the list. Shared, so that
   "expanded" looks like one idea across the four concepts that now carry it
   rather than four near-misses. */
function ExpandShell({
  open,
  row,
  card,
}: {
  open: boolean
  row: ReactNode
  card: ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-lg border transition-[background-color,box-shadow,margin,border-color]",
        T_BASE,
        open
          ? "my-1 border-[var(--color-graphite-300)] bg-card shadow-[var(--elevation-1)]"
          : "my-0 border-transparent",
      )}
    >
      {row}
      <Reveal open={open}>{card}</Reveal>
    </div>
  )
}

/* ------------------------------------------------------------ concept A -- */
/* Disciplined: at most three facts at rest, the rest behind one pill. */

function ConceptA() {
  const { tasks, patch, toggleStep } = useTaskList(SAMPLE)
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div className="flex flex-col">
      {tasks.map((task) => {
        const isOpen = open === task.id
        const counts = stepCount(task)
        const extras =
          (counts ? 1 : 0) +
          (task.recurrence ? 1 : 0) +
          (task.pulled ? 1 : 0) +
          (task.notes ? 1 : 0)

        return (
          <ExpandShell
            key={task.id}
            open={isOpen}
            card={
              <TaskCard
                task={task}
                patch={patch}
                toggleStep={toggleStep}
                onClose={() => setOpen(null)}
              />
            }
            row={
              <div className={cn(ROW, !isOpen && ROW_HOVER)}>
                <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
                <TaskTitle
                  task={task}
                  onRename={(title) => patch(task.id, { title })}
                />
                <div className={cn("flex items-center justify-end gap-3 pr-2", META)}>
                  {task.abandoned ? <Badge variant="secondary">Abandoned</Badge> : null}
                  {extras > 0 ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span
                            className={cn(
                              "inline-flex h-5 shrink-0 items-center rounded-full bg-[var(--color-graphite-100)] px-2 text-[11px] font-medium text-[var(--color-graphite-600)] transition-colors hover:bg-[var(--color-graphite-200)]",
                              T_FAST,
                            )}
                          >
                            +{extras}
                          </span>
                        }
                      />
                      <TooltipContent side="top">
                        {[
                          counts ? `${counts.done}/${counts.total} steps` : null,
                          task.recurrence ? "Repeats weekly" : null,
                          task.pulled ? "In My Day" : null,
                          task.notes ? "Has notes" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                  {task.assignee ? <PersonBit assignee={task.assignee} /> : null}
                  {task.folder ? <FolderBit folder={task.folder} /> : null}
                  {task.due ? <DueBit due={task.due} /> : null}
                  <span className="w-24">
                    <Actions
                      task={task}
                      onStar={() => patch(task.id, { important: !task.important })}
                      extra={
                        <ExpandButton
                          open={isOpen}
                          onToggle={() => setOpen(isOpen ? null : task.id)}
                        />
                      }
                    />
                  </span>
                </div>
              </div>
            }
          />
        )
      })}
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
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-transparent px-1.5 transition-[background-color,border-color]",
        T_FAST,
        "hover:border-[var(--color-graphite-300)] hover:bg-card data-popup-open:border-[var(--color-graphite-300)] data-popup-open:bg-card",
        tone === "danger" && "font-medium text-[var(--color-danger-700)]",
      )}
    >
      {children}
    </span>
  )
}

function ChipMenu({
  label,
  children,
  items,
}: {
  label: string
  children: ReactNode
  items: { key: string; label: ReactNode; onSelect: () => void }[]
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            aria-label={label}
            className={cn("rounded-md", FOCUS)}
          >
            {children}
          </button>
        }
      />
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <DropdownMenuItem key={item.key} onClick={item.onSelect}>
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ConceptE() {
  const { tasks, patch, toggleStep } = useTaskList(SAMPLE)
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div className="flex flex-col">
      {tasks.map((task) => {
        const isOpen = open === task.id
        const counts = stepCount(task)

        return (
          <ExpandShell
            key={task.id}
            open={isOpen}
            card={
              <TaskCard
                task={task}
                patch={patch}
                toggleStep={toggleStep}
                onClose={() => setOpen(null)}
              />
            }
            row={
              <div className={cn(ROW, !isOpen && ROW_HOVER)}>
                <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
                <TaskTitle
                  task={task}
                  onRename={(title) => patch(task.id, { title })}
                />
                <div className={cn("flex items-center justify-end gap-1 pr-2", META)}>
                  {task.abandoned ? <Badge variant="secondary">Abandoned</Badge> : null}
                  {counts && task.steps ? (
                    <ChipMenu
                      label="Steps"
                      items={task.steps.map((s, i) => ({
                        key: s.title,
                        label: (
                          <span
                            className={cn(
                              "inline-flex items-center gap-2",
                              s.done && "text-[var(--color-graphite-500)] line-through",
                            )}
                          >
                            {s.title}
                          </span>
                        ),
                        onSelect: () => toggleStep(task.id, i),
                      }))}
                    >
                      <Chip>
                        <ListChecks className="size-4" strokeWidth={1.75} aria-hidden="true" />
                        {counts.done}/{counts.total}
                      </Chip>
                    </ChipMenu>
                  ) : null}
                  {task.recurrence ? (
                    <ChipMenu
                      label="Repeat"
                      items={[
                        {
                          key: "off",
                          label: "Does not repeat",
                          onSelect: () => patch(task.id, { recurrence: false }),
                        },
                        { key: "w", label: "Weekly", onSelect: () => {} },
                      ]}
                    >
                      <Chip>
                        <Repeat2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
                      </Chip>
                    </ChipMenu>
                  ) : null}
                  {task.pulled ? (
                    <ChipMenu
                      label="My Day"
                      items={[
                        {
                          key: "remove",
                          label: "Remove from My Day",
                          onSelect: () => patch(task.id, { pulled: false }),
                        },
                      ]}
                    >
                      <Chip>
                        <Pin className="size-4" strokeWidth={1.75} aria-hidden="true" />
                        My Day
                      </Chip>
                    </ChipMenu>
                  ) : null}
                  {task.folder ? (
                    <ChipMenu
                      label="Folder"
                      items={FOLDERS.map((f) => ({
                        key: f.name,
                        label: (
                          <span className="inline-flex items-center gap-2">
                            <Folder
                              className="size-4"
                              style={{ color: f.color }}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                            {f.name}
                          </span>
                        ),
                        onSelect: () => patch(task.id, { folder: f }),
                      }))}
                    >
                      <Chip>
                        <FolderBit folder={task.folder} />
                      </Chip>
                    </ChipMenu>
                  ) : null}
                  {task.assignee ? (
                    <ChipMenu
                      label="Assignee"
                      items={PEOPLE.map((p) => ({
                        key: p.name,
                        label: p.name,
                        onSelect: () => patch(task.id, { assignee: p }),
                      }))}
                    >
                      <Chip>
                        <PersonBit assignee={task.assignee} />
                      </Chip>
                    </ChipMenu>
                  ) : null}
                  {task.due ? (
                    <ChipMenu
                      label="Due date"
                      items={DUES.map((d) => ({
                        key: d.label,
                        label: d.label,
                        onSelect: () =>
                          patch(task.id, {
                            due: d.label === "No date" ? undefined : { label: d.label },
                          }),
                      }))}
                    >
                      <Chip tone={task.due.overdue ? "danger" : "neutral"}>
                        {task.due.overdue ? (
                          <CircleAlert className="size-4" strokeWidth={1.75} aria-hidden="true" />
                        ) : (
                          <CalendarDays className="size-4" strokeWidth={1.75} aria-hidden="true" />
                        )}
                        {task.due.label}
                      </Chip>
                    </ChipMenu>
                  ) : null}
                  <span className="w-24">
                    <Actions
                      task={task}
                      onStar={() => patch(task.id, { important: !task.important })}
                      extra={
                        <ExpandButton
                          open={isOpen}
                          onToggle={() => setOpen(isOpen ? null : task.id)}
                        />
                      }
                    />
                  </span>
                </div>
              </div>
            }
          />
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------ concept F -- */
/* Two-line on selection: the row breathes where you are looking. */

function ConceptF() {
  const { tasks, patch } = useTaskList(SAMPLE)
  const [selected, setSelected] = useState<string | null>("t4")

  return (
    <div className="flex flex-col">
      {tasks.map((task) => {
        const isSelected = selected === task.id
        const counts = stepCount(task)

        return (
          <div
            key={task.id}
            onClick={() => setSelected(task.id)}
            className={cn(
              "group/row grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-start rounded-md transition-[background-color,padding]",
              T_BASE,
              isSelected
                ? "bg-[var(--color-graphite-100)] py-1.5"
                : cn("py-0", ROW_HOVER),
            )}
          >
            <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
            <div className="flex min-w-0 flex-col pt-2.5">
              <TaskTitle task={task} onRename={(title) => patch(task.id, { title })} />
              {/* The second line is revealed with the same grid trick as an
                  expanding card, so the title above it never jumps. */}
              <Reveal open={isSelected}>
                <div className="flex items-center gap-3 pt-1 pb-1 text-xs text-[var(--color-graphite-600)]">
                  {counts ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1 w-16 overflow-hidden rounded-full bg-[var(--color-graphite-200)]">
                        <span
                          className={cn(
                            "block h-full rounded-full bg-[var(--color-graphite-600)] transition-[width]",
                            T_BASE,
                          )}
                          style={{ width: `${(counts.done / counts.total) * 100}%` }}
                        />
                      </span>
                      {counts.done}/{counts.total}
                    </span>
                  ) : null}
                  {task.notes ? (
                    <span className="truncate text-[var(--color-graphite-500)]">
                      {task.notes}
                    </span>
                  ) : null}
                  {!counts && !task.notes ? (
                    <span className="text-[var(--color-graphite-400)]">
                      No steps, no notes
                    </span>
                  ) : null}
                </div>
              </Reveal>
            </div>
            <div className={cn("flex items-center justify-end gap-3 pt-2.5 pr-2", META)}>
              {task.assignee ? <PersonBit assignee={task.assignee} /> : null}
              {task.folder ? <FolderBit folder={task.folder} /> : null}
              {task.due ? <DueBit due={task.due} /> : null}
              <span className="w-16">
                <Actions
                  task={task}
                  onStar={() => patch(task.id, { important: !task.important })}
                />
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------ concept I -- */
/*
Imran's idea, 2026-08-17: the chips become single icons, hover tells you what
they mean, a chevron expands the row into a card, and the icons are the same
everywhere in the app including inside that card.

The important half is the last clause. The vocabulary is not a row decision,
it is a design-system one, and it is already half-true by accident: the
shipping row and `task-form.tsx` independently reached for the same Folder,
ListChecks and Repeat2, then diverged where nobody was looking. The form calls
a due date CalendarDays and notes AlignLeft; the row draws a due date as bare
text and has no notes glyph at all. So this concept is not inventing a
vocabulary, it is finishing one, and it deliberately adopts the form's
existing choices rather than nicer new ones.

Two deliberate exceptions, because a rule with no exception is usually a rule
that has not met the content yet:

- The due date keeps its words. It is the one fact people scan a list *for*,
  and an icon that must be hovered to answer "when" would trade the row's
  whole job for tidiness.
- The assignee stays a round avatar. Faces are recognised, not decoded.

REVISED 2026-08-17, second pass. The glyphs used to sit in reserved slots, one
per detail type, filled or not, so that they lined up in columns down the
list. The theory was that a column which always means the same thing can be
scanned vertically. In practice Imran read the result as disorganised, and he
is right about what he saw: a task with two details rendered as two icons
adrift in a field of gaps, and the eye reads the gaps as much as the marks.
The column only pays off once you already know the alphabet, and it charges
every reader before then.

So the glyphs now pack tight against the right, next to the folder and the
person, and the row is tidy at the cost of the vertical scan. That is the
honest trade, and it is worth saying plainly that it makes this concept a
quieter idea than it was: what remains is the shared vocabulary and the icon
density, which was always the part that generalises beyond the row.
*/

interface VocabEntry {
  key: string
  icon: LucideIcon
  name: string
  /* The sentence the tooltip says, or null when this task has nothing to say
     in this slot. The sentence is the accessible name too; a glyph whose
     meaning lives only in a hover is a glyph a screen reader never gets. */
  describe: (task: ConceptTask) => string | null
}

const VOCAB: VocabEntry[] = [
  {
    key: "notes",
    icon: AlignLeft,
    name: "Notes",
    describe: (t) => (t.notes ? `Notes: ${t.notes}` : null),
  },
  {
    key: "steps",
    icon: ListChecks,
    name: "Steps",
    describe: (t) => {
      const c = stepCount(t)
      return c ? `${c.done} of ${c.total} steps done` : null
    },
  },
  {
    key: "repeat",
    icon: Repeat2,
    name: "Repeats",
    describe: (t) => (t.recurrence ? "Repeats weekly" : null),
  },
  {
    key: "pulled",
    icon: Pin,
    name: "In My Day",
    describe: (t) => (t.pulled ? "Pulled into My Day" : null),
  },
  {
    key: "abandoned",
    icon: Ban,
    name: "Abandoned",
    describe: (t) => (t.abandoned ? "Abandoned" : null),
  },
]

const VOCAB_ASIDE: { icon: LucideIcon; name: string; note: string }[] = [
  { icon: Folder, name: "Folder", note: "carries the folder's colour" },
  { icon: UserRound, name: "Assignee", note: "drawn as the person's avatar" },
  { icon: CalendarDays, name: "Due", note: "keeps its words in the row" },
  { icon: Bell, name: "Reminder", note: "card only; never fits the row" },
]

function Glyph({ entry, task }: { entry: VocabEntry; task: ConceptTask }) {
  const text = entry.describe(task)
  if (!text) return null
  const Icon = entry.icon

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded text-[var(--color-graphite-500)] transition-[background-color,color,transform] hover:scale-110 hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-800)]",
              T_FAST,
            )}
            aria-label={text}
          >
            <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </span>
        }
      />
      <TooltipContent side="top">{text}</TooltipContent>
    </Tooltip>
  )
}

function VocabLegend() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-dashed border-[var(--color-graphite-300)] px-3 py-2">
      <span className="text-[11px] font-semibold tracking-[0.09em] text-[var(--color-graphite-500)] uppercase">
        The vocabulary
      </span>
      {VOCAB.map((entry) => {
        const Icon = entry.icon
        return (
          <span
            key={entry.key}
            className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-graphite-600)]"
          >
            <Icon
              className="size-4 text-[var(--color-graphite-500)]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            {entry.name}
          </span>
        )
      })}
      {VOCAB_ASIDE.map((entry) => {
        const Icon = entry.icon
        return (
          <span
            key={entry.name}
            className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-graphite-500)]"
          >
            <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {entry.name}
            <span className="text-[var(--color-graphite-400)]">({entry.note})</span>
          </span>
        )
      })}
    </div>
  )
}

function ConceptI() {
  const { tasks, patch, toggleStep } = useTaskList(SAMPLE)
  const [open, setOpen] = useState<string | null>(null)

  return (
    <>
      <VocabLegend />
      <div className="flex flex-col">
        {tasks.map((task) => {
          const isOpen = open === task.id

          return (
            <ExpandShell
              key={task.id}
              open={isOpen}
              card={
                <TaskCard
                  task={task}
                  patch={patch}
                  toggleStep={toggleStep}
                  onClose={() => setOpen(null)}
                />
              }
              row={
                <div className={cn(ROW, !isOpen && ROW_HOVER)}>
                  <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
                  <TaskTitle task={task} onRename={(title) => patch(task.id, { title })} />
                  <div className={cn("flex items-center justify-end gap-3 pr-2", META)}>
                    {/* Packed right, no reserved slots. See the revision note
                        in this concept's block comment. */}
                    <span className="flex items-center gap-1">
                      {VOCAB.map((entry) => (
                        <Glyph key={entry.key} entry={entry} task={task} />
                      ))}
                      {task.folder ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span
                                className={cn(
                                  "flex size-5 shrink-0 items-center justify-center rounded transition-[background-color,transform] hover:scale-110 hover:bg-[var(--color-graphite-200)]",
                                  T_FAST,
                                )}
                                aria-label={`Folder: ${task.folder.name}`}
                              >
                                <Folder
                                  className="size-4"
                                  style={{ color: task.folder.color }}
                                  strokeWidth={1.75}
                                  aria-hidden="true"
                                />
                              </span>
                            }
                          />
                          <TooltipContent side="top">{task.folder.name}</TooltipContent>
                        </Tooltip>
                      ) : null}
                      {task.assignee ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span
                                className="flex shrink-0 items-center"
                                aria-label={`Assigned to ${task.assignee.name}`}
                              >
                                <Avatar size="sm" className="size-5">
                                  <AvatarFallback className="text-[0.625rem] font-medium">
                                    {task.assignee.initials}
                                  </AvatarFallback>
                                </Avatar>
                              </span>
                            }
                          />
                          <TooltipContent side="top">{task.assignee.name}</TooltipContent>
                        </Tooltip>
                      ) : null}
                    </span>
                    {/* The exception: the date keeps its words. */}
                    <span className="min-w-[5.5rem] shrink-0 text-right">
                      {task.due ? <DueBit due={task.due} /> : null}
                    </span>
                    <span className="w-24">
                      <Actions
                        task={task}
                        onStar={() => patch(task.id, { important: !task.important })}
                        extra={
                          <ExpandButton
                            open={isOpen}
                            onToggle={() => setOpen(isOpen ? null : task.id)}
                          />
                        }
                      />
                    </span>
                  </div>
                </div>
              }
            />
          )
        })}
      </div>
    </>
  )
}

/* ------------------------------------------------------------ concept J -- */
/*
Imran's second idea, 2026-08-17: the details move *under* the task text rather
than competing with it along one line, and the text itself is edited where it
sits.

This is not concept F with the selection removed. F grows one row on demand
and keeps the details on the right; J changes what a row *is*. The title gets
the full width of the row permanently, which is the point: the sample's long
title is truncated in every other concept here, and truncation is the row's
oldest unpaid debt. Give the title its own line and the debt clears.

The details then sit on a second line that is quieter in every channel at
once, smaller, greyer, lower. Proximity groups them to the title above rather
than to the row below, so the pair reads as one object with a caption. And
because a second line has room that a shared line never had, the details go
back to *words*. Concept I removes the words because it has no room; J has
room, so it spends it.

Editing the title in place was J's second half when it was first drawn, and it
is no longer J's at all: it turned out to be simply better than renaming in a
sheet, so it was promoted to baseline and every concept on this page now has
it. What survives here as J's own is the consequence nobody else can copy
without becoming J. Because the title has a full line, editing it has the full
line too, and a long name is readable while you are changing it.

The cost is stated plainly rather than buried. Row height goes from 44px to
64px, so a viewport that held sixteen tasks holds eleven, and for the person
with a long list that is the whole trade. And there is a gesture collision
this concept has to answer and cannot answer by itself: if clicking the title
edits it, then clicking the title no longer opens the task. J assumes
title-edits / elsewhere-opens, which is Notion's rule and Linear's, but it is
a ruling.
*/

function DetailWord({
  icon: Icon,
  children,
  color,
  tone = "neutral",
}: {
  icon: LucideIcon
  children: ReactNode
  color?: string
  tone?: "neutral" | "danger"
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 shrink-0 items-center gap-1.5",
        tone === "danger" && "font-medium text-[var(--color-danger-700)]",
      )}
    >
      <Icon
        className="size-3.5 shrink-0"
        style={color ? { color } : undefined}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      {children}
    </span>
  )
}

function ConceptJ() {
  const { tasks, patch, toggleStep } = useTaskList(SAMPLE)
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div className="flex flex-col">
      {tasks.map((task) => {
        const isOpen = open === task.id
        const counts = stepCount(task)
        const bare =
          !task.due &&
          !task.folder &&
          !task.assignee &&
          !counts &&
          !task.recurrence &&
          !task.pulled &&
          !task.notes &&
          !task.abandoned

        return (
          <ExpandShell
            key={task.id}
            open={isOpen}
            card={
              <TaskCard
                task={task}
                patch={patch}
                toggleStep={toggleStep}
                onClose={() => setOpen(null)}
              />
            }
            row={
              <div
                className={cn(
                  "group/row grid h-16 w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center rounded-md transition-colors",
                  !isOpen && ROW_HOVER,
                )}
              >
                <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
                <div className="flex min-w-0 flex-col gap-1">
                  <TaskTitle
                    task={task}
                    onRename={(title) => patch(task.id, { title })}
                    truncate={false}
                  />
                  <div className="flex min-w-0 items-center gap-3 overflow-hidden text-[12px] leading-4 text-[var(--color-graphite-500)]">
                    {task.due ? (
                      <DetailWord
                        icon={task.due.overdue ? CircleAlert : CalendarDays}
                        tone={task.due.overdue ? "danger" : "neutral"}
                      >
                        {task.due.label}
                      </DetailWord>
                    ) : null}
                    {task.folder ? (
                      <DetailWord icon={Folder} color={task.folder.color}>
                        <span className="truncate">{task.folder.name}</span>
                      </DetailWord>
                    ) : null}
                    {task.assignee ? (
                      <DetailWord icon={UserRound}>{task.assignee.name}</DetailWord>
                    ) : null}
                    {counts ? (
                      <DetailWord icon={ListChecks}>
                        {counts.done}/{counts.total}
                      </DetailWord>
                    ) : null}
                    {task.recurrence ? <DetailWord icon={Repeat2}>Weekly</DetailWord> : null}
                    {task.pulled ? <DetailWord icon={Pin}>My Day</DetailWord> : null}
                    {task.notes ? (
                      <DetailWord icon={AlignLeft}>
                        <span className="truncate text-[var(--color-graphite-400)]">
                          {task.notes}
                        </span>
                      </DetailWord>
                    ) : null}
                    {task.abandoned ? <DetailWord icon={Ban}>Abandoned</DetailWord> : null}
                    {bare ? (
                      /* A bare task keeps the line rather than collapsing to
                         one, so the list's rhythm survives. Whether that empty
                         line is calm or wasteful is what this concept is here
                         to be judged on. */
                      <span className="text-[var(--color-graphite-400)]">No details</span>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center justify-end pr-2">
                  <Actions
                    task={task}
                    onStar={() => patch(task.id, { important: !task.important })}
                    extra={
                      <ExpandButton
                        open={isOpen}
                        onToggle={() => setOpen(isOpen ? null : task.id)}
                      />
                    }
                  />
                </div>
              </div>
            }
          />
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------ concept D -- */
/* Expand in place, the list receding so the card reads as a new object. */

function ConceptD() {
  const { tasks, patch, toggleStep } = useTaskList(SAMPLE)
  const [open, setOpen] = useState<string | null>("t2")

  return (
    <div className="flex flex-col gap-0.5">
      {tasks.map((task) => {
        const isOpen = open === task.id
        const recedes = open !== null && !isOpen

        if (isOpen) {
          return (
            <div
              key={task.id}
              className={cn(
                "my-1 rounded-lg border border-[var(--color-graphite-300)] bg-card shadow-[var(--elevation-1)] transition-[box-shadow]",
                T_BASE,
              )}
            >
              <div className="group/row grid grid-cols-[40px_minmax(0,1fr)_auto] items-start py-2">
                <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
                <span className="pt-1.5">
                  <TaskTitle
                    task={task}
                    onRename={(title) => patch(task.id, { title })}
                    truncate={false}
                    className="text-[15px] leading-6 font-semibold"
                  />
                </span>
                <span className="flex items-center gap-1 pt-1.5 pr-3">
                  <Actions
                    task={task}
                    onStar={() => patch(task.id, { important: !task.important })}
                  />
                </span>
              </div>
              <TaskCard
                task={task}
                patch={patch}
                toggleStep={toggleStep}
                onClose={() => setOpen(null)}
              />
            </div>
          )
        }

        return (
          /* A div rather than a button: the row is clickable, but it contains
             its own controls, and a button inside a button is invalid markup
             that browsers repair by dropping one of them. The row keeps its
             keyboard route through the title and the checkbox it holds. */
          <div
            key={task.id}
            onClick={() => setOpen(task.id)}
            className={cn(
              "group/row grid h-11 w-full cursor-pointer grid-cols-[40px_minmax(0,1fr)_auto] items-center rounded-md text-left transition-[opacity,background-color]",
              T_BASE,
              recedes ? "opacity-40 hover:opacity-70" : ROW_HOVER,
            )}
          >
            <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
            <TaskTitle task={task} onRename={(title) => patch(task.id, { title })} />
            <div className={cn("flex items-center justify-end gap-3 pr-2", META)}>
              {task.folder ? <FolderBit folder={task.folder} /> : null}
              {task.due ? <DueBit due={task.due} /> : null}
              <span className="w-16">
                <Actions
                  task={task}
                  onStar={() => patch(task.id, { important: !task.important })}
                />
              </span>
            </div>
          </div>
        )
      })}
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
  /* What a reviewer should actually do with their mouse. Friends judging this
     page will not find an interaction they are not told about. */
  tryIt: string
  render: () => ReactNode
}

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
    tryIt:
      "Hover a +N pill to see what it is hiding, then open the same row with the chevron and see the whole thing.",
    render: () => <ConceptA />,
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
    tryIt:
      "Click any chip — the date, the folder, the person, the step count — and change it from the menu. Then expand the row and change the same things from the card.",
    render: () => <ConceptE />,
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
    tryIt: "Click any row to select it and watch the second line grow in.",
    render: () => <ConceptF />,
  },
  {
    id: "I",
    name: "One vocabulary",
    optimisesFor:
      "Density, and one alphabet. Each detail is a single glyph packed at the right of the row, and the same icons lead every line of the card it opens — so the marks you learn in one place keep meaning the same thing in the other.",
    givesUp:
      "Hover does not exist on touch, and this is a PWA. Icon-only detail is learned rather than read, so the first week is worse than the current row even if the second month is better.",
    principle:
      "The row and the task form already agree on Folder, ListChecks and Repeat2 by accident, and diverge on due date and notes. This finishes an existing vocabulary rather than inventing one. Due keeps its words because a date is what people scan for.",
    tryIt:
      "Hover any glyph for its words, then open the row and see the same icons leading the card. Compare the right-hand edge here against the same rows in A.",
    render: () => <ConceptI />,
  },
  {
    id: "J",
    name: "Title first, details beneath",
    optimisesFor:
      "The title. It gets a full line of its own, so it stops being truncated at rest and stays readable while you are renaming it — the only concept here where editing a long name shows you the long name.",
    givesUp:
      "Height: 64px against 44px, so a viewport that held sixteen tasks holds eleven. And it needs a ruling, because if clicking the title edits it then clicking the title no longer opens the task.",
    principle:
      "Proximity groups the second line to the title above it, so the pair reads as one object with a caption rather than as two rows. Words return on that line because there is finally room for them, which is exactly the bet concept I refuses.",
    tryIt:
      "Compare the long second task here against the same task in any other concept. Then click it and rename it, and compare that too.",
    render: () => <ConceptJ />,
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
    tryIt:
      "Click any dimmed row to move the card to it. Cancel or Save closes it and the list comes back.",
    render: () => <ConceptD />,
  },
]
