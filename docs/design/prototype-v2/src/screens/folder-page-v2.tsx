/*
The folder page as a page, not a query.

Imran's direction, 2026-08-18: a folder screen structured like a Notion page —
a cover a person can change, an icon from a small library in a colour they
pick, an optional description, the folder's controls in one small steady
place, sections and paragraphs to organise the list, no floating New task
button because the blank row already captures, and somewhere for the folder's
own conversation.

This file is the concept, judged in the shell because the surroundings are the
question (DES-124's stated exception). The previous folder screen stays
reachable at `?folder-page=v1` so the two can be compared by looking. What
wins gets extracted; what loses stays here as the record.

The register entries: DES-130 (cover, icon, description), DES-131 (the
cluster and the views), DES-132 (sections and paragraphs), DES-133 (the FAB
retires where a quick-add row lives), DES-134 (the folder's conversation, in
two drawn placements). Everything needing a column or an endpoint is Lane 2,
drawn on fixtures, and excluded from the port by its entry.
*/

import { useEffect, useRef, useState } from "react"
import {
  AlignLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FolderInput,
  Image as ImageIcon,
  LayoutGrid,
  List,
  ListFilter,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Share2,
  Trash2,
  X,
} from "@/lib/icons"

import { CommentsThread } from "@/components/comments"
import { voiceBars } from "@/components/comments"
import {
  FolderCoverPicker,
  resolveCover,
} from "@/components/folder-cover"
import {
  FolderIconPicker,
  folderGlyph,
} from "@/components/folder-icon-picker"
import { QuickAdd } from "@/components/quick-add"
import { SharingPanel } from "@/components/sharing-panel"
import { InlineError, SkeletonList } from "@/components/state-patterns"
import { Face } from "@/components/task-card"
import {
  TaskList,
  TaskRow,
  type TaskListWiring,
  type TaskRowProps,
} from "@/components/task-row"
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
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  savePrototypeFolderIdentity,
  useFolderIdentity,
} from "@/lib/folder-presentation"
import { PEOPLE, type ConceptComment } from "@/lib/task-model"
import { cn } from "@/lib/utils"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

type FolderTask = TaskRowProps & { id: string }
type OpenTaskFilter = "all" | "scheduled" | "unscheduled"
type FolderView = "list" | "board"
type CommentsPlacement = "page" | "panel"

/* ------------------------------------------------------------- fixtures -- */

interface SectionModel {
  id: string
  name: string
}
interface ParagraphModel {
  id: string
  text: string
}
type PageItem =
  | { kind: "section"; section: SectionModel }
  | { kind: "paragraph"; paragraph: ParagraphModel }

/* The Wedding folder arrives already organised, so sections and paragraphs
   are judged as an inhabited page rather than an empty mechanism. Everything
   is in-memory: navigation reloads reset it, like every task fixture. */
const PAGE_SEEDS: Record<
  string,
  { items: PageItem[]; assign: Record<string, string> }
> = {
  Wedding: {
    items: [
      {
        kind: "paragraph",
        paragraph: {
          id: "wedding-note",
          text: "Everything for 12 September. Venue and catering are settled — invitations and transport are the open fronts.",
        },
      },
      { kind: "section", section: { id: "venue", name: "Venue & vendors" } },
      { kind: "section", section: { id: "invites", name: "Invitations" } },
    ],
    assign: {
      "task-4": "venue",
      "task-6": "venue",
      "task-14": "invites",
      "task-15": "invites",
    },
  },
}

/* The folder's own conversation (DES-134). Shared folders arrive with one
   going; a private folder starts quiet. */
const FOLDER_THREADS: Record<string, ConceptComment[]> = {
  Wedding: [
    {
      id: "folder-wedding-1",
      author: PEOPLE[1]!,
      at: "Yesterday 19:04",
      body: "Florist confirmed for the 12th. She asked for the table count by Friday.",
    },
    {
      id: "folder-wedding-2",
      author: PEOPLE[0]!,
      at: "Yesterday 19:20",
      mine: true,
      body: "I'll close the guest list tomorrow, then the count falls out of it.",
      replies: [
        {
          id: "folder-wedding-2r",
          author: PEOPLE[1]!,
          at: "Yesterday 19:31",
          body: "Perfect — I'll hold her until Saturday morning.",
        },
      ],
    },
    {
      id: "folder-wedding-3",
      author: PEOPLE[2]!,
      at: "Today 8:41",
      voice: { seconds: 9, bars: voiceBars(9) },
    },
  ],
  "Community planning committee": [
    {
      id: "folder-cpc-1",
      author: PEOPLE[2]!,
      at: "Mon 11:18",
      body: "Committee meets on the 20th — anything for the agenda goes here.",
    },
  ],
}

let seedCounter = 0
function pageId(prefix: string) {
  seedCounter += 1
  return `${prefix}-${Date.now()}-${seedCounter}`
}

/* ------------------------------------------------- small shared controls -- */

/* A name that is a label until clicked, then a field — DES-095's rule,
   reaching the folder title and the section names. */
function InlineName({
  value,
  ariaLabel,
  className,
  inputClassName,
  onCommit,
  autoEdit = false,
  onDoneEditing,
}: {
  value: string
  ariaLabel: string
  className: string
  inputClassName?: string
  onCommit: (next: string) => void
  autoEdit?: boolean
  onDoneEditing?: () => void
}) {
  const [editing, setEditing] = useState(autoEdit)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  function finish(commit: boolean) {
    if (commit) {
      const next = draft.trim()
      if (next && next !== value) onCommit(next)
    }
    setEditing(false)
    onDoneEditing?.()
  }

  if (editing) {
    return (
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        value={draft}
        aria-label={ariaLabel}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            finish(true)
          }
          if (event.key === "Escape") {
            event.preventDefault()
            setDraft(value)
            finish(false)
          }
        }}
        className={cn(
          className,
          "-mx-1 w-full min-w-0 rounded-[4px] bg-background px-1 outline-none ring-2 ring-[var(--color-dana-accent-600)]",
          inputClassName,
        )}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Rename"
      className={cn(
        className,
        "-mx-1 max-w-full cursor-text truncate rounded-[4px] px-1 text-left transition-colors",
        T_FAST,
        FOCUS,
        "hover:bg-[var(--color-graphite-100)]",
      )}
    >
      {value}
    </button>
  )
}

