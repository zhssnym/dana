import { useEffect, useRef, useState } from "react"
import {
  Ban,
  CalendarDays,
  CheckCircle2,
  Contact,
  LayoutGrid,
  List,
  EyeOff,
  MoreHorizontal,
  Folder,
  Layers3,
  ListTodo,
  Settings,
  Star,
  SunMedium,
  UserRoundCheck,
} from "@/lib/icons"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AppShell } from "@/components/app-shell"
import type { ShellPageName } from "@/components/app-sidebar"
import { voiceBars } from "@/components/comments"
import {
  dueLabelFor,
  firstName,
  parseIsoDate,
  PEOPLE,
  type ConceptComment,
  type ConceptTask,
} from "@/lib/task-model"
import type { ShellTaskDetails as TaskFormData } from "@/lib/shell-task"
import {
  TaskRow,
  type TaskOpenMode,
  type TaskRowProps,
} from "@/components/task-row"
import {
  TaskPage,
  TaskSurface,
  type TaskSurfaceMode,
} from "@/components/task-surface"
import { taskSurfacePreference } from "@/lib/task-surface-preference"
import { WindowActivity, WindowBarActions } from "@/components/window-bar"
import { PageCover } from "@/components/page-cover"
import {
  DEFAULT_FILTERS,
  FilterControl,
  stripButtonClass,
  applyView,
  type TaskFilters,
} from "@/components/task-filters"
import { folderGlyph } from "@/components/folder-icon-picker"
import { folderPageMark } from "@/components/folder-mark"
import {
  PROTOTYPE_DUPLICATE_EVENT,
  PROTOTYPE_WORKFLOW_EVENT,
  type DuplicateRequest,
  copyFolderLink,
  duplicateFolder,
  readCreatedFolders,
  saveCreatedFolders,
} from "@/lib/folder-acts"
import {
  copyFolderContents,
  duplicateTask,
  readCopiedTasks,
  saveCopiedTasks,
} from "@/lib/folder-duplicate"
import { type HistoryVerb, record, seedHistory } from "@/lib/history"

/* The day the fixtures are written for — the same one their own `createdAt`
   carries, so a seeded folder and a seeded task agree about when this account
   started. */
const FIXTURE_BIRTHDAY = Date.parse("2026-08-04T09:14:00-06:00")
import {
  applyShelfWorkflow,
  applyWorkflow,
  availableFolderName,
  parseAnyWorkflow,
  folderToWorkflow,
  parseWorkflow,
  saveShelfWorkflowFile,
  saveWorkflowFile,
  shelfToWorkflow,
} from "@/lib/workflow"
import { type TrashItem, readTrash, trash, untrash } from "@/lib/trash"
import { folderLibrary } from "@/lib/folder-library"
import { readPageFilters, writePageFilters } from "@/lib/page-filters"
import { TaskWriter } from "@/lib/task-writer"
import { useFolderIdentity } from "@/lib/folder-presentation"
import { SearchOverlay } from "@/components/search-overlay"
import {
  FOOTER_PAGES,
  NAV_PAGES,
  TRASH_PAGE,
  pageGlyph,
  pageQuestion,
  readNavModel,
  type NavPageName,
} from "@/lib/nav-model"
import { type PageTab } from "@/components/page-bar"
import { notice, pushUndo } from "@/lib/undo"
import { setPagePinned } from "@/lib/page-pins"
import {
  shellConnections,
  shellFolderGroups,
  shellInbox,
  shellPreviewTasks,
} from "@/fixtures"
import {
  PROTOTYPE_FOLDER_MEMBERSHIP_EVENT,
  baseShelfLabels,
  folderShelf,
  readPrototypeFolderMemberships,
  savePrototypeFolderMembership,
  savePrototypeFolderMemberships,
} from "@/lib/folder-membership"
import { readFolderLayout, saveFolderLayout } from "@/lib/folder-layout"
import {
  PROTOTYPE_SHELF_DUPLICATE_EVENT,
  copyShelfLink,
  duplicateShelf,
  moveShelfPage,
  shelfKey,
} from "@/lib/shelf-acts"
import { folderThreadWords } from "@/lib/folder-threads"
import {
  PROTOTYPE_FOLDER_PRESENTATION_EVENT,
  readPrototypeFolderPresentation,
  deletePrototypeFolder,
  renamePrototypeFolder,
  restorePrototypeFolder,
  savePrototypeFolderIdentity,
  type PrototypeFolderPresentation,
} from "@/lib/folder-presentation"
import { MyDayScreen } from "@/screens/my-day-screen"
import { PlannedScreen } from "@/screens/planned-screen"
import { ViewStrip } from "@/components/view-strip"
import { TasksScreen } from "@/screens/tasks-screen"
import { FolderScreen } from "@/screens/folder-screen"
import { FolderPageV2 } from "@/screens/folder-page-v2"
import { ImportantScreen } from "@/screens/important-screen"
import { AllScreen } from "@/screens/all-screen"
import { AssignmentsScreen } from "@/screens/assignments-screen"
import { GroupedScreen } from "@/screens/grouped-screen"
import { DoneScreen } from "@/screens/done-screen"
import {
  PeopleScreen,
  type ConnectionFixture,
  type PendingConnectionInvite,
} from "@/screens/people-screen"
import {
  SettingsScreen,
  type PageVisibility,
} from "@/screens/settings-screen"
import { TrashScreen } from "@/screens/trash-screen"
import { ShelfPage } from "@/screens/shelf-page"

/*
The view a page is drawn in — list, board, or calendar.

One key rather than one per page. A person who switches to the board has said
something about how they like to look at their work, not about Today in
particular, and Scheduled's own list/calendar toggle has been remembered this
way since spec 9.5 asked for it. A page that does not offer the remembered
view falls back to the list without forgetting it, so switching to Today and
back to Scheduled keeps the calendar.
*/
const PAGE_VIEW_KEY = "dana.pageView"

function readPageView(): "list" | "board" | "calendar" {
  if (typeof window === "undefined") return "list"
  const stored = window.localStorage.getItem(PAGE_VIEW_KEY)
  return stored === "board" || stored === "calendar" ? stored : "list"
}

function readShellState() {
  return new URLSearchParams(window.location.search).get("state")
}

type ShellTask = TaskRowProps & {
  id: string
  form: TaskFormData
  myDayGroup?: "carried" | "today"
  tasksGroup?: string
  folderSection?: "scheduled" | "unscheduled"
  hiddenFromMyDay?: boolean
  completedAt?: string
  hasRecurrenceSuccessor?: boolean
}

const formFolderColors: Record<string, string> = {
  Desk: "var(--color-graphite-900)",
  Home: "var(--color-graphite-900)",
  Travel: "var(--color-graphite-900)",
  Office: "var(--color-graphite-900)",
  Business: "var(--color-graphite-900)",
  "Reading list": "var(--color-graphite-900)",
  Ideas: "var(--color-graphite-900)",
}

const primaryShellTasks: ShellTask[] = shellPreviewTasks.map((task, index) => {
  const id = `task-${index + 1}`
  const folder = index === 0 ? "Business" : index === 1 ? "Travel" : "Home"

  return {
    ...task,
    id,
    myDayGroup: "today",
    folderSection: index === 1 ? "scheduled" : undefined,
    form: {
      id,
      title: task.title,
      dueDate: "2026-08-10",
      important: task.important ?? false,
      notes:
        index === 0
          ? "Review the approved shell decisions before the UI handoff."
          : "",
      folder,
      assignee: index === 1 ? "Sara Khan" : "Imran Wafa",
      dueTime: index === 1 ? "14:00" : "",
      reminder: index === 1 ? "30-before" : "none",
      repeat: index === 2 ? "weekly" : "none",
      repeatDays: index === 2 ? ["Mo"] : ["Mo"],
      repeatInterval: "2",
      repeatMonthlyDay: "10",
      repeatEnds: "",
      invitePending: "",
      createdAt: `2026-08-0${Math.min(index + 4, 9)}T09:14:00-06:00`,
      createdBy: index === 1 ? "Sara Khan" : "Imran Wafa",
      steps:
        index === 0
          ? [
              { id: 1, title: "Check sidebar behavior", done: true },
              { id: 2, title: "Confirm the final task row", done: false },
            ]
          : [],
    },
  }
})

function createTaskForm(
  id: string,
  title: string,
  folder: string,
  overrides: Partial<TaskFormData> = {},
): TaskFormData {
  return {
    id,
    title,
    dueDate: "2026-08-10",
    important: false,
    notes: "",
    folder,
    assignee: "Imran Wafa",
    dueTime: "",
    reminder: "none",
    repeat: "none",
    repeatDays: ["Mo"],
    repeatInterval: "2",
    repeatMonthlyDay: "10",
    repeatEnds: "",
    invitePending: "",
    createdAt: "2026-08-04T09:14:00-06:00",
    createdBy: "Imran Wafa",
    steps: [],
    ...overrides,
  }
}

/* Two tasks arrive with a conversation already going, so the Comments block
   is judged as a thread between people rather than as an empty composer.
   DES-129; fixtures only. The voice note here is a fixture and sweeps its
   progress silently — one recorded live in the card plays for real. */
const grantThread: ConceptComment[] = [
  {
    id: "comment-grant-1",
    author: PEOPLE[1]!,
    at: "Yesterday 16:12",
    body: "The outcomes section feels thin — one paragraph covering all three grants. Should we push back?",
    reactions: [{ emoji: "like", count: 2, mine: true }],
    replies: [
      {
        id: "comment-grant-1r",
        author: PEOPLE[0]!,
        at: "Yesterday 16:40",
        mine: true,
        body: "Agreed. I'll draft questions tonight and tick them off here.",
      },
    ],
  },
  {
    id: "comment-grant-2",
    author: PEOPLE[2]!,
    at: "Today 9:05",
    voice: { seconds: 14, bars: voiceBars(14) },
  },
  {
    id: "comment-grant-3",
    author: PEOPLE[1]!,
    at: "Today 9:12",
    body: "Budget breakdown attached.",
    files: [{ name: "grant-budget.xlsx", meta: "XLSX · 214 KB", kind: "file" }],
  },
]

const venueThread: ConceptComment[] = [
  {
    id: "comment-venue-1",
    author: PEOPLE[1]!,
    at: "Mon 14:31",
    body: "Half is already paid — double-check the payment reference before sending the rest.",
  },
]

const myDayGoldenTasks: ShellTask[] = [
  {
    id: "task-4",
    myDayGroup: "carried",
    folderSection: "scheduled",
    title: "Send the venue deposit",
    folder: { name: "Travel", color: "var(--color-graphite-900)" },
    due: { label: "Overdue · 6 Aug", overdue: true },
    important: true,
    comments: venueThread,
    form: createTaskForm("task-4", "Send the venue deposit", "Travel", {
      dueDate: "2026-08-06",
      important: true,
      notes: "Confirm the payment reference before sending the deposit.",
    }),
  },
  {
    id: "task-5",
    myDayGroup: "carried",
    title: "Review community grant application",
    folder: {
      name: "Office",
      color: "var(--color-graphite-900)",
    },
    due: { label: "Overdue · 8 Aug", overdue: true },
    steps: { complete: 2, total: 4 },
    comments: grantThread,
    form: createTaskForm(
      "task-5",
      "Review community grant application",
      "Office",
      {
        dueDate: "2026-08-08",
        steps: [
          { id: 1, title: "Read the budget", done: true },
          { id: 2, title: "Check eligibility", done: true },
          { id: 3, title: "Review outcomes", done: false },
          { id: 4, title: "Send comments", done: false },
        ],
      },
    ),
  },
  {
    id: "task-6",
    myDayGroup: "today",
    title: "Review the guest transport plan",
    folder: { name: "Travel", color: "var(--color-graphite-900)" },
    due: { label: "Due 18 Aug" },
    pulled: true,
    important: true,
    form: createTaskForm(
      "task-6",
      "Review the guest transport plan",
      "Travel",
      { dueDate: "2026-08-18", important: true },
    ),
  },
  {
    id: "task-7",
    myDayGroup: "today",
    folderSection: "scheduled",
    title: "Send ceremony invitation proof",
    folder: { name: "Travel", color: "var(--color-graphite-900)" },
    due: { label: "Done 9:20 AM" },
    status: "completed",
    completedAt: "2026-08-10T09:20:00-06:00",
    important: true,
    form: createTaskForm(
      "task-7",
      "Send ceremony invitation proof",
      "Travel",
      {
        important: true,
        completedAt: "2026-08-10T09:20:00-06:00",
        completedBy: "Imran Wafa",
      },
    ),
  },
  {
    id: "task-8",
    myDayGroup: "today",
    title: "Confirm balcony watering schedule",
    folder: { name: "Home", color: "var(--color-graphite-900)" },
    due: { label: "Done 8:05 AM" },
    status: "completed",
    completedAt: "2026-08-10T08:05:00-06:00",
    hasRecurrenceSuccessor: true,
    recurrence: "Weekly",
    form: createTaskForm(
      "task-8",
      "Confirm balcony watering schedule",
      "Home",
      {
        repeat: "weekly",
        repeatDays: ["Mo"],
        completedAt: "2026-08-10T08:05:00-06:00",
        completedBy: "Imran Wafa",
      },
    ),
  },
]

const tasksGoldenTasks: ShellTask[] = [
  {
    id: "task-9",
    title: "Capture questions for Hassan",
    tasksGroup: "Desk",
    important: true,
    form: createTaskForm("task-9", "Capture questions for Hassan", "Desk", {
      dueDate: "",
      important: true,
    }),
  },
  {
    id: "task-10",
    title: "Renew the library card",
    tasksGroup: "Desk",
    form: createTaskForm("task-10", "Renew the library card", "Desk", {
      dueDate: "",
    }),
  },
  {
    id: "task-11",
    title: "Draft the grant budget questions",
    tasksGroup: "Office",
    assignee: { initials: "S", name: "Sara" },
    steps: { complete: 1, total: 3 },
    form: createTaskForm(
      "task-11",
      "Draft the grant budget questions",
      "Office",
      {
        dueDate: "",
        assignee: "Sara Khan",
        steps: [
          { id: 1, title: "Review last year’s budget", done: true },
          { id: 2, title: "List open questions", done: false },
          { id: 3, title: "Share with Sara", done: false },
        ],
      },
    ),
  },
  {
    id: "task-12",
    title: "Collect frontend handoff questions",
    tasksGroup: "Business",
    important: true,
    form: createTaskForm(
      "task-12",
      "Collect frontend handoff questions",
      "Business",
      { dueDate: "", important: true },
    ),
  },
  {
    id: "task-13",
    title: "Replace the balcony planter",
    tasksGroup: "Home",
    status: "abandoned",
    form: createTaskForm("task-13", "Replace the balcony planter", "Home", {
      dueDate: "",
    }),
  },
  {
    id: "task-14",
    folderSection: "unscheduled",
    title: "Compare invitation envelope samples",
    tasksGroup: "Travel",
    assignee: { initials: "S", name: "Sara" },
    form: createTaskForm(
      "task-14",
      "Compare invitation envelope samples",
      "Travel",
      { dueDate: "", assignee: "Sara Khan" },
    ),
  },
  {
    id: "task-15",
    folderSection: "unscheduled",
    title: "Keep the backup chair reservation",
    tasksGroup: "Travel",
    status: "abandoned",
    folder: { name: "Travel", color: "var(--color-graphite-900)" },
    form: createTaskForm(
      "task-15",
      "Keep the backup chair reservation",
      "Travel",
      { dueDate: "" },
    ),
  },
]

