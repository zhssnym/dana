/*
The expanded card: everything a task is, opened inside the row that owns it. The
lab and the screens render one card rather than two copies of one.

It opens in place. Its shape: one header strip of five chips carrying every
single short value, then Steps, Notes and Attachments as collapsible blocks,
then a shaded footer band. It has no Save button: every edit commits as it is
made, and the footer is a toolbar rather than a form's foot. An empty block
draws the control that fills it instead of drawing nothing.
*/

import { Input } from "./ui/input.js"
import { InlineInput } from "./ui/inline-field.js"
import { Face } from "./person-face.js"
import { IconAction } from "./icon-action.js"
import { WindowActivity } from "./window-bar.js"
import { useHistory } from "../lib/history.js"
import {
  ArrowUpRight,
  AlignLeft,
  Bell,
  CalendarDays,
  Check as CheckIcon,
  ChevronDown,
  Copy,
  FileText,
  Video,
  FolderInput,
  FolderPlus,
  GripVertical,
  Image as ImageIcon,
  Link2,
  ListChecks,
  ListPlus,
  Maximize2,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Play,
  Plus,
  Repeat2,
  UserRound,
  Workflow,
  X,
  type LucideIcon,
} from "../lib/icons.js"
import { TaskDependencies } from "./task-dependencies.js"
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react"

import {
  FolderMark,
  folderMarkFor,
  folderNameOf,
} from "./folder-mark.js"
import { folderLibrary } from "../lib/folder-library.js"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.js"
import {
  DuePanel,
  PickerChip,
  ReminderPanel,
  RepeatPanel,
} from "./task-pickers.js"
import { CommentsThread } from "./comments.js"
import { usePeopleLibrary } from "../lib/people-library.js"
import { useMultiMemberFolderIds } from "../api/queries.js"
/* 9.3's five field names, transcribed once. See `components/task-card-copy.ts`. */
import {
  CHIP_ASSIGNEE,
  CHIP_DUE,
  CHIP_FOLDER,
  CHIP_REMINDER,
  CHIP_REPEAT,
  UNASSIGNED,
} from "./task-card-copy.js"
import { TaskMoveGuard, type PendingMove } from "./task-move-guard.js"
import { TaskAssigneeInvite } from "./task-assignee-invite.js"
import { TaskHistoryBlock } from "./task-history-block.js"
import { INVITE_BY_EMAIL, STEP_CAP_NOTICE } from "./task-copy.js"
/* 10.3's cap for the field. Restated rather than imported because
   `shared/tasks.ts` spends it inline in a zod `max`, and a second constant
   over there is a change to the contract file this row does not own. Named
   here so the notice and the guard read one number. */
const STEP_CAP = 50
import {
  commentCount,
  dueChipValue,
  reminderChipValue,
  repeatSummary,
  stepCount,
  type ConceptStep,
  type ConceptTask,
} from "../tasks/task-model.js"
import { useTimeFormat } from "../lib/time-format.js"
import { useSortableList } from "../lib/use-sortable-list.js"
import { cn } from "./ui/utils.js"

const TaskComposer = lazy(() => import("./page/canvas/TaskComposer.js"))

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const T_BASE = "duration-[var(--duration-base)] ease-[var(--ease-enter)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

/* ----------------------------------------------------------------- card, */
/*
The expanded card, shared by every concept that expands.

It has three parts and they are not the same kind of thing:

- ONE header strip carrying everything that is a single short value: folder,
  assignee, due, reminder, repeat. These are five answers, not five sections,
  and giving each one a line of its own would make the card tall enough to bury
  the two things people actually came to read.
- Steps, and then Notes, as their own blocks. These two are different in kind:
  they hold as much content as the task needs rather than one value, and they
  are the reason a person opens a task at all.

Both blocks collapse, and both start open, because the default should be the
answer to "what is this task" rather than a tidier card that makes you ask
again. Collapsing is for the person who has read the notes and wants them out of
the way, which is a second-visit need, not a first-visit one.

No rules anywhere inside the card: four lines across a card this small
compartmentalise it into a database record. Hierarchy is carried by spacing and
type alone, a 16px gap between sections against a 2px gap inside one, headings
smaller and greyer than the content they own, and each section's content
indented to sit under its heading, as in Notion, where a page is a stack of
blocks that never needs a box drawn round it.

What "right" means: cover the headings and you should still see where one
section ends. If you cannot, the spacing is wrong, and the fix is more spacing
rather than a line put back.

The body is an ordered list of blocks. Steps, Notes and Attachments can each be
moved up or down from the menu on their heading, and each keeps its own open
state across the move because the blocks are keyed rather than positional.

**This is a closed set of typed blocks**, each already knowing how to render and
edit itself, and not a document of arbitrary blocks created by typing. The
latter needs a stored document schema, a rich text editor, collaborative editing
rules for a shared task, and a migration for every note already written as a
string. The closed set gives almost all of the feeling people mean by
"Notion-like", the card is a stack you arrange rather than a form somebody laid
out for you, because the only thing that has to be stored is an order.

The limit: you cannot invent a block that Dana does not already have. A table,
or three separate note blocks, is outside this model.
*/

/*
The three pickers the card was missing, and why they are popovers rather than
menus.

A menu answers "which of these?", and that is the right shape for a folder or
a person. A date is not a list, it is a month you look at, and a reminder or
a recurrence is several answers at once. Forcing those into menu items is what
produced the earlier version's problem: a stack of one-answer chips standing in
for one fact.

So each of these is one chip that opens the whole control for its fact, and
each closes with the whole answer written back into the chip.
*/



/*
**The chip announces its field.** A button whose only text is the value would
answer to "Desk" or a person's name and not say which question it is the answer
to. 9.3's field table names the five and 9.1 makes every control it names
reachable by role and by name. The rule and its reasons are written once, over
`PickerChip` in `components/task-pickers.tsx`, because the two chips are one
control drawn twice.

`field` is required here rather than defaulted, which is the one difference from
that one: `PickerChip` has a tooltip already carrying the field's name and this
has nothing to fall back to.
*/
function PropChip({
  icon: Icon,
  value,
  field,
  color,
  muted = false,
  avatar,
  items,
}: {
  icon: LucideIcon
  value: string
  /** 9.3's own name for the field, announced before the value. */
  field: string
  color?: string
  muted?: boolean
  /* When a chip stands for a person, the person's face replaces the generic
     glyph. A name with a face beside it is recognised; a name with a
     person-shaped icon beside it still has to be read. */
  avatar?: { initials: string; name: string; image?: string }
  items?: { key: string; label: ReactNode; onSelect: () => void }[]
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
        <Face person={avatar} className="size-3.5 data-[size=sm]:size-3.5" />
      ) : (
        <Icon
          className="size-3.5 shrink-0"
          style={color ? { color } : undefined}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      )}
      <span className="sr-only">{field}</span>
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
record. Hierarchy here comes from three things instead, the gap above a
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
  itemRef,
  handle,
  isActive = false,
  isSettling = false,
  offset = 0,
}: {
  icon: LucideIcon
  label: string
  badge?: string
  children: ReactNode
  itemRef?: (element: HTMLElement | null) => void
  handle?: Record<string, unknown>
  isActive?: boolean
  isSettling?: boolean
  offset?: number
}) {
  /* Open by default. See the block comment above TaskCard: the card's job on
     the first visit is to answer, not to tidy. */
  const [open, setOpen] = useState(true)
  const carrying = isActive && !isSettling

  return (
    <div
      ref={itemRef}
      style={{
        transform: offset === 0 ? undefined : `translate3d(0, ${offset}px, 0)`,
        transition: carrying
          ? "box-shadow var(--duration-fast) var(--ease-standard)"
          : "transform var(--duration-base) var(--ease-enter), box-shadow var(--duration-fast) var(--ease-standard)",
        zIndex: isActive ? 20 : undefined,
      }}
      className={cn(
        "group/sec relative rounded-md",
        /* No drop line any more. The blocks either side move out of the way,
           which says where this one lands without drawing anything, and a
           line here always competed with the shaded details strip above. */
        isActive &&
          "cursor-grabbing bg-card shadow-[var(--elevation-1)] ring-1 ring-[var(--color-graphite-200)]",
      )}
    >
      {/* The heading is a row of controls rather than one, because a handle
          inside a toggle button is a button inside a button, which the browser
          silently repairs by dropping one of them. */}
      <div
        className={cn(
          /* Pulled left into the card's handle gutter, so the grip sits
             inside the card with room to breathe rather than hard against
             its border. The gutter is the pl-7 on the card body. */
          /* No left padding, so the chevron lands exactly on the card body's
             left edge and therefore exactly on the shaded strip above it. The
             grip is what hangs into the gutter, which is what a gutter is
             for. */
          "-ml-5 flex h-7 items-center gap-1.5 rounded-md pr-1 transition-colors group-hover/sec:bg-[var(--color-graphite-50)]",
          T_FAST,
        )}
      >
        {/* The grip is the whole affordance: it appears on hover, it is what
            you grab, and it is why the heading does not need a menu. It is a
            button rather than a decorated span so that the block can also be
            moved with the arrow keys. A block with no handle is pinned,
            Comments sits outside the content order, and keeps a spacer so every
            heading's icon lands on one left edge. */}
        {handle ? (
          <button
            type="button"
            aria-label={`Reorder ${label}`}
            {...handle}
            className={cn(
              "flex size-3.5 shrink-0 cursor-grab items-center justify-center rounded text-[var(--color-graphite-400)] opacity-0 transition-opacity group-hover/sec:opacity-100 focus-visible:opacity-100 active:cursor-grabbing",
              T_FAST,
              FOCUS,
              isActive && "cursor-grabbing opacity-100",
            )}
          >
            <GripVertical
              className="size-3.5 data-[size=sm]:size-3.5"
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>
        ) : (
          <span className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setOpen((v) => !v)
          }}
          aria-expanded={open}
          className={cn("flex flex-1 items-center gap-1.5 rounded-md text-left", FOCUS)}
        >
          {/* One slot, and the block's own icon is the disclosure control:
              it is the icon at rest and becomes a chevron under the pointer.
              Two marks side by side were saying the same thing twice, and the
              chevron was the half nobody needed to see until they wanted it. */}
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
      </div>
      <Reveal open={open}>
        {/* Indented to sit under the heading's icon, not its chevron. */}
        <div className="pt-0.5 pl-[18px]">{children}</div>
      </Reveal>
    </div>
  )
}

