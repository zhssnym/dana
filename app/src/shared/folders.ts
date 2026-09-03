/*
The 7.4 folder and membership surface as code: the request bodies the server
validates with, and the 7.0 Folder object both sides read.

The body-schema conventions are me.ts's: z.object so unknown fields are
stripped, never refused (7.0 tolerates them), a camelCase schema named for
method and route, its inferred PascalCase type beside it, and per-field
messages phrased without the field name, because sendValidationError prefixes
the path when it builds the 422 (10.3).

Deliberately absent: the GET /folders response wrapper and the GET
/folders/:id composition of members and pending invites. Frozen 7.4 fixes
the Folder objects and their order but names no wrapper key, a gap the
tester routed to this role's endpoint shape review session (RFC 0001 P2
row). The schemas here stop where the frozen text stops, so that session
decides the open shape once, with the implemented routes in front of it.
*/
import { z } from 'zod'

/*
The three 7.4 field primitives, one definition each so the write path, the
read path, and the client's convenience validation cannot drift. The lengths
are 10.3's rows (folder name 1 to 100, personal label 1 to 40); the color
pattern is the 4.4 CHECK as migration 0000 names it, six hex digits of
either case behind a hash.
*/
export const folderName = z
  .string({ error: 'must be a string' })
  .min(1, { error: 'must be 1 to 100 characters' })
  .max(100, { error: 'must be 1 to 100 characters' })

export const personalLabel = z
  .string({ error: 'must be a string' })
  .min(1, { error: 'must be 1 to 40 characters' })
  .max(40, { error: 'must be 1 to 40 characters' })

export const hexColor = z
  .string({ error: 'must be a string' })
  .regex(/^#[0-9A-Fa-f]{6}$/, { error: 'must be a hex color in #RRGGBB form' })

// POST /folders. Body { name }, 422 outside 1 to 100 (7.4, 10.3). The
// 200-custom-folder cap is a count the domain module resolves, not a body
// fact.
export const postFoldersBody = z.object({
  name: folderName,
})
export type PostFoldersBody = z.infer<typeof postFoldersBody>

// PATCH /folders/:id. Body { name }: the rename, default folder included
// (7.4). The same one-field shape as the create, declared separately so
// each endpoint's body carries its route's name; the shared primitive keeps
// the two one rule.
/** 4.20's preset key shape, shared by a folder's cover since item 58. */
const coverPreset = z
  .string()
  .regex(/^[a-z0-9-]{1,40}$/, 'must be a preset key')

export const patchFolderBody = z.object({
  name: folderName.optional(),
  // The 4.3 identity, folder-owned since RFC 0005 (D1): any member writes
  // these four; the rename above stays the owner's, and the route splits
  // the two by role rather than this schema. The icon key is
  // pattern-validated until S8 exports the set; the server stores it
  // opaquely either way.
  icon: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/, 'must be an icon key')
    .nullable()
    .optional(),
  color: hexColor.nullable().optional(),
  cover_file_id: z.uuid().nullable().optional(),
  /* 4.3 as widened by RFC 0005 change control item 58: the preset and the
     crop 4.20 gives a place page, so a folder can wear every tier a place
     can. A file and a preset are one source: setting either clears the
     other server-side, and a body naming both is refused. */
  cover_preset: coverPreset.nullable().optional(),
  cover_focal_y: z.int().min(0).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
}).refine(
  (body) => !(body.cover_file_id != null && body.cover_preset != null),
  { message: 'cover_file_id and cover_preset: a cover is a file or a preset, not both', path: ['cover_preset'] },
)
export type PatchFolderBody = z.infer<typeof patchFolderBody>

/*
PATCH /folders/:id/my-membership. Body { label, color }, either nullable
(7.4); null clears the field, which 4.4 stores as null.

Presence follows the PATCH convention that holds everywhere else in the
frozen surface (7.2 "any subset", 7.6 "only present fields change", 7.7
"any subset"): an absent field is left alone, a present one must be valid.
7.4's terser sentence is read the same way rather than as the surface's one
full-body PATCH. The route convention (validate, then delegate) also
requires it: AC-023 probes a label-only body against an inaccessible folder
and must reach the 404, so the schema cannot refuse the absent color first.
*/
export const patchFolderMyMembershipBody = z.object({
  label: personalLabel.nullable().optional(),
  color: hexColor.nullable().optional(),
})
export type PatchFolderMyMembershipBody = z.infer<
  typeof patchFolderMyMembershipBody
>

// POST /folders/:id/members. Body { user_id }: the target account. The body
// fact is only that user_id is a uuid; everything else the endpoint refuses
// (default folder, existing member, missing roster connection, the 25 cap)
// is state, resolved by the domain module against 5.3 row 1.
export const postFolderMembersBody = z.object({
  user_id: z.uuid({ error: 'must be a uuid' }),
})
export type PostFolderMembersBody = z.infer<typeof postFolderMembersBody>