const plannedGoldenTasks: ShellTask[] = [
  {
    id: "task-16",
    title: "Confirm the catering cancellation window",
    status: "abandoned",
    important: true,
    folder: { name: "Travel", color: "var(--color-graphite-900)" },
    due: { label: "12 Aug" },
    form: createTaskForm(
      "task-16",
      "Confirm the catering cancellation window",
      "Travel",
      { dueDate: "2026-08-12", important: true },
    ),
  },
  {
    id: "task-17",
    title: "Review the release readiness checklist",
    folder: { name: "Business", color: "var(--color-graphite-900)" },
    due: { label: "14 Aug" },

    form: createTaskForm(
      "task-17",
      "Review the release readiness checklist",
      "Business",
      { dueDate: "2026-08-14", assignee: "" },
    ),
  },
]

const doneGoldenTasks: ShellTask[] = [
  {
    id: "task-18",
    title: "Send the final guest count",
    status: "completed",
    completedAt: "2026-08-09T16:40:00-06:00",
    important: true,
    folder: { name: "Travel", color: "var(--color-graphite-900)" },
    due: { label: "Due 9 Aug" },
    form: createTaskForm("task-18", "Send the final guest count", "Travel", {
      dueDate: "2026-08-09",
      important: true,
      completedAt: "2026-08-09T16:40:00-06:00",
      completedBy: "Sara Khan",
    }),
  },
  {
    id: "task-19",
    title: "Archive the approved Dana mark assets",
    status: "completed",
    completedAt: "2026-08-06T14:15:00-06:00",
    folder: { name: "Business", color: "var(--color-graphite-900)" },
    due: { label: "Due 6 Aug" },
    form: createTaskForm("task-19", "Archive the approved Dana mark assets", "Business", {
      dueDate: "2026-08-06",
      completedAt: "2026-08-06T14:15:00-06:00",
      completedBy: "Hassan Ali",
    }),
  },
]

const shellTaskFixtures: ShellTask[] = [
  ...primaryShellTasks,
  ...myDayGoldenTasks,
  ...tasksGoldenTasks,
  ...plannedGoldenTasks,
  ...doneGoldenTasks,
]

/* One roster, in the fixtures, so the People screen and the row's assignee
   menu cannot disagree about who exists (W2). */
const peopleConnections: ConnectionFixture[] = shellConnections

const peoplePendingInvites: PendingConnectionInvite[] = [
  {
    id: "pending-aisha",
    email: "aisha@example.com",
    sentAt: "Sent today",
  },
]

