/*
The expanded task card (DES-093, shaped by DES-099).

It reads and writes `TaskFormData` — the same object the right-side form uses.
That is the whole point of DES-093 and worth protecting: this is one artifact
in a second presentation, not a second editor. If this file ever grows a field
the form does not have, or edits one differently, the two have forked and the
decision it was approved under no longer holds.

The shape, from DES-099 as amended:

- **One header strip** for the five short values — folder, assignee, due,
  reminder, repeat. Five answers, not five sections. It is the only filled
  region inside the content, because an inset rounded fill groups content.
- **Steps, then Notes, then Attachments**, each its own block with its own
  heading and its own collapse, all open by default. The card's job on the
  first visit is to answer, not to tidy.
- **No rules anywhere.** Spacing and type carry the hierarchy: 16px gap
  between sections against 2px inside one, headings a size smaller and a step
  greyer than the content they own, content indented under its heading.
- **A footer band** at the card's edge, shaded and full-bleed. That is chrome
  rather than a second content group, which is why it does not break the
  one-fill rule.

There is no Save button (DES-109): every edit commits as it is made, so undo
and redo lead the footer instead.
*/

import { useEffect, useRef, useState } from "react"
import {
  AlignLeft,
  Bell,
  CalendarDays,
  Clock3,
  ChevronDown,
  Folder,
  History,
  Link2,
  ListChecks,
  Mail,
  Maximize2,
  Paperclip,
  Plus,
  Redo2,
  Repeat2,
  Share2,
  Undo2,
  UserPlus,
  UserRound,
  X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { TaskFormData } from "@/components/task-form"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const T_BASE = "duration-[var(--duration-base)] ease-[var(--ease-enter)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

export interface TaskCardPeople {
  name: string
  initials: string
  image?: string
}

export interface TaskCardFolders {
  name: string
  color: string
}

/*
The height animation, and why it measures rather than using the grid trick.

The 0fr-to-1fr technique is tidier and was what the concept lab used, but an
`fr` track only resolves to its content while the grid's own height is
indefinite — and inside the shell's list the row sits in a context where it
resolves to zero instead, so an open card animated to nothing. It failed
silently, which is the worst way for a layout trick to fail.

So this measures the content and animates to that height, then releases the
constraint once the transition is done so a card that grows afterwards — a
note being typed, a step being added — is not clipped by a stale number. It is
more code than the trick and it works in every container.
*/
export function Reveal({
  open,
  children,
}: {
  open: boolean
  children: React.ReactNode
}) {
  const inner = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | undefined>(undefined)
  const [settled, setSettled] = useState(open)

  useEffect(() => {
    const node = inner.current
    if (!node) return
    if (open) {
      setSettled(false)
      setHeight(node.scrollHeight)
      const timer = window.setTimeout(() => setSettled(true), 220)
      return () => window.clearTimeout(timer)
    }
    /* From the measured height down, rather than from auto, so there is
       something to animate from. */
    setSettled(false)
    setHeight(node.scrollHeight)
    const frame = requestAnimationFrame(() => setHeight(0))
    return () => cancelAnimationFrame(frame)
  }, [open, children])

  return (
    <div
      className={cn("overflow-hidden transition-[height,opacity]", T_BASE)}
      style={{
        height: open && settled ? "auto" : (height ?? (open ? undefined : 0)),
        opacity: open ? 1 : 0,
      }}
      aria-hidden={!open}
    >
      <div ref={inner}>{children}</div>
    </div>
  )
}

function PropChip({
  icon: Icon,
  value,
  color,
  muted = false,
  avatar,
  items,
}: {
  icon: LucideIcon
  value: string
  color?: string
  muted?: boolean
  avatar?: TaskCardPeople
  items?: { key: string; label: React.ReactNode; onSelect: () => void }[]
}) {
  const body = (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-transparent px-1.5 text-[12px] leading-4 transition-[background-color,border-color]",
        T_FAST,
        "hover:border-[var(--color-graphite-300)] hover:bg-card data-popup-open:border-[var(--color-graphite-300)] data-popup-open:bg-card",
        muted
          ? "text-[var(--color-graphite-500)]"
          : "text-[var(--color-graphite-800)]",
      )}
    >
      {avatar ? (
        <Avatar size="sm" className="size-3.5 data-[size=sm]:size-3.5">
          {avatar.image ? <AvatarImage src={avatar.image} alt="" /> : null}
          <AvatarFallback className="text-[0.5rem] font-semibold">
            {avatar.initials}
          </AvatarFallback>
        </Avatar>
      ) : (
        <Icon
          className="size-3.5 shrink-0"
          style={color ? { color } : undefined}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      )}
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
            onClick={(event) => event.stopPropagation()}
            className={cn("rounded-md", FOCUS)}
          >
            {body}
          </button>
        }
      />
      <DropdownMenuContent align="start">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.key}
            label={typeof item.label === "string" ? item.label : item.key}
            onClick={item.onSelect}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* A section of the card. No rule above it and none below: hierarchy is the
   gap above being larger than any gap inside, the heading being smaller and
   greyer than its content, and the content indented under the heading. The
   block's own icon is the disclosure control, becoming a chevron under the
   pointer, because two marks were saying the same thing twice. */
