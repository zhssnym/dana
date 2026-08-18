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
  Check as CheckIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  Folder,
  FolderInput,
  FolderPlus,
  Folders,
  ListChecks,
  ListPlus,
  FileText,
  Film,
  GripVertical,
  History,
  Link2,
  Mail,
  Maximize2,
  Image as ImageIcon,
  MoreHorizontal,
  Paperclip,
  Pin,
  Play,
  Plus,
  Repeat2,
  Redo2,
  Share2,
  RotateCcw,
  Star,
  Trash2,
  Undo2,
  UserPlus,
  UserRound,
  X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Calendar, TimeRow, sameDay } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  formatTime,
  setTimeFormat,
  useTimeFormat,
  type TimeFormat,
} from "@/lib/time-format"
import {
  DAY_LONG,
  LAB_TODAY,
  MONTH_SHORT,
  FACE_HASSAN,
  FACE_IMRAN,
  FACE_SARA,
  FERN,
  FOLDERS,
  PEOPLE,
  TEAL,
  VIOLET,
  WEEKDAY_KEYS,
  WORKING_WEEK,
  addDays,
  dueChipValue,
  dueLabelFor,
  nextWeekday,
  ordinal,
  parseDueLabel,
  reminderChipValue,
  repeatAnchor,
  repeatShort,
  repeatSummary,
  shortDate,
  stepCount,
  type ConceptStep,
  type ConceptTask,
} from "@/lib/task-model"
import {
  DuePanel,
  PickerChip,
  PickerDivider,
  PickerOption,
  PickerSegments,
  ReminderPanel,
  RepeatPanel,
} from "@/components/task-pickers"
import {
  DestinationChoice,
  Face,
  IconAction,
  MenuHeading,
  Reveal,
  TaskCard,
  newFolderChoice,
} from "@/components/task-card"
import {
  Actions,
  Check,
  Chip,
  ChipMenu,
  ChipPicker,
  DetailChip,
  DetailWord,
  DueBit,
  ExpandButton,
  ExpandShell,
  FOCUS,
  FolderBit,
  META,
  PendingPanel,
  PersonBit,
  ROW,
  ROW_HOVER,
  T_BASE,
  T_FAST,
  TaskTitle,
  rowProps,
  useRowSelection,
  useTaskList,
  type PendingAction,
} from "@/components/task-row"
import { useSortableList } from "@/lib/use-sortable-list"
import { cn } from "@/lib/utils"

/* ---------------------------------------------------------------- data -- */

/* Fake thumbnails, drawn as inline SVG so the shared build stays a single file
   that asks the network for nothing. A real one is a server-generated preview;
   what is being judged here is the layout, not the picture. */