/*
The 7.0 Folder object, the row shape of GET /folders and the base of GET
/folders/:id. It lives here for the me.ts reason: app/src/shared is the one
artifact the client, the server, and the tests all import, and a shape
declared beside a handler is a second definition of the same promise.

Field truths, each from its owning section: name, my_label, and my_color
reuse the write primitives because the 4.3 and 4.4 CHECKs guarantee stored
values satisfy them already; is_owner derives from folders.owner_id, the one
ownership source (4.3); member_count is at least 1 because INV-10 keeps the
owner's membership row on every folder that exists; counts are 8.11's
pending and completed tallies, abandoned rows on neither side; my_label and
my_color are null for a member who set none (4.4).
*/
export const folder = z.object({
  id: z.uuid(),
  name: folderName,
  is_default: z.boolean(),
  is_owner: z.boolean(),
  member_count: z.int().min(1),
  counts: z.object({
    pending: z.int().nonnegative(),
    completed: z.int().nonnegative(),
  }),
  my_label: personalLabel.nullable(),
  my_color: hexColor.nullable(),
  // The 4.3 identity (RFC 0005): the folder's own, one look for every
  // member, null where never set.
  icon: z.string().nullable(),
  color: hexColor.nullable(),
  cover_file_id: z.uuid().nullable(),
  cover_preset: z.string().nullable(),
  cover_focal_y: z.int().min(0).max(100),
  description: z.string().nullable(),
})
export type Folder = z.infer<typeof folder>

/*
The response side of 7.4, settled at this role's P2 shape review. Frozen
7.4 fixes the Folder object, the members and pending-invites element
fields, and the DELETE response; the four decisions below are the ones it
leaves open, each settled here with its grounds, and each a candidate for
a one-sentence recording in the frozen text through the Steward (the
PATCH /me precedent from the P1 merge):

- GET /folders answers the bare array. The section's own notation draws
  the line: 7.10's view endpoints write their wrappers out ({ rows,
  truncated }) because those responses carry more than rows, while 7.4
  and 7.5 write lists. A wrapper here would be a shape the frozen text
  never wrote, and the acceptance harness reads the bare form as the
  literal one.
- The detail's invite key is pending_invites. "Pending invites" is prose
  that cannot be a key verbatim; this transcribes it, and stays distinct
  from 7.5's /invites responses, which list every status.
- The person inside a members element is 7.0's person shape, {id,
  display_name, avatar_url}, the object TaskCard's assignee already
  uses. 7.3 adds email to the roster's user object explicitly; 7.4 does
  not, the 9.x sharing panel renders names and join dates and never a
  member's address, and co-members are not necessarily connected, so the
  contract carries no address nothing consumes.
- Mutations answer what a fresh GET would: PATCH /folders/:id and PATCH
  .../my-membership answer the Folder object (the ruled PATCH /me
  convention), and POST members answers the member element it created.
*/

export const folderMemberUser = z.object({
  id: z.uuid(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
})

export const folderMember = z.object({
  user: folderMemberUser,
  // 4.4 admits exactly 'member' in v1; ownership is the folder column,
  // never this field (8.9).
  role: z.literal('member'),
  joined_at: z.iso.datetime(),
  is_owner: z.boolean(),
})
export type FolderMember = z.infer<typeof folderMember>

export const folderPendingInvite = z.object({
  id: z.uuid(),
  email: z.string().min(1),
  task_id: z.uuid().nullable(),
  created_at: z.iso.datetime(),
  last_sent_at: z.iso.datetime(),
})
export type FolderPendingInvite = z.infer<typeof folderPendingInvite>

export const getFoldersResponse = z.array(folder)
export type GetFoldersResponse = z.infer<typeof getFoldersResponse>

export const getFolderResponse = folder.extend({
  members: z.array(folderMember),
  pending_invites: z.array(folderPendingInvite),
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

/*
POST /folders/:id/duplicate (7.16) answers the copy's identity and nothing
more: the copy is the duplicator's own private folder, and the client's next
read of /folders carries it in full. Written from `routes/workshop.ts` by the
S12 client arm on 2026-08-25, the read-half discipline of the sibling
modules.
*/
export const duplicateFolderResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  /* How many days the plan moved, 0 where every date kept (7.16 as widened
     by RFC 0005 change control item 58; ledger L-055's bar reads it). */
  shifted_days: z.int().nonnegative(),
})
export type DuplicateFolderResponse = z.infer<typeof duplicateFolderResponse>

/*
POST /folders/:id/transfer-ownership (7.16, 8.9's direct form) answers the
folder's new owner and nothing else; the client refetches the folder for the
rest.

Written here at #39, where it was a fifth restatement of a server literal: the
schema lived in `client/api/mutations.ts` and the object in
`routes/workshop.ts`, with nothing between them. It sits beside the duplicate
response above because both are 7.16 acts on a folder and this file already
owns that surface's answers.
*/
export const transferOwnershipResponse = z.object({
  owner_id: z.uuid(),
})
export type TransferOwnershipResponse = z.infer<
  typeof transferOwnershipResponse
>
