/*
The task row and the list around it.

One line, one layout (the stored row-height preference is no longer read):
checkbox, title, muted meta, star. Pressing the row opens the task; the list
adds drag, the hold that makes a folder of two tasks, and Shift/Cmd-click
selection with its labelled bar. `useCardWiring` is shared with the task panel.
*/

import { InlineInput } from "./ui/inline-field.js"
import {
  FolderPlus,
} from "../lib/icons.js"
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"

import { FolderMark } from "./folder-mark.js"
import { folderLibrary } from "../lib/folder-library.js"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.js"
import { moveStepsOut } from "../tasks/task-acts.js"
import type { StepDestination } from "../tasks/task-acts.js"
import { COMPLETE_TASK, MARK_AS_NOT_DONE } from "./ui/copy.js"
import { useTaskWriter } from "../tasks/task-writer.js"
import {
  repeatShort,
  stepCount,
  type ConceptComment,
  type ConceptStep,
  type ConceptTask,
} from "../tasks/task-model.js"
import { useSortableList } from "../lib/use-sortable-list.js"
import type { SortableItemState } from "../lib/use-sortable-list.js"
import { cn } from "./ui/utils.js"
import { RowMeta } from "./task-meta.js"
import { CheckMark } from "./ui/checkbox.js"

/* --------------------------------------------------------------- motion, */

export const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
export const T_BASE = "duration-[var(--duration-base)] ease-[var(--ease-enter)]"

/* ------------------------------------------------------------ dragging, */
/*
Dragging a row, and the 1.5 second dwell that turns a reorder into a folder.

The interaction has two meanings and the dwell is what separates them. Move, and
you are reordering: the row follows the pointer and the rows it passes slide out
of its way, so where it will land is shown rather than described. Stop, and
after 1.5s over one row the release changes meaning, the two tasks become a
folder. A hidden mode is a bad idea unless the mode announces itself, so the
target row fills a bar over exactly the dwell duration and then says what
releasing will do. The bar is the only reason the delay is not a mystery.

Arming also relaxes the list back to its resting order, because rows still
holding a space open for a reorder you are no longer proposing would be lying
about what happens next.

The mechanics live in `lib/use-sortable-list.ts` rather than HTML5
drag-and-drop, whose drag image cannot be styled, whose `dragleave` fires on
crossing onto a child, and which has no auto-scroll and no touch. The same
engine drives the task rows, a card's steps and a card's blocks, so the gesture
is learned once.

Nothing is destroyed on drop. Releasing opens a panel that names the folder and
can be cancelled, because "I dragged one task slightly onto another" and "I want
a new folder" should not be the same gesture with no way back.
*/

export const DWELL_MS = 1500

/* What a folder-in-progress looks like.

   The countdown and the folder are the same object: a ring that closes over
   exactly the dwell duration around the folder mark it is closing on. You can
   tell what is about to happen without reading anything, and how long is left
   without looking anywhere else. When it completes the badge fills, which is a
   change of state rather than a change of volume. */
export function MergeBadge({ armed }: { armed: boolean }) {
  const [grown, setGrown] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const radius = 10
  const circumference = 2 * Math.PI * radius

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-1 transition-[background-color,transform]",
        T_FAST,
        armed
          ? "scale-[1.03] bg-primary text-primary-foreground"
          : "bg-background text-primary ring-1 ring-border",
      )}
    >
      <span className="relative flex size-6 shrink-0 items-center justify-center">
        {armed ? (
          <span aria-hidden="true" className="absolute inset-0 rounded-full bg-white/20" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            /* Rotated so the ring closes from twelve o'clock, which is where
               every progress ring anybody has seen starts. */
            className="absolute inset-0 size-6 -rotate-90"
          >
            <circle
              cx="12"
              cy="12"
              r={radius}
              fill="none"
              strokeWidth="2"
              className="stroke-border"
            />
            <circle
              cx="12"
              cy="12"
              r={radius}
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              className="stroke-primary"
              style={{
                strokeDasharray: circumference,
                strokeDashoffset: grown ? 0 : circumference,
                transition: `stroke-dashoffset ${DWELL_MS}ms linear`,
              }}
            />
          </svg>
        )}
        <FolderPlus
          className={cn(
            "size-3.5",
            armed ? "text-primary-foreground" : "text-primary",
          )}
          strokeWidth={2}
          aria-hidden="true"
        />
      </span>
      <span className="text-xs font-medium whitespace-nowrap">
        {armed ? "Release to make a page" : "Hold to make a page"}
      </span>
    </span>
  )
}


export type PendingAction =
  | { kind: "merge"; ids: string[]; titles: string[] }
  | { kind: "promote"; id: string; title: string; steps: number }
  /* Every list of folders ends in "New folder…", so wanting one never means
     leaving what you were doing to go and make it first. All three arrive
     here, at the same naming panel, so a new folder is created one way rather
     than three. */
  | { kind: "folder-for"; ids: string[] }
  | { kind: "steps-to-folder"; taskId: string; indices: number[] }

/* The panel both gestures land in. Deliberately not a dialog: the point of
   these two ideas is that you never leave the list.

   The folder is drawn, what goes into it is shown as the things themselves
   rather than described in a sentence, and there is always a name in the field.
   The suggestion is a real name, the two titles have a shared word often enough
   to be worth trying, and it is selected on open, so Enter accepts and typing
   replaces. Nothing starts disabled. */
export function suggestFolderName(pending: PendingAction) {
  if (pending.kind === "promote") return pending.title
  if (pending.kind !== "merge") return "New page"

  /* The longest word both titles share, if there is one. "Book the venue" and
     "Pay the venue deposit" are obviously a venue folder, and a person who is
     handed that guess spends no time at all on the part they did not come
     here to do. */
  const words = (title: string) =>
    title
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((word) => word.length > 3)
  const first = words(pending.titles[0] ?? "")
  const shared = words(pending.titles[1] ?? "").filter((word) => first.includes(word))
  const best = shared.sort((a, b) => b.length - a.length)[0]
  return best ? best.charAt(0).toUpperCase() + best.slice(1) : "New page"
}

