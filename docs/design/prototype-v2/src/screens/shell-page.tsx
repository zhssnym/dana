import { useEffect, useRef, useState } from "react"
import {
  CalendarDays,
  CheckCircle2,
  Folder,
  Layers3,
  ListTodo,
  Settings2,
  Star,
  SunMedium,
  UsersRound,
} from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { TaskCard } from "@/components/task-card"
import type { TaskExpansion } from "@/components/task-row"
import type { ShellPageName } from "@/components/app-sidebar"
import {
  TaskFormSheet,
  type TaskFormData,
  type TaskFormEntryPoint,
} from "@/components/task-form"
import { TaskRow, type TaskRowProps } from "@/components/task-row"
import { SearchOverlay } from "@/components/search-overlay"
import { shellFolderGroups, shellPreviewTasks } from "@/fixtures"
import {
  readPrototypeFolderMemberships,
  savePrototypeFolderMembership,
} from "@/lib/folder-membership"
import {
  PROTOTYPE_FOLDER_PRESENTATION_EVENT,
  readPrototypeFolderPresentation,
  renamePrototypeFolder,
  type PrototypeFolderPresentation,
} from "@/lib/folder-presentation"
import { MyDayScreen } from "@/screens/my-day-screen"
import { PlannedScreen } from "@/screens/planned-screen"
import { TasksScreen } from "@/screens/tasks-screen"
import { FolderScreen } from "@/screens/folder-screen"
import { ImportantScreen } from "@/screens/important-screen"
import { AllScreen } from "@/screens/all-screen"
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
  Inbox: "var(--color-graphite-900)",
  Wedding: "var(--color-graphite-900)",
  Home: "var(--color-graphite-900)",
  Dana: "var(--color-graphite-900)",
  "Community planning committee": "var(--color-graphite-900)",
  "Reading list": "var(--color-graphite-900)",
  Travel: "var(--color-graphite-900)",
}

