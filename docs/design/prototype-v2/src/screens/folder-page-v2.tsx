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

import { InlineInput, InlineTextarea } from "@/components/ui/inline-field"
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useMemo,
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
  Filter,
  MessageSquare,
  MoreHorizontal,
  PanelRight,
  Palette,
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
import {
  BoardAddColumn,
  BoardQuickAdd,
  TaskBoard,
  type BoardColumn,
} from "@/components/task-board"
import { ViewStrip } from "@/components/view-strip"
import { WindowActivity, WindowBarActions } from "@/components/window-bar"
import { useAllHistory } from "@/lib/history"
import { PageDescription, PageMark, pageBodyClass } from "@/components/page-head"
import { ObjectMenu } from "@/components/object-menu"
import { ReservesRightEdge } from "@/components/right-edge"
import { readFolderLayout, saveFolderLayout } from "@/lib/folder-layout"
import { CompletedSection, TaskSection } from "@/components/task-section"
import { GroupedList } from "@/screens/grouped-screen"
import { AddCoverAction, PageCover } from "@/components/page-cover"
import {
  DEFAULT_FILTERS,
  FilterControl,
  UNASSIGNED,
  activeFilterCount,
  applyView,
  groupTasks,
  stripButtonClass,
  type TaskFilters,
} from "@/components/task-filters"
import { readPageFilters, writePageFilters } from "@/lib/page-filters"
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
import { Face } from "@/components/person-face"
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
  /*
  A mark of its own, from the same 42-glyph table a folder picks from.

  Imran's ask, and the constraint that came with it: "if a user want they can
  add an icon to a section too, but it should be in a way that if a section
  does not carry an icon, the section should not feel like it's lacking
  something." Optional, and genuinely optional — `TaskSection` puts the glyph
  inline before the name rather than in a reserved slot, so a section without
  one starts its name earlier and nothing is left waiting to be filled.
  */
  glyph?: string
  color?: string
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

/* The page's seed moved into `lib/folder-layout` when duplicate became a
   second reader of it: a fixture that only one screen can see is one the rest
   of the product cannot copy (Imran, 2026-08-23). */

