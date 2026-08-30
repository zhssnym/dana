/*
The task row: the single line that stands for a task in a list, and the card it
opens.

This file replaced the v1 row on 2026-08-18. That row is not gone, it is
frozen in `task-row-baseline.tsx` as the concept lab's C0 control, because a
control you have improved is not a control.

What the row is, and the entries that decided it:

- **Two densities, one component.** DES-113. Two lines is the default; the
  preference lives in `lib/row-density.ts`. The rule that keeps this
  affordable is written there and matters more than anything in this file:
  *the two densities may differ in height and in where the details sit, and in
  nothing else.*
- **It expands in place.** DES-093. The chevron opens `TaskCard` inside the
  row rather than sending anybody to a sheet, which is why the prototype no
  longer has a task form at all.
- **A bare task costs one line, not two.** DES-111.
- **The details are the controls that change them.** DES-096 and DES-123: the
  due and repeat chips open the same pickers the card opens, because the
  pickers are constant to the Dana brand and exist once.
- **Renaming happens in the row.** DES-095.

**What is deliberately not here.** Dragging to reorder, the 1.5-second hold
that makes a folder, press-and-hold selection and the bulk bar are Lane 2,
they need a persisted order and endpoints nobody has written, so they are
drawn in the concept lab, where they are the thing under review, and are not
wired into the screens. DES-103, DES-112 and DES-119 carry the reasoning and
the list. The machinery they use is exported from here so the lab can compose
it; what the lab passes and the screens do not is the difference.
*/

import { InlineInput } from "./ui/inline-field.js"
import { Face } from "./person-face.js"
import { IconAction } from "./icon-action.js"
import {
  ArrowUpRight,
  Ban,
  CalendarDays,
  Check as CheckIcon,
  ChevronDown,
  ChevronRight,
  Copy,
  Folder,
  FolderInput,
  FolderPlus,
  Fullscreen,
  SquareSquare,
  ListChecks,
  MoreHorizontal,
  PanelRight,
  SunMedium,
  Repeat2,
  RotateCcw,
  Star,
  Trash2,
  UserPlus,
  UserRound,
  X,
  type LucideIcon,
} from "../lib/icons.js"
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"

import {
  DestinationChoice,
  MenuHeading,
  Reveal,
  TaskCard,
  newFolderChoice,
} from "./task-card.js"
import { FolderMark, folderNameOf, useFolderMark } from "./folder-mark.js"
import { folderLibrary } from "../lib/folder-library.js"
import { DuePanel, RepeatPanel } from "./task-pickers.js"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.js"
import { ObjectMenu } from "./object-menu.js"
import { HistorySheet } from "./history-sheet.js"
import { copyTaskLink, duplicateTask, makeFolderOfTask, moveStepsOut } from "../lib/task-acts.js"
import type { StepDestination } from "../lib/task-acts.js"
import {
  COMPLETE_TASK,
  MARK_AS_NOT_DONE,
  REMOVE_FROM_TODAY,
  RESTORE,
} from "./ui/copy.js"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.js"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.js"
import { ActionStrip, type ViewStripOption } from "./view-strip.js"
import { useRowDensity, type RowDensity } from "../lib/row-density.js"
import { usePeopleLibrary } from "../lib/people-library.js"
import { useTaskWriter } from "../lib/task-writer.js"
import { useExpandedDetail } from "../lib/row-detail.js"
import { setTaskSurfacePreference } from "../lib/task-surface-preference.js"
import {
  repeatShort,
  stepCount,
  type ConceptComment,
  type ConceptStep,
  type ConceptTask,
} from "../lib/task-model.js"
import { useSortableList } from "../lib/use-sortable-list.js"
import { cn } from "./ui/utils.js"

/* --------------------------------------------------------------- state, */

/* Each concept gets its own copy of the sample, so completing a task in one
   concept does not quietly change the list somebody is comparing it against.
   The lab's per-concept Reset remounts the block, which is why nothing here
   needs a reset of its own. */
export function useTaskList(initial: ConceptTask[]) {
  const [tasks, setTasks] = useState<ConceptTask[]>(() =>
    initial.map((t) => ({ ...t, steps: t.steps?.map((s) => ({ ...s })) })),
  )

  function patch(id: string, fields: Partial<ConceptTask>) {
    setTasks((list) => list.map((t) => (t.id === id ? { ...t, ...fields } : t)))
  }

  /* Reorder by dropping one row on another. The dropped row lands where the
     target was, which is what people expect from a list and is not what a
     naive swap does. */
  function reorder(fromId: string, toId: string) {
    setTasks((list) => {
      const from = list.findIndex((t) => t.id === fromId)
      const to = list.findIndex((t) => t.id === toId)
      if (from < 0 || to < 0 || from === to) return list
      const next = [...list]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved!)
      return next
    })
  }

  /* Two tasks become a folder: both are moved into it, neither is destroyed.
     The reversible version of the idea, and the one worth drawing first. */
  function groupIntoFolder(ids: string[], name: string) {
    setTasks((list) =>
      list.map((t) =>
        ids.includes(t.id)
          ? { ...t, folder: { name, color: "var(--color-folder-sky)" } }
          : t,
      ),
    )
  }

  /* A task becomes a folder and its steps become the tasks inside it. This one
     destroys the original, which is exactly why it is drawn: seeing one row
     turn into four is the fastest way to judge whether that is a good idea. */
  function taskToFolder(id: string) {
    setTasks((list) => {
      const at = list.findIndex((t) => t.id === id)
      if (at < 0) return list
      const source = list[at]!
      const folder = { name: source.title, color: "var(--color-folder-sky)" }
      const promoted: ConceptTask[] = (source.steps ?? []).map((step, i) => ({
        id: `${source.id}-promoted-${i}`,
        title: step.title,
        done: step.done,
        folder,
        due: source.due,
        assignee: source.assignee,
      }))
      const next = [...list]
      next.splice(at, 1, ...promoted)
      return next
    })
  }

  function moveStep(id: string, from: number, to: number) {
    setTasks((list) =>
      list.map((t) => {
        if (t.id !== id || !t.steps) return t
        if (to < 0 || to >= t.steps.length || from === to) return t
        const steps = [...t.steps]
        const [moved] = steps.splice(from, 1)
        steps.splice(to, 0, moved!)
        return { ...t, steps }
      }),
    )
  }

  /*
  One verb, and the destination decides the result.

  See DES-106. A step moved into a folder becomes a task, because a folder
  holds tasks. The same steps moved into a task stay steps, because that is
  what a task holds. Nothing here is a separate "promote" command; level is a
  consequence of where a thing ends up.
  */
  function moveStepsTo(
    id: string,
    indices: number[],
    destination: { kind: "new-task" } | { kind: "folder"; name: string; color: string },
  ) {
    setTasks((list) => {
      const at = list.findIndex((t) => t.id === id)
      const source = list[at]
      if (at < 0 || !source?.steps) return list

      const taken = indices.map((i) => source.steps![i]!).filter(Boolean)
      if (taken.length === 0) return list
      const kept = source.steps.filter((_, i) => !indices.includes(i))
      const next = [...list]
      next[at] = { ...source, steps: kept }

      if (destination.kind === "new-task") {
        /* Into a task: they stay steps. The new task is unnamed on purpose,
           every row on this page renames in place, so the person names it
           where they are rather than in a dialog first. */
        next.splice(at + 1, 0, {
          id: `${id}-extracted-${kept.length}-${taken.length}`,
          title: "New task",
          folder: source.folder,
          due: source.due,
          steps: taken,
        })
        return next
      }

      /* Into a folder: each becomes a task of its own. */
      const promoted: ConceptTask[] = taken.map((step, i) => ({
        id: `${id}-moved-${destination.name}-${kept.length}-${i}`,
        title: step.title,
        done: step.done,
        folder: { name: destination.name, color: destination.color },
      }))
      next.splice(at + 1, 0, ...promoted)
      return next
    })
  }

  function duplicateTasks(ids: string[]) {
    setTasks((list) => {
      const next: ConceptTask[] = []
      list.forEach((t) => {
        next.push(t)
        if (ids.includes(t.id)) {
          next.push({
            ...t,
            id: `${t.id}-copy-${next.length}`,
            title: `${t.title} (copy)`,
            steps: t.steps?.map((step) => ({ ...step })),
          })
        }
      })
      return next
    })
  }

  function removeTasks(ids: string[]) {
    setTasks((list) => list.filter((t) => !ids.includes(t.id)))
  }

  function patchMany(ids: string[], fields: Partial<ConceptTask>) {
    setTasks((list) =>
      list.map((t) => (ids.includes(t.id) ? { ...t, ...fields } : t)),
    )
  }

  function duplicateSteps(id: string, indices: number[]) {
    setTasks((list) =>
      list.map((t) => {
        if (t.id !== id || !t.steps) return t
        const steps: ConceptStep[] = []
        t.steps.forEach((step, i) => {
          steps.push(step)
          if (indices.includes(i)) steps.push({ ...step, done: false })
        })
        return { ...t, steps }
      }),
    )
  }

  function removeSteps(id: string, indices: number[]) {
    setTasks((list) =>
      list.map((t) =>
        t.id === id && t.steps
          ? { ...t, steps: t.steps.filter((_, i) => !indices.includes(i)) }
          : t,
      ),
    )
  }

  function setStepsDone(id: string, indices: number[], done: boolean) {
    setTasks((list) =>
      list.map((t) =>
        t.id === id && t.steps
          ? {
              ...t,
              steps: t.steps.map((step, i) =>
                indices.includes(i) ? { ...step, done } : step,
              ),
            }
          : t,
      ),
    )
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

  return {
    tasks,
    patch,
    toggleStep,
    moveStep,
    moveStepsTo,
    reorder,
    groupIntoFolder,
    taskToFolder,
    duplicateTasks,
    removeTasks,
    patchMany,
    duplicateSteps,
    removeSteps,
    setStepsDone,
  }
}

/* --------------------------------------------------------------- motion, */

export const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
export const T_BASE = "duration-[var(--duration-base)] ease-[var(--ease-enter)]"

/* ------------------------------------------------------------ dragging, */
/*
Dragging a row, and the 1.5 second dwell that turns a reorder into a folder.

Imran's idea, 2026-08-17. Both halves need a backend and neither is approved;
see DES-103. They are drawn because the only way to judge a dwell is to feel
one, and 1.5s is either exactly right or obviously wrong within two attempts.

The interaction has two meanings and the dwell is what separates them. Move,
and you are reordering: the row follows the pointer and the rows it passes
slide out of its way, so where it will land is shown rather than described.
Stop, and after 1.5s over one row the release changes meaning, the two tasks
become a folder. A hidden mode is a bad idea unless the mode announces itself,
so the target row fills a bar over exactly the dwell duration and then says
what releasing will do. The bar is not decoration; it is the only reason the
delay is not a mystery.

Arming also relaxes the list back to its resting order, because rows still
holding a space open for a reorder you are no longer proposing would be lying
about what happens next.

Rebuilt 2026-08-18. The mechanics moved to `lib/use-sortable-list.ts` and off
HTML5 drag-and-drop, whose faults were the reason this never felt finished: an
unstyleable drag image, a `dragleave` that fires on crossing onto a child so
the target flickers, no auto-scroll, and nothing at all on touch. That module's
header carries the full reasoning. The same engine now drives the task rows,
a card's steps and a card's blocks, so the gesture is learned once.

Nothing is destroyed on drop. Releasing opens a panel that names the folder and
can be cancelled, because "I dragged one task slightly onto another" and "I
want a new folder" should not be the same gesture with no way back.
*/

