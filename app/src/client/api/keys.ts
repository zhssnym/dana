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
  /** 7.25's two projections of one task's dependency edges (#225). */
  taskDependencies: (id: string) => ['tasks', id, 'dependencies'] as const,
  /** 7.24's picker read, which the dependency picker reuses (#225). */
  referenceSearch: (q: string, folder: string | null) =>
    ['references', 'search', q, folder ?? ''] as const,

  /* The v2 surfaces. `bundle` is the 4.19 person's bundle at /settings, and
     it is the only settings read this client makes (issue #150): a key here
     is a claim that something in the cache answers to it. */
  bundle: () => ['settings', 'bundle'] as const,
  savedViews: () => ['settings', 'views'] as const,
  shelves: () => ['shelves'] as const,
  trash: () => ['trash'] as const,
  /** 4.13's `kind:id` reference, so two subjects never share a key. */
  events: (subject: string) => ['events', subject] as const,

  /* One shelf, the two page reads, the viewer's
     notifications, and a thread. A thread's key carries the task id or
     'folder' so the folder's own thread and a task's never collide. */
  shelf: (id: string) => ['shelves', id] as const,
  folderPage: (id: string) => ['folders', id, 'page'] as const,
  folderFacets: (id: string) => ['folders', id, 'facets'] as const,
  facetLocation: (facetId: string) => ['facets', facetId, 'location'] as const,
  facetPage: (folderId: string, facetId: string) =>
    ['folders', folderId, 'facets', facetId, 'page'] as const,
  shelfPage: (id: string) => ['shelves', id, 'page'] as const,
  notifications: () => ['notifications'] as const,
  thread: (folderId: string, taskId: string | null) =>
    ['folders', folderId, 'thread', taskId ?? 'folder'] as const,

  /* 7.19's place covers. One key for
     the whole set rather than one per place: 4.20's only read is "one
     viewer's covers", and eight keys would be eight requests for a response
     every place page already holds whole. */
  placeCovers: () => ['place-covers'] as const,
  /** 7.21's dense list: one entry for every editable native page. */
  placeDescriptions: () => ['place-descriptions'] as const,
  /** Item 60's sample workspace: present or not, and its counts. */
  sample: () => ['sample'] as const,

  /** One folder's active Folder Label vocabulary (#208's M1 model, #226's
   * `GET /labels`). Read by "Save as workflow", which writes the folder's
   * *reusable* taxonomy into the file and therefore needs the definitions
   * nothing is currently wearing (#227 area 4). */
  folderLabels: (id: string) => ['folders', id, 'labels'] as const,

  /** One Discussion (7.27's GET /discussions/:id). */
  discussion: (id: string) => ['discussions', id] as const,
  /* 7.28's Consultation (#320). The list is keyed by its filter so an open
     and a resolved list are separate pages of the cache. */
  discussions: (folderId: string, state: string, q: string) =>
    ['folders', folderId, 'discussions', state, q] as const,
  discussionThread: (id: string) => ['discussions', id, 'thread'] as const,
  outcome: (id: string) => ['outcomes', id] as const,

  /** A Dana Link chip's live label (#223), and a target's "Referenced from"
   * list (#214). Read by `components/links/`. */
  reference: (kind: string, id: string) => ['references', kind, id] as const,
  backlinks: (kind: string, id: string) => ['backlinks', kind, id] as const,
} as const