const FOLDER_THREADS: Record<string, ConceptComment[]> = {
  Travel: [
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
  "Office": [
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
      <InlineInput
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
      /* The caller's className last, so it can win — it could not before,
         and that is why a section heading inside `TaskSection`'s own
         truncating h2 collapsed to about a hundred pixels: two boxes both
         clipping, and the inner one's `max-w-full` resolving against a
         parent that was itself sized by its content. */
      className={cn(
        "-mx-1 max-w-full cursor-text truncate rounded-[4px] px-1 text-left transition-colors",
        T_FAST,
        FOCUS,
        "hover:bg-[var(--color-graphite-100)]",
        className,
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
  dense = false,
}: {
  /* Omitted inside a section: a section within a section is not a thing
     Dana has, and a menu item that cannot mean anything is worse than a
     shorter menu. */
  onSection?: () => void
  onParagraph: () => void
  /* Between a heading and its first row the line has to be nearly free:
     24px of permanent gap there made the section and its tasks read as
     two separate things whenever nobody had written a paragraph
     (Imran, 2026-08-18). Dense keeps the affordance and gives the space
     back — 12px, of which 4 are the heading's own margin. */
  dense?: boolean
}) {
  return (
    /* A real strip in the flow, not a negatively-margined overlay. It was
       `-my-3` before, which pulled it up under the section's own quick-add
       row and stole the hover — which is why a paragraph could not be
       inserted straight after a section until a task existed there. */
    <div
      className={cn(
        "group/ins relative flex items-center",
        dense ? "-mb-1 h-3" : "h-6",
      )}
    >
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
  /* The object contract's acts that need the shell: a tab strip, the
     clipboard, and somewhere to put a copy. Named for the *folder* because
     this page already had an `onOpenInTab` for a task, and two objects
     sharing one prop name is how one of them ends up opening the other. */
  onOpenFolderInTab?: () => void
  onCopyLink?: () => void
  onDuplicate?: () => void
  onMoveToLabel?: (label: string | null, color: string) => void
  onOpenInTab?: (taskId: string) => void
}

export function FolderPageV2({
  storageName,
  folderName = "Travel",
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
  onOpenFolderInTab,
  onCopyLink,
  onDuplicate,
  onMoveToLabel,
  onOpenInTab,
}: FolderPageV2Props) {
  /*
  What has happened in this folder — to the folder, and to the work in it.

  Imran, 2026-08-23: "In every control row under the tabs there's 'edited just
  now' button kinda thing, i think that is also a candidate place for the
  history of a folder page."

  It shows both, and that is a decision rather than a convenience. A folder's
  *own* acts are rare — you name it once and move it once — so a control that
  showed only those would say "Created, 4 August" for months and be worth
  opening about twice. What a person means by "what has been happening here" is
  the work: who finished what, who moved what, what got added. The folder's
  own line sits in the same list because it is the same question at a wider
  focus.
  */
  const allEvents = useAllHistory()
  const folderActivity = useMemo(() => {
    const mine = new Set(
      [...scheduled, ...unscheduled, ...completed].map((task) => task.id),
    )
    return allEvents.filter(
      (event) =>
        (event.kind === "folder" && event.subject === storageName) ||
        (event.kind === "task" && mine.has(event.subject)),
    )
  }, [allEvents, scheduled, unscheduled, completed, storageName])

  const identity = useFolderIdentity(storageName)
  const Glyph = folderGlyph(identity.glyph, storageName)
  const color = identity.color ?? folderColor
  const coverPos = identity.coverPos ?? 50
  const cover = resolveCover(identity.cover, storageName, coverPos)

  const [displayName, setDisplayName] = useState(folderName)
  const [personalLabel, setPersonalLabel] = useState(folderLabel)
  const [shareOpen, setShareOpen] = useState(initialShareOpen)
  /* The view is the person's while they are here, and the URL's while they are
     arriving: `?folder-view=board` opens on the board, so a review of it is a
     link rather than a link plus an instruction. Same instrument as
     `?folder-page=v1` and `?measure=wide`, and it leaves with them. */
  const [view, setView] = useState<FolderView>(() =>
    new URLSearchParams(window.location.search).get("folder-view") === "board"
      ? "board"
      : "list",
  )
  /* The same rule as every other place: kept while you are here, never
     carried anywhere else. See `lib/page-filters`. */
  const [filters, setFilters] = useState<TaskFilters>(() =>
    readPageFilters(`folder:${storageName}`, DEFAULT_FILTERS),
  )
  useEffect(() => {
    writePageFilters(`folder:${storageName}`, filters)
  }, [storageName, filters])
  const [deleteFolderOpen, setDeleteFolderOpen] = useState(false)
  const [markOpen, setMarkOpen] = useState(false)
  const [pendingTaskAction, setPendingTaskAction] = useState<{
    type: "abandon" | "delete"
    taskId: string
  } | null>(null)

  /*
  Sections and paragraphs (DES-132), and they survive leaving the page.

  Imran, 2026-08-22: "When you create a section and then you leave the page,
  in returning to page the section is gone." They did, because this was
  component state seeded from a fixture — and the shell navigates by a full
  page load, so every section a person made died at the first click on the
  sidebar.

  That was defensible while sections were a drawing. It stopped being
  defensible the moment they became something you *arrange*: the folder's
  glyph, colour, cover and description have persisted in the presentation
  store since DES-130, and a section is the same kind of thing — a person's
  own arrangement of their own folder, not a task. Keeping one in that store
  and the other in memory is a distinction only the implementation can feel.

  Per folder, beside the identities, and Lane 2 travels with it exactly as it
  does for the cover: there is no column for a section either.
  */
  const [items, setItems] = useState<PageItem[]>(
    () => readFolderLayout<PageItem>(storageName)?.items ?? [],
  )
  const [assign, setAssign] = useState<Record<string, string>>(
    () => readFolderLayout<PageItem>(storageName)?.assign ?? {},
  )
  useEffect(() => {
    saveFolderLayout(storageName, { items, assign })
  }, [storageName, items, assign])
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
  const openTasks = applyView(allOpen, filters)
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

  /*
  Dragging a task between sections.

  Imran, 2026-08-22: "A task can't be dragged into a section, and it can be
  dragged out either." It could not, and the reason was structural: this page
  renders one sortable list per section, and a list can only sort what it
  holds — the two lists cannot see each other, so a row carried from one to
  another had nowhere to land and sprang back.

  The engine gained one seam for it (`onDropAt`): on release it asks the page
  where the pointer was, before doing anything about its own order. The page
  is the only thing that knows what else is on it.

  Each section body registers its rectangle here as it mounts. `null` is the
  page's unsectioned area at the top, so dragging *out* of a section is the
  same gesture as dragging into one — which it should be, because to a person
  they are one act performed in two directions.
  */
  /* The key for the page body itself, distinct from a section id and from
     `null`, which means "no section".

     On the list `null` is only ever an *answer* — the page body is the zone
     and "not inside any section" is what it means. On the board it is also a
     *place*: the No section column is a column like any other, and a person
     dragging a card out of a section aims at it rather than at the space
     around things. Same answer, reached two ways, which is why the resolver
     below stopped skipping it. */
  const PAGE_BODY = "__page"
  /* The board's Done column. Not a section — dropping a card here completes
     the task, and dragging one out reopens it, which is what every board a
     person has used already does. */
  const DONE_COLUMN = "__done"
  const dropZones = useRef(new Map<string | null, HTMLElement>())
  const registerZone = (id: string | null) => (node: HTMLElement | null) => {
    if (node) dropZones.current.set(id, node)
    else dropZones.current.delete(id)
  }
  /*
  Sections are asked first, and "none of them" is the answer for out.

  The first attempt grew a dashed strip at the top of the page while a task
  was in the air, to give "out of every section" something to aim at. It read
  well and was wrong twice: inserting a row mid-drag pushes the rest of the
  page down **after** the engine has measured where every row sits, so the
  drop lands on the wrong slot; and a target that only exists while you are
  already dragging is a target nobody can discover.

  There is no need for either. A folder page is sections and the space around
  them, so *not inside any section* already means unsectioned — the page body
  is the fallback, it is always there, and nothing moves.
  */
  function dropTaskAt(taskId: string, point: { x: number; y: number }) {
    const within = (node: HTMLElement) => {
      const box = node.getBoundingClientRect()
      return (
        point.x >= box.left &&
        point.x <= box.right &&
        point.y >= box.top &&
        point.y <= box.bottom
      )
    }
    const body = dropZones.current.get(PAGE_BODY)
    let landing: string | null | undefined
    for (const [id, node] of dropZones.current) {
      if (id === PAGE_BODY) continue
      if (within(node)) {
        landing = id
        break
      }
    }
    if (landing === undefined) {
      if (!body || !within(body)) return false
      landing = null
    }

    /*
    The board's Done column is a status rather than a place.

    A board where one column is Done and cannot be dropped into is a board
    that has drawn a control and refused it — which is the "cards do not move
    between them" complaint at its sharpest, because Done is the column
    everybody aims at first. So the two columns that are not sections do what
    they look like they do: dropping on Done completes, and carrying a card
    back out reopens it and files it wherever it landed.
    */
    const wasDone = completed.some((task) => task.id === taskId)
    if (landing === DONE_COLUMN) {
      if (wasDone) return false
      const task = openTasks.find((candidate) => candidate.id === taskId)
      if (task) completeWithTransition(task)
      return true
    }
    if (wasDone) {
      onToggleComplete(taskId, false)
      setAssign((previous) => {
        const next = { ...previous }
        if (landing === null) delete next[taskId]
        else next[taskId] = landing as string
        return next
      })
      return true
    }

    const current = assign[taskId] ?? null
    if (current === landing) return false
    setAssign((previous) => {
      const next = { ...previous }
      if (landing === null) delete next[taskId]
      else next[taskId] = landing
      return next
    })
    return true
  }



  const pendingCount = allOpen.filter(
    (task) => task.status !== "abandoned" && !completingIds.has(task.id),
  ).length
  const completedCount = completed.length + completingIds.size
  const completionTotal = pendingCount + completedCount
  const openCount = allOpen.filter((task) => task.status !== "abandoned").length
  const abandonedCount = allOpen.filter(
    (task) => task.status === "abandoned",
  ).length
  /*
  Empty means *nothing on the page*, not "no tasks" — Imran, 2026-08-22: on a
  folder with no tasks "sections can't be created, in fact they're created but
  appearing after the page having at least a single task."

  Exactly that. The empty state offers "Add section", the press worked, the
  section went into `items` — and the page went on rendering the empty state,
  because emptiness was measured in tasks alone. So a person pressed a button,
  something did happen, and the screen said nothing had. The most discouraging
  possible answer to a first action on a new page.

  A page with a section on it is a page with something on it, whether or not
  anything is in that section yet — which is the whole point of making one
  first and filling it afterwards.
  */
  /* See the block itself for the reasoning; this is the rule in one place so
     the markup can stay readable. */
  const hasSections = items.some((item) => item.kind === "section")
  const everySectionShut =
    hasSections &&
    items
      .filter((item): item is Extract<PageItem, { kind: "section" }> => item.kind === "section")
      .every((item) => collapsedSections.has(item.section.id))
  const showLooseBlock =
    unsectioned.length > 0 || !hasSections || everySectionShut

  const isEmpty =
    scheduled.length === 0 &&
    unscheduled.length === 0 &&
    completed.length === 0 &&
    items.length === 0
  /* A capture row inside a filtered page adds the task the filter would keep:
     filtering to dated work and then adding an undated task makes a row that
     vanishes as it is typed. The date axis grew shapes at F5, and every one
     of them that requires a date says "scheduled". */
  const quickAddSection =
    filters.due.kind === "with" || filters.due.kind === "range"
      ? "scheduled"
      : "unscheduled"
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

  /*
  The section a row should name, given where the row is being drawn.

  A row under "Venue & vendors" does not need a chip saying Venue & vendors —
  the heading two lines up says it. A row anywhere else does: in Completed, on
  the board, in a dialog. So the answer depends on the list, not on the task,
  and it is decided once per list here rather than per row at six call sites.
  */
  const sectionNameOf = (taskId: string) =>
    items.find(
      (item): item is Extract<PageItem, { kind: "section" }> =>
        item.kind === "section" && item.section.id === assign[taskId],
    )?.section.name

  function renderTaskIn(within: string | null) {
    return (task: FolderTask, wiring?: TaskListWiring) =>
      renderTask(task, wiring, within)
  }

  function renderTask(
    task: FolderTask,
    wiring?: TaskListWiring,
    within: string | null = null,
  ) {
    return (
      <TaskRow
        key={task.id}
        {...task}
        {...wiring}
        /* Every row on this page is in this folder, so the folder chip would
           repeat the title above it. The section beside it is the part the
           page does *not* say, which is why one is suppressed and the other
           is not (DES-166, and TaskRowProps.given). */
        given={{ folder: true }}
        section={
          assign[task.id] && assign[task.id] !== within
            ? sectionNameOf(task.id)
            : undefined
        }
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

  /* One write path into a section, so renaming it, dressing it and clearing
     its glyph are three callers rather than three copies of the same map. */
  function patchSection(sectionId: string, fields: Partial<SectionModel>) {
    setItems((current) =>
      current.map((candidate) =>
        candidate.kind === "section" && candidate.section.id === sectionId
          ? { kind: "section", section: { ...candidate.section, ...fields } }
          : candidate,
      ),
    )
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
          hover or focus (Imran, 2026-08-18). This page had its own copy of
          that switcher, written before `ViewStrip` existed and identical to
          it line for line; F3 gave Planned a second switcher, which is the
          moment a copy becomes a fork. One component, three surfaces. */}
      <ViewStrip
        ariaLabel="Folder view"
        value={view}
        options={[
          { key: "list", label: "List view", icon: List },
          { key: "board", label: "Board view", icon: LayoutGrid },
          /* No calendar here, and not because it is unbuilt: a folder holds
             undated tasks by definition, and a calendar has no cell for one,
             so it would hide part of the page it claims to be showing
             (DES-177). It stood here disabled with "not available yet", which
             promised a thing that is never coming. */
        ]}
        onSelect={(next) => setView(next as FolderView)}
        collapse
      />

      <div className="pointer-events-auto flex items-center gap-0.5">
        <FilterControl filters={filters} setFilters={setFilters} />
        {isDefault ? null : (
        <StripButton
          icon={MessageSquare}
          label={conversationView === "page" ? "Go to comments" : "Conversation"}
          active={conversationOpen && conversationView !== "page"}
          badge={commentTotal || undefined}
          onClick={openConversation}
          buttonRef={conversationRef}
        />
        )}
      </div>

      <div className="pointer-events-auto flex items-center gap-1.5">
        <WindowActivity events={folderActivity} />
        {isShared && !isDefault ? (
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
        {/*
        The same menu the sidebar row draws — `lib/object-acts` says what a
        folder can have done to it, and this surface says which of those it can
        do. Written by hand here until F7, which is how this menu came to omit
        Label and colour while the sidebar's offered it.
        */}
        <ObjectMenu
          kind="folder"
          name={displayName}
          width="w-52"
          trigger={
            <button
              type="button"
              aria-label={`More actions for ${displayName}`}
              className={stripButtonClass(false)}
            >
              <MoreHorizontal className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          }
          handlers={{
            "open-tab": onOpenFolderInTab,
            rename: isOwner ? () => setTitleEditing(true) : undefined,
            move: isDefault
              ? undefined
              : {
                  choose: (
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
                        No shelf
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  ),
                },
            "copy-link": onCopyLink,
            duplicate: isDefault ? undefined : onDuplicate,
            delete: !isDefault && isOwner ? () => setDeleteFolderOpen(true) : undefined,
          }}
        />
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
  /*
  What the list becomes when the filter is asked to group by something other
  than this folder's own sections — the same `GroupedList` a place-page shows,
  for the same reason: "grouped by folder" has to look the same wherever you
  asked for it. The folder's own sections and paragraphs are not edited or
  lost; they simply are not the arrangement while another one is chosen, and
  returning Group by to Nothing gives them back untouched.
  */
  const groupedBody = (
    <GroupedList
      filters={filters}
      tasks={openTasks}
      idPrefix={`folder-${storageName}`}
      onOpenTask={onOpenTask}
      onToggleComplete={onToggleComplete}
      onToggleImportant={onToggleImportant}
    />
  )

  const listBody = (
    <div className="space-y-2">
      {/*
      **A section can be the first thing on the page.**

      Imran asked whether it was good or bad that it could not be: "a section
      can't be started at the beginning of a folder." It was bad, and the
      cause was that this block held the top by right rather than by having
      anything in it — so a folder organised entirely into sections still
      opened with an empty capture row, and its first heading could never be
      the first thing you saw. Every comparable product lets the first
      heading be first; the loose tasks appear above it when there are some.

      So the block earns its place, on three counts, and each is a real
      state rather than a taste:

      - it holds tasks that are in no section — then it is the page's most
        urgent content and belongs first;
      - the page has no sections at all — then it *is* the page, and its
        capture row is the folder's one capture point (W5);
      - or every section is shut, which would otherwise leave the page with
        nowhere visible to add a task.

      And **while a task is being carried it appears regardless**, because
      dragging a task *out* of a section needs somewhere to put it, and that
      somewhere only has to exist while something is in the air. A drop target
      that is furniture at rest and a target during a drag is the pattern
      every drag-and-drop surface settled on, for this exact reason.
      */}
      {showLooseBlock ? (
      <section aria-label="Open tasks">
        {unsectioned.length > 0 ? (
          <div role="list" className="space-y-0.5">
            <TaskList
              onTaskOpen={onOpenTask}
              onDropAt={dropTaskAt}
              tasks={unsectioned}
              renderRow={renderTask}
            />
          </div>
        ) : items.length === 0 ? (
          <p className="h-[var(--control-height)] px-2 text-sm leading-[var(--control-height)] text-[var(--color-graphite-500)]">
            {filterCount > 0 ? "Nothing matches these filters." : "No open tasks."}
          </p>
        ) : null}
        {/* The capture row belongs to the block, so it leaves with it —
            each section carries its own, and a page with no visible block
            keeps this one by the third rule above. */}
        <QuickAdd
          folderName={displayName}
          label="Add task"
          onAdd={(title) => onAdd(quickAddSection, title)}
          onOpenFullForm={() => onOpenFullForm(quickAddSection)}
        />
      </section>
      ) : null}

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
        /*
        The strip between two paragraphs is the tight one.

        Imran, 2026-08-23: "the gap between two paragraphs in a page is still
        too much." It measured 32px between two lines of 12/20 prose — more
        than one and a half line-heights, which is not a paragraph break, it is
        a section break drawn by accident. The 24px strip is right between
        *blocks*, where it is separating a heading from what came before; it is
        wrong between two sentences that continue one another.

        This is the same correction `dense` was added for at F2, where 24px
        between a heading and its first row made the two read as separate
        things. The rule underneath both: **the gap says how far apart two
        things are, so it has to know what they are.**
        */
        const insertAfter = (
          <InsertLine
            key={`ins-${index}`}
            dense={item.kind === "paragraph" && items[index + 1]?.kind === "paragraph"}
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
              <InlineTextarea
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
                  "-mx-1 block w-[calc(100%+0.5rem)] resize-none rounded-md bg-transparent px-1 py-1 text-[12px] leading-5 text-[var(--color-graphite-600)] outline-none transition-colors [field-sizing:content]",
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
            {/*
            The shared section, at last — F5, 2026-08-22.

            DES-151 said every section is one component and DES-154 said a
            settled behaviour belongs to the mechanism. `TaskSection` was then
            built for the computed sections on the six pages, and the folder
            page — the one place a person actually *makes* sections — went on
            rendering its own copy of the same heading: its own Collapsible,
            its own chevron, its own 32px band and border. Visually matched,
            structurally separate, which is the state a thing is in just
            before the two drift apart.

            It costs the page nothing to give up. The grip stays outside,
            because it belongs to the page's drag rather than to the section;
            the name is an `InlineName` handed in as the heading; the menu
            goes in the `actions` slot the component already reserved for
            exactly this.

            What it *gains* is the thing Imran asked for and could not have
            while there were two of these: **a section somebody made can wear
            a glyph**, because the component that draws computed sections with
            one is now the component drawing these. And it keeps his
            constraint intact — the glyph is inline, so a section without one
            simply starts its name earlier and nothing sits waiting to be
            filled.
            */}
            <TaskSection
              id={`folder-section-${section.id}`}
              open={open}
              onOpenChange={(value: boolean) =>
                setCollapsedSections((current) => {
                  const next = new Set(current)
                  if (value) next.delete(section.id)
                  else next.add(section.id)
                  return next
                })
              }
              icon={section.glyph ? folderGlyph(section.glyph) : undefined}
              iconColor={section.color}
              count={sectionTasks.length}
              name={
                <InlineName
                  key={renamingSection === section.id ? "menu-edit" : "resting"}
                  value={section.name}
                  ariaLabel={`Section name: ${section.name}`}
                  /* `max-w-none` because the h2 around it already clips. */
                  className="max-w-none text-base leading-6 font-semibold text-foreground"
                  autoEdit={
                    section.name === "New section" ||
                    renamingSection === section.id
                  }
                  onDoneEditing={() => setRenamingSection(null)}
                  onCommit={(name) => patchSection(section.id, { name })}
                />
              }
              actions={
                <span className="flex items-center gap-0.5">
                  {/* The same picker a folder's own mark uses, so a section
                      and a folder are dressed from one table (DES-130). */}
                  <Popover>
                    <PopoverTrigger
                      render={
                        <button
                          type="button"
                          aria-label={`Section icon: ${section.name}`}
                          className={cn(
                            "flex size-6 items-center justify-center rounded-md text-[var(--color-graphite-400)] opacity-0 transition-opacity group-hover/section:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-700)]",
                            T_FAST,
                            FOCUS,
                          )}
                        >
                          {/* Palette, because that is already what "dress
                              this thing" looks like in the folder menus —
                              one concept, one glyph. */}
                          <Palette className="size-4 data-[size=sm]:size-4" strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      }
                    />
                    <PopoverContent align="end" className="w-auto max-w-[calc(100vw-2rem)] p-0">
                      <FolderIconPicker
                        glyph={section.glyph}
                        color={section.color ?? "var(--color-graphite-900)"}
                        onPick={(next) => patchSection(section.id, next)}
                      />
                    </PopoverContent>
                  </Popover>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          aria-label={`Section actions: ${section.name}`}
                          className={cn(
                            "flex size-6 items-center justify-center rounded-md text-[var(--color-graphite-400)] opacity-0 transition-opacity group-hover/section:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-700)]",
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
                        <Pencil />Rename section
                      </DropdownMenuItem>
                      {section.glyph ? (
                        <DropdownMenuItem onClick={() => patchSection(section.id, { glyph: undefined })}>
                          <Ban />Remove icon
                        </DropdownMenuItem>
                      ) : null}
                      {/* Moving a section is a drag on the grip, arrow keys
                          once the grip has focus, and these — the
                          discoverable route Imran asked for, since a grip
                          that appears on hover is one somebody has to find
                          first. */}
                      <DropdownMenuItem
                        disabled={index === 0}
                        onClick={() => moveItem(index, index - 1)}
                      >
                        <ArrowUp />Move up
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={index === items.length - 1}
                        onClick={() => moveItem(index, index + 1)}
                      >
                        <ArrowDown />Move down
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => removeSection(section.id)}
                      >
                        <Trash2 />Delete — tasks stay
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              }
            >
              {/* The whole body is the target — its rows, its paragraph and
                  its capture row — because "into this section" is what a
                  person means wherever inside it they let go. */}
              <div ref={registerZone(section.id)}>
                {/* Between the heading and the first row — the one gap the
                    page-level lines could never reach. */}
                <InsertLine
                  dense
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
                  <InlineTextarea
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
                      "-mx-1 mb-1 block w-[calc(100%+0.5rem)] resize-none rounded-md bg-transparent px-1 py-1 text-[12px] leading-5 text-[var(--color-graphite-600)] outline-none transition-colors [field-sizing:content]",
                      T_FAST,
                      "placeholder:text-[var(--color-graphite-400)] hover:bg-[var(--color-graphite-50)] focus:bg-card focus:ring-1 focus:ring-[var(--color-dana-accent-600)]",
                    )}
                  />
                ) : null}
                {sectionTasks.length > 0 ? (
                  <div role="list" className="mt-0.5 space-y-0.5">
                    <TaskList
                      onTaskOpen={onOpenTask}
                      onDropAt={dropTaskAt}
                      tasks={sectionTasks}
                      renderRow={renderTaskIn(section.id)}
                    />
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
              </div>
            </TaskSection>
            {insertAfter}
          </div>
        )
      })}

      {/* No trailing ghost buttons: the insertion line at the foot already
          offers both, and two controls for one act is exactly the
          redundancy Imran called out. The line is the whole grammar. */}

      {/* The same close every other page that lists tasks has. This was a
          second copy of `CompletedSection` — the same chevron, the same
          "Completed (N)", the same collapsed default — written here because
          the folder page had this before the shared one existed and nobody
          went back. It differed in two ways nobody chose: 12px medium
          against 13px semibold, and a highlight while a completion notice
          was showing, which is the row's own job. */}
      <CompletedSection count={completed.length}>
        <TaskList onTaskOpen={onOpenTask} className="mt-0.5" tasks={completed} renderRow={renderTask} />
      </CompletedSection>
    </div>
  )

  /*
  The board's columns.

  Sections when nothing is being grouped by, and the grouping when there is
  one — because a board draws *the page's current grouping* (DES-177), and on
  a folder the sections a person made are that grouping until they ask for
  another. No section and Done are the two columns that are not sections: one
  is a place, one is a status, and both take drops (DES-174).
  */
  const grouped = groupTasks(openTasks, filters)
  const boardColumns: BoardColumn[] = grouped
    ? grouped.map((group) => ({
        key: group.key,
        label: group.label,
        tasks: group.tasks,
        quiet: group.key === "none" || group.key === UNASSIGNED,
      }))
    : [
        { key: "__none", label: "No section", tasks: unsectioned, quiet: true },
        ...items
          .filter(
            (item): item is Extract<PageItem, { kind: "section" }> =>
              item.kind === "section",
          )
          .map((item) => ({
            key: item.section.id,
            label: item.section.name,
            tasks: tasksOf(item.section.id),
          })),
        { key: "__done", label: "Done", tasks: completed, done: true, quiet: true },
      ]

  const boardBody = (
    <TaskBoard
      columns={boardColumns}
      onOpenTask={(taskId) =>
        setOpenSurface({ id: taskId, mode: taskSurfacePreference() })
      }
      onToggleComplete={(taskId, next) => {
        const task = [...openTasks, ...completed].find(
          (candidate) => candidate.id === taskId,
        )
        if (!next) onToggleComplete(taskId, false)
        else if (task?.status === "abandoned") onRestore(taskId)
        else if (task) completeWithTransition(task)
      }}
      onToggleImportant={onToggleImportant}
      /* Every card on this board is in this folder, exactly as every row on the
         list below is (DES-183). */
      given={{ folder: true }}
      /* Geometry is the board's, meaning is the page's — the same division
         `onDropAt` made one level down. Only this page knows that its
         columns are sections and that one of them is a status. */
      onDropIn={(taskId, columnKey) => {
        if (grouped) return false
        const wasDone = completed.some((task) => task.id === taskId)
        if (columnKey === "__done") {
          if (wasDone) return false
          const task = openTasks.find((candidate) => candidate.id === taskId)
          if (task) completeWithTransition(task)
          return true
        }
        if (wasDone) onToggleComplete(taskId, false)
        setAssign((previous) => {
          const next = { ...previous }
          if (columnKey === "__none") delete next[taskId]
          else next[taskId] = columnKey
          return next
        })
        return true
      }}
      columnRef={(column) => (node) => {
        const movable = !grouped && !column.key.startsWith("__")
        if (node && movable) columnRefs.current.set(column.key, node)
        else columnRefs.current.delete(column.key)
      }}
      columnLead={(column) =>
        grouped || column.key.startsWith("__") ? null : (
          <button
            type="button"
            aria-label={`Move section ${column.label}`}
            {...columnDragProps(column.key)}
            className={cn(
              "-ml-1 flex size-5 cursor-grab items-center justify-center rounded text-[var(--color-graphite-400)] opacity-0 transition-opacity group-hover/col:opacity-100 focus-visible:opacity-100 active:cursor-grabbing",
              T_FAST,
              FOCUS,
              colDrag === column.key && "cursor-grabbing opacity-100",
            )}
          >
            <GripVertical
              className="size-3.5 data-[size=sm]:size-3.5"
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>
        )
      }
      quickAdd={(column) =>
        column.done ? null : (
          <BoardQuickAdd
            onAdd={(title) => {
              if (!grouped && column.key !== "__none") {
                pendingAssign.current = { title, sectionId: column.key }
              }
              onAdd("unscheduled", title)
            }}
          />
        )
      }
      footer={
        grouped ? null : (
          <BoardAddColumn
            label="Add section"
            onClick={() => insertItem(items.length, "section")}
          />
        )
      }
    />
  )

  /* ------------------------------------------------------------ assembly -- */

  return (
    <div className="relative min-h-full">
      <PageCover storageName={storageName} />

      {/* The reading column, from the one definition rather than a copy of
          its class string — the same drift, one level up. */}
      <div className={pageBodyClass()} ref={registerZone(PAGE_BODY)}>
        {/* The strip: thin, steady, under the cover — the folder's controls
            in one place, docking against the top with the folder's name when
            scrolled (Imran's ruling on the 40px cluster: this is chrome, and
            chrome is thin). */}
        {strip}

        <header className={cn("group/head", cover ? "pt-0" : "pt-2")}>
          {/* The mark is `PageMark`, the same component every system page
              renders — F5, after F4's fix reached the six pages and left the
              page it was extracted from still wearing the old white tile.
              The one honest difference survives as a prop: a folder's mark is
              a control and opens the picker (DES-130). */}
          {/* Controlled, because "Label and colour" in the overflow has to
              open the same picker the mark opens — the menu item and the mark
              are two doors onto one control, and an uncontrolled popover can
              only be opened by pressing it. */}
          <Popover open={markOpen} onOpenChange={setMarkOpen}>
            <PopoverTrigger
              render={
                <PageMark
                  icon={Glyph}
                  hasCover={Boolean(cover)}
                  color={color}
                  interactive
                  aria-label="Change folder icon and color"
                />
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
            <AddCoverAction storageName={storageName} />
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
              in the same place (Imran's correction of the far-corner ghost).
              The control itself is `PageHead`'s, because the six system pages
              needed the same one and a second copy is how two descriptions
              come to behave differently (DES-149, DES-154). */}
          <PageDescription
            storageName={storageName}
            label="Folder description"
            offer={pristine}
          />
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
            filters.groupBy === "none" ? listBody : groupedBody
          ) : (
            boardBody
          )}
        </div>

        {conversationView === "page" &&
        !isDefault &&
        previewState !== "loading" &&
        previewState !== "error"
          ? conversationHeader
          : null}
      </div>

      {/* The conversation's other three homes. One thread component in all of
          them (DES-123's rule), the view switched from the surface itself. */}

      {conversationView === "panel" && conversationOpen ? (
        <ReservesRightEdge width={360}>
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
        </ReservesRightEdge>
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
