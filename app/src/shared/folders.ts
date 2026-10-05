/*
The 7.4 folder and membership request bodies and the 7.0 Folder object.
Bodies are z.object (unknown fields stripped); messages omit the field name
because sendValidationError prefixes the path (10.3).
*/
import { z } from 'zod'

import { folderAccessPreset } from './folder-access.js'
import { labelRef } from './labels.js'
import { responsibilityDocument } from './responsibility.js'

/* Field primitives shared by write path, read path and client validation.
   Lengths are 10.3's; the color pattern matches the 4.4 CHECK. */
export const folderName = z
  .string({ error: 'must be a string' })
  .min(1, { error: 'must be 1 to 100 characters' })
  .max(100, { error: 'must be 1 to 100 characters' })

/** The viewer's own Shelf name on a folder (was `personalLabel` before #226). */
export const shelfName = z
  .string({ error: 'must be a string' })
  .min(1, { error: 'must be 1 to 40 characters' })
  .max(40, { error: 'must be 1 to 40 characters' })

export const hexColor = z
  .string({ error: 'must be a string' })
  .regex(/^#[0-9A-Fa-f]{6}$/, { error: 'must be a hex color in #RRGGBB form' })

/* 4.3's description, capped by `folders_description_length_check`. Shared by
   create and rename so both apply one rule. */
export const folderDescription = z
  .string({ error: 'must be a string' })
  .max(500, { error: 'must be 500 characters or fewer' })

/* POST /folders. The 200-folder cap is checked by the domain. `description`
   must ride the create, which is one request (AC-279). */
export const postFoldersBody = z.object({
  name: folderName,
  description: folderDescription.nullable().optional(),
  /* Create as a sub-page. A body id the ac-397 sweep cannot see: the route
     gates it itself (404 non-member, 403 below edit). Null or absent: a root. */
  parent_folder_id: z.uuid({ error: 'must be a uuid' }).nullable().optional(),
  /* On a new project, absent means Work and null leaves it unpicked. On a
     sub-page, absent or null means Doc. */
  kind: z.enum(['doc', 'work', 'discussion']).nullable().optional(),
})
export type PostFoldersBody = z.infer<typeof postFoldersBody>

export const PAGE_KINDS = ['doc', 'work', 'discussion'] as const
export type PageKind = (typeof PAGE_KINDS)[number]

/* A new tab's name, and the project root's tab label. */
export const DEFAULT_TAB_NAMES: Readonly<Record<PageKind, string>> = {
  doc: 'Doc',
  work: 'Work',
  discussion: 'Discussion',
}

/*
POST /folders/:id/tabs. `:id` is any page of the project. While the kind is
unpicked, `kind` picks it (`usual` builds the standard tabs); after that it adds
one tab, `usual` is 422 and a second live Discussion is 409.
*/
export const postFolderTabsBody = z.object({
  kind: z.enum(['doc', 'work', 'discussion', 'usual']),
})
export type PostFolderTabsBody = z.infer<typeof postFolderTabsBody>

/** 4.20's preset key shape. */
const coverPreset = z
  .string()
  .regex(/^[a-z0-9-]{1,40}$/, 'must be a preset key')

export const patchFolderBody = z.object({
  name: folderName.optional(),
  // Pattern-validated only; the server stores the icon key opaquely.
  icon: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/, 'must be an icon key')
    .nullable()
    .optional(),
  color: hexColor.nullable().optional(),
  cover_file_id: z.uuid().nullable().optional(),
  /* A file and a preset are one source: setting one clears the other server-side,
     and a body naming both is refused. */
  cover_preset: coverPreset.nullable().optional(),
  cover_focal_y: z.int().min(0).max(100).optional(),
  description: folderDescription.nullable().optional(),
}).refine(
  (body) => !(body.cover_file_id != null && body.cover_preset != null),
  { message: 'cover_file_id and cover_preset: a cover is a file or a preset, not both', path: ['cover_preset'] },
)
export type PatchFolderBody = z.infer<typeof patchFolderBody>

