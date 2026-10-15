/*
 * Every query key in one place. Invalidation is unfiltered (queryClient.ts), so nothing should match on a key
 * prefix.
 */

export const queryKeys = {
  me: () => ['me'] as const,
  folders: () => ['folders'] as const,
  /** `GET /folders?tabs=1`: every page, including a project's tabs. */
  allPages: () => ['pages', 'with-tabs'] as const,
  folder: (id: string) => ['folders', id] as const,
  folderTasks: (id: string, section: 'open' | 'completed') =>
    ['folders', id, 'tasks', section] as const,
  connections: () => ['connections'] as const,
  pendingInvites: () => ['invites', 'pending'] as const,
  sentInvites: () => ['invites', 'sent'] as const,
  view: (name: string) => ['views', name] as const,
  task: (id: string) => ['tasks', id] as const,
  taskDependencies: (id: string) => ['tasks', id, 'dependencies'] as const,
  referenceSearch: (q: string, folder: string | null) =>
    ['references', 'search', q, folder ?? ''] as const,

  /* The person's settings bundle: the only settings read this client makes. */
  bundle: () => ['settings', 'bundle'] as const,
  savedViews: () => ['settings', 'views'] as const,
  shelves: () => ['shelves'] as const,
  trash: () => ['trash'] as const,
  archivedWork: () => ['archive', 'folders'] as const,
  stats: () => ['stats'] as const,
  /** `subject` is a `kind:id` reference, so two subjects never share a key. */
  events: (subject: string) => ['events', subject] as const,

  /* A thread key carries the task id or 'folder', so a folder's thread and a task's never collide. */
  shelf: (id: string) => ['shelves', id] as const,
  folderPage: (id: string) => ['folders', id, 'page'] as const,
  pageFacets: (id: string) => ['page-facets', id] as const,
  pageFacetDocument: (pageId: string, facetId: string) =>
    ['page-facet-document', pageId, facetId] as const,
  folderMember: (id: string, userId: string) => ['folders', id, 'members', userId] as const,
  folderMemberHistory: (id: string, userId: string) =>
    ['folders', id, 'members', userId, 'history'] as const,
  profileDocs: (id: string, userId: string) =>
    ['folders', id, 'members', userId, 'profile-docs'] as const,
  profilePages: (id: string) => ['folders', id, 'profile-pages'] as const,
  folderDependencies: (id: string) => ['folders', id, 'dependencies'] as const,
  shelfPage: (id: string) => ['shelves', id, 'page'] as const,
  notifications: () => ['notifications'] as const,
  directConversations: () => ['direct-conversations'] as const,

  /* One key for all place covers, because the read returns the whole set. */
  placeCovers: () => ['place-covers'] as const,
  placeDescriptions: () => ['place-descriptions'] as const,

  folderLabels: (id: string) => ['folders', id, 'labels'] as const,
  labels: (folderId: string | null, state: 'active' | 'all') =>
    ['labels', folderId ?? 'personal', state] as const,

  discussion: (id: string) => ['discussions', id] as const,
  discussions: (folderId: string, state: string, q: string) =>
    ['folders', folderId, 'discussions', state, q] as const,
  discussionThread: (id: string) => ['discussions', id, 'thread'] as const,
  outcome: (id: string) => ['outcomes', id] as const,

  reference: (kind: string, id: string) => ['references', kind, id] as const,
  backlinks: (kind: string, id: string) => ['backlinks', kind, id] as const,
  connectedWork: (facetId: string) => ['facets', facetId, 'connected-work'] as const,
} as const