function Block({
  icon: Icon,
  label,
  badge,
  children,
}: {
  icon: LucideIcon
  label: string
  badge?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="group/sec">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        aria-expanded={open}
        className={cn(
          "-ml-5 flex h-7 items-center gap-1.5 rounded-md pr-1 text-left transition-colors group-hover/sec:bg-[var(--color-graphite-50)]",
          T_FAST,
          FOCUS,
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-3.5 shrink-0 cursor-grab items-center justify-center text-[var(--color-graphite-400)] opacity-0 transition-opacity group-hover/sec:opacity-100"
        >
          <span className="text-[10px] leading-none">⠿</span>
        </span>
        <span className="relative flex size-3.5 shrink-0 items-center justify-center">
          <Icon
            className={cn(
              "absolute size-3.5 text-[var(--color-graphite-500)] transition-opacity group-hover/sec:opacity-0",
              T_FAST,
            )}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <ChevronDown
            className={cn(
              "absolute size-3.5 text-[var(--color-graphite-500)] opacity-0 transition-[transform,opacity] group-hover/sec:opacity-100",
              T_BASE,
              !open && "-rotate-90",
            )}
            strokeWidth={2}
            aria-hidden="true"
          />
        </span>
        <span className="text-[12px] leading-4 font-medium text-[var(--color-graphite-500)]">
          {label}
        </span>
        {badge ? (
          <span className="text-[12px] leading-4 text-[var(--color-graphite-400)] tabular-nums">
            {badge}
          </span>
        ) : null}
      </button>
      <Reveal open={open}>
        <div className="pt-0.5 pl-[18px]">{children}</div>
      </Reveal>
    </div>
  )
}

/* Where a person can create the thing, the empty state is the control that
   creates it, and it says the verb (DES-115). */
function EmptyAction({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-1 text-left text-[12px] leading-4 text-[var(--color-graphite-400)] transition-colors hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-700)]",
        T_FAST,
        FOCUS,
      )}
    >
      <Plus className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      {label}
    </button>
  )
}

function FooterAction({
  icon: Icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: LucideIcon
  label: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            aria-label={label}
            onClick={(event) => {
              event.stopPropagation()
              onClick?.()
            }}
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-[var(--color-graphite-600)] transition-[background-color,color] hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-800)] disabled:pointer-events-none disabled:opacity-35",
              T_FAST,
              FOCUS,
            )}
          >
            <Icon className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        }
      />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

