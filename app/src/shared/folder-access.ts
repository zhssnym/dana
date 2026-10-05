/*
The Folder Access vocabulary: six presets, most authority first. The order
matters to `atLeast`. Never add a seventh preset to express narrower authority.
Labels live here so client and server use the same words.
*/
import { z } from 'zod'

export const FOLDER_ACCESS_PRESETS = [
  'full_control',
  'can_edit',
  'can_contribute',
  'assigned_work',
  'can_comment',
  'can_view',
] as const

export type FolderAccessPreset = (typeof FOLDER_ACCESS_PRESETS)[number]

export const folderAccessPreset = z.enum(FOLDER_ACCESS_PRESETS, {
  error: 'must be one of full_control, can_edit, can_contribute, assigned_work, can_comment, can_view',
})

/** The UI labels for each preset. */
export const FOLDER_ACCESS_LABELS: Record<FolderAccessPreset, string> = {
  full_control: 'Full control',
  can_edit: 'Can edit',
  can_contribute: 'Can contribute',
  assigned_work: 'Assigned work',
  can_comment: 'Can comment',
  can_view: 'Can view',
}

/**
 * Access history transitions. Only `migration_initialized` may have a null
 * actor (also enforced by the database).
 */
export const FOLDER_ACCESS_TRANSITIONS = [
  'created_owner',
  'member_added',
  'invite_accepted',
  'access_changed',
  'self_demoted',
  'owner_recovered_full_control',
  'member_left',
  'member_removed',
  'migration_initialized',
] as const

export type FolderAccessTransition = (typeof FOLDER_ACCESS_TRANSITIONS)[number]

export const folderAccessTransition = z.enum(FOLDER_ACCESS_TRANSITIONS)

/**
 * PATCH /folders/:id/members/:userId. When `expected_access` is sent, the change
 * applies only if the current preset still matches, so two racing admins cannot
 * record the same `from`.
 */
export const patchFolderMemberAccessBody = z.object({
  access: folderAccessPreset,
  expected_access: folderAccessPreset.optional(),
})
export type PatchFolderMemberAccessBody = z.infer<
  typeof patchFolderMemberAccessBody
>

/** POST /folders/:id/owner-recovery; no body. */
export const postFolderOwnerRecoveryBody = z.object({})

/**
 * One Access transition. `previous_access` null is first activation;
 * `new_access` null ends membership. `actor` is null only for a system transition.
 */
export const folderAccessHistoryActor = z.object({
  id: z.uuid(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
})

export const folderAccessHistoryEntry = z.object({
  id: z.uuid(),
  folder_id: z.uuid(),
  member_id: z.uuid(),
  previous_access: folderAccessPreset.nullable(),
  new_access: folderAccessPreset.nullable(),
  actor: folderAccessHistoryActor.nullable(),
  transition: folderAccessTransition,
  effective_at: z.iso.datetime(),
})
export type FolderAccessHistoryEntry = z.infer<typeof folderAccessHistoryEntry>

export const getFolderAccessHistoryResponse = z.object({
  entries: z.array(folderAccessHistoryEntry),
})
export type GetFolderAccessHistoryResponse = z.infer<
  typeof getFolderAccessHistoryResponse
>
