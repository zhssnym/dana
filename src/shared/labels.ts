/*
The Label contract: scopes, field primitives, bodies and read shapes. Labels
are always named by id: the same name in two scopes is two Labels. Neither read
shape carries `owner_user_id`: it would always be the viewer's own account id.
*/
import { z } from 'zod'

import { LIST_ROW_CAP } from './list-cap.js'

/** The two scopes (`labels_scope_check`, migration 0022). */
export const labelScope = z.enum(['personal', 'folder'], {
  error: "must be 'personal' or 'folder'",
})
export type LabelScope = z.infer<typeof labelScope>

/**
 * 1 to 40 characters after trim (zod trims first), so names differing only by
 * spaces cannot coexist.
 */
export const labelName = z
  .string({ error: 'must be a string' })
  .trim()
  .min(1, { error: 'must be 1 to 40 characters' })
  .max(40, { error: 'must be 1 to 40 characters' })

/** #RRGGBB, required (`labels_color_format_check`). */
export const labelColor = z
  .string({ error: 'must be a string' })
  .regex(/^#[0-9A-Fa-f]{6}$/, { error: 'must be a hex color in #RRGGBB form' })

/** Up to 100, trimmed (`labels_description_length_check`). */
export const labelDescription = z
  .string({ error: 'must be a string' })
  .trim()
  .max(100, { error: 'must be 100 characters or fewer' })

/*
Product-visible caps (#208). Each is enforced by a count under a lock in the
same transaction as the insert, or two concurrent creates could both pass.
*/

export const PERSONAL_LABEL_DEFINITION_CAP = 500

export const FOLDER_LABEL_DEFINITION_CAP = 250

/** Per viewer: Personal assignments are private. */
export const TASK_PERSONAL_LABEL_CAP = 100

/** Shared: Folder assignments belong to the Folder. */
export const TASK_FOLDER_LABEL_CAP = 100

/** Per viewer. */
export const FOLDER_PERSONAL_LABEL_CAP = 100

/** POST /labels/personal. The owner is always the viewer; there is no field for it. */
export const postPersonalLabelBody = z.object({
  name: labelName,
  color: labelColor,
  description: labelDescription.nullable().optional(),
})
export type PostPersonalLabelBody = z.infer<typeof postPersonalLabelBody>

/**
 * PATCH /labels/personal/:labelId. Absent fields are left alone. Archiving has
 * its own endpoints, so rename and retire stay separate acts.
 */
export const patchPersonalLabelBody = z.object({
  name: labelName.optional(),
  color: labelColor.optional(),
  description: labelDescription.nullable().optional(),
})
export type PatchPersonalLabelBody = z.infer<typeof patchPersonalLabelBody>

/** POST /folders/:folderId/labels. Separate from the Personal schema so each route owns its body. */
export const postFolderLabelBody = z.object({
  name: labelName,
  color: labelColor,
  description: labelDescription.nullable().optional(),
})
export type PostFolderLabelBody = z.infer<typeof postFolderLabelBody>

export const patchFolderLabelBody = z.object({
  name: labelName.optional(),
  color: labelColor.optional(),
  description: labelDescription.nullable().optional(),
})
export type PatchFolderLabelBody = z.infer<typeof patchFolderLabelBody>

/**
 * GET /labels. An empty query means every scope, active only. An inaccessible
 * `folder_id` is 404 (the handler's job).
 */
export const getLabelsQuery = z.object({
  scope: z
    .enum(['personal', 'folder', 'all'], {
      error: "must be 'personal', 'folder' or 'all'",
    })
    .default('all'),
  state: z
    .enum(['active', 'archived', 'all'], {
      error: "must be 'active', 'archived' or 'all'",
    })
    .default('active'),
  folder_id: z.uuid({ error: 'must be a uuid' }).optional(),
})
export type GetLabelsQuery = z.infer<typeof getLabelsQuery>

/*
`archived` is the state, not `archived_at`, so clients cannot derive it a
second way. `folder_id` is always present: null for Personal Labels.
*/

export const labelDefinition = z.object({
  id: z.uuid(),
  scope: labelScope,
  name: labelName,
  color: labelColor,
  description: z.string().nullable(),
  archived: z.boolean(),
  folder_id: z.uuid().nullable(),
})
export type LabelDefinition = z.infer<typeof labelDefinition>

export const labelRef = z.object({
  id: z.uuid(),
  scope: labelScope,
  name: labelName,
  color: labelColor,
  archived: z.boolean(),
  folder_id: z.uuid().nullable(),
})
export type LabelRef = z.infer<typeof labelRef>

/**
 * The viewer's own Personal Labels and the Task's Folder Labels; never another
 * member's Personal ones. Ordered active first, then lower(name), then id, by
 * both producers (`taskView` and `readCards`).
 */
export const taskLabels = z.object({
  personal: z.array(labelRef),
  folder: z.array(labelRef),
})
export type TaskLabels = z.infer<typeof taskLabels>

/** GET /labels: 10.3's capped `{ rows, truncated }`, one cap across both scopes. */
export const getLabelsResponse = z
  .object({
    rows: z.array(labelDefinition),
    truncated: z.boolean(),
  })
  .refine((body) => body.rows.length <= LIST_ROW_CAP, {
    error: `must carry at most ${String(LIST_ROW_CAP)} rows (spec 10.3)`,
  })
export type GetLabelsResponse = z.infer<typeof getLabelsResponse>

/** The writing endpoints answer the definition they wrote. */
export const postLabelResponse = labelDefinition
export const patchLabelResponse = labelDefinition
export const archiveLabelResponse = labelDefinition
export const restoreLabelResponse = labelDefinition