export function PendingPanel({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingAction
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(() => suggestFolderName(pending))

  const destroys = pending.kind === "promote"
  const going: string[] =
    pending.kind === "merge"
      ? pending.titles
      : pending.kind === "promote"
        ? [`${pending.steps} step${pending.steps === 1 ? "" : "s"} become tasks`]
        : pending.kind === "folder-for"
          ? [`${pending.ids.length} task${pending.ids.length === 1 ? "" : "s"}`]
          : [
              `${pending.indices.length} step${
                pending.indices.length === 1 ? " becomes a task" : "s become tasks"
              }`,
            ]

  return (
    <div
      className={cn(
        "mb-2 overflow-hidden rounded-md bg-background ring-1 ring-border",
        T_BASE,
      )}
    >
      <div className="flex items-start gap-3 px-3 pt-3">
        {/* The folder mark, the same one the dwell badge closes its ring
            around, so the gesture and its panel are visibly one thing. */}
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <FolderPlus
            className="size-4 text-primary"
            strokeWidth={2}
            aria-hidden="true"
          />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {destroys ? "Turn this task into a page" : "New page"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {destroys
              ? "The task itself stops existing. This cannot be undone from here."
              : "Nothing is changed except where these live."}
          </p>

          <InlineInput
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter" && name.trim()) onConfirm(name.trim())
              if (event.key === "Escape") onCancel()
            }}
            placeholder="Page name"
            aria-label="Page name"
            className={cn(
              "mt-2.5 h-9 w-full rounded-sm border border-border bg-background px-2.5 text-sm text-foreground outline-none",
              "placeholder:text-muted-foreground focus-visible:border-primary",
            )}
          />

          {/* What goes in, shown rather than counted. A person checking they
              grabbed the right two tasks should be able to read the two
              titles, which a sentence saying "2 tasks" cannot do. */}
          <ul className="mt-2 flex flex-col gap-1">
            {going.map((line, index) => (
              <li
                key={`${line}-${index}`}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <span
                  aria-hidden="true"
                  className="ml-1 size-1.5 shrink-0 rounded-full bg-border"
                />
                <span className="truncate">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1 bg-muted px-3 py-2">
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            "rounded-sm px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
            T_FAST,
          )}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => onConfirm(name.trim())}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-[background-color,transform] hover:bg-primary/90 active:scale-95 disabled:pointer-events-none disabled:opacity-40",
            T_FAST,
          )}
        >
          <FolderPlus className="size-3.5" strokeWidth={2} aria-hidden="true" />
          {destroys ? "Convert" : "Create page"}
        </button>
      </div>
    </div>
  )
}

/* Everything a concept needs: the task list, the drag layer, and the panel
   both folder gestures land in. Shared so that dragging behaves identically in
   every concept, for the same reason renaming does, a comparison should
   measure the row, not which concept got the better drag. */
/*
Selecting task rows: Shift-click or Cmd/Ctrl-click a row to add it, and while
a selection is held a plain click adds or removes too. Escape, "Clear", or
emptying the selection leaves. The bar says every act in words.

Dragging is suspended while selecting, because the list cannot serve both.
*/
export type BulkDate = "today" | "tomorrow" | "next-week" | null