function doneGroups(tasks: ShellTask[]) {
  const today = "2026-08-10"
  const yesterday = "2026-08-09"
  const completed = tasks
    .filter((task) => task.status === "completed" && task.completedAt)
    .slice()
    .sort(
      (a, b) =>
        (b.completedAt ?? "").localeCompare(a.completedAt ?? "") ||
        b.id.localeCompare(a.id),
    )
  const groups = new Map<string, ShellTask[]>()

  for (const task of completed) {
    const completedDate = task.completedAt!.slice(0, 10)
    const label =
      completedDate === today
        ? "Today"
        : completedDate === yesterday
          ? "Yesterday"
          : new Intl.DateTimeFormat("en-CA", {
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(`${completedDate}T12:00:00Z`))
    groups.set(label, [...(groups.get(label) ?? []), task])
  }

  return Array.from(groups, ([label, groupTasks]) => ({
    label,
    tasks: groupTasks,
  }))
}

function plannedServerOrder(tasks: ShellTask[]) {
  const statusRank = { pending: 0, abandoned: 1, completed: 2 }
  return tasks
    .filter(
      (task) =>
        Boolean(task.form.dueDate) &&
        task.status !== "completed",
    )
    .slice()
    .sort(
      (a, b) =>
        a.form.dueDate.localeCompare(b.form.dueDate) ||
        statusRank[a.status ?? "pending"] - statusRank[b.status ?? "pending"] ||
        Number(Boolean(a.form.dueTime)) - Number(Boolean(b.form.dueTime)) ||
        a.form.dueTime.localeCompare(b.form.dueTime) ||
        a.id.localeCompare(b.id),
    )
}

function importantServerOrder(tasks: ShellTask[]) {
  const statusRank = { pending: 0, abandoned: 1, completed: 2 }
  return tasks
    .filter(
      (task) =>
        task.important &&
        task.status !== "completed",
    )
    .slice()
    .sort((a, b) => {
      const aDated = Boolean(a.form.dueDate)
      const bDated = Boolean(b.form.dueDate)
      if (aDated !== bDated) return aDated ? -1 : 1
      if (aDated && bDated) {
        return (
          a.form.dueDate.localeCompare(b.form.dueDate) ||
          statusRank[a.status ?? "pending"] - statusRank[b.status ?? "pending"] ||
          Number(Boolean(a.form.dueTime)) - Number(Boolean(b.form.dueTime)) ||
          a.form.dueTime.localeCompare(b.form.dueTime) ||
          a.id.localeCompare(b.id)
        )
      }
      return b.id.localeCompare(a.id)
    })
}

export function ShellPage() {
  const searchParams = new URLSearchParams(window.location.search)
  const isCleanHandoffPreview =
    searchParams.get("handoff") === "clean" && !searchParams.has("explore")
  const state = readShellState()
  const requestedPage = searchParams.get("page")
  const reviewState = searchParams.get("review")
  const toastState = searchParams.get("toast")
  /* `?review=…` used to preselect a task for the deleted form. Nothing has
     read it since; the review states it served are reached by URL on the
     states page now. */
  const [searchOpen, setSearchOpen] = useState(searchParams.get("search") === "open")
  /* The fixtures, plus anything a duplicate has copied. Every navigation here
     is a full page load, so without the second half a copied folder's tasks
     would be gone by the time you clicked into it — the very complaint this
     answers, one navigation later (see lib/folder-duplicate). */
  const [tasks, setTasks] = useState<ShellTask[]>(() => {
    /*
    The fixtures, minus what is in the trash, plus what a duplicate copied.

    Both halves exist for the same reason and it is worth saying once: every
    navigation here is a full page load and the task list is memory-only, so
    anything an act did at runtime is undone by the next click. That never
    mattered while acts were momentary. It matters for these two, because both
    are *about* what you find when you come back — a copied folder that arrives
    empty, or a task sitting in Trash and in Today at the same time, are the
    same bug wearing two faces.

    Reading the trash rather than keeping a second list of deleted ids: the
    trash already knows, and two stores that must agree about one fact is the
    fault this session keeps removing.
    */
    const binned = new Set(
      readTrash()
        .filter((item) => item.kind === "task")
        .map((item) => item.subject),
    )
    return [
      ...shellTaskFixtures.filter((task) => !binned.has(task.id)),
      ...readCopiedTasks<ShellTask>().filter((task) => !binned.has(task.id)),
    ]
  })
  const [pageVisibility, setPageVisibility] = useState<PageVisibility>(() => ({
    Important: searchParams.get("show-important") !== "false",
    All: searchParams.get("show-all") !== "false",
    /* Done ships unpinned under DES-152, which is also what
       `user_settings.show_done` already defaults to today — so the v2 sidebar
       shows it only when Settings turns it on. The v1 sidebar keeps its old
       behaviour so the flag compares like for like. */
    Done: searchParams.has("show-done")
      ? searchParams.get("show-done") === "true"
      : readNavModel() === "v2"
        ? false
        : requestedPage !== "settings",
  }))
  const [folderPresentation, setFolderPresentation] =
    useState<PrototypeFolderPresentation>(() =>
      isCleanHandoffPreview
        ? { names: {}, deleted: [], identity: {} }
        : readPrototypeFolderPresentation(),
    )
  /* The task surface, hosted at shell level so any screen's row can open a
     task into it (DES-136). */
  const [shellSurface, setShellSurface] = useState<{
    id: string
    mode: TaskSurfaceMode
  } | null>(() => {
    /*
    A task has an address now: `?task=<id>`.

    Copy link forced it. The act was declared for tasks in the contract and
    could not be supplied, because a task had no URL — every other object in
    Dana is reachable by one and a task was reachable only by finding it. A
    Copy link that produced a link to the page the task happens to be on would
    have been worse than none, since the page changes and the task does not.

    It opens in whichever surface the person prefers, the same as pressing the
    row, because a link is somebody saying "look at this" rather than "look at
    this in a dialog". `&open=tab` overrides it for the case where the sender
    means the tab.

    It is also the instrument this plan has been missing: every review link so
    far could point at a page, and now one can point at a row.
    */
    const wanted = new URLSearchParams(window.location.search).get("task")
    if (!wanted) return null
    const mode = new URLSearchParams(window.location.search).get("open")
    return {
      id: wanted,
      mode: (mode as TaskSurfaceMode | null) ?? taskSurfacePreference(),
    }
  })
  /*
  `?task=` is an arrival instruction, and it stops being true once obeyed
  (DES-211).

  Imran: "whenever you open a folder, a task is always open in the left
  sidebar." He was right and I could not reproduce it because I was opening
  tasks by pressing rows, which never puts anything in the URL. Arrive by a
  *link* — which is the whole point of DES-201's address — and the param stays
  there, because `navigateToFolder` clears `page`, `folder-state`,
  `folder-action` and `folder-page` and had never heard of `task`. So every
  folder opened afterwards re-opened the same task, for ever, and the only clue
  was in the address bar.

  Two fixes, and the second is the one that matters. The navigators clear it —
  but a list of params to clear is a list somebody has to extend, and this is
  the third time this session that shape has failed (Trash rendered My Day,
  `?state=shelf` rendered Desk). So the param removes *itself* the moment the
  surface opens: an instruction that has been carried out is no longer an
  instruction, and nothing downstream has to remember it exists.
  */
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("task")) return
    const url = new URL(window.location.href)
    url.searchParams.delete("task")
    url.searchParams.delete("open")
    window.history.replaceState(null, "", url)
  }, [])

  const isDone = state === "done" || requestedPage === "done"
  /* DES-152's page set, behind `?nav=v2`. Most of it maps onto the branches
     already here — Today renders My Day's screen, Scheduled renders Planned's
     — because the model changed which questions the sidebar asks, not what a
     list of tasks looks like. Two are genuinely new: Assignments, and Desk,
     which is not a new screen at all but the folder page pointed at the
     default folder, since Desk *is* a folder and only its prominence
     changed. */
  const isNavV2 = readNavModel() === "v2"
  const isAssignments = isNavV2 && requestedPage === "assignments"
  /* A shelf's own page (DES-207), addressed the way a folder's is: one param
     naming the state and one naming the thing. */
  const isShelf = state === "shelf"
  const selectedShelfName = searchParams.get("shelf") ?? ""
  /*
  Desk is where you land with nothing else asked for — and "nothing else" has
  to be a named list, not a pair of exceptions.

  The condition was `state !== "folder" && state !== "done"`, so every state
  added after it landed on Desk: `?state=shelf` rendered the Desk page, which
  is the third time this session a default written as exceptions has swallowed
  something new (Trash rendered My Day; `?mode=calendar` died at F6). One list
  now, and the next state joins it here.
  */
  const NAMED_STATE = ["folder", "done", "shelf"]
  const isDesk =
    isNavV2 &&
    (requestedPage === "desk" ||
      (!requestedPage && !NAMED_STATE.includes(state ?? "")))
  const isFolder = state === "folder" || isDesk
  const isTasks = requestedPage === "tasks"
  const isPlanned =
    requestedPage === "planned" || requestedPage === "scheduled"
  const isImportant = requestedPage === "important"
  const isAll = requestedPage === "all"
  /* The two views DES-170 added, both unpinned by default and both reached
     the same way as any other page. */
  const isAbandoned = isNavV2 && requestedPage === "abandoned"
  const isAnytime = isNavV2 && requestedPage === "anytime"
  const isPeople = requestedPage === "people"
  const isSettings = requestedPage === "settings"
  const isTrash = requestedPage === "trash"
  /*
  The pages that are not a list of your work.

  People, Settings and Trash each render their own body, take no task filters,
  host no floating button and are not what "group by folder" could ever mean.
  Four places were spelling that out as `!isPeople && !isSettings`, and Trash
  proved why that is a fault rather than a style: it landed inside the My Day
  branch, because that branch is defined as *none of the others* and nobody
  had told it about a page that did not exist yet.

  That is the same shape that killed `?mode=calendar` at F6 — a default
  written as a list of exceptions is a default that goes wrong the next time
  something is added. Named once, the next page joins here and all four
  branches learn about it together.
  */
  const isUtilityPage = isPeople || isSettings || isTrash || isShelf
  const selectedFolderName = isDesk
    ? "Desk"
    : (searchParams.get("folder") ?? "Travel")
  const folderIdentity = useFolderIdentity(selectedFolderName)
  /* One filter for every place-page, so the control in the window bar means
     the same thing wherever it is (DES-140). The folder page keeps its own,
     because its list is sectioned and its filter has more to do. */
  /* Per page, kept for the session — `lib/page-filters` carries the
     reasoning, and the short of it is that a narrowing belongs to the page you
     are on and is visible as chips, so it is safe to still be there when you
     come back and wrong to follow you somewhere else. */
  const filterKey = isFolder ? `folder:${selectedFolderName}` : (requestedPage ?? "today")
  const [pageFilters, setPageFilters] = useState<TaskFilters>(() =>
    readPageFilters(
      filterKey,
      /* `?state=important` is the important-only capture, and it seeds the one
         filter rather than a second switch inside My Day's header (F3). */
      state === "important"
        ? { ...DEFAULT_FILTERS, importantOnly: true }
        : DEFAULT_FILTERS,
    ),
  )
  useEffect(() => {
    writePageFilters(filterKey, pageFilters)
  }, [filterKey, pageFilters])
  /*
  Which views this page offers — DES-177, applied rather than remembered.

  Two tests, and a page offers a view only if it passes both:

  1. **It can draw everything the page holds.** A board always can, because
     "no group" is a column — that is why the board has *No section*. A
     calendar cannot draw a task with no date; there is no cell for one. So a
     calendar is offered only where *having a date* is what puts a task on the
     page, which is Scheduled and nowhere else.
  2. **It does not collapse to one group.** A page either pins a value on its
     axis or spans it. Today pins one day, so a calendar of Today is one cell;
     Scheduled spans every date, so a calendar is its natural picture.

  List is the ground and needs no reason: any set of tasks is a list.
  */
  const pageViews: ("list" | "board" | "calendar")[] = isPlanned
    ? ["list", "board", "calendar"]
    : ["list", "board"]
  /*
  What the board columns by when nobody has said.

  The board draws the page's current grouping (DES-177), so it needs one. A
  page that *spans* a categorical axis has an obvious answer — Assignments is
  people — and every other page takes the folder, which is the one categorical
  value every task always has, because an unfiled task is in Desk.
  */
  const boardAxis = isAssignments ? "person" : "folder"
  /*
  The URL can name the view, and it has to.

  Scheduled has answered `?mode=calendar` since spec 9.5 asked for a persisted
  toggle, and lifting the view into the shell at F6 quietly killed it: the
  shell's remembered value won, so the link opened on the list and looked
  fine. Nothing caught it, because a route check that only asks whether a page
  rendered cannot see which of its views it rendered.

  It is general now rather than Scheduled's alone — `?mode=board` opens any
  page on its board — because a review is done by clicking links, and a view
  you can only reach by pressing something is a view nobody can be sent to.
  */
  const [pageView, setPageView] = useState<"list" | "board" | "calendar">(() => {
    const asked = searchParams.get("mode")
    if (asked === "calendar" || asked === "board" || asked === "list") return asked
    return readPageView()
  })
  const view = pageViews.includes(pageView) ? pageView : "list"
  useEffect(() => {
    window.localStorage.setItem(PAGE_VIEW_KEY, view)
  }, [view])
  /*
  A board needs columns however it was reached.

  Choosing Board from the strip sets the grouping, because the two controls
  are one setting seen twice (DES-177). Arriving on `?mode=board` set the view
  and nothing else, so the page drew a board with no columns at all — the same
  decision made in two places, and only one of them complete. It is a fact
  about the view now rather than about the press.
  */
  useEffect(() => {
    if (view !== "board") return
    setPageFilters((current) =>
      current.groupBy === "none" ? { ...current, groupBy: boardAxis } : current,
    )
  }, [view, boardAxis])

  /* A place-page asked to group by something other than its own spine stops
     being that page's arrangement and becomes the grouped one (DES-153). Not
     a folder, which has its own filter and its own body; not People or
     Settings, which list no tasks. */
  const isGrouped =
    (pageFilters.groupBy !== "none" || isAbandoned || isAnytime || view === "board") &&
    !isFolder &&
    !isUtilityPage
  /*
  What each place-page is *about*, as one predicate — its spine (DES-152).

  It exists because grouping replaces a page's **arrangement** and must never
  touch its **subject**: Today grouped by folder is today's work in folders,
  not the whole database in folders, which is what the first wiring showed.
  The page's own body derives the same scope while composing its sections;
  this is that scope said once, for the view that has no sections of its own.
  */
  /*
  Today, as a predicate rather than as "none of the others".

  The spine below ends in an unnamed else-branch, and three other places were
  spelling that branch out by hand — the floating button's visibility, its
  entry defaults, and now the board's. Naming it once is what let the entry
  defaults be checked against the spine at all.
  */
  const isToday =
    !isAbandoned &&
    !isAnytime &&
    !isDone &&
    !isAssignments &&
    !isAll &&
    !isTasks &&
    !isPlanned &&
    !isImportant &&
    !isFolder &&
    !isUtilityPage

  const pageSpine = (task: ShellTask) =>
    isAbandoned ? task.status === "abandoned"
    : isAnytime ? !task.form.dueDate && task.status !== "completed"
    : isDone ? task.status === "completed"
    : isAssignments || isAll ? true
    : isTasks ? !task.form.dueDate
    : isPlanned ? Boolean(task.form.dueDate)
    : isImportant ? Boolean(task.important)
    : (task.myDayGroup === "carried" || task.myDayGroup === "today") &&
      !task.hiddenFromMyDay
  /* Which folder page renders: the Notion-page concept by default, the
     previous screen behind ?folder-page=v1 for the side-by-side. */
  const folderPageVariant =
    searchParams.get("folder-page") === "v1" ? "v1" : "v2"
  const selectedFolderDisplayName =
    folderPresentation.names[selectedFolderName] ?? selectedFolderName
  const folderMemberships =
    isCleanHandoffPreview ? {} : readPrototypeFolderMemberships()
  const selectedFolderMembership = folderMemberships[selectedFolderName]
  const hasSelectedFolderMembership = Object.prototype.hasOwnProperty.call(
    folderMemberships,
    selectedFolderName,
  )
  const baseFolderLabel =
    shellFolderGroups.find((group) =>
      group.folders.some((folder) => folder.name === selectedFolderName),
    )?.label ?? ""
  const selectedFolderLabel = hasSelectedFolderMembership
    ? selectedFolderMembership?.label ?? ""
    : baseFolderLabel
  const selectedFolderColor =
    selectedFolderMembership?.color ??
    formFolderColors[selectedFolderName] ??
    "var(--color-graphite-500)"
  const availableFolderLabels = [
    ...new Set([
      ...shellFolderGroups.map((group) => group.label),
      ...Object.values(folderMemberships)
        .map((membership) => membership.label)
        .filter((label): label is string => Boolean(label)),
    ]),
  ]
  const isSharedFolder = [
    "Travel",
    "Business",
    "Office",
  ].includes(selectedFolderName)

  useEffect(() => {
    function updateFolderPresentation(event: Event) {
      const detail = (event as CustomEvent<PrototypeFolderPresentation>).detail
      if (detail) setFolderPresentation(detail)
    }

    window.addEventListener(
      PROTOTYPE_FOLDER_PRESENTATION_EVENT,
      updateFolderPresentation,
    )
    return () =>
      window.removeEventListener(
        PROTOTYPE_FOLDER_PRESENTATION_EVENT,
        updateFolderPresentation,
      )
  }, [])
  /* Memberships are read fresh each render; this makes a change *cause* one.
     Without it, adding a folder from the shelf page's own row wrote the store
     and drew nothing until the next navigation (DES-219). */
  const [, setMembershipStamp] = useState(0)
  useEffect(() => {
    const bump = () => setMembershipStamp((stamp) => stamp + 1)
    window.addEventListener(PROTOTYPE_FOLDER_MEMBERSHIP_EVENT, bump)
    return () =>
      window.removeEventListener(PROTOTYPE_FOLDER_MEMBERSHIP_EVENT, bump)
  }, [])
  /* One name per page, used by the sidebar's active row, the tab, and the
     page's own title. The v2 names sit beside the v1 ones rather than
     replacing them, because the flag has to show both. */
  const abandonedOrAnytime = isAbandoned ? "Abandoned" : isAnytime ? "Anytime" : null
  const activePage: ShellPageName | null = abandonedOrAnytime ? (abandonedOrAnytime as ShellPageName) : isDesk
    ? "Desk"
    /* A shelf is its own place: no sidebar page-row is the one you are on.
       It fell through this chain to "Today", which lit Today's row from a
       shelf page and, once the strip drew from one list, named the shelf's
       tab Today too (DES-219). */
    : isFolder || isShelf
      ? null
      : isPeople
        ? "People"
        : isSettings
          ? "Settings"
          : isTrash
            ? "Trash"
          : isDone
            ? "Done"
            : isAssignments
              ? "Assignments"
              : isTasks
                ? "Tasks"
                : isPlanned
                  ? isNavV2
                    ? "Scheduled"
                    : "Planned"
                  : isImportant
                    ? "Important"
                    : isAll
                      ? "All"
                      : isNavV2
                        ? "Today"
                        : "My Day"
  const pageTitle =
    isFolder && !isDesk
      ? selectedFolderDisplayName
      : (activePage ?? selectedFolderDisplayName)
  /* The tab wears the glyph the folder's owner chose (DES-130), not the
     generic folder mark — the sidebar already does, and a tab that
     disagrees with the sidebar row beside it is a tab nobody trusts. */
  const PageIcon = isAbandoned
    ? Ban
    : isAnytime
      ? Layers3
    : isDesk
    /* Desk is a folder, so its mark comes from the one resolver like every
       other folder's. It used to be a literal imported here, which is the
       DES-155 fault in miniature: dressing Desk changed the sidebar and left
       this tab wearing the shipped glyph. */
    ? folderPageMark("Desk")
    : isFolder
      ? folderGlyph(folderIdentity.glyph, selectedFolderName)
      : isPeople
        ? Contact
        : isSettings
          ? Settings
          : isDone
            ? CheckCircle2
            : isAssignments
              ? UserRoundCheck
              : isTasks
                ? ListTodo
                : isPlanned
                  ? CalendarDays
                  : isImportant
                    ? Star
                    : isAll
                      ? Layers3
                      : SunMedium
  const pageIconColor = isFolder
    ? folderIdentity.color ?? selectedFolderColor
    : undefined

  /*
  The tab strip (DES-217): one ordered list, every tab equal and closable.

  A tab id says what kind of thing it holds — `page:`, `folder:`, `shelf:`, or
  a bare task id — the same one-list-with-a-kind that search and duplicate
  settled. The list lives in sessionStorage because the shell navigates by
  full page load; tabs are working state, not data, so a fresh visit starts
  clean.

  **The strip used to have a special first tab** — wider, unclosable, silently
  showing whatever the URL named — and that is why a folder asked to open as a
  second tab appeared to open as the first: opening navigated, and the first
  tab followed the URL to the same folder (Imran, 2026-08-24). Now the place
  you are on is simply the active tab. Ordinary navigation retargets the tab
  you were standing on, the way a browser's address bar does; "Open in a new
  tab" appends one and goes to it; and the tab that was showing the old place
  keeps saying so, because it is an entry in the list rather than a mirror of
  the URL.

  A place tab **navigates**, and a task tab replaces the page below the strip.
  That asymmetry is the design rather than a shortcut: a place already has a
  route — the same one the sidebar uses — and rendering a second copy of its
  page inside the strip would mean maintaining forty props at two call sites.
  A task has no route of its own; its tab *is* where it lives (DES-208).
  */
  const isPlaceTabId = (id: string) =>
    id.startsWith("page:") || id.startsWith("folder:") || id.startsWith("shelf:")
  const currentPlaceId = isShelf
    ? `shelf:${selectedShelfName}`
    : isFolder && !isDesk
      ? `folder:${selectedFolderName}`
      : `page:${activePage ?? (isNavV2 ? "Today" : "My Day")}`
  const [tabIds, setTabIds] = useState<string[]>(() => {
    if (isCleanHandoffPreview) return [currentPlaceId]
    let stored: string[] = []
    try {
      const raw = JSON.parse(
        window.sessionStorage.getItem("dana:tabs") ??
          /* The strip's previous key, holding task and folder ids in the same
             shape — a session that spans the change keeps its tabs. */
          window.sessionStorage.getItem("dana:task-tabs") ??
          "[]",
      )
      stored = Array.isArray(raw)
        ? raw.filter((id): id is string => typeof id === "string")
        : []
    } catch {
      /* First visit, or somebody else's JSON. */
    }
    if (stored.length === 0) return [currentPlaceId]
    if (stored.includes(currentPlaceId)) return stored
    /* The URL names a place no tab holds: ordinary navigation goes to the tab
       you were on rather than opening a new one. `dana:active-place` is the
       place tab that was showing before this load. */
    const lastPlace = window.sessionStorage.getItem("dana:active-place")
    const at = lastPlace ? stored.indexOf(lastPlace) : -1
    if (at >= 0) {
      const next = [...stored]
      next[at] = currentPlaceId
      return next
    }
    return [currentPlaceId, ...stored]
  })
  const [activeTaskTab, setActiveTaskTab] = useState<string | null>(null)
  const persistTabs = (ids: string[]) => {
    setTabIds(ids)
    /* Written synchronously, not from an effect: most callers navigate in the
       same breath, and state that has not flushed dies with the page. */
    window.sessionStorage.setItem("dana:tabs", JSON.stringify(ids))
  }
  /* The reconciled list and the place now showing, recorded once per load —
     the next load's reconciliation reasons from them. */
  useEffect(() => {
    if (isCleanHandoffPreview) return
    window.sessionStorage.setItem("dana:tabs", JSON.stringify(tabIds))
    window.sessionStorage.setItem("dana:active-place", currentPlaceId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const navigateToPlace = (id: string) => {
    if (id.startsWith("folder:")) navigateToFolder(id.slice("folder:".length))
    else if (id.startsWith("shelf:")) navigateToShelf(id.slice("shelf:".length))
    else navigateToPage(id.slice("page:".length) as ShellPageName)
  }
  /* Selecting and opening are one act: an id already in the strip is not
     appended twice, a place lands you there, a task shows over the page. */
  const openTab = (id: string) => {
    if (!tabIds.includes(id)) persistTabs([...tabIds, id])
    if (!isPlaceTabId(id)) {
      setActiveTaskTab(id)
      return
    }
    if (id === currentPlaceId) {
      setActiveTaskTab(null)
      return
    }
    navigateToPlace(id)
  }
  const openTaskTab = (taskId: string) => openTab(taskId)
  const openFolderTab = (name: string) => openTab(`folder:${name}`)
  const openShelfTab = (label: string) => openTab(`shelf:${label}`)
  const closeTab = (id: string) => {
    const at = tabIds.indexOf(id)
    if (at < 0) return
    const next = tabIds.filter((candidate) => candidate !== id)
    if (!isPlaceTabId(id)) {
      let final = next
      if (activeTaskTab === id) {
        setActiveTaskTab(null)
        /* Closing the task returns to the page beneath it — and if that
           page's own tab was closed while the task was up, it gets one back,
           in the closed tab's place. */
        if (!next.includes(currentPlaceId)) {
          final = [...next]
          final.splice(Math.min(at, final.length), 0, currentPlaceId)
        }
      }
      persistTabs(final)
      return
    }
    persistTabs(next)
    if (id !== currentPlaceId) return
    /* Closing the place you are standing on: the neighbouring place takes
       over — the one after it, else the one before — and an emptied strip
       lands on Desk (Imran, 2026-08-24). */
    const after = next.slice(at).find(isPlaceTabId)
    const before = [...next.slice(0, at)].reverse().find(isPlaceTabId)
    const neighbour = after ?? before
    if (neighbour) navigateToPlace(neighbour)
    else navigateToPage(isNavV2 ? "Desk" : "My Day")
  }
  const reorderTabs = (from: number, to: number) => {
    /* The strip's indices are over the tabs it draws, and a tab whose subject
       has stopped existing draws nothing — so the drawn list is reordered and
       the dead ids ride at the end rather than skewing every index. */
    const visible = tabIds.filter((id) => tabFor(id) !== null)
    const moved = visible[from]
    if (moved === undefined || from === to) return
    const without = visible.filter((_, index) => index !== from)
    without.splice(to, 0, moved)
    persistTabs([...without, ...tabIds.filter((id) => tabFor(id) === null)])
  }
  /* What each tab draws. The current place borrows the page's own identity —
     folder glyphs and colours included — because they are one thing; the
     others resolve by kind. A tab whose subject has stopped existing draws
     nothing rather than a dead row. */
  const tabFor = (id: string): PageTab | null => {
    /*
    Shelves before the current-place shortcut: `pageTitle` never learned about
    shelves — a shelf page fell through its chain to "Today" — so the shortcut
    dressed the shelf tab as Today's. The shelf you are standing on always
    draws, even mid-rename or freshly duplicated, when the label list has not
    caught up.
    */
    if (id.startsWith("shelf:")) {
      const label = id.slice("shelf:".length)
      if (id !== currentPlaceId && !availableFolderLabels.includes(label)) {
        return null
      }
      return { id, title: label, icon: folderPageMark(shelfKey(label)) }
    }
    if (id === currentPlaceId) {
      return { id, title: pageTitle, icon: PageIcon, iconColor: pageIconColor }
    }
    if (id.startsWith("folder:")) {
      const name = id.slice("folder:".length)
      const folder = folderLibrary().find((candidate) => candidate.name === name)
      return folder
        ? {
            id,
            title: folderPresentation.names[name] ?? folder.name,
            folder: { name: folder.name, color: folder.color },
          }
        : null
    }
    if (id.startsWith("shelf:")) {
      const label = id.slice("shelf:".length)
      return availableFolderLabels.includes(label)
        ? { id, title: label, icon: folderPageMark(shelfKey(label)) }
        : null
    }
    if (id.startsWith("page:")) {
      const name = id.slice("page:".length)
      return { id, title: name, icon: pageGlyph(name) ?? undefined }
    }
    const task = tasks.find((candidate) => candidate.id === id)
    return task ? { id, title: task.title, folder: task.folder } : null
  }
  /* Where a task opens, once it leaves the list: the surface in one of its
     five modes, or the tab strip. The row's view strip and the card's
     full-screen action both arrive here (DES-136). No mode means the row
     asked in the old, bare way — nothing opens a sheet any more, so the
     honest default is the dialog: the lightest surface that still reads as
     a place. */
  const openTask = (taskId: string, mode?: TaskOpenMode) => {
    if (mode === "tab") {
      openTaskTab(taskId)
      return
    }
    setShellSurface({ id: taskId, mode: mode ?? taskSurfacePreference() })
  }
  /* A ghost is a projection of a repeating task; opening it opens the real
     one, which is what the projection is a picture of. */
  const openGhostTask = (taskId: string) => openTask(taskId)

  /*
  The shell's side of the card's one write path (`onPatch` in useCardWiring).

  The card speaks in `ConceptTask` and the shell stores a `ShellTask` with a
  form beside it, so this is where the two vocabularies meet. Only the fields
  a card can actually change are translated; anything else stays where the
  card put it, which is honest — a prototype that pretended to persist every
  field would be inventing storage it does not have.

  Without this, a task opened in a surface could be edited and the edit died
  with the component: the surface mounts per open, so closing it discarded the
  name you had just typed (Imran, 2026-08-22).
  */
/*
Fields that already have a verb of their own.

A row that ticks its checkbox does two things on purpose: it reports the change
like any other edit, so whoever is holding the task updates, **and** it tells
the screen that a completion happened, because completion is the screen's fact
rather than the row's. Both are right. But the log listened to both and wrote
two lines for one press — `Completed "Send the venue deposit"` and, in the same
millisecond, `Edited`.

The fix belongs here rather than in the row, because the row's two calls are
each correct and the double entry is a fact about the *log*: a change already
spoken for by a stronger verb is not also an edit. A patch carrying only these
records nothing; one carrying anything else still does.
*/
const OWNED_ELSEWHERE = new Set(["done"])

  const patchTaskFromCard = (
    taskId: string,
    fields: Partial<ConceptTask>,
  ) => {
    const task = tasks.find((candidate) => candidate.id === taskId)
    if (!task) return
    const next: Partial<ShellTask> = {}
    const form: Partial<TaskFormData> = {}
    if (fields.title !== undefined) {
      next.title = fields.title
      form.title = fields.title
    }
    if (fields.important !== undefined) {
      next.important = fields.important
      form.important = fields.important
    }
    if (fields.folder !== undefined) {
      next.folder = fields.folder
      form.folder = fields.folder.name
    }
    if (fields.assignee !== undefined) {
      next.assignee = fields.assignee
      form.assignee = fields.assignee.name
    }
    if (fields.due !== undefined) next.due = fields.due

    /*
    Everything else the card can edit, kept whole.

    This patcher knew five fields and silently dropped the rest, so steps,
    notes, links and attachments typed into an inline card were reported
    upward, discarded here, and gone the moment the same task was opened in
    the sidebar (Imran, 2026-08-22). The five it knew are the ones a *row*
    also draws, which is why they are mapped by hand; the rest belong to the
    card alone and ride in `detail` untouched — see the note on
    `TaskRowProps.detail`.

    The step *count* is derived rather than stored beside the list, because a
    count kept separately is a count that will disagree with the steps it is
    counting.
    */
    const { title, important, folder, assignee, due, ...detail } = fields
    void title
    void important
    void folder
    void assignee
    void due
    if (Object.keys(detail).length) {
      next.detail = { ...task.detail, ...detail }
      if (detail.steps) {
        next.steps = detail.steps.length
          ? {
              complete: detail.steps.filter((step) => step.done).length,
              total: detail.steps.length,
            }
          : undefined
      }
      if (detail.notes !== undefined) next.notes = detail.notes
      if (detail.comments !== undefined) next.comments = detail.comments
    }

    updateTask(taskId, {
      ...next,
      form: { ...task.form, ...form },
    })

    /*
    And the log, from the one place every edit already passes through.

    Every change to a task — a title, a star, a folder, a step, a note —
    arrives here, so this is where the history can be written once instead of
    at the two dozen call sites that reach it. None of these push an Undo bar:
    the change is visible where you made it, and a bar over every keystroke
    would be worse than no bar at all.

    **Naming a blank task is creating it, not renaming it.** The floating
    button makes the task the moment it opens the surface, so without this the
    commonest way to make a task would leave two lines in its history —
    `Created "Untitled"` and `Renamed to "Book the flights"` — describing one
    act. `createTask` holds the other half of the same rule and stays quiet
    when it has no name to record.
    */
    if (fields.title !== undefined && fields.title !== task.title) {
      record({
        kind: "task",
        subject: taskId,
        name: fields.title,
        verb: task.title ? "renamed" : "created",
        detail: task.title ? `from “${task.title}”` : undefined,
      })
    } else if (Object.keys(fields).some((key) => !OWNED_ELSEWHERE.has(key))) {
      record({ kind: "task", subject: taskId, name: task.title, verb: "edited" })
    }
  }

  /*
  Creating a task, for real.

  Every "New task" path in this shell used to end at `setTaskFormOpen(true)`,
  and nothing has rendered that since V3 deleted the form — DES-093 put the
  task inside its own row, so there is no sheet left to open. The floating
  button, the calendar's empty cells and every quick-add escalation were
  therefore setting state and doing nothing, which is finding SH1 and what
  Imran meant by "the button does not open anything".

  **All eight of those paths run through here now** — F5, 2026-08-22, after
  Imran found two of the survivors: "the + inside the days does not open a new
  task dialog", and the quick-add row's options icon "is not functional and do
  not open the new task in a sidebar or dialog". F4 had wired the floating
  button and left the rest, so the fault looked fixed from the one place
  anybody had checked. The state behind them — `taskFormOpen` and four
  companions — was set in eight places and read in none, so it is gone with
  them; state nothing renders is a promise nothing keeps.

  What replaces it follows from the same ruling: if a task *is* its card, then
  making one means making it and opening it. So this inserts a real task with
  the entry defaults of 9.3 and opens it in the surface, where the title is
  waiting to be typed. The person lands inside the thing they just made rather
  than in front of a form that promises one.

  `folder` and the overrides are how a page says where the task lands, which
  is Imran's second question about that button. A page with sections passes
  its section's context, exactly as the folder page's two quick-adds do.
  */
  /*
  Making a task, with or without opening it afterwards.

  The two are one act with a different ending, and the ending depends on where
  the person was: a floating button has taken no title, so the surface *is* the
  form; a board column's capture row has already taken one, so opening a
  surface over the board would interrupt somebody who is plainly mid-flow. One
  maker, two callers (DES-163).
  */
  const createTask = (
    folder: string,
    overrides: Partial<TaskFormData> = {},
    title = "",
    /* Fields that live on the task rather than in its form — today it is
       `myDayGroup`, which is how a task belongs to Today. */
    seed: Partial<ShellTask> = {},
  ) => {
    const id = `task-${Date.now()}`
    const dueDate = overrides.dueDate ?? ""
    setTasks((current) => [
      ...current,
      {
        id,
        folder: {
          name: folder,
          color: formFolderColors[folder] ?? "var(--color-graphite-900)",
        },
        /*
        The row's own due label, derived from the date rather than left for
        somebody to set a second time.

        It was not, and the seam showed the moment the calendar's cells were
        wired to this: a task created on the 27th arrived with `dueDate` on
        its record and **"No date"** on the chip beside it, because the record
        and the row carry the date separately and only one of them was being
        written. One fact in two fields is a fact that will disagree with
        itself; `dueLabelFor` is the same function the pickers use, so a task
        made here reads exactly like one that was always there.
        */
        due: dueDate ? dueLabelFor(parseIsoDate(dueDate)) : undefined,
        important: overrides.important ?? false,
        title,
        form: createTaskForm(id, title, folder, { dueDate: "", ...overrides }),
        ...seed,
      },
    ])
    /* Quiet when there is no name yet: the other half of the rule in
       `patchTaskFromCard` — a task is created when it is called something. */
    if (title) {
      record({ kind: "task", subject: id, name: title, verb: "created" })
    }
    return id
  }

  const createTaskAndOpen = (
    folder: string,
    overrides: Partial<TaskFormData> = {},
    seed: Partial<ShellTask> = {},
  ) => {
    setShellSurface({
      id: createTask(folder, overrides, "", seed),
      mode: taskSurfacePreference(),
    })
  }
  useEffect(() => {
    function handleSearchShortcut(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      const opensWithCommand = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k"
      const opensWithSlash = event.key === "/" && !isTyping

      if (!opensWithCommand && !opensWithSlash) return
      event.preventDefault()
      setSearchOpen(true)
    }

    window.addEventListener("keydown", handleSearchShortcut)
    return () => window.removeEventListener("keydown", handleSearchShortcut)
  }, [])
  const updateTask = (taskId: string, update: Partial<ShellTask>) => {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, ...update } : task,
      ),
    )
  }

  /*
  Reversible acts, registered where they happen.

  Every screen already routes its destructive and semi-destructive gestures
  through these three, so registering the inverse here gives undo to Today,
  Scheduled, Assignments, Important, All, Done, every folder and every surface
  at once — and to the next page somebody writes, which is the half that
  matters (DES-154). A screen that had to remember to call `pushUndo` is a
  screen that will forget.

  The inverse is taken from the task *as it was*, captured before the write,
  rather than recomputed afterwards: "put the status back to pending" is wrong
  for a task that was abandoned before it was completed, and the only thing
  that knows which is the record that just changed.
  */
  /*
  Every object starts with the line that says it exists (DES-209).

  Once, into an empty store. Without it the Activity control is correct and
  invisible on a fresh browser — nothing has happened to anything — which is
  indistinguishable from the control not being built.
  */
  useEffect(() => {
    seedHistory([
      ...shellTaskFixtures.map((task) => ({
        kind: "task" as const,
        subject: task.id,
        name: task.title,
        at: Date.parse(task.form.createdAt ?? "") || FIXTURE_BIRTHDAY,
        actor: task.form.createdBy,
      })),
      ...folderLibrary().map((folder) => ({
        kind: "folder" as const,
        subject: folder.name,
        name: folder.name,
        at: FIXTURE_BIRTHDAY,
      })),
      /* Shelves too, or their Activity control is the one that draws nothing
         while every other object has a line (DES-216). */
      ...availableFolderLabels.map((label) => ({
        kind: "shelf" as const,
        subject: label,
        name: label,
        at: FIXTURE_BIRTHDAY,
      })),
    ])
  }, [])

  /*
  A folder was duplicated somewhere, so its contents follow.

  The shell is the only holder of the task list, and one of the three surfaces
  that can raise Duplicate — the sidebar row, through `app-shell` — has no way
  to reach it. So the act announces and this answers, which is the arrangement
  `prototype-delete-folder` already uses.

  The undo takes back the whole act in one press: the folder and every task
  copied into it. Two entries would have meant two presses to undo one thing.
  */
  useEffect(() => {
    function onDuplicate(event: Event) {
      const request = (event as CustomEvent<DuplicateRequest>).detail
      if (request.kind === "task") {
        /*
        A task's copy, by the same rules as a folder's contents: unstarted,
        unassigned, and re-dated if its deadline is spent (`lib/folder-duplicate`
        holds them, and holds them once).

        It lands beside the original rather than at the end, because a copy you
        cannot see is one you assume did not happen.
        */
        const source = tasks.find((task) => task.id === request.subject)
        if (!source) return
        const copy = duplicateTask(source)
        setTasks((current) => {
          const at = current.findIndex((task) => task.id === source.id)
          const next = [...current]
          next.splice(at + 1, 0, copy)
          return next
        })
        saveCopiedTasks([...readCopiedTasks<ShellTask>(), copy])
        record({
          kind: "task",
          subject: copy.id,
          name: copy.title,
          verb: "created",
          detail: `from “${source.title}”`,
          undo: () => {
            setTasks((live) => live.filter((task) => task.id !== copy.id))
            saveCopiedTasks(
              readCopiedTasks<ShellTask>().filter((task) => task.id !== copy.id),
            )
          },
        })
        return
      }
      const { from, to } = request
      /* Computed out here rather than inside the updater: writing the layout
         and pushing a history entry are effects, and a state updater is called
         twice in development, which would have written the copy's history
         twice for one press. */
      const { tasks: copied, shiftedDays } = copyFolderContents(from, to, tasks)
      setTasks((current) => [...current, ...copied])
      saveCopiedTasks([...readCopiedTasks<ShellTask>(), ...copied])
      record({
        kind: "folder",
        subject: to,
        name: to,
        verb: "created",
        detail: shiftedDays
          ? `from ${from}, dates moved to start today`
          : `from ${from}`,
        undo: () => {
          const ids = new Set(copied.map((task) => task.id))
          setTasks((live) => live.filter((task) => !ids.has(task.id)))
          saveCopiedTasks(
            readCopiedTasks<ShellTask>().filter((task) => !ids.has(task.id)),
          )
          saveCreatedFolders(
            readCreatedFolders().filter((folder) => folder.name !== to),
          )
          window.dispatchEvent(
            new CustomEvent("dana:prototype-delete-folder", { detail: { name: to } }),
          )
        },
      })
    }
    window.addEventListener(PROTOTYPE_DUPLICATE_EVENT, onDuplicate)
    return () => window.removeEventListener(PROTOTYPE_DUPLICATE_EVENT, onDuplicate)
  }, [tasks])

  /* Save as workflow, answered here because the file needs the task list
     (DES-206). Same seam as Duplicate, same reason. */
  useEffect(() => {
    function onSave(event: Event) {
      const { name } = (event as CustomEvent<{ name: string }>).detail
      const file = folderToWorkflow(name, tasks)
      saveWorkflowFile(file)
      /* Says what travelled, in the terms somebody about to send the file
         cares about. Not "no people": the prose on a page is the author's own
         writing and may name anybody — what is left behind is every *field*
         about a person, which is a different and checkable claim. */
      notice(
        `${name} saved as a workflow — ${file.tasks.length} task${
          file.tasks.length === 1 ? "" : "s"
        } and the page, without dates, assignees or comments`,
      )
    }
    window.addEventListener(PROTOTYPE_WORKFLOW_EVENT, onSave)
    return () => window.removeEventListener(PROTOTYPE_WORKFLOW_EVENT, onSave)
  }, [tasks])

  /*
  A workflow, back into a folder.

  It arrives as a new folder rather than merging into one, which is the
  decision `lib/workflow` records: merging raises a question with no good
  answer — what happens to a section that exists in both — and somebody who
  wanted a merge can import and then move things, which is a sequence they can
  see.
  */
  const importWorkflow = (text: string) => {
    const parsed = parseAnyWorkflow(text)
    if (!parsed) {
      notice("That file is not a Dana workflow")
      return
    }
    /* A shelf's file makes a shelf: its page, plus the folders it named —
       joining the ones you already have rather than duplicating them
       (DES-216). */
    if (parsed.kind === "shelf") {
      /*
      Unique among **shelves**, not among folders (DES-216).

      `availableFolderName` asks the folder library, which knows nothing about
      labels — so importing a shelf called Personal when one already existed
      reused the name and quietly merged two arrangements into one. A folder and
      a shelf may share a name; two shelves may not.
      */
      const takenShelves = new Set(availableFolderLabels)
      let label = parsed.file.name
      let nth = 2
      while (takenShelves.has(label)) label = `${parsed.file.name} ${nth++}`
      const { join, create } = applyShelfWorkflow(
        parsed.file,
        label,
        shelfKey(label),
      )
      const made = create.map((folderName) => ({
        name: folderName,
        pending: 0,
        color: "var(--color-graphite-900)",
      }))
      if (made.length) saveCreatedFolders([...readCreatedFolders(), ...made])
      savePrototypeFolderMemberships(
        Object.fromEntries(
          [...join, ...create].map((folderName) => [
            folderName,
            { label, color: null },
          ]),
        ),
      )
      record({
        kind: "shelf",
        subject: label,
        name: label,
        verb: "created",
        detail: "from a workflow",
      })
      notice(
        `${label} created — ${join.length} folder${join.length === 1 ? "" : "s"} joined, ` +
          `${create.length} made`,
      )
      navigateToShelf(label)
      return
    }
    const workflow = parsed.file
    const name = availableFolderName(workflow.name)
    const stamp = Date.now()
    const seeds = applyWorkflow(workflow, name, (index) => `task-${stamp}-${index}`)
    saveCreatedFolders([
      ...readCreatedFolders(),
      { name, pending: seeds.length, color: workflow.color ?? "var(--color-graphite-900)" },
    ])
    /*
    Everything the file carried, put back (DES-209).

    The notes, the star, the repeat, the checklist and whether each item on it
    was ticked — Imran's line is people and dates, and nothing else. The task's
    own state comes back too, which is what makes this a *save* of a folder
    rather than a fresh run of it; duplicate is the act with the other rule.
    */
    const made: ShellTask[] = seeds.map((seed) => ({
      id: seed.id,
      title: seed.title,
      folder: { name, color: workflow.color ?? "var(--color-graphite-900)" },
      status: seed.status ?? "pending",
      important: seed.important || undefined,
      steps: seed.steps.length
        ? {
            complete: seed.steps.filter((step) => step.done).length,
            total: seed.steps.length,
          }
        : undefined,
      form: {
        ...createTaskForm(seed.id, seed.title, name, { dueDate: "" }),
        notes: seed.notes,
        important: seed.important,
        reminder: seed.reminder,
        repeat: seed.repeat,
        repeatDays: seed.repeatDays,
        repeatInterval: seed.repeatInterval,
        repeatMonthlyDay: seed.repeatMonthlyDay,
        repeatEnds: seed.repeatEnds,
        /* No assignee: the work is the importer's, the way a task they typed
           would be (DES-206). */
        steps: seed.steps.map((step, index) => ({
          id: index + 1,
          title: step.title,
          done: step.done,
        })),
      },
    }))
    setTasks((current) => [...current, ...made])
    saveCopiedTasks([...readCopiedTasks<ShellTask>(), ...made])
    record({
      kind: "folder",
      subject: name,
      name,
      verb: "created",
      detail: "from a workflow",
      undo: () => {
        const ids = new Set(made.map((task) => task.id))
        setTasks((live) => live.filter((task) => !ids.has(task.id)))
        saveCopiedTasks(readCopiedTasks<ShellTask>().filter((task) => !ids.has(task.id)))
        saveCreatedFolders(readCreatedFolders().filter((folder) => folder.name !== name))
        window.dispatchEvent(
          new CustomEvent("dana:prototype-delete-folder", { detail: { name } }),
        )
      },
    })
    navigateToFolder(name)
  }

  /*
  One act on one task: written, recorded, and offered back.

  It used to take the bar's sentence as a string, which meant every caller
  wrote its own wording and the history — when it arrived — would have been a
  second set of strings saying the same things slightly differently. It takes
  the **verb** now, and both the sentence and the log line are derived from it
  (lib/history). So an act cannot be recorded and unlabelled, or labelled and
  unrecorded: there is one call and it does all three.

  This is DES-154 at the mutator rather than the screen. Five acts pass through
  here, and adding the sixth cannot forget the log.
  */
  const reversibly = (
    taskId: string,
    verb: HistoryVerb,
    write: () => void,
    detail?: (task: ShellTask) => string,
  ) => {
    const before = tasks.find((task) => task.id === taskId)
    write()
    if (!before) return
    /*
    A delete moves the task rather than ending it (DES-200).

    Here rather than in `deleteTask`, for the reason this function keeps
    earning: the row's menu, the card's footer and the board can all delete,
    and a Trash that depended on each of them remembering would be a safety net
    with holes in the shape of whichever path nobody thought about. The verb
    already says which act this is; the net follows the verb.
    */
    if (verb === "deleted") {
      trash({
        kind: "task",
        subject: taskId,
        name: before.title,
        from: before.folder?.name,
        payload: before,
      })
    }
    record({
      kind: "task",
      subject: taskId,
      name: before.title,
      verb,
      detail: detail?.(before),
      undo: () =>
        setTasks((current) => {
          /* A deleted task is absent, so restoring is an insert; anything else
             is a replace. One branch, decided by what is actually there. */
          return current.some((task) => task.id === taskId)
            ? current.map((task) => (task.id === taskId ? before : task))
            : [...current, before]
        }),
    })
  }

  const setTaskCompleted = (taskId: string, completed: boolean) => {
    const completionTime = completed
      ? new Date().toISOString()
      : undefined

    reversibly(
      taskId,
      completed ? "completed" : "reopened",
      () =>
        setTasks((current) =>
          current.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  status: completed ? "completed" : "pending",
                  completedAt: completionTime,
                  form: {
                    ...task.form,
                    completedAt: completionTime,
                    completedBy: completed ? "Imran Wafa" : undefined,
                  },
                }
              : task,
          ),
        ),
    )
  }
  /* The three acts a person most regrets, each one press from a menu. */
  const abandonTask = (taskId: string) =>
    reversibly(
      taskId,
      "abandoned",
      () => updateTask(taskId, { status: "abandoned" }),
    )
  const deleteTask = (taskId: string) =>
    reversibly(
      taskId,
      "deleted",
      () => setTasks((current) => current.filter((task) => task.id !== taskId)),
    )
  const removeTaskFromToday = (taskId: string) =>
    reversibly(
      taskId,
      "removed",
      () => updateTask(taskId, { hiddenFromMyDay: true, pulled: false }),
      () => `from ${isNavV2 ? "Today" : "My Day"}`,
    )
  /*
  A card dropped in another column of a derived board.

  On a folder the columns are sections, which is that page's own business
  (DES-174). Everywhere else the columns *are* the values of the axis being
  grouped by, so landing in one means taking that value: another folder,
  another person, another day. The board hit-tests and reports the column;
  this is where the column turns into an act (DES-177).

  Overdue is the one column that is not a value — it is a *relation* to today,
  and "make this overdue" is not something anybody means — so it refuses the
  drop rather than inventing a date.
  */
  /*
  A card dropped in another column, decided once and then performed once.

  Each branch used to mutate and return on the spot, which had two costs that
  are really one. **A drop could not be undone** — the single most mis-aimed
  gesture in the product, a card let go over the wrong column, and nothing in
  the corner to take it back. And when the history arrived there would have
  been four places to remember to write it.

  So a branch now only *decides*: it answers what this drop means and how to
  say it, and the one tail performs it through `reversibly`, which writes the
  change, records the move and offers it back. Four decisions, one act.
  */
  const plannedMove = (
    task: ShellTask,
    groupKey: string,
  ): { detail: string; write: () => void } | null => {
    if (pageFilters.groupBy === "folder") {
      if (task.folder?.name === groupKey) return null
      /* The colour comes from the real library, never invented here — the
         one place a folder's look is answered (DES-155). */
      const folder = folderLibrary().find(
        (candidate) => candidate.name === groupKey,
      )
      if (!folder) return null
      return {
        detail: `to ${folder.name}`,
        write: () =>
          patchTaskFromCard(task.id, {
            folder: { name: folder.name, color: folder.color },
          }),
      }
    }

    if (pageFilters.groupBy === "person") {
      if (groupKey === "unassigned") {
        return {
          detail: "to nobody",
          write: () =>
            updateTask(task.id, {
              assignee: undefined,
              form: { ...task.form, assignee: "" },
            }),
        }
      }
      /* The column key is whatever the task carried — a full name from the
         card or a first name from the form — so the match is on the first
         name, the same reading `GroupedList` uses to put a face on the
         heading. */
      const person = PEOPLE.find(
        (candidate) => firstName(candidate.name) === firstName(groupKey),
      )
      if (!person) return null
      return {
        detail: `to ${person.name}`,
        write: () => patchTaskFromCard(task.id, { assignee: person }),
      }
    }

    if (pageFilters.groupBy === "date") {
      if (groupKey === "overdue") return null
      const next = groupKey === "none" ? "" : groupKey
      const due = next ? dueLabelFor(parseIsoDate(next)) : undefined
      return {
        detail: due ? `to ${due.label.replace(/^Due /, "")}` : "off the calendar",
        write: () =>
          updateTask(task.id, { due, form: { ...task.form, dueDate: next } }),
      }
    }

    return null
  }

  const moveTaskToGroup = (taskId: string, groupKey: string) => {
    const task = tasks.find((candidate) => candidate.id === taskId)
    if (!task) return false
    const move = plannedMove(task, groupKey)
    if (!move) return false
    reversibly(taskId, "moved", move.write, () => move.detail)
    return true
  }

  /*
  What a task made *on this page* starts as — spec 9.3's entry defaults, and
  a stronger rule than the phrase suggests.

  **A task made on a page has to belong to that page.** The defaults are not a
  convenience, they are whatever satisfies `pageSpine` above — because a
  capture point that makes something the page then hides is worse than no
  capture point at all: you type, you press Enter, and nothing appears.

  It was wrong, and only the surface hid it. The floating button on Today set a
  due date and nothing else, but Today's spine is `myDayGroup`, not the date —
  so the task was made, opened in a surface, and was **not on Today when the
  surface closed**. Scheduled would have been worse still: its spine is having
  a due date, and the button gave it none. Nobody saw either fault because the
  button opened a surface over the page it had just failed to add to; the
  board's capture rows, which add in place, made it visible in a minute.

  So the defaults are derived from the spine, page by page, and the two capture
  points share them: the button and every board column, with a column adding
  its own value on top rather than instead — a task typed into Sara's column on
  Important is Sara's *and* starred.
  */
  const pageEntryDefaults: Partial<TaskFormData> = {
    /* Today and Scheduled both need a date; every other page's spine is
       indifferent to one, and Tasks and Anytime are defined by *not* having
       one, so an empty string is the only honest default there. */
    dueDate: isToday || isPlanned ? "2026-08-10" : "",
    important: isImportant,
  }
  /* Today's membership is its own field, and it is the only page whose spine
     asks for something the form cannot say. */
  const pageEntrySeed: Partial<ShellTask> = isToday ? { myDayGroup: "today" } : {}

  /*
  Capture inside a board column, with that column's value already set.

  The column names where the task will land, which is exactly what W5 asks a
  capture point to do and what a floating button cannot — so this is the
  board's answer to "one always-visible capture point per page" (DES-133), and
  it is why the button leaves in board view.
  */
  const addTaskInGroup = (groupKey: string, title: string) => {
    const overrides: Partial<TaskFormData> = { ...pageEntryDefaults }
    if (pageFilters.groupBy === "person") {
      const person = PEOPLE.find(
        (candidate) => firstName(candidate.name) === firstName(groupKey),
      )
      overrides.assignee = groupKey === "unassigned" ? "" : (person?.name ?? "")
    }
    if (pageFilters.groupBy === "date") {
      overrides.dueDate = groupKey === "none" ? "" : groupKey
    }
    createTask(
      pageFilters.groupBy === "folder" ? groupKey : "Desk",
      overrides,
      title,
      pageEntrySeed,
    )
  }

  /* One folder, by name — the same address `folderLink` copies, so the URL a
     search result navigates to and the URL a person sends are one string. */
  const navigateToFolder = (name: string) => {
    const nextUrl = new URL(window.location.href)
    nextUrl.search = ""
    nextUrl.searchParams.set("state", "folder")
    nextUrl.searchParams.set("folder", name)
    window.location.assign(nextUrl)
  }

  /*
  The words on a folder that are not its name.

  Its description and every paragraph on its page. Without this a folder is
  findable only by a name you already remember, which is the opposite of what
  a search is for — and the prose on a page was the largest body of writing in
  Dana that nothing could reach.
  */
  const folderHaystack = (name: string) => {
    type Block = {
      kind: string
      paragraph?: { text: string }
      section?: { name: string }
      image?: { caption: string }
    }
    const layout = readFolderLayout<Block>(name)
    /*
    Everything written on this folder (DES-209).

    Imran's list was "foldernames, group of folders, task steps, sections,
    paragraphs, notes, even messages". Sections and captions were the two the
    first pass missed for the same reason: the filter asked for paragraphs by
    name instead of asking each block for its words. Asking the block means the
    next kind of block is searchable the day it is added rather than the day
    somebody remembers this line.
    */
    return [
      folderPresentation.identity[name]?.description,
      ...(layout?.items ?? []).map((item) =>
        item.paragraph?.text ?? item.section?.name ?? item.image?.caption ?? "",
      ),
      /* And what people said on it. A message is kept out of a *workflow*
         because that file leaves; finding a word somebody wrote to you, inside
         your own account, is the opposite case (DES-209). */
      folderThreadWords(name),
    ]
      .filter(Boolean)
      .join(" ")
  }

  /* A shelf's page, addressed like a folder's: one param for the state and
     one for the thing (DES-207). */
  /* A shelf's file: its page and the names of the folders on it, never those
     folders' contents — see the note in lib/workflow (DES-210). */
  const saveShelfWorkflow = (label: string) => {
    const on = folderLibrary()
      .filter(
        (folder) =>
          folderShelf(folder.name, baseShelfLabels(shellFolderGroups), folderMemberships) ===
          label,
      )
      .map((folder) => folder.name)
    saveShelfWorkflowFile(shelfToWorkflow(shelfKey(label), label, on))
    notice(
      `${label} saved as a workflow — the page and ${on.length} folder${
        on.length === 1 ? "" : "s"
      } by name`,
    )
  }

  /*
  A shelf's copy: the label and its page, no folders (DES-210).

  Answered here because the new label has to reach the shelf list the sidebar
  draws, and only the shell holds that.
  */
  useEffect(() => {
    function onDuplicate(event: Event) {
      const { label } = (event as CustomEvent<{ label: string }>).detail
      const taken = new Set(availableFolderLabels)
      let name = `${label} copy`
      let n = 2
      while (taken.has(name)) name = `${label} copy ${n++}`
      const from = shelfKey(label)
      const to = shelfKey(name)
      const layout = readFolderLayout<unknown>(from)
      if (layout) saveFolderLayout(to, { items: layout.items, assign: {} })
      const identity = readPrototypeFolderPresentation().identity[from]
      if (identity) savePrototypeFolderIdentity(to, identity)
      record({
        kind: "shelf",
        subject: name,
        name,
        verb: "created",
        detail: `from ${label}`,
      })
      notice(`${name} created — the page, with no folders on it yet`)
      navigateToShelf(name)
    }
    window.addEventListener(PROTOTYPE_SHELF_DUPLICATE_EVENT, onDuplicate)
    return () =>
      window.removeEventListener(PROTOTYPE_SHELF_DUPLICATE_EVENT, onDuplicate)
  })

  const navigateToShelf = (label: string) => {
    const nextUrl = new URL(window.location.href)
    nextUrl.search = ""
    nextUrl.searchParams.set("state", "shelf")
    nextUrl.searchParams.set("shelf", label)
    window.location.assign(nextUrl)
  }

  /*
  Renaming a shelf (DES-218).

  A shelf's name *is* its membership label — there is no shelf record to put a
  new name on — so the rename rewrites the label on every member folder, moves
  the page's stores to the new key (cover, icon, description, blocks travel),
  carries any tab that names it, records the act, and follows the page to its
  new address. The field on the page reported the rename before and nothing
  answered it, which is why it "didn't work": the identity store took a name
  nothing reads, and the label — the actual name — never changed.
  */
  const renameShelf = (from: string, to: string) => {
    const next = to.trim()
    if (!next || next === from) return
    if (availableFolderLabels.includes(next)) {
      notice(`A shelf called ${next} already exists`)
      return
    }
    const members = folderLibrary().filter(
      (folder) =>
        folderShelf(
          folder.name,
          baseShelfLabels(shellFolderGroups),
          folderMemberships,
        ) === from,
    )
    savePrototypeFolderMemberships(
      Object.fromEntries(
        members.map((folder) => [
          folder.name,
          { label: next, color: folder.color ?? null },
        ]),
      ),
    )
    moveShelfPage(from, next)
    if (tabIds.includes(`shelf:${from}`)) {
      persistTabs(
        tabIds.map((id) => (id === `shelf:${from}` ? `shelf:${next}` : id)),
      )
    }
    record({
      kind: "shelf",
      subject: next,
      name: next,
      verb: "renamed",
      detail: `from “${from}”`,
    })
    navigateToShelf(next)
  }

  const navigateToPage = (nextPage: ShellPageName) => {
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete("state")
    nextUrl.searchParams.delete("folder-page")
    /* And the folder that is no longer open, with whatever was being asked of
       it. Leaving those behind is how `?folder-action=delete` survived a
       navigation and sat in the address bar pointing at a folder nobody was
       looking at. */
    nextUrl.searchParams.delete("folder")
    nextUrl.searchParams.delete("folder-action")
    nextUrl.searchParams.delete("shelf")
    nextUrl.searchParams.delete("task")
    if (nextPage !== "My Day" && nextPage !== "Desk") {
      nextUrl.searchParams.set("page", nextPage.toLowerCase())
    } else {
      nextUrl.searchParams.delete("page")
    }
    window.location.assign(nextUrl)
  }

  return (
    /* Every card under here writes through one path, whether it is drawn
       inline in a row, in the sidebar, in a dialog or as a tab — they are
       views of one task and must not each keep a copy. See lib/task-writer. */
    <TaskWriter patch={patchTaskFromCard}>
      <AppShell
      activePage={activePage}
      onImportWorkflow={importWorkflow}
      onOpenFolderInTab={openFolderTab}
      onSaveShelfWorkflow={saveShelfWorkflow}
      onOpenShelf={navigateToShelf}
      activeFolder={isFolder ? selectedFolderName : undefined}
      corePagesOnly={state === "compact"}
      offline={state === "offline" || state === "offline-update"}
      showUpdate={state === "update" || state === "offline-update"}
      systemToast={
        toastState === "offline" || toastState === "error" || toastState === "rate-limit"
          ? toastState === "offline"
            ? "offline-write"
            : toastState
          : undefined
      }
      avatarMenuOpen={state === "avatar"}
      /*
      Abandoned has no capture at all, and for DES-182's reason rather than
      W5's: a task made there would arrive pending, and the page holds only
      what has been given up — so it would be filtered off the page it was
      made on. The same silent fault the Today button had, found in the same
      pass and fixed by the same rule.

      W5 asks for **one** always-visible capture point per page, and the
      floating button is the one that leaves wherever a quick-add row already
      exists — because the row says where the task will land and the button
      does not (DES-133, generalised at Imran's word).

      So it survives on exactly the three pages with no capture affordance at
      all: Today, Important and Assignments. A folder page has its blank row;
      All and Tasks have one per section; Scheduled's list has "Add scheduled
      task" and its calendar captures by clicking a day, which spec 9.5
      already defines. Done has none and must not — AC-096.
      */
      /*
      And it leaves in board view, whatever page it is on.

      W5 asks for **one** always-visible capture point per page, and a board
      has one per column — each of which says where the task will land, which
      is the thing the floating button cannot say and the reason it retires
      wherever a capture row exists (DES-133). Keeping it would be exactly the
      duplication that rule was written to remove.
      */
      hideCreate={
        view === "board" ||
        (isNavV2
          ? isAbandoned ||
            !(isImportant || isAssignments || (!isFolder && !isTasks && !isPlanned && !isAll && !isDone && !isUtilityPage))
          : isFolder && folderPageVariant === "v2")
      }
      tabs={tabIds
        .map(tabFor)
        .filter((tab): tab is PageTab => tab !== null)}
      activeTab={
        activeTaskTab ?? (tabIds.includes(currentPlaceId) ? currentPlaceId : null)
      }
      onSelectTab={openTab}
      onCloseTab={closeTab}
      onReorderTabs={reorderTabs}
      onOpenShelfInTab={openShelfTab}
      /* The floating button's entry defaults, per page and per 9.3: it lands
         in Desk, and the page it was pressed on says what else is true —
         Today gives it today's date, Important stars it, Assignments gives it
         to the viewer. */
      onCreateTask={() =>
        createTaskAndOpen("Desk", pageEntryDefaults, pageEntrySeed)
      }
      onCreateTaskForFolder={(folderName) => {
        createTaskAndOpen(folderName)
      }}
      onNavigate={navigateToPage}
      onOpenSearch={() => setSearchOpen(true)}
      pageVisibility={pageVisibility}
      >
        {/* Every window that is a *place* wears the same chrome: the thin
            bar's controls and a cover it can be given (DES-139, DES-141).
            A task is not a place — it is a thing inside one — so a task tab
            gets neither. The folder page brings its own, richer set. */}
        {!activeTaskTab && !isFolder && !isUtilityPage ? (
          <>
            {/*
            One strip for every place-page, from the rule rather than from
            each screen's own idea of what it offers. It sits leftmost because
            a view is the biggest thing you can change about a page, and the
            folder page settled that arrangement first: the view, then the
            filter, then the quiet things.
            */}
            <WindowBarActions order={-2}>
              <ViewStrip
                ariaLabel={`${pageTitle} view`}
                value={view}
                options={pageViews.map((key) =>
                  key === "list"
                    ? { key, label: "List view", icon: List }
                    : key === "board"
                      ? { key, label: "Board view", icon: LayoutGrid }
                      : { key, label: "Calendar view", icon: CalendarDays },
                )}
                /* The grouping follows the view rather than the press — see
                   the effect above, which is where a board with no columns
                   gets them whether it was chosen here or linked to. */
                onSelect={setPageView}
                collapse
              />
            </WindowBarActions>
            <WindowBarActions>
              <FilterControl filters={pageFilters} setFilters={setPageFilters} />
              {/*
              No Activity control here, and the log is the reason rather than
              the cause.

              Today, Important and All are **views, not things**. Nobody edits
              Today; it edits itself as the clock moves. The control's whole
              design is a resting line that states a fact about the object in
              front of you — "Edited 8m ago" — and on a page that cannot be
              edited there is no true sentence for it to say. It was saying
              "Edited just now" over two invented lines on every one of these
              pages.

              What a person actually wants here is "what did I finish", and
              Done is the page that answers it. So this goes rather than being
              rewired to a plausible-looking feed of whatever happened to
              today's rows.
              */}
              {/*
              Hiding a page from the page itself — Imran, 2026-08-22: "an
              overflow with the native folderpages to have options of hiding
              a page."

              Settings is where you see the whole list and turn things back
              on; this is where you act on the one in front of you, which is
              where the thought occurs. The two write the same store, so
              neither is a second copy of the decision — and Desk has no
              menu item at all rather than a disabled one, because it cannot
              be hidden and a greyed control invites a question with no
              answer.
              */}
              {activePage && NAV_PAGES.some(
                (page) => page.name === activePage && page.hideable !== false,
              ) ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        aria-label={`More actions for ${activePage}`}
                        className={stripButtonClass(false)}
                      >
                        <MoreHorizontal className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    }
                  />
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      onClick={() => {
                        setPagePinned(activePage as NavPageName, false)
                        navigateToPage(isNavV2 ? "Today" : "My Day")
                      }}
                    >
                      <EyeOff />
                      Hide from the sidebar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigateToPage("Settings")}>
                      <Settings />
                      Manage views…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </WindowBarActions>
            <PageCover storageName={pageTitle} />
          </>
        ) : null}
        {(() => {
          /* A selected task tab replaces the page below the strip: the same
             task page at the reading measure — the tab presentation of
             DES-117's one form, composed rather than borrowed (DES-136).
             The tab strip already carries the close, so the page has none. */
          const tabTask = activeTaskTab
            ? tasks.find((task) => task.id === activeTaskTab)
            : undefined
          if (!tabTask) return null
          return (
            <div className="mx-auto w-full max-w-[var(--content-list)] px-10 py-6">
              <TaskPage
                key={tabTask.id}
                inWindow
                task={{
                  ...tabTask,
                  onToggleComplete: (completed) =>
                    setTaskCompleted(tabTask.id, completed),
                  onToggleImportant: () =>
                    updateTask(tabTask.id, {
                      important: !tabTask.important,
                      form: { ...tabTask.form, important: !tabTask.important },
                    }),
                  /* A tab is a surface too, and outlives navigation — so it
                     needs the write path even more than the dialog does. */
                  onPatch: (fields) => patchTaskFromCard(tabTask.id, fields),
                  /* Abandon and Delete reach the tab for the first time. The
                     floating surface was given them at F5 and the tab was
                     not, so the same page could do less to a task depending
                     on which window it was in. Either closes the tab, because
                     the thing it was showing has left the list. */
                  onAbandon: () => {
                    abandonTask(tabTask.id)
                    closeTab(tabTask.id)
                  },
                  onDelete: () => {
                    deleteTask(tabTask.id)
                    closeTab(tabTask.id)
                  },
                }}
              />
            </div>
          )
        })() ?? (isGrouped ? (
          /*
          Grouping replaces a page's own arrangement rather than nesting
          inside it (DES-153, and `grouped-screen.tsx` carries the reasoning).
          One branch here rather than a grouping added to each of the six
          screens: the page keeps its head, its cover and its bar, and the one
          thing you asked to change is the one thing that changes.
          */
          <GroupedScreen
            storageName={pageTitle}
            icon={PageIcon}
            title={pageTitle}
            description={isNavV2 ? pageQuestion(pageTitle) : undefined}
            filters={pageFilters}
            tasks={applyView(tasks, pageFilters).filter(
              (task) =>
                pageSpine(task) && (isDone || task.status !== "completed"),
            )}
            /* Done's whole subject is finished work, so it has no second
               block of it to close the page with. */
            completed={
              isDone || isAbandoned || isAnytime
                ? []
                : applyView(tasks, pageFilters).filter(
                    (task) => pageSpine(task) && task.status === "completed",
                  )
            }
            previewState={state}
            shape={view === "board" ? "board" : "list"}
            /* The page's own half of DES-183: Important is the star, Done is
               finished, whatever either of them is grouped by. */
            pageGiven={{ important: isImportant, due: isDone }}
            onOpenTask={openTask}
            onToggleComplete={setTaskCompleted}
            onToggleImportant={(taskId) => {
              const task = tasks.find((entry) => entry.id === taskId)
              if (!task) return
              updateTask(taskId, {
                important: !task.important,
                form: { ...task.form, important: !task.important },
              })
            }}
            onMoveToGroup={moveTaskToGroup}
            /* Done and Abandoned are states, not places: a task made there
               would have to arrive finished or given up, which is not
               something anybody means. AC-096 already says Done has no
               capture; Abandoned is the same argument. */
            onAddInGroup={isDone || isAbandoned ? undefined : addTaskInGroup}
            /* A column you can add is a column that is a thing: a folder is,
               a person is not, and every date already exists (DES-177). */
            onAddColumn={
              pageFilters.groupBy === "folder" && !isDone && !isAbandoned
                ? () => {
                    const url = new URL(window.location.href)
                    url.searchParams.set("new-folder", "open")
                    window.location.assign(url)
                  }
                : undefined
            }
          />
        ) : isAssignments ? (
          <AssignmentsScreen
            completed={applyView(tasks, pageFilters).filter(
              (task) => task.status === "completed",
            )}
            tasks={applyView(tasks, pageFilters)
              .filter((task) => task.status !== "completed")
              .map((task) => ({ ...task, assigneeName: task.form.assignee }))}
            previewState={state}
            onOpenTask={openTask}
            onToggleComplete={setTaskCompleted}
            onToggleImportant={(taskId) => {
              const task = tasks.find((candidate) => candidate.id === taskId)
              if (task) {
                updateTask(taskId, {
                  important: !task.important,
                  form: { ...task.form, important: !task.important },
                })
              }
            }}
          />
        ) : !isDone &&
        !isFolder &&
        !isTasks &&
        !isPlanned &&
        !isImportant &&
        !isAll &&
        !isUtilityPage ? (
          <MyDayScreen
            title={isNavV2 ? "Today" : "My Day"}
            description={isNavV2 ? pageQuestion("Today") : undefined}
            carriedOver={applyView(tasks, pageFilters).filter((task) =>
              task.myDayGroup === "carried" &&
              task.status !== "completed" &&
              task.status !== "abandoned" &&
              !task.hiddenFromMyDay,
            )}
            today={applyView(tasks, pageFilters).filter((task) =>
              task.myDayGroup === "today" &&
              task.status !== "completed" &&
              task.status !== "abandoned" &&
              !task.hiddenFromMyDay,
            )}
            doneToday={applyView(tasks, pageFilters).filter((task) =>
              task.status === "completed" && !task.hiddenFromMyDay,
            )}
            previewState={state}
            onOpenTask={openTask}
            onToggleComplete={setTaskCompleted}
            onToggleImportant={(taskId) => {
              const task = tasks.find((candidate) => candidate.id === taskId)
              if (task) {
                updateTask(taskId, {
                  important: !task.important,
                  form: { ...task.form, important: !task.important },
                })
              }
            }}
            onRemoveFromMyDay={removeTaskFromToday}
            onAbandon={abandonTask}
            onDelete={deleteTask}
          />
        ) : isTasks ? (
          <TasksScreen
            inbox={applyView(tasks, pageFilters).filter(
              (task) =>
                task.tasksGroup === "Desk" && task.status !== "completed",
            ).map((task) => ({ ...task, folder: undefined }))}
            groups={[
              "Office",
              "Business",
              "Home",
              "Travel",
            ].map((name) => ({
              name,
              color:
                formFolderColors[name] ?? "var(--color-graphite-900)",
              tasks: applyView(tasks, pageFilters).filter(
                (task) =>
                  task.tasksGroup === name && task.status !== "completed",
              ).map((task) => ({ ...task, folder: undefined })),
            }))}
            previewState={state}
            onAdd={(folderName, title) => {
              const id = `task-${Date.now()}`
              setTasks((current) => [
                ...current,
                {
                  id,
                  title,
                  tasksGroup: folderName,
                  status: "pending",
                  form: createTaskForm(id, title, folderName, { dueDate: "" }),
                },
              ])
            }}
            onOpenFullForm={(folderName) => {
              createTaskAndOpen(folderName)
            }}
            onOpenTask={openTask}
            onToggleComplete={setTaskCompleted}
            onToggleImportant={(taskId) => {
              const task = tasks.find((candidate) => candidate.id === taskId)
              if (task) {
                updateTask(taskId, {
                  important: !task.important,
                  form: { ...task.form, important: !task.important },
                })
              }
            }}
            onRestore={(taskId) => updateTask(taskId, { status: "pending" })}
            onAbandon={abandonTask}
            onDelete={deleteTask}
          />
        ) : isFolder && folderPageVariant === "v1" ? (
          <FolderScreen
            folderName={selectedFolderDisplayName}
            folderColor={selectedFolderColor}
            folderLabel={selectedFolderLabel}
            availableFolderLabels={availableFolderLabels}
            isShared={isSharedFolder}
            scheduled={
              searchParams.get("folder-state") === "completed-only"
                ? []
                : tasks
                    .filter(
                      (task) =>
                        task.form.folder === selectedFolderName &&
                        Boolean(task.form.dueDate) &&
                        task.status !== "completed",
                    )
                    .map((task) => ({ ...task, folder: undefined }))
            }
            unscheduled={
              searchParams.get("folder-state") === "completed-only"
                ? []
                : tasks
                    .filter(
                      (task) =>
                        task.form.folder === selectedFolderName &&
                        !task.form.dueDate &&
                        task.status !== "completed",
                    )
                    .map((task) => ({ ...task, folder: undefined }))
            }
            completed={tasks
              .filter(
                (task) =>
                  task.status === "completed" &&
                  task.form.folder === selectedFolderName,
              )
              .map((task) => ({ ...task, folder: undefined }))}
            previewState={searchParams.get("folder-state")}
            isOwner={searchParams.get("role") !== "member"}
            isDefault={selectedFolderName === "Desk"}
            initialShareOpen={searchParams.get("share") === "open"}
            initialFolderAction={
              searchParams.get("folder-action") === "rename"
                ? "rename"
                : searchParams.get("folder-action") === "appearance"
                  ? "appearance"
                  : searchParams.get("folder-action") === "delete"
                    ? "delete"
                    : undefined
            }
            onAdd={(section, title) => {
              const id = `task-${Date.now()}`
              const scheduled = section === "scheduled"
              setTasks((current) => [
                ...current,
                {
                  id,
                  title,
                  status: "pending",
                  tasksGroup: scheduled ? undefined : selectedFolderName,
                  folderSection: scheduled ? "scheduled" : "unscheduled",
                  folder: {
                    name: selectedFolderName,
                    color: selectedFolderColor,
                  },
                  due: scheduled ? { label: "Due today" } : undefined,
                  form: createTaskForm(id, title, selectedFolderName, {
                    dueDate: scheduled ? "2026-08-10" : "",
                  }),
                },
              ])
            }}
            onOpenFullForm={(section) => {
              createTaskAndOpen(selectedFolderName, { dueDate: section === "scheduled" ? "2026-08-10" : "", })
            }}
            onOpenTask={openTask}
            onToggleComplete={setTaskCompleted}
            onToggleImportant={(taskId) => {
              const task = tasks.find((candidate) => candidate.id === taskId)
              if (task) {
                updateTask(taskId, {
                  important: !task.important,
                  form: { ...task.form, important: !task.important },
                })
              }
            }}
            onRestore={(taskId) => updateTask(taskId, { status: "pending" })}
            onAbandon={abandonTask}
            onDelete={deleteTask}
            onDeleteFolder={() => {
              /*
              The delete happens here, not only in a listener (DES-208).

              It used to be a dispatch and nothing else, and that worked while
              the only way to raise it was pressing a menu on a page that had
              been open for a while. The sidebar's Delete arrives as a *URL*,
              so the act runs from a mount effect — and React runs a child's
              effects before its parent's, so the page fired the event before
              `AppShell` had attached the listener for it. The event went
              nowhere and the page navigated away: a folder that vanished from
              the screen, reappeared on reload, and left nothing in the Trash.

              A destructive act must not depend on who mounted first. So the
              store is written directly and the event still goes out for the
              bookkeeping only it can do — `deletePrototypeFolder` is
              idempotent, so whichever arrives second changes nothing.
              */
              deletePrototypeFolder(selectedFolderName)
              window.dispatchEvent(
                new CustomEvent("dana:prototype-delete-folder", {
                  detail: { name: selectedFolderName },
                }),
              )
              navigateToPage("My Day")
            }}
            onRenameFolder={(name) =>
              renamePrototypeFolder(selectedFolderName, name)
            }
            onMoveToLabel={(label, color) =>
              savePrototypeFolderMembership(selectedFolderName, {
                label,
                color,
              })
            }
          />
        ) : isFolder ? (
          /* The Notion-page folder concept, the default since 2026-08-18.
             `?folder-page=v1` above keeps the previous screen reachable so
             the two are compared by looking (DES-130 to DES-134). */
          <FolderPageV2
            onOpenFolderInTab={() => openFolderTab(selectedFolderName)}
            /* The instrument the sidebar navigates with. It reached the v1
               page and never this one, so Rename and Delete from a folder row
               did nothing at all (DES-208). */
            initialFolderAction={
              searchParams.get("folder-action") === "rename"
                ? "rename"
                : searchParams.get("folder-action") === "appearance"
                  ? "appearance"
                  : searchParams.get("folder-action") === "delete"
                    ? "delete"
                    : undefined
            }
            storageName={selectedFolderName}
            onOpenInTab={openTaskTab}
            onCopyLink={() => copyFolderLink(selectedFolderName)}
            onDuplicate={() => duplicateFolder(selectedFolderName)}
            folderName={selectedFolderDisplayName}
            folderColor={selectedFolderColor}
            folderLabel={selectedFolderLabel}
            availableFolderLabels={availableFolderLabels}
            isShared={isSharedFolder}
            scheduled={
              searchParams.get("folder-state") === "completed-only"
                ? []
                : tasks
                    .filter(
                      (task) =>
                        task.form.folder === selectedFolderName &&
                        Boolean(task.form.dueDate) &&
                        task.status !== "completed",
                    )
                    .map((task) => ({ ...task, folder: undefined }))
            }
            unscheduled={
              searchParams.get("folder-state") === "completed-only"
                ? []
                : tasks
                    .filter(
                      (task) =>
                        task.form.folder === selectedFolderName &&
                        !task.form.dueDate &&
                        task.status !== "completed",
                    )
                    .map((task) => ({ ...task, folder: undefined }))
            }
            completed={tasks
              .filter(
                (task) =>
                  task.status === "completed" &&
                  task.form.folder === selectedFolderName,
              )
              .map((task) => ({ ...task, folder: undefined }))}
            previewState={searchParams.get("folder-state")}
            isOwner={searchParams.get("role") !== "member"}
            isDefault={selectedFolderName === "Desk"}
            initialShareOpen={searchParams.get("share") === "open"}
            onAdd={(section, title) => {
              const id = `task-${Date.now()}`
              const scheduled = section === "scheduled"
              setTasks((current) => [
                ...current,
                {
                  id,
                  title,
                  status: "pending",
                  tasksGroup: scheduled ? undefined : selectedFolderName,
                  folderSection: scheduled ? "scheduled" : "unscheduled",
                  folder: {
                    name: selectedFolderName,
                    color: selectedFolderColor,
                  },
                  due: scheduled ? { label: "Due today" } : undefined,
                  form: createTaskForm(id, title, selectedFolderName, {
                    dueDate: scheduled ? "2026-08-10" : "",
                  }),
                },
              ])
            }}
            onOpenFullForm={(section) => {
              createTaskAndOpen(selectedFolderName, { dueDate: section === "scheduled" ? "2026-08-10" : "", })
            }}
            onOpenTask={openTask}
            onToggleComplete={setTaskCompleted}
            onToggleImportant={(taskId) => {
              const task = tasks.find((candidate) => candidate.id === taskId)
              if (task) {
                updateTask(taskId, {
                  important: !task.important,
                  form: { ...task.form, important: !task.important },
                })
              }
            }}
            onRestore={(taskId) => updateTask(taskId, { status: "pending" })}
            onAbandon={abandonTask}
            onDelete={deleteTask}
            onDeleteFolder={() => {
              /* Written directly as well as announced — see the note at the
                 other folder page's handler (DES-208). */
              deletePrototypeFolder(selectedFolderName)
              window.dispatchEvent(
                new CustomEvent("dana:prototype-delete-folder", {
                  detail: { name: selectedFolderName },
                }),
              )
              navigateToPage("My Day")
            }}
            onRenameFolder={(name) =>
              renamePrototypeFolder(selectedFolderName, name)
            }
            onMoveToLabel={(label, color) =>
              savePrototypeFolderMembership(selectedFolderName, {
                label,
                color,
              })
            }
          />
        ) : isPlanned ? (
          <PlannedScreen
            view={view === "calendar" ? "calendar" : "list"}
            completed={applyView(tasks, pageFilters).filter(
              (task) => task.status === "completed" && Boolean(task.form.dueDate),
            )}
            title={isNavV2 ? "Scheduled" : "Planned"}
            description={isNavV2 ? pageQuestion("Scheduled") : "Tasks with a due date"}
            tasks={applyView(plannedServerOrder(tasks), pageFilters).map((task) => ({
              ...task,
              date: task.form.dueDate,
              time: task.form.dueTime || undefined,
            }))}
            calendarTasks={tasks
              .filter((task) => Boolean(task.form.dueDate))
              .map((task) => ({
                ...task,
                date: task.form.dueDate,
                time: task.form.dueTime || undefined,
              }))}
            previewState={state}
            initialMode={searchParams.get("mode") === "calendar" ? "calendar" : searchParams.get("mode") === "list" ? "list" : undefined}
            onAdd={(title) => {
              const id = `task-${Date.now()}`
              setTasks((current) => [
                ...current,
                {
                  id,
                  title,
                  status: "pending",
                  folder: {
                    name: "Desk",
                    color: "var(--color-graphite-900)",
                  },
                  due: { label: "Due today" },
                  form: createTaskForm(id, title, "Desk", {
                    dueDate: "2026-08-10",
                  }),
                },
              ])
            }}
            onOpenFullForm={() => {
              createTaskAndOpen("Desk", { dueDate: "2026-08-10" })
            }}
            onCreateAtDate={(date) => {
              createTaskAndOpen("Desk", { dueDate: date })
            }}
            onOpenTask={openTask}
            onOpenGhost={openGhostTask}
            onToggleComplete={setTaskCompleted}
            onToggleImportant={(taskId) => {
              const task = tasks.find((candidate) => candidate.id === taskId)
              if (task) {
                updateTask(taskId, {
                  important: !task.important,
                  form: { ...task.form, important: !task.important },
                })
              }
            }}
            onRestore={(taskId) => updateTask(taskId, { status: "pending" })}
          />
        ) : isImportant ? (
          <ImportantScreen
            completed={applyView(tasks, pageFilters).filter(
              (task) => task.status === "completed" && task.important,
            )}
            tasks={applyView(importantServerOrder(tasks), pageFilters).map((task) => ({
              ...task,
              importantTooltip: task.form.dueDate
                ? `Also in Planned, due ${task.form.dueDate}`
                : `Also in Tasks, in ${task.form.folder}`,
            }))}
            previewState={state}
            onOpenTask={openTask}
            onToggleComplete={setTaskCompleted}
            onToggleImportant={(taskId) => {
              const task = tasks.find((candidate) => candidate.id === taskId)
              if (task) {
                updateTask(taskId, {
                  important: !task.important,
                  form: { ...task.form, important: !task.important },
                })
              }
            }}
            onRestore={(taskId) => updateTask(taskId, { status: "pending" })}
            onAbandon={abandonTask}
            onDelete={deleteTask}
          />
        ) : isAll ? (
          <AllScreen
            planned={applyView(plannedServerOrder(tasks), pageFilters)}
            /* DES-152 makes All the one page that hides nothing — Imran's
               ruling that it should show "all the tasks without any filters,
               just arrived here once recorded… it can also have done/completed
               tasks, so it can serve as a history either". Under the v1 model
               All is 9.5's open-only page and stays that way, so the flag
               compares like for like. */
            completed={
              isNavV2
                ? applyView(tasks, pageFilters).filter(
                    (task) => task.status === "completed",
                  )
                : []
            }
            inbox={applyView(tasks, pageFilters)
              .filter(
                (task) =>
                  !task.form.dueDate &&
                  task.form.folder === "Desk" &&
                  task.status !== "completed",
              )
              .map((task) => ({ ...task, folder: undefined }))}
            groups={[
              "Office",
              "Business",
              "Home",
              "Travel",
            ].map((name) => ({
              name,
              color: formFolderColors[name] ?? "var(--color-graphite-900)",
              tasks: applyView(tasks, pageFilters)
                .filter(
                  (task) =>
                    !task.form.dueDate &&
                    task.form.folder === name &&
                    task.status !== "completed",
                )
                .map((task) => ({ ...task, folder: undefined })),
            }))}
            previewState={state}
            onAddPlanned={(title) => {
              const id = `task-${Date.now()}`
              setTasks((current) => [
                ...current,
                {
                  id,
                  title,
                  status: "pending",
                  folder: { name: "Desk", color: "var(--color-graphite-900)" },
                  due: { label: "Due today" },
                  form: createTaskForm(id, title, "Desk", { dueDate: "2026-08-10" }),
                },
              ])
            }}
            onAddUndated={(folderName, title) => {
              const id = `task-${Date.now()}`
              setTasks((current) => [
                ...current,
                {
                  id,
                  title,
                  tasksGroup: folderName,
                  status: "pending",
                  form: createTaskForm(id, title, folderName, { dueDate: "" }),
                },
              ])
            }}
            onOpenPlannedForm={() => {
              createTaskAndOpen("Desk", { dueDate: "2026-08-10" })
            }}
            onOpenUndatedForm={(folderName) => {
              createTaskAndOpen(folderName, { dueDate: "" })
            }}
            onOpenTask={openTask}
            onToggleComplete={setTaskCompleted}
            onToggleImportant={(taskId) => {
              const task = tasks.find((candidate) => candidate.id === taskId)
              if (task) {
                updateTask(taskId, {
                  important: !task.important,
                  form: { ...task.form, important: !task.important },
                })
              }
            }}
            onRestore={(taskId) => updateTask(taskId, { status: "pending" })}
            onAbandon={abandonTask}
            onDelete={deleteTask}
          />
        ) : isPeople ? (
          <PeopleScreen
            initialConnections={peopleConnections}
            initialPendingInvites={peoplePendingInvites}
            previewState={searchParams.get("people-state") ?? state}
          />
        ) : isShelf ? (
          <ShelfPage
            name={selectedShelfName}
            /* Derived from the label, never a stored list: a folder is on this
               shelf because its membership says so, and a second record of
               that would go stale the moment somebody dragged one. */
            folders={folderLibrary()
              .filter(
                (folder) =>
                  folderShelf(
                    folder.name,
                    baseShelfLabels(shellFolderGroups),
                    folderMemberships,
                  ) === selectedShelfName,
              )
              .map((folder) => ({
                name: folder.name,
                color: folder.color,
                /* The count comes from the tasks the shell already holds,
                   rather than from a field the folder library does not carry. */
                pending: tasks.filter(
                  (task) =>
                    task.form.folder === folder.name && task.status !== "completed",
                ).length,
              }))}
            /* A folder pressed on a shelf opens as its own tab and lands you
               there (DES-219): a shelf presents a workflow, so what it opens
               stays open beside it. */
            onOpenFolder={openFolderTab}
            addableFolders={folderLibrary()
              .filter(
                (folder) =>
                  /* Desk is native and undeletable and stays off every shelf
                     (DES-152) — its own menu offers no Move to shelf, and a
                     row that could shelve it here would be the same act
                     through a side door. */
                  folder.name !== shellInbox.name &&
                  folderShelf(
                    folder.name,
                    baseShelfLabels(shellFolderGroups),
                    folderMemberships,
                  ) !== selectedShelfName,
              )
              .map((folder) => ({ name: folder.name, color: folder.color }))}
            onAddFolder={(name) => {
              const folder = folderLibrary().find(
                (candidate) => candidate.name === name,
              )
              savePrototypeFolderMembership(name, {
                label: selectedShelfName,
                color: folder?.color ?? null,
              })
            }}
            onCreateFolder={() =>
              window.dispatchEvent(
                new CustomEvent("dana:prototype-new-folder", {
                  detail: { label: selectedShelfName },
                }),
              )
            }
            onRename={(next) => renameShelf(selectedShelfName, next)}
            onCopyLink={() => copyShelfLink(selectedShelfName)}
            onDuplicate={() => duplicateShelf(selectedShelfName)}
            onSaveWorkflow={() => saveShelfWorkflow(selectedShelfName)}
            onDelete={() => {
              const on = folderLibrary().filter(
                (folder) =>
                  folderShelf(
                    folder.name,
                    baseShelfLabels(shellFolderGroups),
                    folderMemberships,
                  ) === selectedShelfName,
              )
              /* Deleting a shelf takes the label off its folders and keeps the
                 folders — the arrangement goes, the things arranged stay
                 (DES-195). */
              savePrototypeFolderMemberships(
                Object.fromEntries(
                  on.map((folder) => [folder.name, { label: null, color: null }]),
                ),
              )
              record({
                kind: "shelf",
                subject: selectedShelfName,
                name: selectedShelfName,
                verb: "deleted",
              })
              navigateToPage("My Day")
            }}
          />
        ) : isTrash ? (
          <TrashScreen
            /*
            Restoring is the shell's business because the shell holds the
            tasks, exactly as duplicating was. The page knows what was deleted
            and nothing else; where a thing goes back to is the list's own
            question.
            */
            onRestore={(item) => {
              const taken = untrash(item.id)
              if (!taken) return
              if (taken.kind === "task") {
                const task = taken.payload as ShellTask
                setTasks((current) =>
                  current.some((candidate) => candidate.id === task.id)
                    ? current
                    : [...current, task],
                )
              } else {
                restorePrototypeFolder(taken.subject)
              }
              record({
                kind: taken.kind === "task" ? "task" : "folder",
                subject: taken.subject,
                name: taken.name,
                verb: "restored",
                detail: taken.from ? `to ${taken.from}` : undefined,
              })
            }}
          />
        ) : isSettings ? (
          <SettingsScreen
            onOpenPeople={() => navigateToPage("People")}
            previewState={searchParams.get("settings-state") ?? state}
          />
        ) : isDone ? (
          <DoneScreen
            groups={doneGroups(tasks).map((group) => ({
              ...group,
              tasks: group.tasks.map((task) => ({
                ...task,
                due: task.form.dueDate
                  ? { label: `Due ${Number(task.form.dueDate.slice(8, 10))} Aug` }
                  : undefined,
              })),
            }))}
            previewState={state}
            onOpenTask={openTask}
            onMarkNotDone={(taskId) => updateTask(taskId, { status: "pending" })}
            onToggleImportant={(taskId) => {
              const task = tasks.find((candidate) => candidate.id === taskId)
              if (task) {
                updateTask(taskId, {
                  important: !task.important,
                  form: { ...task.form, important: !task.important },
                })
              }
            }}
            onDelete={deleteTask}
          />
        ) : (
        <div className="mx-auto w-full max-w-[var(--shell-content-max)] px-10 py-6">
        <header>
          <div className="flex items-start gap-3">
            <PageIcon
              className="mt-0.5 size-6 shrink-0 text-[var(--color-graphite-700)]"
              style={pageIconColor ? { color: pageIconColor } : undefined}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h1 className="truncate text-2xl leading-8 font-semibold text-foreground">
                {pageTitle}
              </h1>
              <p className="mt-1 text-xs leading-4 text-muted-foreground">
                {isDone ? "Completed tasks" : isFolder ? "Shared folder" : "Monday, 10 August"}
              </p>
            </div>
          </div>
        </header>

        <section className="mt-6" aria-labelledby="shell-preview-heading">
          <div className="mb-2 flex h-8 items-center border-b border-border">
            <h2
              id="shell-preview-heading"
              className="text-base leading-6 font-semibold text-foreground"
            >
              {isDone ? "Today" : isFolder ? "Scheduled" : "Today"}
            </h2>
          </div>
          <div role="list" className="space-y-0.5">
            {tasks.slice(0, 3).map((task) => (
              <TaskRow
                key={task.id}
                {...task}
                status={isDone ? "completed" : task.status}
                onOpen={(mode) => openTask(task.id, mode)}
              />
            ))}
          </div>
        </section>
        </div>
        ))}
      </AppShell>
      {(() => {
        if (!shellSurface) return null
        const task = tasks.find((candidate) => candidate.id === shellSurface.id)
        if (!task) return null
        return (
          <TaskSurface
            task={{
              ...task,
              onToggleComplete: (completed) =>
                setTaskCompleted(task.id, completed),
              onToggleImportant: () =>
                updateTask(task.id, {
                  important: !task.important,
                  form: { ...task.form, important: !task.important },
                }),
              /* Abandon and Delete, which the surface could not offer because
                 nothing handed them down — so a task opened as a page could
                 do strictly less to itself than the row it came from (Imran,
                 2026-08-22). The surface closes on either, since the thing it
                 was showing is no longer in the list behind it. */
              onPatch: (fields) => patchTaskFromCard(task.id, fields),
              onAbandon: () => {
                abandonTask(task.id)
                setShellSurface(null)
              },
              onDelete: () => {
                deleteTask(task.id)
                setShellSurface(null)
              },
            }}
            mode={shellSurface.mode}
            onModeChange={(mode) => setShellSurface({ ...shellSurface, mode })}
            onOpenInTab={() => {
              openTaskTab(shellSurface.id)
              setShellSurface(null)
            }}
            onClose={() => setShellSurface(null)}
          />
        )
      })()}
      <SearchOverlay
        open={searchOpen}
        onOpenChange={setSearchOpen}
        initialQuery={searchParams.get("q") ?? ""}
        previewState={searchParams.get("search-state")}
        /*
        Everything you can go to (DES-203).

        Assembled here rather than inside the overlay, for the same reason a
        menu's handlers are: only the shell knows what exists. Each kind
        contributes its own haystack — a task adds its notes and the titles of
        its steps, a folder adds its description and the prose written on its
        page, because the words on a folder page were invisible to the one
        control whose job is finding words.
        */
        items={[
          ...tasks.map((task) => ({
            kind: "task" as const,
            id: task.id,
            title: task.title,
            haystack: [
              task.form.notes,
              ...task.form.steps.map((step) => step.title),
              /* "even messages" — what people said on this task. A message is
                 excluded from a *workflow* because a file leaves; searching
                 your own account for a word somebody wrote to you is the
                 opposite case. */
              ...(task.comments ?? []).map((comment) => comment.body),
            ]
              .filter(Boolean)
              .join(" "),
            hint: task.folder?.name ?? task.form.folder,
            status: task.status ?? "pending",
            folder: task.folder ?? {
              name: task.form.folder,
              color:
                formFolderColors[task.form.folder] ??
                "var(--color-graphite-900)",
            },
            dueDate: task.form.dueDate || undefined,
          })),
          ...folderLibrary().map((folder) => ({
            kind: "folder" as const,
            id: folder.name,
            title: folder.name,
            haystack: folderHaystack(folder.name),
            hint: folderMemberships[folder.name]?.label ?? undefined,
            color: folder.color,
          })),
          /* Shelves, which were left out while they had nowhere to go
             (DES-203). DES-207 gave them a page, so the reason expired. */
          ...availableFolderLabels.map((label) => ({
            kind: "shelf" as const,
            id: label,
            title: label,
            hint: "Shelf",
            haystack: folderLibrary()
              .filter(
                (folder) =>
                  folderShelf(
                    folder.name,
                    baseShelfLabels(shellFolderGroups),
                    folderMemberships,
                  ) === label,
              )
              .map((folder) => folder.name)
              .join(" "),
          })),
          ...[...NAV_PAGES, ...FOOTER_PAGES, TRASH_PAGE].map((page) => ({
            kind: "page" as const,
            id: page.name,
            title: page.name,
            hint: pageQuestion(page.name),
          })),
        ]}
        onOpenResult={(id, kind) => {
          if (kind === "task") openTask(id)
          else if (kind === "folder") navigateToFolder(id)
          else if (kind === "shelf") navigateToShelf(id)
          else navigateToPage(id as ShellPageName)
        }}
      />
      {/* On the previous folder page, the road back to the concept is drawn
          rather than remembered. The compare link once became a one-way door:
          the param survived every sidebar navigation, and the concept
          silently vanished for whoever had clicked it. */}
      {isFolder && folderPageVariant === "v1" ? (
        <a
          href={(() => {
            const url = new URL(window.location.href)
            url.searchParams.delete("folder-page")
            return url.toString()
          })()}
          className="fixed bottom-4 left-4 z-40 flex h-8 items-center gap-2 rounded-lg border border-[var(--color-graphite-200)] bg-card/95 px-3 text-[12px] leading-4 font-medium text-[var(--color-graphite-700)] shadow-[var(--elevation-1)] backdrop-blur transition-colors hover:bg-card"
        >
          Viewing the previous folder page — back to the concept
        </a>
      ) : null}
    </TaskWriter>
  )
}
