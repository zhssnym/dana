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
  CircleAlert,
  Folder,
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
  Repeat2,
  Redo2,
  Share2,
  Star,
  Undo2,
  UserRound,
  X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  /* Drawn but never shippable as it stands: attachments need storage,
     permissions and a virus story that DES-055 has owed since v1. Here so the
     card can be judged with a third block in it rather than two.

     `kind` is what decides whether the file can be shown or only handed over,
     and it is deliberately a small closed set rather than a MIME type. The
     server has to decide this by sniffing the bytes anyway — a browser will
     happily run a script that a client labelled image/png — so the client
     never sees a MIME type it might be tempted to trust. */
  attachments?: {
    name: string
    meta: string
    kind: "image" | "video" | "document" | "file"
    preview?: string
  }[]
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
    assignee: { initials: "SK", name: "Sara" },
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
  }
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

/* ------------------------------------------------------------ dragging -- */
/*
Dragging a row, and the 1.5 second dwell that turns a reorder into a folder.

Imran's idea, 2026-08-17. Both halves need a backend and neither is approved;
see DES-103. They are drawn because the only way to judge a dwell is to feel
one, and 1.5s is either exactly right or obviously wrong within two attempts.

The interaction has two meanings and the dwell is what separates them. Drop
straight away and the row reorders. Hold over another row and after 1.5s the
drop changes meaning: release now and the two tasks become a folder. A hidden
mode is a bad idea unless the mode announces itself, so the target row fills a
bar over exactly the dwell duration and then says what releasing will do. The
bar is not decoration; it is the only reason the delay is not a mystery.

Nothing is destroyed on drop. Releasing opens a panel that names the folder and
can be cancelled, because "I dragged one task slightly onto another" and "I
want a new folder" should not be the same gesture with no way back.
*/

const DWELL_MS = 1500

/* Plain drag reorder, no dwell and no second meaning. Used for the blocks
   inside a card, which only ever need to change places.

   The dragged item lands where the target was rather than swapping with it,
   because a swap is not what a list looks like it is doing when you drop
   something in the middle of one. */
function useSimpleDrag<T extends string>(
  order: T[],
  setOrder: (next: T[]) => void,
) {
  const [dragKey, setDragKey] = useState<T | null>(null)
  const [overKey, setOverKey] = useState<T | null>(null)

  function dragProps(key: T) {
    return {
      draggable: true,
      onDragStart: (e: DragEvent) => {
        e.stopPropagation()
        e.dataTransfer.effectAllowed = "move"
        e.dataTransfer.setData("text/plain", key)
        setDragKey(key)
      },
      onDragEnd: (e: DragEvent) => {
        e.stopPropagation()
        setDragKey(null)
        setOverKey(null)
      },
      onDragOver: (e: DragEvent) => {
        /* stopPropagation so dragging a block never reads as dragging the row
           the card belongs to. Two nested reorderable lists is exactly where
           this goes wrong. */
        e.preventDefault()
        e.stopPropagation()
        if (dragKey && dragKey !== key) setOverKey(key)
      },
      onDragLeave: (e: DragEvent) => {
        e.stopPropagation()
        setOverKey((current) => (current === key ? null : current))
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const from = dragKey
        setDragKey(null)
        setOverKey(null)
        if (!from || from === key) return
        const next = [...order]
        const at = next.indexOf(from)
        next.splice(at, 1)
        next.splice(next.indexOf(key) + (order.indexOf(from) < order.indexOf(key) ? 1 : 0), 0, from)
        setOrder(next)
      },
    }
  }

  return {
    dragProps,
    state: (key: T) => ({
      isDragging: dragKey === key,
      isOver: overKey === key,
    }),
  }
}

interface DragState {
  dragId: string | null
  /* The row currently under the pointer. Set the moment you arrive, which is
     what starts the bar filling. */
  hoverId: string | null
  /* The row you have stayed on long enough. Set when the timer fires, which is
     what changes what a release means. */
  dwellId: string | null
}

/* The bar that makes the delay visible. Mounted only while a dwell is running,
   so its width transition starts from zero every time. */
function DwellBar() {
  const [grown, setGrown] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-full"
    >
      <span
        className="block h-full rounded-full bg-[var(--color-dana-accent-600)]"
        style={{
          width: grown ? "100%" : "0%",
          transition: `width ${DWELL_MS}ms linear`,
        }}
      />
    </span>
  )
}