export function useRowSelection({
  onMove,
  onNewFolder,
  onBulk,
  onDate,
  onDelete,
}: {
  /* The choice carries the folder id a PATCH /tasks/:id body names it by. */
  onMove: (ids: string[], folder: { id: string; name: string; color: string }) => void
  onNewFolder: (ids: string[]) => void
  onBulk: (ids: string[], fields: Partial<ConceptTask>) => void
  /* Absent in a list with nowhere to write a date; the bar then offers none. */
  onDate?: (ids: string[], when: BulkDate) => void
  /* Accepted from old call sites; the bar no longer offers Duplicate. */
  onDuplicate?: (ids: string[]) => void
  onDelete: (ids: string[]) => void
}) {
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  /* A modified press is a selection, never a tap that opens the task. The
     drag engine reports the tap on pointerup, before the click lands. */
  const modifiedPress = useRef(false)

  useEffect(() => {
    if (!selecting) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") exit()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selecting])

  function exit() {
    setSelecting(false)
    setSelected([])
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
      setSelecting(next.length > 0)
      return next
    })
  }

  const modified = (event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) =>
    event.shiftKey || event.metaKey || event.ctrlKey

  function selectProps(id: string) {
    return {
      onPointerDown: (event?: ReactPointerEvent) => {
        modifiedPress.current = event !== undefined && modified(event)
      },
      /* Shift-click would otherwise extend a text selection across the rows. */
      onMouseDown: (event: ReactMouseEvent) => {
        if (modified(event)) event.preventDefault()
      },
      onClick: (event: ReactMouseEvent) => {
        if ((event.target as HTMLElement).closest('button, a, input, [role="checkbox"]')) return
        if (modified(event)) {
          event.preventDefault()
          toggle(id)
          return
        }
        if (selecting) toggle(id)
      },
    }
  }

  /* Read once by the list's opener: true when the press it is about to treat
     as a tap was a modified one. */
  function takeModifiedPress() {
    const was = modifiedPress.current
    modifiedPress.current = false
    return was
  }

  const count = selected.length
  const act = cn(
    "h-7 rounded-sm px-2 text-sm whitespace-nowrap text-foreground transition-colors hover:bg-muted data-popup-open:bg-muted",
    T_FAST,
  )

  const bar = (
    selecting ? (
      <div
        role="toolbar"
        aria-label="Selected tasks"
        /* Floating, so selecting never pushes the list it is selecting from. */
        className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] animate-in max-md:bottom-20 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 shadow-[var(--elevation-2)] duration-150 fade-in-0 slide-in-from-bottom-1"
      >
        <span className="mr-2 px-1 text-sm whitespace-nowrap text-muted-foreground">
          {count} selected
        </span>
        <button
          type="button"
          className={act}
          onClick={() => {
            onBulk(selected, { done: true })
            exit()
          }}
        >
          Complete
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" className={act} />}>
            Move
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[14rem]">
            {folderLibrary().map((f) => (
              <DropdownMenuItem
                key={f.name}
                onClick={() => {
                  onMove(selected, f)
                  exit()
                }}
              >
                <FolderMark name={f.name} color={f.color} />
                {f.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onNewFolder(selected)
                exit()
              }}
            >
              <FolderPlus />
              New folder…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {onDate ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<button type="button" className={act} />}>
              Date
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(
                [
                  ["today", "Today"],
                  ["tomorrow", "Tomorrow"],
                  ["next-week", "Next week"],
                  [null, "No date"],
                ] as const
              ).map(([when, label]) => (
                <DropdownMenuItem
                  key={label}
                  onClick={() => {
                    onDate(selected, when)
                    exit()
                  }}
                >
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <button
          type="button"
          className={cn(act, "hover:text-destructive")}
          onClick={() => {
            onDelete(selected)
            exit()
          }}
        >
          Delete
        </button>
        <button type="button" className={cn(act, "text-muted-foreground")} onClick={exit}>
          Clear
        </button>
      </div>
    ) : null
  )

  return {
    selecting,
    selected,
    selectProps,
    takeModifiedPress,
    /* Nothing to cancel any more; kept so the drag engine's lift hook stays wired. */
    clearPress: () => {},
    bar,
  }
}

/* --------------------------------------------------------------- pieces, */

export function Check({
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
      /*
      9.1's names table gives this control exactly two names: "Complete task"
      when open, "Mark as not done" when complete. Naming the task instead
      ("Complete {title}") would name the task rather than the act. The strings
      are `ui/copy.ts`'s, transcribed once for the whole client.
      */
      aria-label={done ? MARK_AS_NOT_DONE : COMPLETE_TASK}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className="flex size-[var(--control-height)] items-center justify-center rounded-sm"
    >
      <CheckMark checked={done} className={cn("active:scale-90", !done && "hover:border-muted-foreground", task.abandoned && !done && "opacity-60")} />
    </button>
  )
}

export function rowProps(
  surface: { onPointerDown: (event: ReactPointerEvent) => void },
  select: ReturnType<ReturnType<typeof useRowSelection>["selectProps"]>,
) {
  return {
    ...select,
    onPointerDown: (event: ReactPointerEvent) => {
      select.onPointerDown(event)
      /* A modified press selects; it must not also arm a drag. */
      if (event.shiftKey || event.metaKey || event.ctrlKey) return
      surface.onPointerDown(event)
    },
  }
}

export function ExpandShell({
  open,
  row,
  card,
  drag,
  itemRef,
  isActive = false,
  isDwelling = false,
  isArmed = false,
  isSettling = false,
  offset = 0,
  isSelected = false,
  proposal,
}: {
  open: boolean
  row: ReactNode
  card: ReactNode
  drag?: Record<string, unknown>
  itemRef?: (element: HTMLElement | null) => void
  /* See the badge at the foot of this component. */
  proposal?: string
  isActive?: boolean
  isDwelling?: boolean
  isArmed?: boolean
  isSettling?: boolean
  offset?: number
  isSelected?: boolean
}) {
  /* The row being carried has to track the pointer exactly, so its transform
     cannot be on a transition, a row that eases towards the cursor reads as
     lag rather than as weight. Every other row is easing, because they are the
     ones making space and that movement is the whole message.

     Durations come from the tokens, so the reduced-motion block turns all of
     this off without this component knowing anything about it. */
  const carrying = isActive && !isSettling
  return (
    <div
      /*
      **The row is a list item.** 9.1's roles table fixes "A task row: a list
      item, or a row", and tests address exactly that,
      `getByRole('listitem').or(getByRole('row'))` filtered by the title.

      It goes on this element rather than on either row body inside it, because
      this is the element a list holds: the one the drag engine measures and
      moves, the one selection tints, and the one that grows to contain the card
      when a row expands. A role on the inner body would put the expanded card
      *outside* the list item that owns it, so a locator for "the row for this
      task" would stop finding the card the row opened into.

      The list around it is `TaskList`'s own container below, and for every page
      drawing rows through it, `pages/task-rows.tsx`'s `role="list"`.
      */
      role="listitem"
      ref={itemRef}
      {...drag}
      style={{
        transform: offset === 0 ? undefined : `translate3d(0, ${offset}px, 0)`,
        /* `scale` as its own property rather than inside `transform`, so the
           armed nudge can ease while the carried row keeps tracking the
           pointer on an untransitioned translate. Putting both in `transform`
           means one transition setting for two jobs, and the pointer job has
           to win. */
        scale: isActive && isArmed ? "0.985" : undefined,
        transition: carrying
          ? "box-shadow var(--duration-fast) var(--ease-standard), scale var(--duration-fast) var(--ease-standard)"
          : [
              "transform var(--duration-base) var(--ease-enter)",
              "scale var(--duration-fast) var(--ease-standard)",
              "background-color var(--duration-base) var(--ease-enter)",
              "box-shadow var(--duration-base) var(--ease-enter)",
              "border-color var(--duration-base) var(--ease-enter)",
              "margin var(--duration-base) var(--ease-enter)",
            ].join(", "),
        /* Above the rows it passes over, and above the one it may merge with,
           or the lift reads as sliding underneath the list. */
        zIndex: isActive ? 30 : undefined,
      }}
      className={cn(
        "relative rounded-sm",
        isSelected && "bg-primary/10",
        isActive && "cursor-grabbing bg-background shadow-[var(--elevation-2)]",
        isDwelling && !isArmed && "bg-muted ring-1 ring-border",
        isArmed && "bg-muted ring-2 ring-primary",
      )}
    >
      {row}
      {open ? card : null}
      {/* The badge rides the row being carried, not the row underneath it.

          On the target it would be invisible: the carried row sits at z-30
          directly under the pointer, which is exactly where the target's right
          edge is, so the countdown would be painted and then covered by the row
          that caused it. Fixing the stacking would put a tinted row on top of
          the one being dragged, which reads as the wrong thing moving.

          Riding the carried row is better than either: it is already on top,
          and it is already where the eyes are. */}
      {isActive && (isDwelling || isArmed) ? (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
          <MergeBadge armed={isArmed} />
        </span>
      ) : null}
      {/*
      What a release would do, said in words.

      The badge above is the merge proposal, for a row dragged onto another row.
      A row can also be dragged onto a *container*, a board column, and the rule
      is the same at both ends: a container takes the drop and says so, in words
      rather than an outline. AC-228 reads "Into {column}" while the pointer is
      still down.

      So the prop is drawn in the same slot as the merge badge and never at the
      same time as one: a row being merged is over another row and a row being
      placed is over a column, and the caller supplies whichever it knows about.
      It rides the carried row for the reason the comment above gives.
       */}
      {proposal === undefined ? null : (
        <span className="pointer-events-none absolute top-1/2 right-2 z-40 -translate-y-1/2 rounded-sm bg-foreground px-2 py-0.5 text-xs whitespace-nowrap text-background">
          {proposal}
        </span>
      )}
    </div>
  )
}

/* ------------------------------------------------------ the shipping row, */
/*
`TaskRow` is what the screens render: spread the task's fields, pass the
handlers.

**Where its state lives.** The screens own the facts they model: title,
completion, importance, My Day, folder, due, assignee, step counts. Those are
read from props every render, so a change made anywhere still flows down.
Everything the card can edit that the screen never modelled, notes, a reminder,
the recurrence rule, the step items themselves, is held here as a layer of local
edits on top.
*/

export type TaskStatus = "pending" | "completed" | "abandoned"

/* Where a task can be held once it leaves the list, the surface's five
   modes plus the tab strip. Owned here because the row is where the choice
   is offered; the surface imports it. */
export type TaskOpenMode = "dialog" | "right" | "tab"

export interface TaskRowProps {
  id?: string
  title: string
  /*
  Dana addresses a folder by id (7.4), and two things on this surface need one:
  the assignee menu, whose roster is 4.4's members of *that* folder, and every
  write that moves a task, which sends `folder_id`. So `id` is optional beside
  the name and colour, as on `ConceptTask.folder`: a card that sets a name and a
  colour still typechecks and still behaves, and a picker sets the id.

  `toConceptTask` below spreads this straight onto the concept task, so the id
  reaches the card without a second mapping.
  */
  folder?: { name: string; color: string; id?: string }
  /*
  Which section of its folder page this task sits in.

  A section is part of a task's address: carry the row anywhere else, open it in
  a dialog, look at it in Completed, and without this the section vanishes.

  It rides *after* the folder chip and reads as a path, because that is what it
  is: Travel › Venue & vendors. Absent when there is no section, and absent when
  the row is already sitting under that section's own heading, which the folder
  page decides per list rather than per row.
  */
  section?: string
  /*
  What the list around this row has already said.

  **A row says what its page does not.** Done shows no due date under headings
  that already group by when it was finished; Important draws no filled star on
  a page defined by the star; Carried over paints no date red on a block whose
  membership *is* being late. The section chip works the same way, absent when
  the row sits under that section's own heading.

  Decided per list, never per row: a row cannot see the heading above it, and a
  screen that had to remember this on every row is a screen that will forget on
  one.
  */
  given?: {
    /* Grouped by folder, or standing inside one. */
    folder?: boolean
    /* Grouped by person. */
    assignee?: boolean
    /* Grouped by date, or finished, where the deadline is spent. */
    due?: boolean
    /* Every row here is starred. */
    important?: boolean
    /* Every row here is late. */
    overdue?: boolean
  }
  due?: { label: string; overdue?: boolean }
  status?: TaskStatus
  important?: boolean
  importantTooltip?: string
  assignee?: { initials: string; name: string; image?: string; id?: string }
  pulled?: boolean
  steps?: { complete: number; total: number }
  recurrence?: string
  notes?: string
  /* The conversation the card shows, passed through untouched. Fixtures only,
     the screen has no message model behind this. */
  comments?: ConceptComment[]
  /*
  The parts of a task only its card shows: the steps themselves, the files, and
  anything the card learns to edit next.

  Dialog, sidebar and inline row are views of the same task, so the data inside
  them must be the same. A row's props carry a step *count*, because a count is
  all a row draws, so without this `toConceptTask` would have to invent steps
  from it ("Step 1", "Step 2") and a task could round-trip through the shell
  with its steps renamed. Attachments have no prop at all.

  One field rather than one per fact, deliberately: the card gains blocks over
  time and each new one would otherwise need a prop, a mapping and a line in the
  shell's patcher, three places to forget. The row spreads this last, so
  whatever the card knows how to edit survives being closed and reopened
  somewhere else.
  */
  detail?: Partial<ConceptTask>
  /*
  `visualState`, `showSecondaryActions` and `menuOpen` are deliberately not
  props: the row draws its own hover and focus, and a prop that cannot do
  anything is a dead control one level down. The previous row survives at
  `components/task-row-baseline.tsx` for anyone comparing.
  */
  /*
  `unassigned` and `invitePending` are props because they are driven by real
  data, Q3's chip and 7.4's pending invite, and section 9 is normative on both.
  The reasoning sits beside the two chips they draw, at the foot of `rowChips`.
  */
  unassigned?: boolean
  invitePending?: string
  /* #225: unfinished blockers, 7.25's `blocked_by_count`. Absent or 0 draws
     nothing, so an ordinary row carries no dependency chrome at all. */
  blockedBy?: number
  /* 9.5's from half. The person who made this task, drawn only where the page
     asks. See the chip at the foot of `rowChips`. */
  createdBy?: string
  /* What a release would do, drawn on the row being carried. See `ExpandShell`. */
  proposal?: string
  completionPreview?: boolean
  collapsing?: boolean
  /* Open the task somewhere other than in place: the row's own view strip
     and the card's full-screen action both speak through this, naming the
     surface they want. Bare calls mean "full". */
  onOpen?: (mode?: TaskOpenMode) => void
  /* Makes a folder holding this task, and names it. Supplied by TaskList, which
     owns the naming panel; absent for a row rendered outside one, and the chip
     then simply does not offer it rather than drawing a dead menu item. */
  onNewFolder?: () => void
  /* The write path out of the card. See `useCardWiring`: without it every
     edit lives and dies with the component, which is why a task opened in a
     surface could not be renamed. */
  onPatch?: (fields: Partial<ConceptTask>) => void
  /* Supplied by TaskList so a row can hand back its own opener; the list
     then taps into it. Never passed by a screen. */
  onRegisterOpen?: (open: (() => void) | null) => void
  onToggleComplete?: (completed: boolean) => void
  onToggleImportant?: () => void
  onRemoveFromMyDay?: () => void
  onAbandon?: () => void
  onDelete?: () => void
  /* List wiring, supplied by `TaskList` and by nothing else. A row rendered
     on its own, the states page does this, simply has none of it, and is
     the same row without a list around it to reorder within. */
  itemRef?: (element: HTMLElement | null) => void
  listProps?: Record<string, unknown>
  dragState?: {
    isActive: boolean
    isDwelling: boolean
    isArmed: boolean
    isSettling: boolean
    offset: number
  }
  isSelected?: boolean
  selecting?: boolean
  /* The task surface (sidebar, dialog, a tab) renders the row already expanded:
     the row is the task even there. */
  defaultOpen?: boolean
}

/* The shell's flat props into the shape the row and the card actually speak.
   Steps arrive as a count, because a count is all the shell ever stored; they
   are expanded into items so the card can show a real list, and the count in
   the row stays derived from those items so the two can never disagree. */
/* The presenter's frequency word back to the card's unit. A word that names
   none ("Repeats") leaves the unit unknown rather than guessing weekly. */
const REPEAT_UNIT_OF: Record<string, ConceptTask["repeatUnit"]> = {
  Daily: "day",
  Weekly: "week",
  Monthly: "month",
  Yearly: "year",
}

function toConceptTask(props: TaskRowProps): ConceptTask {
  const total = props.steps?.total ?? 0
  const complete = props.steps?.complete ?? 0
  const steps: ConceptStep[] | undefined = props.steps
    ? Array.from({ length: total }, (_, index) => ({
        title: `Step ${index + 1}`,
        done: index < complete,
      }))
    : undefined

  return {
    id: props.id ?? props.title,
    title: props.title,
    done: props.status === "completed",
    abandoned: props.status === "abandoned",
    folder: props.folder,
    due: props.due,
    assignee: props.assignee,
    pulled: props.pulled,
    important: props.important,
    notes: props.notes,
    /* Invented from the count, and only as a fallback: a lab fixture that
       says "2 of 5" has no titles to give. Anything the shell owns arrives
       through `detail` below and wins, so a real task keeps its real steps. */
    steps,
    comments: props.comments,
    recurrence: Boolean(props.recurrence),
    ...(REPEAT_UNIT_OF[props.recurrence ?? ""] === undefined
      ? {}
      : { repeatUnit: REPEAT_UNIT_OF[props.recurrence ?? ""] }),
    ...props.detail,
  }
}

/* The card's wiring, extracted so the task surface can hold the same task the
   row holds, one edits layer, one patch, one set of step handlers, whether the
   card sits under a row or fills a page. A surface that re-implemented any of
   this would be a second artifact wearing the first one's clothes. */
export function useCardWiring(props: TaskRowProps) {
  const [edits, setEdits] = useState<Partial<ConceptTask>>({})
  /*
  The server's steps win once they arrive. Local edits sit over the props for as
  long as the card is looked at, which is right for a title or a note and wrong
  for the one field whose server copy carries something the local copy cannot:
  7.7's ids, which `writeSteps` diffs by. Keyed on the list's content rather
  than its identity, because every render hands the card a fresh array and
  clearing on identity would drop a tick before its write had landed.
  */
  const serverSteps = JSON.stringify(props.steps ?? null)
  useEffect(() => {
    setEdits(({ steps: _dropped, ...rest }) => rest)
  }, [serverSteps])
  /* The shell's write path, reaching a row that nobody handed one to, see
     `tasks/task-writer`. A row given `onPatch` still wins. */
  const writer = useTaskWriter()

  /* Props first, local edits over the top. A completion made from the screen
     still reaches the row; a note typed into the card is not thrown away when
     the screen re-renders for some unrelated reason. */
  const task: ConceptTask = { ...toConceptTask(props), ...edits }
  const counts = stepCount(task)
  const steps = task.steps ?? []

  /*
  **Every edit is reported upward, not just completion.**

  Inside an inline row local state would be invisible, the row stays mounted, so
  the local copy *is* the task for as long as anyone is looking at it. A surface
  mounts per open and unmounts on close, so edits held only locally there would
  be discarded the instant it closed.

  `onPatch` is the one write path out. A screen that supplies it owns the task;
  one that does not keeps local-only behaviour, which is right for a lab or a
  preview with nowhere to write to.
  */
  /*
  Out to whoever owns the task: the handler if there is one, the shell's
  writer otherwise, and nowhere if there is neither.

  The local copy is still kept, and deliberately, an edit has to appear
  before it has travelled anywhere, or every keystroke would wait on a
  round trip through the screen above.
  */
  function report(fields: Partial<ConceptTask>) {
    if (props.onPatch) props.onPatch(fields)
    else if (writer && props.id) writer(props.id, fields)
  }

  function patch(_id: string, fields: Partial<ConceptTask>) {
    setEdits((current) => ({ ...current, ...fields }))
    /*
    **A status the screen owns is told to the screen and not also written from
    here.**

    Both ends are the API: `report` reaches `tasks/task-writer.tsx`, which turns
    `done` into 7.6's transition, and `onToggleComplete` reaches the page's own
    action, which does the same. Doing both would send two transitions for one
    press, and the second would answer 409.

    **Worse than the duplicate would be which one wins.** 9.5 puts a
    confirmation in front of un-completing a task that generated a successor,
    and the page is where that confirmation lives, because the page is what
    knows it is Done. The writer's transition does not wait for it, so the
    confirmation would be asked after the act it gates. AC-162: a declined
    un-complete leaves the completed row completed.

    So where a screen supplies the handler, the screen owns the act. A surface
    supplies none of these, so the writer carries them there.
    */
    const owned = { ...fields }
    if (props.onToggleComplete !== undefined) delete owned.done
    /*
    **Abandon is not stripped, and the asymmetry is the point.** A screen is
    *told* about a completion, `onToggleComplete` above, so a screen that
    supplies that handler writes the transition itself and this must not.
    Nothing tells a screen about an abandon: `onAbandon` is the overflow
    menu's own item, raised from the menu and never from this patch, and
    `onRestore` is the trailing control's, which reaches the server only
    through here. Stripping it left the Restore control drawing, pressing and
    doing nothing, which AC-097 caught within one run.
    */
    if (Object.keys(owned).length > 0) report(owned)
    /* Completion is the screen's fact rather than the row's, so it is told. */
    if (fields.done !== undefined) props.onToggleComplete?.(fields.done)
  }

  function patchSteps(next: ConceptStep[]) {
    setEdits((current) => ({ ...current, steps: next }))
    report({ steps: next })
  }

  const cardHandlers = {
    toggleStep: (_id: string, index: number) =>
      patchSteps(
        steps.map((step, i) => (i === index ? { ...step, done: !step.done } : step)),
      ),
    moveStep: (_id: string, from: number, to: number) => {
      const next = [...steps]
      const [moved] = next.splice(from, 1)
      if (moved) next.splice(to, 0, moved)
      patchSteps(next)
    },
    /* `tasks/task-acts.ts`'s `moveStepsOut`. Absent without an id or a folder,
       the lab and the capture, where the control is then not drawn. */
    ...(props.id && task.folder?.id
      ? {
          moveStepsTo: (_id: string, indices: number[], destination: StepDestination) =>
            moveStepsOut(props.id!, task.folder!.id!, steps, indices, destination),
        }
      : {}),
    duplicateSteps: (_id: string, indices: number[]) =>
      patchSteps([
        ...steps,
        ...indices
          .map((index) => steps[index])
          .filter((step): step is ConceptStep => Boolean(step))
          .map((step) => ({ ...step, done: false })),
      ]),
    removeSteps: (_id: string, indices: number[]) =>
      patchSteps(steps.filter((_, index) => !indices.includes(index))),
    setStepsDone: (_id: string, indices: number[], done: boolean) =>
      patchSteps(
        steps.map((step, index) => (indices.includes(index) ? { ...step, done } : step)),
      ),
    onNewFolder: () => {},
    onStepsToNewFolder: () => {},
  }

  return { task, patch, patchSteps, steps, counts, cardHandlers }
}

/*
The row: one line, 32–36px. Checkbox · title · muted meta on the right (date,
folder where the page spans folders, assignee face, steps n/m, repeat glyph),
then the star, which shows on hover and whenever it is set.

Clicking anywhere on the row opens the task; the checkbox and the star are the
only controls inside it. No chevron, no row "…", no rename in the row: those
live in the task's own panel (the redesign's control map). Shift/Cmd-click
selects, see `useRowSelection`.
*/
export function TaskRow(props: TaskRowProps) {
  const { task, patch, counts } = useCardWiring(props)

  /* The row tells its list how to open it; the list's drag engine calls back
     on a tap, so tap-to-open is the row's property rather than each screen's. */
  const { onRegisterOpen, onOpen } = props
  useEffect(() => {
    if (!onRegisterOpen) return
    onRegisterOpen(onOpen ? () => onOpen() : null)
    return () => onRegisterOpen(null)
  }, [onRegisterOpen, onOpen])

  const given = props.given ?? {}
  const struck = Boolean(task.abandoned)
  const finished = Boolean(task.done) || struck

  const row = (
    <div
      /* r3-peek: the peek steps through rows in the order they are drawn. */
      data-task-id={props.id}
      onClick={
        /* Where no drag engine tracks the row (a board card, say); inside a
           list the engine resolves the tap. */
        props.onOpen && !props.listProps
          ? (event) => {
              const target = event.target as HTMLElement
              if (target.closest('button, a, input, [role="checkbox"]')) return
              props.onOpen?.()
            }
          : undefined
      }
      className={cn(
        "group/row grid h-[var(--row-height)] w-full grid-cols-[var(--control-height)_minmax(0,1fr)_auto] items-center rounded-sm pr-1 text-sm transition-colors",
        T_FAST,
        !props.isSelected && "hover:bg-muted",
        props.onOpen && "cursor-pointer",
      )}
    >
      <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
      <span
        title={task.title}
        className={cn(
          "min-w-0 truncate",
          finished ? "text-muted-foreground" : "text-foreground",
          struck && "line-through",
        )}
      >
        {task.title || <span className="text-muted-foreground">Untitled task</span>}
      </span>
      <RowMeta
        className="max-w-[60vw] pl-3 md:max-w-none"
        source={{
          ...(task.due === undefined ? {} : { due: task.due }),
          ...(task.folder === undefined ? {} : { folder: task.folder }),
          ...(task.assignee === undefined ? {} : { assignee: task.assignee }),
          ...(counts === null ? {} : { steps: counts }),
          ...(task.recurrence ? { recurrence: repeatShort(task) } : {}),
          blockedBy: props.blockedBy ?? 0,
          finished,
          important: Boolean(task.important),
          ...(props.importantTooltip === undefined ? {} : { importantTooltip: props.importantTooltip }),
        }}
        given={given}
        onToggleImportant={() => {
          patch(task.id, { important: !task.important })
          props.onToggleImportant?.()
        }}
      />
    </div>
  )

  return (
    <ExpandShell
      open={false}
      card={null}
      row={row}
      itemRef={props.itemRef}
      drag={props.listProps}
      isSelected={props.isSelected}
      isActive={props.dragState?.isActive}
      isDwelling={props.dragState?.isDwelling}
      isArmed={props.dragState?.isArmed}
      isSettling={props.dragState?.isSettling}
      offset={props.dragState?.offset}
      proposal={props.proposal}
    />
  )
}

/* The list wiring a screen spreads onto its own row when it keeps one. */
export interface TaskListWiring {
  itemRef: (element: HTMLElement | null) => void
  listProps: Record<string, unknown>
  /* Make a folder holding this task. */
  onNewFolder: () => void
  /*
  How a row hands the list its opener.

  The engine resolves tap-versus-drag, because it is the only thing that knows
  which a press became, so a row cannot simply take an `onClick`. Both of these
  are in the object the list builds, and are typed here so a `renderRow` screen
  can reach them.
  */
  onRegisterOpen: (open: (() => void) | null) => void
  dragState: {
    isActive: boolean
    isDwelling: boolean
    isArmed: boolean
    isSettling: boolean
    offset: number
    /* Sideways travel of the carried row, when the list follows across. */
    crossOffset?: number
  }
  /*
  What a release would do, for a list that drags into a container.

  The engine's `overKey` is handed on so the only surface that drags into a
  container, the board, can fill the row's proposal slot. AC-228 reads "Into
  {column}" while the pointer is still down, which is the one moment it exists.
  Undefined on every row that is not the carried one.
  */
  proposal?: string
  isSelected: boolean
  selecting: boolean
}

/* ---------------------------------------------------------------- list, */
/*
A list of task rows, and the three behaviours that only exist because they are a
list rather than a row: reordering, the 1.5-second hold that makes a folder of
two tasks, and selecting several to act on at once.

**Why it is a component rather than a hook.** The state these behaviours need
belongs to the list and not to any row in it, which row is being carried, which
row it is resting on, what is selected, and a screen that had to hold that state
would be a screen that could get it wrong. A screen renders one of these per
section and passes tasks; everything else is here.
*/

export function TaskList<T extends TaskRowProps & { id: string }>({
  tasks,
  onReorder,
  reorderable = true,
  onDropAt,
  onOver,
  followAcross = false,
  onDragStateChange,
  onMerge,
  onBulk,
  onDate,
  onDelete,
  onMove,
  onTaskOpen,
  onTaskToggleComplete,
  onTaskToggleImportant,
  onTaskRemoveFromMyDay,
  onTaskAbandon,
  onTaskDelete,
  renderRow,
  className,
  selection: sharedSelection,
  selectionChrome = true,
  ...perRow
}: {
  tasks: T[]
  /** A composed page renders task rows between other block kinds. Sharing
   * this controller keeps one selection across those separate list islands. */
  selection?: ReturnType<typeof useRowSelection>
  /** The composed page draws the shared bar once above all of its islands. */
  selectionChrome?: boolean
  /*
  **The list's arrangement is provisional until the screen says otherwise.** 7.6
  persists a drag in a folder with no filter or sort applied and springs it back
  everywhere else, and only the screen knows which list it is. So the callback
  also receives the ids in their new order and may answer with a promise: `true`
  once the order endpoint has written and the view has been read back, `false`
  for a refusal or a list that never persists. Either way the list then drops
  its own copy and shows the screen's rows, which after a write is the server's
  order (AC-266: the drag reads back in Q2's order) and after a refusal is the
  order the sort put there. A screen that returns nothing keeps the list's own
  order.
  */
  onReorder?: (from: number, to: number, next: string[]) => void | Promise<boolean>
  /*
  Whether this list keeps an order at all.

  A list that cannot keep an order does not offer one: otherwise the rows a
  carried row passes slide open a gap and a slot appears under it, and on
  release nothing has moved. The row still lifts, still follows the pointer, and
  the 1.5 second dwell still makes a folder, that gesture needing no persisted
  order; what goes is the displacement of the rows it passes and the reorder
  itself, so the only thing a drag here offers is the one thing it can do.
  */
  reorderable?: boolean
  /*
  Where a row was let go, when it was let go outside this list.

  A list sorts what it holds; a page holds several. Passed through to the drag
  engine so a page with sections can catch a task on its way out of one and
  put it in another, see `onDropAt` in `use-sortable-list`. Returning true
  means the page took it and this list should leave its own order alone.
  */
  onDropAt?: (taskId: string, point: { x: number; y: number }) => boolean
  /* What a release at this point would do, asked while the drag is still in the
     air, so the carried row can say it. It returns the words rather than a key,
     because the words are the only thing the row draws and a key would need a
     second prop to translate. See `proposal` on `TaskListWiring`. */
  onOver?: (taskId: string, point: { x: number; y: number }) => string | null
  /* The carried row follows the pointer sideways too (`crossOffset`), for a
     board, whose cards leave their column for the one beside it. */
  followAcross?: boolean
  /* Whether a row in this list is currently being carried. A page with
     sections needs it: the place to drop a task that belongs to none of them
     only has to exist while something is in the air. Pass a stable setter. */
  onDragStateChange?: (dragging: boolean) => void
  onMerge?: (ids: string[], name: string) => void
  onBulk?: (ids: string[], fields: Partial<ConceptTask>) => void
  onDate?: (ids: string[], when: BulkDate) => void
  onDuplicate?: (ids: string[]) => void
  onDelete?: (ids: string[]) => void
  /* The id rides along; see `useRowSelection`. */
  onMove?: (ids: string[], folder: { id: string; name: string; color: string }) => void
  /* Per-task callbacks, taking the id, so a screen never has to map rows
     itself just to close over one. */
  /*
  **Required, and that is the point.**

  Opening a task by pressing its body is resolved by the drag engine, because
  only the engine knows whether a press became a drag (see `onTap` in
  use-sortable-list). The engine can only report the tap to whoever the list
  hands it, so a list without this prop is a list whose rows silently cannot
  be opened, which is exactly what happened on the folder page, where three
  lists were written with `renderRow` and nobody remembered this.

  Optional, it was a rule kept in memory and forgotten once per new list.
  Required, the compiler asks the question at every call site, including the
  ones nobody has written yet. Behaviour that is settled for the row belongs
  in the row's own contract rather than in each screen's diligence.
  */
  onTaskOpen: (id: string, mode?: TaskOpenMode) => void
  onTaskToggleComplete?: (id: string, completed: boolean) => void
  onTaskToggleImportant?: (id: string) => void
  onTaskRemoveFromMyDay?: (id: string) => void
  onTaskAbandon?: (id: string) => void
  onTaskDelete?: (id: string) => void
  /* An escape hatch for the screens whose rows carry logic of their own,
     a completion that restores an abandoned task, a transition on complete, a
     recurrence successor to warn about. Rather than push all of that into
     this component or flatten it into id-only callbacks, the screen keeps its
     own row and is handed the list wiring to spread onto it. */
  renderRow?: (task: T, wiring: TaskListWiring) => ReactNode
  /*
  What this list has already said, for every row in it.

  Declared here rather than left to `perRow` so the compiler asks the
  question at the call site: a list is where the decision belongs, because a
  row cannot see the heading above it (see TaskRowProps.given). A screen with
  its own `renderRow` passes it on the row instead, which is the same
  decision made in the same place.
  */
  given?: TaskRowProps["given"]
  className?: string
}) {
  const [order, setOrder] = useState<string[] | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)

  /* The screen owns the tasks; this owns the arrangement, and only once
     somebody has actually dragged something. Until then the screen's order is
     the order, so a list nobody has touched still sorts by its own rule. */
  const ordered = order
    ? [...tasks].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    : tasks

  const cancelPress = useRef<() => void>(() => {})

  /*
  The carried row still follows the pointer and the dwell still arms on the row
  under it; what a list with no order to keep does not do is slide the rows it
  passes out of the way, which is the list drawing a slot it will not fill. Made
  here rather than in the engine, because whether an order persists is the
  page's fact and not the gesture's.
  */
  function stateOf(index: number): SortableItemState {
    const state = drag.itemState(index)
    if (reorderable || state.isActive) return state
    return { ...state, offset: 0 }
  }

  const dragging = useRef(false)
  const drag = useSortableList({
    count: ordered.length,
    onLift: () => cancelPress.current(),
    onDropAt: onDropAt
      ? (from, point) => {
          const task = ordered[from]
          return task ? onDropAt(task.id, point) : false
        }
      : undefined,
    onOver: onOver
      ? (from, point) => {
          const task = ordered[from]
          return task ? onOver(task.id, point) : null
        }
      : undefined,
    onReorder: (from, to) => {
      /* A list with no order to keep never takes one. */
      if (!reorderable) return
      const next = ordered.map((task) => task.id)
      const [moved] = next.splice(from, 1)
      if (moved) next.splice(to, 0, moved)
      setOrder(next)
      /* See `onReorder` on the props. The list's own copy of the order is held
         while the screen answers and dropped when it has, whichever way it
         answered. */
      const answer = onReorder?.(from, to, next)
      if (answer !== undefined) {
        void answer.then(() => setOrder(null))
      }
    },
    /* Resting on a row proposes a folder of the two. Nothing is destroyed on
       release: it opens the naming panel, which can be cancelled. */
    onDwell: (from, to) => {
      const moved = ordered[from]
      const onto = ordered[to]
      if (moved && onto) {
        setPending({
          kind: "merge",
          ids: [moved.id, onto.id],
          titles: [moved.title, onto.title],
        })
      }
    },
    describe: (index) => ordered[index]?.title ?? "Task",
    followAcross,
  })

  /* Each row registers how to open itself; the drag engine calls into this
     on a tap. See the comment where `listProps` is built. */
  const openers = useRef(new Map<string, () => void>())

  const localSelection = useRowSelection({
    onMove: (ids, folder) => onMove?.(ids, folder),
    onNewFolder: (ids) => setPending({ kind: "folder-for", ids }),
    onBulk: (ids, fields) => onBulk?.(ids, fields),
    onDate,
    onDelete: (ids) => onDelete?.(ids),
  })
  const selection = sharedSelection ?? localSelection
  cancelPress.current = selection.clearPress
  /*
  A press that became a selection is not a tap.

  The engine resolves a still press as a tap on release and asks the row to open
  (`onTap` in use-sortable-list). Every row registers an opener, so the 400 ms
  hold that starts selecting would, on release, also open the task it had just
  selected. The engine's listeners were attached before the hold armed and
  cannot see it, so the opener the list hands the engine reads the mode at the
  moment of release rather than at the press.
  */
  const selectingNow = useRef(false)
  selectingNow.current = selection.selecting

  /* Reported up rather than only used here, so a page can offer somewhere to
     drop that is worth showing only while something is being carried. */
  useEffect(() => {
    if (dragging.current === drag.isDragging) return
    dragging.current = drag.isDragging
    onDragStateChange?.(drag.isDragging)
  }, [drag.isDragging, onDragStateChange])

  /* A list that unmounts mid-drag never gets to say the drag ended, and a
     cross-list drop unmounts exactly the list the row came from, which left
     the page believing something was still in the air. */
  useEffect(
    () => () => {
      if (dragging.current) onDragStateChange?.(false)
    },
    [onDragStateChange],
  )

  function confirm(name: string) {
    if (!pending) return
    if (pending.kind === "merge" || pending.kind === "folder-for") {
      onMerge?.(pending.ids, name)
    }
    setPending(null)
  }

  return (
    /* A flex column with a gap, never `space-y-*`. The space utilities set
       their children's vertical margins at a priority that beat every form of
       `my-*` tried on the open card, inline styles included, so an expanded
       task had no breathing room in the screens while looking right in the
       lab. A gap belongs to the container and leaves the children's margins
       alone, which is what the card needs. */
    /* The container is a list: a `listitem` needs a `list` to be an item of,
       and 9.1's roles table fixes both ends of that. See the comment over
       `ExpandShell` above. */
    <div role="list" className={cn("flex flex-col", className)}>
      {selectionChrome ? selection.bar : null}
      {pending ? (
        <PendingPanel
          pending={pending}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      ) : null}
      {ordered.map((task, index) => {
        const wiring = {
          itemRef: drag.setItemRef(index),
          onNewFolder: () => setPending({ kind: "folder-for", ids: [task.id] }),
          /* Press-and-hold selects; travel drags. Both want pointerdown, so
             they are chained rather than spread over one another, spreading
             silently keeps only the later handler, which is how the row once
             ended up with a drag that never started. */
          listProps: selection.selecting
            ? selection.selectProps(task.id)
            : rowProps(
                /* A press that stays still opens the task; one that travels
                   drags it. The engine decides which, because it is the one
                   tracking the gesture, see `onTap` in use-sortable-list.

                   The tap asks the *row* to open itself rather than calling a
                   handler this list was given. That distinction is the whole
                   point: `onTaskOpen` is a prop every screen has to remember
                   to pass, and the folder page did not, so tap-to-open worked
                   on six pages and silently not on the seventh. A row always
                   knows its own opener, so routing through the row makes the
                   behaviour a property of TaskRow rather than a courtesy each
                   caller extends. */
                drag.surfaceProps(index, () => {
                  /* See `selectingNow` above. */
                  if (selectingNow.current || selection.takeModifiedPress()) return
                  openers.current.get(task.id)?.()
                }),
                selection.selectProps(task.id),
              ),
          /* How a row hands its opener back. Spread with the rest of the
             wiring, so every `renderRow` screen gets it without knowing. */
          onRegisterOpen: (open: (() => void) | null) => {
            if (open) openers.current.set(task.id, open)
            else openers.current.delete(task.id)
          },
          dragState: stateOf(index),
          /* The words only the carried row draws, and only while a container
             has been proposed. `overKey` is the label because `onOver` returns
             one; see that prop. */
          proposal:
            drag.itemState(index).isActive && drag.overKey !== null
              ? drag.overKey
              : undefined,
          isSelected: selection.selected.includes(task.id),
          selecting: selection.selecting,
        }
        if (renderRow) return renderRow(task, wiring)
        return (
        <TaskRow
          key={task.id}
          {...task}
          {...perRow}
          /* The whole wiring, spread.

             It used to be handed over field by field, which meant every
             addition to `wiring` had to be repeated here, and twice in a row
             it was not: "New folder…" was missing from this path, then
             `onRegisterOpen` was, so tap-to-open worked on the screens that
             use `renderRow` (which spread wiring) and silently not on the
             ones that do not. Spreading removes the class of mistake rather
             than the two instances of it; the explicit handlers below still
             override, because they come after. */
          {...wiring}
          onOpen={onTaskOpen ? (mode) => onTaskOpen(task.id, mode) : undefined}
          onToggleComplete={
            onTaskToggleComplete
              ? (completed) => onTaskToggleComplete(task.id, completed)
              : undefined
          }
          onToggleImportant={
            onTaskToggleImportant ? () => onTaskToggleImportant(task.id) : undefined
          }
          onRemoveFromMyDay={
            onTaskRemoveFromMyDay ? () => onTaskRemoveFromMyDay(task.id) : undefined
          }
          onAbandon={onTaskAbandon ? () => onTaskAbandon(task.id) : undefined}
          onDelete={onTaskDelete ? () => onTaskDelete(task.id) : undefined}
          itemRef={wiring.itemRef}
          listProps={wiring.listProps}
          dragState={wiring.dragState}
          isSelected={wiring.isSelected}
          selecting={wiring.selecting}
        />
        )
      })}
    </div>
  )
}
