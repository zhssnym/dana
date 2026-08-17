import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import type { LucideIcon } from "lucide-react"
import {
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  CalendarDays,
  ChevronDown,
  Clock3,
  Folder,
  History,
  ListChecks,
  MoreHorizontal,
  Plus,
  Repeat2,
  Star,
  Trash2,
  UserPlus,
  UserRound,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export type TaskFormEntryPoint =
  | "my-day"
  | "tasks"
  | "all"
  | "planned-list"
  | "planned-cell"
  | "important"
  | "folder"

export interface TaskFormData {
  id: string
  title: string
  dueDate: string
  important: boolean
  notes: string
  folder: string
  assignee: string
  dueTime: string
  reminder: string
  repeat: string
  repeatDays: string[]
  repeatInterval: string
  repeatMonthlyDay: string
  repeatEnds: string
  invitePending: string
  steps: Array<{ id: number; title: string; done: boolean }>
  createdAt?: string
  createdBy?: string
  completedAt?: string
  completedBy?: string
}

const entryDefaults: Record<
  TaskFormEntryPoint,
  { dueDate: string; important: boolean; folder: string }
> = {
  "my-day": { dueDate: "2026-08-10", important: false, folder: "Inbox" },
  tasks: { dueDate: "", important: false, folder: "Inbox" },
  all: { dueDate: "", important: false, folder: "Inbox" },
  "planned-list": { dueDate: "2026-08-10", important: false, folder: "Inbox" },
  "planned-cell": { dueDate: "2026-08-18", important: false, folder: "Inbox" },
  important: { dueDate: "", important: true, folder: "Inbox" },
  folder: { dueDate: "", important: false, folder: "Wedding" },
}

const folderMembers: Record<string, string[]> = {
  Inbox: ["Imran Wafa"],
  Wedding: ["Imran Wafa", "Sara Khan", "Hassan Ali"],
  Home: ["Imran Wafa"],
  Dana: ["Imran Wafa", "Hassan Ali"],
}

const folderColors: Record<string, string> = {
  Inbox: "var(--color-graphite-900)",
  Wedding: "var(--color-graphite-900)",
  Home: "var(--color-graphite-900)",
  Dana: "var(--color-graphite-900)",
}

const PREVIEW_TODAY = "2026-08-10"
const weekdayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const recurrenceWeekdays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
const recurrenceWeekdayNames: Record<string, string> = {
  Mo: "Monday",
  Tu: "Tuesday",
  We: "Wednesday",
  Th: "Thursday",
  Fr: "Friday",
  Sa: "Saturday",
  Su: "Sunday",
}
const DEFAULT_TASK_FORM_WIDTH = 540
const MIN_TASK_FORM_WIDTH = 480
const MAX_TASK_FORM_WIDTH = 720
const TASK_FORM_WIDTH_STORAGE_KEY = "dana:desktop-task-form-width"

const dueTimeOptions = [
  { value: "none", label: "No time" },
  ...Array.from({ length: 48 }, (_, index) => {
    const hours = Math.floor(index / 2)
    const minutes = index % 2 === 0 ? "00" : "30"
    const value = `${String(hours).padStart(2, "0")}:${minutes}`
    return { value, label: value }
  }),
]

function clampTaskFormWidth(width: number) {
  return Math.min(MAX_TASK_FORM_WIDTH, Math.max(MIN_TASK_FORM_WIDTH, width))
}

function formatAuditTimestamp(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed)
}

function readStoredTaskFormWidth() {
  if (typeof window === "undefined") return DEFAULT_TASK_FORM_WIDTH

  const storedValue = window.localStorage.getItem(TASK_FORM_WIDTH_STORAGE_KEY)
  if (storedValue === null) return DEFAULT_TASK_FORM_WIDTH

  const stored = Number(storedValue)
  return Number.isFinite(stored)
    ? clampTaskFormWidth(stored)
    : DEFAULT_TASK_FORM_WIDTH
}

function parseDateValue(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function toDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function addDays(value: string, amount: number) {
  const date = parseDateValue(value)
  date.setDate(date.getDate() + amount)
  return toDateValue(date)
}

function formatDueDate(value: string) {
  if (!value) return "No date"
  if (value === PREVIEW_TODAY) return "Today"
  if (value === addDays(PREVIEW_TODAY, 1)) return "Tomorrow"
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parseDateValue(value))
}