/* PATCH /folders/:id/my-membership. Absent fields are left alone; null clears. */
export const patchFolderMyMembershipBody = z.object({
  /* The old key `label` is now stripped (AC-750). To rename a wire key, accept
     both for one release: a stale tab would otherwise get 200 and store nothing. */
  shelf: shelfName.nullable().optional(),
  color: hexColor.nullable().optional(),
})
export type PatchFolderMyMembershipBody = z.infer<
  typeof patchFolderMyMembershipBody
>

/*
POST /folders/:id/members. `access` is required with no default: a default
would grant authority nobody chose. `responsibility` is optional; absent means
no document, written as the administrator's revision.
*/
export const postFolderMembersBody = z.object({
  user_id: z.uuid({ error: 'must be a uuid' }),
  access: folderAccessPreset,
  responsibility: responsibilityDocument.optional(),
})
export type PostFolderMembersBody = z.infer<typeof postFolderMembersBody>

/*
Task progress (#205). `done`/`total` count one-off Tasks only, since each
recurring occurrence is its own row; pending recurring ones are
`recurring_active`. Abandoned and trashed Tasks count nowhere.
*/
export const taskProgress = z.object({
  done: z.int().nonnegative(),
  total: z.int().nonnegative(),
  recurring_active: z.int().nonnegative(),
})
export type TaskProgress = z.infer<typeof taskProgress>

/* A Task counts toward its one Section and the Folder; Sections do not roll up. */
export const sectionProgress = taskProgress.extend({
  section_block_id: z.uuid(),
})
export type SectionProgress = z.infer<typeof sectionProgress>

export const folder = z.object({
  id: z.uuid(),
  /* Up to 120: a tab made from a facet keeps its facet name. */
  name: z.string().min(1).max(120),
  is_default: z.boolean(),
  is_owner: z.boolean(),
  member_count: z.int().min(1),
  counts: z.object({
    pending: z.int().nonnegative(),
    completed: z.int().nonnegative(),
  }),
  /* Optional so a client reading an older server does not need it. */
  progress: taskProgress.optional(),
  my_shelf: shelfName.nullable(),
  my_color: hexColor.nullable(),
  /* The viewer's own Access preset. Gate controls with this via
     shared/folder-actions.ts, never with `is_owner`. */
  my_access: folderAccessPreset,
  /* The viewer's own Personal Labels on this Folder. Folder Labels never
     classify their own Folder. */
  personal_labels: z.array(labelRef),
  // The folder's own identity, the same for every member.
  icon: z.string().nullable(),
  color: hexColor.nullable(),
  cover_file_id: z.uuid().nullable(),
  cover_preset: z.string().nullable(),
  cover_focal_y: z.int().min(0).max(100),
  description: z.string().nullable(),
  /* The parent as this viewer may see it: null for a root, and also when the
     viewer cannot see the parent, so its id never leaks. `child_position` is a
     fractional-index key (C collation); null for roots. */
  parent_folder_id: z.uuid().nullable().optional(),
  child_position: z.string().nullable().optional(),
  /* The project root's id (a root is its own); `kind` is null only on an
     unpicked root; `tab_position` is null on a sub-page. */
  project_id: z.uuid(),
  kind: z.enum(PAGE_KINDS).nullable(),
  tab_position: z.string().nullable(),
})
export type Folder = z.infer<typeof folder>

/**
 * `GET /folders?tabs=1` lists every page, tabs included. Without it the answer
 * keeps the pre-tabs shape that installed old bundles still read.
 */
export const getFoldersQuery = z.object({
  tabs: z.literal('1', { error: "must be '1'" }).optional(),
})
export type GetFoldersQuery = z.infer<typeof getFoldersQuery>

/** The project's live tabs, in order, from a folder list. */
export function projectTabs<T extends Pick<Folder, 'id' | 'project_id' | 'tab_position'>>(
  folders: readonly T[],
  projectId: string,
): T[] {
  return folders
    .filter((f) => f.project_id === projectId && f.tab_position !== null)
    .sort((a, b) =>
      a.tab_position! < b.tab_position! ? -1 : a.tab_position! > b.tab_position! ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )
}

type TabRow = Pick<Folder, 'id' | 'project_id' | 'tab_position' | 'kind' | 'name'>