export const DWELL_MS = 1500

/* What a folder-in-progress looks like, rebuilt 2026-08-18 after Imran said
   the gesture was not easy to understand.

   It used to be a three-pixel hairline along the bottom edge of the target row
   and a pill of words. Two things were wrong with that. The bar was the only
   thing counting down and it was the least visible element on screen, sitting
   where a border lives. And nothing anywhere in the gesture was a folder, the
   one idea the whole interaction is about was carried entirely by the sentence
   "make a folder", which somebody has to stop and read.

   So the countdown and the folder are now the same object: a ring that closes
   over exactly the dwell duration around the folder mark it is closing on. You
   can tell what is about to happen without reading anything, and how long is
   left without looking anywhere else. When it completes the badge fills, which
   is a change of state rather than a change of volume. */
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
        "inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-1 shadow-[var(--elevation-1)] transition-[background-color,box-shadow,transform]",
        T_FAST,
        armed
          ? "scale-[1.03] bg-[var(--color-dana-accent-600)] text-white"
          : "bg-card text-[var(--color-dana-accent-800)] ring-1 ring-[var(--color-dana-accent-200)]",
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
              className="stroke-[var(--color-dana-accent-100)]"
            />
            <circle
              cx="12"
              cy="12"
              r={radius}
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              className="stroke-[var(--color-dana-accent-600)]"
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
            armed ? "text-white" : "text-[var(--color-dana-accent-600)]",
          )}
          strokeWidth={2}
          aria-hidden="true"
        />
      </span>
      <span className="text-[12px] leading-4 font-medium whitespace-nowrap">
        {armed ? "Release to make a folder" : "Hold to make a folder"}
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

   Rebuilt 2026-08-18, with the dwell badge, after Imran said the folder
   treatment was hard to understand and hard to operate. It was a paragraph of
   prose, an empty field and two buttons, so what was about to happen had to
   be read, the thing being made had no mark of its own anywhere, and the
   primary action sat disabled until somebody typed, with nothing saying why.

   Now: the folder is drawn, what goes into it is shown as the things
   themselves rather than described in a sentence, and there is always a name
   in the field. The suggestion is a real name, the two titles have a shared
   word often enough to be worth trying, and it is selected on open, so Enter
   accepts and typing replaces. Nothing starts disabled. */
export function suggestFolderName(pending: PendingAction) {
  if (pending.kind === "promote") return pending.title
  if (pending.kind !== "merge") return "New folder"

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
  return best ? best.charAt(0).toUpperCase() + best.slice(1) : "New folder"
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
        "mb-2 overflow-hidden rounded-lg bg-card shadow-[var(--elevation-2)] ring-1 ring-[var(--color-dana-accent-200)]",
        T_BASE,
      )}
    >
      <div className="flex items-start gap-3 px-3 pt-3">
        {/* The folder mark, the same one the dwell badge closes its ring
            around, so the gesture and its panel are visibly one thing. */}
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-dana-accent-50)]">
          <FolderPlus
            className="size-4 text-[var(--color-dana-accent-600)]"
            strokeWidth={2}
            aria-hidden="true"
          />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-5 font-medium text-[var(--color-graphite-900)]">
            {destroys ? "Turn this task into a folder" : "New folder"}
          </p>
          <p className="mt-0.5 text-[12px] leading-4 text-[var(--color-graphite-500)]">
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
            placeholder="Folder name"
            aria-label="Folder name"
            className={cn(
              "mt-2.5 h-9 w-full rounded-md border border-[var(--color-graphite-300)] bg-card px-2.5 text-[14px] leading-5 text-[var(--color-graphite-900)] outline-none",
              "placeholder:text-[var(--color-graphite-400)] focus-visible:border-[var(--color-dana-accent-600)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-100)]",
            )}
          />

          {/* What goes in, shown rather than counted. A person checking they
              grabbed the right two tasks should be able to read the two
              titles, which a sentence saying "2 tasks" cannot do. */}
          <ul className="mt-2 flex flex-col gap-1">
            {going.map((line, index) => (
              <li
                key={`${line}-${index}`}
                className="flex items-center gap-2 text-[13px] leading-5 text-[var(--color-graphite-600)]"
              >
                <span
                  aria-hidden="true"
                  className="ml-1 size-1.5 shrink-0 rounded-full bg-[var(--color-graphite-300)]"
                />
                <span className="truncate">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1 bg-[var(--color-graphite-25)] px-3 py-2">
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            "rounded-md px-3 py-1.5 text-[13px] leading-5 text-[var(--color-graphite-600)] transition-colors hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)]",
            T_FAST,
            FOCUS,
          )}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => onConfirm(name.trim())}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md bg-[var(--color-graphite-900)] px-3 py-1.5 text-[13px] leading-5 font-medium text-white transition-[background-color,transform] hover:bg-[var(--color-graphite-800)] active:scale-95 disabled:pointer-events-none disabled:opacity-40",
            T_FAST,
            FOCUS,
          )}
        >
          <FolderPlus className="size-3.5" strokeWidth={2} aria-hidden="true" />
          {destroys ? "Convert" : "Create folder"}
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
Selecting task rows, with the same gesture the steps use.

Press and hold a row to start, tap to add, Escape or the cross to leave, and
emptying the selection leaves by itself. Holding one gesture across both
levels is the point: a person learns it once in a card and it already works in
the list, which is the only reason a hidden gesture is affordable at all.

