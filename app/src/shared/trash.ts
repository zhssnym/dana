/*
The 7.13 Trash contract. The server's trashView is typed against these
schemas, so never declare the shape a second time. Kinds stay in separate
arrays (they carry different facts); the page interleaves them by deletion time.
*/
import { z } from 'zod'

import { FACET_KINDS } from './facets.js'
import { folderAccessPreset } from './folder-access.js'

/*
`my_access` and `is_owner` are both sent because permanent delete differs by
kind: `task.destroy` ignores ownership, `folder.destroy` needs owner and Full
control.
*/
export const trashedTask = z.object({
  id: z.uuid(),
  title: z.string(),
  folder_id: z.uuid(),
  /** Where it lived (9.11). */
  folder_name: z.string(),
  deleted_at: z.string(),
  /** Custody only; `task.destroy` ignores it. */
  is_owner: z.boolean(),
  my_access: folderAccessPreset,
})
export type TrashedTask = z.infer<typeof trashedTask>

export const trashedFolder = z.object({
  id: z.uuid(),
  name: z.string(),
  /** What comes back with it on restore. */
  task_count: z.number().int().nonnegative(),
  deleted_at: z.string(),
  /** `folder.destroy` needs this and Full control. */
  is_owner: z.boolean(),
  my_access: folderAccessPreset,
  /** The project's name when this page is a tab of it; null for a project or an unseen root. */
  project_name: z.string().nullable().default(null),
})
export type TrashedFolder = z.infer<typeof trashedFolder>

/*
A trashed custom facet. Its permanent delete follows the Task rule (ownership
ignored). Native facets are hidden, never trashed. `name` is resolved at read
time, as the facet list resolves it.
*/
export const trashedFacet = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(FACET_KINDS),
  folder_id: z.uuid(),
  folder_name: z.string(),
  deleted_at: z.string(),
  is_owner: z.boolean(),
  my_access: folderAccessPreset,
})
export type TrashedFacet = z.infer<typeof trashedFacet>

/*
A trashed Discussion. Purge is Full control (ownership ignored); restore is
Can edit, or the creator while unshared. `.default([])` so an older server's
response still parses.
*/
export const trashedDiscussion = z.object({
  id: z.uuid(),
  title: z.string(),
  folder_id: z.uuid(),
  folder_name: z.string(),
  deleted_at: z.string(),
  /** The own-unshared restore is the creator's. */
  created_by: z.uuid(),
  is_owner: z.boolean(),
  my_access: folderAccessPreset,
  /** Absent from an older server: treat as restorable. */
  restorable: z.boolean().optional(),
})
export type TrashedDiscussion = z.infer<typeof trashedDiscussion>

export const getTrashResponse = z.object({
  tasks: z.array(trashedTask),
  folders: z.array(trashedFolder),
  facets: z.array(trashedFacet),
  discussions: z.array(trashedDiscussion).default([]),
})
export type GetTrashResponse = z.infer<typeof getTrashResponse>