type PendingAction =
  | { kind: "merge"; ids: string[]; titles: string[] }
  | { kind: "promote"; id: string; title: string; steps: number }

function useRowDrag({
  reorder,
  onMerge,
}: {
  reorder: (fromId: string, toId: string) => void
  onMerge: (ids: string[], titles: string[]) => void
}) {
  const EMPTY: DragState = { dragId: null, hoverId: null, dwellId: null }
  const [state, setState] = useState<DragState>(EMPTY)
  const timer = useRef<number | null>(null)
  /* A ref mirror, because drag handlers fire far more often than React
     re-renders and reading `state` inside one gives you the value from
     whenever that handler was created. This is the bug that makes a drop land
     on the wrong row roughly one time in five. */
  const live = useRef<DragState>(EMPTY)

  function apply(next: DragState) {
    live.current = next
    setState(next)
  }

  function clearTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }

  useEffect(() => clearTimer, [])

  function dragProps(task: ConceptTask, tasks: ConceptTask[]) {
    return {
      draggable: true,
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.effectAllowed = "move"
        /* Firefox refuses to start a drag with no payload. */
        e.dataTransfer.setData("text/plain", task.id)
        apply({ dragId: task.id, hoverId: null, dwellId: null })
      },
      onDragEnd: () => {
        clearTimer()
        apply(EMPTY)
      },
      onDragOver: (e: DragEvent) => {
        e.preventDefault()
        const current = live.current
        if (!current.dragId || current.dragId === task.id) return
        if (current.hoverId === task.id) return
        /* Arriving at a new row restarts the clock, so dragging across a list
           never accumulates dwell from rows merely passed over. */
        clearTimer()
        apply({ ...current, hoverId: task.id, dwellId: null })
        timer.current = window.setTimeout(() => {
          if (live.current.hoverId !== task.id) return
          apply({ ...live.current, dwellId: task.id })
        }, DWELL_MS)
      },
      onDragLeave: () => {
        if (live.current.hoverId !== task.id) return
        clearTimer()
        apply({ ...live.current, hoverId: null, dwellId: null })
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        clearTimer()
        const { dragId, dwellId } = live.current
        apply(EMPTY)
        if (!dragId || dragId === task.id) return
        if (dwellId === task.id) {
          const dragged = tasks.find((t) => t.id === dragId)
          if (dragged) onMerge([dragId, task.id], [dragged.title, task.title])
          return
        }
        reorder(dragId, task.id)
      },
    }
  }

  function rowState(id: string) {
    return {
      isDragging: state.dragId === id,
      isHovered: state.hoverId === id && state.dragId !== id,
      isDwelt: state.dwellId === id,
    }
  }

  return { dragProps, rowState }
}

/* The panel both gestures land in. Deliberately not a dialog: the point of
   these two ideas is that you never leave the list. */
