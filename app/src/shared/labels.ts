/*
The M1 Label contract (issue #226, parent #208): the two scopes, the field
primitives, the request bodies, and the two read shapes both sides import.

It lives here for the reason `me.ts` gives and `folders.ts` repeats: this
directory is the one artifact the client, the server and the tests all import,
and a shape declared beside a handler is a second definition of the same
promise.

**Scope is part of identity, and nothing here lets a name stand in for one.**
Personal `Research`, Folder A `Research` and Folder B `Research` are three
Labels. Every request and every projection below names a Label by its id, and
the only place a name appears is where a person typed one.

Two read shapes rather than one, which #208 asks for in those words:

- **LabelDefinition** is what a picker or the manage surface reads. It carries
  the description, because that is where a person is choosing between two
  Labels and needs to be told what each means.
- **LabelRef** is what a Task or Folder projection carries, once per applied
  Label per row. It drops the description, because a dense row renders a chip
  and never a sentence, and a description on every chip of every card in a
  thousand-row list is bytes nobody reads.

**Neither shape carries `owner_user_id`.** A Personal definition a viewer can
read is by construction their own — the server admits no other — so the field
would be a constant, and a constant that happens to be an account id is a
discovery surface rather than information. #208 says so directly.

The body-schema conventions are `folders.ts`'s: `z.object` so unknown fields
are stripped rather than refused (7.0 tolerates them, 11.14), a camelCase schema named for method and route, its inferred
PascalCase type beside it, and per-field messages phrased without the field
name, because `sendValidationError` prefixes the path when it builds the 422.
*/
import { z } from 'zod'

import { LIST_ROW_CAP } from './list-cap.js'

/* ------------------------------------------------------------------ *
 * The field primitives
 * ------------------------------------------------------------------ */

/**
 * The two scopes M1 has, and #208 is explicit that there is no third: a
 * Library scope spanning several Folders is M2+, and a Personal Label applied
 * to a Folder is still a Personal Label rather than a scope of its own.
 *
 * This is `labels_scope_check` in migration 0022, restated where the wire can
 * read it.
 */
export const labelScope = z.enum(['personal', 'folder'], {
  error: "must be 'personal' or 'folder'",
})
export type LabelScope = z.infer<typeof labelScope>

/**
 * 1 to 40 characters after trimming, the bound #208 fixes and
 * `labels_name_length_check` stores.
 *
 * The trim is part of the primitive rather than of each handler, because a
 * name is compared case-insensitively against every other name in its catalog
 * and two names differing only by a trailing space would otherwise be two
 * Labels a person cannot tell apart. `.trim()` runs before the length checks,
 * so `"   "` is refused as empty rather than accepted as three characters.
 */
export const labelName = z
  .string({ error: 'must be a string' })
  .trim()
  .min(1, { error: 'must be 1 to 40 characters' })
  .max(40, { error: 'must be 1 to 40 characters' })

/** The canonical #RRGGBB value, the same rule `folders.ts`'s hexColor states
 * and `labels_color_format_check` stores. Required on every Label: #208 makes
 * colour part of what a Label is rather than an optional decoration. */