/* The ghost tier: 12px, a plus, quiet until hovered. The same voice as the
   card's EmptyAction (DES-115), restated at page scale. */
function GhostAction({
  icon: Icon = Plus,
  label,
  onClick,
}: {
  icon?: typeof Plus
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] leading-4 text-[var(--color-graphite-400)] transition-colors hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-700)]",
        T_FAST,
        FOCUS,
      )}
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      {label}
    </button>
  )
}

/* A cluster control on the contract's own rhythm: 40px, the default icon
   size, the ghost treatment the v1 header used (F2a, review K1). The count
   rides as the product's badge — a quiet graphite pill, never a filled disc
   (K4). */
const clusterButtonClass = (active: boolean) =>
  cn(
    "relative flex size-[var(--control-height)] items-center justify-center rounded-md transition-[background-color,color] disabled:pointer-events-none disabled:opacity-35",
    T_FAST,
    FOCUS,
    active
      ? "bg-[var(--color-graphite-100)] text-[var(--color-graphite-800)]"
      : "text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)]",
  )

function ClusterButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  disabled = false,
  disabledHint,
  badge,
  buttonRef,
}: {
  icon: typeof List
  label: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  disabledHint?: string
  badge?: number
  buttonRef?: React.Ref<HTMLButtonElement>
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            ref={buttonRef}
            type="button"
            aria-label={label}
            aria-pressed={active || undefined}
            disabled={disabled}
            onClick={onClick}
            className={clusterButtonClass(active)}
          >
            <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
            {badge ? (
              <span className="absolute top-1 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-graphite-200)] px-1 text-[0.625rem] leading-none font-medium text-[var(--color-graphite-600)] tabular-nums">
                {badge}
              </span>
            ) : null}
          </button>
        }
      />
      <TooltipContent side="bottom">
        {disabled && disabledHint ? disabledHint : label}
      </TooltipContent>
    </Tooltip>
  )
}

/* ------------------------------------------------------------- the page -- */

interface FolderPageV2Props {
  storageName: string
  folderName?: string
  folderColor?: string
  folderLabel?: string
  availableFolderLabels?: string[]
  isShared?: boolean
  scheduled: FolderTask[]
  unscheduled: FolderTask[]
  completed: FolderTask[]
  previewState?: string | null
  isOwner?: boolean
  isDefault?: boolean
  initialShareOpen?: boolean
  onAdd: (section: "scheduled" | "unscheduled", title: string) => void
  onOpenFullForm: (section: "scheduled" | "unscheduled") => void
  onOpenTask: (taskId: string) => void
  onToggleComplete: (taskId: string, completed: boolean) => void
  onToggleImportant: (taskId: string) => void
  onRestore: (taskId: string) => void
  onAbandon: (taskId: string) => void
  onDelete: (taskId: string) => void
  onDeleteFolder?: () => void
  onRenameFolder?: (name: string) => void
  onMoveToLabel?: (label: string | null, color: string) => void
}