/*
Steps: draggable, selectable, and one verb for moving them anywhere.

Promote step to task, make a new task from these steps, make these steps into
tasks here, make these steps into tasks elsewhere: five verbs, one idea. So
there is one verb, **Move to…**, and the destination decides what happens:

a step moved into a FOLDER becomes a task, because folders hold tasks the same
steps moved into a TASK stay steps, because tasks hold steps

Level is a consequence of where a thing lands, never a separate command. "Make a
new task from these" is then just Move to → New task, and "make them separate
tasks in another folder" is Move to → that folder. Nothing needs a new name, and
the rule extends without new menu items the day something else can hold
something else.

Selection is by clicking a step's text; the tick box still only ticks. Those are
two different intentions and giving them one target is how people accidentally
complete things they meant to select.
*/

/*
The card's footer, and why there is no Save button on it.

**There is nothing for Save to do.** Every edit in this card already commits the
moment it is made, a rename on Enter or blur, a property on choosing it, a step
on ticking it. A Save button at the bottom of a card that has already saved is a
promise the interface cannot keep, and the honest name for the thing people
press afterwards is Close. The safety net Save-and-Cancel used to provide is the
app-wide undo.

- **Expand** is the most valuable icon here. The card lives inside a list
  column, and a form comfortable at 540px has to stack into something much
  narrower; an expand that opens the same task full-width answers that.
- **History** is the only way to answer "who changed this", and it is where an
  undone change goes to be understood.

What is deliberately NOT here: Delete. The row's overflow menu already carries
it, and a destructive action in a second place is how two menus both called
"More actions" end up disagreeing.
*/
/* An icon button with its name in a tooltip. Used by the card's footer and by
   both selection bars, so a Delete looks and reads the same wherever it is
   offered. */

/*
A task's own past, in the line the footer already had.

Split into its own component because `useHistory` is a hook and the footer
renders with or without a task id, a card in the row lab has none. One
component that may draw nothing beats a conditional hook.
*/
function TaskActivity({ taskId }: { taskId?: string }) {
  const events = useHistory("task", taskId ?? "")
  if (!taskId) return null
  return <WindowActivity events={events} />
}

