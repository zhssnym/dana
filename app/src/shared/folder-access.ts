/*
The canonical Folder Access vocabulary, shared by the browser, the server and
the suite (issue #228; product authority #209 R8A for the presets, R9 for the
history, R9A for the history-surface boundary).

**One enum, declared once.** R8A's six presets are a capability ladder and not
an organizational-role hierarchy, and the thing it forbids by name is growing
a seventh preset — Manager, Foreman, Lead, Admin — to express narrower
authority. Those needs are a *scope* problem, and M1 has no scope primitive
beyond "the Folder" and "the Task currently assigned to you"; a preset invented
to stand in for one would be a permission nobody can reason about later.

The order below is the ladder's own, most authority first. It is load-bearing
in exactly one place — `atLeast` in the server's resolver reads the index — and
nowhere else, so nothing else may reorder it.

**The labels are the product's words and belong here rather than in a
component**, for the reason `app/src/shared` exists at all: a label declared
beside a control is a second definition of a contract the server also states,
and Dana has already paid for one of those (the reminder field of
`shared/tasks.ts`, lost for four packages while being declared the whole
time).
*/
import { z } from 'zod'

/* ------------------------------------------------------------------ *
 * The six presets
 * ------------------------------------------------------------------ */

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

/** R8A's UI labels. Read by the client; declared here so the client and any
 * server-rendered notice cannot disagree about what a preset is called. */
export const FOLDER_ACCESS_LABELS: Record<FolderAccessPreset, string> = {
  full_control: 'Full control',
  can_edit: 'Can edit',
  can_contribute: 'Can contribute',
  assigned_work: 'Assigned work',
  can_comment: 'Can comment',
  can_view: 'Can view',
}

/* ------------------------------------------------------------------ *
 * The transition kinds (R9 section 3)
 * ------------------------------------------------------------------ */

/**
 * The append-only history's transition vocabulary. R9 lists these as
 * "recommended" labels and permits a normalized code of the backend's own so
 * long as the distinctions survive; the labels are used verbatim, because a
 * second naming scheme would have to be translated at every reader.
 *
 * `migration_initialized` is the only kind admitting a null actor, and the
 * database says so as well as this file: a governed system grant and a grant
 * somebody made must never be able to wear each other's provenance.
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

/* ------------------------------------------------------------------ *
 * Request bodies
 * ------------------------------------------------------------------ */

/**
 * PATCH /folders/:id/members/:userId — change one member's Access.
 *
 * `expected_access` is optional and is R9 section 16's serialization handle:
 * when it is sent, the change applies only if the member's authoritative
 * current preset still matches, so two racing administrators cannot both
 * record a transition claiming the same `from`. Absent, the row lock alone
 * serializes them and the second one's `from` is the first one's `to`, which
 * is true but is not what either administrator saw on their screen.
 */
export const patchFolderMemberAccessBody = z.object({
  access: folderAccessPreset,
  expected_access: folderAccessPreset.optional(),
})
export type PatchFolderMemberAccessBody = z.infer<
  typeof patchFolderMemberAccessBody
>

/**
 * POST /folders/:id/owner-recovery — the structural owner restoring their own
 * ordinary Access to Full control (R5 "Owner Access may be restricted", R9
 * section 8). It carries no body: the actor, the folder and the target preset
 * are all fixed by the act.
 */
export const postFolderOwnerRecoveryBody = z.object({})

/* ------------------------------------------------------------------ *
 * Projections
 * ------------------------------------------------------------------ */

/**
 * One Access transition on the wire. `previous_access` null is first
 * activation and `new_access` null is the end of active membership; both null
 * is refused by the table's own CHECK and so cannot arrive here.
 *
 * `actor` is null only for a governed system transition. It is the person
 * shape the rest of the surface uses (7.0) rather than a bare id, because
 * every reader of this list renders a name.
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
