import type { TaskRowProps } from "@/components/task-row"

const folders = {
  travel: { name: "Travel", color: "var(--color-graphite-900)" },
  home: { name: "Home", color: "var(--color-graphite-900)" },
  work: { name: "Work", color: "var(--color-graphite-900)" },
}

export interface TaskStateFixture {
  id: string
  label: string
  note: string
  task: TaskRowProps
}

/*
Every state the row actually has, and no state it does not.

This list was v1's and had drifted: it named Unassigned and Invite pending,
which the row draws nothing for, and it stopped before six states the row has
gained since — a section in its path, an unfiled task's Desk, notes, files, a
conversation, and a completion that is running. A fixture list is a claim
about the product, so a stale one is a wrong one.
*/
export const taskStateFixtures: TaskStateFixture[] = [
  {
    id: "STATE-01",
    label: "Pending",
    note: "The base anatomy",
    task: {
      id: "state-01",
      title: "Pick up the wedding rings",
      folder: folders.travel,
      due: { label: "Due 14 Aug" },
    },
  },
  {
    id: "STATE-02",
    label: "Due today",
    note: "The relative rung, not a date",
    task: {
      id: "state-02",
      title: "Call the florist back",
      folder: folders.travel,
      due: { label: "Due today" },
    },
  },
  {
    id: "STATE-03",
    label: "Overdue",
    note: "Words and tone together",
    task: {
      id: "state-03",
      title: "Send the venue deposit",
      folder: folders.travel,
      due: { label: "Overdue · 6 Aug", overdue: true },
    },
  },
  {
    id: "STATE-04",
    label: "No date",
    note: "One chip fewer, no reserved column",
    task: {
      id: "state-04",
      title: "Renew the library card",
      folder: folders.home,
    },
  },
  {
    id: "STATE-05",
    label: "Unfiled",
    note: "A task with no folder is in Desk",
    task: {
      id: "state-05",
      title: "Capture questions for Hassan",
    },
  },
  {
    id: "STATE-06",
    label: "Inside a section",
    note: "The path a heading would otherwise be the only place to read",
    task: {
      id: "state-06",
      title: "Confirm the marquee size",
      folder: folders.travel,
      section: "Venue & vendors",
    },
  },
  {
    id: "STATE-07",
    label: "Important",
    note: "Filled, and the only row state with a colour of its own",
    task: {
      id: "state-07",
      title: "Renew the car insurance",
      folder: folders.home,
      due: { label: "Due today" },
      important: true,
    },
  },
  {
    id: "STATE-08",
    label: "Assigned",
    note: "A face and a name",
    task: {
      id: "state-08",
      title: "Confirm caterer numbers for Saturday",
      folder: folders.travel,
      due: { label: "Due 12 Aug" },
      assignee: { initials: "S", name: "Sara" },
    },
  },
  {
    id: "STATE-09",
    label: "With steps",
    note: "The ratio; the words are one hover away",
    task: {
      id: "state-09",
      title: "Prepare the ceremony checklist",
      folder: folders.travel,
      steps: { complete: 2, total: 5 },
    },
  },
  {
    id: "STATE-10",
    label: "Repeating",
    note: "The rule in words, not a glyph alone",
    task: {
      id: "state-10",
      title: "Water the balcony plants",
      folder: folders.home,
      due: { label: "Due today" },
      recurrence: "Weekly",
    },
  },
  {
    id: "STATE-11",
    label: "Pulled into Today",
    note: "The cause is visible, so it can be undone",
    task: {
      id: "state-11",
      title: "Review the guest transport plan",
      folder: folders.travel,
      due: { label: "Due 18 Aug" },
      pulled: true,
    },
  },
  {
    id: "STATE-12",
    label: "Carrying more",
    note: "Notes, a file and a conversation, counted on the card",
    task: {
      id: "state-12",
      title: "Draft the supplier questions",
      folder: folders.work,
      due: { label: "Due 16 Aug" },
      notes: "Ask about the corkage charge before signing anything.",
    },
  },
  {
    id: "STATE-13",
    label: "Completed",
    note: "Checked, struck, and quieted",
    task: {
      id: "state-13",
      title: "Confirm the ceremony music",
      folder: folders.travel,
      status: "completed",
    },
  },
  {
    id: "STATE-14",
    label: "Abandoned",
    note: "Struck, labelled, and restorable from the row",
    task: {
      id: "state-14",
      title: "Compare vintage car rentals",
      folder: folders.travel,
      status: "abandoned",
    },
  },
]

/*
Who this account is, and who it is connected to.

These lived inside `shell-page.tsx` while the row's assignee menu read a
different three names out of `task-model.ts` — so the people you could give
work to and the people you were connected to were two lists that disagreed
about names and initials. One list now; `lib/people-library` is what reads it.
*/
export const shellViewer = {
  name: "Imran Wafa",
  initials: "IW",
  email: "imran@example.com",
}

export interface ShellConnectionFixture {
  id: string
  name: string
  email: string
  initials: string
  connectedAt: string
}

export const shellConnections: ShellConnectionFixture[] = [
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
  name: "Desk",
  color: "var(--color-graphite-900)",
  pending: 7,
}

export const shellFolderGroups: ShellFolderGroupFixture[] = [
  {
    label: "Personal",
    iconColor: "var(--color-graphite-900)",
    folders: [
      { name: "Home", color: "var(--color-graphite-900)", pending: 3 },
      { name: "Travel", color: "var(--color-graphite-900)", pending: 6 },
    ],
  },
  {
    label: "Work",
    iconColor: "var(--color-graphite-900)",
    folders: [
      {
        name: "Office",
        color: "var(--color-graphite-900)",
        pending: 4,
      },
      { name: "Business", color: "var(--color-graphite-900)", pending: 9 },
    ],
  },
]

export const shellUnlabelledFolders: ShellFolderFixture[] = [
  { name: "Reading list", color: "var(--color-graphite-900)", pending: 2 },
  { name: "Ideas", color: "var(--color-graphite-900)", pending: 0 },
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
    folder: folders.travel,
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