/** The Purpose tab: the first Doc tab before the root's own tab. Matches the server's `purposeTabOf`. */
export function purposeTab<T extends TabRow>(tabs: readonly T[]): T | undefined {
  const root = tabs.findIndex((tab) => tab.id === tab.project_id)
  return root < 0 ? undefined : tabs.slice(0, root).find((tab) => tab.kind === 'doc')
}

/** The Results tab: the first Doc tab after the root named Results. A renamed one is an ordinary Doc. */
export function resultsTab<T extends TabRow>(tabs: readonly T[]): T | undefined {
  const root = tabs.findIndex((tab) => tab.id === tab.project_id)
  return root < 0 ? undefined : tabs.slice(root + 1).find((tab) => tab.kind === 'doc' && tab.name === 'Results')
}

export const folderCrumb = z.object({
  id: z.uuid(),
  name: z.string(),
  icon: z.string().nullable(),
  color: hexColor.nullable(),
})
export type FolderCrumb = z.infer<typeof folderCrumb>

/*
PATCH /folders/:id/location. null parent makes a root; `after_id` null puts it
first, absent puts it last. Body ids the ac-397 sweep cannot see, so the route
gates them (404, 403); 422 on a cycle or depth over 20.
*/
export const patchFolderLocationBody = z.object({
  parent_folder_id: z.uuid({ error: 'must be a uuid' }).nullable(),
  after_id: z.uuid({ error: 'must be a uuid' }).nullable().optional(),
})
export type PatchFolderLocationBody = z.infer<typeof patchFolderLocationBody>
export const patchFolderLocationResponse = folder

/*
GET /folders answers a bare array. The member's person shape carries no email:
co-members are not necessarily connected.
*/

export const folderMemberUser = z.object({
  id: z.uuid(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
})

export const folderMember = z.object({
  user: folderMemberUser,
  // Ownership is the folder column, never this field (8.9).
  role: z.literal('member'),
  /* The member's Access preset, visible to every member. */
  access: folderAccessPreset,
  joined_at: z.iso.datetime(),
  is_owner: z.boolean(),
})
export type FolderMember = z.infer<typeof folderMember>

export const folderPendingInvite = z.object({
  id: z.uuid(),
  email: z.string().min(1),
  task_id: z.uuid().nullable(),
  /** Never null on a folder invite (CHECK); nullable because the column is. */
  access: folderAccessPreset.nullable(),
  created_at: z.iso.datetime(),
  last_sent_at: z.iso.datetime(),
})
export type FolderPendingInvite = z.infer<typeof folderPendingInvite>

export const getFoldersResponse = z.array(folder)
export type GetFoldersResponse = z.infer<typeof getFoldersResponse>

/**
 * GET /folders/:id. `pending_invites` is empty below Full control; the key
 * stays so "hidden" and "none" have one shape.
 */
export const getFolderResponse = folder.extend({
  /* Single read only, zeros included, unordered (key by `section_block_id`). */
  section_progress: z.array(sectionProgress).optional(),
  members: z.array(folderMember),
  pending_invites: z.array(folderPendingInvite),
  /* Ancestors, root first, cut at the first one the viewer cannot see, so its
     name never leaks. Empty for a root. */
  ancestors: z.array(folderCrumb).optional(),
})
export type GetFolderResponse = z.infer<typeof getFolderResponse>

export const patchFolderResponse = folder
export const patchFolderMyMembershipResponse = folder
export const postFolderMembersResponse = folderMember

export const deleteFolderResponse = z.object({
  deleted: z.object({
    tasks_open: z.int().nonnegative(),
    tasks_completed: z.int().nonnegative(),
    tasks_abandoned: z.int().nonnegative(),
  }),
})
export type DeleteFolderResponse = z.infer<typeof deleteFolderResponse>

/* POST /folders/:id/duplicate: the copy's identity; the client refetches the rest. */
export const duplicateFolderResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  /* How many days the plan moved; 0 when dates kept. */
  shifted_days: z.int().nonnegative(),
})
export type DuplicateFolderResponse = z.infer<typeof duplicateFolderResponse>

/* POST /folders/:id/transfer-ownership: the new owner only. */
export const transferOwnershipResponse = z.object({
  owner_id: z.uuid(),
})
export type TransferOwnershipResponse = z.infer<
  typeof transferOwnershipResponse
>
