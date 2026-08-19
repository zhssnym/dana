/*
The folder page as a page, not a query.

Imran's direction across 2026-08-18, in three rounds: first the concept (a
Notion-like page: cover, mark, description, sections, one steady control
home, no floating button); then the F1 review's translation pass (F2a); then
his critique of the screenshots, which this file now embodies:

- the folder controls are a **thin strip** under the cover, docking on scroll
- the filter offers **real variables**, not just the due date
- the description lives **at the title**, not in a far corner
- the board is **two columns wide, its sections movable**, with real capture
- comments are **one polished surface with four homes** — end of page,
  floating dock, side panel, full screen — switched from the surface itself
- a board card opens the task as a **full-screen surface** that can become a
  sidebar on either edge, a floating card, or **a tab on the page bar**
- structure inserts **positionally** from a quiet line between blocks

The register entries: DES-130–135, DES-117 (the task surface answers its
full-screen half). Everything needing a column or an endpoint is Lane 2,
drawn on fixtures, excluded from the port by its entry. The previous folder
screen stays at `?folder-page=v1`.
*/

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Ban,
  CalendarDays,
  Check as CheckIcon,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderInput,
  GripVertical,
  Heading1,
  Image as ImageIcon,
  LayoutGrid,
  List,
  ListChecks,
  ListFilter,
  MessageSquare,
  MoreHorizontal,
  PanelRight,
  Pencil,
  Pilcrow,
  Plus,
  Share2,
  Star,
  Trash2,
  UserRound,
  X,
  type LucideIcon,
} from "@/lib/icons"
import { Switch } from "@/components/ui/switch"
import { useSortableList } from "@/lib/use-sortable-list"