export const labelColor = z
  .string({ error: 'must be a string' })
  .regex(/^#[0-9A-Fa-f]{6}$/, { error: 'must be a hex color in #RRGGBB form' })

/** Optional, 100 characters, `labels_description_length_check`. Trimmed for
 * the name's reason; an all-whitespace description is stored as the empty
 * string rather than refused, because nothing turns on it. */
export const labelDescription = z
  .string({ error: 'must be a string' })
  .trim()
  .max(100, { error: 'must be 100 characters or fewer' })

/* ------------------------------------------------------------------ *
 * The caps, named where both sides can read them
 * ------------------------------------------------------------------ */

/*
#208 calls these technical safety limits rather than taxonomy guidance, and
says in terms that any hard limit is product-visible contract and must be
recorded explicitly rather than hidden in an implementation. So they are
constants here, the refusal messages are built from them, and the criteria
assert the number rather than a sentence.

Each is enforced by a count taken under a lock in the same transaction as the
insert it admits, which is this codebase's existing cap discipline (10.3): a
count that is not tied to its insert is a suggestion, because two creates
arriving together at the limit both read the limit and both insert.
*/

/** Personal Label definitions one account may hold. */
export const PERSONAL_LABEL_DEFINITION_CAP = 500

/** Folder Label definitions one Folder may hold. */
export const FOLDER_LABEL_DEFINITION_CAP = 250

/** Personal Labels one viewer may apply to one Task. Per viewer, because a
 * Personal assignment is private to its owner: one person filling their
 * hundred cannot stop another from applying their first. */
export const TASK_PERSONAL_LABEL_CAP = 100

/** Folder Labels one Task may carry. Shared, unlike the one above: the
 * assignments are the Folder's and every member sees all of them. */
export const TASK_FOLDER_LABEL_CAP = 100

/** Personal Labels one viewer may apply to one Folder, per viewer for the
 * Task cap's reason. */
export const FOLDER_PERSONAL_LABEL_CAP = 100

/* ------------------------------------------------------------------ *
 * Request bodies
 * ------------------------------------------------------------------ */

/** POST /labels/personal. The viewer is the owner; there is no field for it,
 * because an owner a caller could name is an owner a caller could get wrong. */
export const postPersonalLabelBody = z.object({
  name: labelName,
  color: labelColor,
  description: labelDescription.nullable().optional(),
})
export type PostPersonalLabelBody = z.infer<typeof postPersonalLabelBody>

/**
 * PATCH /labels/personal/:labelId. Any subset of the three.
 *
 * The PATCH convention that holds across section 7 (7.2 "any
 * subset", 7.6 "only present fields change"): an absent field is left alone
 * and a present one must be valid. Archived state is not here — it moves
 * through the two dedicated endpoints, so that "rename" and "retire" are two
 * different acts with two different audit lines rather than one body that can
 * do both by accident. Editing an archived Label is allowed, which #208 says
 * outright, so nothing in this schema asks about it.
 */
export const patchPersonalLabelBody = z.object({
  name: labelName.optional(),
  color: labelColor.optional(),
  description: labelDescription.nullable().optional(),
})
export type PatchPersonalLabelBody = z.infer<typeof patchPersonalLabelBody>

/** POST /folders/:folderId/labels. The Folder is the path's; the body is the
 * three fields a definition carries. Deliberately a separate schema from the
 * Personal create although the fields coincide today, for `folders.ts`'s
 * reason: each endpoint's body carries its own route's rules, and the shared
 * primitives above keep the rules one apiece. */
export const postFolderLabelBody = z.object({
  name: labelName,
  color: labelColor,
  description: labelDescription.nullable().optional(),
})
export type PostFolderLabelBody = z.infer<typeof postFolderLabelBody>

/** PATCH /folders/:folderId/labels/:labelId, the Personal patch's twin. */
export const patchFolderLabelBody = z.object({
  name: labelName.optional(),
  color: labelColor.optional(),
  description: labelDescription.nullable().optional(),
})
export type PatchFolderLabelBody = z.infer<typeof patchFolderLabelBody>

/* ------------------------------------------------------------------ *
 * The definition listing query
 * ------------------------------------------------------------------ */

/**
 * GET /labels' three optional query fields.
 *
 * Defaults are in the schema rather than in the handler so that both sides
 * read one answer to "what does an empty query mean": every scope, active
 * only. Active-only is the default because the ordinary caller is filling a
 * picker, and #208 wants archived Labels discoverable rather than ambient.
 *
 * `folder_id` narrows the Folder half to one Folder. An inaccessible one is
 * 404 rather than 403, which is 10.2's rule and is the handler's to apply:
 * this schema only says the value is a uuid.
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

/* ------------------------------------------------------------------ *
 * The read shapes
 * ------------------------------------------------------------------ */

/*
`archived` is a boolean on the wire and `archived_at` in the row. The instant
is the server's bookkeeping; what a client renders and what a filter asks
about is the state. Exposing the instant would invite a client to compute the
state from it, which is a second definition of the same fact.

`folder_id` is present on both shapes and is null for a Personal Label rather
than absent. #208 writes it as "folder_id for Folder Labels, null/absent for
Personal Labels" and leaves the choice; always-present is taken for the reason
`taskReminder` in `tasks.ts` gives for its own two keys — a stable key set is
read without narrowing a union, and storage and wire cannot drift apart.
*/

/** The whole of a Label, for a picker or the manage surface. */
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

/** The compact reference a Task or Folder projection carries. */
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
 * The Labels a TaskCard and a TaskDetail carry: the viewer's own Personal
 * ones, and the Task's Folder ones.
 *
 * **Never another member's Personal Labels**, which is the single most
 * important sentence in #226 and is a property of the queries rather than of
 * this shape. The shape is what makes the promise legible: two arrays, one
 * private to the viewer and one shared by the Folder, rather than one array
 * whose privacy a reader has to take on trust.
 *
 * Both arrays are ordered: active before archived, then lower(name), then id.
 * The order is the query's to produce and is asserted by the criteria; it is
 * written down here because two producers make these rows — `taskView` for a
 * single Task and `readCards` for every list — and an order stated in one
 * place they both read is an order they cannot disagree about.
 */
export const taskLabels = z.object({
  personal: z.array(labelRef),
  folder: z.array(labelRef),
})
export type TaskLabels = z.infer<typeof taskLabels>

/* ------------------------------------------------------------------ *
 * Response shapes
 * ------------------------------------------------------------------ */

/**
 * GET /labels: `{ rows, truncated }`, 10.3's capped-list shape.
 *
 * **It was a bare array until 2026-09-20 and the change is the cap**, not a
 * preference about wrappers. 10.3's standing rule is "List responses capped at
 * 1000 rows with truncated flag", and this listing's worst case is 500
 * Personal definitions plus 250 for every Folder the viewer belongs to, so it
 * is one of the lists that rule is about. A flag needs somewhere to live, and
 * a bare array has nowhere; `{ rows, truncated }` is the spelling
 * `getPlannedResponse` and `getImportantResponse` already use for a capped
 * body with one section, followed here rather than a second one invented.
 *
 * The cap is the shared `LIST_ROW_CAP` rather than a number of this feature's
 * own, and it is one number across the whole response rather than one per
 * scope: that is section 6's per-response reading as ruled on 2026-08-07, and
 * a Personal cap separate from a Folder cap would be a contract decision 10.3
 * has not taken.
 */
export const getLabelsResponse = z
  .object({
    rows: z.array(labelDefinition),
    truncated: z.boolean(),
  })
  .refine((body) => body.rows.length <= LIST_ROW_CAP, {
    error: `must carry at most ${String(LIST_ROW_CAP)} rows (spec 10.3)`,
  })
export type GetLabelsResponse = z.infer<typeof getLabelsResponse>

/** The four definition-writing endpoints of each scope answer the definition
 * they wrote, which is the PATCH /me convention this surface inherits: a
 * mutation answers what a fresh read would. */
export const postLabelResponse = labelDefinition
export const patchLabelResponse = labelDefinition
export const archiveLabelResponse = labelDefinition
export const restoreLabelResponse = labelDefinition
