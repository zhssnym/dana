/*
The V3 candidate rows, drawn so they can be compared by using them.

Every concept renders its OWN markup rather than configuring
`components/task-row.tsx`. That is deliberate: the shipping row stays exactly
what it is until Imran picks, so nothing in this file can change a screen by
accident, and a rejected concept is deleted rather than unwound.

Everything here is live. Checkboxes complete, stars toggle, chips open, rows
expand, titles edit, agents finish their work. A concept that is only a
picture can be admired; a concept that can be used can be judged, and this
page exists to be judged rather than admired.

Motion runs on the tokens opened alongside this file in `styles/tokens.css`:
--duration-fast for a colour or an opacity, --duration-base for anything that
changes size or position, --ease-enter for arrivals. Nothing here hardcodes a
millisecond, and the whole system flattens to 1ms under
prefers-reduced-motion without any component knowing.
*/

import {
  AlignLeft,
  Ban,
  Bell,
  CalendarDays,
  Check as CheckIcon,
  ChevronDown,
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

export interface ConceptTask {
  id: string
  title: string
  done?: boolean
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
    state: "waiting" | "working" | "blocked" | "review" | "approved"
    detail: string
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
    steps: { done: 2, total: 5 },
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
    steps: { done: 2, total: 4 },
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

/* Agent work, for direction H only. Section 9 knows nothing about any of
   this; it is drawn to test whether the row has room for the vision, not to
   propose shipping it. */
export const AGENT_SAMPLE: ConceptTask[] = [
  {
    id: "a1",
    title: "Draft the sponsor thank-you letters",
    folder: { name: "Community planning committee", color: FERN },
    due: { label: "Due today" },
    assignee: { initials: "IW", name: "Imran" },
    agent: { state: "working", detail: "Working · started 4m ago" },
  },
  {
    id: "a2",
    title: "Collect the venue accessibility details",
    folder: { name: "Wedding", color: VIOLET },
    assignee: { initials: "IW", name: "Imran" },
    agent: { state: "blocked", detail: "Blocked · needs the venue address" },
  },
  {
    id: "a3",
    title: "Summarise the grant criteria",
    folder: { name: "Community planning committee", color: FERN },
    due: { label: "Due 18 Aug" },
    assignee: { initials: "SK", name: "Sara" },
    agent: { state: "review", detail: "Ready for review" },
  },
  {
    id: "a4",
    title: "Compare three catering quotes",
    folder: { name: "Wedding", color: VIOLET },
    assignee: { initials: "IW", name: "Imran" },
    agent: { state: "waiting", detail: "Waiting" },
  },
]

/* --------------------------------------------------------------- state -- */

/* Each concept gets its own copy of the sample, so completing a task in one
   concept does not quietly change the list somebody is comparing it against.
   The lab's per-concept Reset remounts the block, which is why nothing here
   needs a reset of its own. */
function useTaskList(initial: ConceptTask[]) {
  const [tasks, setTasks] = useState<ConceptTask[]>(() =>
    initial.map((t) => ({ ...t })),
  )

  function patch(id: string, fields: Partial<ConceptTask>) {
    setTasks((list) =>
      list.map((t) => (t.id === id ? { ...t, ...fields } : t)),
    )
  }

  return { tasks, patch }
}

/* --------------------------------------------------------------- motion -- */

const T_FAST =
  "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
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
      onClick={onToggle}
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

What is left to J alone is the part that is genuinely J's: the title owning a
full-width line of its own, so that it never truncates in the first place.

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

  /* Same font, same leading, same box in both states. The only visible
     difference on entering edit is the ring, which is the affordance. A field
     that jumps when it focuses teaches people to distrust the click. */
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
        onClick={onStar}
        aria-pressed={Boolean(task.important)}
        aria-label={
          task.important ? "Remove from Important" : "Mark as Important"
        }
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
              aria-label="More task actions"
              className={cn(
                "flex size-7 items-center justify-center rounded-md text-[var(--color-graphite-600)] transition-[opacity,background-color] hover:bg-[var(--color-graphite-200)] data-popup-open:opacity-100",
                T_FAST,
                FOCUS,
                "opacity-0 group-hover/row:opacity-70 group-focus-within/row:opacity-100 hover:!opacity-100",
              )}
            >
              <MoreHorizontal
                className="size-[18px]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
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

/* ------------------------------------------------------------ concept A -- */
/* Disciplined: at most three facts at rest, the rest behind one pill. */

function ConceptA() {
  const { tasks, patch } = useTaskList(SAMPLE)

  return (
    <div className="flex flex-col">
      {tasks.map((task) => {
        const extras =
          (task.steps ? 1 : 0) +
          (task.recurrence ? 1 : 0) +
          (task.pulled ? 1 : 0) +
          (task.notes ? 1 : 0)

        return (
          <div key={task.id} className={cn(ROW, ROW_HOVER)}>
            <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
            <TaskTitle
              task={task}
              onRename={(title) => patch(task.id, { title })}
            />
            <div className={cn("flex items-center justify-end gap-3 pr-2", META)}>
              {task.abandoned ? (
                <Badge variant="secondary">Abandoned</Badge>
              ) : null}
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
                      task.steps
                        ? `${task.steps.done}/${task.steps.total} steps`
                        : null,
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

/* ------------------------------------------------------------ concept E -- */
/* Editable chips: every fact is the control that changes it. */

function Chip({
  children,
  tone = "neutral",
  interactive = true,
}: {
  children: ReactNode
  tone?: "neutral" | "danger"
  interactive?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-transparent px-1.5 transition-[background-color,border-color]",
        T_FAST,
        interactive &&
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
          <button type="button" aria-label={label} className={cn("rounded-md", FOCUS)}>
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
  const { tasks, patch } = useTaskList(SAMPLE)

  return (
    <div className="flex flex-col">
      {tasks.map((task) => (
        <div key={task.id} className={cn(ROW, ROW_HOVER)}>
          <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
          <TaskTitle
              task={task}
              onRename={(title) => patch(task.id, { title })}
            />
          <div className={cn("flex items-center justify-end gap-1 pr-2", META)}>
            {task.abandoned ? <Badge variant="secondary">Abandoned</Badge> : null}
            {task.steps ? (
              <ChipMenu
                label="Steps"
                items={[0, 1, 2, 3, 4, 5]
                  .filter((n) => n <= task.steps!.total)
                  .map((n) => ({
                    key: String(n),
                    label: `${n} of ${task.steps!.total} done`,
                    onSelect: () =>
                      patch(task.id, {
                        steps: { done: n, total: task.steps!.total },
                      }),
                  }))}
              >
                <Chip>
                  <ListChecks className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  {task.steps.done}/{task.steps.total}
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
            <span className="w-16">
              <Actions
                task={task}
                onStar={() => patch(task.id, { important: !task.important })}
              />
            </span>
          </div>
        </div>
      ))}
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
              <TaskTitle
              task={task}
              onRename={(title) => patch(task.id, { title })}
            />
              {/* The second line is revealed with the same grid trick as an
                  expanding card, so the title above it never jumps. */}
              <Reveal open={isSelected}>
                <div className="flex items-center gap-3 pt-1 pb-1 text-xs text-[var(--color-graphite-600)]">
                  {task.steps ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1 w-16 overflow-hidden rounded-full bg-[var(--color-graphite-200)]">
                        <span
                          className={cn(
                            "block h-full rounded-full bg-[var(--color-graphite-600)] transition-[width]",
                            T_BASE,
                          )}
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
                  {!task.steps && !task.notes ? (
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

/* ------------------------------------------------------------ concept H -- */
/* Actor and state: the row's left edge and one chip carry the future. */

const AGENT_STATE: Record<
  NonNullable<ConceptTask["agent"]>["state"],
  { rail: string; tint: string; ink: string; icon: LucideIcon }
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
  approved: {
    rail: "var(--color-success-700)",
    tint: "var(--color-success-100)",
    ink: "var(--color-success-700)",
    icon: CheckIcon,
  },
}

function ConceptH() {
  const { tasks, patch } = useTaskList(AGENT_SAMPLE)

  return (
    <div className="flex flex-col">
      {tasks.map((task) => {
        const state = task.agent ? AGENT_STATE[task.agent.state] : null
        const StateIcon = state?.icon
        const isReview = task.agent?.state === "review"

        return (
          <div
            key={task.id}
            className={cn(
              "group/row grid h-11 w-full grid-cols-[4px_40px_minmax(0,1fr)_auto] items-center rounded-md transition-colors",
              ROW_HOVER,
            )}
          >
            <span
              className={cn("h-6 w-1 rounded-full transition-colors", T_BASE)}
              style={{ background: state ? state.rail : "transparent" }}
              aria-hidden="true"
            />
            {task.agent ? (
              /* Square, because shape carries kind: a person is round, an
                 agent is not. Colour is left to state alone. */
              <span className="flex size-10 items-center justify-center">
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-[5px] border text-[10px] font-semibold transition-colors",
                    T_BASE,
                  )}
                  style={{ borderColor: state?.rail, color: state?.ink }}
                >
                  AI
                </span>
              </span>
            ) : (
              <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
            )}
            <TaskTitle
              task={task}
              onRename={(title) => patch(task.id, { title })}
            />
            <div className={cn("flex items-center justify-end gap-3 pr-2", META)}>
              {task.agent && state && StateIcon ? (
                <button
                  type="button"
                  disabled={!isReview}
                  onClick={() =>
                    patch(task.id, {
                      agent: { state: "approved", detail: "Approved by you" },
                    })
                  }
                  className={cn(
                    "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium transition-[background-color,color,transform]",
                    T_FAST,
                    FOCUS,
                    isReview && "hover:scale-[1.04] active:scale-95",
                  )}
                  style={{ background: state.tint, color: state.ink }}
                >
                  <StateIcon
                    className={cn(
                      "size-3.5",
                      /* The only looping animation on the page, and it is
                         load-bearing: "working" is the one state that means
                         something is happening right now. */
                      task.agent.state === "working" && "motion-safe:animate-spin",
                    )}
                    style={
                      task.agent.state === "working"
                        ? { animationDuration: "2.4s" }
                        : undefined
                    }
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  {task.agent.detail}
                </button>
              ) : null}
              {task.assignee ? (
                <span className="inline-flex shrink-0 items-center gap-1.5">
                  <PersonBit assignee={task.assignee} />
                  {task.agent ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span
                            className={cn(
                              "rounded-[3px] border px-1 text-[9px] font-semibold transition-colors",
                              T_BASE,
                            )}
                            style={{ borderColor: state?.rail, color: state?.ink }}
                          >
                            AI
                          </span>
                        }
                      />
                      <TooltipContent side="top">
                        Delegated to an agent. {task.assignee.name} stays
                        responsible for it.
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </span>
              ) : null}
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
- The assignee stays a round avatar. Faces are recognised, not decoded, and
  concept H's rule holds: shape carries kind.

Every glyph sits in a reserved slot whether or not it has anything to say, so
the icons line up in columns down the list. That is the actual prize, and it
is why this is not merely concept A with the words removed: once a column
means one thing, "which of these repeat?" stops being reading and becomes
looking.
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
    describe: (t) =>
      t.steps ? `${t.steps.done} of ${t.steps.total} steps done` : null,
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
  const Icon = entry.icon

  /* The slot is rendered whether or not it is filled. This is the concept. */
  return (
    <span className="flex w-5 shrink-0 items-center justify-center">
      {text ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded text-[var(--color-graphite-500)] transition-[background-color,color,transform] hover:scale-110 hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-800)]",
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
      ) : null}
    </span>
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
            <span className="text-[var(--color-graphite-400)]">
              ({entry.note})
            </span>
          </span>
        )
      })}
    </div>
  )
}

/* Every property line is led by the same glyph the row used, which is the
   whole claim: you learn the alphabet once, in the place where it is
   captioned, and then it is readable in the place where it is not. */
function VocabProperty({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
}) {
  return (
    <div className="grid h-9 grid-cols-[24px_100px_minmax(0,1fr)] items-center text-[13px]">
      <Icon
        className="size-4 text-[var(--color-graphite-500)]"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span className="text-[var(--color-graphite-600)]">{label}</span>
      <span className="truncate text-sm text-[var(--color-graphite-800)]">
        {value}
      </span>
    </div>
  )
}

function ConceptI() {
  const { tasks, patch } = useTaskList(SAMPLE)
  const [open, setOpen] = useState<string | null>(null)

  return (
    <>
      <VocabLegend />
      <div className="flex flex-col">
        {tasks.map((task) => {
          const isOpen = open === task.id

          return (
            <div
              key={task.id}
              className={cn(
                "rounded-lg transition-[background-color,box-shadow,margin]",
                T_BASE,
                isOpen
                  ? "my-1 border border-[var(--color-graphite-300)] bg-card shadow-[var(--elevation-1)]"
                  : "my-0 border border-transparent",
              )}
            >
              <div
                className={cn(
                  "group/row grid h-11 w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center rounded-md transition-colors",
                  !isOpen && ROW_HOVER,
                )}
              >
                <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
                <TaskTitle
              task={task}
              onRename={(title) => patch(task.id, { title })}
            />
                <div className={cn("flex items-center justify-end gap-3 pr-2", META)}>
                  <span className="flex items-center gap-1">
                    {VOCAB.map((entry) => (
                      <Glyph key={entry.key} entry={entry} task={task} />
                    ))}
                  </span>
                  <span className="flex w-5 shrink-0 justify-center">
                    {task.folder ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span
                              className={cn(
                                "flex size-5 items-center justify-center rounded transition-[background-color,transform] hover:scale-110 hover:bg-[var(--color-graphite-200)]",
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
                        <TooltipContent side="top">
                          {task.folder.name}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </span>
                  <span className="flex w-5 shrink-0 justify-center">
                    {task.assignee ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span aria-label={`Assigned to ${task.assignee.name}`}>
                              <Avatar size="sm" className="size-5">
                                <AvatarFallback className="text-[0.625rem] font-medium">
                                  {task.assignee.initials}
                                </AvatarFallback>
                              </Avatar>
                            </span>
                          }
                        />
                        <TooltipContent side="top">
                          {task.assignee.name}
                        </TooltipContent>
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
                        <button
                          type="button"
                          onClick={() => setOpen(isOpen ? null : task.id)}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? "Collapse this task" : "Expand this task"}
                          className={cn(
                            "flex size-7 items-center justify-center rounded-md text-[var(--color-graphite-600)] transition-[background-color,opacity] hover:bg-[var(--color-graphite-200)]",
                            T_FAST,
                            FOCUS,
                            isOpen
                              ? "opacity-100"
                              : "opacity-40 group-hover/row:opacity-100",
                          )}
                        >
                          <ChevronDown
                            className={cn(
                              "size-[18px] transition-transform",
                              T_BASE,
                              isOpen && "rotate-180",
                            )}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                        </button>
                      }
                    />
                  </span>
                </div>
              </div>

              <Reveal open={isOpen}>
                <div className="border-t border-[var(--color-graphite-200)] px-3 py-2">
                  <VocabProperty
                    icon={Folder}
                    label="Folder"
                    value={task.folder?.name ?? "Inbox"}
                  />
                  <VocabProperty
                    icon={UserRound}
                    label="Assignee"
                    value={task.assignee?.name ?? "Imran Wafa"}
                  />
                  <VocabProperty
                    icon={CalendarDays}
                    label="Due"
                    value={task.due?.label ?? "No date"}
                  />
                  <VocabProperty icon={Bell} label="Reminder" value="No reminder" />
                  <VocabProperty
                    icon={Repeat2}
                    label="Repeat"
                    value={task.recurrence ? "Weekly" : "Does not repeat"}
                  />
                  <VocabProperty
                    icon={ListChecks}
                    label="Steps"
                    value={
                      task.steps
                        ? `${task.steps.done} of ${task.steps.total} done`
                        : "None"
                    }
                  />
                  <VocabProperty
                    icon={AlignLeft}
                    label="Notes"
                    value={task.notes ?? "—"}
                  />
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-[var(--color-graphite-200)] px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setOpen(null)}
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
                    onClick={() => setOpen(null)}
                    className={cn(
                      "rounded-md bg-[var(--color-graphite-900)] px-3 py-1.5 text-[13px] font-medium text-white transition-[background-color,transform] hover:bg-[var(--color-graphite-800)] active:scale-95",
                      T_FAST,
                      FOCUS,
                    )}
                  >
                    Save changes
                  </button>
                </div>
              </Reveal>
            </div>
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
room, so it spends it. The two are opposites on that question and compose on
every other, which is why J draws its second line with I's vocabulary.

Editing the title in place was J's second half when it was first drawn, and it
is no longer J's at all: it turned out to be simply better than renaming in a
sheet, so it was promoted to baseline and every concept on this page now has
it. What survives here as J's own is the consequence nobody else can copy
without becoming J. Because the title has a full line, editing it has the
full line too, and a long name is readable while you are changing it. In
every other concept you edit a name you can only see forty characters of.

The cost is stated plainly rather than buried. Row height goes from 44px to
64px, so a viewport that held sixteen tasks holds eleven, and for the person
with a long list that is the whole trade. And there is a gesture collision
this concept has to answer and cannot answer by itself: if clicking the title
edits it, then clicking the title no longer opens the task. J assumes
title-edits / elsewhere-opens, which is Notion's rule and Linear's, but it is
a ruling.
*/


/* Words, not glyphs, because there is finally room for them, and each one
   still leads with the vocabulary's icon so that a person who learned the
   alphabet in concept I can read it here unchanged. */
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
  const { tasks, patch } = useTaskList(SAMPLE)

  return (
    <div className="flex flex-col">
      {tasks.map((task) => {
        const bare =
          !task.due &&
          !task.folder &&
          !task.assignee &&
          !task.steps &&
          !task.recurrence &&
          !task.pulled &&
          !task.notes &&
          !task.abandoned

        return (
          <div
            key={task.id}
            className={cn(
              "group/row grid h-16 w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center rounded-md transition-colors",
              ROW_HOVER,
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
                {task.steps ? (
                  <DetailWord icon={ListChecks}>
                    {task.steps.done}/{task.steps.total}
                  </DetailWord>
                ) : null}
                {task.recurrence ? (
                  <DetailWord icon={Repeat2}>Weekly</DetailWord>
                ) : null}
                {task.pulled ? <DetailWord icon={Pin}>My Day</DetailWord> : null}
                {task.notes ? (
                  <DetailWord icon={AlignLeft}>
                    <span className="truncate text-[var(--color-graphite-400)]">
                      {task.notes}
                    </span>
                  </DetailWord>
                ) : null}
                {task.abandoned ? (
                  <DetailWord icon={Ban}>Abandoned</DetailWord>
                ) : null}
                {bare ? (
                  /* A bare task keeps the line rather than collapsing to one,
                     so the list's rhythm survives. Whether that empty line is
                     calm or wasteful is what this concept is here to be
                     judged on. */
                  <span className="text-[var(--color-graphite-400)]">
                    No details
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex items-center justify-end pr-2">
              <Actions
                task={task}
                onStar={() => patch(task.id, { important: !task.important })}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------ concept D -- */
/* Expand in place, the list receding so the card reads as a new object. */

function PropertyRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid h-9 grid-cols-[110px_minmax(0,1fr)] items-center text-[13px]">
      <span className="text-[var(--color-graphite-600)]">{label}</span>
      <span className="truncate text-sm text-[var(--color-graphite-800)]">
        {value}
      </span>
    </div>
  )
}

function ConceptD() {
  const { tasks, patch } = useTaskList(SAMPLE)
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
                "my-1 rounded-lg border border-[var(--color-graphite-300)] bg-card transition-[box-shadow]",
                T_BASE,
                "shadow-[var(--elevation-1)]",
              )}
            >
              <div className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-start border-b border-[var(--color-graphite-200)] py-2">
                <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
                <span className="pt-1.5">
                  <TaskTitle
                    task={task}
                    onRename={(title) => patch(task.id, { title })}
                    truncate={false}
                    className="text-[15px] leading-6 font-semibold"
                  />
                </span>
                <span className="group/row flex items-center gap-1 pt-1.5 pr-3">
                  <Actions
                    task={task}
                    onStar={() => patch(task.id, { important: !task.important })}
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
                  value={task.assignee?.name ?? "Imran Wafa"}
                />
                <PropertyRow label="Due" value={task.due?.label ?? "No date"} />
                <PropertyRow label="Reminder" value="No reminder" />
                <PropertyRow
                  label="Repeat"
                  value={task.recurrence ? "Weekly" : "Does not repeat"}
                />

                <div className="mt-2 border-t border-[var(--color-graphite-200)] pt-2">
                  <p className="mb-1.5 text-[13px] text-[var(--color-graphite-600)]">
                    Steps
                  </p>
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
                  <p className="mb-1.5 text-[13px] text-[var(--color-graphite-600)]">
                    Notes
                  </p>
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
                  <button
                    type="button"
                    onClick={() => setOpen(null)}
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
                    onClick={() => setOpen(null)}
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
            <TaskTitle
              task={task}
              onRename={(title) => patch(task.id, { title })}
            />
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
    tryIt: "Hover a +N pill to see what it is hiding. Complete a task; star one.",
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
      "Click any chip — the date, the folder, the person, the step count — and change it from the menu.",
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
    id: "H",
    name: "Actor and state",
    optimisesFor:
      "Making the future cheap. A thin rail and one chip carry machine states, and an agent is a delegate attached to the person, never a replacement for them.",
    givesUp:
      "Four pixels of left gutter now for a payoff that cannot ship yet.",
    principle:
      "Shape carries kind, colour carries state, and no state is colour alone. Linear keeps the human responsible after delegating.",
    tryIt:
      "Click the green “Ready for review” chip to approve it. Hover the small AI mark next to a person.",
    render: () => <ConceptH />,
  },
  {
    id: "I",
    name: "One vocabulary",
    optimisesFor:
      "Scanning by column rather than by line. Each detail is one glyph in a reserved slot, so the icons align down the list and the same alphabet reads identically in the row, in the expanded card, and everywhere else in the app.",
    givesUp:
      "Hover does not exist on touch, and this is a PWA. Icon-only detail is learned rather than read, so the first week is worse than the current row even if the second month is better. Reserved slots spend width on details a task does not have.",
    principle:
      "The row and the task form already agree on Folder, ListChecks and Repeat2 by accident, and diverge on due date and notes. This finishes an existing vocabulary rather than inventing one. Due keeps its words because a date is what people scan for.",
    tryIt:
      "Hover any glyph for its words. Click a chevron on the right to open the card in place — every line inside it is led by the same icon.",
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