function thumb(from: string, to: string, marks: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/>${marks}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const SEATING_PLAN = thumb(
  "#e8e4f5",
  "#cfc6ea",
  '<g fill="none" stroke="#6b5ca5" stroke-width="2"><circle cx="20" cy="22" r="7"/><circle cx="44" cy="22" r="7"/><circle cx="20" cy="44" r="7"/><circle cx="44" cy="44" r="7"/></g>',
)

const VENUE_PHOTO = thumb(
  "#cfe3ef",
  "#8fb9d0",
  '<path d="M0 46l16-14 12 10 14-16 22 20v18H0z" fill="#4b7f9c"/><circle cx="46" cy="16" r="7" fill="#fdf3d0"/>',
)

const WALKTHROUGH = thumb(
  "#d8d9de",
  "#9fa2ab",
  '<circle cx="32" cy="32" r="15" fill="#2f3136" opacity=".72"/><path d="M28 24l12 8-12 8z" fill="#fff"/>',
)


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
    assignee: { initials: "IW", name: "Imran Wafa", image: FACE_IMRAN },
    steps: [
      { title: "Ask the venue for the final seating plan", done: true },
      { title: "Chase the four unanswered RSVPs", done: true },
      { title: "Confirm the numbers with the venue", done: false },
      { title: "Send the final count to the caterer", done: false },
      { title: "Pay the balance", done: false },
    ],
    attachments: [
      {
        name: "seating-plan-v3.png",
        meta: "PNG · 240 KB",
        kind: "image",
        preview: SEATING_PLAN,
      },
      {
        name: "venue-walkthrough.mp4",
        meta: "MP4 · 18.4 MB",
        kind: "video",
        preview: WALKTHROUGH,
      },
      { name: "caterer-quote.pdf", meta: "PDF · 96 KB", kind: "document" },
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
    assignee: { initials: "SK", name: "Sara", image: FACE_SARA },
    recurrence: true,
    attachments: [
      {
        name: "venue-photo.jpg",
        meta: "JPEG · 1.8 MB",
        kind: "image",
        preview: VENUE_PHOTO,
      },
      {
        name: "grant-application-draft-2.docx",
        meta: "Word · 1.2 MB",
        kind: "file",
      },
      { name: "budget-2026.xlsx", meta: "Excel · 88 KB", kind: "file" },
    ],
    notes: "Second draft is in the shared folder.",
  },
  {
    id: "t5",
    title: "Water the balcony plants",
    folder: { name: "Home", color: TEAL },
    due: { label: "Due today" },
    assignee: { initials: "HN", name: "Hassan", image: FACE_HASSAN },
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



function useConceptList() {
  const list = useTaskList(SAMPLE)
  const [pending, setPending] = useState<PendingAction | null>(null)

  /* The selection hook is created below this one and the drag needs to reach
     into it, so the call goes through a box that is filled in afterwards.
     Without it a drag lasting longer than the press threshold would arm the
     selection underneath itself, and you would arrive at the drop already in
     a mode you never asked for. */
  const cancelPress = useRef<() => void>(() => {})

  const drag = useSortableList({
    onLift: () => cancelPress.current(),
    count: list.tasks.length,
    onReorder: (from, to) => {
      const moved = list.tasks[from]
      const onto = list.tasks[to]
      if (moved && onto) list.reorder(moved.id, onto.id)
    },
    /* Resting on a row proposes a folder of the two. Nothing is destroyed on
       release: it opens the naming panel, which can be cancelled. DES-103. */
    onDwell: (from, to) => {
      const moved = list.tasks[from]
      const onto = list.tasks[to]
      if (moved && onto) {
        setPending({
          kind: "merge",
          ids: [moved.id, onto.id],
          titles: [moved.title, onto.title],
        })
      }
    },
    describe: (index) => list.tasks[index]?.title ?? "Task",
  })

  function requestPromote(task: ConceptTask) {
    setPending({
      kind: "promote",
      id: task.id,
      title: task.title,
      steps: task.steps?.length ?? 0,
    })
  }

  function confirm(name: string) {
    if (!pending) return
    if (pending.kind === "merge") list.groupIntoFolder(pending.ids, name)
    else if (pending.kind === "promote") list.taskToFolder(pending.id)
    else if (pending.kind === "folder-for")
      list.groupIntoFolder(pending.ids, name)
    else
      list.moveStepsTo(pending.taskId, pending.indices, {
        kind: "folder",
        name,
        color: "var(--color-folder-sky)",
      })
    setPending(null)
  }

  function requestNewFolder(ids: string[]) {
    setPending({ kind: "folder-for", ids })
  }

  function requestStepsToNewFolder(taskId: string, indices: number[]) {
    setPending({ kind: "steps-to-folder", taskId, indices })
  }

  const selection = useRowSelection({
    onMove: (ids, folder) => list.patchMany(ids, { folder }),
    onNewFolder: requestNewFolder,
    onBulk: (ids, fields) => list.patchMany(ids, fields),
    onDuplicate: list.duplicateTasks,
    onDelete: list.removeTasks,
  })
  cancelPress.current = selection.clearPress

  const panel = (
    <>
      {selection.bar}
      {pending ? (
        <PendingPanel
          pending={pending}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </>
  )

  return {
    ...list,
    drag,
    panel,
    requestPromote,
    requestNewFolder,
    requestStepsToNewFolder,
    selection,
  }
}


/* ------------------------------------------------------------ concept A -- */

/* ------------------------------------------------------------ concept E -- */
/* Editable chips: every fact is the control that changes it. */


function ConceptE() {
  const {
    tasks,
    patch,
    toggleStep,
    moveStep,
    moveStepsTo,
    duplicateSteps,
    removeSteps,
    setStepsDone,
    drag,
    panel,
    requestPromote,
    requestNewFolder,
    requestStepsToNewFolder,
    selection,
  } = useConceptList()
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div className="flex flex-col">
      {panel}
      {tasks.map((task, index) => {
        const isOpen = open === task.id
        const counts = stepCount(task)

        return (
          <ExpandShell
            key={task.id}
            open={isOpen}
            itemRef={drag.setItemRef(index)}
            drag={
              selection.selecting
                ? selection.selectProps(task.id)
                : rowProps(drag.surfaceProps(index), selection.selectProps(task.id))
            }
            {...drag.itemState(index)}
            isSelected={selection.selected.includes(task.id)}
            card={
              <TaskCard
                task={task}
                patch={patch}
                toggleStep={toggleStep}
                moveStep={moveStep}
                moveStepsTo={moveStepsTo}
                duplicateSteps={duplicateSteps}
                removeSteps={removeSteps}
                setStepsDone={setStepsDone}
                onNewFolder={requestNewFolder}
                onStepsToNewFolder={requestStepsToNewFolder}
                onClose={() => setOpen(null)}
              />
            }
            row={
              <div className={cn(ROW, !isOpen && ROW_HOVER)}>
                <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
                <TaskTitle
                  task={task}
                  onRename={(title) => patch(task.id, { title })}
                  heading={isOpen}
                  className={cn(T_BASE, isOpen && "font-semibold")}
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
                        <ListChecks className="size-4 data-[size=sm]:size-4" strokeWidth={1.75} aria-hidden="true" />
                        {counts.done}/{counts.total}
                      </Chip>
                    </ChipMenu>
                  ) : null}
                  {task.recurrence ? (
                    <ChipPicker
                      label="Repeat"
                      panel={<RepeatPanel task={task} patch={patch} />}
                    >
                      <Chip>
                        <Repeat2 className="size-4 data-[size=sm]:size-4" strokeWidth={1.75} aria-hidden="true" />
                      </Chip>
                    </ChipPicker>
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
                        <Pin className="size-4 data-[size=sm]:size-4" strokeWidth={1.75} aria-hidden="true" />
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
                              className="size-4 data-[size=sm]:size-4"
                              style={{ color: f.color }}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                            {f.name}
                          </span>
                        ),
                        onSelect: () => patch(task.id, { folder: f }),
                      })).concat(newFolderChoice(() => requestNewFolder([task.id])))}
                    >
                      <Chip>
                        <FolderBit folder={task.folder} />
                      </Chip>
                    </ChipMenu>
                  ) : null}
                  {task.assignee ? (
                    <ChipMenu
                      label="Assignee"
                      items={PEOPLE.map((person) => ({
                        key: person.name,
                        label: (
                          <span className="inline-flex items-center gap-2">
                            <Face person={person} className="size-4 data-[size=sm]:size-4" />
                            {person.name}
                          </span>
                        ),
                        onSelect: () => patch(task.id, { assignee: person }),
                      }))}
                    >
                      <Chip>
                        <PersonBit assignee={task.assignee} />
                      </Chip>
                    </ChipMenu>
                  ) : null}
                  {task.due ? (
                    <ChipPicker
                      label="Due date"
                      panel={<DuePanel task={task} patch={patch} />}
                    >
                      <Chip tone={task.due.overdue ? "danger" : "neutral"}>
                        {task.due.overdue ? (
                          <CircleAlert className="size-4 data-[size=sm]:size-4" strokeWidth={1.75} aria-hidden="true" />
                        ) : (
                          <CalendarDays className="size-4 data-[size=sm]:size-4" strokeWidth={1.75} aria-hidden="true" />
                        )}
                        {task.due.label}
                      </Chip>
                    </ChipPicker>
                  ) : null}
                  <span className="w-24">
                    <Actions
                      task={task}
                      onStar={() => patch(task.id, { important: !task.important })}
                      onMakeFolder={() => requestPromote(task)}
                      onRestore={() => patch(task.id, { abandoned: false })}
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
    describe: (t) => (t.recurrence ? repeatSummary(t) : null),
  },
  {
    key: "attachments",
    icon: Paperclip,
    name: "Attachments",
    describe: (t) =>
      t.attachments && t.attachments.length > 0
        ? `${t.attachments.length} attachment${t.attachments.length > 1 ? "s" : ""}`
        : null,
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


function VocabLegend() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-dashed border-[var(--color-graphite-300)] px-3 py-2">
      <span className="text-[12px] leading-4 font-semibold tracking-[0.09em] text-[var(--color-graphite-500)] uppercase">
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
            <Icon className="size-4 data-[size=sm]:size-4" strokeWidth={1.75} aria-hidden="true" />
            {entry.name}
            <span className="text-[var(--color-graphite-400)]">({entry.note})</span>
          </span>
        )
      })}
    </div>
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