const primaryShellTasks: ShellTask[] = shellPreviewTasks.map((task, index) => {
  const id = `task-${index + 1}`
  const folder = index === 0 ? "Dana" : index === 1 ? "Wedding" : "Home"

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

const myDayGoldenTasks: ShellTask[] = [
  {
    id: "task-4",
    myDayGroup: "carried",
    folderSection: "scheduled",
    title: "Send the venue deposit",
    folder: { name: "Wedding", color: "var(--color-graphite-900)" },
    due: { label: "Overdue · 6 Aug", overdue: true },
    important: true,
    form: createTaskForm("task-4", "Send the venue deposit", "Wedding", {
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
      name: "Community planning committee",
      color: "var(--color-graphite-900)",
    },
    due: { label: "Overdue · 8 Aug", overdue: true },
    steps: { complete: 2, total: 4 },
    form: createTaskForm(
      "task-5",
      "Review community grant application",
      "Dana",
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
    folder: { name: "Wedding", color: "var(--color-graphite-900)" },
    due: { label: "Due 18 Aug" },
    pulled: true,
    important: true,
    form: createTaskForm(
      "task-6",
      "Review the guest transport plan",
      "Wedding",
      { dueDate: "2026-08-18", important: true },
    ),
  },
  {
    id: "task-7",
    myDayGroup: "today",
    folderSection: "scheduled",
    title: "Send ceremony invitation proof",
    folder: { name: "Wedding", color: "var(--color-graphite-900)" },
    due: { label: "Done 9:20 AM" },
    status: "completed",
    completedAt: "2026-08-10T09:20:00-06:00",
    important: true,
    form: createTaskForm(
      "task-7",
      "Send ceremony invitation proof",
      "Wedding",
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
    tasksGroup: "Inbox",
    important: true,
    form: createTaskForm("task-9", "Capture questions for Hassan", "Inbox", {
      dueDate: "",
      important: true,
    }),
  },
  {
    id: "task-10",
    title: "Renew the library card",
    tasksGroup: "Inbox",
    form: createTaskForm("task-10", "Renew the library card", "Inbox", {
      dueDate: "",
    }),
  },
  {
    id: "task-11",
    title: "Draft the grant budget questions",
    tasksGroup: "Community planning committee",
    assignee: { initials: "S", name: "Sara" },
    steps: { complete: 1, total: 3 },
    form: createTaskForm(
      "task-11",
      "Draft the grant budget questions",
      "Community planning committee",
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
    tasksGroup: "Dana",
    important: true,
    form: createTaskForm(
      "task-12",
      "Collect frontend handoff questions",
      "Dana",
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
    tasksGroup: "Wedding",
    assignee: { initials: "S", name: "Sara" },
    form: createTaskForm(
      "task-14",
      "Compare invitation envelope samples",
      "Wedding",
      { dueDate: "", assignee: "Sara Khan" },
    ),
  },
  {
    id: "task-15",
    folderSection: "unscheduled",
    title: "Keep the backup chair reservation",
    tasksGroup: "Wedding",
    status: "abandoned",
    folder: { name: "Wedding", color: "var(--color-graphite-900)" },
    form: createTaskForm(
      "task-15",
      "Keep the backup chair reservation",
      "Wedding",
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
    folder: { name: "Wedding", color: "var(--color-graphite-900)" },
    due: { label: "12 Aug" },
    form: createTaskForm(
      "task-16",
      "Confirm the catering cancellation window",
      "Wedding",
      { dueDate: "2026-08-12", important: true },
    ),
  },
  {
    id: "task-17",
    title: "Review the release readiness checklist",
    folder: { name: "Dana", color: "var(--color-graphite-900)" },
    due: { label: "14 Aug" },
    unassigned: true,
    form: createTaskForm(
      "task-17",
      "Review the release readiness checklist",
      "Dana",
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
    folder: { name: "Wedding", color: "var(--color-graphite-900)" },
    due: { label: "Due 9 Aug" },
    form: createTaskForm("task-18", "Send the final guest count", "Wedding", {
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
    folder: { name: "Dana", color: "var(--color-graphite-900)" },
    due: { label: "Due 6 Aug" },
    form: createTaskForm("task-19", "Archive the approved Dana mark assets", "Dana", {
      dueDate: "2026-08-06",
      completedAt: "2026-08-06T14:15:00-06:00",
      completedBy: "Hassan Ali",
    }),
  },
]

const cardPeople = [
  { name: "Imran Wafa", initials: "IW" },
  { name: "Sara Khan", initials: "SK" },
  { name: "Hassan Ali", initials: "HA" },
]

const cardFolders = [
  { name: "Wedding", color: "var(--color-folder-violet)" },
  { name: "Community planning committee", color: "var(--color-folder-fern)" },
  { name: "Home", color: "var(--color-folder-teal)" },
  { name: "Dana", color: "var(--color-folder-cobalt)" },
  { name: "Inbox", color: "var(--color-graphite-400)" },
]

const shellTaskFixtures: ShellTask[] = [
  ...primaryShellTasks,
  ...myDayGoldenTasks,
  ...tasksGoldenTasks,
  ...plannedGoldenTasks,
  ...doneGoldenTasks,
]

const peopleConnections: ConnectionFixture[] = [
  {
    id: "connection-hassan",
    name: "Hassan Ali",
    email: "hassan@example.com",
    initials: "HA",
    connectedAt: "4 Aug 2026",
  },
  {
    id: "connection-sara",
    name: "Sara Khan",
    email: "sara@example.com",
    initials: "SK",
    connectedAt: "8 Aug 2026",
  },
]

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
  const initialEditTaskId =
    reviewState === "audit"
      ? "task-18"
      : reviewState === "move"
      ? "task-2"
      : reviewState === "clear"
        ? "task-3"
        : reviewState === "edit" || reviewState === "delete"
          ? "task-1"
          : null
  const [taskFormOpen, setTaskFormOpen] = useState(searchParams.get("view") === "form")
  const [searchOpen, setSearchOpen] = useState(searchParams.get("search") === "open")
  const [tasks, setTasks] = useState(shellTaskFixtures)
  /* Which row is open in place (DES-093). One at a time: two open cards in a
     list is two things competing to be the thing you are reading. */
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [pageVisibility, setPageVisibility] = useState<PageVisibility>(() => ({
    Important: searchParams.get("show-important") !== "false",
    All: searchParams.get("show-all") !== "false",
    Done: searchParams.has("show-done")
      ? searchParams.get("show-done") === "true"
      : requestedPage !== "settings",
  }))
  const [editingTaskId, setEditingTaskId] = useState<string | null>(initialEditTaskId)
  const [createFolderOverride, setCreateFolderOverride] = useState<string | undefined>()
  const [createDueDateOverride, setCreateDueDateOverride] = useState<string | undefined>()
  const [taskFormContextBanner, setTaskFormContextBanner] = useState<string | undefined>()
  const [folderPresentation, setFolderPresentation] =
    useState<PrototypeFolderPresentation>(() =>
      isCleanHandoffPreview
        ? { names: {}, deleted: [] }
        : readPrototypeFolderPresentation(),
    )
  const taskFormOpener = useRef<HTMLElement | null>(null)
  const isDone = state === "done" || requestedPage === "done"
  const isFolder = state === "folder"
  const isTasks = requestedPage === "tasks"
  const isPlanned = requestedPage === "planned"
  const isImportant = requestedPage === "important"
  const isAll = requestedPage === "all"
  const isPeople = requestedPage === "people"
  const isSettings = requestedPage === "settings"
  const selectedFolderName = searchParams.get("folder") ?? "Wedding"
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
    "Wedding",
    "Dana",
    "Community planning committee",
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
  const activePage: ShellPageName | null = isFolder
    ? null
    : isPeople
      ? "People"
      : isSettings
        ? "Settings"
    : isDone
      ? "Done"
      : isTasks
        ? "Tasks"
        : isPlanned
          ? "Planned"
          : isImportant
            ? "Important"
            : isAll
              ? "All"
          : "My Day"
  const pageTitle = isFolder
    ? selectedFolderDisplayName
    : isPeople
      ? "People"
      : isSettings
        ? "Settings"
        : isDone
          ? "Done"
          : isTasks
            ? "Tasks"
            : isPlanned
              ? "Planned"
              : isImportant
                ? "Important"
                : isAll
                  ? "All"
                  : "My Day"
  const PageIcon = isFolder
    ? Folder
    : isPeople
      ? UsersRound
      : isSettings
        ? Settings2
        : isDone
          ? CheckCircle2
          : isTasks
            ? ListTodo
            : isPlanned
              ? CalendarDays
              : isImportant
                ? Star
                : isAll
                  ? Layers3
                  : SunMedium
  const pageIconColor = isFolder ? selectedFolderColor : undefined
  const requestedEntry = searchParams.get("entry")
  const formEntryPoint: TaskFormEntryPoint =
    requestedEntry === "my-day" ||
    requestedEntry === "tasks" ||
    requestedEntry === "all" ||
    requestedEntry === "planned-list" ||
    requestedEntry === "planned-cell" ||
    requestedEntry === "important" ||
    requestedEntry === "folder"
      ? requestedEntry
      : isFolder
        ? "folder"
        : isDone
          ? "tasks"
        : isTasks
          ? "tasks"
        : isPlanned
          ? "planned-list"
          : isImportant
            ? "important"
            : isAll
              ? "all"
            : "my-day"
  const openTask = (taskId: string) => {
    taskFormOpener.current = document.activeElement as HTMLElement | null
    setTaskFormContextBanner(undefined)
    setEditingTaskId(taskId)
    setTaskFormOpen(true)
  }
  const openGhostTask = (taskId: string) => {
    taskFormOpener.current = document.activeElement as HTMLElement | null
    setTaskFormContextBanner("Upcoming occurrence of a repeating task")
    setEditingTaskId(taskId)
    setTaskFormOpen(true)
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
  /* The card edits the same form object the sheet edits, which is the whole
     of DES-093: one artifact, two presentations. Anything written here is
     written where the sheet would have written it. */
  const taskExpansion: TaskExpansion = {
    openId: expandedTaskId,
    toggle: (taskId) =>
      setExpandedTaskId((current) => (current === taskId ? null : taskId)),
    render: (taskId) => {
      const task = tasks.find((candidate) => candidate.id === taskId)
      if (!task) return null
      return (
        <TaskCard
          form={task.form}
          people={cardPeople}
          folders={cardFolders}
          onChange={(next) => {
            const merged = { ...task.form, ...next }
            updateTask(taskId, {
              form: merged,
              title: merged.title,
              notes: Boolean(merged.notes),
              steps: merged.steps.length
                ? {
                    complete: merged.steps.filter((step) => step.done).length,
                    total: merged.steps.length,
                  }
                : undefined,
            })
          }}
          onClose={() => setExpandedTaskId(null)}
          onOpenFull={() => openTask(taskId)}
        />
      )
    },
  }

  const updateTask = (taskId: string, update: Partial<ShellTask>) => {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, ...update } : task,
      ),
    )
  }
  const setTaskCompleted = (taskId: string, completed: boolean) => {
    const completionTime = completed
      ? new Date().toISOString()
      : undefined

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
    )
  }
  const navigateToPage = (nextPage: ShellPageName) => {
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete("state")
    if (nextPage !== "My Day") {
      nextUrl.searchParams.set("page", nextPage.toLowerCase())
    } else {
      nextUrl.searchParams.delete("page")
    }
    window.location.assign(nextUrl)
  }

  return (
    <>
      <AppShell
      activePage={activePage}
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
      pageTitle={pageTitle}
      pageIcon={PageIcon}
      pageIconColor={pageIconColor}
      onCreateTask={() => {
        taskFormOpener.current = document.activeElement as HTMLElement | null
        setTaskFormContextBanner(undefined)
        setEditingTaskId(null)
        setCreateFolderOverride(undefined)
        setCreateDueDateOverride(isPlanned ? "2026-08-10" : undefined)
        setTaskFormOpen(true)
      }}
      onCreateTaskForFolder={(folderName) => {
        taskFormOpener.current = document.activeElement as HTMLElement | null
        setTaskFormContextBanner(undefined)
        setEditingTaskId(null)
        setCreateFolderOverride(folderName)
        setCreateDueDateOverride(undefined)
        setTaskFormOpen(true)
      }}
      onNavigate={navigateToPage}
      onOpenSearch={() => setSearchOpen(true)}
      pageVisibility={pageVisibility}
      >
        {!isDone &&
        !isFolder &&
        !isTasks &&
        !isPlanned &&
        !isImportant &&
        !isAll &&
        !isPeople &&
        !isSettings ? (
          <MyDayScreen
            carriedOver={tasks.filter((task) =>
              task.myDayGroup === "carried" &&
              task.status !== "completed" &&
              task.status !== "abandoned" &&
              !task.hiddenFromMyDay,
            )}
            today={tasks.filter((task) =>
              task.myDayGroup === "today" &&
              task.status !== "completed" &&
              task.status !== "abandoned" &&
              !task.hiddenFromMyDay,
            )}
            doneToday={tasks.filter((task) =>
              task.status === "completed" && !task.hiddenFromMyDay,
            )}
            previewState={state}
            onOpenTask={openTask}
            onToggleComplete={setTaskCompleted}
            expansion={taskExpansion}
            onRename={(taskId, title) => {
              const task = tasks.find((candidate) => candidate.id === taskId)
              if (task) {
                updateTask(taskId, { title, form: { ...task.form, title } })
              }
            }}
            onToggleImportant={(taskId) => {
              const task = tasks.find((candidate) => candidate.id === taskId)
              if (task) {
                updateTask(taskId, {
                  important: !task.important,
                  form: { ...task.form, important: !task.important },
                })
              }
            }}
            onRemoveFromMyDay={(taskId) =>
              updateTask(taskId, { hiddenFromMyDay: true, pulled: false })
            }
            onAbandon={(taskId) =>
              updateTask(taskId, { status: "abandoned" })
            }
            onDelete={(taskId) =>
              setTasks((current) =>
                current.filter((task) => task.id !== taskId),
              )
            }
          />
        ) : isTasks ? (
          <TasksScreen
            inbox={tasks.filter(
              (task) =>
                task.tasksGroup === "Inbox" && task.status !== "completed",
            ).map((task) => ({ ...task, folder: undefined }))}
            groups={[
              "Community planning committee",
              "Dana",
              "Home",
              "Wedding",
            ].map((name) => ({
              name,
              color:
                formFolderColors[name] ?? "var(--color-graphite-900)",
              tasks: tasks.filter(
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
              taskFormOpener.current = document.activeElement as HTMLElement | null
              setEditingTaskId(null)
              setCreateFolderOverride(folderName)
              setCreateDueDateOverride(undefined)
              setTaskFormOpen(true)
            }}
            onOpenTask={openTask}
            onToggleComplete={setTaskCompleted}
            expansion={taskExpansion}
            onRename={(taskId, title) => {
              const task = tasks.find((candidate) => candidate.id === taskId)
              if (task) {
                updateTask(taskId, { title, form: { ...task.form, title } })
              }
            }}
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
            onAbandon={(taskId) =>
              updateTask(taskId, { status: "abandoned" })
            }
            onDelete={(taskId) =>
              setTasks((current) =>
                current.filter((task) => task.id !== taskId),
              )
            }
          />
        ) : isFolder ? (
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
            isDefault={selectedFolderName === "Inbox"}
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
              taskFormOpener.current = document.activeElement as HTMLElement | null
              setEditingTaskId(null)
              setCreateFolderOverride(selectedFolderName)
              setCreateDueDateOverride(
                section === "scheduled" ? "2026-08-10" : "",
              )
              setTaskFormOpen(true)
            }}
            onOpenTask={openTask}
            onToggleComplete={setTaskCompleted}
            expansion={taskExpansion}
            onRename={(taskId, title) => {
              const task = tasks.find((candidate) => candidate.id === taskId)
              if (task) {
                updateTask(taskId, { title, form: { ...task.form, title } })
              }
            }}
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
            onAbandon={(taskId) =>
              updateTask(taskId, { status: "abandoned" })
            }
            onDelete={(taskId) =>
              setTasks((current) =>
                current.filter((task) => task.id !== taskId),
              )
            }
            onDeleteFolder={() => {
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
            tasks={plannedServerOrder(tasks).map((task) => ({
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
                    name: "Inbox",
                    color: "var(--color-graphite-900)",
                  },
                  due: { label: "Due today" },
                  form: createTaskForm(id, title, "Inbox", {
                    dueDate: "2026-08-10",
                  }),
                },
              ])
            }}
            onOpenFullForm={() => {
              taskFormOpener.current = document.activeElement as HTMLElement | null
              setTaskFormContextBanner(undefined)
              setEditingTaskId(null)
              setCreateFolderOverride("Inbox")
              setCreateDueDateOverride("2026-08-10")
              setTaskFormOpen(true)
            }}
            onCreateAtDate={(date) => {
              taskFormOpener.current = document.activeElement as HTMLElement | null
              setTaskFormContextBanner(undefined)
              setEditingTaskId(null)
              setCreateFolderOverride("Inbox")
              setCreateDueDateOverride(date)
              setTaskFormOpen(true)
            }}
            onOpenTask={openTask}
            onOpenGhost={openGhostTask}
            onToggleComplete={setTaskCompleted}
            expansion={taskExpansion}
            onRename={(taskId, title) => {
              const task = tasks.find((candidate) => candidate.id === taskId)
              if (task) {
                updateTask(taskId, { title, form: { ...task.form, title } })
              }
            }}
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
            tasks={importantServerOrder(tasks).map((task) => ({
              ...task,
              importantTooltip: task.form.dueDate
                ? `Also in Planned, due ${task.form.dueDate}`
                : `Also in Tasks, in ${task.form.folder}`,
            }))}
            previewState={state}
            onOpenTask={openTask}
            onToggleComplete={setTaskCompleted}
            expansion={taskExpansion}
            onRename={(taskId, title) => {
              const task = tasks.find((candidate) => candidate.id === taskId)
              if (task) {
                updateTask(taskId, { title, form: { ...task.form, title } })
              }
            }}
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
            onAbandon={(taskId) => updateTask(taskId, { status: "abandoned" })}
            onDelete={(taskId) =>
              setTasks((current) =>
                current.filter((task) => task.id !== taskId),
              )
            }
          />
        ) : isAll ? (
          <AllScreen
            planned={plannedServerOrder(tasks)}
            inbox={tasks
              .filter(
                (task) =>
                  !task.form.dueDate &&
                  task.form.folder === "Inbox" &&
                  task.status !== "completed",
              )
              .map((task) => ({ ...task, folder: undefined }))}
            groups={[
              "Community planning committee",
              "Dana",
              "Home",
              "Wedding",
            ].map((name) => ({
              name,
              color: formFolderColors[name] ?? "var(--color-graphite-900)",
              tasks: tasks
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
                  folder: { name: "Inbox", color: "var(--color-graphite-900)" },
                  due: { label: "Due today" },
                  form: createTaskForm(id, title, "Inbox", { dueDate: "2026-08-10" }),
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
              taskFormOpener.current = document.activeElement as HTMLElement | null
              setEditingTaskId(null)
              setCreateFolderOverride("Inbox")
              setCreateDueDateOverride("2026-08-10")
              setTaskFormOpen(true)
            }}
            onOpenUndatedForm={(folderName) => {
              taskFormOpener.current = document.activeElement as HTMLElement | null
              setEditingTaskId(null)
              setCreateFolderOverride(folderName)
              setCreateDueDateOverride("")
              setTaskFormOpen(true)
            }}
            onOpenTask={openTask}
            onToggleComplete={setTaskCompleted}
            expansion={taskExpansion}
            onRename={(taskId, title) => {
              const task = tasks.find((candidate) => candidate.id === taskId)
              if (task) {
                updateTask(taskId, { title, form: { ...task.form, title } })
              }
            }}
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
            onAbandon={(taskId) => updateTask(taskId, { status: "abandoned" })}
            onDelete={(taskId) =>
              setTasks((current) => current.filter((task) => task.id !== taskId))
            }
          />
        ) : isPeople ? (
          <PeopleScreen
            initialConnections={peopleConnections}
            initialPendingInvites={peoplePendingInvites}
            previewState={searchParams.get("people-state") ?? state}
          />
        ) : isSettings ? (
          <SettingsScreen
            pageVisibility={pageVisibility}
            onPageVisibilityChange={(page, visible) =>
              setPageVisibility((current) => ({
                ...current,
                [page]: visible,
              }))
            }
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
            expansion={taskExpansion}
            onRename={(taskId, title) => {
              const task = tasks.find((candidate) => candidate.id === taskId)
              if (task) {
                updateTask(taskId, { title, form: { ...task.form, title } })
              }
            }}
            onToggleImportant={(taskId) => {
              const task = tasks.find((candidate) => candidate.id === taskId)
              if (task) {
                updateTask(taskId, {
                  important: !task.important,
                  form: { ...task.form, important: !task.important },
                })
              }
            }}
            onDelete={(taskId) =>
              setTasks((current) => current.filter((task) => task.id !== taskId))
            }
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
                onOpen={() => {
                  openTask(task.id)
                }}
              />
            ))}
          </div>
        </section>
        </div>
        )}
      </AppShell>
      <SearchOverlay
        open={searchOpen}
        onOpenChange={setSearchOpen}
        initialQuery={searchParams.get("q") ?? ""}
        previewState={searchParams.get("search-state")}
        items={tasks.map((task) => ({
          id: task.id,
          title: task.title,
          notes: task.form.notes,
          status: task.status ?? "pending",
          folder: task.folder ?? {
            name: task.form.folder,
            color:
              formFolderColors[task.form.folder] ??
              "var(--color-graphite-900)",
          },
          dueDate: task.form.dueDate || undefined,
        }))}
        onOpenResult={openTask}
      />
      <TaskFormSheet
        open={taskFormOpen}
        onOpenChange={(nextOpen) => {
          setTaskFormOpen(nextOpen)
          if (!nextOpen) {
            window.requestAnimationFrame(() => taskFormOpener.current?.focus())
          }
        }}
        entryPoint={formEntryPoint}
        initialFolder={createFolderOverride}
        initialDueDate={createDueDateOverride}
        initialExpanded={searchParams.get("form") === "expanded"}
        contextBanner={taskFormContextBanner}
        task={tasks.find((task) => task.id === editingTaskId)?.form ?? null}
        taskStatus={
          tasks.find((task) => task.id === editingTaskId)?.status ?? "pending"
        }
        onToggleComplete={(completed) => {
          if (!editingTaskId) return
          setTaskCompleted(editingTaskId, completed)
        }}
        onSave={(savedTask) => {
          setTasks((current) => {
            const existing = current.find((task) => task.id === savedTask.id)
            const nextTasksGroup = savedTask.dueDate
              ? undefined
              : savedTask.folder
            const updated: ShellTask = {
              ...(existing ?? { id: savedTask.id }),
              id: savedTask.id,
              myDayGroup: savedTask.dueDate
                ? existing?.myDayGroup ??
                  (formEntryPoint === "my-day" ? "today" : undefined)
                : undefined,
              tasksGroup: nextTasksGroup,
              folderSection:
                savedTask.folder === "Wedding"
                  ? savedTask.dueDate
                    ? "scheduled"
                    : "unscheduled"
                  : undefined,
              title: savedTask.title,
              important: savedTask.important,
              folder: nextTasksGroup
                ? undefined
                : {
                    name: savedTask.folder,
                    color:
                      formFolderColors[savedTask.folder] ??
                      "var(--color-graphite-900)",
                  },
              due: savedTask.dueDate ? { label: "Due today" } : undefined,
              assignee:
                !savedTask.invitePending && savedTask.assignee !== "Imran Wafa"
                  ? {
                      initials: savedTask.assignee
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2),
                      name: savedTask.assignee,
                    }
                  : undefined,
              invitePending: savedTask.invitePending || undefined,
              recurrence:
                savedTask.repeat !== "none" ? savedTask.repeat : undefined,
              form: {
                ...savedTask,
                createdAt:
                  savedTask.createdAt ??
                  existing?.form.createdAt ??
                  new Date().toISOString(),
                createdBy:
                  savedTask.createdBy ?? existing?.form.createdBy ?? "Imran Wafa",
              },
            }

            return existing
              ? current.map((task) =>
                  task.id === savedTask.id ? updated : task,
                )
              : [...current, updated]
          })
          setEditingTaskId(null)
          setCreateFolderOverride(undefined)
          setCreateDueDateOverride(undefined)
        }}
        onDelete={(taskId) => {
          setTasks((current) => current.filter((task) => task.id !== taskId))
          setEditingTaskId(null)
        }}
      />
    </>
  )
}
