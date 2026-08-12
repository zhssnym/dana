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
  view: (name: string) => ['views', name] as const,
  /** One task in full (7.6's GET), which the 9.3 form reads in edit mode. */
  task: (id: string) => ['tasks', id] as const,
} as const
