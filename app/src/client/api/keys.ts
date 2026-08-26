/*
Every query key in one place.

Not because a key is hard to write, but because 8.3's invalidation is
`invalidateQueries()` with no filter (see queryClient.ts) and that only stays
honest while nothing invents a key nobody else can see. Keys are here so a
reader can see the whole cache at once; they are not here so that anything
matches on a prefix.
*/

export const queryKeys = {
  me: () => ['me'] as const,
  settings: () => ['me', 'settings'] as const,
  folders: () => ['folders'] as const,
  folder: (id: string) => ['folders', id] as const,
  folderTasks: (id: string, section: 'open' | 'completed') =>
    ['folders', id, 'tasks', section] as const,
  connections: () => ['connections'] as const,
  pendingInvites: () => ['invites', 'pending'] as const,
  sentInvites: () => ['invites', 'sent'] as const,
  view: (name: string) => ['views', name] as const,
  /** One task in full (7.6's GET), which the 9.3 form reads in edit mode. */
  task: (id: string) => ['tasks', id] as const,

  /* The v2 surfaces (RFC 0005). `bundle` is the 4.19 person's bundle at
     /settings, which is beside frozen 7.2's /me/settings and never instead of
     it, so it carries a key of its own rather than shadowing `settings`. */
  bundle: () => ['settings', 'bundle'] as const,
  savedViews: () => ['settings', 'views'] as const,
  shelves: () => ['shelves'] as const,
  trash: () => ['trash'] as const,
  /** 4.13's `kind:id` reference, so two subjects never share a key. */
  events: (subject: string) => ['events', subject] as const,

  /* The S12 surfaces: one shelf, the two page reads, the viewer's
     notifications, and a thread. A thread's key carries the task id or
     'folder' so the folder's own thread and a task's never collide. */
  shelf: (id: string) => ['shelves', id] as const,
  folderPage: (id: string) => ['folders', id, 'page'] as const,
  shelfPage: (id: string) => ['shelves', id, 'page'] as const,
  notifications: () => ['notifications'] as const,
  thread: (folderId: string, taskId: string | null) =>
    ['folders', folderId, 'thread', taskId ?? 'folder'] as const,
} as const