Dragging is suspended while selecting, because press-and-hold and press-and-
drag begin identically and the list cannot serve both at once. That is a real
cost of this choice and it is worth naming: you cannot reorder while you have
a selection.
*/
export function useRowSelection({
  onMove,
  onNewFolder,
  onBulk,
  onDuplicate,
  onDelete,
}: {
  /* Seam, S23a: the choice carries 7.4's id, which is what a PATCH /tasks/:id
     body names a folder by; `lib/folder-library.ts` already rides it on every
     entry the menu below draws, so nothing here changes but the type. */
  onMove: (ids: string[], folder: { id: string; name: string; color: string }) => void
  onNewFolder: (ids: string[]) => void
  onBulk: (ids: string[], fields: Partial<ConceptTask>) => void
  /* Optional, and the bar draws no Duplicate when it is absent: a control
     with no act behind it is the one thing the bar must not offer,
     `object-acts.ts`'s own rule for a menu. Every list in the app supplies it
     since RFC 0005 change control item 58 (A), through `lib/task-acts.ts`. */
  onDuplicate?: (ids: string[]) => void
  onDelete: (ids: string[]) => void
}) {
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const pressTimer = useRef<number | null>(null)
  const longPressAt = useRef(0)
  const lastCount = useRef(0)

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

  function clearPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  useEffect(() => clearPress, [])

  function exit() {
    setSelecting(false)
    setSelected([])
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id]
      if (next.length === 0) setSelecting(false)
      else lastCount.current = next.length
      return next
    })
  }

  /* Handlers for one row. Spread alongside the drag props, which the caller
     drops while `selecting` is true. */
  function selectProps(id: string) {
    return {
      onPointerDown: () => {
        if (selecting) return
        clearPress()
        pressTimer.current = window.setTimeout(() => {
          longPressAt.current = Date.now()
          lastCount.current = 1
          setSelecting(true)
          setSelected([id])
        }, 400)
      },
      onPointerUp: clearPress,
      onPointerLeave: clearPress,
      onClick: () => {
        /* Same timestamp guard as the steps: the click that belongs to the
           press just made is ignored, and any later tap counts. */
        if (selecting && Date.now() - longPressAt.current > 300) toggle(id)
      },
    }
  }

  /*
  The selection bar's controls.

  "Move to…" alone was not enough, and the reason is worth stating: a selection
  is a held intention, and the whole value of holding it is doing something to
  all of it at once. Offering exactly one verb makes the person leave the mode
  and repeat themselves for everything else they wanted.

  The set is what a to-do list can actually do to several tasks at once,
  complete them, star them, pull them into My Day, move them, copy them, delete
  them, rather than a set chosen to fill a bar. Anything Dana cannot do in
  bulk is deliberately absent.

  Delete sits last, after a divider, and is the only control that colours on
  hover. It is the one action here that loses work.
  */
  const bar = (
    <Reveal open={selecting}>
      <div className="mb-2 flex items-center gap-1 rounded-md bg-[var(--color-dana-accent-50)] px-2 py-1.5">
        <button
          type="button"
          onClick={exit}
          aria-label="Leave selection"
          className={cn(
            "flex size-6 items-center justify-center rounded text-[var(--color-dana-accent-800)] transition-colors hover:bg-[var(--color-dana-accent-100)]",
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
          label="Mark complete"
          onClick={() => {
            onBulk(selected, { done: true })
            exit()
          }}
        />
        <IconAction
          icon={Star}
          label="Mark important"
          onClick={() => {
            onBulk(selected, { important: true })
            exit()
          }}
        />
        <IconAction
          icon={SunMedium}
          /* polish: taskrow F11. The page is called Today everywhere else. */
          label="Add to Today"
          onClick={() => {
            onBulk(selected, { pulled: true })
            exit()
          }}
        />

        <DropdownMenu>
          {/* polish: taskrow F11. Named on hover like its five neighbours. */}
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      aria-label="Move to a folder"
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
              }
            />
            <TooltipContent side="top">Move to a folder</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="min-w-[16rem]">
            <MenuHeading>
              Move {selected.length} task{selected.length === 1 ? "" : "s"} to
            </MenuHeading>
            {folderLibrary().map((f) => (
              <DropdownMenuItem
                key={f.name}
                label={f.name}
                onClick={() => {
                  onMove(selected, f)
                  exit()
                }}
              >
                <DestinationChoice
                  icon={Folder}
                  color={f.color}
                  name={f.name}
                  detail="Keeps everything else as it is"
                />
              </DropdownMenuItem>
            ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                label="New folder"
                onClick={() => {
                  onNewFolder(selected)
                  exit()
                }}
              >
                <DestinationChoice
                  icon={FolderPlus}
                  name="New folder…"
                  detail="Name it, and they move into it"
                />
              </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Seam, S23a: see `onDuplicate` above. */}
        {onDuplicate ? (
          <IconAction
            icon={Copy}
            label="Duplicate"
            onClick={() => {
              onDuplicate(selected)
              exit()
            }}
          />
        ) : null}
        <span
          aria-hidden="true"
          className="mx-0.5 h-4 w-px bg-[var(--color-dana-accent-200)]"
        />
        <IconAction
          icon={Trash2}
          label="Delete"
          tone="danger"
          onClick={() => {
            onDelete(selected)
            exit()
          }}
        />
      </div>
    </Reveal>
  )

  return { selecting, selected, selectProps, clearPress, bar }
}

/* --------------------------------------------------------------- pieces, */

export const META = "text-xs text-[var(--color-graphite-600)]"
export const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

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
      **Seam, S23: 9.1's names table, which gives this control exactly two.**

      "A task's completion control: 'Complete task' when open, 'Mark as not
      done' when complete." The prototype writes "Complete {title}" and
      "Reopen {title}", which names the task rather than the act and which
      AC-179 refuses in as many words: the table "gives it exactly two names,
      one per state, so exactly one control answers to them". Change control
      item 44's A2 ruled the table stands. The strings are
      `ui/copy.ts`'s, transcribed once for the whole client.
      */
      aria-label={done ? MARK_AS_NOT_DONE : COMPLETE_TASK}
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
        <svg viewBox="0 0 20 20" className="size-3.5 data-[size=sm]:size-3.5" aria-hidden="true">
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
export function TaskTitle({
  task,
  onRename,
  className,
  truncate = true,
  heading = false,
}: {
  task: ConceptTask
  onRename: (title: string) => void
  className?: string
  truncate?: boolean
  /* An open row is the card's heading and takes the heading step of the type
     scale; closed, it is a list item and stays at body size. */
  heading?: boolean
}) {
  /*
  **A row never auto-edits**, and the reason is worth keeping.

  It did, briefly: an untitled task opened its field so the floating button
  would land you in typing. That reasoning was right and the place was wrong.
  A row is rendered wherever the task appears, so an untitled task turned
  *every* list containing it into a list with a stray empty input in it, and
  because the flag initialises once, the field never recovered even after the
  name was typed elsewhere. From the outside the task looked like it had
  vanished (Imran, 2026-08-22: "it does not appear, it's not basically
  saving"), when it had saved perfectly and was being drawn as a blank box.

  Landing in the field is the *surface's* job, because the surface is the one
  thing that opens once, deliberately, at the moment of creation, see
  `PageTitle` in task-surface.tsx. A row just draws what is there, and draws
  an untitled task as untitled.
  */
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.title)
  const struck = Boolean(task.done) || Boolean(task.abandoned)

  /* w-fit rather than w-full, because the strike-through is drawn as a rule
     across this box and a full-width box strikes a line across empty space to
     the right of a short title. max-w-full keeps truncation working. */
  const metrics = cn(
    "block w-fit max-w-full min-w-0",
    heading ? "text-[16px] leading-6" : "text-[14px] leading-5",
    truncate && "truncate",
    className,
  )

  if (editing) {
    return (
      <InlineInput
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

  /*
  **Seam, S23: the row's title is text, not a control, and 9.4 is why.**

  The prototype makes it a `<button>` that swaps itself for a field, which is
  DES-095, "renaming happens in the row". Two sentences of section 9 are
  against it and 11.13 makes them win.

  **9.4: "a click on any row opens that task."** The title is the largest
  target in a row and the one a person aims at, and in the prototype clicking
  it starts a rename instead. AC-178 performs the section's sentence literally,
  `page.getByText(title)` then expects the surface; against a title that
  renames, the click lands in a text field and no task opens.

  **And 9.3 already says where a title is edited**: "the title (editable in
  place, required)", in the card's field table. The row expands into that card
  by DES-093, so renaming in the row is still one gesture away and is done on
  the artifact the section puts the field on. Section 9 asks for no
  row-rename control anywhere, and 9.1's roles table, which fixes roles for
  eight things, does not list one.

  **The second cost it was carrying is an addressing one and it is worth
  naming**, because it is F1 and F2's class again and the criteria triage
  could not have seen it. A button whose accessible name is the task's own
  title makes every loose locator inside a row ambiguous: AC-097 asks a row
  for `getByRole('button', { name: 'Restore' })`, and against a seeded task
  called "ac-097 restore returns to my day" that matched the title button as
  well as the Restore control, dying of strict mode. The v1 row never had the
  problem because its title was not a control. Any row-scoped locator whose
  name happens to appear in a task's title has the same fault, so this is a
  class rather than one case.

  What is given up is a click's worth of convenience, and it is recorded
  rather than taken quietly: renaming is now the chevron then the card's
  title, where the section puts it.
  */
  const button = (
    <span
      className={cn(
        metrics,
        "relative -mx-1 rounded-[4px] px-1 text-left transition-colors",
        T_FAST,
        /*
        **Seam, S23: the strike is the text's own, and it is a third finding
        of F1 and F2's class that the criteria triage did not carry.**

        9.5 renders a completed row "faded and checked" and an abandoned one
        "faded and struck", and AC-097 reads the second from the browser, off
        the title's computed `textDecorationLine`, with its own note that
        "any CSS that produces a strike-through satisfies it". The prototype
        draws the line instead: an absolutely positioned 1px span across the
        button, scaled from zero so the strike sweeps across as a task is
        abandoned. It is a real strike and a nicer one, and it leaves
        `textDecorationLine` reading `none`, so nothing about the row's
        appearance tells a reader, a screen reader included, that the text is
        struck. Three cases read it and every abandoned row in the product is
        drawn by this line.

        **The motion is kept and the mechanism is not**, which is the choice
        with the least given up. `text-decoration-color` animates, so the
        line still arrives rather than appearing: transparent at rest, the
        current colour when struck, over the same duration token the span
        used. What goes is the *sweep*, left to right, in favour of a fade,
        and that is a real loss against DES-097's motion scale recorded rather
        than quietly taken, the same shape `Reveal` records for its own
        collapse. Two mechanisms for one line was the alternative, and a line
        drawn to the button's padding beside a line drawn under the text is
        two strikes of different lengths on one title.

        The screen reader gains nothing from a decoration either way, which is
        why the Abandoned chip beside it is the non-colour cue section 9 asks
        for and stays exactly where the prototype put it.
        */
        struck
          ? "text-[var(--color-graphite-500)] line-through decoration-current"
          : "text-[var(--color-graphite-800)] line-through decoration-transparent",
        "transition-[color,background-color,text-decoration-color]",
        T_BASE,
      )}
    >
      {task.title || (
        <span className="text-[var(--color-graphite-400)]">Untitled task</span>
      )}
    </span>
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

export function FolderBit({ folder }: { folder: NonNullable<ConceptTask["folder"]> }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      {/* The chosen glyph, like every other place a folder is named. This
          drew the generic mark until F5, the rule was settled and the check
          written to enforce it had a matcher that could not see a tag whose
          props wrapped onto the next line. */}
      <FolderMark name={folder.name} color={folder.color} />
      <span className="truncate">{folder.name}</span>
    </span>
  )
}

export function DueBit({ due }: { due: NonNullable<ConceptTask["due"]> }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[5.5rem] shrink-0 items-center justify-end gap-1.5",
        due.overdue && "font-medium text-[var(--color-danger-700)]",
      )}
    >
      {/* No glyph, in either state. It used to grow a circle-alert when late,
          which said in a picture what the danger red and the word "Overdue"
          beside it already say twice, and it made the trailing column change
          shape with the task's state, so the eye could not learn where the
          date lives. Colour and copy carry lateness; the field stays itself. */}
      {due.label}
    </span>
  )
}


export function PersonBit({
  assignee,
}: {
  assignee: NonNullable<ConceptTask["assignee"]>
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <Face person={assignee} />
      <span className="truncate">{assignee.name.split(" ")[0]}</span>
    </span>
  )
}

export function ExpandButton({
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
export function Actions({
  task,
  onStar,
  onMakeFolder,
  onNewFolderFor,
  onRestore,
  onOpenIn,
  onPull,
  onUnpull,
  onMoveToFolder,
  onAbandon,
  onDelete,
  onHistory,
  onCopyLink,
  onDuplicate,
  extra,
  importantTooltip,
  quietStar = false,
  /* A page shows its controls; a row reveals them on hover. */
  persistent = false,
}: {
  task: ConceptTask
  onStar: () => void
  onMakeFolder?: () => void
  /* Make a folder and put this task in it. Different from `onMakeFolder`,
     which turns the task itself into one, the menu offers both and they must
     not share a handler. */
  onNewFolderFor?: () => void
  onRestore?: () => void
  /*
  The star, at rest, on a page the star defines.

  R2: every row on Important wears a filled gold star, so the star
  distinguishes nothing there, it is decoration on the one page where it
  could carry no information at all. It keeps its place and its press, because
  it is also the only way a task leaves that page; what it drops is the fill.
  */
  quietStar?: boolean
  /* 6 Q4's outward tooltip, which replaces the tooltip alone and never the
     accessible name. Supplied by the page layer on Important and nowhere else;
     see the star below. Seam, S23. */
  importantTooltip?: string
  onOpenIn?: (mode: TaskOpenMode) => void
  /* polish: taskrow F5. Today membership, one of the pair at a time. */
  onPull?: () => void
  onUnpull?: () => void
  onMoveToFolder?: (folder: { name: string; color: string }) => void
  onAbandon?: () => void
  onDelete?: () => void
  onHistory?: () => void
  onCopyLink?: () => void
  onDuplicate?: () => void
  extra?: ReactNode
  persistent?: boolean
}) {
  return (
    <span className="flex shrink-0 items-center justify-end gap-0.5">
      {/* An abandoned task is not a dead one, and the row has to say so.
          Restore appears on hover in the trailing slot, V3's R3, rather
          than living only in the overflow, because a person looking at a
          struck-through row is usually deciding whether to bring it back and
          should not have to open a menu to find out that they can.

          It is the one action that appears *because* of a state rather than
          being present on every row, which is why it leads the gutter: the
          things that are always there keep their positions behind it. */}
      {task.abandoned && onRestore ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onRestore()
                }}
                /*
                **Seam, S23: 9.5's name, which is the word and not the task.**

                The prototype names this "Restore {title}", and the client
                this replaces settled the same point at P8R in the other
                direction: "the restore control's accessible name is 9.5's
                Restore, which is the text it already showed; his aria-label
                of Restore task was overriding that text with a different
                string, so it is gone rather than reworded." Change control
                item 44's A2 ruled 9.1's names table stands.

                **Its cost was measured rather than argued.** A row-scoped
                locator matches a name by substring, so a control carrying
                the task's own title answers to every word in it. AC-097
                asked a row for a button named "Restore" and got this one
                plus a task called "ac-097 restore returns to my day", dying
                of strict mode; AC-220 asked for one named /assignee|assign/
                and got this one, the task being called "ac-097 overdue and
                assigned to the viewer". Two criteria, two different words,
                one cause, and neither is about restoring anything.
                */
                aria-label={RESTORE}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md text-[var(--color-graphite-600)] opacity-0 transition-[opacity,background-color,color] group-hover/row:opacity-100 group-focus-within/row:opacity-100 hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-800)]",
                  T_FAST,
                  FOCUS,
                )}
              >
                <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            }
          />
          <TooltipContent side="top">Restore</TooltipContent>
        </Tooltip>
      ) : null}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onStar()
        }}
        aria-pressed={Boolean(task.important)}
        /*
        **Seam, S23: 9.1's two names, and the tooltip comes apart from them.**

        Three things are wrong here against the sections and each was settled
        once already, at P8 and P8R, on this client's v1 row.

        **The names are 9.5's and 9.1's**, "Important" when on and "Mark as
        important" when off, where the prototype writes "Remove from Important"
        and "Mark as Important". Change control item 44's A2 ruled the table
        stands on all seven of the strings the criteria triage's F3 measured,
        so the lift transcribes them; AC-055's un-star and AC-099 both address
        this control by 9.1's exact string.

        **The name is content and never an `aria-label`.** The whole argument
        is `ui/StarButton.tsx`'s, closed at P8: a label is a *label*, and the
        suite's `formField` helper addresses 9.3's fields by label, so a page
        holding a starred row with the surface open had two elements answering
        to one name. The accessible name is unchanged either way and the glyph
        stays `aria-hidden`, so a glyph swap is still never a rename.

        **And the tooltip is a separate string**, which 6 Q4 requires: on
        Important it turns outward, "Also in Planned, due 3 Sep", while the
        name has to keep saying what pressing the control does. The prototype
        drives no tooltip at all here and leaves `importantTooltip` declared
        and unread; driving both attributes off one string, which the v1 row
        did before P8R, renames the control the moment the tooltip points
        outward. It is a `title` as well as a styled tooltip because "a tooltip
        that exists only while it is open cannot be read", the harness reading
        the attribute immediately after a hover.
        */
        /* Off Important the tooltip is the name, 9.5: "the star's two names
           are 9.1's", and a control with no tooltip at all is what the
           prototype leaves here. On Important it turns outward, which is the
           page layer's decision and arrives as this prop. */
        title={importantTooltip ?? (task.important ? "Important" : "Mark as important")}
        className={cn(
          "flex size-7 items-center justify-center rounded-md transition-[opacity,background-color] hover:bg-[var(--color-graphite-200)] active:scale-90",
          T_FAST,
          FOCUS,
          task.important
            ? "opacity-100"
            : /* polish: taskrow F10. Visible at rest where there is no hover to reveal it. */
                "opacity-0 group-hover/row:opacity-70 group-focus-within/row:opacity-100 hover:!opacity-100 max-md:opacity-70 [@media(hover:none)]:opacity-70",
        )}
      >
        {/*
        Filled or not, and never gold, Imran, 2026-08-22: "the star color are
        not consistent across the shell, somewhere it's gold and somewhere it's
        black, so I think only black is good."

        He is right twice over. It *was* inconsistent, because DES-183 took the
        gold off Important and left it everywhere else. And the colour was
        carrying nothing the fill was not already saying: important is a
        binary, a filled star says it, and a second signal on the same fact is
        one more hue in a product whose whole palette is one accent and
        graphite (W1). So the star is graphite in both states and the fill is
        the whole difference.
        */}
        <span className="sr-only">
          {task.important ? "Important" : "Mark as important"}
        </span>
        <Star
          className={cn(
            "size-[18px] transition-[transform,color]",
            T_FAST,
            task.important && !quietStar
              ? "scale-110 fill-current text-[var(--color-graphite-900)]"
              : "text-[var(--color-graphite-600)]",
          )}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>
      {/*
      The row's menu comes from the contract now (DES-201).

      It was the last hand-written menu of any size, and being hand-written is
      exactly why a task could not be copied, linked, duplicated or asked about
      its history while a folder could, the acts existed in `lib/object-acts`
      and there was nothing here reading them. Six items were written in this
      file and four more were declared and undrawable.

      The trigger keeps its own styling, because hover-reveal is the row's
      business and not the contract's: a gutter of permanent icons would shout
      down the titles, while a page has no row to hover and shows its controls.
      That is what `persistent` decides, and it is why the trigger is passed
      rather than left to `ObjectMenu`'s default.
      */}
      <ObjectMenu
        kind="task"
        name={task.title}
        width="w-56"
        trigger={
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            /* Spec 9.1's names table gives a task row's overflow menu the
               name "More actions". */
            aria-label="More actions"
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-[var(--color-graphite-600)] transition-[opacity,background-color] hover:bg-[var(--color-graphite-200)] data-popup-open:opacity-100",
              T_FAST,
              FOCUS,
              persistent
                ? "opacity-100"
                : /* polish: taskrow F10. Visible at rest where there is no hover to reveal it. */
                "opacity-0 group-hover/row:opacity-70 group-focus-within/row:opacity-100 hover:!opacity-100 max-md:opacity-70 [@media(hover:none)]:opacity-70",
            )}
          >
            <MoreHorizontal className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
          </button>
        }
        handlers={{
          open: onOpenIn
            ? {
                choose: TASK_OPEN_OPTIONS.map(({ key, label, icon: Icon }) => (
                  <DropdownMenuItem
                    key={key}
                    className="whitespace-nowrap"
                    onClick={() => onOpenIn(key)}
                  >
                    <Icon />
                    {label}
                  </DropdownMenuItem>
                )),
              }
            : undefined,
          history: onHistory,
          pull: onPull && !task.pulled ? onPull : undefined,
          unpull: onUnpull && task.pulled ? onUnpull : undefined,
          move: onMoveToFolder
            ? {
                /*
                The person's real folders, not the lab's four, Imran,
                2026-08-22: this menu "still does not carry an update folder
                library". `folderLibrary()` is the one answer, and this menu
                was the third place still reading the hardcoded fixture.

                **And it ends in New folder**, because "none of these" is a
                real answer to "where does this go", and a menu that cannot
                express it sends you elsewhere to do the obvious thing.
                */
                choose: (
                  <>
                    {folderLibrary().map((folder) => (
                      <DropdownMenuItem
                        key={folder.name}
                        className="whitespace-nowrap"
                        onClick={() => onMoveToFolder(folder)}
                      >
                        <FolderMark name={folder.name} color={folder.color} />
                        {folder.name}
                      </DropdownMenuItem>
                    ))}
                    {onNewFolderFor ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="whitespace-nowrap"
                          onClick={onNewFolderFor}
                        >
                          <FolderPlus />
                          New folder…
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </>
                ),
              }
            : undefined,
          "make-folder": onMakeFolder,
          "copy-link": onCopyLink,
          duplicate: onDuplicate,
          /* Abandon and Restore are the same slot seen from two states, so
             only one is ever supplied, which is how an act with no handler
             stays out of the menu without anybody writing a condition. */
          abandon: onAbandon && !task.abandoned ? onAbandon : undefined,
          restore: onRestore && task.abandoned ? onRestore : undefined,
          delete: onDelete,
        }}
      />
      {extra}
    </span>
  )
}