function ConceptJ() {
  const {
    tasks,
    patch,
    toggleStep,
    moveStep,
    moveStepsTo,
    duplicateSteps,
    removeSteps,
    setStepsDone,
    drag,
    panel,
    requestPromote,
    requestNewFolder,
    requestStepsToNewFolder,
    selection,
  } = useConceptList()
  const [open, setOpen] = useState<string | null>(null)

  return (
    <>
      <VocabLegend />
      <div className="flex flex-col">
        {panel}
      {tasks.map((task, index) => {
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
          !task.attachments &&
          !task.abandoned

        return (
          <ExpandShell
            key={task.id}
            open={isOpen}
            itemRef={drag.setItemRef(index)}
            drag={
              selection.selecting
                ? selection.selectProps(task.id)
                : rowProps(drag.surfaceProps(index), selection.selectProps(task.id))
            }
            {...drag.itemState(index)}
            isSelected={selection.selected.includes(task.id)}
            card={
              <TaskCard
                task={task}
                patch={patch}
                toggleStep={toggleStep}
                moveStep={moveStep}
                moveStepsTo={moveStepsTo}
                duplicateSteps={duplicateSteps}
                removeSteps={removeSteps}
                setStepsDone={setStepsDone}
                onNewFolder={requestNewFolder}
                onStepsToNewFolder={requestStepsToNewFolder}
                onClose={() => setOpen(null)}
              />
            }
            row={
              <div
                className={cn(
                  "group/row grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center rounded-md pr-2 transition-[background-color,height]",
                  T_BASE,
                  /* A bare task costs one line, not two. The list's rhythm
                     becomes irregular in exchange, which is the thing to
                     judge: whether a column of mixed heights reads as
                     responsive or as ragged. */
                  bare ? "h-11" : "h-16",
                  !isOpen && ROW_HOVER,
                )}
              >
                <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
                <div className="flex min-w-0 flex-col gap-1">
                  <TaskTitle
                    task={task}
                    onRename={(title) => patch(task.id, { title })}
                    truncate={false}
                    heading={isOpen}
                    className={cn(T_BASE, isOpen ? "font-semibold" : "font-medium")}
                  />
                  {/* Editable, exactly as concept E's chips are. Making the
                      second line read-only would have handed E a win on a
                      question neither concept is actually asking: the two
                      differ on whether a row is one line or two, and nothing
                      else should differ with them.

                      Not rendered at all when there is nothing to put on it,
                      so a bare task is a one-line row rather than a two-line
                      row with a gap in it. */}
                  <div
                    hidden={bare}
                    className="-ml-1 flex min-w-0 items-center gap-1 overflow-hidden text-[12px] leading-4 text-[var(--color-graphite-500)]"
                  >
                    {task.due ? (
                      <ChipPicker
                        label="Due date"
                        panel={<DuePanel task={task} patch={patch} />}
                      >
                        <DetailChip tone={task.due.overdue ? "danger" : "neutral"}>
                          <DetailWord
                            icon={task.due.overdue ? CircleAlert : CalendarDays}
                            tone={task.due.overdue ? "danger" : "neutral"}
                          >
                            {task.due.label}
                          </DetailWord>
                        </DetailChip>
                      </ChipPicker>
                    ) : null}
                    {task.folder ? (
                      <ChipMenu
                        label="Folder"
                        items={FOLDERS.map((f) => ({
                          key: f.name,
                          label: (
                            <span className="inline-flex items-center gap-2">
                              <Folder
                                className="size-4 data-[size=sm]:size-4"
                                style={{ color: f.color }}
                                strokeWidth={1.75}
                                aria-hidden="true"
                              />
                              {f.name}
                            </span>
                          ),
                          onSelect: () => patch(task.id, { folder: f }),
                        })).concat(newFolderChoice(() => requestNewFolder([task.id])))}
                      >
                        <DetailChip>
                          <DetailWord icon={Folder} color={task.folder.color}>
                            <span className="truncate">{task.folder.name}</span>
                          </DetailWord>
                        </DetailChip>
                      </ChipMenu>
                    ) : null}
                    {task.assignee ? (
                      <ChipMenu
                        label="Assignee"
                        items={PEOPLE.map((person) => ({
                          key: person.name,
                          label: (
                            <span className="inline-flex items-center gap-2">
                              <Face person={person} className="size-4 data-[size=sm]:size-4" />
                              {person.name}
                            </span>
                          ),
                          onSelect: () => patch(task.id, { assignee: person }),
                        }))}
                      >
                        <DetailChip>
                          <span className="inline-flex min-w-0 shrink-0 items-center gap-1.5">
                            <Face person={task.assignee} className="size-3.5 data-[size=sm]:size-3.5" />
                            <span className="truncate">{task.assignee.name}</span>
                          </span>
                        </DetailChip>
                      </ChipMenu>
                    ) : null}
                    {counts ? (
                      <DetailChip interactive={false}>
                        <DetailWord icon={ListChecks}>
                          {counts.done}/{counts.total}
                        </DetailWord>
                      </DetailChip>
                    ) : null}
                    {task.recurrence ? (
                      <ChipPicker
                        label="Repeat"
                        panel={<RepeatPanel task={task} patch={patch} />}
                      >
                        <DetailChip>
                          <DetailWord icon={Repeat2}>{repeatShort(task)}</DetailWord>
                        </DetailChip>
                      </ChipPicker>
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
                        <DetailChip>
                          <DetailWord icon={Pin}>My Day</DetailWord>
                        </DetailChip>
                      </ChipMenu>
                    ) : null}
                    {task.attachments ? (
                      <DetailChip interactive={false}>
                        <DetailWord icon={Paperclip}>
                          {task.attachments.length}
                        </DetailWord>
                      </DetailChip>
                    ) : null}
                    {task.notes ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span>
                              <DetailChip>
                                <AlignLeft
                                  className="size-3.5 shrink-0 text-[var(--color-graphite-400)]"
                                  strokeWidth={1.75}
                                  aria-label="Has notes"
                                />
                              </DetailChip>
                            </span>
                          }
                        />
                        <TooltipContent side="top">{task.notes}</TooltipContent>
                      </Tooltip>
                    ) : null}
                    {task.abandoned ? (
                      <DetailChip interactive={false}>
                        <DetailWord icon={Ban}>Abandoned</DetailWord>
                      </DetailChip>
                    ) : null}

                  </div>
                </div>
                <div className="flex items-center justify-end pr-2">
                  <Actions
                    task={task}
                    onStar={() => patch(task.id, { important: !task.important })}
                      onMakeFolder={() => requestPromote(task)}
                      onRestore={() => patch(task.id, { abandoned: false })}
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
    </>
  )
}

/* ------------------------------------------------------------ concept D -- */

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

/*
Both rows, chosen from settings, with two lines as the default.

Imran's proposal, 2026-08-17, and it is a better answer than picking one —
but for a specific reason rather than because settings are always kind.

**A preference is cheap exactly when the options have converged, and expensive
when they have not.** These two rows arrived at the same rename, the same
expansion, the same card, the same chips, the same selection, the same drag
and the same motion. What is left between them is height and where the details
sit. So this is one layout switch over a single row component, not two
implementations — which is the only condition under which "make it a setting"
is not a way of avoiding a decision.

The costs are real and worth naming rather than discovering:

- **Every future row change has to be right in both.** That is a permanent tax
  on the most-touched component in the product.
- **The acceptance suite doubles at the seams.** Any criterion that asserts a
  row's geometry now has two answers, and the browser cases that measure
  height need to state which density they are in.
- **They will drift** unless somebody forbids it. The rule that keeps this
  affordable: *the two densities may differ in height and in where the details
  sit, and in nothing else.* The moment one grows a behaviour the other lacks,
  the tax stops being layout and starts being logic.

**Two lines as the default is the right way round.** A default should be the
one that is safe for somebody who has not thought about it, and the failure
modes are not symmetric: the cost of two lines is seeing fewer tasks at once,
which is visible and self-correcting — you scroll, you notice, you go and
change it. The cost of one line is a truncated title, which is invisible: you
do not know what you did not read. Defaulting to the mode whose downside
announces itself is the safer of the two.

**Where the preference lives** is the one open question. Held in the browser it
is Lane 1 and ships with the refresh, at the price of not following a person
between their laptop and their phone. Held on the account it follows them, and
needs a column and an endpoint — Lane 2. Recommended: ship it in the browser
now, and treat syncing it as a later and separate want, because a display
preference that resets on a new device is a small annoyance while waiting for
a backend is a large one.
*/
function ConceptSetting() {
  const [density, setDensity] = useState<"two" | "one">("two")
  const timeFormat = useTimeFormat()

  return (
    <div className="flex flex-col gap-4">
      {/* Drawn in the shape of Dana's own settings rows, so the proposal is
          judged where it would actually live rather than as a toolbar. */}
      <div className="flex min-h-14 items-center gap-4 rounded-lg border border-[var(--color-graphite-200)] px-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-5 font-medium text-foreground">
            Row density
          </p>
          <p className="mt-0.5 text-[12px] leading-4 text-[var(--color-graphite-500)]">
            Two lines shows the whole task name. One line shows more tasks at
            once.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Row density"
          className="flex shrink-0 items-center gap-0.5 rounded-md bg-[var(--color-graphite-100)] p-0.5"
        >
          {(
            [
              ["two", "Two lines"],
              ["one", "One line"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={density === value}
              onClick={() => setDensity(value)}
              className={cn(
                "rounded-[5px] px-2.5 py-1 text-[12px] leading-4 font-medium transition-[background-color,color]",
                T_FAST,
                FOCUS,
                density === value
                  ? "bg-card text-[var(--color-graphite-900)] shadow-[var(--elevation-0)]"
                  : "text-[var(--color-graphite-600)] hover:text-[var(--color-graphite-800)]",
              )}
            >
              {label}
              {value === "two" ? (
                <span className="ml-1 text-[var(--color-graphite-400)]">
                  default
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Time format, added 2026-08-18 at Imran's direction. It sits beside
          row density because they are the same kind of preference — how
          things are drawn, decided by the person, held in the browser — and
          because a settings page with one row in it teaches nothing about
          what the section is for.

          The pickers reach every hour and every minute whichever of these is
          chosen. This decides how a time is written down, and nothing else. */}
      <div className="flex min-h-14 items-center gap-4 rounded-lg border border-[var(--color-graphite-200)] px-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-5 font-medium text-foreground">
            Time format
          </p>
          <p className="mt-0.5 text-[12px] leading-4 text-[var(--color-graphite-500)]">
            How times are written across Dana. Both pickers offer the whole
            day either way.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Time format"
          className="flex shrink-0 items-center gap-0.5 rounded-md bg-[var(--color-graphite-100)] p-0.5"
        >
          {(
            [
              ["12", "12-hour", "5:30 PM"],
              ["24", "24-hour", "17:30"],
            ] as const
          ).map(([value, label, example]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={timeFormat === value}
              onClick={() => setTimeFormat(value)}
              className={cn(
                "rounded-[5px] px-2.5 py-1 text-[12px] leading-4 font-medium transition-[background-color,color]",
                T_FAST,
                FOCUS,
                timeFormat === value
                  ? "bg-card text-[var(--color-graphite-900)] shadow-[var(--elevation-0)]"
                  : "text-[var(--color-graphite-600)] hover:text-[var(--color-graphite-800)]",
              )}
            >
              {label}
              {/* The example is the control's real argument. "12-hour" is a
                  name; "5:30 PM" is the thing being chosen. */}
              <span className="ml-1.5 tabular-nums text-[var(--color-graphite-400)]">
                {example}
              </span>
              {value === "12" ? (
                <span className="ml-1 text-[var(--color-graphite-400)]">default</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {density === "two" ? <ConceptJ /> : <ConceptE />}
    </div>
  )
}

export const CONCEPTS: ConceptSpec[] = [
  {
    id: "S",
    name: "The setting",
    optimisesFor:
      "Not choosing. Both rows ship and the person picks, which works here only because the two converged on everything except height — this is one layout switch, not two implementations.",
    givesUp:
      "Every future change to the row has to be right in both, and any test that asserts a row's geometry now has two answers. It stays affordable only while the densities differ in height alone.",
    principle:
      "Two lines is the default because the failure modes are not symmetric. Seeing fewer tasks is visible and self-correcting; a truncated title is invisible, because you do not know what you did not read.",
    tryIt:
      "Flip the control. This is the setting as it would appear in Dana, not a toolbar for this page.",
    render: () => <ConceptSetting />,
  },
  {
    id: "E",
    name: "One line",
    optimisesFor:
      "Density. Everything fits on one 44px line, so a viewport holds sixteen tasks instead of eleven and a long list stays a list rather than a scroll.",
    givesUp:
      "The title. It truncates at about forty characters and it truncates while you are renaming it, because the details are sharing its line.",
    principle:
      "Fitts's law: the fastest target is the thing itself, which is why the details are the controls that change them. That is now true in both concepts, so it is no longer what separates them — the separation is height.",
    tryIt:
      "Click any chip to change it. Then read the second task's title, and go and read the same title in J.",
    render: () => <ConceptE />,
  },
  {
    id: "J",
    name: "Two lines",
    optimisesFor:
      "The title, which gets a full line of its own and therefore never truncates — at rest or while you are renaming it. The details move to a second line, in one shared icon vocabulary that reads the same here and inside the card this opens.",
    givesUp:
      "Height: 64px against 44px, so a viewport that held sixteen tasks holds eleven. That is the whole trade, and for somebody with a long list it may be the wrong one.",
    principle:
      "Proximity groups the second line to the title above, so the pair reads as one object with a caption. The second line is also what makes the vocabulary affordable: an icon can keep its word beside it, so the alphabet is learned by reading rather than by hovering — which is the objection the icon-only version could never answer on touch.",
    tryIt:
      "Read the second task's title, then read it in E. Rename it in both. The details here are editable exactly as E's are, so height is the only thing that differs.",
    render: () => <ConceptJ />,
  },
]