function CardFooter({
  taskId,
  onClose,
  onExpand,
  openIn,
  chrome = "inline",
}: {
  taskId?: string
  onClose: () => void
  onExpand?: () => void
  openIn?: ReactNode
  chrome?: "inline" | "surface"
}) {
  return (
    /*
    The footer is shaded, and that needs squaring with the rule that a card
    never fills two regions. The rule stands; this is not a second one.

    What the rule forbids is using fill to group *content*, because two grouped
    regions turn a card back into compartments. The details strip does that job,
    and it looks the part: inset from the card's edges, rounded on all four
    sides, sitting inside the content column.

    This is not content. It is chrome, the card's edge, carrying the actions
    that belong to the whole thing rather than to any part of it. So it is drawn
    as an edge instead of as a group: full-bleed to the card's sides, square at
    the top, following the card's own radius at the bottom. Nothing about it
    reads as "these items belong together"; it reads as "this is where the card
    ends".

    The distinction, and it is the portable half: an inset rounded fill groups
    content, a full-bleed edge band is chrome. A card may have one of each and
    still not have two groups.

    No separator line either. A shaded band already has an edge, the point where
    the shade begins, and drawing a rule along it would be saying the same thing
    twice.
    */
    <div className="-mx-3 -mb-3 -ml-7 rounded-b-[7px] bg-[var(--color-graphite-50)]">
      {/*
      **9.3 puts the provenance in the footer.**

      That section's card paragraph ends "the footer renders the task's creation
      and its completion; the rest of its history is the Activity control". A
      block of its own between the Comments disclosure and this band would read
      as a history section under the conversation, and the whole record is the
      overflow menu's History, one door.

      AC-178 reads the creator and the instant off the surface with nothing
      pressed, off the two paragraphs, which carry no control of their own.
       */}
      <TaskHistoryBlock taskId={taskId} />
      {/* `empty:hidden` because this row can now render nothing at all: in a
          surface it holds the Activity line alone, and that line is absent
          until the events arrive. A padded shaded strip with nothing in it is
          the same useless space the Copy link icon was removed for. */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 empty:hidden">
        {/*
        The edited line is the History control, rather than a caption beside
        one, so the same fact is not stated twice with neither statement
        openable. The window bar settles the pattern for exactly this
        (`WindowActivity`): the line's resting job is to *tell* you something
        and its second job is to open. Same component here, so a task's history
        and a page's are one control rather than two that will drift.
         */}
        {/*
        **9.3's history is a block on the card, not only a line that opens.**
        `components/task-history-block.tsx` carries the whole of the reasoning.
        The Activity line stays beside it, because it is the window bar's own
        control: the line's resting job is to *tell* you something and its
        second job is to open; the block means the telling does not have to be
        pressed to be read.
         */}
        <TaskActivity taskId={taskId} />
        {/*
        What this row deliberately does not carry.

        **Undo and Redo**: a card footer promises text-editor semantics a to-do
        app does not have. The net is app-wide, `lib/undo.ts`, one bar and
        Ctrl/Cmd+Z, which also covers deleting and abandoning a task, which a
        card-local undo never could.

        **Share** and **Email**: Dana shares *folders*, so "share this task"
        either invites somebody to the whole folder, which is not what the
        button appears to promise, or it is a new sharing model nobody has
        specified. Sharing lives on the folder page, where it is true.

        **Copy link**: it is `copy-link` in `lib/object-acts.ts`'s task
        contract, drawn by every "More actions" menu the surface and the row
        already carry, and supplied from the object's own id (`task-surface.tsx`
        and `task-row.tsx` both pass `onCopyLink`). 9.3 puts it there and only
        there: its footer sentence names "the completion control, the star, and
        'More actions' (History, Copy link, ...)". In a surface the band's
        trailing cluster would otherwise be that one icon. The menu's act goes
        through `tasks/task-acts.ts` and so through `lib/nav-links.ts`, the one
        place that decides where an object lives (9.1's `/app/tasks/:id`).
         */}
        {chrome === "inline" ? (
          <span className="flex shrink-0 items-center gap-0.5">
            {/* Full screen from the card, one press. Inside a surface the
                chrome above already owns the views and the close, so the footer
                offers neither: two closes in one card is one too many. In the
                lab, where no surface host exists, it stays honestly disabled. */}
            {/* The same "Open in…" the row offers, so both entry points behave
                alike rather than one control being a choice and the other a
                verdict. */}
            {openIn ?? (
              <IconAction
                icon={Maximize2}
                label="Open full screen"
                disabled={!onExpand}
                onClick={onExpand}
              />
            )}
            <IconAction icon={X} label="Close" onClick={onClose} />
          </span>
        ) : null}
      </div>
    </div>
  )
}

/* A heading inside a menu. Deliberately not Base UI's GroupLabel, which
   requires a Group ancestor and throws if it does not have one, taking the
   entire popup with it rather than losing a heading. Nothing about a caption
   needs that risk. */
export function MenuHeading({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 py-1.5 text-[12px] leading-4 font-medium text-[var(--color-graphite-500)]">
      {children}
    </div>
  )
}

/* One menu row: a mark, a name, and a sentence saying what choosing it does.
   Shared by the step menu and the task-row menu so the two never drift into
   describing the same operation differently. */
export function newFolderChoice(onPick: () => void) {
  return {
    key: "__new-folder",
    label: (
      <span className="inline-flex items-center gap-2">
        <FolderPlus className="size-4" strokeWidth={1.75} aria-hidden="true" />
        New folder…
      </span>
    ),
    onSelect: onPick,
  }
}

/*
An empty block is the control that fills it.

"No steps yet" is a status report, and a status report is a strange thing to put
in a card whose every other line can be edited where it sits. It tells you what
is not there and leaves you to work out what to do about it, usually by looking
elsewhere for a button.

So the empty state is the affordance: it sits where the first item will appear,
it keeps the target size of the row it will become, and it says the action
rather than the absence. Phrased as the thing that happens, "Add a step",
because a control should say what it does.

Two rules.

**It is set at the metadata step, not the content step.** At 14px, the size of a
real step, under a 12px heading naming the block, an empty block would shout
louder than the label telling you what it was, which is the hierarchy upside
down. A placeholder is not content yet. It is 12/16, so an empty block is quiet
all the way through and only grows a voice when something real is in it. The
32px target stays: type size is a typographic decision and touch target is not,
and the two should not be allowed to argue.

**It never repeats its block's icon.** A paperclip under the Attachments
heading's paperclip says the same thing twice and leaves the verb unillustrated.
The heading's icon says what the block *is*, and the placeholder's icon says
what you are about to *do*, which is always add, so it is always a plus.
*/
/* The control that fills an empty block. It has to actually fill it: a button
   that only stopped the click from reaching the row would leave a card with
   nothing in it that way however many times somebody pressed "Add a step". */
export function EmptyAction({
  label,
  onSelect,
  hint,
  icon: Icon = Plus,
  fill = true,
  expanded,
}: {
  label: string
  onSelect?: () => void
  hint?: string
  /* Almost always the plus, per the rule above, the placeholder's glyph says
     what you are about to *do*. The exception is a block with more than one
     way in, where the second way needs naming: see the attachments pair. */
  icon?: LucideIcon
  /* Whether this action is the whole row. It is, when it is the only way to
     fill the block; it is not, when it sits beside a peer. */
  fill?: boolean
  expanded?: boolean
}) {
  return (
    <button
      type="button"
      title={hint}
      aria-expanded={expanded}
      onClick={(e) => {
        e.stopPropagation()
        onSelect?.()
      }}
      className={cn(
        "flex h-8 items-center gap-2 rounded-md px-1 text-left text-[12px] leading-4 text-[var(--color-graphite-400)] transition-colors hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-700)]",
        /* Same px-1 either way, so the first thing in the block starts on the
           same left edge as "Write a note" and "Add a step" do. */
        fill ? "w-full" : "shrink-0",
        T_FAST,
        FOCUS,
      )}
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      {label}
      {hint ? (
        <span className="ml-auto text-[11px] text-[var(--color-graphite-400)]">
          {hint}
        </span>
      ) : null}
    </button>
  )
}

export function DestinationChoice({
  icon: Icon,
  name,
  detail,
  color,
}: {
  icon: LucideIcon
  name: string
  detail: string
  color?: string
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5 py-0.5">
      <Icon
        className="size-4 shrink-0"
        style={color ? { color } : undefined}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[14px] leading-5 text-[var(--color-graphite-800)]">
          {name}
        </span>
        <span className="truncate text-[12px] leading-4 text-[var(--color-graphite-500)]">
          {detail}
        </span>
      </span>
    </span>
  )
}


/* A step's name: a label until you click it, then a field.

   A permanent field is wrong twice over. A column of input boxes reads as a
   form rather than as a checklist, and a row keyed by its own title remounts on
   every keystroke, throwing the caret out after one character.

   This is the same rename-in-place rule the task title follows, for the same
   reason: the thing itself is the control, but it still looks like the thing
   until you decide to change it. */
function StepTitle({
  step,
  onRename,
}: {
  step: ConceptStep
  onRename: (title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(step.title)

  const metrics = cn(
    "min-w-0 flex-1 text-left text-[14px] leading-5",
    step.done
      ? "text-[var(--color-graphite-500)] line-through decoration-[var(--color-graphite-400)]"
      : "text-[var(--color-graphite-800)]",
  )

  if (editing) {
    return (
      <InlineInput
        autoFocus
        value={draft}
        aria-label="Step name"
        /* Select on entry: renaming is usually replacing, so the keyboard
           assumes the usual case. */
        onFocus={(event) => event.currentTarget.select()}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          onRename(draft.trim() || step.title)
          setEditing(false)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
          }
          if (event.key === "Enter") {
            onRename(draft.trim() || step.title)
            setEditing(false)
          }
          if (event.key === "Escape") {
            setDraft(step.title)
            setEditing(false)
          }
        }}
        className={cn(
          metrics,
          "-mx-1 rounded-[4px] bg-background px-1 outline-none ring-2 ring-[var(--color-dana-accent-600)]",
        )}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        setDraft(step.title)
        setEditing(true)
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className={cn(
        metrics,
        "-mx-1 cursor-text truncate rounded-[4px] px-1 transition-colors",
        T_FAST,
        FOCUS,
        "hover:bg-[var(--color-graphite-100)]",
      )}
    >
      {step.title}
    </button>
  )
}

function StepList({
  task,
  toggleStep,
  moveStep,
  moveStepsTo,
  duplicateSteps,
  removeSteps,
  setStepsDone,
  addStep,
  renameStep,
  onStepsToNewFolder,
}: {
  task: ConceptTask
  toggleStep: (id: string, index: number) => void
  moveStep: (id: string, from: number, to: number) => void
  duplicateSteps: (id: string, indices: number[]) => void
  removeSteps: (id: string, indices: number[]) => void
  setStepsDone: (id: string, indices: number[], done: boolean) => void
  /* Optional for the reason the same prop gives on `TaskCard`. */
  moveStepsTo?: (
    id: string,
    indices: number[],
    destination:
      | { kind: "new-task" }
      | { kind: "folder"; name: string; color: string },
  ) => void
  /* A step arrives with its title; the list never writes a placeholder. */
  addStep: (id: string, title: string) => void
  renameStep: (id: string, index: number, title: string) => void
  onStepsToNewFolder: (taskId: string, indices: number[]) => void
}) {
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [adding, setAdding] = useState(false)
  const [newStep, setNewStep] = useState("")
  /* Steps sort on the same engine as the task list, so the two feel like one
     gesture learned once. No dwell here: two steps do not make a folder, and
     an interaction that arms on stillness in one list and does nothing in the
     other would be worse than not having it at all. */
  const stepDrag = useSortableList({
    count: task.steps?.length ?? 0,
    onReorder: (from, to) => moveStep(task.id, from, to),
    disabled: selecting,
    describe: (index) => task.steps?.[index]?.title ?? "Step",
  })
  const pressTimer = useRef<number | null>(null)
  /* When the long press fired, rather than whether it fired. A boolean here
     is wrong: it has to be cleared by the click that follows the press, and
     that click does not always arrive, touch suppresses it, and so does
     lifting the finger outside the row. The flag then stays raised and
     swallows the user's next tap, which reads as the selection being broken. */
  const longPressAt = useRef(0)
  const lastCount = useRef(0)

  const steps = task.steps ?? []

  /* Escape leaves selection, which is the one keyboard expectation a mode
     like this has to meet. */
  useEffect(() => {
    if (!selecting) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelecting(false)
        setSelected([])
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selecting])

  /* No early return for the empty case any more. "Add a step" belongs at the
     foot of the list whether or not there is a list yet, a checklist you can
     only start once, and then never extend without opening a menu, is not a
     checklist. */

  function clearPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  function startPress(index: number) {
    clearPress()
    pressTimer.current = window.setTimeout(() => {
      longPressAt.current = Date.now()
      lastCount.current = 1
      setSelecting(true)
      setSelected([index])
    }, 400)
  }

  function toggle(index: number) {
    setSelected((current) => {
      const next = current.includes(index)
        ? current.filter((i) => i !== index)
        : [...current, index]
      /* Emptying the selection leaves the mode, exactly as it does in a
         messaging app. A mode you have to dismiss separately after
         deselecting everything is a mode people get stuck in. */
      if (next.length === 0) setSelecting(false)
      else lastCount.current = next.length
      return next
    })
  }

  function exit() {
    setSelecting(false)
    setSelected([])
  }

  const move = (
    destination:
      | { kind: "new-task" }
      | { kind: "folder"; name: string; color: string },
  ) => moveStepsTo?.(task.id, [...selected].sort((a, b) => a - b), destination)

  return (
    <div className="flex flex-col">
      {steps.map((step, i) => {
        const isSelected = selected.includes(i)
        const stepState = stepDrag.itemState(i)

        return (
          <div
            /* Keyed by position, never by title. A key containing the title
               changes on every keystroke, so React would unmount and remount
               the field after each character and throw the caret out. */
            key={i}
            ref={stepDrag.setItemRef(i)}
            /* Press and hold to start selecting, then tap to add. The gesture
               people already know from every messaging app they use, which is
               the whole reason for choosing it over a click that silently
               meant something different from the click next to it. */
            onPointerDown={() => {
              if (!selecting) startPress(i)
            }}
            onPointerUp={clearPress}
            onPointerLeave={clearPress}
            onClick={() => {
              /* Ignore only the click that belongs to the press just made. */
              if (selecting && Date.now() - longPressAt.current > 300) toggle(i)
            }}
            style={{
              transform:
                stepState.offset === 0
                  ? undefined
                  : `translate3d(0, ${stepState.offset}px, 0)`,
              transition:
                stepState.isActive && !stepState.isSettling
                  ? "box-shadow var(--duration-fast) var(--ease-standard)"
                  : "transform var(--duration-base) var(--ease-enter), background-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard)",
              zIndex: stepState.isActive ? 20 : undefined,
            }}
            className={cn(
              "group/step relative flex h-8 items-center gap-2 rounded-md pr-1",
              selecting && "cursor-pointer select-none",
              /* Carried: lifted and opaque, the same language the task rows
                 use one level up. */
              stepState.isActive &&
                "cursor-grabbing bg-card shadow-[var(--elevation-1)] ring-1 ring-[var(--color-graphite-200)]",
              isSelected
                ? "bg-[var(--color-dana-accent-100)]"
                : !stepState.isActive && "hover:bg-[var(--color-graphite-50)]",
            )}
          >
            {/* One slot, two jobs: the drag handle normally, the selection
                mark once selecting. They never appear together, so the row
                never grows a second control. */}
            {/* Not aria-hidden any more: the grip inside it is a real focus
                stop now, and hiding its container would take it back off the
                keyboard as fast as making it a button put it there. */}
            <span className="-ml-[18px] flex size-4 shrink-0 items-center justify-center">
              {selecting ? (
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full border transition-[background-color,border-color]",
                    T_FAST,
                    isSelected
                      ? "border-[var(--color-dana-accent-600)] bg-[var(--color-dana-accent-600)]"
                      : "border-[var(--color-graphite-400)] bg-background",
                  )}
                >
                  {isSelected ? (
                    <CheckIcon className="size-3 text-white" strokeWidth={3} />
                  ) : null}
                </span>
              ) : (
                /* A real button, so the step can be moved from the keyboard
                   as well as the pointer: focus it and the arrows walk it up
                   and down the list, with focus following it. */
                <button
                  type="button"
                  aria-label={`Reorder ${step.title}`}
                  {...stepDrag.handleProps(i)}
                  className={cn(
                    "flex size-4 cursor-grab items-center justify-center rounded text-[var(--color-graphite-400)] opacity-0 transition-opacity group-hover/step:opacity-100 focus-visible:opacity-100 active:cursor-grabbing",
                    T_FAST,
                    FOCUS,
                    stepState.isActive && "cursor-grabbing opacity-100",
                  )}
                >
                  <GripVertical className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </span>

            {/* The tick only ever ticks, and stops being a control while
                selecting, so a tap meant to select can never complete a step
                instead. */}
            {selecting ? (
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-[3px] border",
                  step.done
                    ? "border-[var(--color-success-600)] bg-[var(--color-success-600)]"
                    : "border-input bg-background",
                )}
              >
                {step.done ? (
                  <CheckIcon className="size-3 text-white" strokeWidth={3} />
                ) : null}
              </span>
            ) : (
              <button
                type="button"
                role="checkbox"
                aria-checked={step.done}
                aria-label={`Mark step ${step.done ? "not done" : "done"}`}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleStep(task.id, i)
                }}
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded",
                  FOCUS,
                )}
              >
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-[3px] border transition-[background-color,border-color]",
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
                      className="stroke-[var(--color-graphite-0)]"
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
              </button>
            )}

            <StepTitle
              step={step}
              onRename={(title) => renameStep(task.id, i, title)}
            />

            {/* Removing one step should not need a selection first. It appears
                on hover in the row's own trailing slot, which is where the
                task row keeps its actions too. */}
            <button
              type="button"
              aria-label={`Remove ${step.title}`}
              onClick={(event) => {
                event.stopPropagation()
                removeSteps(task.id, [i])
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--color-graphite-400)] opacity-0 transition-opacity group-hover/step:opacity-100 focus-visible:opacity-100",
                T_FAST,
                FOCUS,
                "hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-700)]",
              )}
            >
              <X className="size-3.5" strokeWidth={2} aria-hidden="true" />
            </button>
            {/* A step's own menu, on hover beside the cross, so "Make this a
                task" is found where a person looks for it rather than only
                behind a press-and-hold that a mouse turns into a rename.
                Offered only where the act has somewhere to go: a step with no
                id yet, or a task with no folder, draws none. */}
            {moveStepsTo !== undefined && task.folder !== undefined && step.id !== undefined ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`More actions for ${step.title}`}
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--color-graphite-400)] opacity-0 transition-opacity group-hover/step:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100",
                        T_FAST,
                        FOCUS,
                        "hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-700)]",
                      )}
                    >
                      <MoreHorizontal className="size-3.5" strokeWidth={2} aria-hidden="true" />
                    </button>
                  }
                />
                <DropdownMenuContent align="end" className="min-w-[12rem]">
                  <DropdownMenuItem
                    label="Make this a task"
                    onClick={() => {
                      const folder = task.folder
                      if (folder === undefined) return
                      moveStepsTo(task.id, [i], {
                        kind: "folder",
                        name: folder.name,
                        color: folder.color,
                      })
                    }}
                  >
                    <ListPlus className="size-4" strokeWidth={1.75} aria-hidden="true" />
                    Make this a task
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    label="Remove"
                    onClick={() => removeSteps(task.id, [i])}
                  >
                    <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        )
      })}

      {/*
      **10.3's cap, said once the list is at it.**

      9.3's steps row ends "cap notice \"Limit 50 steps\"", and AC-161 reads the
      string rather than a number on the page, which a step titled 50 would also
      satisfy. 7.7 is what refuses the fifty-first.

      The control goes with the notice rather than standing beside it disabled,
      which is 9.3's own "hidden" read the way AC-094 reads it one field over:
      what a person needs at the cap is the reason, not a button that will
      refuse them.
       */}
      {steps.length >= STEP_CAP ? (
        <p className="px-2 py-1 text-[12px] leading-4 text-[var(--color-graphite-500)]">
          {STEP_CAP_NOTICE}
        </p>
      ) : selecting ? null : adding ? (
        /* "Add a step" opens an empty, focused field and nothing is written
           until it holds text: Enter saves and opens the next, blur saves what
           is there, Escape leaves. Writing a placeholder step on the press
           would put another blank row on the server with every Enter. */
        <div className="flex h-8 items-center gap-2 rounded-md pr-1">
          <span className="flex size-5 shrink-0 items-center justify-center">
            <span className="size-4 rounded-[3px] border border-input bg-background" />
          </span>
          <InlineInput
            autoFocus
            value={newStep}
            aria-label="New step"
            placeholder="Type a step"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => setNewStep(event.target.value)}
            onBlur={() => {
              const title = newStep.trim()
              if (title) addStep(task.id, title)
              setNewStep("")
              setAdding(false)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") {
                event.preventDefault()
                event.stopPropagation()
              }
              if (event.key === "Enter") {
                const title = newStep.trim()
                if (!title) {
                  setAdding(false)
                  return
                }
                addStep(task.id, title)
                setNewStep("")
              }
              if (event.key === "Escape") {
                setNewStep("")
                setAdding(false)
              }
            }}
            className="min-w-0 flex-1 rounded-[4px] bg-background px-1 text-[14px] leading-5 text-[var(--color-graphite-800)] outline-none ring-2 ring-[var(--color-dana-accent-600)]"
          />
        </div>
      ) : (
        <EmptyAction label="Add a step" onSelect={() => setAdding(true)} />
      )}

      <Reveal open={selecting}>
        <div className="mt-1 flex items-center gap-2 rounded-md bg-[var(--color-dana-accent-50)] px-2 py-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              exit()
            }}
            aria-label="Leave selection"
            className={cn(
              "flex size-5 items-center justify-center rounded text-[var(--color-dana-accent-800)] transition-colors hover:bg-[var(--color-dana-accent-100)]",
              T_FAST,
              FOCUS,
            )}
          >
            <X className="size-4 data-[size=sm]:size-4" strokeWidth={2} aria-hidden="true" />
          </button>
          <span className="mr-auto text-[12px] leading-4 font-medium text-[var(--color-dana-accent-800)]">
            {selected.length || lastCount.current} selected
          </span>
          <IconAction
            icon={CheckIcon}
            label="Mark done"
            onClick={() => {
              setStepsDone(task.id, [...selected], true)
              exit()
            }}
          />
          <IconAction
            icon={Copy}
            label="Duplicate"
            onClick={() => {
              duplicateSteps(task.id, [...selected])
              exit()
            }}
          />
          {moveStepsTo === undefined ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Move to"
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md text-[var(--color-graphite-600)] transition-[background-color,color] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)] data-popup-open:bg-[var(--color-graphite-100)]",
                    T_FAST,
                    FOCUS,
                  )}
                >
                  <FolderInput className="size-4 data-[size=sm]:size-4" strokeWidth={1.75} aria-hidden="true" />
                </button>
              }
            />
            {/* Each choice says what it does in plain words on a second line,
                because "New task" and "Travel" look like the same kind of
                answer and are not: one keeps these as steps, the other turns
                each into a task of its own. That difference is the whole
                design, so it is written down rather than left to be inferred
                from the rule. */}
            <DropdownMenuContent align="end" className="min-w-[16rem]">
                              <MenuHeading>
                  Move {selected.length} step{selected.length === 1 ? "" : "s"} to
                </MenuHeading>
                <DropdownMenuItem
                  onClick={() => {
                    move({ kind: "new-task" })
                    exit()
                  }}
                >
                  <DestinationChoice
                    icon={ListPlus}
                    name="A new task"
                    detail={
                      selected.length === 1
                        ? "It stays a step inside it"
                        : "They stay steps inside it"
                    }
                  />
                </DropdownMenuItem>
              <DropdownMenuSeparator />
                              <MenuHeading>Or into a folder</MenuHeading>
                {folderLibrary().map((f) => (
                  <DropdownMenuItem
                    key={f.name}
                    onClick={() => {
                      move({ kind: "folder", name: f.name, color: f.color })
                      exit()
                    }}
                  >
                    <DestinationChoice
                      icon={folderMarkFor(f.name)}
                      color={f.color}
                      name={f.name}
                      detail={
                        selected.length === 1
                          ? "It becomes a task of its own"
                          : "Each becomes a task of its own"
                      }
                    />
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  label="New folder"
                  onClick={() => {
                    onStepsToNewFolder(task.id, [...selected])
                    exit()
                  }}
                >
                  <DestinationChoice
                    icon={FolderPlus}
                    name="New folder…"
                    detail={
                      selected.length === 1
                        ? "Name it, and it becomes a task there"
                        : "Name it, and each becomes a task there"
                    }
                  />
                </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>
      </Reveal>
    </div>
  )
}

/*
Attachments, and what "viewable" means.

People can attach images, GIFs, video and more or less any file, with the
viewable ones openable in place, and the design question underneath it is the
one worth being precise about: **viewable is a decision the server makes, not a
property of the file's name.**

Three tiers, and every file lands in exactly one:

- **Shown**: images and video. A thumbnail in the list, and the thing itself
  when opened, inline, without leaving the task.
- **Openable**: PDFs, and anything the browser can render in a viewer. Not
  thumbnailed here, opened in place when asked.
- **Handed over**: everything else. An icon, a name, a size, a download. No
  pretence that Dana can show you a .docx.

The trap, recorded because it is the one that turns an attachment feature into a
security incident: a file's declared type is supplied by whoever uploaded it,
and an SVG or an HTML file served inline from Dana's own origin runs as Dana.
The type has to be decided by sniffing the bytes server-side, SVG has to be
treated as a document rather than an image unless it is sanitised, and anything
in the third tier has to be served with Content-Disposition: attachment. This is
why `kind` above is a small closed set rather than a MIME string.
*/

/* The three block types the card can hold. A closed set, deliberately: see
   the note on a Notion-style editor in this file's TaskCard comment. */
export type BlockKey = "steps" | "notes" | "attachments"

const ATTACHMENT_ICON: Record<
  NonNullable<ConceptTask["attachments"]>[number]["kind"],
  LucideIcon
> = {
  image: ImageIcon,
  video: Video,
  document: FileText,
  file: Paperclip,
  /* The same glyph the "From a link" action wears, because it is the same
     idea at rest that the action was about. */
  link: Link2,
}


type Attachment = NonNullable<ConceptTask["attachments"]>[number]

/* Which of the four kinds a file is. Deliberately a small closed set rather
   than a MIME type: a server has to decide this by sniffing the bytes anyway,
   because a browser will happily run a script a client labelled image/png. The
   client never sees a type it might trust. */
function kindOf(type: string): Attachment["kind"] {
  if (type.startsWith("image/")) return "image"
  if (type.startsWith("video/")) return "video"
  if (type === "application/pdf" || type.startsWith("text/")) return "document"
  return "file"
}

function readableSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/* Adding a file in the browser. A chosen file becomes an object URL so an image
   previews exactly as a served thumbnail would; a pasted address is taken at
   its word, because the client cannot fetch one without a server and should not
   pretend it did.

   None of this is storage: there is no upload path, quota, permission rule or
   virus story behind it here. */
function AttachmentPicker({ onAdd }: { onAdd: (files: Attachment[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState("")
  const [showUrl, setShowUrl] = useState(false)

  function takeFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    onAdd(
      Array.from(list).map((file) => {
        const kind = kindOf(file.type)
        return {
          name: file.name,
          meta: `${file.type.split("/")[1]?.toUpperCase() ?? "FILE"} · ${readableSize(file.size)}`,
          kind,
          preview: kind === "image" ? URL.createObjectURL(file) : undefined,
        }
      }),
    )
  }

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      /* Dropping onto the block is the gesture people try first, so it is the
         one that must not silently fail. */
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        takeFiles(event.dataTransfer.files)
      }}
    >
      <input
        ref={input}
        type="file"
        multiple
        className="sr-only"
        onChange={(event) => {
          takeFiles(event.target.files)
          event.target.value = ""
        }}
      />
      {/*
      Two ways in, dressed as one control repeated.

      "From a link" and "Add a file" are two peers doing the same job, putting
      something on this task, so they share height, ink, glyph slot, hover and
      width. `EmptyAction` takes the two props that difference actually needs (a
      glyph other than the plus, and the choice not to be the whole row) rather
      than the row growing a second button styled to match by hand. The link
      keeps the paperclip's cousin, because here the second glyph is naming
      *which way in*, not repeating the block's own icon.
       */}
      <div className="flex items-center gap-1">
        <EmptyAction
          label="Add a file"
          fill={false}
          onSelect={() => input.current?.click()}
        />
        <EmptyAction
          label="From a link"
          icon={Link2}
          fill={false}
          expanded={showUrl}
          onSelect={() => setShowUrl((open) => !open)}
        />
      </div>

      {showUrl ? (
        <form
          className="mt-1 flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmed = url.trim()
            if (!trimmed) return
            /* A URL with no scheme is still a link a person meant, they
               pasted `example.com/thing` because that is what they copied,
               and an anchor with no scheme resolves against this app, which
               would take them nowhere. */
            const href = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
              ? trimmed
              : `https://${trimmed}`
            let host = trimmed
            let path = ""
            try {
              const parsed = new URL(href)
              host = parsed.hostname.replace(/^www\./, "")
              path = parsed.pathname.split("/").filter(Boolean).pop() ?? ""
            } catch {
              /* Not parseable: show what they typed rather than guessing. */
            }
            const image = /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(trimmed)
            onAdd([
              {
                /* The last path segment reads like a title where there is
                   one; otherwise the host is the most useful name there is.
                   "https://" as a name tells you nothing. */
                name: decodeURIComponent(path) || host,
                meta: host,
                kind: "link",
                url: href,
                preview: image ? href : undefined,
              },
            ])
            setUrl("")
            setShowUrl(false)
          }}
        >
          <Input
            value={url}
            autoFocus
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Paste a link"
            aria-label="Attachment link"
            className={cn(
              "h-8 min-w-0 flex-1 rounded-md border border-[var(--color-graphite-300)] bg-card px-2 text-[13px] leading-5 outline-none",
              "placeholder:text-[var(--color-graphite-400)] focus-visible:border-[var(--color-dana-accent-600)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-100)]",
            )}
          />
          <button
            type="submit"
            className={cn(
              "h-8 shrink-0 rounded-md bg-[var(--color-graphite-900)] px-2.5 text-[12px] leading-4 font-medium text-white transition-colors hover:bg-[var(--color-graphite-800)]",
              T_FAST,
              FOCUS,
            )}
          >
            Add
          </button>
        </form>
      ) : null}
    </div>
  )
}