export /* The trailing column keeps a gutter of its own. Without the pr-2 the expand
   chevron sat hard against the row's right edge while every other side had
   breathing room (Imran, 2026-08-18). */
const ROW =
  "group/row grid h-11 w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center rounded-md pr-2 transition-colors"
export const ROW_HOVER = "hover:bg-[var(--color-graphite-100)]"

export function rowProps(
  surface: { onPointerDown: (event: ReactPointerEvent) => void },
  select: ReturnType<ReturnType<typeof useRowSelection>["selectProps"]>,
) {
  return {
    ...select,
    onPointerDown: (event: ReactPointerEvent) => {
      surface.onPointerDown(event)
      select.onPointerDown()
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
  /* Seam, S23. See the badge at the foot of this component. */
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
      **Seam, S23: the row is a list item, and F1 of the criteria triage is
      why this one line is the most expensive in the file.**

      The prototype's row "carries no `listitem` and no `row` role. It is a
      `<div>`", measured in the triage against this file's own class string.
      9.1's roles table fixes "A task row: a list item, or a row", and the
      harness addresses exactly that,
      `getByRole('listitem').or(getByRole('row'))` filtered by the title. **A
      verbatim lift turns 49 cases red at once and none of them measures a
      defect.** 11.13 settles it without a ruling: the role is the section's,
      so the lift owes it.

      It goes on this element rather than on either row body inside it,
      because this is the element a list holds: the one the drag engine
      measures and moves, the one selection tints, and the one that grows to
      contain the card when a row expands. A role on the inner body would put
      the expanded card *outside* the list item that owns it, so a case
      addressing "the row for this task" would stop finding the card the row
      opened into, which is DES-093's whole arrangement.

      The list around it is `TaskList`'s own container below, and for every
      page drawing rows through it, `pages/task-rows.tsx`'s `role="list"`.
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
        "relative rounded-lg border",
        open
          /* Padding rather than margin. The breathing room an open card needs is
             between its own border and the row inside it, and padding is the
             one spacing property a list container cannot reach, `space-y-*`
             and even a flex `gap` govern margins, and both outranked every
             margin form tried here, inline included. */
          ? "py-1.5 border-[var(--color-graphite-300)] bg-card shadow-[var(--elevation-1)]"
          : "border-transparent",
        isSelected &&
          "border-[var(--color-dana-accent-200)] bg-[var(--color-dana-accent-100)]",
        /* Picked up: opaque, lifted, still completely legible. The version
           this replaces faded the row to 40%, which hid the one thing the
           person was actually moving. */
        isActive &&
          "cursor-grabbing border-[var(--color-graphite-300)] bg-card shadow-[var(--elevation-2)]",
        /* Resting on a row is a proposal rather than a drop target, so it is
           a quiet tint that the closing ring explains. Armed is a different
           signal rather than a louder one: the ring is what changed, and the
           row only confirms it.

           Rings rather than borders, because a border changes the box and
           every row in the list would shift by a pixel as the proposal moved
           from one to the next. */
        isDwelling &&
          !isArmed &&
          "bg-[var(--color-dana-accent-50)] ring-1 ring-[var(--color-dana-accent-200)]",
        isArmed && "bg-[var(--color-dana-accent-50)] ring-2 ring-[var(--color-dana-accent-600)]",
        /* The row being carried says where it is going too. It settles very
           slightly smaller once the folder is armed, which is what going
           inside something looks like. */
        isActive && isArmed && "ring-2 ring-[var(--color-dana-accent-600)]",
      )}
    >
      {row}
      <Reveal open={open}>{card}</Reveal>
      {/* The badge rides the row being carried, not the row underneath it.

          It was on the target at first and was invisible there, which is what
          Imran saw: the carried row sits at z-30 directly under the pointer,
          which is exactly where the target's right edge is, so the countdown
          was being painted and then covered by the row that caused it. Fixing
          the stacking would have put a tinted row on top of the one being
          dragged, which reads as the wrong thing moving.

          Riding the carried row is better than either: it is already on top,
          and it is already where the eyes are. */}
      {isActive && (isDwelling || isArmed) ? (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
          <MergeBadge armed={isArmed} />
        </span>
      ) : null}
      {/*
      **Seam, S23: what a release would do, said in words.**

      The prototype's badge above is the merge proposal and the only one it
      has, because the one thing its lab drags a row onto is another row. This
      client also drags a row onto a *container*, a board column, and DES-171's
      rule is the same at both ends: "a container takes the drop and says so",
      words rather than an outline. AC-228 reads "Into {column}" while the
      pointer is still down.

      So the prop is the v1 row's `proposal` unchanged, drawn in the same slot
      as the merge badge and never at the same time as one: a row being merged
      is over another row and a row being placed is over a column, and the
      caller supplies whichever it knows about. It rides the carried row for
      the reason the comment above gives, which was measured rather than
      chosen.
      */}
      {proposal === undefined ? null : (
        <span className="pointer-events-none absolute top-1/2 right-2 z-40 -translate-y-1/2 rounded-full bg-[var(--color-graphite-900)] px-2 py-0.5 text-[0.625rem] font-medium whitespace-nowrap text-[var(--color-graphite-50)]">
          {proposal}
        </span>
      )}
    </div>
  )
}