export function TaskCard({
  form,
  people,
  folders,
  onChange,
  onClose,
  onOpenFull,
}: {
  form: TaskFormData
  people: TaskCardPeople[]
  folders: TaskCardFolders[]
  onChange: (next: Partial<TaskFormData>) => void
  onClose: () => void
  onOpenFull?: () => void
}) {
  const [advanced, setAdvanced] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const done = form.steps.filter((step) => step.done).length
  const assignee =
    people.find((person) => person.name === form.assignee) ?? people[0]
  const folder = folders.find((entry) => entry.name === form.folder)

  return (
    <div className="flex flex-col gap-3 pt-1 pr-3 pb-3 pl-7">
      <div className="flex flex-wrap items-center gap-0.5 rounded-lg bg-[var(--color-graphite-50)] px-1.5 py-1.5">
        <PropChip
          icon={Folder}
          value={form.folder || "Inbox"}
          color={folder?.color}
          muted={!form.folder}
          items={folders.map((entry) => ({
            key: entry.name,
            label: entry.name,
            onSelect: () => onChange({ folder: entry.name }),
          }))}
        />
        <PropChip
          icon={UserRound}
          avatar={assignee}
          value={form.assignee || "Unassigned"}
          items={people.map((person) => ({
            key: person.name,
            label: person.name,
            onSelect: () => onChange({ assignee: person.name }),
          }))}
        />
        <PropChip
          icon={CalendarDays}
          value={form.dueDate || "No date"}
          muted={!form.dueDate}
        />
        <PropChip
          icon={Bell}
          value={form.reminder === "none" ? "No reminder" : form.reminder}
          muted={form.reminder === "none"}
        />
        <PropChip
          icon={Repeat2}
          value={form.repeat === "none" ? "Does not repeat" : form.repeat}
          muted={form.repeat === "none"}
        />
      </div>

      {/*
        More options, and it is deliberately the form's own disclosure rather
        than a second pattern (DES-118). The form does not show due time or
        the repeat editor by default either, so the card does not have to be
        denser than the form to be as complete as it — it has to hide the same
        things in the same place.

        It sits directly under the strip because everything it reveals belongs
        to that strip: a time belongs to the date, an interval belongs to the
        repeat.
      */}
      <div className="-mt-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setAdvanced((value) => !value)
          }}
          aria-expanded={advanced}
          className={cn(
            "-ml-1 flex h-6 items-center gap-1 rounded-md px-1 text-[12px] leading-4 font-medium text-[var(--color-graphite-500)] transition-colors hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-800)]",
            T_FAST,
            FOCUS,
          )}
        >
          More options
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              T_BASE,
              advanced && "rotate-180",
            )}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </button>
        <Reveal open={advanced}>
          <div className="flex flex-wrap items-center gap-0.5 pt-1">
            <PropChip
              icon={Clock3}
              value={form.dueTime || "No time"}
              muted={!form.dueTime}
              items={["09:00", "12:00", "15:00", "18:00", ""].map((time) => ({
                key: time || "none",
                label: time || "No time",
                onSelect: () => onChange({ dueTime: time }),
              }))}
            />
            <PropChip
              icon={Repeat2}
              value={`Every ${form.repeatInterval}`}
              muted={form.repeat === "none"}
              items={["1", "2", "3", "4"].map((interval) => ({
                key: interval,
                label: `Every ${interval}`,
                onSelect: () => onChange({ repeatInterval: interval }),
              }))}
            />
            <PropChip
              icon={CalendarDays}
              value={form.repeatDays.join(" ") || "No days"}
              muted={form.repeat === "none"}
              items={["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => ({
                key: day,
                label: form.repeatDays.includes(day) ? `${day} — remove` : `${day} — add`,
                onSelect: () =>
                  onChange({
                    repeatDays: form.repeatDays.includes(day)
                      ? form.repeatDays.filter((entry) => entry !== day)
                      : [...form.repeatDays, day],
                  }),
              }))}
            />
            <PropChip
              icon={CalendarDays}
              value={`On day ${form.repeatMonthlyDay}`}
              muted={form.repeat === "none"}
            />
            <PropChip
              icon={CalendarDays}
              value={form.repeatEnds ? `Ends ${form.repeatEnds}` : "No end date"}
              muted={!form.repeatEnds}
            />
            <PropChip
              icon={UserPlus}
              value={form.invitePending ? `Invite: ${form.invitePending}` : "Invite someone"}
              muted={!form.invitePending}
            />
          </div>
        </Reveal>
      </div>

      <Block
        icon={ListChecks}
        label="Steps"
        badge={form.steps.length ? `${done}/${form.steps.length}` : undefined}
      >
        {form.steps.length > 0 ? (
          <div className="flex flex-col">
            {form.steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onChange({
                    steps: form.steps.map((candidate, position) =>
                      position === index
                        ? { ...candidate, done: !candidate.done }
                        : candidate,
                    ),
                  })
                }}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-1 text-left transition-colors hover:bg-[var(--color-graphite-50)]",
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
                    "text-[14px] leading-5 transition-colors",
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
          <EmptyAction label="Add a step" />
        )}
      </Block>

      <Block icon={AlignLeft} label="Notes">
        {form.notes ? (
          <p className="py-1 text-[14px] leading-6 text-[var(--color-graphite-700)]">
            {form.notes}
          </p>
        ) : (
          <EmptyAction label="Write a note" />
        )}
      </Block>

      {/* Attachments are drawn empty on purpose. The block belongs to the
          card's shape (DES-099) but the feature is Lane 2 — no storage, no
          upload path, no rules on what may be viewed (DES-105) — so it offers
          the action and holds nothing. */}
      <Block icon={Paperclip} label="Attachments">
        <EmptyAction label="Add a file" />
      </Block>

      <Reveal open={showHistory}>
        <Block icon={History} label="History">
          <ol className="flex flex-col gap-1 py-1 text-[12px] leading-4 text-[var(--color-graphite-500)]">
            <li>Created {form.createdAt ?? "recently"} by {form.createdBy ?? "Imran Wafa"}</li>
            {form.completedAt ? (
              <li>Completed {form.completedAt} by {form.completedBy}</li>
            ) : null}
            <li>Last edited just now by Imran Wafa</li>
          </ol>
        </Block>
      </Reveal>

      <div className="-mx-3 -mb-3 -ml-7 flex items-center justify-between gap-2 rounded-b-[7px] bg-[var(--color-graphite-50)] px-3 py-2">
        <span className="truncate text-[12px] leading-4 text-[var(--color-graphite-500)]">
          {form.createdBy
            ? `Created ${form.createdAt ?? "recently"} by ${form.createdBy}`
            : "Saved"}
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          <FooterAction icon={Undo2} label="Undo" disabled />
          <FooterAction icon={Redo2} label="Redo" disabled />
          <span
            aria-hidden="true"
            className="mx-1 h-4 w-px bg-[var(--color-graphite-200)]"
          />
          <FooterAction icon={Link2} label="Copy link" />
          <FooterAction icon={Share2} label="Share" />
          <FooterAction icon={Mail} label="Email" />
          <span
            aria-hidden="true"
            className="mx-1 h-4 w-px bg-[var(--color-graphite-200)]"
          />
          <FooterAction
            icon={History}
            label={showHistory ? "Hide history" : "History"}
            onClick={() => setShowHistory((value) => !value)}
          />
          <FooterAction
            icon={Maximize2}
            label="Open full screen"
            onClick={onOpenFull}
          />
          <FooterAction icon={X} label="Close" onClick={onClose} />
        </span>
      </div>
    </div>
  )
}
