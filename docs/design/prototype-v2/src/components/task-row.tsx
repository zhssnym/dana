/*
The task row: the single line that stands for a task in a list, and the card it
opens.

This file replaced the v1 row on 2026-08-18. That row is not gone — it is
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
that makes a folder, press-and-hold selection and the bulk bar are Lane 2 —
they need a persisted order and endpoints nobody has written — so they are
drawn in the concept lab, where they are the thing under review, and are not
wired into the screens. DES-103, DES-112 and DES-119 carry the reasoning and
the list. The machinery they use is exported from here so the lab can compose
it; what the lab passes and the screens do not is the difference.
*/

import {
  ArrowUpRight,
  Ban,
  CalendarDays,
  Check as CheckIcon,
  ChevronDown,
  CircleAlert,
  Copy,
  Folder,
  FolderInput,
  FolderPlus,
  Folders,
  Fullscreen,
  ListChecks,
  ListPlus,
  Maximize2,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Paperclip,
  PictureInPicture2,
  Pin,
  SunMedium,
  Repeat2,
  RotateCcw,
  Star,
  Trash2,
  UserPlus,
  UserRound,
  X,
  type LucideIcon,
} from "@/lib/icons"
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"

import {
  DestinationChoice,
  Face,
  IconAction,
  MenuHeading,
  Reveal,
  TaskCard,
  newFolderChoice,
} from "@/components/task-card"
import { DuePanel, RepeatPanel } from "@/components/task-pickers"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ActionStrip, type ViewStripOption } from "@/components/view-strip"
import { useRowDensity } from "@/lib/row-density"
import {
  FOLDERS,
  PEOPLE,
  repeatShort,
  stepCount,
  type ConceptComment,
  type ConceptStep,
  type ConceptTask,
} from "@/lib/task-model"
import { useSortableList } from "@/lib/use-sortable-list"
import { cn } from "@/lib/utils"

/* --------------------------------------------------------------- state -- */

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
        /* Into a task: they stay steps. The new task is unnamed on purpose —
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

/* --------------------------------------------------------------- motion -- */

export const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
export const T_BASE = "duration-[var(--duration-base)] ease-[var(--ease-enter)]"

/* ------------------------------------------------------------ dragging -- */
/*
Dragging a row, and the 1.5 second dwell that turns a reorder into a folder.

Imran's idea, 2026-08-17. Both halves need a backend and neither is approved;
see DES-103. They are drawn because the only way to judge a dwell is to feel
one, and 1.5s is either exactly right or obviously wrong within two attempts.

The interaction has two meanings and the dwell is what separates them. Move,
and you are reordering: the row follows the pointer and the rows it passes
slide out of its way, so where it will land is shown rather than described.
Stop, and after 1.5s over one row the release changes meaning — the two tasks
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
   where a border lives. And nothing anywhere in the gesture was a folder — the
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
   prose, an empty field and two buttons — so what was about to happen had to
   be read, the thing being made had no mark of its own anywhere, and the
   primary action sat disabled until somebody typed, with nothing saying why.

   Now: the folder is drawn, what goes into it is shown as the things
   themselves rather than described in a sentence, and there is always a name
   in the field. The suggestion is a real name — the two titles have a shared
   word often enough to be worth trying — and it is selected on open, so Enter
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

          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus
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
   every concept, for the same reason renaming does — a comparison should
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
  onMove: (ids: string[], folder: { name: string; color: string }) => void
  onNewFolder: (ids: string[]) => void
  onBulk: (ids: string[], fields: Partial<ConceptTask>) => void
  onDuplicate: (ids: string[]) => void
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

  The set is what a to-do list can actually do to several tasks at once —
  complete them, star them, pull them into My Day, move them, copy them, delete
  them — rather than a set chosen to fill a bar. Anything Dana cannot do in
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
          label="Add to My Day"
          onClick={() => {
            onBulk(selected, { pulled: true })
            exit()
          }}
        />

        <DropdownMenu>
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
          <DropdownMenuContent align="end" className="min-w-[16rem]">
            <MenuHeading>
              Move {selected.length} task{selected.length === 1 ? "" : "s"} to
            </MenuHeading>
            {FOLDERS.map((f) => (
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

        <IconAction
          icon={Copy}
          label="Duplicate"
          onClick={() => {
            onDuplicate(selected)
            exit()
          }}
        />
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

/* --------------------------------------------------------------- pieces -- */

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