export function Chip({
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

/* The same chip anatomy as ChipMenu, opening a panel instead of a list.
   Added 2026-08-18 at Imran's direction: the pickers built for the card open
   from the folded row too.

   The row used to offer four preset labels for a due date while the card two
   pixels below it offered a calendar, a clock and five presets, two answers
   to one question, and the row's was the wrong one often enough that changing
   a date meant opening the card first. One picker now, wherever it is opened
   from. The trigger is a button, so the row's drag surface ignores a press
   that lands here and the two gestures never compete. */
export function ChipPicker({
  label,
  children,
  panel,
}: {
  label: string
  children: ReactNode
  panel: ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            onClick={(event) => event.stopPropagation()}
            aria-label={label}
            className={cn("rounded-md", FOCUS)}
          >
            {children}
          </button>
        }
      />
      <PopoverContent align="start" className="w-auto p-2">
        {panel}
      </PopoverContent>
    </Popover>
  )
}

export interface ChipMenuItem {
  key: string
  label: ReactNode
  onSelect: () => void
  /* Puts a hairline above the item: the way *out* of a list, no folder,
     nobody, is not another member of it, and every menu in Dana that offers
     one sets it apart the same way (DES-114). */
  separated?: boolean
}

export function ChipMenu({
  label,
  children,
  items,
}: {
  label: string
  children: ReactNode
  items: ChipMenuItem[]
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
          <Fragment key={item.key}>
            {item.separated ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onClick={item.onSelect}>{item.label}</DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* A chip on the two-line row's detail line: the same anatomy as the card's,
   sized for metadata rather than body text. `interactive` is false for the
   facts you cannot change from a row, a step count, an attachment count, a
   note, so nothing offers an edit it cannot perform. */
export function DetailChip({
  children,
  tone = "neutral",
  interactive = true,
  title,
}: {
  children: ReactNode
  tone?: "neutral" | "danger"
  interactive?: boolean
  /* What a compressed chip stands for, one hover away, the steps ratio is
     the case (R6). */
  title?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 min-w-0 shrink-0 items-center rounded border border-transparent px-1 transition-[background-color,border-color]",
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

export function DetailWord({
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
        className={cn("size-3.5 shrink-0", !color && "text-[var(--color-graphite-400)]")}
        style={color ? { color } : undefined}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      {children}
    </span>
  )
}

/* A folder's detail word, resolving the glyph and colour its owner chose
   (DES-130) rather than drawing the generic mark. Its own component because
   `DetailWord` takes an icon as a prop and identity has to be *looked up*,
   which is a hook, which cannot happen inside a prop expression. */
function FolderDetailWord({
  name,
  color,
}: {
  /* A name rather than the task's folder object, because an unfiled task has
     no object and is still in Desk (DES-155). The resolver answers for both. */
  name: string
  color?: string
}) {
  const mark = useFolderMark(name, color)
  return (
    <DetailWord icon={mark.Icon} color={mark.color}>
      <span className="truncate">{name}</span>
    </DetailWord>
  )
}

/* ------------------------------------------------------ the shipping row, */
/*
`TaskRow` is what the eight screens render. It keeps the call shape the v1 row
had, spread the task's fields, pass the handlers, so porting the design did
not mean rewriting a single screen's markup. What changed is everything behind
that call.

**Where its state lives.** The screens own the facts they already modelled:
title, completion, importance, My Day, folder, due, assignee, step counts.
Those are read from props every render, so a change made anywhere still flows
down. Everything the card can edit that the shell never modelled, notes, a
reminder, the recurrence rule, the step items themselves, is held here as a
layer of local edits on top. That split is honest about the prototype: it runs
on fixtures, and fields the shell has no shape for should not pretend to
persist.

**What it does not do.** No dragging, no dwell-to-folder, no press-and-hold
selection, no bulk bar. Those are Lane 2, and they are drawn in the concept
lab, which is where they are being judged. Wiring them into screens would make
the prototype look as though it had shipped something with no endpoint behind
it. The machinery is exported from this file so the lab can compose it and the
screens do not. DES-103, DES-112, DES-119.
*/

export type TaskStatus = "pending" | "completed" | "abandoned"
export type TaskRowVisualState = "default" | "hover" | "focus" | "selected"

/* Where a task can be held once it leaves the list, the surface's five
   modes plus the tab strip. Owned here because the row is where the choice
   is offered; the surface imports it. */
export type TaskOpenMode = "dialog" | "right" | "tab"

/* The open-in choices, said in icons, labels on hover, the same strip
   grammar the conversation's homes use. */
/* Three homes, ruled by Imran 2026-08-18. Full screen, the left sidebar and
   the floating card are gone: full screen is what a tab already gives with a
   way back, a second sidebar edge is a mirror nobody asked for, and floating
   is the dialog with worse ergonomics. Three destinations a person can hold
   in their head beats six they have to read. */
/*
Where a task can open. One array, read by two controls: the row's "Open in…"
submenu and the surface's own view strip, so the two cannot offer different
places or name them differently.

**The labels are parallel nouns**, and they were not, F5, 2026-08-22. Two
were bare ("Dialog", "Sidebar") and one was a sentence ("Open as a tab"), in a
menu whose own heading already says "Open in…", so the third item read "Open
in… Open as a tab". Each one completes that sentence now, and each still
stands alone as the strip's tooltip.
*/
export const TASK_OPEN_OPTIONS: ViewStripOption<TaskOpenMode>[] = [
  { key: "dialog", label: "Dialog", icon: SquareSquare },
  /* polish: taskcard F11. "Panel", the word Settings uses for the same home. */
  { key: "right", label: "Panel", icon: PanelRight },
  { key: "tab", label: "New tab", icon: ArrowUpRight },
]

export interface TaskRowProps {
  id?: string
  title: string
  /*
  **Seam, S23, and it is `lib/task-model.ts`'s own widening one type over.**

  The prototype's folder is `{name, color}`, because its store is name-keyed
  and a name is the only handle it has. Dana addresses a folder by id (7.4),
  and two things on this surface need one: the assignee menu, whose roster is
  4.4's members of *that* folder, and every write that moves a task, which
  sends `folder_id`. So `id` is added and left optional, which is what
  `ConceptTask.folder` did at S22 for the same reason and with the same words:
  "a lifted card that sets a name and a colour still typechecks and still
  behaves, and a picker written against this client sets the id."

  `toConceptTask` below spreads this straight onto the concept task, so the id
  reaches the card without a second mapping.
  */
  folder?: { name: string; color: string; id?: string }
  /*
  Which section of its folder page this task sits in.

  Imran, 2026-08-22: "A task inside a section should show somewhere ... some
  type of hierarchy is required." A section is the one part of a task's
  address the row never said: you could see the folder, and inside the folder
  the heading told you, but carry that row anywhere else, open it in a
  dialog, look at it in Completed, and the section vanished.

  It rides *after* the folder chip and reads as a path, because that is what
  it is: Travel › Venue & vendors. Absent when there is no section, and
  absent when the row is already sitting under that section's own heading,
  which the folder page decides per list rather than per row.
  */
  section?: string
  /*
  What the list around this row has already said.

  Four of the review's row findings turned out to be one fault with four
  faces, and the fault is a row repeating its own context: **Done** shows a
  due date on work that is finished, under headings that already group by when
  it was finished; **Important** draws a filled star on every row of a page
  defined by the star; **Carried over** paints every date red on a block whose
  membership *is* being late; and the mirror image, an unfiled task showing no
  folder at all when [[DES-155]] says it is in Desk.

  So the rule underneath them: **a row says what its page does not.** The
  section chip has worked this way since DES-166, "absent when the row is
  already sitting under that section's own heading, which the page decides per
  list rather than per row", and this is that decision generalised to every
  fact a heading can carry.

  Decided per list, never per row, for the reason DES-154 keeps giving: a row
  cannot see the heading above it, and a screen that had to remember this on
  every row is a screen that will forget on one.
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
  assignee?: { initials: string; name: string; image?: string }
  pulled?: boolean
  steps?: { complete: number; total: number }
  recurrence?: string
  notes?: string
  /* The conversation the card shows, passed through untouched. DES-129;
     fixtures only, the shell has no message model behind this. */
  comments?: ConceptComment[]
  /*
  The parts of a task only its card shows: the steps themselves, the files,
  and anything the card learns to edit next.

  Imran, 2026-08-22: a task opened in the sidebar did not carry the steps,
  notes, links and attachments added to it inline, "dialog, sidebar, inline,
  and maybe more are just views of the same task row, so the data inside them
  should be the same and updated simultaneously."

  He is right, and the seam that lost them is here. A row's props carry a step
  *count*, because a count is all a row draws, and `toConceptTask` therefore
  had to *invent* the steps from it, "Step 1", "Step 2", which meant a task
  could round-trip through the shell and come back with its steps renamed.
  Attachments had no prop at all, so they could not round-trip in any form.

  One field rather than one per fact, deliberately: the card gains blocks over
  time and each new one would otherwise need a prop, a mapping and a line in
  the shell's patcher, three places to forget. The row spreads this last, so
  whatever the card knows how to edit survives being closed and reopened
  somewhere else.
  */
  detail?: Partial<ConceptTask>
  /*
  Five props left this contract at F6: `visualState`, `showSecondaryActions`,
  `menuOpen`, `unassigned` and `invitePending`.

  They were carried from the v1 row "so the states page keeps compiling", and
  the new row honoured none of them, it draws its own hover and focus, and
  had no drawing at all for the other two. So the state sheet showed four
  identical rows under four different labels and two states that rendered
  nothing, and every one of those lies was *load-bearing*: the props existed
  only to keep the page that told them alive.

  A prop that cannot do anything is DES-144's dead control one level down, and
  the fix is the same one: delete it rather than keep drawing it. The v1 row
  survives whole at `components/task-row-baseline.tsx` for anyone comparing.
  */
  /*
  **Seam, S23: two of those five come back, because here they are not lies.**

  `unassigned` and `invitePending` are driven by real data in this client, Q3's
  chip and 7.4's pending invite, and section 9 is normative on both. The full
  reasoning sits beside the two chips they draw, at the foot of `rowChips`;
  the other three of F6's five stay deleted, having nothing behind them here
  either.
  */
  unassigned?: boolean
  invitePending?: string
  /* **Seam, S25: 9.5's from half.** The person who made this task, drawn only
     where the page asks. See the chip at the foot of `rowChips`. */
  createdBy?: string
  /* What a release would do, drawn on the row being carried. Seam, S23; see
     `ExpandShell`. */
  proposal?: string
  /* Overrides the person's own row height. Only the state sheet passes it,
     and only because showing both is its whole job. */
  density?: RowDensity
  completionPreview?: boolean
  collapsing?: boolean
  /* Open the task somewhere other than in place: the row's own view strip
     and the card's full-screen action both speak through this, naming the
     surface they want. Bare calls mean "full". */
  onOpen?: (mode?: TaskOpenMode) => void
  /* Makes a folder holding this task, and names it. Supplied by TaskList,
     which owns the naming panel; absent for a row rendered outside one, and
     the chip then simply does not offer it, a dead menu item is the fault
     DES-144 removed. */
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
  /* The task surface (full screen, sidebar, floating, a tab) renders the row
     already expanded, the row is the task even there, which is DES-093
     taken at its word. */
  defaultOpen?: boolean
}

/* The shell's flat props into the shape the row and the card actually speak.
   Steps arrive as a count, because a count is all the shell ever stored; they
   are expanded into items so the card can show a real list, and the count in
   the row stays derived from those items so the two can never disagree. */
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
    repeatUnit: props.recurrence === "Daily" ? "day" : "week",
    ...props.detail,
  }
}

/* The card's wiring, extracted so the task surface can hold the same task
   the row holds, one edits layer, one patch, one set of step handlers,
   whether the card sits under a row or fills a page. This is what keeps
   DES-117's one-artifact promise checkable: a surface that re-implemented
   any of this would be a second artifact wearing the first one's clothes. */
export function useCardWiring(props: TaskRowProps) {
  const [edits, setEdits] = useState<Partial<ConceptTask>>({})
  /*
  The server's steps win once they arrive (item 58). Local edits sit over
  the props for as long as the card is looked at, which is right for a title
  or a note and wrong for the one field whose server copy carries something
  the local copy cannot: 7.7's ids, which `writeSteps` diffs by. Keyed on the
  list's content rather than its identity, because every render hands the
  card a fresh array and clearing on identity would drop a tick before its
  write had landed.
  */
  const serverSteps = JSON.stringify(props.steps ?? null)
  useEffect(() => {
    setEdits(({ steps: _dropped, ...rest }) => rest)
  }, [serverSteps])
  /* The shell's write path, reaching a row that nobody handed one to, see
     `lib/task-writer`. A row given `onPatch` still wins. */
  const writer = useTaskWriter()

  /* Props first, local edits over the top. A completion made from the screen
     still reaches the row; a note typed into the card is not thrown away when
     the screen re-renders for some unrelated reason. */
  const task: ConceptTask = { ...toConceptTask(props), ...edits }
  const counts = stepCount(task)
  const steps = task.steps ?? []

  /*
  **Every edit is reported upward, not just completion.**

  This held its edits in local state and told the screen about `done` alone.
  Inside an inline row that is invisible, the row stays mounted, so the local
  copy *is* the task for as long as anyone is looking at it. It stops being
  invisible the moment the same card is opened in a surface, which mounts per
  open and unmounts on close: a task created by the floating button kept its
  empty title for ever, and a rename made in the dialog was discarded the
  instant it closed. Imran, 2026-08-22: "it's not basically saving."

  `onPatch` is the one write path out. A screen that supplies it owns the
  task; one that does not keeps the old local-only behaviour, which is still
  right for a lab or a preview with nowhere to write to.
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
    **Seam, S23: a status the screen owns is told to the screen and not
    also written from here.**

    The prototype reports every field and then tells the screen about the
    completion separately, which costs nothing where both ends are local
    state. Over this seam both ends are the API: `report` reaches
    `lib/task-writer.tsx`, which turns `done` into 7.6's transition, and
    `onToggleComplete` reaches the page's own action, which does the same.
    So one press sent two transitions, and the second answered 409.

    **Worse than the duplicate is which one wins.** 9.5 puts a confirmation
    in front of un-completing a task that generated a successor, and the
    page is where that confirmation lives, because the page is what knows
    it is Done. The writer's transition does not wait for it, so the
    G-SERIES confirm was being asked after the act it gates. AC-162 reads
    exactly that: the declined un-complete "left the completed row
    completed", and it had not.

    So where a screen supplies the handler, the screen owns the act, which
    is the prototype's own sentence, "completion is the screen's fact
    rather than the row's", read as a rule about who writes rather than
    only about who is told. A surface supplies none of these, so the
    writer carries them there and nothing changes for the card.
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
    /* Supplied since RFC 0005 change control item 58 (C), over the endpoint
       B9 was waiting for: `lib/task-acts.ts`'s `moveStepsOut`. Absent
       without an id or a folder, the lab and the capture, where the control
       is then not drawn (DES-144). */
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

/* The row's own view strip: one quiet trigger among the actions, opening the
   horizontal icon row of the six ways a task can be held. Icons only, labels
   on hover, Imran's rule for every view switcher. */
function OpenInControl({
  onPick,
  placement = "row",
}: {
  onPick: (mode: TaskOpenMode) => void
  /* In the row the control hides until hover, like every row action; in the
     card's footer it is always visible, like every footer action. Same
     control, two homes. */
  placement?: "row" | "footer"
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label="Open in…"
                  onClick={(event) => event.stopPropagation()}
                  className={cn(
                    "flex items-center justify-center rounded-md transition-[opacity,background-color,color]",
                    T_FAST,
                    FOCUS,
                    placement === "row"
                      ? "size-7 text-[var(--color-graphite-600)] opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 data-popup-open:opacity-100 hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-800)]"
                      : "size-7 text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)] data-popup-open:bg-[var(--color-graphite-100)]",
                  )}
                >
                  <Fullscreen className="size-4 data-[size=sm]:size-4" strokeWidth={1.75} aria-hidden="true" />
                </button>
              }
            />
          }
        />
        <TooltipContent side="top">Open in…</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-auto p-1">
        <ActionStrip
          ariaLabel="Open this task in"
          options={TASK_OPEN_OPTIONS}
          onSelect={(key) => onPick(key as TaskOpenMode)}
        />
      </PopoverContent>
    </Popover>
  )
}

export function TaskRow(props: TaskRowProps) {
  /* The height is a person's setting, and the one exception is a surface
     showing them both, the state sheet draws one row at each density beside
     the other, which is a thing no reader of the setting can do. */
  const density = props.density ?? useRowDensity()
  const [open, setOpen] = useState(props.defaultOpen ?? false)
  /*
  polish: taskcard F8. An expanded row drew "Step 1 … Step 16", because the
  list's card carries a count and the fallback below invents titles from it.
  The row reads 7.6's detail while it is open, so the inline card shows the
  same steps, notes and reminder the dialog shows. A surface hands `detail`
  in already and reads nothing.
  */
  const fetched = useExpandedDetail(props.detail === undefined ? props.id : undefined, open)
  const { task, patch, counts, cardHandlers } = useCardWiring(
    fetched === undefined ? props : { ...props, detail: { ...fetched, ...props.detail } },
  )
  /*
  **Seam, S23: the assignee menu's roster is the folder's members.**

  The prototype's `peopleLibrary()` takes no argument because its roster is
  the viewer plus every connection, a connection being the only relationship
  its fixtures model. Dana's is 4.4's membership, because 10.2 refuses an
  assignee who is not a member and 9.3's field table says "the target folder's
  members", so the folder has to reach the call. Hoisted here rather than read
  at the chip, whose body is a callback a hook cannot sit in.
  `lib/people-library.ts` carries the rest of the reasoning.
  */
  const roster = usePeopleLibrary(props.folder?.id ?? null)

  /* The row tells its list how to open it, and the list's drag engine calls
     back on a tap. This is what makes tap-to-open a property of the row
     rather than something each screen has to remember to wire, the folder
     page never passed the list an opener, so the behaviour existed on six
     pages and not the seventh. Registering from here, it cannot. */
  const { onRegisterOpen, onOpen } = props
  useEffect(() => {
    if (!onRegisterOpen) return
    onRegisterOpen(onOpen ? () => onOpen() : null)
    return () => onRegisterOpen(null)
  }, [onRegisterOpen, onOpen])

  /* Choosing where a task opens is choosing where tasks open (DES-138): the
     pick is remembered, so the next one lands in the same place. A tab is
     the exception, an action rather than a home. */
  function openIn(mode: TaskOpenMode) {
    if (mode !== "tab") setTaskSurfacePreference(mode)
    props.onOpen?.(mode)
  }

  const given = props.given ?? {}
  /* An unfiled task is in Desk, and the row says so, the same resolver the
     card and the sidebar ask (DES-155). It said nothing at all before, so the
     one task with no folder was the one task whose address was invisible. */
  const folderName = given.folder ? undefined : folderNameOf(task.folder?.name)
  const showDue = Boolean(task.due) && !given.due

  /*
  The detail strip, as a list rather than as eight branches, W2.

  The review's second standing constraint asks for the row's **state-chip and
  assignee slots cut as open sets**, and `docs/design/vision.md` says what
  they are open *for*: work assigned to "a person, an AI agent, or both", and
  states like "waiting, working, blocked, ready for review".

  What stood here was eight hardcoded conditionals in one JSX block. Nothing
  declared what the family was, the order lived in the source sequence where
  no one could review it, `bare` restated all eight conditions by hand and had
  already drifted from them, and each suppression from DES-183 had to be
  remembered separately. A ninth chip meant editing the middle of a hundred
  lines and hoping it landed in the right place.

  As a list, each of those is structural instead: **the order is data**, this
  is the order Imran approved on 2026-08-23, **suppression is declared**
  beside the chip it suppresses, **`bare` is derived** from what is actually
  showing, and adding "blocked" is one entry.

  It is deliberately *not* populated with the vision's states. Dana has two,
  pulled into Today, and abandoned, and drawing "waiting" or "ready for
  review" now would be inventing product rather than shaping a slot for it
  (DES-119). W2 asks for the shape.
  */
  interface RowChip {
    key: string
    /* The `given` fact that silences this chip, when there is one, the page
       has already said it (DES-183). */
    given?: keyof NonNullable<TaskRowProps["given"]>
    shown: boolean
    /* Built on demand, so the condition in `shown` is also the one that
       narrows the values the body reads. */
    body: () => ReactNode
  }

  const rowChips: RowChip[] = [
    {
      key: "due",
      given: "due",
      shown: showDue && Boolean(task.due),
      body: () =>
        !task.due ? null : (

        <ChipPicker label="Due date" panel={<DuePanel task={task} patch={patch} />}>
          {/* Late is a warning, and a warning that is true of every row on the
              block has stopped warning anybody, so inside "Carried over" the
              date keeps its words and drops its red. Elsewhere it keeps
              both. */}
          <DetailChip tone={task.due.overdue && !given.overdue ? "danger" : "neutral"}>
            {/* One glyph for the due field whatever its state; the tone says
                late. */}
            <DetailWord
              icon={CalendarDays}
              tone={task.due.overdue && !given.overdue ? "danger" : "neutral"}
            >
              {task.due.label}
            </DetailWord>
          </DetailChip>
        </ChipPicker>
      ),
    },
    {
      key: "folder",
      given: "folder",
      shown: Boolean(folderName),
      body: () =>
        !folderName ? null : (

        <ChipMenu
          label="Folder"
          /* The person's real folders, not the lab's four (Imran,
             2026-08-22), see lib/folder-library.ts, and "New folder…"
             last, so the menu can always reach a folder that does not exist
             yet. DES-114: every folder list ends there. */
          items={folderLibrary()
            .map((folder) => ({
              key: folder.name,
              label: (
                <span className="inline-flex items-center gap-2">
                  {/* The folder's own mark, so the menu you pick from and the
                      chip you picked show the same thing (DES-130). */}
                  <FolderMark
                    name={folder.name}
                    color={folder.color}
                    className="size-4 data-[size=sm]:size-4"
                  />
                  {folder.name}
                </span>
              ),
              onSelect: () => patch(task.id, { folder }),
            }))
            .concat(
              props.onNewFolder ? [newFolderChoice(props.onNewFolder)] : [],
            )}
        >
          <DetailChip>
            {/* The row wears the folder's chosen glyph and colour, not the
                generic mark, the sidebar has shown them since DES-130 and
                every row was still drawing a plain folder (Imran,
                2026-08-22). */}
            <FolderDetailWord name={folderName} color={task.folder?.color} />
          </DetailChip>
        </ChipMenu>
      ),
    },
    {
      key: "section",
      shown: Boolean(props.section),
      body: () => (

        <DetailChip>
          <span className="inline-flex min-w-0 items-center gap-0.5">
            {/* A chevron rather than a second glyph: the mark before it
                already said "folder", and what this adds is depth, not a
                different kind of thing. */}
            <ChevronRight
              className="size-3 shrink-0 text-[var(--color-graphite-400)]"
              strokeWidth={2}
              aria-hidden="true"
            />
            <span className="truncate">{props.section}</span>
          </span>
        </DetailChip>
      ),
    },
    {
      key: "assignee",
      given: "assignee",
      shown: Boolean(task.assignee) && !given.assignee,
      body: () =>
        !task.assignee ? null : (

        <ChipMenu
          label="Assignee"
          /*
          The real roster, and a way back out of it, W2.

          It mapped `PEOPLE`, three names written for the row lab, which is the
          same fault `folderLibrary` was built to fix one axis over: the list
          you gave work to said "Sara" and "Hassan" while the People screen two
          clicks away said "Sara Khan" and "Hassan Ali". And there was no
          **Unassigned**, so a row could take an assignee and never let one go,
          a closed set in its plainest form.

          Unassigned goes last, after a separator, exactly where "New folder…"
          sits on the folder menu (DES-114): the way out of a list belongs at
          its end.
          */
          items={roster
            .map((person): ChipMenuItem => ({
              key: person.name,
              label: (
                <span className="inline-flex items-center gap-2">
                  <Face person={person} className="size-4 data-[size=sm]:size-4" />
                  {person.name}
                </span>
              ),
              onSelect: () => patch(task.id, { assignee: person }),
            }))
            .concat([
              {
                key: "__unassigned",
                separated: true,
                label: (
                  <span className="inline-flex items-center gap-2">
                    <UserRound className="size-4 data-[size=sm]:size-4" strokeWidth={1.75} />
                    Unassigned
                  </span>
                ),
                onSelect: () => patch(task.id, { assignee: undefined }),
              },
            ])}
        >
          <DetailChip>
            <span className="inline-flex min-w-0 shrink-0 items-center gap-1.5">
              <Face person={task.assignee} className="size-3.5 data-[size=sm]:size-3.5" />
              <span className="truncate">{task.assignee.name}</span>
            </span>
          </DetailChip>
        </ChipMenu>
      ),
    },
    {
      key: "steps",
      shown: Boolean(counts),
      body: () =>
        !counts ? null : (

        /* R6: the ratio is legible at 12px beside its glyph, and the words it
           stands for are one hover away rather than spent on width the row
           does not have. */
        <DetailChip
          interactive={false}
          title={`${counts.done} of ${counts.total} steps done`}
        >
          <DetailWord icon={ListChecks}>
            {counts.done}/{counts.total}
          </DetailWord>
        </DetailChip>
      ),
    },
    {
      key: "repeat",
      shown: Boolean(task.recurrence),
      body: () => (

        <ChipPicker label="Repeat" panel={<RepeatPanel task={task} patch={patch} />}>
          <DetailChip>
            <DetailWord icon={Repeat2}>{repeatShort(task)}</DetailWord>
          </DetailChip>
        </ChipPicker>
      ),
    },
    /* The state family, and the two members Dana actually has. A third
       arrives as a third entry here and nowhere else. */
    {
      key: "state:today",
      shown: Boolean(task.pulled),
      /*
      **Seam, S23: the My Day chip is 9.4's un-pull control where a page
      supplies one.**

      9.4: "a row whose inclusion came from an entry carries the un-pull
      control", named "Remove from Today" by 9.1's table, and its own
      parenthesis says the control is "absent when the row also qualifies
      automatically", which `parts/presenters.ts` already decides and passes
      as `pulled`. The prototype draws the chip and nothing else, because
      `onRemoveFromMyDay` is declared on `TaskRowProps` and read by no
      control in the file: a prop with nowhere to go, which is F6's own fault
      seen from the other side.

      The chip is the right home rather than a second control beside it. It
      already says the one fact the act is about, and a chip that says "My
      Day" next to a button that removes from My Day is the same fact twice,
      which is what DES-154 keeps being about. Where no handler is supplied
      the chip stays exactly as the prototype drew it, which is
      `lib/object-acts.ts`'s rule one component down.
      */
      body: () =>
        !props.onRemoveFromMyDay ? (

        <DetailChip interactive={false}>
          <DetailWord icon={SunMedium}>My Day</DetailWord>
        </DetailChip>
      ) : (
        <DetailChip>
          <button
            type="button"
            aria-label={REMOVE_FROM_TODAY}
            onClick={(event) => {
              event.stopPropagation()
              props.onRemoveFromMyDay?.()
            }}
            className={cn("flex items-center", FOCUS)}
          >
            <DetailWord icon={SunMedium}>My Day</DetailWord>
          </button>
        </DetailChip>
      ),
    },
    {
      key: "state:abandoned",
      shown: Boolean(task.abandoned),
      body: () => (

        <DetailChip interactive={false}>
          <DetailWord icon={Ban}>Abandoned</DetailWord>
        </DetailChip>
      ),
    },
    /*
    **Seam, S23: two adornments the prototype dropped and section 9 keeps.**

    `unassigned` and `invitePending` left `TaskRowProps` at the prototype's F6
    review, alongside the three lab-driven props, and that file's own reason is
    exactly right about its own case: "the new row honoured none of them, it
    draws its own hover and focus, and had no drawing at all for the other two
    ... a prop that cannot do anything is DES-144's dead control one level
    down."

    Here they are not dead. Both are driven by real data and both are
    specified. 9.8's last sentence is normative on one of them, "rows and the
    form show 'Invite pending: sara@example.com' while an assignment-invite is
    outstanding", filled by 7.4's `pending_invite_email`. The other is section
    6's Q3 chip, a null assignee in a folder holding more than one member,
    which `parts/presenters.ts` derives from the folder table the chrome
    already holds. So 11.13 governs and the section wins, which is the ruling
    F1 and F2 took: the lift owes the adornment at a named seam.

    **They are chips of this strip rather than badges beside it**, where the
    v1 row put them, because DES-113's rule for the two densities is that the
    details may differ in where they sit "and in nothing else", and a badge
    outside the strip is a detail the one-line row has nowhere to put. The
    words section 9 writes do not move.

    The triage carried neither, which is a fact about its method rather than a
    fault in it: it swept the browser harness's locators and no browser case
    addresses either chip. The session report says so.
    */
    {
      key: "invite-pending",
      shown: Boolean(props.invitePending),
      body: () =>
        !props.invitePending ? null : (

        <DetailChip interactive={false}>
          <DetailWord icon={UserPlus}>
            Invite pending: {props.invitePending}
          </DetailWord>
        </DetailChip>
      ),
    },
    {
      key: "unassigned",
      shown: Boolean(props.unassigned) && !given.assignee,
      body: () => (

        <DetailChip interactive={false}>
          <DetailWord icon={UserRound}>Unassigned</DetailWord>
        </DetailChip>
      ),
    },
    /*
    **Seam, S25: Assignments' from half, the third adornment the prototype
    dropped and section 9 keeps.**

    9.5 is normative and in terms: "the 'from' half of a row names the
    creator, Dana recording no assigner." The prototype's own screen weighs
    the same fact and lands elsewhere, that "the assignee is this page's spine
    and creator belongs in the filter", which is a reading of the same honesty
    problem rather than a contradiction of it. This client does both: the chip
    is here and the created-by axis landed in `views/filter.ts` beside it.
    Ledger L-224 and L-254 are this chip, and both read *no* with S25 named.

    11.13 governs the difference and the section wins, which is the ruling F1
    and F2 took and the one the two chips above took at S23: the lift owes the
    adornment at a named seam.

    **A chip of this strip rather than a badge beside it**, DES-113's rule for
    the two densities being that the details may differ in where they sit "and
    in nothing else". **And drawn only where a page asks for it**, because a
    creator on every row of every page is the row repeating what nobody asked;
    `parts/presenters.ts` fills it from `context.showCreator`, and Assignments
    is the one page that passes it, which is the same per-list decision
    `given` is and for DES-154's reason.
    */
    {
      key: "created-by",
      shown: Boolean(props.createdBy),
      body: () =>
        !props.createdBy ? null : (

        <DetailChip interactive={false}>
          <DetailWord icon={UserRound}>From {props.createdBy}</DetailWord>
        </DetailChip>
      ),
    },
  ]

  const visibleChips = rowChips.filter((chip) => chip.shown)

  /* Derived rather than restated. The hand-written version listed nine
     conditions and had already fallen out of step with the chips it was
     describing, it still counted `notes` and `attachments`, which have not
     been chips since the card took them. */
  const bare = visibleChips.length === 0

  const details = (
    <div
      hidden={bare}
      className="-ml-1 flex min-w-0 items-center gap-1 overflow-hidden text-[12px] leading-4 text-[var(--color-graphite-500)]"
    >
      {visibleChips.map((chip) => (
        <Fragment key={chip.key}>{chip.body()}</Fragment>
      ))}
    </div>
  )

  const [historyOpen, setHistoryOpen] = useState(false)
  const actions = (
    <Actions
      task={task}
      onStar={() => {
        patch(task.id, { important: !task.important })
        props.onToggleImportant?.()
      }}
      onRestore={task.abandoned ? () => patch(task.id, { abandoned: false }) : undefined}
      quietStar={given.important}
      importantTooltip={props.importantTooltip}
      /* polish: taskrow F8. No "Open in…" in the row menu: the title opens the
         task where the person last chose, the chevron expands it in place, and
         the expanded card's footer is where the surface is chosen. */
      onOpenIn={undefined}
      /* polish: taskrow F5. The page's own act where it has one (Today's
         rows, with its undo), the writer's pull otherwise. Absent without an
         id, the row lab's case. */
      onPull={props.id ? () => patch(task.id, { pulled: true }) : undefined}
      onUnpull={
        props.id
          ? () => {
              if (props.onRemoveFromMyDay) props.onRemoveFromMyDay()
              else patch(task.id, { pulled: false })
            }
          : undefined
      }
      onMoveToFolder={(folder) => patch(task.id, { folder })}
      onNewFolderFor={props.onNewFolder}
      onAbandon={props.onAbandon}
      onDelete={props.onDelete}
      /*
      Two of the three new acts need nothing from the screen.

      A row knows its own id, so it can copy its own link and open its own
      history without a prop threaded through ten call sites, and the object
      contract's rule is that a surface supplies what it can *do*, not what it
      can ask somebody else to do. Duplicate is the exception and stays a prop,
      because adding a task is the shell's business: the row would have nowhere
      to put the copy.

      All three are absent without an id, which is the row lab and the concept
      screens. That is the safety property doing its job rather than a special
      case: no id, no handler, no menu item.
      */
      onHistory={props.id ? () => setHistoryOpen(true) : undefined}
      onCopyLink={props.id ? () => copyTaskLink(props.id!, task.title) : undefined}
      /*
      **Duplicate and "Make this a folder…" are supplied since the loose-ends
      row (RFC 0005 change control item 58, A and B).** The seam that stood
      here recorded that frozen section 7 had no task duplicate; S28a gave it
      `POST /tasks/:id/duplicate` (item 53(e)), and `lib/task-acts.ts` performs
      both acts the way it performs Copy link, from the row's own id, so no
      screen threads a prop. Both are absent without an id, which is the row
      lab and the concept screens: no id, no handler, no menu item.
      */
      onDuplicate={props.id ? () => duplicateTask(props.id!, task.title) : undefined}
      onMakeFolder={props.id ? () => makeFolderOfTask(props.id!, task.title) : undefined}
      /* No standalone "Open in…" here any more (Imran, 2026-08-18): the
         card's footer carries it once the row is open, and the overflow
         carries it while the row is shut. Two routes are enough; a third
         icon in the row's gutter was paying rent it could not afford. */
      extra={
        <>
          <ExpandButton open={open} onToggle={() => setOpen((value) => !value)} />
          {props.id ? (
            <HistorySheet
              kind="task"
              subject={props.id}
              name={task.title}
              open={historyOpen}
              onOpenChange={setHistoryOpen}
            />
          ) : null}
        </>
      }
    />
  )

  const card = (
    <TaskCard
      task={task}
      patch={patch}
      {...cardHandlers}
      openIn={
        props.onOpen ? <OpenInControl onPick={openIn} placement="footer" /> : undefined
      }
      onClose={() => setOpen(false)}
    />
  )

  return (
    <ExpandShell
      open={open}
      card={card}
      itemRef={props.itemRef}
      drag={props.listProps}
      isSelected={props.isSelected}
      isActive={props.dragState?.isActive}
      isDwelling={props.dragState?.isDwelling}
      isArmed={props.dragState?.isArmed}
      isSettling={props.dragState?.isSettling}
      offset={props.dragState?.offset}
      proposal={props.proposal}
      row={
        density === "one" ? (
          <div className={cn(ROW, !open && ROW_HOVER)}>
            <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
            <TaskTitle
              task={task}
              onRename={(title) => patch(task.id, { title })}
              truncate
              heading={open}
              className={cn(T_BASE, open ? "font-semibold" : "font-medium")}
            />
            <span className="flex items-center gap-1">
              {details}
              {actions}
            </span>
          </div>
        ) : (
          <div
            /*
            The row body opens the task (Imran, 2026-08-22: the chevron was
            the only way in). Everything inside the row that *does* something
            is a real control, the checkbox, the title's rename button, every
            chip, the star, the overflow, the chevron, so the guard is one
            `closest` rather than a `stopPropagation` on each, which would be
            a rule every future control has to remember. Whitespace opens; a
            control does its own job.

            It opens rather than expands, and that is the point: expanding is
            the chevron's, and the two are different intentions. Where it
            opens is DES-138's remembered preference, so this respects a
            choice the person already made instead of imposing the dialog.
            */
            onClick={
              /* Only where no drag engine is tracking the row, a board card,
                 say. Inside a list the tap is resolved by the engine, and two
                 paths to one action is how they drift apart. */
              props.onOpen && !props.listProps
                ? (event) => {
                    const target = event.target as HTMLElement
                    if (
                      target.closest(
                        'button, a, input, textarea, [role="menuitem"], [role="checkbox"], [contenteditable="true"]',
                      )
                    ) {
                      return
                    }
                    props.onOpen?.()
                  }
                : undefined
            }
            className={cn(
              "group/row grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center rounded-md pr-2 transition-[background-color,height]",
              T_BASE,
              /* A bare task costs one line, not two. DES-111. */
              bare ? "h-11" : "h-16",
              !open && ROW_HOVER,
              props.onOpen && !open && "cursor-pointer",
            )}
          >
            <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
            <div className="flex min-w-0 flex-col gap-1">
              <TaskTitle
                task={task}
                onRename={(title) => patch(task.id, { title })}
                truncate={false}
                heading={open}
                className={cn(T_BASE, open ? "font-semibold" : "font-medium")}
              />
              {details}
            </div>
            {actions}
          </div>
        )
      }
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
  which a press became, so a row cannot simply take an `onClick`. Both of
  these have been in the object the list builds since F4 and neither was in
  this type, so a `renderRow` screen reaching for them was told they did not
  exist. A contract that omits half of what it hands over is a contract that
  gets rediscovered by whoever needs it next.
  */
  onRegisterOpen: (open: (() => void) | null) => void
  dragState: {
    isActive: boolean
    isDwelling: boolean
    isArmed: boolean
    isSettling: boolean
    offset: number
  }
  /*
  **Seam, S25: what a release would do, for a list that drags into a
  container.**

  S23 gave the row the slot and the words, DES-171's "a container takes the
  drop and says so", and left the list with no way to fill it: the engine's
  `overKey` was never asked for and never handed on, so the only surface that
  drags into a container, the board, could not draw one. AC-228 reads "Into
  {column}" while the pointer is still down, which is the one moment it
  exists. Undefined on every row that is not the carried one.
  */
  proposal?: string
  isSelected: boolean
  selecting: boolean
}

/* ---------------------------------------------------------------- list, */
/*
A list of task rows, and the three behaviours that only exist because they are
a list rather than a row: reordering, the 1.5-second hold that makes a folder
of two tasks, and selecting several to act on at once.

**Why these were nearly left out, and why that was wrong.** The first port
excluded them on the grounds that they are Lane 2, they need a persisted
order and endpoints nobody has written, so they cannot reach `app/`. But this
is `prototype-v2`, and the register's rule for the prototype is the opposite
one, written into DES-119 after the same mistake was made and corrected once
already:

> A Lane 2 idea may still be drawn. The prototype runs on fixtures, so it can
> render anything, and seeing an idea is usually what settles whether it is
> worth a backend. What must never happen is a Lane 2 idea reaching `app/`
> because a session forgot which lane it was in.

Leaving them out made the prototype look finished when it was not. They are
here, and DES-119's table is what keeps them out of `app/`.

**Why it is a component rather than a hook.** The state these behaviours need
belongs to the list and not to any row in it, which row is being carried,
which row it is resting on, what is selected, and a screen that had to hold
that state would be a screen that could get it wrong. A screen renders one of
these per section and passes tasks; everything else is here.
*/

export function TaskList<T extends TaskRowProps & { id: string }>({
  tasks,
  onReorder,
  onDropAt,
  onOver,
  onDragStateChange,
  onMerge,
  onBulk,
  onDuplicate,
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
  ...perRow
}: {
  tasks: T[]
  /*
  **Seam, S23a: the list's arrangement is provisional until the screen says
  otherwise.** The prototype's `onReorder` is a notification and the list
  keeps the new order itself, which is right over fixtures and wrong over 7.6:
  item 44's B4 persists a drag in a folder with no filter or sort applied and
  springs it back everywhere else, and only the screen knows which list it
  is. So the callback also receives the ids in their new order and may
  answer with a promise: `true` once the order endpoint has written and the
  view has been read back, `false` for a refusal or a list that never
  persists. Either way the list then drops its own copy and shows the
  screen's rows, which after a write is the server's order (AC-266's rule
  that the drag reads back in Q2's order) and after a refusal is the order
  the sort put there. A screen that returns nothing keeps the prototype's
  behaviour whole.
  */
  onReorder?: (from: number, to: number, next: string[]) => void | Promise<boolean>
  /*
  Where a row was let go, when it was let go outside this list.

  A list sorts what it holds; a page holds several. Passed through to the drag
  engine so a page with sections can catch a task on its way out of one and
  put it in another, see `onDropAt` in `use-sortable-list`. Returning true
  means the page took it and this list should leave its own order alone.
  */
  onDropAt?: (taskId: string, point: { x: number; y: number }) => boolean
  /* **Seam, S25.** What a release at this point would do, asked while the
     drag is still in the air, so the carried row can say it. It returns the
     words rather than a key, because the words are the only thing the row
     draws and a key would need a second prop to translate. See `proposal` on
     `TaskListWiring`. */
  onOver?: (taskId: string, point: { x: number; y: number }) => string | null
  /* Whether a row in this list is currently being carried. A page with
     sections needs it: the place to drop a task that belongs to none of them
     only has to exist while something is in the air. Pass a stable setter. */
  onDragStateChange?: (dragging: boolean) => void
  onMerge?: (ids: string[], name: string) => void
  onBulk?: (ids: string[], fields: Partial<ConceptTask>) => void
  onDuplicate?: (ids: string[]) => void
  onDelete?: (ids: string[]) => void
  /* Seam, S23a: the id rides along; see `useRowSelection`. */
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
      const next = ordered.map((task) => task.id)
      const [moved] = next.splice(from, 1)
      if (moved) next.splice(to, 0, moved)
      setOrder(next)
      /* Seam, S23a: see `onReorder` on the props. The list's own copy of
         the order is held while the screen answers and dropped when it has,
         whichever way it answered. */
      const answer = onReorder?.(from, to, next)
      if (answer !== undefined) {
        void answer.then(() => setOrder(null))
      }
    },
    /* Resting on a row proposes a folder of the two. Nothing is destroyed on
       release: it opens the naming panel, which can be cancelled. DES-103. */
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
  })

  /* Each row registers how to open itself; the drag engine calls into this
     on a tap. See the comment where `listProps` is built. */
  const openers = useRef(new Map<string, () => void>())

  const selection = useRowSelection({
    onMove: (ids, folder) => onMove?.(ids, folder),
    onNewFolder: (ids) => setPending({ kind: "folder-for", ids }),
    onBulk: (ids, fields) => onBulk?.(ids, fields),
    /* Passed through as given rather than wrapped, so a lab with no
       duplicate act gets a bar with no Duplicate control. */
    onDuplicate,
    onDelete: (ids) => onDelete?.(ids),
  })
  cancelPress.current = selection.clearPress
  /*
  Seam, S23a: a press that became a selection is not a tap.

  The engine resolves a still press as a tap on release and asks the row to
  open (`onTap` in use-sortable-list). In the prototype's lab that press
  opened nothing, because the lab passed no opener; here every row registers
  one, so the 400 ms hold that starts selecting would, on release, also open
  the task it had just selected. The engine's listeners were attached before
  the hold armed and cannot see it, so the opener the list hands the engine
  reads the mode at the moment of release rather than at the press.
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
    /* Seam, S23: the container is a list, which is F1's other half. A
       `listitem` needs a `list` to be an item of, and 9.1's roles table
       fixes both ends of that. See the seam over `ExpandShell` above. */
    <div role="list" className={cn("flex flex-col gap-0.5", className)}>
      {selection.bar}
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
                  /* Seam, S23a: see `selectingNow` above. */
                  if (selectingNow.current) return
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
          dragState: drag.itemState(index),
          /* Seam, S25: the words only the carried row draws, and only while
             a container has been proposed. `overKey` is the label because
             `onOver` returns one; see that prop. */
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