function PendingPanel({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingAction
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(
    pending.kind === "promote" ? pending.title : "",
  )

  return (
    <div
      className={cn(
        "mb-2 rounded-lg border border-[var(--color-dana-accent-200)] bg-[var(--color-dana-accent-50)] px-3 py-2.5",
        T_BASE,
      )}
    >
      <p className="text-[14px] leading-5 text-[var(--color-dana-accent-800)]">
        {pending.kind === "merge" ? (
          <>
            Put <strong>{pending.titles[0]}</strong> and{" "}
            <strong>{pending.titles[1]}</strong> in a new folder. Both tasks
            move into it; neither is changed otherwise.
          </>
        ) : (
          <>
            Turn <strong>{pending.title}</strong> into a folder.{" "}
            {pending.steps > 0 ? (
              <>
                Its {pending.steps} step{pending.steps > 1 ? "s" : ""} become{" "}
                {pending.steps > 1 ? "tasks" : "a task"} inside it, and the task
                itself stops existing.
              </>
            ) : (
              <>It has no steps, so the folder starts empty and the task stops existing.</>
            )}
          </>
        )}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onConfirm(name.trim())
            if (e.key === "Escape") onCancel()
          }}
          placeholder="Folder name"
          aria-label="Folder name"
          className={cn(
            "h-8 flex-1 rounded-md border border-[var(--color-graphite-300)] bg-card px-2 text-[14px] leading-5 text-[var(--color-graphite-800)] outline-none",
            "focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)]",
          )}
        />
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            "rounded-md px-3 py-1.5 text-[14px] leading-5 text-[var(--color-graphite-700)] transition-colors hover:bg-[var(--color-graphite-100)]",
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
            "rounded-md bg-[var(--color-graphite-900)] px-3 py-1.5 text-[14px] leading-5 font-medium text-white transition-[background-color,transform] hover:bg-[var(--color-graphite-800)] active:scale-95 disabled:opacity-40",
            T_FAST,
            FOCUS,
          )}
        >
          Create folder
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
function useRowSelection({
  onMove,
}: {
  onMove: (ids: string[], folder: { name: string; color: string }) => void
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

  const bar = (
    <Reveal open={selecting}>
      <div className="mb-2 flex items-center gap-2 rounded-md bg-[var(--color-dana-accent-50)] px-2 py-1.5">
        <button
          type="button"
          onClick={exit}
          aria-label="Leave selection"
          className={cn(
            "flex size-5 items-center justify-center rounded text-[var(--color-dana-accent-800)] transition-colors hover:bg-[var(--color-dana-accent-100)]",
            T_FAST,
            FOCUS,
          )}
        >
          <X className="size-4" strokeWidth={2} aria-hidden="true" />
        </button>
        <span className="text-[12px] leading-4 font-medium text-[var(--color-dana-accent-800)]">
          {selected.length || lastCount.current} selected
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className={cn(
                  "ml-auto rounded-md bg-card px-2 py-1 text-[12px] leading-4 font-medium text-[var(--color-graphite-800)] transition-colors hover:bg-[var(--color-graphite-50)]",
                  T_FAST,
                  FOCUS,
                )}
              >
                Move to…
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Reveal>
  )

  return { selecting, selected, selectProps, bar }
}

function useConceptList() {
  const list = useTaskList(SAMPLE)
  const [pending, setPending] = useState<PendingAction | null>(null)

  const drag = useRowDrag({
    reorder: list.reorder,
    onMerge: (ids, titles) => setPending({ kind: "merge", ids, titles }),
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
    else list.taskToFolder(pending.id)
    setPending(null)
  }

  const selection = useRowSelection({
    onMove: (ids, folder) =>
      ids.forEach((id) => list.patch(id, { folder })),
  })

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

  return { ...list, drag, panel, requestPromote, selection }
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
    "block w-fit max-w-full min-w-0 text-[14px] leading-5",
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
      /* See DES-108: a text-size class on a button is suppressed by an
         unlayered reset, so the one size that has to change is set here. */
      style={heading ? { fontSize: "16px", lineHeight: "24px" } : undefined}
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
  onMakeFolder,
  extra,
}: {
  task: ConceptTask
  onStar: () => void
  onMakeFolder?: () => void
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
          {onMakeFolder ? (
            <DropdownMenuItem onClick={onMakeFolder}>
              Make this a folder…
            </DropdownMenuItem>
          ) : null}
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

FOURTH PASS, 2026-08-17: the body is now an ordered list of blocks. Steps,
Notes and Attachments can each be moved up or down from the menu on their
heading, and each keeps its own open state across the move because the blocks
are keyed rather than positional.

Imran asked whether this could work "like a block in Notion, where the user
writes it and it appears". The answer, and the reason this is built the way it
is: **there are two different products behind that question, and this is the
cheap one.**

The expensive one is Notion's actual model — a document of arbitrary blocks,
any type, any depth, created by typing. That needs a stored document schema, a
rich text editor, collaborative editing rules for a shared task, and a
migration for every note already written as a string. It is DES-055 and
DES-101, and it has been owed since v1 precisely because it is that large.

The cheap one is what is on screen: a **closed set of typed blocks** that can
be reordered, each already knowing how to render and edit itself. It gives
almost all of the feeling people mean by "Notion-like" — the card is a stack
you arrange rather than a form somebody laid out for you — for a fraction of
the cost, because the only thing that has to be stored is an order.

The honest limit is worth stating rather than discovering: you cannot invent a
block that Dana does not already have. If somebody wants a table, or three
separate note blocks, this model says no and the expensive one is the only
answer. Whether that limit is acceptable is a product question, and it is
DES-102.
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
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-transparent px-2 text-[14px] leading-5 transition-[background-color,border-color]",
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
  drag,
  isDragging = false,
  isOver = false,
}: {
  icon: LucideIcon
  label: string
  badge?: string
  children: ReactNode
  drag?: Record<string, unknown>
  isDragging?: boolean
  isOver?: boolean
}) {
  /* Open by default. See the block comment above TaskCard: the card's job on
     the first visit is to answer, not to tidy. */
  const [open, setOpen] = useState(true)

  return (
    <div
      {...drag}
      className={cn(
        "group/sec rounded-md transition-[opacity,box-shadow]",
        T_FAST,
        isDragging && "opacity-40",
        /* The drop target is marked by a line where the block will land, not
           by a filled box: a fill competes with the shaded details strip and
           reads as a second grouped region. */
        isOver &&
          "shadow-[inset_0_2px_0_0_var(--color-dana-accent-600)]",
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
            you grab, and it is why the heading does not need a menu. */}
        <span
          aria-hidden="true"
          className={cn(
            "flex size-3.5 shrink-0 cursor-grab items-center justify-center text-[var(--color-graphite-400)] opacity-0 transition-opacity group-hover/sec:opacity-100 active:cursor-grabbing",
            T_FAST,
          )}
        >
          <GripVertical className="size-3.5" strokeWidth={2} />
        </span>
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

Imran asked for movable steps, multi-select, and options to make a new task
from the selection or to turn them into separate tasks here or in another
folder. He also said he had not decided. This is the recommendation, drawn so
it can be rejected by using it; the alternative is in DES-106.

The problem is not any one of those commands, it is that they were arriving one
at a time and the menu was going to end up reading: promote step to task,
promote task to folder, make new task from these steps, make these steps into
tasks here, make these steps into tasks elsewhere. Five verbs, one idea. A
product needing five names for one operation has not found the operation yet.

So there is one verb, **Move to…**, and the destination decides what happens:

    a step moved into a FOLDER becomes a task, because folders hold tasks
    the same steps moved into a TASK stay steps, because tasks hold steps

Level is a consequence of where a thing lands, never a separate command. "Make
a new task from these" is then just Move to → New task, and "make them separate
tasks in another folder" is Move to → that folder. Nothing needs a new name,
and the rule extends without new menu items the day something else can hold
something else.

Selection is by clicking a step's text; the tick box still only ticks. Those
are two different intentions and giving them one target is how people
accidentally complete things they meant to select.
*/

/*
The card's footer, and why there is no Save button on it.

Imran's call, 2026-08-17, and it is the right one for a reason worth writing
down: **there was nothing for Save to do.** Every edit in this card already
commits the moment it is made — a rename on Enter or blur, a property on
choosing it, a step on ticking it. A Save button at the bottom of a card that
has already saved is a promise the interface cannot keep, and the honest name
for the thing people press afterwards is Close.

Removing it costs the escape hatch, though, so the footer has to replace it
rather than just delete it. That is what undo and redo are doing here: they
are not a nicety, they are the safety net that Save-and-Cancel used to
provide, and the reason it is safe to have no Cancel.

The rest of the row, and my reasoning on each, since Imran asked:

- **Expand** — recommended, and the most valuable icon here. The card lives
  inside a list column, and DES-093's strongest objection is width: a form
  comfortable at 540px has to stack into something much narrower. An expand
  that opens the same task full-width answers that objection instead of
  arguing with it, and it costs nothing to offer.
- **Copy link** — recommended over email as the primary sharing action.
  Sharing usually means putting a link where a conversation already is, and a
  link works in every one of those places. Email is one destination; a link is
  all of them.
- **Share** and **email** — kept because they were asked for, but both are
  Lane 2 and neither is small. Dana shares *folders*: membership is a property
  of a folder and a task has no independent audience, so "share this task"
  either invites somebody to the whole folder — which is not what the button
  appears to promise — or it is a new sharing model. That is DES-109.
- **History** — added. It is the only way to answer "who changed this", it is
  where an undone change goes to be understood, and `task-form.tsx` already
  reaches for the same icon.

What is deliberately NOT here: Delete. The row's overflow menu already carries
it, and the repository has already been bitten once by two menus both called
"More actions"; putting a destructive action in a second place is how that
happens again.
*/
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
            onClick={(e) => {
              e.stopPropagation()
              onClick?.()
            }}
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-[var(--color-graphite-600)] transition-[background-color,color] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)] disabled:pointer-events-none disabled:opacity-35",
              T_FAST,
              FOCUS,
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        }
      />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

function CardFooter({ onClose }: { onClose: () => void }) {
  /* Undo has nothing to undo until something is done, and saying so with a
     disabled control is more honest than offering one that does nothing. */
  const [undoDepth, setUndoDepth] = useState(0)

  return (
    <div className="flex items-center justify-between gap-2 pt-1">
      <span className="truncate text-[12px] leading-4 text-[var(--color-graphite-500)]">
        Edited just now by Imran Wafa · saved
      </span>
      <span className="flex shrink-0 items-center gap-0.5">
        <FooterAction
          icon={Undo2}
          label="Undo"
          disabled={undoDepth <= 0}
          onClick={() => setUndoDepth((d) => d - 1)}
        />
        <FooterAction
          icon={Redo2}
          label="Redo"
          disabled={undoDepth >= 0}
          onClick={() => setUndoDepth((d) => d + 1)}
        />
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
        <FooterAction icon={History} label="History" />
        <FooterAction icon={Maximize2} label="Open full screen" />
        <FooterAction icon={X} label="Close" onClick={onClose} />
      </span>
    </div>
  )
}

/* A heading inside a menu. Deliberately not Base UI's GroupLabel, which
   requires a Group ancestor and throws if it does not have one — taking the
   entire popup with it rather than losing a heading. Nothing about a caption
   needs that risk. */
function MenuHeading({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 py-1.5 text-[12px] leading-4 font-medium text-[var(--color-graphite-500)]">
      {children}
    </div>
  )
}

/* One menu row: a mark, a name, and a sentence saying what choosing it does.
   Shared by the step menu and the task-row menu so the two never drift into
   describing the same operation differently. */
function DestinationChoice({
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

function StepList({
  task,
  toggleStep,
  moveStep,
  moveStepsTo,
}: {
  task: ConceptTask
  toggleStep: (id: string, index: number) => void
  moveStep: (id: string, from: number, to: number) => void
  moveStepsTo: (
    id: string,
    indices: number[],
    destination:
      | { kind: "new-task" }
      | { kind: "folder"; name: string; color: string },
  ) => void
}) {
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const pressTimer = useRef<number | null>(null)
  /* When the long press fired, rather than whether it fired. A boolean here
     is wrong: it has to be cleared by the click that follows the press, and
     that click does not always arrive — touch suppresses it, and so does
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

  if (steps.length === 0) {
    return (
      <p className="py-1 text-[14px] leading-5 text-[var(--color-graphite-400)]">
        No steps yet
      </p>
    )
  }

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

  const move = (destination: Parameters<typeof moveStepsTo>[2]) =>
    moveStepsTo(task.id, [...selected].sort((a, b) => a - b), destination)

  return (
    <div className="flex flex-col">
      {steps.map((step, i) => {
        const isSelected = selected.includes(i)

        return (
          <div
            key={`${step.title}-${i}`}
            draggable={!selecting}
            onDragStart={(e) => {
              e.stopPropagation()
              e.dataTransfer.effectAllowed = "move"
              e.dataTransfer.setData("text/plain", String(i))
              setDragFrom(i)
            }}
            onDragEnd={(e) => {
              e.stopPropagation()
              setDragFrom(null)
              setOverIndex(null)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (dragFrom !== null && dragFrom !== i) setOverIndex(i)
            }}
            onDragLeave={(e) => {
              e.stopPropagation()
              setOverIndex((current) => (current === i ? null : current))
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (dragFrom !== null && dragFrom !== i) moveStep(task.id, dragFrom, i)
              setDragFrom(null)
              setOverIndex(null)
            }}
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
            className={cn(
              "group/step flex h-8 items-center gap-2 rounded-md pr-1 transition-[background-color,opacity,box-shadow]",
              T_FAST,
              selecting && "cursor-pointer select-none",
              dragFrom === i && "opacity-40",
              overIndex === i &&
                "shadow-[inset_0_2px_0_0_var(--color-dana-accent-600)]",
              isSelected
                ? "bg-[var(--color-dana-accent-100)]"
                : "hover:bg-[var(--color-graphite-50)]",
            )}
          >
            {/* One slot, two jobs: the drag handle normally, the selection
                mark once selecting. They never appear together, so the row
                never grows a second control. */}
            <span
              aria-hidden="true"
              className="-ml-[18px] flex size-4 shrink-0 items-center justify-center"
            >
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
                <span
                  className={cn(
                    "flex size-4 cursor-grab items-center justify-center text-[var(--color-graphite-400)] opacity-0 transition-opacity group-hover/step:opacity-100 active:cursor-grabbing",
                    T_FAST,
                  )}
                >
                  <GripVertical className="size-3.5" strokeWidth={2} />
                </span>
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
              </button>
            )}

            <span
              className={cn(
                "flex-1 truncate text-[14px] leading-5 transition-colors",
                T_BASE,
                step.done
                  ? "text-[var(--color-graphite-500)] line-through decoration-[var(--color-graphite-400)]"
                  : "text-[var(--color-graphite-800)]",
              )}
            >
              {step.title}
            </span>
          </div>
        )
      })}

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
            <X className="size-4" strokeWidth={2} aria-hidden="true" />
          </button>
          <span className="text-[12px] leading-4 font-medium text-[var(--color-dana-accent-800)]">
            {selected.length || lastCount.current} selected
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "ml-auto rounded-md bg-card px-2 py-1 text-[12px] leading-4 font-medium text-[var(--color-graphite-800)] transition-colors hover:bg-[var(--color-graphite-50)]",
                    T_FAST,
                    FOCUS,
                  )}
                >
                  <span className="text-[12px] leading-4">Move to…</span>
                </button>
              }
            />
            {/* Each choice says what it does in plain words on a second line,
                because "New task" and "Wedding" look like the same kind of
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
                {FOLDERS.map((f) => (
                  <DropdownMenuItem
                    key={f.name}
                    onClick={() => {
                      move({ kind: "folder", name: f.name, color: f.color })
                      exit()
                    }}
                  >
                    <DestinationChoice
                      icon={Folder}
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Reveal>
    </div>
  )
}

/*
Attachments, and what "viewable" means.

Imran asked whether people could attach images, GIFs, video and more or less
any file, with the viewable ones openable in place. They can, and the design
question underneath it is the one worth being precise about: **viewable is a
decision the server makes, not a property of the file's name.**

Three tiers, and every file lands in exactly one:

- **Shown**: images and video. A thumbnail in the list, and the thing itself
  when opened, inline, without leaving the task.
- **Openable**: PDFs, and anything the browser can render in a viewer. Not
  thumbnailed here, opened in place when asked.
- **Handed over**: everything else. An icon, a name, a size, a download. No
  pretence that Dana can show you a .docx.

The trap, recorded because it is the one that turns an attachment feature into
a security incident: a file's declared type is supplied by whoever uploaded it,
and an SVG or an HTML file served inline from Dana's own origin runs as Dana.
The type has to be decided by sniffing the bytes server-side, SVG has to be
treated as a document rather than an image unless it is sanitised, and anything
in the third tier has to be served with Content-Disposition: attachment. This
is why `kind` above is a small closed set rather than a MIME string.
*/

/* The three block types the card can hold. A closed set, deliberately: see
   the note on a Notion-style editor in this file's TaskCard comment. */
type BlockKey = "steps" | "notes" | "attachments"

const ATTACHMENT_ICON: Record<
  NonNullable<ConceptTask["attachments"]>[number]["kind"],
  LucideIcon
> = {
  image: ImageIcon,
  video: Film,
  document: FileText,
  file: Paperclip,
}

function AttachmentList({ files }: { files: NonNullable<ConceptTask["attachments"]> }) {
  const [openName, setOpenName] = useState<string | null>(null)

  return (
    <div className="flex flex-col">
      {files.map((file) => {
        const Icon = ATTACHMENT_ICON[file.kind]
        const viewable = file.kind === "image" || file.kind === "video"
        const isOpen = openName === file.name

        return (
          <div key={file.name}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (viewable) setOpenName(isOpen ? null : file.name)
              }}
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
                        className="size-3.5 fill-white text-white drop-shadow"
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
              <span className="shrink-0 text-[12px] leading-4 text-[var(--color-graphite-400)]">
                {viewable ? (isOpen ? "Hide" : "View") : "Download"}
              </span>
            </button>
            {/* Only a file that can actually be shown gets a viewer. The
                guard is on `preview` rather than on `kind` because a viewable
                kind with no generated preview is a real state — the thumbnail
                job can fail or still be queued — and rendering an <img> with
                no source produces a broken frame rather than an honest row. */}
            {viewable && file.preview ? (
              <Reveal open={isOpen}>
                <div className="px-1 pb-2">
                  <img
                    src={file.preview}
                    alt={file.name}
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

function TaskCard({
  task,
  patch,
  toggleStep,
  moveStep,
  moveStepsTo,
  onClose,
}: {
  task: ConceptTask
  patch: (id: string, fields: Partial<ConceptTask>) => void
  toggleStep: (id: string, index: number) => void
  moveStep: (id: string, from: number, to: number) => void
  moveStepsTo: (
    id: string,
    indices: number[],
    destination:
      | { kind: "new-task" }
      | { kind: "folder"; name: string; color: string },
  ) => void
  onClose: () => void
}) {
  const counts = stepCount(task)
  const [order, setOrder] = useState<BlockKey[]>([
    "steps",
    "notes",
    "attachments",
  ])

  const blockDrag = useSimpleDrag<BlockKey>(order, setOrder)

  /* Grab the heading and drop it where you want it. There is no menu for this
     and there should not be: a list you can drag is understood without being
     explained, and a Move up item is what a design reaches for when it has not
     made dragging work. */
  function moveProps(key: BlockKey) {
    return {
      drag: blockDrag.dragProps(key),
      ...blockDrag.state(key),
    }
  }

  /* The card body is an ordered list of blocks rather than a fixed layout, so
     Notes can sit above Steps if that is how somebody thinks about this task.
     Order lives in component state here and would need somewhere to live for
     real: see DES-102. Each block keeps its own open/closed state across a
     move because it is keyed, not positional. */
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
            <p className="py-1 text-sm leading-6 text-[var(--color-graphite-700)]">
              {task.notes ?? (
                <span className="text-[var(--color-graphite-400)]">
                  Nothing written yet
                </span>
              )}
            </p>
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
        ) : (
          <p className="py-1 text-sm text-[var(--color-graphite-400)]">
            Nothing attached
          </p>
        )}
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

      {order.map((key) => blocks[key])}

      <CardFooter onClose={onClose} />
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
  drag,
  isDragging = false,
  isHovered = false,
  isDwelt = false,
  isSelected = false,
}: {
  open: boolean
  row: ReactNode
  card: ReactNode
  drag?: Record<string, unknown>
  isDragging?: boolean
  isHovered?: boolean
  isDwelt?: boolean
  isSelected?: boolean
}) {
  return (
    <div
      {...drag}
      className={cn(
        "relative rounded-lg border transition-[background-color,box-shadow,margin,border-color,opacity]",
        T_BASE,
        open
          ? "my-1 border-[var(--color-graphite-300)] bg-card shadow-[var(--elevation-1)]"
          : "my-0 border-transparent",
        isSelected &&
          "border-[var(--color-dana-accent-200)] bg-[var(--color-dana-accent-100)]",
        isDragging && "opacity-40",
        /* Hovered means "drop here to reorder". Dwelt means the release has
            changed meaning, so it gets a different signal rather than a
            stronger one — a ring and a fill, not a heavier line. */
        isHovered && !isDwelt && "border-[var(--color-dana-accent-200)]",
        isDwelt &&
          "border-[var(--color-dana-accent-600)] bg-[var(--color-dana-accent-50)]",
      )}
    >
      {row}
      <Reveal open={open}>{card}</Reveal>
      {isHovered && !isDwelt ? <DwellBar /> : null}
      {isDwelt ? (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
          <span className="rounded-full bg-[var(--color-dana-accent-600)] px-2 py-0.5 text-[12px] leading-4 font-medium text-white">
            Release to make a folder
          </span>
        </span>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------ concept A -- */

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
  const {
    tasks,
    patch,
    toggleStep,
    moveStep,
    moveStepsTo,
    drag,
    panel,
    requestPromote,
    selection,
  } = useConceptList()
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div className="flex flex-col">
      {panel}
      {tasks.map((task) => {
        const isOpen = open === task.id
        const counts = stepCount(task)

        return (
          <ExpandShell
            key={task.id}
            open={isOpen}
            drag={
              selection.selecting
                ? selection.selectProps(task.id)
                : { ...drag.dragProps(task, tasks), ...selection.selectProps(task.id) }
            }
            {...drag.rowState(task.id)}
            isSelected={selection.selected.includes(task.id)}
            card={
              <TaskCard
                task={task}
                patch={patch}
                toggleStep={toggleStep}
                moveStep={moveStep}
                moveStepsTo={moveStepsTo}
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
                      onMakeFolder={() => requestPromote(task)}
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
    describe: (t) => (t.recurrence ? "Repeats weekly" : null),
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
            <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
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

/* The second line's chip. Same hover-to-reveal-a-border idea as concept E's,
   sized for metadata rather than body text. `interactive` is false for the
   facts you cannot change from a row — a step count, an attachment count, a
   note — so nothing offers an edit it cannot perform. */
function DetailChip({
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
  const {
    tasks,
    patch,
    toggleStep,
    moveStep,
    moveStepsTo,
    drag,
    panel,
    requestPromote,
    selection,
  } = useConceptList()
  const [open, setOpen] = useState<string | null>(null)

  return (
    <>
      <VocabLegend />
      <div className="flex flex-col">
        {panel}
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
          !task.attachments &&
          !task.abandoned

        return (
          <ExpandShell
            key={task.id}
            open={isOpen}
            drag={
              selection.selecting
                ? selection.selectProps(task.id)
                : { ...drag.dragProps(task, tasks), ...selection.selectProps(task.id) }
            }
            {...drag.rowState(task.id)}
            isSelected={selection.selected.includes(task.id)}
            card={
              <TaskCard
                task={task}
                patch={patch}
                toggleStep={toggleStep}
                moveStep={moveStep}
                moveStepsTo={moveStepsTo}
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
                    heading={isOpen}
                    className={cn(T_BASE, isOpen && "font-semibold")}
                  />
                  {/* Editable, exactly as concept E's chips are. Making the
                      second line read-only would have handed E a win on a
                      question neither concept is actually asking: the two
                      differ on whether a row is one line or two, and nothing
                      else should differ with them. */}
                  <div className="-ml-1 flex min-w-0 items-center gap-1 overflow-hidden text-[12px] leading-4 text-[var(--color-graphite-500)]">
                    {task.due ? (
                      <ChipMenu
                        label="Due date"
                        items={DUES.map((d) => ({
                          key: d.label,
                          label: d.label,
                          onSelect: () =>
                            patch(task.id, {
                              due:
                                d.label === "No date" ? undefined : { label: d.label },
                            }),
                        }))}
                      >
                        <DetailChip tone={task.due.overdue ? "danger" : "neutral"}>
                          <DetailWord
                            icon={task.due.overdue ? CircleAlert : CalendarDays}
                            tone={task.due.overdue ? "danger" : "neutral"}
                          >
                            {task.due.label}
                          </DetailWord>
                        </DetailChip>
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
                        items={PEOPLE.map((pp) => ({
                          key: pp.name,
                          label: pp.name,
                          onSelect: () => patch(task.id, { assignee: pp }),
                        }))}
                      >
                        <DetailChip>
                          <DetailWord icon={UserRound}>{task.assignee.name}</DetailWord>
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
                        <DetailChip>
                          <DetailWord icon={Repeat2}>Weekly</DetailWord>
                        </DetailChip>
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
                      <DetailChip interactive={false}>
                        <DetailWord icon={AlignLeft}>
                          <span className="truncate text-[var(--color-graphite-400)]">
                            {task.notes}
                          </span>
                        </DetailWord>
                      </DetailChip>
                    ) : null}
                    {task.abandoned ? (
                      <DetailChip interactive={false}>
                        <DetailWord icon={Ban}>Abandoned</DetailWord>
                      </DetailChip>
                    ) : null}
                    {bare ? (
                      /* A bare task keeps the line rather than collapsing to
                         one, so the list's rhythm survives. Whether that empty
                         line is calm or wasteful is what this concept is here
                         to be judged on. */
                      <span className="pl-1 text-[var(--color-graphite-400)]">
                        No details
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center justify-end pr-2">
                  <Actions
                    task={task}
                    onStar={() => patch(task.id, { important: !task.important })}
                      onMakeFolder={() => requestPromote(task)}
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

export const CONCEPTS: ConceptSpec[] = [
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