import { CommentsThread, voiceBars } from "@/components/comments"
import { ViewStrip } from "@/components/view-strip"
import { WindowActivity, WindowBarActions } from "@/components/window-bar"
import { AddCoverAction, PageCover } from "@/components/page-cover"
import {
  DEFAULT_FILTERS,
  FilterControl,
  activeFilterCount,
  applyTaskFilters,
  stripButtonClass,
  type TaskFilters,
} from "@/components/task-filters"
import { taskSurfacePreference } from "@/lib/task-surface-preference"
import {
  FolderCoverPicker,
  coverRepositions,
  resolveCover,
} from "@/components/folder-cover"
import { FolderIconPicker, folderGlyph } from "@/components/folder-icon-picker"
import { QuickAdd } from "@/components/quick-add"
import { SharingPanel } from "@/components/sharing-panel"
import { InlineError, SkeletonList } from "@/components/state-patterns"
import { Face } from "@/components/task-card"
import { TaskSurface, type TaskSurfaceMode } from "@/components/task-surface"
import {
  TaskList,
  TaskRow,
  type TaskListWiring,
  type TaskOpenMode,
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
import { PEOPLE, commentCount, type ConceptComment } from "@/lib/task-model"
import { cn } from "@/lib/utils"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const T_BASE = "duration-[var(--duration-base)] ease-[var(--ease-enter)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

type FolderTask = TaskRowProps & { id: string }
type FolderView = "list" | "board"
type ConversationView = "page" | "panel"

/* ------------------------------------------------------------- filtering -- */





/* ------------------------------------------------------------- fixtures -- */

interface SectionModel {
  id: string
  name: string
  /* A paragraph belonging to this section, above its tasks — the gap Imran
     found: the insertion lines lived between page blocks, so there was
     nowhere to write between a heading and the first row under it. */
  intro?: string
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
          text: "Venue and catering are settled — invitations and transport are the open fronts.",
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

/* The ghost tier: 12px, a plus, quiet until hovered — DES-115's voice at
   page scale. */
function GhostAction({
  label,
  onClick,
}: {
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
      <Plus className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      {label}
    </button>
  )
}


function StripButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  badge,
  buttonRef,
}: {
  icon: typeof List
  label: string
  onClick?: () => void
  active?: boolean
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
            onClick={onClick}
            className={stripButtonClass(active)}
          >
            <Icon className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
            {badge ? (
              <span className="absolute -top-0.5 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-graphite-200)] px-1 text-[0.625rem] leading-none font-medium text-[var(--color-graphite-600)] tabular-nums">
                {badge}
              </span>
            ) : null}
          </button>
        }
      />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

/* The little quiet menu that moves a conversation between its four homes. */
const CONVERSATION_VIEWS: Record<
  ConversationView,
  { name: string; icon: LucideIcon }
> = {
  page: { name: "Inline, at the end of the page", icon: AlignLeft },
  panel: { name: "Side panel", icon: PanelRight },
}

/* Icons only, labels on hover — Imran's rule for every view switcher, and
   inline earns an icon of its own rather than being the one option named in
   words. */
function ConversationViewMenu({
  view,
  onChange,
}: {
  view: ConversationView
  onChange: (view: ConversationView) => void
}) {
  return (
    <ViewStrip
      ariaLabel="Where the conversation lives"
      value={view}
      options={(Object.keys(CONVERSATION_VIEWS) as ConversationView[]).map(
        (key) => ({
          key,
          label: CONVERSATION_VIEWS[key].name,
          icon: CONVERSATION_VIEWS[key].icon,
        }),
      )}
      onSelect={onChange}
      collapse
    />
  )
}

/* The quiet line between blocks that Notion taught everyone to expect —
   adopted at Imran's direction, in Dana's one interaction colour. Hover the
   gap and the line arrives with a plus; the menu inserts exactly there.
   Tasks are absent from the menu on purpose: a task's position is DES-071's
   unresolved ordering question, and a control that pretended otherwise would
   be drawing a lie. */
function InsertLine({
  onSection,
  onParagraph,
}: {
  /* Omitted inside a section: a section within a section is not a thing
     Dana has, and a menu item that cannot mean anything is worse than a
     shorter menu. */
  onSection?: () => void
  onParagraph: () => void
}) {
  return (
    /* A real 24px strip in the flow, not a negatively-margined overlay. It
       was `-my-3` before, which pulled it up under the section's own
       quick-add row and stole the hover — which is why a paragraph could
       not be inserted straight after a section until a task existed there
       (Imran's catch). It now owns its space and always answers. */
    <div className="group/ins relative flex h-6 items-center">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label="Insert here"
              className={cn(
                "absolute -left-8 flex size-6 items-center justify-center rounded-md text-[var(--color-dana-accent-600)] opacity-0 transition-opacity group-hover/ins:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 hover:bg-[var(--color-dana-accent-50)]",
                T_FAST,
                FOCUS,
              )}
            >
              <Plus className="size-4 data-[size=sm]:size-4" strokeWidth={2} aria-hidden="true" />
            </button>
          }
        />
        <DropdownMenuContent align="start" className="w-44">
          {onSection ? (
            <DropdownMenuItem onClick={onSection}>
              <Heading1 className="size-4" />Section here
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={onParagraph}>
            <Pilcrow className="size-4" />Paragraph here
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span
        aria-hidden="true"
        className={cn(
          "h-px flex-1 bg-[var(--color-dana-accent-200)] opacity-0 transition-opacity group-hover/ins:opacity-100",
          T_FAST,
        )}
      />
    </div>
  )
}

/* Capture inside a board column: a ghost that becomes a real field, because
   a button that invents a task called "New task" is a button that scatters
   junk (review S5). Enter adds and stays for the next one; Escape leaves. */
function BoardQuickAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState("")

  if (!editing) {
    return <GhostAction label="Add task" onClick={() => setEditing(true)} />
  }

  return (
    <input
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus
      value={title}
      placeholder="Task name"
      aria-label="New task name"
      onChange={(event) => setTitle(event.target.value)}
      onBlur={() => {
        setEditing(false)
        setTitle("")
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          const trimmed = title.trim()
          if (trimmed) onAdd(trimmed)
          setTitle("")
        }
        if (event.key === "Escape") {
          setEditing(false)
          setTitle("")
        }
      }}
      className={cn(
        "h-9 w-full rounded-md border border-[var(--color-graphite-300)] bg-card px-2.5 text-[13px] leading-5 outline-none",
        "placeholder:text-[var(--color-graphite-400)] focus-visible:border-[var(--color-dana-accent-600)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-100)]",
      )}
    />
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
  onOpenTask: (taskId: string, mode?: TaskOpenMode) => void
  onToggleComplete: (taskId: string, completed: boolean) => void
  onToggleImportant: (taskId: string) => void
  onRestore: (taskId: string) => void
  onAbandon: (taskId: string) => void
  onDelete: (taskId: string) => void
  onDeleteFolder?: () => void
  onRenameFolder?: (name: string) => void
  onMoveToLabel?: (label: string | null, color: string) => void
  onOpenInTab?: (taskId: string) => void
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
  onOpenInTab,
}: FolderPageV2Props) {
  const identity = useFolderIdentity(storageName)
  const Glyph = folderGlyph(identity.glyph)
  const color = identity.color ?? folderColor
  const coverPos = identity.coverPos ?? 50
  const cover = resolveCover(identity.cover, storageName, coverPos)

  const [displayName, setDisplayName] = useState(folderName)
  const [personalLabel, setPersonalLabel] = useState(folderLabel)
  const [shareOpen, setShareOpen] = useState(initialShareOpen)
  const [view, setView] = useState<FolderView>("list")
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS)
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

  /* The conversation (DES-134): one thread, four homes, switched from the
     surface itself rather than from a lab instrument. */
  const [folderComments, setFolderComments] = useState<ConceptComment[]>(
    () => FOLDER_THREADS[storageName] ?? [],
  )
  const [conversationView, setConversationView] =
    useState<ConversationView>("page")
  const [conversationOpen, setConversationOpen] = useState(false)
  /* Shut by default — the point of the collapsed section. */
  const [pageCommentsOpen, setPageCommentsOpen] = useState(false)
  const pageCommentsRef = useRef<HTMLDivElement>(null)

  /* The task surface (DES-117's full-screen half): opened from a board card,
     switchable to a sidebar on either edge, a floating card, or a tab. */
  const [openSurface, setOpenSurface] = useState<{
    id: string
    mode: TaskSurfaceMode
  } | null>(null)

  /* Reposition mode for photographic covers. */

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

  /* Rename's second route (K5): the menu arms the inline edit — for the
     folder title and for any section. */
  const [titleEditing, setTitleEditing] = useState(false)
  const [renamingSection, setRenamingSection] = useState<string | null>(null)

  /* Escape closes whichever conversation or task surface is up; focus
     returns to the strip. */
  const conversationRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!(conversationOpen && conversationView !== "page")) return
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setConversationOpen(false)
        conversationRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [conversationOpen, conversationView])

  /* Deleting a section says so and offers the way back (S4). */
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

  const allOpen = [...scheduled, ...unscheduled]
  const openTasks = applyTaskFilters(allOpen, filters)
  const filterCount = activeFilterCount(filters)

  /* Claim a freshly added task for its section once the shell has minted it. */
  useEffect(() => {
    const pending = pendingAssign.current
    if (!pending) return
    const candidate = allOpen.find(
      (task) => task.title === pending.title && !assign[task.id],
    )
    if (candidate) {
      pendingAssign.current = null
      setAssign((current) => ({ ...current, [candidate.id]: pending.sectionId }))
    }
  })

  const sectionIds = new Set(
    items.filter((item) => item.kind === "section").map((item) => item.section.id),
  )
  const unsectioned = openTasks.filter(
    (task) => !assign[task.id] || !sectionIds.has(assign[task.id]!),
  )
  const tasksOf = (sectionId: string) =>
    openTasks.filter((task) => assign[task.id] === sectionId)

  const pendingCount = allOpen.filter(
    (task) => task.status !== "abandoned" && !completingIds.has(task.id),
  ).length
  const completedCount = completed.length + completingIds.size
  const completionTotal = pendingCount + completedCount
  const openCount = allOpen.filter((task) => task.status !== "abandoned").length
  const abandonedCount = allOpen.filter(
    (task) => task.status === "abandoned",
  ).length
  const isEmpty =
    scheduled.length === 0 && unscheduled.length === 0 && completed.length === 0
  const quickAddSection = filters.due === "with" ? "scheduled" : "unscheduled"
  const moveLabels = [...new Set([...availableFolderLabels, personalLabel])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  const commentTotal = folderComments.reduce(
    (sum, comment) => sum + 1 + (comment.replies?.length ?? 0),
    0,
  )
  const surfaceTask = openSurface
    ? [...allOpen, ...completed].find((task) => task.id === openSurface.id)
    : undefined
  const pristine = !identity.cover && !identity.glyph && !identity.description

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
        /* A mode means the row's view strip asked for a surface, and this
           page hosts one; a bare open is the screen's own business. */
        onOpen={(mode) => {
          if (completingRef.current.has(task.id)) return
          if (mode === "tab") onOpenInTab?.(task.id)
          else if (mode) setOpenSurface({ id: task.id, mode })
          else onOpenTask(task.id)
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

  function insertItem(index: number, kind: "section" | "paragraph") {
    const item: PageItem =
      kind === "section"
        ? { kind: "section", section: { id: pageId("section"), name: "New section" } }
        : { kind: "paragraph", paragraph: { id: pageId("paragraph"), text: "" } }
    setItems((current) => {
      const next = [...current]
      next.splice(Math.min(index, next.length), 0, item)
      return next
    })
  }

  function moveItem(from: number, to: number) {
    if (to < 0 || to >= items.length) return
    setItems((current) => {
      const next = [...current]
      const [moved] = next.splice(from, 1)
      if (moved) next.splice(to, 0, moved)
      return next
    })
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

  /* Board columns reorder by dragging their grip: the drag tracks the
     pointer, the hovered column's slot is where release lands it. Column
     order IS page order — the board is the list turned sideways, so a move
     here reorders the sections everywhere. */
  const [colDrag, setColDrag] = useState<string | null>(null)
  const columnRefs = useRef(new Map<string, HTMLElement>())

  function columnDragProps(sectionId: string) {
    return {
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        setColDrag(sectionId)
      },
      onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (colDrag !== sectionId) return
        for (const [otherId, el] of columnRefs.current) {
          if (otherId === sectionId) continue
          const rect = el.getBoundingClientRect()
          if (
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom
          ) {
            setItems((current) => {
              const from = current.findIndex(
                (item) => item.kind === "section" && item.section.id === sectionId,
              )
              const to = current.findIndex(
                (item) => item.kind === "section" && item.section.id === otherId,
              )
              if (from < 0 || to < 0) return current
              const next = [...current]
              const [moved] = next.splice(from, 1)
              if (moved) next.splice(to, 0, moved)
              return next
            })
            break
          }
        }
      },
      onPointerUp: () => setColDrag(null),
      onPointerCancel: () => setColDrag(null),
    }
  }

  /* Sections and paragraphs ride the same pointer engine as the task rows,
     a card's steps and its blocks — the review's S3, closed: one gesture,
     learned once, meaning the same thing at every level. */
  const pageDrag = useSortableList({
    count: items.length,
    onReorder: (from, to) =>
      setItems((current) => {
        const next = [...current]
        const [moved] = next.splice(from, 1)
        if (moved) next.splice(to, 0, moved)
        return next
      }),
    describe: (index) => {
      const item = items[index]
      if (!item) return "Block"
      return item.kind === "section" ? item.section.name : "Paragraph"
    },
  })

  function openConversation() {
    if (conversationView === "page") {
      setPageCommentsOpen(true)
      pageCommentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    } else {
      setConversationOpen((value) => !value)
    }
  }

  function changeConversationView(next: ConversationView) {
    setConversationView(next)
    if (next === "page") {
      setConversationOpen(false)
      setPageCommentsOpen(true)
      window.setTimeout(
        () =>
          pageCommentsRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        60,
      )
    } else {
      setConversationOpen(true)
    }
  }

  /* ----------------------------------------------------------- the strip -- */

  /* The controls live in the window bar now (DES-139), not in a sticky row
     inside the page: they belong to the tab, the tab already says the
     folder's name, and chrome that scrolls with content is not chrome. */
  const strip = (
    <WindowBarActions>
      {/* One icon at rest — the view you are in — widening to all three on
          hover or focus (Imran, 2026-08-18). A switcher spends its life
          showing rather than being used, so at rest it should cost the width
          of what it is showing and nothing more. The options are always in
          the DOM, so the keyboard and a screen reader see the full group
          however narrow it looks. */}
      <div
        role="radiogroup"
        aria-label="Folder view"
        className="group/views pointer-events-auto flex h-7 items-center gap-0.5 rounded-md border border-transparent p-0.5 transition-[background-color,border-color] duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:border-[var(--color-graphite-200)] focus-within:border-[var(--color-graphite-200)]"
      >
        {(
          [
            ["list", "List view", List, false],
            ["board", "Board view", LayoutGrid, false],
            ["calendar", "Calendar view", CalendarDays, true],
          ] as const
        ).map(([key, label, Icon, disabled]) => {
          const current = view === key
          return (
            <Tooltip key={key}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    role="radio"
                    aria-checked={current}
                    aria-label={label}
                    disabled={disabled}
                    tabIndex={current ? 0 : -1}
                    onClick={() => setView(key as FolderView)}
                    className={cn(
                      "flex h-full items-center justify-center overflow-hidden rounded-[4px] transition-[width,opacity,background-color,color] disabled:pointer-events-none disabled:opacity-35",
                      T_FAST,
                      FOCUS,
                      current
                        ? "w-7 opacity-100 text-[var(--color-graphite-800)] group-hover/views:bg-[var(--color-graphite-100)] group-focus-within/views:bg-[var(--color-graphite-100)]"
                        : "w-0 opacity-0 text-[var(--color-graphite-500)] group-hover/views:w-7 group-hover/views:opacity-100 group-focus-within/views:w-7 group-focus-within/views:opacity-100 hover:text-[var(--color-graphite-800)]",
                    )}
                  >
                    <Icon className="size-3.5 shrink-0 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                }
              />
              <TooltipContent side="bottom">
                {disabled ? "Calendar view — arrives with V5's calendar session" : label}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      <div className="pointer-events-auto flex items-center gap-0.5">
        <FilterControl filters={filters} setFilters={setFilters} />
        <StripButton
          icon={MessageSquare}
          label={conversationView === "page" ? "Go to comments" : "Conversation"}
          active={conversationOpen && conversationView !== "page"}
          badge={commentTotal || undefined}
          onClick={openConversation}
          buttonRef={conversationRef}
        />
      </div>

      <div className="pointer-events-auto flex items-center gap-1.5">
        <WindowActivity
          summary="Edited just now"
          entries={[
            { action: "Edited", actor: "Imran Wafa", at: "Just now" },
            { action: "Created", actor: "Imran Wafa", at: "4 Aug" },
          ]}
        />
        {isShared ? (
          <AvatarGroup>
            <Avatar size="sm"><AvatarFallback>IW</AvatarFallback></Avatar>
            <Avatar size="sm"><AvatarFallback>S</AvatarFallback></Avatar>
          </AvatarGroup>
        ) : null}
        {/* An icon, not a filled block: the bar is chrome and chrome is
            quiet (Imran, 2026-08-18). Sharing is reached as often as the
            other controls beside it and should not shout over them. */}
        {!isDefault ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="Share this folder"
                  onClick={() => setShareOpen(true)}
                  className={stripButtonClass(shareOpen)}
                >
                  <Share2 className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              }
            />
            <TooltipContent side="bottom">Share</TooltipContent>
          </Tooltip>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="More folder actions"
                className={stripButtonClass(false)}
              >
                <MoreHorizontal className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-52">
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
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                const url = new URL(window.location.href)
                url.searchParams.set("folder-page", "v1")
                window.location.assign(url)
              }}
            >
              Previous folder page
            </DropdownMenuItem>
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
    </WindowBarActions>
  )

  /* ------------------------------------------------------------ the body -- */

  /* At the foot of a folder the conversation is a *closed* section, not an
     open thread (Imran, 2026-08-18): a page ends in its work, and the talk
     about the work should be one quiet line you choose to open. Same
     collapsible grammar as Completed directly above it, so the page's foot
     reads as two peers rather than a control and an essay. */
  const conversationHeader = (
    <Collapsible
      open={pageCommentsOpen}
      onOpenChange={setPageCommentsOpen}
      className="mt-6 scroll-mt-16"
    >
      <div ref={pageCommentsRef} className="flex items-center gap-1">
        <CollapsibleTrigger
          className={cn(
            "group/comments flex h-[var(--control-height)] min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-[var(--color-graphite-500)] transition-colors hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-800)]",
            T_FAST,
            FOCUS,
          )}
        >
          <ChevronRight
            className="size-4 shrink-0 transition-transform group-data-panel-open/comments:rotate-90"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <MessageSquare className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          Comments
          {commentTotal > 0 ? (
            <span className="text-[var(--color-graphite-400)] tabular-nums">
              ({commentTotal})
            </span>
          ) : null}
        </CollapsibleTrigger>
        {/* The homes switcher rides the row, not the thread: it is how you
            move the conversation, and it should be reachable whether the
            section is open or shut. */}
        <span className="shrink-0">
          <ConversationViewMenu
            view={conversationView}
            onChange={changeConversationView}
          />
        </span>
      </div>
      <CollapsibleContent>
        <div className="pt-1 pl-2">
          <CommentsThread
            comments={folderComments}
            onChange={setFolderComments}
            placeholder={`Message everyone in ${displayName}`}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )

    /* The insertion lines carry the separation between blocks now, so the
       stack's own gap is small — two 24px gaps in a row read as a hole. */
  const listBody = (
    <div className="space-y-2">
      <section aria-label="Open tasks">
        {unsectioned.length > 0 ? (
          <div role="list" className="space-y-0.5">
            <TaskList tasks={unsectioned} renderRow={renderTask} />
          </div>
        ) : items.length === 0 ? (
          <p className="h-[var(--control-height)] px-2 text-sm leading-[var(--control-height)] text-[var(--color-graphite-500)]">
            {filterCount > 0 ? "Nothing matches these filters." : "No open tasks."}
          </p>
        ) : null}
        <QuickAdd
          folderName={displayName}
          label="Add task"
          onAdd={(title) => onAdd(quickAddSection, title)}
          onOpenFullForm={() => onOpenFullForm(quickAddSection)}
        />
      </section>

      <InsertLine
        onSection={() => insertItem(0, "section")}
        onParagraph={() => insertItem(0, "paragraph")}
      />

      {items.map((item, index) => {
        const dragState = pageDrag.itemState(index)
        const wrapperStyle = {
          transform:
            dragState.offset === 0
              ? undefined
              : `translate3d(0, ${dragState.offset}px, 0)`,
          transition:
            dragState.isActive && !dragState.isSettling
              ? "box-shadow var(--duration-fast) var(--ease-standard)"
              : "transform var(--duration-base) var(--ease-enter), box-shadow var(--duration-fast) var(--ease-standard)",
          zIndex: dragState.isActive ? 30 : undefined,
        }
        const wrapperClass = cn(
          "group/item relative rounded-md",
          dragState.isActive &&
            "cursor-grabbing bg-card shadow-[var(--elevation-1)] ring-1 ring-[var(--color-graphite-200)]",
        )
        const grip = (
          <button
            type="button"
            aria-label={
              item.kind === "section"
                ? `Reorder section ${item.section.name}`
                : "Reorder paragraph"
            }
            {...pageDrag.handleProps(index)}
            className={cn(
              "absolute top-1 -left-7 z-10 flex size-6 cursor-grab items-center justify-center rounded-md text-[var(--color-graphite-400)] opacity-0 transition-opacity group-hover/item:opacity-100 focus-visible:opacity-100 active:cursor-grabbing hover:bg-[var(--color-graphite-100)]",
              T_FAST,
              FOCUS,
              dragState.isActive && "cursor-grabbing opacity-100",
            )}
          >
            <GripVertical className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
          </button>
        )
        const insertAfter = (
          <InsertLine
            key={`ins-${index}`}
            onSection={() => insertItem(index + 1, "section")}
            onParagraph={() => insertItem(index + 1, "paragraph")}
          />
        )

        if (item.kind === "paragraph") {
          const { paragraph } = item
          return (
            <div
              key={paragraph.id}
              ref={pageDrag.setItemRef(index)}
              style={wrapperStyle}
              className={wrapperClass}
            >
              {grip}
              <textarea
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
              {insertAfter}
            </div>
          )
        }

        const { section } = item
        const sectionTasks = tasksOf(section.id)
        const open = !collapsedSections.has(section.id)
        return (
          <div
            key={section.id}
            ref={pageDrag.setItemRef(index)}
            style={wrapperStyle}
            className={wrapperClass}
          >
            {grip}
            <Collapsible
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
                  key={renamingSection === section.id ? "menu-edit" : "resting"}
                  value={section.name}
                  ariaLabel={`Section name: ${section.name}`}
                  className="text-base leading-6 font-semibold text-foreground"
                  autoEdit={
                    section.name === "New section" ||
                    renamingSection === section.id
                  }
                  onDoneEditing={() => setRenamingSection(null)}
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
                {/* A menu, not a bare X: X means dismiss, and this deletes.
                    The destructive item sits last, behind a divider, named
                    with the consequence — the product's own menu grammar. */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        aria-label={`Section actions: ${section.name}`}
                        className={cn(
                          "ml-auto flex size-6 items-center justify-center rounded-md text-[var(--color-graphite-400)] opacity-0 transition-opacity group-hover/section:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-700)]",
                          T_FAST,
                          FOCUS,
                        )}
                      >
                        <MoreHorizontal className="size-4 data-[size=sm]:size-4" strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    }
                  />
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => setRenamingSection(section.id)}>
                      <Pencil className="size-4" />Rename section
                    </DropdownMenuItem>
                    {/* Moving a section is a drag on the grip, arrow keys
                        once the grip has focus, and these — the discoverable
                        route Imran asked for, since a grip that appears on
                        hover is a grip somebody has to find first. */}
                    <DropdownMenuItem
                      disabled={index === 0}
                      onClick={() => moveItem(index, index - 1)}
                    >
                      <ArrowUp className="size-4" />Move up
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={index === items.length - 1}
                      onClick={() => moveItem(index, index + 1)}
                    >
                      <ArrowDown className="size-4" />Move down
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => removeSection(section.id)}
                    >
                      <Trash2 className="size-4" />Delete — tasks stay
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <CollapsibleContent>
                {/* Between the heading and the first row — the one gap the
                    page-level lines could never reach. */}
                <InsertLine
                  onParagraph={() =>
                    setItems((current) =>
                      current.map((candidate) =>
                        candidate.kind === "section" &&
                        candidate.section.id === section.id
                          ? { kind: "section", section: { ...section, intro: "" } }
                          : candidate,
                      ),
                    )
                  }
                />
                {section.intro !== undefined ? (
                  <textarea
                    defaultValue={section.intro}
                    placeholder="Write something…"
                    aria-label={`Paragraph in ${section.name}`}
                    rows={1}
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus={section.intro === ""}
                    onBlur={(event) => {
                      const text = event.target.value.trim()
                      setItems((current) =>
                        current.map((candidate) =>
                          candidate.kind === "section" &&
                          candidate.section.id === section.id
                            ? {
                                kind: "section",
                                section: {
                                  ...section,
                                  intro: text || undefined,
                                },
                              }
                            : candidate,
                        ),
                      )
                    }}
                    className={cn(
                      "-mx-1 mb-1 block w-[calc(100%+0.5rem)] resize-none rounded-md bg-transparent px-1 py-1 text-[14px] leading-6 text-[var(--color-graphite-700)] outline-none transition-colors [field-sizing:content]",
                      T_FAST,
                      "placeholder:text-[var(--color-graphite-400)] hover:bg-[var(--color-graphite-50)] focus:bg-card focus:ring-1 focus:ring-[var(--color-dana-accent-600)]",
                    )}
                  />
                ) : null}
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
            {insertAfter}
          </div>
        )
      })}

      {/* No trailing ghost buttons: the insertion line at the foot already
          offers both, and two controls for one act is exactly the
          redundancy Imran called out. The line is the whole grammar. */}

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

  /* Two columns per row (Imran: the one-row board was short), tall enough to
     feel like a place, sections movable by their grip. */
  const boardColumns: { id: string; name: string; tasks: FolderTask[]; movable: boolean }[] = [
    { id: "__none", name: "No section", tasks: unsectioned, movable: false },
    ...items
      .filter(
        (item): item is Extract<PageItem, { kind: "section" }> =>
          item.kind === "section",
      )
      .map((item) => ({
        id: item.section.id,
        name: item.section.name,
        tasks: tasksOf(item.section.id),
        movable: true,
      })),
    { id: "__done", name: "Done", tasks: completed, movable: false },
  ]

  const boardBody = (
    <div className="grid grid-cols-2 items-start gap-3 pb-4">
      {boardColumns.map((column) => (
        <div
          key={column.id}
          ref={(el) => {
            if (el && column.movable) columnRefs.current.set(column.id, el)
            else columnRefs.current.delete(column.id)
          }}
          className={cn(
            "flex min-h-[280px] flex-col rounded-lg bg-[var(--color-graphite-50)] p-2 transition-shadow",
            T_BASE,
            colDrag === column.id &&
              "z-10 shadow-[var(--elevation-2)] ring-1 ring-[var(--color-graphite-300)]",
          )}
        >
          <div className="group/col flex h-7 items-center gap-1.5 px-1">
            {column.movable ? (
              <button
                type="button"
                aria-label={`Move section ${column.name}`}
                {...columnDragProps(column.id)}
                className={cn(
                  "-ml-1 flex size-5 cursor-grab items-center justify-center rounded text-[var(--color-graphite-400)] opacity-0 transition-opacity group-hover/col:opacity-100 focus-visible:opacity-100 active:cursor-grabbing",
                  T_FAST,
                  FOCUS,
                  colDrag === column.id && "cursor-grabbing opacity-100",
                )}
              >
                <GripVertical className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
              </button>
            ) : null}
            <span
              className={cn(
                "text-[12px] leading-4 font-medium",
                column.id === "__none"
                  ? "text-[var(--color-graphite-400)]"
                  : "text-[var(--color-graphite-600)]",
              )}
            >
              {column.name}
            </span>
            <span className="text-[12px] leading-4 text-[var(--color-graphite-400)] tabular-nums">
              {column.tasks.length}
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            {column.tasks.map((task) => {
              const done = column.id === "__done" || task.status === "completed"
              const threadCount = commentCount(task.comments)
              return (
                /* A card is the row's kin, not a stranger (review S5): it can
                   be completed and starred where it stands, and it carries
                   the row's own marks — steps, comments, due, face. */
                <div
                  key={task.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenSurface({ id: task.id, mode: taskSurfacePreference() })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      setOpenSurface({ id: task.id, mode: taskSurfacePreference() })
                    }
                  }}
                  className={cn(
                    "group/card cursor-pointer rounded-md border border-[var(--color-graphite-200)] bg-card px-2.5 py-2 transition-shadow hover:shadow-[var(--elevation-1)]",
                    T_FAST,
                    FOCUS,
                  )}
                >
                  <span className="flex items-start gap-2">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={done}
                      aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (done) onToggleComplete(task.id, false)
                        else if (task.status === "abandoned") onRestore(task.id)
                        else completeWithTransition(task)
                      }}
                      className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded", FOCUS)}
                    >
                      <span
                        className={cn(
                          "flex size-4 items-center justify-center rounded-[3px] border transition-[background-color,border-color]",
                          T_FAST,
                          done
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
                              strokeDashoffset: done ? 0 : 20,
                              transition:
                                "stroke-dashoffset var(--duration-base) var(--ease-enter)",
                            }}
                          />
                        </svg>
                      </span>
                    </button>
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-[14px] leading-5 text-[var(--color-graphite-800)]",
                        done &&
                          "text-[var(--color-graphite-500)] line-through decoration-[var(--color-graphite-400)]",
                        task.status === "abandoned" &&
                          "text-[var(--color-graphite-500)] line-through decoration-[var(--color-graphite-400)]",
                      )}
                    >
                      {task.title}
                    </span>
                    <button
                      type="button"
                      aria-label={task.important ? "Remove from Important" : "Mark as Important"}
                      aria-pressed={task.important || undefined}
                      onClick={(event) => {
                        event.stopPropagation()
                        onToggleImportant(task.id)
                      }}
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded transition-opacity",
                        T_FAST,
                        FOCUS,
                        task.important
                          ? "text-[var(--color-warning-500)] opacity-100"
                          : "text-[var(--color-graphite-400)] opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 hover:text-[var(--color-graphite-600)]",
                      )}
                    >
                      <Star
                        className={cn("size-4 data-[size=sm]:size-4", task.important && "fill-current")}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    </button>
                  </span>
                  {(task.due || task.steps || threadCount > 0 || task.assignee) && !done ? (
                    <span className="mt-1.5 flex items-center gap-2.5 pl-7">
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
                      {task.steps ? (
                        <span className="inline-flex items-center gap-1 text-[12px] leading-4 text-[var(--color-graphite-500)] tabular-nums">
                          <ListChecks className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
                          {task.steps.complete}/{task.steps.total}
                        </span>
                      ) : null}
                      {threadCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[12px] leading-4 text-[var(--color-graphite-500)] tabular-nums">
                          <MessageSquare className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
                          {threadCount}
                        </span>
                      ) : null}
                      {task.assignee ? (
                        <Face person={task.assignee} className="ml-auto" />
                      ) : null}
                    </span>
                  ) : null}
                </div>
              )
            })}
            {column.id !== "__done" ? (
              <div className="mt-auto pt-1">
                <BoardQuickAdd
                  onAdd={(title) => {
                    if (column.id !== "__none") {
                      pendingAssign.current = { title, sectionId: column.id }
                    }
                    onAdd("unscheduled", title)
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => insertItem(items.length, "section")}
        className={cn(
          "flex h-10 items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--color-graphite-300)] text-[12px] leading-4 text-[var(--color-graphite-400)] transition-colors hover:border-[var(--color-graphite-400)] hover:text-[var(--color-graphite-600)]",
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
      <PageCover storageName={storageName} />

      <div className="mx-auto w-full max-w-[var(--shell-content-max)] px-10 pb-8">
        {/* The strip: thin, steady, under the cover — the folder's controls
            in one place, docking against the top with the folder's name when
            scrolled (Imran's ruling on the 40px cluster: this is chrome, and
            chrome is thin). */}
        {strip}

        <header className={cn("group/head", cover ? "pt-0" : "pt-2")}>
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
                      ? "relative z-40 -mt-7 size-11 rounded-lg border border-[var(--color-graphite-200)] bg-card shadow-[var(--elevation-1)]"
                      : "-ml-1.5 size-10 rounded-lg hover:bg-[var(--color-graphite-50)]",
                  )}
                >
                  <Glyph
                    className={cover ? "size-6" : "size-8"}
                    style={{ color }}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </button>
              }
            />
            <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] p-0">
              <FolderIconPicker
                glyph={identity.glyph}
                color={color}
                onPick={(next) => savePrototypeFolderIdentity(storageName, next)}
              />
            </PopoverContent>
          </Popover>
          <div className="mt-1">
            <AddCoverAction storageName={storageName} visible={pristine} />
          </div>

          {/* The count rides the title's own line rather than stacking a
              third block under it: the header was doing too much, and a
              progress figure is a footnote to the name, not a paragraph of
              its own (Imran, 2026-08-18). */}
          <div className="mt-1.5 flex items-baseline gap-3">
            <InlineName
              key={titleEditing ? "menu-edit" : "resting"}
              value={displayName}
              ariaLabel={`Folder name: ${displayName}`}
              className="min-w-0 text-2xl leading-8 font-semibold text-foreground"
              autoEdit={titleEditing}
              onDoneEditing={() => setTitleEditing(false)}
              onCommit={(name) => {
                setDisplayName(name)
                onRenameFolder?.(name)
              }}
            />
            {completionTotal > 0 ? (
              <span className="shrink-0 text-xs leading-4 text-muted-foreground tabular-nums">
                {completedCount} of {completionTotal} done
              </span>
            ) : null}
          </div>

          {/* The description lives at the title — the fact and its affordance
              in the same place (Imran's correction of the far-corner ghost). */}
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
                "-mx-1 mt-1 block w-[calc(100%+0.5rem)] max-w-xl resize-none rounded-md bg-transparent px-1 py-0.5 text-[14px] leading-6 text-[var(--color-graphite-600)] outline-none transition-colors [field-sizing:content]",
                T_FAST,
                "placeholder:text-[var(--color-graphite-400)] hover:bg-[var(--color-graphite-50)] focus:bg-card focus:ring-1 focus:ring-[var(--color-dana-accent-600)]",
              )}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingDescription(true)}
              className={cn(
                "-mx-1 mt-1 flex h-6 items-center gap-1.5 rounded-md px-1 text-[13px] leading-5 text-[var(--color-graphite-400)] transition-[opacity,background-color,color]",
                T_FAST,
                FOCUS,
                "hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-600)]",
                pristine
                  ? "opacity-100"
                  : "opacity-0 group-hover/head:opacity-100 focus-visible:opacity-100",
              )}
            >
              <AlignLeft className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
              Add a description
            </button>
          )}

        </header>

        <div className="mt-3">
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
                <GhostAction label="Add section" onClick={() => insertItem(items.length, "section")} />
                <GhostAction label="Add a paragraph" onClick={() => insertItem(items.length, "paragraph")} />
              </div>
            </div>
          ) : view === "list" ? (
            listBody
          ) : (
            boardBody
          )}
        </div>

        {conversationView === "page" &&
        previewState !== "loading" &&
        previewState !== "error"
          ? conversationHeader
          : null}
      </div>

      {/* The conversation's other three homes. One thread component in all of
          them (DES-123's rule), the view switched from the surface itself. */}

      {conversationView === "panel" && conversationOpen ? (
        <aside
          aria-label={`Conversation in ${displayName}`}
          className="fixed top-[calc(var(--shell-pagebar-height)+var(--shell-windowbar-height))] right-0 bottom-0 z-40 flex w-[360px] flex-col border-l border-[var(--color-graphite-200)] bg-card shadow-[var(--elevation-2)] duration-[var(--duration-slow)] ease-[var(--ease-enter)] animate-in slide-in-from-right"
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-graphite-100)] px-4">
            <MessageSquare className="size-4 text-[var(--color-graphite-500)]" strokeWidth={1.75} aria-hidden="true" />
            <span className="min-w-0 truncate text-sm font-medium text-[var(--color-graphite-800)]">
              {displayName}
            </span>
            {commentTotal > 0 ? (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-graphite-200)] px-1 text-[0.625rem] leading-none font-medium text-[var(--color-graphite-600)] tabular-nums">
                {commentTotal}
              </span>
            ) : null}
            <span className="ml-auto flex items-center gap-0.5">
              <ConversationViewMenu view={conversationView} onChange={changeConversationView} />
              <button
                type="button"
                aria-label="Close conversation"
                onClick={() => {
                  setConversationOpen(false)
                  conversationRef.current?.focus()
                }}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md text-[var(--color-graphite-500)] transition-colors hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)]",
                  T_FAST,
                  FOCUS,
                )}
              >
                <X className="size-4 data-[size=sm]:size-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </span>
          </div>
          <CommentsThread
            comments={folderComments}
            onChange={setFolderComments}
            placeholder={`Message everyone in ${displayName}`}
            emptyWord="message"
            layout="pinned"
          />
        </aside>
      ) : null}


      {/* The task surface — full screen, sidebar on either edge, floating,
          or handed to the tab strip. */}
      {openSurface && surfaceTask ? (
        <TaskSurface
          task={surfaceTask}
          mode={openSurface.mode}
          onModeChange={(mode) => setOpenSurface({ ...openSurface, mode })}
          onOpenInTab={
            onOpenInTab
              ? () => {
                  onOpenInTab(openSurface.id)
                  setOpenSurface(null)
                }
              : undefined
          }
          onClose={() => setOpenSurface(null)}
        />
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