export function FolderBit({ folder }: { folder: NonNullable<ConceptTask["folder"]> }) {
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

export function DueBit({ due }: { due: NonNullable<ConceptTask["due"]> }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[5.5rem] shrink-0 items-center justify-end gap-1.5",
        due.overdue && "font-medium text-[var(--color-danger-700)]",
      )}
    >
      {due.overdue ? (
        <CircleAlert className="size-4 data-[size=sm]:size-4" strokeWidth={1.75} aria-hidden="true" />
      ) : null}
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
  onRestore,
  extra,
}: {
  task: ConceptTask
  onStar: () => void
  onMakeFolder?: () => void
  onRestore?: () => void
  extra?: ReactNode
}) {
  return (
    <span className="flex shrink-0 items-center justify-end gap-0.5">
      {/* An abandoned task is not a dead one, and the row has to say so.
          Restore appears on hover in the trailing slot — V3's R3 — rather
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
                aria-label={`Restore ${task.title}`}
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
          <DropdownMenuItem>
            <Maximize2 />
            Open full screen
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Copy />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem>
            <FolderInput />
            Move to folder…
          </DropdownMenuItem>
          {onMakeFolder ? (
            <DropdownMenuItem onClick={onMakeFolder}>
              <Folders />
              Make this a folder…
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
}: {
  open: boolean
  row: ReactNode
  card: ReactNode
  drag?: Record<string, unknown>
  itemRef?: (element: HTMLElement | null) => void
  isActive?: boolean
  isDwelling?: boolean
  isArmed?: boolean
  isSettling?: boolean
  offset?: number
  isSelected?: boolean
}) {
  /* The row being carried has to track the pointer exactly, so its transform
     cannot be on a transition — a row that eases towards the cursor reads as
     lag rather than as weight. Every other row is easing, because they are the
     ones making space and that movement is the whole message.

     Durations come from the tokens, so the reduced-motion block turns all of
     this off without this component knowing anything about it. */
  const carrying = isActive && !isSettling
  return (
    <div
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
             one spacing property a list container cannot reach — `space-y-*`
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
   pixels below it offered a calendar, a clock and five presets — two answers
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

export function ChipMenu({
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

/* A chip on the two-line row's detail line: the same anatomy as the card's,
   sized for metadata rather than body text. `interactive` is false for the
   facts you cannot change from a row — a step count, an attachment count, a
   note — so nothing offers an edit it cannot perform. */
export function DetailChip({
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

/* ------------------------------------------------------ the shipping row -- */
/*
`TaskRow` is what the eight screens render. It keeps the call shape the v1 row
had — spread the task's fields, pass the handlers — so porting the design did
not mean rewriting a single screen's markup. What changed is everything behind
that call.

**Where its state lives.** The screens own the facts they already modelled:
title, completion, importance, My Day, folder, due, assignee, step counts.
Those are read from props every render, so a change made anywhere still flows
down. Everything the card can edit that the shell never modelled — notes, a
reminder, the recurrence rule, the step items themselves — is held here as a
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

/* Where a task can be held once it leaves the list — the surface's five
   modes plus the tab strip. Owned here because the row is where the choice
   is offered; the surface imports it. */
export type TaskOpenMode = "dialog" | "full" | "right" | "left" | "float" | "tab"

/* The open-in choices, said in icons, labels on hover — the same strip
   grammar the conversation's homes use. */
export const TASK_OPEN_OPTIONS: ViewStripOption<TaskOpenMode>[] = [
  { key: "dialog", label: "Dialog", icon: Fullscreen },
  { key: "full", label: "Full screen", icon: Maximize2 },
  { key: "right", label: "Sidebar · right", icon: PanelRight },
  { key: "left", label: "Sidebar · left", icon: PanelLeft },
  { key: "float", label: "Floating", icon: PictureInPicture2 },
  { key: "tab", label: "Open as a tab", icon: ArrowUpRight },
]

export interface TaskRowProps {
  id?: string
  title: string
  folder?: { name: string; color: string }
  due?: { label: string; overdue?: boolean }
  status?: TaskStatus
  important?: boolean
  importantTooltip?: string
  assignee?: { initials: string; name: string; image?: string }
  unassigned?: boolean
  pulled?: boolean
  invitePending?: string
  steps?: { complete: number; total: number }
  recurrence?: string
  notes?: string
  /* The conversation the card shows, passed through untouched. DES-129;
     fixtures only — the shell has no message model behind this. */
  comments?: ConceptComment[]
  /* Carried from the v1 row so the states page and the shell keep compiling.
     The new row draws its own hover and focus, so these no longer force a
     look. */
  visualState?: TaskRowVisualState
  showSecondaryActions?: boolean
  menuOpen?: boolean
  completionPreview?: boolean
  collapsing?: boolean
  /* Open the task somewhere other than in place: the row's own view strip
     and the card's full-screen action both speak through this, naming the
     surface they want. Bare calls mean "full". */
  onOpen?: (mode?: TaskOpenMode) => void
  onToggleComplete?: (completed: boolean) => void
  onToggleImportant?: () => void
  onRemoveFromMyDay?: () => void
  onAbandon?: () => void
  onDelete?: () => void
  /* List wiring, supplied by `TaskList` and by nothing else. A row rendered
     on its own — the states page does this — simply has none of it, and is
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
     already expanded — the row is the task even there, which is DES-093
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
    steps,
    comments: props.comments,
    recurrence: Boolean(props.recurrence),
    repeatUnit: props.recurrence === "Daily" ? "day" : "week",
  }
}

/* The card's wiring, extracted so the task surface can hold the same task
   the row holds — one edits layer, one patch, one set of step handlers,
   whether the card sits under a row or fills a page. This is what keeps
   DES-117's one-artifact promise checkable: a surface that re-implemented
   any of this would be a second artifact wearing the first one's clothes. */
export function useCardWiring(props: TaskRowProps) {
  const [edits, setEdits] = useState<Partial<ConceptTask>>({})

  /* Props first, local edits over the top. A completion made from the screen
     still reaches the row; a note typed into the card is not thrown away when
     the screen re-renders for some unrelated reason. */
  const task: ConceptTask = { ...toConceptTask(props), ...edits }
  const counts = stepCount(task)
  const steps = task.steps ?? []

  function patch(_id: string, fields: Partial<ConceptTask>) {
    setEdits((current) => ({ ...current, ...fields }))
    /* Completion is the screen's fact rather than the row's, so it is told. */
    if (fields.done !== undefined) props.onToggleComplete?.(fields.done)
  }

  function patchSteps(next: ConceptStep[]) {
    setEdits((current) => ({ ...current, steps: next }))
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
    moveStepsTo: () => {},
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
   on hover — Imran's rule for every view switcher. */
function OpenInControl({ onPick }: { onPick: (mode: TaskOpenMode) => void }) {
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
                    "flex size-7 items-center justify-center rounded-md text-[var(--color-graphite-600)] opacity-0 transition-[opacity,background-color,color] group-hover/row:opacity-100 group-focus-within/row:opacity-100 data-popup-open:opacity-100 hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-800)]",
                    T_FAST,
                    FOCUS,
                  )}
                >
                  <Maximize2 className="size-4 data-[size=sm]:size-4" strokeWidth={1.75} aria-hidden="true" />
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
  const density = useRowDensity()
  const [open, setOpen] = useState(props.defaultOpen ?? false)
  const { task, patch, counts, cardHandlers } = useCardWiring(props)

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

  const details = (
    <div
      hidden={bare}
      className="-ml-1 flex min-w-0 items-center gap-1 overflow-hidden text-[12px] leading-4 text-[var(--color-graphite-500)]"
    >
      {task.due ? (
        <ChipPicker label="Due date" panel={<DuePanel task={task} patch={patch} />}>
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
          items={FOLDERS.map((folder) => ({
            key: folder.name,
            label: (
              <span className="inline-flex items-center gap-2">
                <Folder
                  className="size-4 data-[size=sm]:size-4"
                  style={{ color: folder.color }}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                {folder.name}
              </span>
            ),
            onSelect: () => patch(task.id, { folder }),
          }))}
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
        <ChipPicker label="Repeat" panel={<RepeatPanel task={task} patch={patch} />}>
          <DetailChip>
            <DetailWord icon={Repeat2}>{repeatShort(task)}</DetailWord>
          </DetailChip>
        </ChipPicker>
      ) : null}
      {task.pulled ? (
        <DetailChip interactive={false}>
          <DetailWord icon={SunMedium}>My Day</DetailWord>
        </DetailChip>
      ) : null}
      {task.abandoned ? (
        <DetailChip interactive={false}>
          <DetailWord icon={Ban}>Abandoned</DetailWord>
        </DetailChip>
      ) : null}
    </div>
  )

  const actions = (
    <Actions
      task={task}
      onStar={() => {
        patch(task.id, { important: !task.important })
        props.onToggleImportant?.()
      }}
      onRestore={task.abandoned ? () => patch(task.id, { abandoned: false }) : undefined}
      extra={
        <>
          {props.onOpen ? <OpenInControl onPick={(mode) => props.onOpen?.(mode)} /> : null}
          <ExpandButton open={open} onToggle={() => setOpen((value) => !value)} />
        </>
      }
    />
  )

  const card = (
    <TaskCard
      task={task}
      patch={patch}
      {...cardHandlers}
      onExpand={props.onOpen ? () => props.onOpen?.("full") : undefined}
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
            className={cn(
              "group/row grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center rounded-md pr-2 transition-[background-color,height]",
              T_BASE,
              /* A bare task costs one line, not two. DES-111. */
              bare ? "h-11" : "h-16",
              !open && ROW_HOVER,
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
  dragState: {
    isActive: boolean
    isDwelling: boolean
    isArmed: boolean
    isSettling: boolean
    offset: number
  }
  isSelected: boolean
  selecting: boolean
}

/* ---------------------------------------------------------------- list -- */
/*
A list of task rows, and the three behaviours that only exist because they are
a list rather than a row: reordering, the 1.5-second hold that makes a folder
of two tasks, and selecting several to act on at once.

**Why these were nearly left out, and why that was wrong.** The first port
excluded them on the grounds that they are Lane 2 — they need a persisted
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
belongs to the list and not to any row in it — which row is being carried,
which row it is resting on, what is selected — and a screen that had to hold
that state would be a screen that could get it wrong. A screen renders one of
these per section and passes tasks; everything else is here.
*/

export function TaskList<T extends TaskRowProps & { id: string }>({
  tasks,
  onReorder,
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
  onReorder?: (from: number, to: number) => void
  onMerge?: (ids: string[], name: string) => void
  onBulk?: (ids: string[], fields: Partial<ConceptTask>) => void
  onDuplicate?: (ids: string[]) => void
  onDelete?: (ids: string[]) => void
  onMove?: (ids: string[], folder: { name: string; color: string }) => void
  /* Per-task callbacks, taking the id, so a screen never has to map rows
     itself just to close over one. */
  onTaskOpen?: (id: string, mode?: TaskOpenMode) => void
  onTaskToggleComplete?: (id: string, completed: boolean) => void
  onTaskToggleImportant?: (id: string) => void
  onTaskRemoveFromMyDay?: (id: string) => void
  onTaskAbandon?: (id: string) => void
  onTaskDelete?: (id: string) => void
  /* An escape hatch for the screens whose rows carry logic of their own —
     a completion that restores an abandoned task, a transition on complete, a
     recurrence successor to warn about. Rather than push all of that into
     this component or flatten it into id-only callbacks, the screen keeps its
     own row and is handed the list wiring to spread onto it. */
  renderRow?: (task: T, wiring: TaskListWiring) => ReactNode
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

  const drag = useSortableList({
    count: ordered.length,
    onLift: () => cancelPress.current(),
    onReorder: (from, to) => {
      const next = ordered.map((task) => task.id)
      const [moved] = next.splice(from, 1)
      if (moved) next.splice(to, 0, moved)
      setOrder(next)
      onReorder?.(from, to)
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

  const selection = useRowSelection({
    onMove: (ids, folder) => onMove?.(ids, folder),
    onNewFolder: (ids) => setPending({ kind: "folder-for", ids }),
    onBulk: (ids, fields) => onBulk?.(ids, fields),
    onDuplicate: (ids) => onDuplicate?.(ids),
    onDelete: (ids) => onDelete?.(ids),
  })
  cancelPress.current = selection.clearPress

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
    <div className={cn("flex flex-col gap-0.5", className)}>
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
          /* Press-and-hold selects; travel drags. Both want pointerdown, so
             they are chained rather than spread over one another — spreading
             silently keeps only the later handler, which is how the row once
             ended up with a drag that never started. */
          listProps: selection.selecting
            ? selection.selectProps(task.id)
            : rowProps(drag.surfaceProps(index), selection.selectProps(task.id)),
          dragState: drag.itemState(index),
          isSelected: selection.selected.includes(task.id),
          selecting: selection.selecting,
        }
        if (renderRow) return renderRow(task, wiring)
        return (
        <TaskRow
          key={task.id}
          {...task}
          {...perRow}
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