function AttachmentList({ files }: { files: NonNullable<ConceptTask["attachments"]> }) {
  const [openName, setOpenName] = useState<string | null>(null)

  return (
    <div className="flex flex-col">
      {files.map((file) => {
        const Icon = ATTACHMENT_ICON[file.kind]
        const viewable = file.kind === "image" || file.kind === "video"
        const isOpen = openName === file.name
        /*
        A link is an anchor, not a button: a pasted link must show as an
        openable link, not as a downloadable asset.

        Being a real `<a>` rather than a button styled like one is what makes
        middle-click, ⌘-click, "copy link address" and the browser's own status
        bar work, none of which a button can fake, and all of which people
        expect from something that says it is a link.
        */
        const Row = file.url ? "a" : "button"
        const rowProps = file.url
          ? ({
              href: file.url,
              target: "_blank",
              /* `noreferrer` implies `noopener`; both are here because the
                 page being opened is one a person pasted and nothing about
                 it is ours to trust. */
              rel: "noreferrer noopener",
              onClick: (event: React.MouseEvent) => event.stopPropagation(),
            } as const)
          : ({
              type: "button" as const,
              onClick: (event: React.MouseEvent) => {
                event.stopPropagation()
                if (viewable) setOpenName(isOpen ? null : file.name)
              },
            } as const)

        return (
          <div key={file.name}>
            <Row
              {...rowProps}
              className={cn(
                "flex h-11 w-full items-center gap-2.5 rounded-md px-1 text-left transition-colors hover:bg-[var(--color-graphite-50)]",
                T_FAST,
                FOCUS,
              )}
            >
              {/* A thumbnail where there is something to see, a type mark
                  where there is not. The two are the same size so the list
                  keeps one left edge. */}
              {file.preview ? (
                <span className="relative size-8 shrink-0 overflow-hidden rounded-[5px] border border-[var(--color-graphite-200)]">
                  <img src={file.preview} alt="" className="size-full object-cover" />
                  {file.kind === "video" ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Play
                        className="size-3.5 fill-[var(--color-fixed-white)] text-[var(--color-fixed-white)] drop-shadow"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[5px] border border-[var(--color-graphite-200)] bg-[var(--color-graphite-50)]">
                  <Icon
                    className="size-4 text-[var(--color-graphite-500)]"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-[var(--color-graphite-800)]">
                  {file.name}
                </span>
                <span className="block text-[12px] leading-4 text-[var(--color-graphite-400)]">
                  {file.meta}
                </span>
              </span>
              {/* What pressing it will do, said in the word for that thing.
                  A link opens, and carries the mark every other "this leaves
                  here" control in Dana carries. */}
              <span className="flex shrink-0 items-center gap-1 text-[12px] leading-4 text-[var(--color-graphite-400)]">
                {file.url ? (
                  <>
                    Open
                    <ArrowUpRight
                      className="size-3 data-[size=sm]:size-3"
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                  </>
                ) : viewable ? (
                  isOpen ? "Hide" : "View"
                ) : (
                  "Download"
                )}
              </span>
            </Row>
            {/* Only a file that can actually be shown gets a viewer. The
                guard is on `preview` rather than on `kind` because a viewable
                kind with no generated preview is a real state, the thumbnail
                job can fail or still be queued, and rendering an <img> with
                no source produces a broken frame rather than an honest row. */}
            {viewable && file.preview ? (
              <Reveal open={isOpen}>
                <div className="px-1 pb-2">
                  <img
                    src={file.preview}
                    alt={file.name}
                    /* The other variable-height picture a conversation draws,
                       reserved from 4.16's shape like the one in the thread
                       (issue #108). It matters more here, because this opens
                       inside a `Reveal` that animates to the height of its
                       contents: an unreserved image gives that animation a
                       height of zero to travel to and then jumps past it when
                       the bytes land.

                       No style where the file was never measured, rather than
                       a default shape: nothing is backfilled and every
                       attachment from before migration 0009 reports null, so
                       those must go on drawing at their own proportion. */
                    style={file.ratio === undefined ? undefined : { aspectRatio: file.ratio }}
                    className="w-full max-w-[320px] rounded-md border border-[var(--color-graphite-200)]"
                  />
                </div>
              </Reveal>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function TaskCard({
  task,
  patch,
  toggleStep,
  moveStep,
  moveStepsTo,
  duplicateSteps,
  removeSteps,
  setStepsDone,
  onNewFolder,
  onStepsToNewFolder,
  onExpand,
  openIn,
  chrome = "inline",
  onClose,
}: {
  task: ConceptTask
  patch: (id: string, fields: Partial<ConceptTask>) => void
  toggleStep: (id: string, index: number) => void
  moveStep: (id: string, from: number, to: number) => void
  /*
  **Optional.** A step promotes to a task; a task never demotes to a step.
  Promotion has one obvious destination, the step's own folder, and the promoted
  task is editable at once; demotion has none, because nothing says which task
  should become its parent. The menu this handler draws is already one-way in
  that sense, both of its destinations being a step becoming or joining a task.

  A step into a folder is `POST /tasks/:id/steps/:stepId/promote`, one
  transaction per step; steps into a new task are 7.6's create with the titles
  and 7.7's delete of the originals. `useCardWiring` hands this to
  `tasks/task-acts.ts`'s `moveStepsOut` where the row has an id and a folder,
  and leaves it undefined in the lab, where the control is then not drawn: an
  act with no handler does not appear.
  */
  moveStepsTo?: (
    id: string,
    indices: number[],
    destination:
      | { kind: "new-task" }
      | { kind: "folder"; name: string; color: string },
  ) => void
  duplicateSteps: (id: string, indices: number[]) => void
  removeSteps: (id: string, indices: number[]) => void
  setStepsDone: (id: string, indices: number[], done: boolean) => void
  onNewFolder: (ids: string[]) => void
  onStepsToNewFolder: (taskId: string, indices: number[]) => void
  onExpand?: () => void
  /* The row's "Open in…" strip, handed down so the footer offers the
     same choice rather than a single verdict. */
  openIn?: ReactNode
  /* "inline" under a row; "surface" inside the task page, where the
     surface's own chrome carries the views and the close. */
  chrome?: "inline" | "surface"
  onClose: () => void
}) {
  const timeFormat = useTimeFormat()
  /* The roster is the folder's members, see the assignee chip below and
     `components/task-row.tsx`'s own hoist of the same hook. */
  const roster = usePeopleLibrary(task.folder?.id ?? null)
  /* 9.3: reminder and repeat each "requires a due date". See the helper below
     the chip strip. */
  const undated = !task.due
  /*
  **INV-5 hides the assignee chip rather than disabling it.**

  9.3's field table: the assignee is "hidden in single-member folders (INV-5)",
  and AC-094 reads hidden as absent rather than visible and inoperable: a greyed
  chip is the wrong state, not a softer version of the right one.

  The set is `useMultiMemberFolderIds`, which the row layer uses for Q3's
  unassigned chip, so this is one read the chrome has already made rather than a
  second source.
  */
  const shared = useMultiMemberFolderIds()
  const assignable = task.folder?.id !== undefined && shared.has(task.folder.id)
  /*
  **9.3's move warning, which the folder chip has to ask.**

  "Moving keeps the unassign warning: 'Moving will unassign Sara; she isn't a
  member of Home.'" The choice is held until the destination's membership is
  known. `components/task-move-guard.tsx` carries the whole of the reasoning.
  */
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  /* 9.3's "Invite by email" on the assignee row, which the menu opens and
     `components/task-assignee-invite.tsx` performs. */
  const [inviting, setInviting] = useState(false)
  const counts = stepCount(task)
  const [order, setOrder] = useState<BlockKey[]>([
    "steps",
    "notes",
    "attachments",
  ])

  const blockDrag = useSortableList({
    count: order.length,
    onReorder: (from, to) => {
      setOrder((current) => {
        const next = [...current]
        const [moved] = next.splice(from, 1)
        if (moved) next.splice(to, 0, moved)
        return next
      })
    },
    describe: (index) => order[index] ?? "Block",
  })

  /* Grab the heading and drop it where you want it. There is no menu for this
     and there should not be: a list you can drag is understood without being
     explained, and a Move up item is what a design reaches for when it has not
     made dragging work. */
  function moveProps(key: BlockKey) {
    const index = order.indexOf(key)
    const state = blockDrag.itemState(index)
    return {
      itemRef: blockDrag.setItemRef(index),
      handle: blockDrag.handleProps(index),
      isActive: state.isActive,
      isSettling: state.isSettling,
      offset: state.offset,
    }
  }

  /* The card body is an ordered list of blocks rather than a fixed layout, so
     Notes can sit above Steps if that is how somebody thinks about this task.
     Order lives in component state here. Each block keeps its own open/closed
     state across a move because it is keyed, not positional. */
  const blocks: Record<BlockKey, ReactNode> = {
    steps: (
          <Disclosure
            key="steps"
            {...moveProps("steps")}
            icon={ListChecks}
            label="Steps"
            badge={counts ? `${counts.done}/${counts.total}` : undefined}
          >
            <StepList
              task={task}
              toggleStep={toggleStep}
              moveStep={moveStep}
              moveStepsTo={moveStepsTo}
              duplicateSteps={duplicateSteps}
              removeSteps={removeSteps}
              setStepsDone={setStepsDone}
              renameStep={(id, index, title) =>
                patch(id, {
                  steps: (task.steps ?? []).map((step, i) =>
                    i === index ? { ...step, title } : step,
                  ),
                })
              }
              addStep={(id, title) =>
                patch(id, {
                  steps: [...(task.steps ?? []), { title, done: false }],
                })
              }
              onStepsToNewFolder={onStepsToNewFolder}
            />
          </Disclosure>
    ),
    notes: (
          <Disclosure
            key="notes"
            {...moveProps("notes")}
            icon={AlignLeft}
            label="Notes"
          >
            {/* #221: the Task's own document, in the Folder canvas's writer.
                Loaded on first open so BlockNote stays out of the row's
                bundle; the plain-text notes stand in until it arrives. */}
            <Suspense fallback={task.notes ? <p className="whitespace-pre-wrap text-[12px] leading-5 text-[var(--color-graphite-700)]">{task.notes}</p> : null}>
              <TaskComposer taskId={task.id} folderId={task.folder?.id ?? null} notes={task.notes ?? null} />
            </Suspense>
          </Disclosure>
    ),
    attachments: (
          <Disclosure
            key="attachments"
            {...moveProps("attachments")}
            icon={Paperclip}
            label="Attachments"
            badge={task.attachments ? String(task.attachments.length) : undefined}
          >
            {task.attachments && task.attachments.length > 0 ? (
              <AttachmentList files={task.attachments} />
            ) : null}
            {/* The picker runs entirely in the browser: a chosen file is read
                into an object URL so an image actually previews. There is no
                storage, upload path or virus story behind it here. */}
            <AttachmentPicker
              onAdd={(added) =>
                patch(task.id, { attachments: [...(task.attachments ?? []), ...added] })
              }
            />
          </Disclosure>
    ),
  }

  return (
    <div className="flex flex-col gap-3 pt-1 pr-3 pb-3 pl-7">
      {/* One header strip, not five rows, and the only shaded thing in the
          card. The shade is doing what the removed rules were not: it groups
          the five short values into one object by filling a region rather than
          by drawing an edge, which is why it can be the single exception to
          the no-lines rule without reopening it. It also earns its keep twice,
          because the chips turn white on hover and a white chip needs
          something to be white against. */}
      <div className="flex flex-wrap items-center gap-0.5 rounded-lg bg-[var(--color-graphite-50)] px-1.5 py-1.5">
        <PropChip
          icon={folderMarkFor(task.folder?.name)}
          field={CHIP_FOLDER}
          value={folderNameOf(task.folder?.name)}
          color={task.folder?.color}
          muted={!task.folder}
          /* The real folder library, not a constant. */
          items={folderLibrary().map((f) => ({
            key: f.name,
            label: (
              <span className="inline-flex items-center gap-2">
                <FolderMark
                  name={f.name}
                  color={f.color}
                  className="size-4 data-[size=sm]:size-4"
                />
                {f.name}
              </span>
            ),
            onSelect: () => setPendingMove(f),
          })).concat(newFolderChoice(() => onNewFolder([task.id])))}
        />
        {/*
        **The roster is `lib/people-library.ts`'s.**

        Dana's roster is the *folder's members*, because 4.4 makes assignment a
        membership fact and 10.2 refuses an assignee who is not one, so offering
        a connection outside the folder would draw a menu whose entries the
        server rejects. 9.3 says the same in its field table: "the target
        folder's members". The names are the People screen's names.

        An unassigned task draws no face, and 9.3 makes the empty value
        "Unassigned", which `lib/people-library.ts` records as "a member of the
        set, not the absence of one".
         */}
        {!assignable ? null : (
        <PropChip
          icon={UserRound}
          field={CHIP_ASSIGNEE}
          {...(task.assignee ? { avatar: task.assignee } : {})}
          value={task.assignee?.name ?? "Unassigned"}
          muted={!task.assignee}
          items={roster.map((person) => ({
            key: person.name,
            label: (
              <span className="inline-flex items-center gap-2">
                <Face person={person} className="size-4 data-[size=sm]:size-4" />
                {person.name}
              </span>
            ),
            onSelect: () => patch(task.id, { assignee: person }),
          })).concat(
            /*
            **9.3's assignee row ends the way the section says.**

            The row is "the target folder's members plus 'Invite by email', and
            'Unassigned', offered last after a separator". Without Unassigned
            there would be no way back out at all, a closed set in its plainest
            form.

            The row's own `ChipMenu` draws both: the way out of a list belongs
            at its end. This is that list on the card, so it ends the same way,
            and AC-220 reads the order rather than only the set.

            **The invite is offered and not performed here**: 7.5's invite is a
            folder membership act with its own surface at 9.8, and composing one
            out of a chip would be a second invite path. It routes to the same
            place the row's does, which is nowhere yet, so it is not drawn.
            */
            [
              {
                key: "__invite",
                label: <span>{INVITE_BY_EMAIL}</span>,
                onSelect: () => setInviting(true),
              },
              {
                key: "__unassigned",
                /* `null` and not `undefined`, issue #169: undefined is "this
                   field was not touched", so the press cleared the chip here
                   and sent nothing, and the assignment came back on the next
                   read. `tasks/task-model.ts` carries the three values. */
                label: <span>{UNASSIGNED}</span>,
                onSelect: () => patch(task.id, { assignee: null }),
              },
            ],
          )}
        />
        )}

        {/* The three pickers that answer a question about time. Each opens on
            the handful of answers that cover most tasks and keeps its exact
            controls below a hairline; see the block above DuePanel. */}
        <PickerChip
          /* The due field keeps one glyph in every state; `color` says late. */
          icon={CalendarDays}
          tooltip="Due date and time"
          field={CHIP_DUE}
          value={dueChipValue(task)}
          muted={!task.due}
          color={task.due?.overdue ? "var(--color-danger-700)" : undefined}
        >
          <DuePanel task={task} patch={patch} />
        </PickerChip>

        <PickerChip
          icon={Bell}
          tooltip="Reminder"
          field={CHIP_REMINDER}
          value={reminderChipValue(task, timeFormat)}
          muted={!task.reminder}
          disabled={undated}
        >
          <ReminderPanel task={task} patch={patch} />
        </PickerChip>

        <PickerChip
          icon={Repeat2}
          tooltip="Repeat"
          field={CHIP_REPEAT}
          muted={!task.recurrence}
          value={repeatSummary(task)}
          disabled={undated}
        >
          <RepeatPanel task={task} patch={patch} />
        </PickerChip>
      </div>

      {inviting && task.folder?.id !== undefined ? (
        <TaskAssigneeInvite
          folderId={task.folder.id}
          folderName={task.folder.name}
          onDone={() => setInviting(false)}
        />
      ) : null}

      <TaskMoveGuard
        pending={pendingMove}
        /* The guard asks who would be stranded, and both of #169's empties
           are "nobody", which is the same question a `Face` asks. */
        assignee={task.assignee ?? undefined}
        onProceed={(folder, stranded) => {
          setPendingMove(null)
          patch(task.id, {
            folder,
            /*
            7.6 unassigns on a move that strands the assignee (4.4, INV-5), so
            the card says so rather than letting the row learn it from the next
            read.

            **`undefined` here and not #169's `null`, which is the one place in
            this file the two must stay apart.** The move is the server's own
            unassign: `domain/tasks.ts` drops an assignee the target does not
            hold and *forces* the single member where the target has one. An
            explicit null is a different request, and INV-5's unassign guard
            answers it 409 in exactly that single-member folder, which is the
            commonest destination a move strands somebody into. So this says
            "move it" and lets 7.6 do what 7.6 does; the local copy reads the
            absent assignee as nobody either way.
            */
            ...(stranded ? { assignee: undefined } : {}),
          })
        }}
        onCancel={() => setPendingMove(null)}
      />

      {order.map((key) => blocks[key])}

      {/* #225: absent-looking until used; `task-dependencies.tsx` carries why. */}
      <TaskDependencies
        taskId={task.id}
        folderId={task.folder?.id}
        section={(badge, body) => (
          <Disclosure icon={Workflow} label="Dependencies" badge={badge}>
            {body}
          </Disclosure>
        )}
      />

      {/* Comments, pinned after the content blocks and outside their order.
          Steps, Notes and Attachments are what the task IS and may be arranged;
          the conversation is what people SAY about it, it reads
          bottom-up-most-recent like every thread anywhere, and a conversation
          filed between two content blocks would read as neither. */}
      <Disclosure
        icon={MessageSquare}
        label="Comments"
        badge={
          commentCount(task.comments) > 0
            ? String(commentCount(task.comments))
            : undefined
        }
      >
        <CommentsThread
          comments={task.comments ?? []}
          /* The composer's half of `comment.create`, which rides the task
             because a thread with nothing in it still has a composer (issue
             #268). Absent is the lab's answer, as everywhere else here. */
          canComment={task.canComment ?? true}
          onChange={(next) => patch(task.id, { comments: next })}
        />
      </Disclosure>

      {/* The provenance lines are in the footer; `CardFooter` carries the
          reasoning. */}
      <CardFooter taskId={task.id} onClose={onClose} onExpand={onExpand} openIn={openIn} chrome={chrome} />
    </div>
  )
}

/* The shell that lifts an expanded row out of the list. Shared, so that
   "expanded" looks like one idea across the four concepts that now carry it
   rather than four near-misses. *//* Two hooks both want the row.pointerdown: the selection.press timer and the
   drag.lift watcher. Spreading one object over the other silently keeps only
   the later handler, which is exactly how the task row ended up with a drag
   that never started, the bug this composes away. Everything else merges
   normally; only the collision is chained. */

/* Shared with the row, which draws the same avatar in its detail line and
   the same height animation when the card opens. They live here because the
   card is the bigger consumer; if a third surface needs them they should move
   somewhere neutral rather than be copied. */
/* The height animation.

   Not the 0fr-to-1fr grid trick: it does not survive every layout context, and
   in the shell a card with 318px of content computed a track of 0px and the row
   stayed shut. Not max-height either, which needs a guessed maximum and either
   clips a long note or spends the tail of its duration animating nothing. So
   the reveal measures.

   A ResizeObserver keeps the measurement true while the card is open: ticking a
   step, adding a note or opening a block changes the height underneath the
   animation, and a number captured once would clip whatever arrived after it. */
export function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  /* Mount on open, with an entrance rather than a height animation.

     Two clipping mechanisms fail in the shell while working in the lab:
     0fr-to-1fr resolves its track to zero, and a measured max-height is
     overridden to zero by something in that layout context even when set
     !important. So there is no clip: the card is in the tree when it is open
     and absent when it is not, so nothing is left able to collapse it.

     What this costs is the collapse animation: closing is immediate. Reopening
     the height animation needs the layout context understood first, which is a
     job with a screenshot in it. */
  if (!open) return null
  return (
    <div
      className={cn(
        "animate-in fade-in-0 slide-in-from-top-1 duration-[var(--duration-base)] ease-[var(--ease-enter)]",
      )}
    >
      {children}
    </div>
  )
}
