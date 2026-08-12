import type { TaskRowProps } from "@/components/task-row"

const folders = {
  wedding: { name: "Wedding", color: "var(--color-graphite-900)" },
  home: { name: "Home", color: "var(--color-graphite-900)" },
  work: { name: "Work", color: "var(--color-graphite-900)" },
}

export interface TaskStateFixture {
  id: string
  label: string
  note: string
  task: TaskRowProps
}

export const taskStateFixtures: TaskStateFixture[] = [
  {
    id: "STATE-01",
    label: "Pending",
    note: "Base anatomy",
    task: {
      title: "Pick up the wedding rings",
      folder: folders.wedding,
      due: { label: "Due 14 Aug" },
    },
  },
  {
    id: "STATE-02",
    label: "Overdue",
    note: "Color + icon + wording",
    task: {
      title: "Send the venue deposit",
      folder: folders.wedding,
      due: { label: "Overdue · 6 Aug", overdue: true },
    },
  },
  {
    id: "STATE-03",
    label: "Completed",
    note: "Checked and faded",
    task: {
      title: "Confirm the ceremony music",
      folder: folders.wedding,
      due: { label: "Due 9 Aug" },
      status: "completed",
    },
  },
  {
    id: "STATE-04",
    label: "Abandoned",
    note: "Struck, labelled, restorable",
    task: {
      title: "Compare vintage car rentals",
      folder: folders.wedding,
      status: "abandoned",
    },
  },
  {
    id: "STATE-05",
    label: "Important",
    note: "Filled star remains visible",
    task: {
      title: "Renew the car insurance",
      folder: folders.home,
      due: { label: "Due today" },
      important: true,
    },
  },
  {
    id: "STATE-06",
    label: "Other assignee",
    note: "Avatar and name",
    task: {
      title: "Confirm caterer numbers for Saturday",
      folder: folders.wedding,
      due: { label: "Due 12 Aug" },
      assignee: { initials: "S", name: "Sara" },
    },
  },
  {
    id: "STATE-07",
    label: "Unassigned",
    note: "Shared Planned context only",
    task: {
      title: "Book the rehearsal room",
      folder: folders.wedding,
      due: { label: "Due 18 Aug" },
      unassigned: true,
    },
  },
  {
    id: "STATE-08",
    label: "Pulled into My Day",
    note: "Visible cause and removal",
    task: {
      title: "Review the guest transport plan",
      folder: folders.wedding,
      pulled: true,
      showSecondaryActions: true,
    },
  },
  {
    id: "STATE-09",
    label: "Invite pending",
    note: "Exact email stays visible",
    task: {
      title: "Collect dietary requirements",
      folder: folders.wedding,
      invitePending: "sara@example.com",
    },
  },
  {
    id: "STATE-10",
    label: "With steps",
    note: "Compact progress",
    task: {
      title: "Prepare the ceremony checklist",
      folder: folders.wedding,
      steps: { complete: 2, total: 5 },
    },
  },
  {
    id: "STATE-11",
    label: "Repeating",
    note: "Glyph plus readable rule",
    task: {
      title: "Water the balcony plants",
      folder: folders.home,
      due: { label: "Due today" },
      recurrence: "Weekly",
    },
  },
]

export const interactionFixtures: Array<{
  label: string
  note: string
  task: TaskRowProps
}> = [
  {
    label: "Default",
    note: "Secondary actions stay quiet",
    task: {
      title: "Draft the supplier questions",
      folder: folders.work,
      due: { label: "Due 16 Aug" },
    },
  },
  {
    label: "Hover",
    note: "Row fill and actions appear",
    task: {
      title: "Review the supplier proposal",
      folder: folders.work,
      due: { label: "Due 17 Aug" },
      visualState: "hover",
    },
  },
  {
    label: "Keyboard focus",
    note: "Visible Dana focus ring",
    task: {
      title: "Send the signed agreement",
      folder: folders.work,
      due: { label: "Due 18 Aug" },
      visualState: "focus",
    },
  },
  {
    label: "Selected + menu",
    note: "Selection is not status",
    task: {
      title: "Archive the final supplier quote",
      folder: folders.work,
      visualState: "selected",
      menuOpen: true,
    },
  },
]

export interface ShellFolderFixture {
  name: string
  color: string
  pending: number
}

export interface ShellFolderGroupFixture {
  label: string
  iconColor: string
  folders: ShellFolderFixture[]
}

export const shellInbox: ShellFolderFixture = {
  name: "Inbox",
  color: "var(--color-graphite-900)",
  pending: 7,
}

export const shellFolderGroups: ShellFolderGroupFixture[] = [
  {
    label: "Personal",
    iconColor: "var(--color-graphite-900)",
    folders: [
      { name: "Home", color: "var(--color-graphite-900)", pending: 3 },
      { name: "Wedding", color: "var(--color-graphite-900)", pending: 6 },
    ],
  },
  {
    label: "Work",
    iconColor: "var(--color-graphite-900)",
    folders: [
      {
        name: "Community planning committee",
        color: "var(--color-graphite-900)",
        pending: 4,
      },
      { name: "Dana", color: "var(--color-graphite-900)", pending: 9 },
    ],
  },
]

export const shellUnlabelledFolders: ShellFolderFixture[] = [
  { name: "Reading list", color: "var(--color-graphite-900)", pending: 2 },
  { name: "Travel", color: "var(--color-graphite-900)", pending: 0 },
]

export const shellPreviewTasks: TaskRowProps[] = [
  {
    title: "Review Dana's application shell with Hassan",
    folder: folders.work,
    due: { label: "Due today" },
    important: true,
  },
  {
    title: "Confirm venue accessibility details",
    folder: folders.wedding,
    due: { label: "Due today" },
    assignee: { initials: "S", name: "Sara" },
  },
  {
    title: "Water the balcony plants",
    folder: folders.home,
    due: { label: "Due today" },
    recurrence: "Weekly",
  },
]