function DatePicker({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const initialDate = value ? parseDateValue(value) : parseDateValue(PREVIEW_TODAY)
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), 1),
  )

  const calendarDays = useMemo(() => {
    const firstWeekday = visibleMonth.getDay()
    const gridStart = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1 - firstWeekday,
    )

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart)
      date.setDate(gridStart.getDate() + index)
      return date
    })
  }, [visibleMonth])

  function choose(nextValue: string) {
    onChange(nextValue)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        render={
          <Button
            type="button"
            variant="ghost"
            className="h-[var(--task-form-property-row-height)] w-full justify-between px-2 text-sm font-normal hover:bg-[var(--color-graphite-50)] data-popup-open:bg-[var(--color-graphite-50)]"
          />
        }
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>
          {formatDueDate(value)}
        </span>
        <ChevronDown className="size-4 text-muted-foreground" strokeWidth={1.75} />
      </PopoverTrigger>
      <PopoverContent className="w-[320px]" align="start">
        <PopoverTitle className="sr-only">Choose due date</PopoverTitle>
        <div className="flex h-[var(--control-height)] items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Previous month"
            onClick={() =>
              setVisibleMonth(
                new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1),
              )
            }
            className="size-[var(--control-height)] hover:bg-[var(--color-graphite-100)]"
          >
            <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <div className="text-sm font-semibold text-foreground">
            {new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(
              visibleMonth,
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Next month"
            onClick={() =>
              setVisibleMonth(
                new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1),
              )
            }
            className="size-[var(--control-height)] hover:bg-[var(--color-graphite-100)]"
          >
            <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </div>

        <div className="mt-1 grid grid-cols-7 text-center">
          {weekdayLabels.map((weekday) => (
            <div
              key={weekday}
              className="flex h-8 items-center justify-center text-[11px] font-medium text-muted-foreground"
            >
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {calendarDays.map((date) => {
            const dateValue = toDateValue(date)
            const selected = dateValue === value
            const today = dateValue === PREVIEW_TODAY
            const outside = date.getMonth() !== visibleMonth.getMonth()

            return (
              <Button
                key={dateValue}
                type="button"
                variant="ghost"
                size="icon"
                aria-label={new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(date)}
                aria-pressed={selected}
                onClick={() => choose(dateValue)}
                className={cn(
                  "size-10 rounded-md text-xs font-normal hover:bg-[var(--color-graphite-100)]",
                  outside && "text-[var(--color-graphite-400)]",
                  today && !selected && "ring-1 ring-inset ring-[var(--color-graphite-300)]",
                  selected &&
                    "bg-[var(--color-graphite-900)] text-white hover:bg-[var(--color-graphite-800)] hover:text-white",
                )}
              >
                {date.getDate()}
              </Button>
            )
          })}
        </div>

        <div className="mt-2 flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            onClick={() => choose(PREVIEW_TODAY)}
            className="h-9 px-2.5 text-xs hover:bg-[var(--color-graphite-100)]"
          >
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => choose(addDays(PREVIEW_TODAY, 1))}
            className="h-9 px-2.5 text-xs hover:bg-[var(--color-graphite-100)]"
          >
            Tomorrow
          </Button>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => choose("")}
              className="ml-auto h-9 px-2.5 text-xs text-muted-foreground hover:bg-[var(--color-graphite-100)] hover:text-foreground"
            >
              Clear
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TaskFormResizeHandle({
  value,
  onChange,
  onCommit,
  onReset,
}: {
  value: number
  onChange: (value: number) => void
  onCommit: (value: number) => void
  onReset: () => void
}) {
  const drag = useRef<{
    pointerId: number
    startX: number
    startWidth: number
    currentWidth: number
  } | null>(null)

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return

    event.preventDefault()
    event.currentTarget.focus()
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: value,
      currentWidth: value,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return

    const nextWidth = clampTaskFormWidth(
      drag.current.startWidth + drag.current.startX - event.clientX,
    )
    drag.current.currentWidth = nextWidth
    onChange(nextWidth)
  }

  function finishPointerResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return

    onCommit(drag.current.currentWidth)
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    let nextWidth: number | null = null

    if (event.key === "ArrowLeft") {
      nextWidth = clampTaskFormWidth(value + (event.shiftKey ? 24 : 8))
    } else if (event.key === "ArrowRight") {
      nextWidth = clampTaskFormWidth(value - (event.shiftKey ? 24 : 8))
    } else if (event.key === "Home") {
      nextWidth = MIN_TASK_FORM_WIDTH
    } else if (event.key === "End") {
      nextWidth = MAX_TASK_FORM_WIDTH
    }

    if (nextWidth === null) return
    event.preventDefault()
    onChange(nextWidth)
    onCommit(nextWidth)
  }

  return (
    <div
      data-task-form-resize-handle
      role="separator"
      aria-label="Resize task form"
      aria-orientation="vertical"
      aria-valuemin={MIN_TASK_FORM_WIDTH}
      aria-valuemax={MAX_TASK_FORM_WIDTH}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${Math.round(value)} pixels`}
      tabIndex={0}
      title={`Resize task form · ${Math.round(value)}px · double-click to reset`}
      className="absolute inset-y-0 -left-1 z-[80] w-2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent hover:after:bg-[var(--color-graphite-300)] focus-visible:after:bg-[var(--color-dana-accent-600)]"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerResize}
      onPointerCancel={finishPointerResize}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
    />
  )
}

function PropertyRow({
  icon: Icon,
  label,
  htmlFor,
  children,
}: {
  icon: LucideIcon
  label: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="grid min-h-[var(--task-form-property-row-height)] grid-cols-[20px_104px_minmax(0,1fr)] items-start gap-2 rounded-md px-1">
      <Icon
        className="mt-2.5 size-4 text-[var(--color-graphite-500)]"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <label
        htmlFor={htmlFor}
        className="pt-2 text-[13px] leading-5 font-medium text-[var(--color-graphite-600)]"
      >
        {label}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function SelectControl({
  id,
  value,
  disabled,
  onChange,
  options,
}: {
  id: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
  options: Array<{ value: string; label: string; leading?: ReactNode }>
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(nextValue) => {
        if (nextValue !== null) onChange(nextValue)
      }}
    >
      <SelectTrigger
        id={id}
        className="h-[var(--task-form-property-row-height)] border-0 bg-transparent px-2 shadow-none data-popup-open:bg-[var(--color-graphite-50)]"
      >
        <SelectValue>
          {(selectedValue: string | null) => {
            const selected = options.find((option) => option.value === selectedValue)
            return selected ? (
              <span className="flex min-w-0 items-center gap-2">
                {selected.leading}
                <span className="truncate">{selected.label}</span>
              </span>
            ) : null
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex min-w-0 items-center gap-2">
              {option.leading}
              <span className="truncate">{option.label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function DependencyValue({
  enabled,
  children,
}: {
  enabled: boolean
  children: ReactNode
}) {
  if (enabled) return children

  return (
    <div
      className="flex h-[var(--task-form-property-row-height)] items-center rounded-md px-2 text-xs text-[var(--color-graphite-500)]"
      aria-disabled="true"
    >
      Set a due date first
    </div>
  )
}

export function TaskFormSheet({
  open,
  onOpenChange,
  entryPoint = "my-day",
  initialFolder,
  initialDueDate,
  initialExpanded = false,
  contextBanner,
  task,
  taskStatus = "pending",
  onToggleComplete,
  onSave,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entryPoint?: TaskFormEntryPoint
  initialFolder?: string
  initialDueDate?: string
  initialExpanded?: boolean
  contextBanner?: string
  task?: TaskFormData | null
  taskStatus?: "pending" | "completed" | "abandoned"
  onToggleComplete?: (completed: boolean) => void
  onSave?: (task: TaskFormData) => void
  onDelete?: (taskId: string) => void
}) {
  const defaults = entryDefaults[entryPoint]
  const defaultFolder = initialFolder ?? defaults.folder
  const defaultDueDate = initialDueDate ?? defaults.dueDate
  const editMode = task !== null && task !== undefined
  const [title, setTitle] = useState("")
  const [dueDate, setDueDate] = useState(defaultDueDate)
  const [important, setImportant] = useState(defaults.important)
  const [expanded, setExpanded] = useState(initialExpanded)
  const [notes, setNotes] = useState("")
  const [folder, setFolder] = useState(defaultFolder)
  const [assignee, setAssignee] = useState("Imran Wafa")
  const [dueTime, setDueTime] = useState("")
  const [reminder, setReminder] = useState("none")
  const [repeat, setRepeat] = useState("none")
  const [repeatDays, setRepeatDays] = useState<string[]>(["Mo"])
  const [repeatInterval, setRepeatInterval] = useState("2")
  const [repeatMonthlyDay, setRepeatMonthlyDay] = useState("10")
  const [repeatEnds, setRepeatEnds] = useState("")
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [invitePending, setInvitePending] = useState("")
  const [inviteError, setInviteError] = useState("")
  const [stepDraft, setStepDraft] = useState("")
  const [steps, setSteps] = useState<
    Array<{ id: number; title: string; done: boolean }>
  >([])
  const [titleError, setTitleError] = useState("")
  const [notesError, setNotesError] = useState("")
  const [stepError, setStepError] = useState("")
  const [pendingDueDate, setPendingDueDate] = useState<string | null>(null)
  const [pendingFolder, setPendingFolder] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sheetWidth, setSheetWidth] = useState(readStoredTaskFormWidth)
  const nextStepId = useRef(1)

  const members = useMemo(() => folderMembers[folder] ?? ["Imran Wafa"], [folder])
  const showAssignee = members.length >= 2
  const hasDate = dueDate.length > 0

  useEffect(() => {
    if (!open) return

    const nextSteps = task?.steps.map((step) => ({ ...step })) ?? []
    const nextFolder = task?.folder ?? defaultFolder
    const nextMembers = folderMembers[nextFolder] ?? ["Imran Wafa"]

    setTitle(task?.title ?? "")
    setDueDate(task?.dueDate ?? defaultDueDate)
    setImportant(task?.important ?? defaults.important)
    setExpanded(initialExpanded || editMode)
    setNotes(task?.notes ?? "")
    setFolder(nextFolder)
    setAssignee(
      task?.assignee && nextMembers.includes(task.assignee)
        ? task.assignee
        : nextMembers[0],
    )
    setDueTime(task?.dueTime ?? "")
    setReminder(task?.reminder ?? "none")
    setRepeat(task?.repeat ?? "none")
    setRepeatDays(task?.repeatDays ?? ["Mo"])
    setRepeatInterval(task?.repeatInterval ?? "2")
    setRepeatMonthlyDay(task?.repeatMonthlyDay ?? "10")
    setRepeatEnds(task?.repeatEnds ?? "")
    setInviteOpen(false)
    setInviteEmail("")
    setInvitePending(task?.invitePending ?? "")
    setInviteError("")
    setStepDraft("")
    setSteps(nextSteps)
    setTitleError("")
    setNotesError("")
    setStepError("")
    setPendingDueDate(null)
    setPendingFolder(null)
    setDeleteDialogOpen(false)
    nextStepId.current = Math.max(0, ...nextSteps.map((step) => step.id)) + 1
  }, [defaultDueDate, defaultFolder, defaults.important, editMode, initialExpanded, open, task])

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--task-form-width",
      `${sheetWidth}px`,
    )
  }, [sheetWidth])

  function persistSheetWidth(width: number) {
    window.localStorage.setItem(
      TASK_FORM_WIDTH_STORAGE_KEY,
      String(clampTaskFormWidth(width)),
    )
  }

  function resetSheetWidth() {
    setSheetWidth(DEFAULT_TASK_FORM_WIDTH)
    persistSheetWidth(DEFAULT_TASK_FORM_WIDTH)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextTitleError = !title.trim()
      ? "Give it a title"
      : title.length > 300
        ? "Too long: limit 300 characters"
        : ""
    const nextNotesError =
      notes.length > 10000 ? "Too long: limit 10000 characters" : ""
    const hasLongStep = steps.some((step) => step.title.length > 300)
    const nextStepError = hasLongStep
      ? "Too long: limit 300 characters"
      : ""

    setTitleError(nextTitleError)
    setNotesError(nextNotesError)
    setStepError(nextStepError)
    if (nextTitleError || nextNotesError || nextStepError) {
      return
    }
    onSave?.({
      id: task?.id ?? `task-${Date.now()}`,
      title: title.trim(),
      dueDate,
      important,
      notes,
      folder,
      assignee,
      dueTime,
      reminder,
      repeat,
      repeatDays,
      repeatInterval,
      repeatMonthlyDay,
      repeatEnds,
      invitePending,
      steps,
      createdAt: task?.createdAt,
      createdBy: task?.createdBy,
      completedAt: task?.completedAt,
      completedBy: task?.completedBy,
    })
    onOpenChange(false)
  }

  function applyDueDate(nextValue: string) {
    setDueDate(nextValue)
    if (!nextValue) {
      setDueTime("")
      setReminder("none")
      setRepeat("none")
      setRepeatEnds("")
    }
  }

  function requestDueDateChange(nextValue: string) {
    const clearsDependencies =
      nextValue === "" && (reminder !== "none" || repeat !== "none")

    if (clearsDependencies) {
      setPendingDueDate(nextValue)
      return
    }

    applyDueDate(nextValue)
  }

  function applyFolder(nextFolder: string) {
    const nextMembers = folderMembers[nextFolder] ?? ["Imran Wafa"]
    setFolder(nextFolder)
    if (!nextMembers.includes(assignee)) setAssignee(nextMembers[0])
  }

  function requestFolderChange(nextFolder: string) {
    const nextMembers = folderMembers[nextFolder] ?? ["Imran Wafa"]
    if (assignee && !nextMembers.includes(assignee)) {
      setPendingFolder(nextFolder)
      return
    }

    applyFolder(nextFolder)
  }

  function addStep() {
    const nextTitle = stepDraft.trim()
    if (!nextTitle || steps.length >= 50) return
    if (nextTitle.length > 300) {
      setStepError("Too long: limit 300 characters")
      return
    }

    setSteps((current) => [
      ...current,
      { id: nextStepId.current++, title: nextTitle, done: false },
    ])
    setStepDraft("")
    setStepError("")
  }

  function sendInvite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setInviteError("Enter a valid email address")
      return
    }

    setInvitePending(email)
    setInviteOpen(false)
    setInviteEmail("")
    setInviteError("")
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= steps.length) return

    setSteps((current) => {
      const reordered = [...current]
      ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
      return reordered
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        overlayClassName="bg-black/20 supports-backdrop-filter:backdrop-blur-none"
        className="task-form-sheet border-l border-border bg-card p-0 text-sm shadow-[var(--elevation-2)]"
      >
        <TaskFormResizeHandle
          value={sheetWidth}
          onChange={(width) => setSheetWidth(clampTaskFormWidth(width))}
          onCommit={persistSheetWidth}
          onReset={resetSheetWidth}
        />
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <SheetHeader className="shrink-0 px-6 pt-5 pb-2">
            <SheetTitle className="sr-only">
              {editMode ? "Edit task" : "New task"}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {editMode
                ? "Edit this task using Dana's task form."
                : "Create a task using Dana's task form."}
            </SheetDescription>
            {contextBanner ? (
              <div
                role="status"
                className="mb-2 flex min-h-9 items-center gap-2 rounded-md bg-[var(--color-graphite-50)] px-3 text-xs text-[var(--color-graphite-700)]"
              >
                <Repeat2 className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                {contextBanner}
              </div>
            ) : null}
            <div className="flex items-start gap-1">
              {editMode && taskStatus !== "abandoned" ? (
                <Checkbox
                  checked={taskStatus === "completed"}
                  onCheckedChange={(checked) => onToggleComplete?.(checked)}
                  aria-label={
                    taskStatus === "completed"
                      ? "Mark as not done"
                      : "Mark complete"
                  }
                  className="size-[var(--control-height)] shrink-0 !border-transparent !bg-transparent after:inset-auto after:size-[var(--checkbox-size)] after:rounded-[4px] after:border after:border-input after:bg-background after:content-[''] focus-visible:ring-0 focus-visible:after:ring-2 focus-visible:after:ring-ring/30 data-checked:!border-transparent data-checked:!bg-transparent data-checked:after:border-[var(--color-graphite-700)] data-checked:after:bg-[var(--color-graphite-700)] [&_[data-slot=checkbox-indicator]]:z-10"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <Input
                  data-task-form-title
                  id="task-title"
                  aria-label="Task name"
                  autoFocus
                  value={title}
                  aria-invalid={Boolean(titleError) || undefined}
                  aria-describedby={titleError ? "task-title-error" : undefined}
                  onChange={(event) => {
                    setTitle(event.target.value)
                    if (event.target.value.trim() && event.target.value.length <= 300) {
                      setTitleError("")
                    }
                  }}
                  placeholder="Task name"
                  className="h-auto min-h-[var(--control-height)] border-0 bg-transparent px-1 py-1 text-xl leading-7 font-semibold shadow-none placeholder:text-[var(--color-graphite-400)] focus-visible:border-transparent focus-visible:bg-transparent focus-visible:ring-0 md:text-xl"
                />
                {titleError ? (
                  <p id="task-title-error" className="mt-1 px-1 text-xs text-destructive">
                    {titleError}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={important ? "Remove from Important" : "Mark important"}
                aria-pressed={important}
                onClick={() => setImportant((value) => !value)}
                className="size-[var(--control-height)] rounded-md text-[var(--color-graphite-500)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)] aria-pressed:text-[var(--color-graphite-900)]"
              >
                <Star
                  className={cn("!size-5", important && "fill-current")}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </Button>
              {editMode ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="More task actions"
                        className="size-[var(--control-height)] rounded-md text-[var(--color-graphite-500)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)]"
                      />
                    }
                  >
                    <MoreHorizontal
                      className="!size-5"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDeleteDialogOpen(true)}
                      className="min-h-[var(--control-height)] text-sm"
                    >
                      <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
                      Delete task…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-1">
            <PropertyRow icon={CalendarDays} label="Due date" htmlFor="task-due-date">
              <DatePicker
                id="task-due-date"
                value={dueDate}
                onChange={requestDueDateChange}
              />
            </PropertyRow>

            <Button
              data-task-form-tier="disclosure"
              type="button"
              variant="ghost"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
              className="mt-1 h-[var(--task-form-property-row-height)] w-full justify-between px-1 text-[13px] font-medium text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-800)]"
            >
              <span>More options</span>
              <ChevronDown
                className={cn("size-4 transition-transform", expanded && "rotate-180")}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </Button>

            {expanded ? (
              <div className="mt-1 space-y-1 pb-4">
                <PropertyRow icon={Folder} label="Folder" htmlFor="task-folder">
                  <SelectControl
                    id="task-folder"
                    value={folder}
                    onChange={requestFolderChange}
                    options={Object.keys(folderMembers).map((folderName) => ({
                      value: folderName,
                      label: folderName,
                      leading: (
                        <Folder
                          className="size-4 shrink-0"
                          style={{ color: folderColors[folderName] }}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                      ),
                    }))}
                  />
                </PropertyRow>

                {showAssignee ? (
                  <>
                    <PropertyRow icon={UserRound} label="Assignee" htmlFor="task-assignee">
                      <SelectControl
                        id="task-assignee"
                        value={assignee}
                        onChange={(value) => {
                          if (value === "__invite__") {
                            setInviteOpen(true)
                            setInviteError("")
                            return
                          }
                          setInvitePending("")
                          setAssignee(value)
                        }}
                        options={[
                          ...members.map((member) => ({
                            value: member,
                            label: member,
                            leading: (
                              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-graphite-200)] text-[9px] font-semibold text-[var(--color-graphite-700)]">
                                {member
                                  .split(" ")
                                  .map((part) => part[0])
                                  .join("")
                                  .slice(0, 2)}
                              </span>
                            ),
                          })),
                          {
                            value: "__invite__",
                            label: "Invite by email",
                            leading: (
                              <UserPlus
                                className="size-4 shrink-0 text-[var(--color-graphite-500)]"
                                strokeWidth={1.75}
                                aria-hidden="true"
                              />
                            ),
                          },
                        ]}
                      />
                    </PropertyRow>

                    {inviteOpen ? (
                      <PropertyRow icon={UserPlus} label="Invite" htmlFor="task-invite-email">
                        <div>
                          <div className="flex items-center gap-1">
                            <Input
                              id="task-invite-email"
                              type="email"
                              value={inviteEmail}
                              aria-invalid={Boolean(inviteError) || undefined}
                              onChange={(event) => {
                                setInviteEmail(event.target.value)
                                setInviteError("")
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault()
                                  sendInvite()
                                }
                              }}
                              placeholder="name@example.com"
                              className="h-[var(--task-form-property-row-height)] border-0 bg-[var(--color-graphite-50)] px-2 text-sm shadow-none"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={sendInvite}
                              className="h-[var(--task-form-property-row-height)] px-2.5 text-xs hover:bg-[var(--color-graphite-100)]"
                            >
                              Send
                            </Button>
                          </div>
                          <p className="px-2 pt-1 text-[11px] text-muted-foreground">
                            Share {folder} and assign this task.
                          </p>
                          {inviteError ? (
                            <p className="px-2 pt-1 text-xs text-destructive">
                              {inviteError}
                            </p>
                          ) : null}
                        </div>
                      </PropertyRow>
                    ) : null}

                    {invitePending ? (
                      <div className="ml-[140px] flex min-h-8 items-center px-2">
                        <Badge
                          variant="outline"
                          className="max-w-full border-[var(--color-info-200)] bg-[var(--color-info-100)] text-[var(--color-info-700)]"
                        >
                          <span className="truncate">
                            Invite pending: {invitePending}
                          </span>
                        </Badge>
                      </div>
                    ) : null}
                  </>
                ) : null}

                <PropertyRow icon={Clock3} label="Due time" htmlFor="task-due-time">
                  <DependencyValue enabled={hasDate}>
                    <SelectControl
                      id="task-due-time"
                      value={dueTime || "none"}
                      onChange={(value) => {
                        setDueTime(value === "none" ? "" : value)
                        setReminder("none")
                      }}
                      options={dueTimeOptions}
                    />
                  </DependencyValue>
                </PropertyRow>

                <PropertyRow icon={Bell} label="Reminder" htmlFor="task-reminder">
                  <DependencyValue enabled={hasDate}>
                    <SelectControl
                      id="task-reminder"
                      value={reminder}
                      onChange={setReminder}
                      options={
                        dueTime
                          ? [
                              { value: "none", label: "No reminder" },
                              { value: "at-time", label: "At due time" },
                              { value: "15-before", label: "15 minutes before" },
                              { value: "30-before", label: "30 minutes before" },
                              { value: "60-before", label: "1 hour before" },
                            ]
                          : [
                              { value: "none", label: "No reminder" },
                              { value: "09-day", label: "09:00 on the day" },
                              { value: "18-before", label: "18:00 the day before" },
                            ]
                      }
                    />
                  </DependencyValue>
                </PropertyRow>

                <PropertyRow icon={Repeat2} label="Repeat" htmlFor="task-repeat">
                  <DependencyValue enabled={hasDate}>
                    <SelectControl
                      id="task-repeat"
                      value={repeat}
                      onChange={(value) => {
                        setRepeat(value)
                        if (value === "none") setRepeatEnds("")
                        if (value === "weekly" && dueDate) {
                          setRepeatDays([
                            weekdayLabels[parseDateValue(dueDate).getDay()],
                          ])
                        }
                        if (value === "monthly" && dueDate) {
                          setRepeatMonthlyDay(
                            String(Math.min(28, parseDateValue(dueDate).getDate())),
                          )
                        }
                      }}
                      options={[
                        { value: "none", label: "Does not repeat" },
                        { value: "daily", label: "Daily" },
                        { value: "weekdays", label: "Weekdays" },
                        { value: "weekly", label: "Weekly on chosen days" },
                        { value: "every-days", label: "Every N days" },
                        { value: "every-weeks", label: "Every N weeks" },
                        { value: "monthly", label: "Monthly on a day" },
                        { value: "yearly", label: "Yearly" },
                      ]}
                    />
                  </DependencyValue>
                </PropertyRow>

                {hasDate && repeat !== "none" ? (
                  <div className="ml-[140px] space-y-2 px-2 pb-2">
                    {repeat === "weekly" ? (
                      <div>
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                          Repeat on
                        </p>
                        <div className="flex items-center gap-1" aria-label="Weekly repeat days">
                          {recurrenceWeekdays.map((day) => {
                            const selected = repeatDays.includes(day)
                            return (
                              <Button
                                key={day}
                                type="button"
                                variant="ghost"
                                aria-label={`Repeat on ${recurrenceWeekdayNames[day]}`}
                                aria-pressed={selected}
                                onClick={() => {
                                  setRepeatDays((current) => {
                                    if (selected && current.length === 1) return current
                                    return selected
                                      ? current.filter((item) => item !== day)
                                      : recurrenceWeekdays.filter(
                                          (item) => current.includes(item) || item === day,
                                        )
                                  })
                                }}
                                className={cn(
                                  "size-8 rounded-md p-0 text-[11px] hover:bg-[var(--color-graphite-100)]",
                                  selected &&
                                    "bg-[var(--color-graphite-900)] text-white hover:bg-[var(--color-graphite-800)] hover:text-white",
                                )}
                              >
                                {day.slice(0, 1)}
                              </Button>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}

                    {repeat === "every-days" || repeat === "every-weeks" ? (
                      <div className="flex h-[var(--task-form-property-row-height)] items-center gap-2">
                        <span className="text-xs text-muted-foreground">Every</span>
                        <Input
                          aria-label="Repeat interval"
                          type="number"
                          min={1}
                          value={repeatInterval}
                          onChange={(event) =>
                            setRepeatInterval(
                              String(Math.max(1, Number(event.target.value) || 1)),
                            )
                          }
                          className="h-8 w-16 border-border bg-card px-2 text-center text-sm shadow-none"
                        />
                        <span className="text-sm text-foreground">
                          {repeat === "every-days" ? "days" : "weeks"}
                        </span>
                      </div>
                    ) : null}

                    {repeat === "monthly" ? (
                      <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
                        <span className="text-xs text-muted-foreground">On day</span>
                        <SelectControl
                          id="task-repeat-month-day"
                          value={repeatMonthlyDay}
                          onChange={setRepeatMonthlyDay}
                          options={Array.from({ length: 28 }, (_, index) => ({
                            value: String(index + 1),
                            label: `Day ${index + 1}`,
                          }))}
                        />
                      </div>
                    ) : null}

                    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
                      <span className="text-xs text-muted-foreground">Ends on</span>
                      <DatePicker
                        id="task-repeat-ends"
                        value={repeatEnds}
                        onChange={setRepeatEnds}
                      />
                    </div>
                  </div>
                ) : null}

                <PropertyRow icon={ListChecks} label="Steps" htmlFor="task-step">
                  <div>
                    {steps.length > 0 ? (
                      <div className="space-y-1 py-1">
                        {steps.map((step, index) => (
                          <div
                            key={step.id}
                            className="group/step flex min-h-[var(--task-form-property-row-height)] items-center gap-2 rounded-md px-2 hover:bg-[var(--color-graphite-50)]"
                          >
                            <Checkbox
                              aria-label={`Complete step ${step.title}`}
                              checked={step.done}
                              onCheckedChange={(checked) =>
                                setSteps((current) =>
                                  current.map((item) =>
                                    item.id === step.id
                                      ? { ...item, done: checked === true }
                                      : item,
                                  ),
                                )
                              }
                              className="data-checked:border-[var(--color-graphite-700)] data-checked:bg-[var(--color-graphite-700)]"
                            />
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate text-sm",
                                step.done && "text-muted-foreground line-through",
                              )}
                            >
                              {step.title}
                            </span>
                            <div className="flex shrink-0 opacity-0 transition-opacity group-hover/step:opacity-100 group-focus-within/step:opacity-100">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={index === 0}
                                aria-label={`Move ${step.title} up`}
                                onClick={() => moveStep(index, -1)}
                                className="size-8 hover:bg-[var(--color-graphite-100)]"
                              >
                                <ArrowUp className="size-4" strokeWidth={1.75} />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={index === steps.length - 1}
                                aria-label={`Move ${step.title} down`}
                                onClick={() => moveStep(index, 1)}
                                className="size-8 hover:bg-[var(--color-graphite-100)]"
                              >
                                <ArrowDown className="size-4" strokeWidth={1.75} />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Delete ${step.title}`}
                                onClick={() =>
                                  setSteps((current) =>
                                    current.filter((item) => item.id !== step.id),
                                  )
                                }
                                className="size-8 text-muted-foreground hover:bg-[var(--color-danger-100)] hover:text-destructive"
                              >
                                <Trash2 className="size-4" strokeWidth={1.75} />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex items-center gap-1">
                      <Input
                        id="task-step"
                        value={stepDraft}
                        disabled={steps.length >= 50}
                        aria-invalid={Boolean(stepError) || undefined}
                        aria-describedby={stepError ? "task-step-error" : undefined}
                        onChange={(event) => {
                          setStepDraft(event.target.value)
                          if (event.target.value.length <= 300) setStepError("")
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault()
                            addStep()
                          }
                        }}
                        placeholder={steps.length >= 50 ? "50 step limit reached" : "Add a step"}
                        className="h-[var(--task-form-property-row-height)] border-0 bg-transparent px-2 text-sm shadow-none hover:bg-[var(--color-graphite-50)] focus-visible:border-transparent focus-visible:bg-card"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={!stepDraft.trim() || steps.length >= 50}
                        onClick={addStep}
                        className="h-[var(--task-form-property-row-height)] gap-1.5 px-2.5 text-xs text-muted-foreground hover:bg-[var(--color-graphite-100)] hover:text-foreground"
                      >
                        <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
                        Add
                      </Button>
                    </div>
                    {stepError ? (
                      <p id="task-step-error" className="px-2 pt-1 text-xs text-destructive">
                        {stepError}
                      </p>
                    ) : null}
                    {steps.length >= 50 ? (
                      <p className="px-2 pt-1 text-xs text-muted-foreground">
                        50 step limit reached
                      </p>
                    ) : null}
                  </div>
                </PropertyRow>

                <PropertyRow icon={AlignLeft} label="Notes" htmlFor="task-notes">
                  <textarea
                    id="task-notes"
                    value={notes}
                    aria-invalid={Boolean(notesError) || undefined}
                    aria-describedby={notesError ? "task-notes-error" : undefined}
                    onChange={(event) => {
                      setNotes(event.target.value)
                      if (event.target.value.length <= 10000) setNotesError("")
                    }}
                    placeholder="Add notes"
                    rows={3}
                    className="min-h-20 w-full resize-y rounded-md border-0 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground hover:bg-[var(--color-graphite-50)] focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                  {notesError ? (
                    <p id="task-notes-error" className="px-2 pt-1 text-xs text-destructive">
                      {notesError}
                    </p>
                  ) : null}
                </PropertyRow>
              </div>
            ) : null}
          </div>

          {editMode && task?.createdAt ? (
            <div
              className="shrink-0 border-t border-border bg-[var(--color-graphite-25)] px-6 py-3"
              aria-label="Task history"
            >
              <div className="flex items-start gap-2 text-xs leading-5 text-[var(--color-graphite-600)]">
                <History
                  className="mt-0.5 size-4 shrink-0 text-[var(--color-graphite-400)]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <div>
                  <p>
                    <span className="font-medium text-[var(--color-graphite-700)]">
                      Created
                    </span>{" "}
                    {formatAuditTimestamp(task.createdAt)} by{" "}
                    {task.createdBy || "Deleted user"}
                  </p>
                  {task.completedAt ? (
                    <p>
                      <span className="font-medium text-[var(--color-graphite-700)]">
                        Completed
                      </span>{" "}
                      {formatAuditTimestamp(task.completedAt)} by{" "}
                      {task.completedBy || "Deleted user"}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <SheetFooter className="shrink-0 flex-row justify-end gap-2 bg-card px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-[var(--control-height)] px-4 text-sm hover:bg-[var(--color-graphite-100)]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="h-[var(--control-height)] bg-[var(--color-graphite-900)] px-4 text-sm text-white hover:bg-[var(--color-graphite-800)]"
            >
              {editMode ? "Save changes" : "Add task"}
            </Button>
          </SheetFooter>
        </form>

        <AlertDialog
          open={pendingDueDate !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setPendingDueDate(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear due date?</AlertDialogTitle>
              <AlertDialogDescription>
                Clearing the date also ends the repeat and removes the reminder.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep date</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (pendingDueDate !== null) applyDueDate(pendingDueDate)
                  setPendingDueDate(null)
                }}
              >
                Clear date
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={pendingFolder !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setPendingFolder(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Move task?</AlertDialogTitle>
              <AlertDialogDescription>
                Moving will unassign {assignee.split(" ")[0]}; {assignee === "Sara Khan" ? "she" : "they"} isn&apos;t a member of {pendingFolder}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (pendingFolder !== null) applyFolder(pendingFolder)
                  setPendingFolder(null)
                }}
              >
                Move task
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete this task? This can&apos;t be undone.
              </AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                destructive
                onClick={() => {
                  if (task) onDelete?.(task.id)
                  setDeleteDialogOpen(false)
                  onOpenChange(false)
                }}
              >
                Delete task
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  )
}