export function FolderPageV2({
  storageName,
  folderName = "Wedding",
  folderColor = "var(--color-graphite-900)",
  folderLabel = "Personal",
  availableFolderLabels = ["Personal", "Work"],
  isShared = true,
  scheduled,
  unscheduled,
  completed,
  previewState,
  isOwner = true,
  isDefault = false,
  initialShareOpen = false,
  onAdd,
  onOpenFullForm,
  onOpenTask,
  onToggleComplete,
  onToggleImportant,
  onRestore,
  onAbandon,
  onDelete,
  onDeleteFolder,
  onRenameFolder,
  onMoveToLabel,
}: FolderPageV2Props) {
  const identity = useFolderIdentity(storageName)
  const Glyph = folderGlyph(identity.glyph)
  const color = identity.color ?? folderColor
  const cover = resolveCover(identity.cover, storageName)

  const [displayName, setDisplayName] = useState(folderName)
  const [personalLabel, setPersonalLabel] = useState(folderLabel)
  const [shareOpen, setShareOpen] = useState(initialShareOpen)
  const [view, setView] = useState<FolderView>("list")
  const [openTaskFilter, setOpenTaskFilter] = useState<OpenTaskFilter>("all")
  const [completedOpen, setCompletedOpen] = useState(false)
  const [editingDescription, setEditingDescription] = useState(false)
  const [deleteFolderOpen, setDeleteFolderOpen] = useState(false)
  const [pendingTaskAction, setPendingTaskAction] = useState<{
    type: "abandon" | "delete"
    taskId: string
  } | null>(null)

  /* Sections and paragraphs (DES-132), seeded for Wedding. */
  const seed = PAGE_SEEDS[storageName]
  const [items, setItems] = useState<PageItem[]>(() => seed?.items ?? [])
  const [assign, setAssign] = useState<Record<string, string>>(
    () => seed?.assign ?? {},
  )
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(),
  )
  /* A task added from a section's own row: the shell mints the id, so the
     assignment waits for the task to appear and claims it by title. Fixture
     machinery, not design. */
  const pendingAssign = useRef<{ title: string; sectionId: string } | null>(null)

  /* The folder's conversation (DES-134), in whichever placement the concept
     switch has picked. */
  const [folderComments, setFolderComments] = useState<ConceptComment[]>(
    () => FOLDER_THREADS[storageName] ?? [],
  )
  const [commentsPlacement, setCommentsPlacement] =
    useState<CommentsPlacement>("page")
  const [panelOpen, setPanelOpen] = useState(false)
  const [conceptOpen, setConceptOpen] = useState(true)
  const pageCommentsRef = useRef<HTMLDivElement>(null)

  /* Completion transition, as the previous screen had it. */
  const [completingIds, setCompletingIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [completionNotice, setCompletionNotice] = useState<{
    id: string
    title: string
  } | null>(null)
  const completionTimers = useRef(new Map<string, number>())
  const completingRef = useRef(new Set<string>())
  const noticeTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      completionTimers.current.forEach((timer) => window.clearTimeout(timer))
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    }
  }, [])

  useEffect(() => {
    setDisplayName(folderName)
  }, [folderName])

  /* The cluster docks (F2a, review K2): a sentinel above the row tells us
     when the row has hit the top of the scroll, and only then does it take a
     ground and a hairline. IntersectionObserver against the viewport is
     enough — the shell's scroll container clips the sentinel, and clipped
     means not intersecting. */
  const [stuck, setStuck] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const sentinel = sentinelRef.current
    const scroller = sentinel?.closest("[data-shell-scroll]")
    if (!sentinel || !scroller) return
    /* A passive scroll listener rather than an IntersectionObserver: the
       comparison is two rect reads, and the observer's notifications ride
       the rendering pipeline, which made the docking impossible to verify
       headlessly and adds nothing at this cost. */
    function measure() {
      if (!sentinel || !scroller) return
      setStuck(
        sentinel.getBoundingClientRect().bottom <
          scroller.getBoundingClientRect().top,
      )
    }
    measure()
    scroller.addEventListener("scroll", measure, { passive: true })
    return () => scroller.removeEventListener("scroll", measure)
  }, [])

  /* Rename's second route (review K5): the menu item arms the inline edit,
     so keyboard and screen-reader users have a discoverable path and the
     title's click-to-edit stays the fast one. */
  const [titleEditing, setTitleEditing] = useState(false)

  /* The panel behaves like an arriving surface should (review M8): Escape
     closes it, focus lands inside on open and returns to the button that
     opened it. */
  const conversationRef = useRef<HTMLButtonElement>(null)
  const panelCloseRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!(commentsPlacement === "panel" && panelOpen)) return
    panelCloseRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPanelOpen(false)
        conversationRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [commentsPlacement, panelOpen])

  /* Deleting a section says so and offers the way back (review S4) — the
     same courtesy the completion flow already models. */
  const [sectionUndo, setSectionUndo] = useState<{
    name: string
    restore: () => void
  } | null>(null)
  const sectionUndoTimer = useRef<number | null>(null)
  useEffect(() => {
    return () => {
      if (sectionUndoTimer.current !== null)
        window.clearTimeout(sectionUndoTimer.current)
    }
  }, [])

  const openTasks =
    openTaskFilter === "scheduled"
      ? scheduled
      : openTaskFilter === "unscheduled"
        ? unscheduled
        : [...scheduled, ...unscheduled]

  /* Claim a freshly added task for its section once the shell has minted it. */
  useEffect(() => {
    const pending = pendingAssign.current
    if (!pending) return
    const candidate = [...scheduled, ...unscheduled].find(
      (task) => task.title === pending.title && !assign[task.id],
    )
    if (candidate) {
      pendingAssign.current = null
      setAssign((current) => ({ ...current, [candidate.id]: pending.sectionId }))
    }
  }, [scheduled, unscheduled, assign])

  const sectionIds = new Set(
    items.filter((item) => item.kind === "section").map((item) => item.section.id),
  )
  const unsectioned = openTasks.filter(
    (task) => !assign[task.id] || !sectionIds.has(assign[task.id]!),
  )
  const tasksOf = (sectionId: string) =>
    openTasks.filter((task) => assign[task.id] === sectionId)

  const pendingCount = [...scheduled, ...unscheduled].filter(
    (task) => task.status !== "abandoned" && !completingIds.has(task.id),
  ).length
  const completedCount = completed.length + completingIds.size
  const completionTotal = pendingCount + completedCount
  const openCount = [...scheduled, ...unscheduled].filter(
    (task) => task.status !== "abandoned",
  ).length
  const abandonedCount = [...scheduled, ...unscheduled].filter(
    (task) => task.status === "abandoned",
  ).length
  const isEmpty =
    scheduled.length === 0 && unscheduled.length === 0 && completed.length === 0
  const filterLabel =
    openTaskFilter === "scheduled"
      ? "With due date"
      : openTaskFilter === "unscheduled"
        ? "Without due date"
        : "All open tasks"
  const quickAddSection =
    openTaskFilter === "scheduled" ? "scheduled" : "unscheduled"
  const moveLabels = [...new Set([...availableFolderLabels, personalLabel])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  const commentTotal = folderComments.reduce(
    (sum, comment) => sum + 1 + (comment.replies?.length ?? 0),
    0,
  )

  function completeWithTransition(task: FolderTask) {
    completingRef.current.add(task.id)
    setCompletingIds((current) => new Set(current).add(task.id))
    setCompletionNotice({ id: task.id, title: task.title })

    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(
      () => setCompletionNotice(null),
      5000,
    )

    const timer = window.setTimeout(() => {
      onToggleComplete(task.id, true)
      completingRef.current.delete(task.id)
      setCompletingIds((current) => {
        const next = new Set(current)
        next.delete(task.id)
        return next
      })
      completionTimers.current.delete(task.id)
    }, 240)
    completionTimers.current.set(task.id, timer)
  }

  function undoCompletion() {
    if (!completionNotice) return
    const timer = completionTimers.current.get(completionNotice.id)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      completionTimers.current.delete(completionNotice.id)
      completingRef.current.delete(completionNotice.id)
      setCompletingIds((current) => {
        const next = new Set(current)
        next.delete(completionNotice.id)
        return next
      })
    } else {
      onToggleComplete(completionNotice.id, false)
    }
    setCompletionNotice(null)
  }

  function renderTask(task: FolderTask, wiring?: TaskListWiring) {
    return (
      <TaskRow
        key={task.id}
        {...task}
        {...wiring}
        completionPreview={completingIds.has(task.id)}
        collapsing={completingIds.has(task.id)}
        onOpen={() => {
          if (!completingRef.current.has(task.id)) onOpenTask(task.id)
        }}
        onToggleComplete={(completedValue) =>
          task.status === "abandoned"
            ? onRestore(task.id)
            : completedValue && task.status !== "completed"
              ? completeWithTransition(task)
              : onToggleComplete(task.id, completedValue)
        }
        onToggleImportant={() => onToggleImportant(task.id)}
        onAbandon={() =>
          setPendingTaskAction({ type: "abandon", taskId: task.id })
        }
        onDelete={() =>
          setPendingTaskAction({ type: "delete", taskId: task.id })
        }
      />
    )
  }

  function addSection() {
    const section: SectionModel = { id: pageId("section"), name: "New section" }
    setItems((current) => [...current, { kind: "section", section }])
  }

  function addParagraph() {
    const paragraph: ParagraphModel = { id: pageId("paragraph"), text: "" }
    setItems((current) => [...current, { kind: "paragraph", paragraph }])
  }

  function removeSection(sectionId: string) {
    const index = items.findIndex(
      (item) => item.kind === "section" && item.section.id === sectionId,
    )
    const removed = items[index]
    if (!removed || removed.kind !== "section") return
    const keptAssignments = Object.entries(assign).filter(
      ([, value]) => value === sectionId,
    )

    setItems((current) =>
      current.filter(
        (item) => item.kind !== "section" || item.section.id !== sectionId,
      ),
    )
    setAssign((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([, value]) => value !== sectionId),
      ),
    )

    if (sectionUndoTimer.current !== null)
      window.clearTimeout(sectionUndoTimer.current)
    setSectionUndo({
      name: removed.section.name,
      restore: () => {
        setItems((current) => {
          const next = [...current]
          next.splice(Math.min(index, next.length), 0, removed)
          return next
        })
        setAssign((current) => ({
          ...current,
          ...Object.fromEntries(keptAssignments),
        }))
      },
    })
    sectionUndoTimer.current = window.setTimeout(
      () => setSectionUndo(null),
      5000,
    )
  }

  function openConversation() {
    if (commentsPlacement === "panel") {
      setPanelOpen((value) => !value)
    } else {
      pageCommentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  /* ---------------------------------------------------------- the header -- */

  /* Scaffolding above the title, not beside it (F2a, review H1) — and for a
     folder nobody has dressed yet, visible at rest rather than behind an
     accidental hover (Y6): the page advertises what it can become exactly
     once, then gets out of the way. */
  const pristine =
    !identity.cover && !identity.glyph && !identity.description
  const headerGhosts = (
    <div
      className={cn(
        "flex items-center gap-1 transition-opacity",
        T_FAST,
        pristine
          ? "opacity-100"
          : "opacity-0 group-hover/head:opacity-100 focus-within:opacity-100",
      )}
    >
      {!identity.cover ? (
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                className={cn(
                  "flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] leading-4 text-[var(--color-graphite-400)] transition-colors hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-600)]",
                  T_FAST,
                  FOCUS,
                )}
              >
                <ImageIcon className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
                Add cover
              </button>
            }
          />
          <PopoverContent align="start" className="p-0">
            <FolderCoverPicker
              value={identity.cover}
              folderName={storageName}
              onPick={(key) => savePrototypeFolderIdentity(storageName, { cover: key })}
              onRemove={() => savePrototypeFolderIdentity(storageName, { cover: undefined })}
            />
          </PopoverContent>
        </Popover>
      ) : null}
      {!identity.description && !editingDescription ? (
        <button
          type="button"
          onClick={() => setEditingDescription(true)}
          className={cn(
            "flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] leading-4 text-[var(--color-graphite-400)] transition-colors hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-600)]",
            T_FAST,
            FOCUS,
          )}
        >
          <AlignLeft className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
          Add description
        </button>
      ) : null}
    </div>
  )

  /* --------------------------------------------------------- the cluster -- */

  /* One row, the folder's controls, always exactly where they were — but in
     Dana's chrome, not a floating pill (F2a, review K1–K4). At rest it is a
     transparent row closing the header; scrolled, it docks against the top
     and only then takes a ground, a hairline, and the folder's name for
     context. Controls sit on the 40px rhythm and group by kind: views ·
     filter · conversation · people and Share · overflow. */
  const clusterRow = (
    <div
      className={cn(
        "sticky top-0 z-30 -mx-2 flex h-14 items-center gap-3 px-2 transition-[background-color,box-shadow]",
        T_FAST,
        stuck && "bg-card shadow-[0_1px_0_var(--color-graphite-200)]",
      )}
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm leading-5 font-medium text-[var(--color-graphite-800)] transition-opacity",
          T_FAST,
          stuck ? "opacity-100" : "opacity-0",
        )}
        aria-hidden={!stuck}
      >
        {displayName}
      </span>

      <div
        role="radiogroup"
        aria-label="Folder view"
        className="flex h-[var(--control-height)] items-center gap-0.5 rounded-md border border-[var(--color-graphite-200)] p-0.5"
      >
        {(
          [
            ["list", "List view", List, false],
            ["board", "Board view", LayoutGrid, false],
            ["calendar", "Calendar view", CalendarDays, true],
          ] as const
        ).map(([key, label, Icon, disabled]) => (
          <Tooltip key={key}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  role="radio"
                  aria-checked={view === key}
                  aria-label={label}
                  disabled={disabled}
                  onClick={() => setView(key as FolderView)}
                  className={cn(
                    "flex h-full w-9 items-center justify-center rounded-[4px] transition-[background-color,color] disabled:pointer-events-none disabled:opacity-35",
                    T_FAST,
                    FOCUS,
                    view === key
                      ? "bg-[var(--color-graphite-100)] text-[var(--color-graphite-800)]"
                      : "text-[var(--color-graphite-500)] hover:text-[var(--color-graphite-800)]",
                  )}
                >
                  <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              }
            />
            <TooltipContent side="bottom">
              {disabled ? "Calendar view — arrives with V5's calendar session" : label}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      <div className="flex items-center gap-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={`Filter open tasks: ${filterLabel}`}
                className={cn(
                  clusterButtonClass(openTaskFilter !== "all"),
                  openTaskFilter !== "all" && "w-auto gap-1.5 px-3",
                )}
              >
                <ListFilter className="size-5" strokeWidth={1.75} aria-hidden="true" />
                {openTaskFilter !== "all" ? (
                  <span className="text-sm leading-5">{filterLabel}</span>
                ) : null}
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuRadioGroup
              value={openTaskFilter}
              onValueChange={(value) =>
                setOpenTaskFilter(value as OpenTaskFilter)
              }
            >
              <DropdownMenuRadioItem value="all">
                All open tasks
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="scheduled">
                With due date
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="unscheduled">
                Without due date
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <ClusterButton
          icon={MessageSquare}
          label={commentsPlacement === "panel" ? "Conversation" : "Go to comments"}
          active={panelOpen}
          badge={commentTotal || undefined}
          onClick={openConversation}
          buttonRef={conversationRef}
        />
      </div>

      <div className="flex items-center gap-2">
        {isShared ? (
          <AvatarGroup>
            <Avatar size="sm"><AvatarFallback>IW</AvatarFallback></Avatar>
            <Avatar size="sm"><AvatarFallback>S</AvatarFallback></Avatar>
          </AvatarGroup>
        ) : null}
        {!isDefault ? (
          <Button
            variant="outline"
            className="h-[var(--control-height)] px-3 text-sm"
            onClick={() => setShareOpen(true)}
          >
            <Share2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Share
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="More folder actions"
                className={clusterButtonClass(false)}
              >
                <MoreHorizontal className="size-5" strokeWidth={1.75} aria-hidden="true" />
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-48">
            {isOwner ? (
              <DropdownMenuItem onClick={() => setTitleEditing(true)}>
                <Pencil className="size-4" />Rename
              </DropdownMenuItem>
            ) : null}
            {!isDefault ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderInput className="size-4" />Move to group
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-44">
                    <DropdownMenuRadioGroup
                      value={personalLabel || "__none"}
                      onValueChange={(value) => {
                        const nextLabel = value === "__none" ? null : value
                        setPersonalLabel(nextLabel ?? "")
                        onMoveToLabel?.(nextLabel, color)
                      }}
                    >
                      {moveLabels.map((label) => (
                        <DropdownMenuRadioItem key={label} value={label} closeOnClick>
                          {label}
                        </DropdownMenuRadioItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuRadioItem value="__none" closeOnClick>
                        No group
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null}
              {!isDefault && isOwner ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setDeleteFolderOpen(true)}
                  >
                    <Trash2 className="size-4" />Delete folder…
                  </DropdownMenuItem>
                </>
              ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )

  /* ------------------------------------------------------------ the body -- */

  const listBody = (
    <div className="space-y-6">
      <section aria-label={filterLabel}>
        {unsectioned.length > 0 ? (
          <div role="list" className="space-y-0.5">
            <TaskList tasks={unsectioned} renderRow={renderTask} />
          </div>
        ) : items.length === 0 ? (
          <p className="h-[var(--control-height)] px-2 text-sm leading-[var(--control-height)] text-[var(--color-graphite-500)]">
            {openTaskFilter === "scheduled"
              ? "No tasks with a due date."
              : openTaskFilter === "unscheduled"
                ? "No tasks without a due date."
                : "No open tasks."}
          </p>
        ) : null}
        <QuickAdd
          folderName={displayName}
          label={openTaskFilter === "scheduled" ? "Add scheduled task" : "Add task"}
          onAdd={(title) => onAdd(quickAddSection, title)}
          onOpenFullForm={() => onOpenFullForm(quickAddSection)}
        />
      </section>

      {items.map((item) => {
        if (item.kind === "paragraph") {
          const { paragraph } = item
          return (
            <textarea
              key={paragraph.id}
              defaultValue={paragraph.text}
              placeholder="Write something…"
              aria-label="Paragraph"
              rows={1}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus={paragraph.text === ""}
              onBlur={(event) => {
                const text = event.target.value.trim()
                setItems((current) =>
                  text
                    ? current.map((candidate) =>
                        candidate.kind === "paragraph" &&
                        candidate.paragraph.id === paragraph.id
                          ? { kind: "paragraph", paragraph: { ...paragraph, text } }
                          : candidate,
                      )
                    : current.filter(
                        (candidate) =>
                          candidate.kind !== "paragraph" ||
                          candidate.paragraph.id !== paragraph.id,
                      ),
                )
              }}
              className={cn(
                "-mx-1 block w-[calc(100%+0.5rem)] resize-none rounded-md bg-transparent px-1 py-1 text-[14px] leading-6 text-[var(--color-graphite-700)] outline-none transition-colors [field-sizing:content]",
                T_FAST,
                "placeholder:text-[var(--color-graphite-400)] hover:bg-[var(--color-graphite-50)] focus:bg-card focus:ring-1 focus:ring-[var(--color-dana-accent-600)]",
              )}
            />
          )
        }

        const { section } = item
        const sectionTasks = tasksOf(section.id)
        const open = !collapsedSections.has(section.id)
        return (
          <Collapsible
            key={section.id}
            open={open}
            onOpenChange={(value) =>
              setCollapsedSections((current) => {
                const next = new Set(current)
                if (value) next.delete(section.id)
                else next.add(section.id)
                return next
              })
            }
          >
            {/* The shell's own section-heading tier (F2a, review S1): 16px
                semibold on the hairline band, exactly as My Day's "Today"
                and the Tasks page's group headings already do it. The third
                heading style this replaces is recorded in the review. */}
            <div className="group/section mb-1 flex h-8 items-center gap-1.5 border-b border-border">
              <CollapsibleTrigger
                aria-label={open ? `Collapse ${section.name}` : `Expand ${section.name}`}
                className={cn(
                  "-ml-1.5 flex size-6 items-center justify-center rounded-md text-[var(--color-graphite-400)] transition-[background-color,color] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-700)]",
                  T_FAST,
                  FOCUS,
                )}
              >
                <ChevronRight
                  className={cn("size-4 transition-transform", T_FAST, open && "rotate-90")}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
              <InlineName
                value={section.name}
                ariaLabel={`Section name: ${section.name}`}
                className="text-base leading-6 font-semibold text-foreground"
                autoEdit={section.name === "New section"}
                onCommit={(name) =>
                  setItems((current) =>
                    current.map((candidate) =>
                      candidate.kind === "section" &&
                      candidate.section.id === section.id
                        ? { kind: "section", section: { ...section, name } }
                        : candidate,
                    ),
                  )
                }
              />
              <span className="text-[12px] leading-4 text-[var(--color-graphite-400)] tabular-nums">
                {sectionTasks.length}
              </span>
              <button
                type="button"
                aria-label={`Delete section ${section.name}`}
                title="Delete section — its tasks stay in the folder"
                onClick={() => removeSection(section.id)}
                className={cn(
                  "ml-auto flex size-6 items-center justify-center rounded-md text-[var(--color-graphite-400)] opacity-0 transition-opacity group-hover/section:opacity-100 focus-visible:opacity-100 hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-700)]",
                  T_FAST,
                  FOCUS,
                )}
              >
                <X className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            <CollapsibleContent>
              {sectionTasks.length > 0 ? (
                <div role="list" className="mt-0.5 space-y-0.5">
                  <TaskList tasks={sectionTasks} renderRow={renderTask} />
                </div>
              ) : null}
              <QuickAdd
                folderName={section.name}
                label="Add task"
                onAdd={(title) => {
                  pendingAssign.current = { title, sectionId: section.id }
                  onAdd("unscheduled", title)
                }}
                onOpenFullForm={() => onOpenFullForm("unscheduled")}
              />
            </CollapsibleContent>
          </Collapsible>
        )
      })}

      {/* The organising tier: where the page grows structure. After the blank
          row, per Imran's direction — capture first, organisation second. */}
      <div className="flex items-center gap-1">
        <GhostAction label="Add section" onClick={addSection} />
        <GhostAction label="Add a paragraph" onClick={addParagraph} />
      </div>

      {completed.length > 0 ? (
        <Collapsible open={completedOpen} onOpenChange={setCompletedOpen}>
          <CollapsibleTrigger
            className={`group/completed flex h-[var(--control-height)] w-full items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors hover:bg-[var(--color-graphite-50)] focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none ${completionNotice ? "bg-[var(--color-graphite-50)] text-[var(--color-graphite-800)]" : "text-[var(--color-graphite-500)]"}`}
          >
            <ChevronRight
              className="size-4 transition-transform group-data-panel-open/completed:rotate-90"
              strokeWidth={1.75}
            />
            Completed ({completed.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <TaskList className="mt-0.5" tasks={completed} renderRow={renderTask} />
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  )

  const boardBody = (
    <div className="flex items-start gap-3 overflow-x-auto pb-4">
      {[
        { id: "__none", name: "No section", tasks: unsectioned },
        ...items
          .filter(
            (item): item is Extract<PageItem, { kind: "section" }> =>
              item.kind === "section",
          )
          .map((item) => ({
            id: item.section.id,
            name: item.section.name,
            tasks: tasksOf(item.section.id),
          })),
        { id: "__done", name: "Done", tasks: completed },
      ].map((column) => (
        <div
          key={column.id}
          className="w-64 shrink-0 rounded-lg bg-[var(--color-graphite-50)] p-2"
        >
          <div className="flex h-7 items-center gap-1.5 px-1">
            <span className="text-[12px] leading-4 font-medium text-[var(--color-graphite-600)]">
              {column.name}
            </span>
            <span className="text-[12px] leading-4 text-[var(--color-graphite-400)] tabular-nums">
              {column.tasks.length}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {column.tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onOpenTask(task.id)}
                className={cn(
                  "rounded-md border border-[var(--color-graphite-200)] bg-card px-3 py-2 text-left transition-shadow hover:shadow-[var(--elevation-1)]",
                  T_FAST,
                  FOCUS,
                )}
              >
                <span
                  className={cn(
                    "block text-[14px] leading-5 text-[var(--color-graphite-800)]",
                    column.id === "__done" &&
                      "text-[var(--color-graphite-500)] line-through decoration-[var(--color-graphite-400)]",
                  )}
                >
                  {task.title}
                </span>
                {(task.due || task.assignee) && column.id !== "__done" ? (
                  <span className="mt-1 flex items-center gap-2">
                    {task.due ? (
                      <span
                        className={cn(
                          "text-[12px] leading-4",
                          task.due.overdue
                            ? "font-medium text-[var(--color-danger-700)]"
                            : "text-[var(--color-graphite-500)]",
                        )}
                      >
                        {task.due.label}
                      </span>
                    ) : null}
                    {task.assignee ? (
                      <Face person={task.assignee} className="ml-auto" />
                    ) : null}
                  </span>
                ) : null}
              </button>
            ))}
            {column.id !== "__done" ? (
              <GhostAction
                label="Add task"
                onClick={() => {
                  if (column.id !== "__none") {
                    pendingAssign.current = {
                      title: "New task",
                      sectionId: column.id,
                    }
                  }
                  onAdd("unscheduled", "New task")
                }}
              />
            ) : null}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addSection}
        className={cn(
          "flex h-9 w-40 shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-[var(--color-graphite-300)] px-3 text-[12px] leading-4 text-[var(--color-graphite-400)] transition-colors hover:border-[var(--color-graphite-400)] hover:text-[var(--color-graphite-600)]",
          T_FAST,
          FOCUS,
        )}
      >
        <Plus className="size-3.5" strokeWidth={2} aria-hidden="true" />
        Add section
      </button>
    </div>
  )

  /* ------------------------------------------------------------ assembly -- */

  return (
    <div className="relative min-h-full">
      {cover ? (
        /* The band itself is the affordance: click anywhere on it to change
           it (F2a, review H3). The scrim at its foot is what lets the
           overlapping plate and the hint sit on any cover without a fight. */
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label="Change cover"
                className={cn("group/cover relative block h-44 w-full cursor-pointer", FOCUS)}
                style={cover}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--color-graphite-950)]/12 to-transparent"
                />
                <span
                  className={cn(
                    "absolute right-4 bottom-3 flex h-7 items-center gap-1.5 rounded-md border border-[var(--color-graphite-200)] bg-card/95 px-2 text-[12px] leading-4 font-medium text-[var(--color-graphite-700)] opacity-0 shadow-[var(--elevation-1)] backdrop-blur transition-opacity group-hover/cover:opacity-100",
                    T_FAST,
                  )}
                >
                  <ImageIcon className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
                  Change cover
                </span>
              </button>
            }
          />
          <PopoverContent align="end" className="p-0">
            <FolderCoverPicker
              value={identity.cover}
              folderName={storageName}
              onPick={(key) =>
                savePrototypeFolderIdentity(storageName, { cover: key })
              }
              onRemove={() =>
                savePrototypeFolderIdentity(storageName, { cover: undefined })
              }
            />
          </PopoverContent>
        </Popover>
      ) : null}

      <div className="mx-auto w-full max-w-[var(--shell-content-max)] px-10 pb-8">
        <header className={cn("group/head", cover ? "pt-0" : "pt-6")}>
          {/* The identity band: the mark holds the corner, the scaffolding
              ghosts sit above the title where scaffolding belongs (H1, H2).
              Over a cover the mark stands on a plate and earns its shadow;
              on a bare page a plate would be decoration, so the glyph
              stands alone, larger, and the hover wash is the only chrome. */}
          <div className="flex items-end justify-between gap-4">
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    aria-label="Change folder icon and color"
                    className={cn(
                      "flex shrink-0 items-center justify-center transition-shadow",
                      T_FAST,
                      FOCUS,
                      cover
                        ? "relative z-10 -mt-7 size-14 rounded-xl border border-[var(--color-graphite-200)] bg-card shadow-[var(--elevation-1)]"
                        : "-ml-1.5 size-12 rounded-xl hover:bg-[var(--color-graphite-50)]",
                    )}
                  >
                    <Glyph
                      className={cover ? "size-8" : "size-10"}
                      style={{ color }}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  </button>
                }
              />
              <PopoverContent align="start" className="p-0">
                <FolderIconPicker
                  glyph={identity.glyph}
                  color={color}
                  onPick={(next) => savePrototypeFolderIdentity(storageName, next)}
                />
              </PopoverContent>
            </Popover>
            {headerGhosts}
          </div>

          <div className="mt-2">
            <InlineName
              key={titleEditing ? "menu-edit" : "resting"}
              value={displayName}
              ariaLabel={`Folder name: ${displayName}`}
              className="text-2xl leading-8 font-semibold text-foreground"
              autoEdit={titleEditing}
              onDoneEditing={() => setTitleEditing(false)}
              onCommit={(name) => {
                setDisplayName(name)
                onRenameFolder?.(name)
              }}
            />
          </div>

          {completionTotal > 0 ? (
            <p className="mt-1 text-xs leading-4 text-muted-foreground">
              {completedCount} of {completionTotal} done
            </p>
          ) : null}

          {identity.description || editingDescription ? (
            <textarea
              defaultValue={identity.description ?? ""}
              placeholder="Add a description"
              aria-label="Folder description"
              rows={1}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus={editingDescription}
              onBlur={(event) => {
                const text = event.target.value.trim()
                savePrototypeFolderIdentity(storageName, {
                  description: text || undefined,
                })
                setEditingDescription(false)
              }}
              className={cn(
                "-mx-1 mt-2 block w-[calc(100%+0.5rem)] max-w-xl resize-none rounded-md bg-transparent px-1 py-0.5 text-[14px] leading-6 text-[var(--color-graphite-600)] outline-none transition-colors [field-sizing:content]",
                T_FAST,
                "placeholder:text-[var(--color-graphite-400)] hover:bg-[var(--color-graphite-50)] focus:bg-card focus:ring-1 focus:ring-[var(--color-dana-accent-600)]",
              )}
            />
          ) : null}
        </header>

        {/* The sentinel is what tells the row it has docked: 1px tall, its
            own layout cost cancelled by the negative margin. */}
        <div ref={sentinelRef} aria-hidden="true" className="h-px -mb-px" />
        {clusterRow}

        <div className="mt-2">
          {previewState === "loading" ? (
            <SkeletonList />
          ) : previewState === "error" ? (
            <InlineError />
          ) : previewState === "empty" || isEmpty ? (
            <div>
              <Empty className="min-h-52">
                <EmptyMedia className="text-[var(--color-graphite-400)]">
                  <Glyph className="size-9" strokeWidth={1.6} aria-hidden="true" />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyDescription className="text-sm">
                    No tasks yet. Add one below.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
              <QuickAdd
                folderName={displayName}
                label="Add task"
                onAdd={(title) => onAdd("unscheduled", title)}
                onOpenFullForm={() => onOpenFullForm("unscheduled")}
              />
              <div className="mt-2 flex items-center gap-1">
                <GhostAction label="Add section" onClick={addSection} />
                <GhostAction label="Add a paragraph" onClick={addParagraph} />
              </div>
            </div>
          ) : view === "list" ? (
            listBody
          ) : (
            boardBody
          )}
        </div>

        {/* The folder's conversation at the end of the page — the Notion
            placement. A page that ends in its discussion reads as "here is
            the work, and here is what we said about it". DES-134 candidate A;
            the switch below draws candidate B. */}
        {commentsPlacement === "page" &&
        previewState !== "loading" &&
        previewState !== "error" ? (
          <div ref={pageCommentsRef} className="mt-10 scroll-mt-16">
            {/* The page's own heading tier, not the card's block label
                (F2a, review M7). */}
            <div className="mb-2 flex h-8 items-center gap-2 border-b border-border">
              <h2 className="text-base leading-6 font-semibold text-foreground">
                Comments
              </h2>
              {commentTotal > 0 ? (
                <span className="text-[12px] leading-4 text-[var(--color-graphite-400)] tabular-nums">
                  {commentTotal}
                </span>
              ) : null}
            </div>
            <CommentsThread
              comments={folderComments}
              onChange={setFolderComments}
              placeholder={`Message everyone in ${displayName}`}
            />
          </div>
        ) : null}
      </div>

      {/* Candidate B: the conversation as a side panel — the chat reading.
          Non-modal on purpose: a conversation about the work should not cover
          the work. */}
      {commentsPlacement === "panel" && panelOpen ? (
        <aside
          aria-label={`Conversation in ${displayName}`}
          /* Under the page bar, not over it (F2a, review M8). */
          className="fixed top-[var(--shell-pagebar-height)] right-0 bottom-0 z-40 flex w-[360px] flex-col border-l border-[var(--color-graphite-200)] bg-card shadow-[var(--elevation-2)] duration-[var(--duration-slow)] ease-[var(--ease-enter)] animate-in slide-in-from-right"
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-graphite-100)] px-4">
            <MessageSquare
              className="size-4 text-[var(--color-graphite-500)]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span className="min-w-0 truncate text-sm font-medium text-[var(--color-graphite-800)]">
              {displayName}
            </span>
            <span className="text-[12px] leading-4 text-[var(--color-graphite-400)]">
              conversation
            </span>
            <button
              ref={panelCloseRef}
              type="button"
              aria-label="Close conversation"
              onClick={() => {
                setPanelOpen(false)
                conversationRef.current?.focus()
              }}
              className={cn(
                "ml-auto flex size-7 items-center justify-center rounded-md text-[var(--color-graphite-500)] transition-colors hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)]",
                T_FAST,
                FOCUS,
              )}
            >
              <X className="size-4 data-[size=sm]:size-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <CommentsThread
              comments={folderComments}
              onChange={setFolderComments}
              placeholder={`Message everyone in ${displayName}`}
              emptyWord="message"
            />
          </div>
        </aside>
      ) : null}

      {/* The concept's own switchboard. An instrument, not a design — it is
          how Imran flips between the drawn candidates without a rebuild, and
          it leaves with the decisions. */}
      {conceptOpen ? (
        <div className="fixed bottom-4 left-4 z-40 w-64 rounded-lg border border-[var(--color-graphite-200)] bg-card/95 p-3 shadow-[var(--elevation-1)] backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-[12px] leading-4 font-semibold text-[var(--color-graphite-700)]">
              Concept switches
            </span>
            <button
              type="button"
              aria-label="Hide concept switches"
              onClick={() => setConceptOpen(false)}
              className={cn(
                "flex size-5 items-center justify-center rounded text-[var(--color-graphite-400)] hover:text-[var(--color-graphite-700)]",
                FOCUS,
              )}
            >
              <X className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-0.5 text-[11px] leading-4 text-[var(--color-graphite-400)]">
            An instrument, not the design.
          </p>
          <div className="mt-2">
            <span className="text-[11px] leading-4 font-medium text-[var(--color-graphite-500)]">
              Folder conversation
            </span>
            <div className="mt-1 flex gap-0.5 rounded-md bg-[var(--color-graphite-50)] p-0.5">
              {(
                [
                  ["page", "End of page"],
                  ["panel", "Side panel"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={commentsPlacement === key}
                  onClick={() => {
                    setCommentsPlacement(key)
                    setPanelOpen(key === "panel")
                  }}
                  className={cn(
                    "h-6 flex-1 rounded text-[11px] leading-4 font-medium transition-colors",
                    T_FAST,
                    FOCUS,
                    commentsPlacement === key
                      ? "bg-card text-[var(--color-graphite-800)] shadow-sm"
                      : "text-[var(--color-graphite-500)] hover:text-[var(--color-graphite-700)]",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-[var(--color-graphite-400)]">
            The floating New task is retired here — the blank row is the
            page's capture point (DES-133).
          </p>
          <a
            href={(() => {
              const url = new URL(window.location.href)
              url.searchParams.set("folder-page", "v1")
              return url.toString()
            })()}
            className={cn(
              "mt-1.5 inline-block text-[11px] leading-4 text-[var(--color-dana-accent-700)] underline-offset-2 hover:underline",
              FOCUS,
            )}
          >
            Compare: the previous folder page
          </a>
        </div>
      ) : null}

      {!isDefault ? (
        <SharingPanel
          open={shareOpen}
          onOpenChange={setShareOpen}
          isOwner={isOwner}
          folderName={displayName}
        />
      ) : null}

      {sectionUndo ? (
        <div
          role="status"
          className={cn(
            "fixed right-6 z-40 flex min-h-[var(--control-height)] max-w-sm items-center gap-2 rounded-lg bg-[var(--color-graphite-900)] px-3 text-sm text-white shadow-[var(--elevation-1)]",
            completionNotice ? "bottom-[76px]" : "bottom-6",
          )}
        >
          <span className="min-w-0 truncate">
            Section deleted: {sectionUndo.name} — its tasks stay in the folder
          </span>
          <Button
            variant="ghost"
            className="h-8 px-2 text-xs text-white hover:bg-white/10 hover:text-white"
            onClick={() => {
              sectionUndo.restore()
              setSectionUndo(null)
              if (sectionUndoTimer.current !== null) {
                window.clearTimeout(sectionUndoTimer.current)
                sectionUndoTimer.current = null
              }
            }}
          >
            Undo
          </Button>
        </div>
      ) : null}

      {completionNotice ? (
        <div
          role="status"
          className="fixed right-6 bottom-6 z-40 flex min-h-[var(--control-height)] max-w-sm items-center gap-2 rounded-lg bg-[var(--color-graphite-900)] px-3 text-sm text-white shadow-[var(--elevation-1)]"
        >
          <CheckCircle2 className="size-4 shrink-0" strokeWidth={1.75} />
          <span className="min-w-0 truncate">
            Completed: {completionNotice.title}
          </span>
          <Button
            variant="ghost"
            className="h-8 px-2 text-xs text-white hover:bg-white/10 hover:text-white"
            onClick={undoCompletion}
          >
            Undo
          </Button>
        </div>
      ) : null}

      <AlertDialog
        open={pendingTaskAction !== null}
        onOpenChange={(open) => !open && setPendingTaskAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingTaskAction?.type === "abandon"
                ? "Abandon this task?"
                : "Delete this task?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTaskAction?.type === "abandon"
                ? "You can restore it from this folder later."
                : "This can’t be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              destructive
              onClick={() => {
                if (!pendingTaskAction) return
                pendingTaskAction.type === "abandon"
                  ? onAbandon(pendingTaskAction.taskId)
                  : onDelete(pendingTaskAction.taskId)
              }}
            >
              {pendingTaskAction?.type === "abandon" ? "Abandon" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteFolderOpen} onOpenChange={setDeleteFolderOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {openCount} open, {completed.length}{" "}
              completed, and {abandonedCount} abandoned tasks for every member.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              destructive
              onClick={() => {
                onDeleteFolder?.()
                setDeleteFolderOpen(false)
              }}
            >
              Delete folder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
