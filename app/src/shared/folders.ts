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

import { folderAccessPreset } from './folder-access.js'
import { labelRef } from './labels.js'
import { responsibilityDocument } from './responsibility.js'

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

/**
 * The viewer's own Shelf membership on a folder: 4.18's `folder_members`
 * column, 1 to 40 characters, held in step with `shelves.name`.
 *
 * **It was called `personalLabel` until issue #226 and it never was one.** A
 * Shelf is how one person groups their own folders; a Label is the M1
 * classification vocabulary of #208, which is a different model with its own
 * table, its own scopes and its own endpoints. The two words collided in the
 * database, in this contract and on the screen, and #226 renames the Shelf
 * side of the collision rather than the Label side, because the Label side is
 * the one that matches what the word means everywhere else. Nothing about
 * Shelf semantics moved with the name.
 */
export const shelfName = z
  .string({ error: 'must be a string' })
  .min(1, { error: 'must be 1 to 40 characters' })
  .max(40, { error: 'must be 1 to 40 characters' })

export const hexColor = z
  .string({ error: 'must be a string' })
  .regex(/^#[0-9A-Fa-f]{6}$/, { error: 'must be a hex color in #RRGGBB form' })

/*
A fourth primitive, and 4.3's `description`: the sentence a folder's page
opens with, bounded by that table's `folders_description_length_check` at 500
characters. It is one definition for the same reason the three above are, and
the reason became load-bearing on 2026-09-04 (issues #21 and #70): two
endpoints write this column now, the create as well as the rename, and a
folder that could be started with a sentence no later edit could restore
would be two rules wearing one column's name. The message is this file's
convention rather than zod's default, which reads "expected string to have
<=500 characters" beside "must be 1 to 100 characters"; the PATCH's 422 moves
to the same wording with it, being the same rule.

Nullable and optional are left to each body, so that each endpoint says for
itself what an absent field means.
*/
export const folderDescription = z
  .string({ error: 'must be a string' })
  .max(500, { error: 'must be 500 characters or fewer' })

/*
POST /folders. Body { name, description }, 422 outside 1 to 100 (7.4, 10.3).
The 200-custom-folder cap is a count the domain module resolves, not a body
fact.

`description` joined the create on 2026-09-04 (7.4's dated paragraph, issues
#21 and #70): a new folder starts with a sentence, and the sentence has to
ride the create because the gesture that makes a folder is one request. AC-279
counts the mutations the hold writes and admits `POST /folders` plus the task
moves and nothing else, so a follow-up PATCH is not a slower way to do this,
it is a different act that fails a criterion. Absent or null is NULL, which is
what a folder made before this carried and still carries.
*/
export const postFoldersBody = z.object({
  name: folderName,
  description: folderDescription.nullable().optional(),
})
export type PostFoldersBody = z.infer<typeof postFoldersBody>

// PATCH /folders/:id. Body { name }: the rename, default folder included
// (7.4). The same name rule as the create, declared separately so each
// endpoint's body carries its route's name; the shared primitives keep the
// name and the description one rule apiece.
/** 4.20's preset key shape, shared by a folder's cover since item 58. */
const coverPreset = z
  .string()
  .regex(/^[a-z0-9-]{1,40}$/, 'must be a preset key')

export const patchFolderBody = z.object({
  name: folderName.optional(),
  // The 4.3 identity, folder-owned since RFC 0005 (D1). **The DES-225 split
  // this comment used to describe is gone** -- it read "any member writes
  // these four; the rename above stays the owner's, and the route splits the
  // two by role rather than this schema", and by issue #228 the route had
  // stopped doing that while the sentence stayed. The name and the dressing
  // are one thing now, ordinary shared Folder work that Can edit and above
  // change and nobody below does; accepted #209 R8A, AC-011, AC-012 and
  // AC-193. The schema still splits nothing by authority -- that is the
  // route's single `folder.profile.edit` gate. The icon key is
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
  description: folderDescription.nullable().optional(),
}).refine(
  (body) => !(body.cover_file_id != null && body.cover_preset != null),
  { message: 'cover_file_id and cover_preset: a cover is a file or a preset, not both', path: ['cover_preset'] },
)
export type PatchFolderBody = z.infer<typeof patchFolderBody>

/*
PATCH /folders/:id/my-membership. Body { shelf, color }, either nullable
(7.4); null clears the field, which 4.4 stores as null. The first key was
`label` until issue #226 gave the word back to #208's Label model; it is the
same field writing the same column, and **`shelf` is now the only spelling the
body carries**, which the schema below explains and AC-750 asserts.

Presence follows the PATCH convention that holds everywhere else in the
frozen surface (7.2 "any subset", 7.6 "only present fields change", 7.7
"any subset"): an absent field is left alone, a present one must be valid.
7.4's terser sentence is read the same way rather than as the surface's one
full-body PATCH. The route convention (validate, then delegate) also
requires it: AC-023 probes a label-only body against an inaccessible folder
and must reach the 404, so the schema cannot refuse the absent color first.
*/
export const patchFolderMyMembershipBody = z.object({
  /* **`shelf` is the only spelling, since issue #247 closed the pair.** The
     field was `label` until issue #226, and it was renamed with the column it
     writes: this has always been the viewer's Shelf membership rather than a
     classification Label, and the Label model of #208 needed the word back.

     **Both were declared for one release, and that was expand-and-contract
     applied to the wire rather than tolerance for an old client.** The column
     rename underneath went the same way (migration 0022), for the reason hard
     stop 1 gives: Render brings the new instance up and waits for its health
     checks before draining the old one. The same hazard reaches one layer up
     and its failure mode is worse. One deployable serves the SPA and the API
     together, but a browser tab open across a deploy keeps its old bundle and
     goes on calling the new API, and a tab outlives a deploy by as long as
     somebody leaves it open. This is a `z.object`, so at the moment of the
     rename a tab still holding the old bundle would have had its `label`
     **stripped** (7.0 tolerates unknown keys, 11.14 rules that no schema here
     becomes strict), `shelf` would then have been absent, `setMyMembership`
     would have read that as "not provided", and the request would have
     answered **200 having stored nothing** — a person renames their shelf,
     sees it accepted, and loses the edit. That is hard stop 3's failure mode
     exactly, and declaring `label` for one release is what carried the
     shipped bundles across the gap.

     **That is what issue #247 contracts**, migration 0022 being live: `label`
     goes from here and `my_label` from the Folder object below. A body
     sending `label` now gets the ordinary unknown-key treatment — stripped,
     logged by `parse-body.ts`, and changing nothing — which is correct once
     no shipped bundle sends it. AC-750 is what pins that, against the stored
     row rather than against the 200.

     **The `folder_members.label` column went one release later than these
     keys did, and that is the rule rather than an oversight.** 11.5 splits a
     destructive change expand-and-contract across two releases because the
     old code runs against the new schema for the length of a deploy, and the
     old code there was the instance still writing `label` on all five of its
     write paths. So one release took the wire keys and stopped the writes,
     and migration 0026 dropped the column once that was live and drained. */
  shelf: shelfName.nullable().optional(),
  color: hexColor.nullable().optional(),
})
export type PatchFolderMyMembershipBody = z.infer<
  typeof patchFolderMyMembershipBody
>

/*
POST /folders/:id/members. Body { user_id, access }: the target account and
the Access preset they arrive with. Everything else the endpoint refuses
(default folder, existing member, missing roster connection, the 25 cap) is
state, resolved by the domain module against 5.3 row 1.

`access` is **required**, added with issue #228 (R9 section 6: "Direct member
add similarly requires an explicit Access preset"). It has deliberately no
default. A default would be one person's authority chosen by nobody, and the
value would then be invisible in the request that granted it -- which is the
exact class `shared/tasks.ts` records losing a reminder field to for four
packages. The server reads it in `addMember`, which writes it into the
membership row and into the `null -> preset` history transition in one
transaction, and AC-513 drives the endpoint with each of the six presets and
reads the stored value back.
*/
/*
`responsibility` is **optional** and is issue #230's initial-content field
(#230 "Invite / member activation"). Where `access` has no default because a
default would be an authority nobody chose, this one has no default because a
default would be *text nobody wrote*: R10's "do not fabricate" applies exactly
here, so an absent field means the new member starts with no Responsibility
document at all rather than with an empty one.

It is read by `addMember`, which writes the first revision in the same
transaction as the membership row and attributes it to the **administrator**,
never to the person arriving. AC-569 drives the endpoint with content and
without it, and reads back both the stored document and the actor on its first
revision, which is the criterion hard stop 3 asks for.
*/
export const postFolderMembersBody = z.object({
  user_id: z.uuid({ error: 'must be a uuid' }),
  access: folderAccessPreset,
  responsibility: responsibilityDocument.optional(),
})
export type PostFolderMembersBody = z.infer<typeof postFolderMembersBody>

/*
The 7.0 Folder object, the row shape of GET /folders and the base of GET
/folders/:id. It lives here for the me.ts reason: app/src/shared is the one
artifact the client, the server, and the tests all import, and a shape
declared beside a handler is a second definition of the same promise.

Field truths, each from its owning section: name, my_shelf, and my_color
reuse the write primitives because the 4.3 and 4.4 CHECKs guarantee stored
values satisfy them already; is_owner derives from folders.owner_id, the one
ownership source (4.3); member_count is at least 1 because INV-10 keeps the
owner's membership row on every folder that exists; counts are 8.11's
pending and completed tallies, abandoned rows on neither side; my_shelf and
my_color are null for a member who set none (4.4).

`my_shelf` was `my_label` until issue #226. It is the same field carrying the
same value from the same column: the rename is the Shelf half of removing the
collision with #208's Label model, and `personal_labels` below is the Label
half arriving beside it.

**Both keys were on the card for one release and only one is now.** That pair
was the read half of the expand-and-contract the request body carried: a
browser tab open across a deploy keeps its old bundle and read `my_label`, and
a card carrying only `my_shelf` would have drawn every shelf as unset until
the person reloaded — cosmetic and self-healing where the write half was
neither, and it cost one key to not do it at all. **Issue #247 is the contract
half**, and it drops `my_label` and the request body's `label` once migration
0022 is live. 7.0 fixes this object's key set and the contract tests assert it
exactly, so the key leaving those arrays is what records that the window
closed; AC-750 asserts that no producer answers the old key. The
`folder_members.label` column went one release later, dropped by migration
0026, for the reason the request body's block above gives.

`my_access` joined them on 2026-09-20 under Hassan's Ruling 4 on issue #228
(https://github.com/zhssnym/dana/issues/228#issuecomment-5751449643), a dated
7.4 amendment in the shape `cover_preset`, `cover_focal_y` and `description`
got theirs. It is the **viewer's own** membership preset and never anybody
else's: the same value their own element of `GET /folders/:id`'s `members`
carries, taken from the row `folderSelect` already joins to scope the query.
It is not nullable, because a Folder object only exists for somebody who is in
the folder, and INV-10 plus migration 0023 put a preset on every membership
row there is.
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
  my_shelf: shelfName.nullable(),
  my_color: hexColor.nullable(),
  /* The viewer's own Access preset (issue #228, Hassan's Ruling 4 of
     2026-09-20). It sits with the other two `my_` fields because it is the
     same kind of fact — something true of this reader's membership rather
     than of the folder — and **not** beside `is_owner`, which is the folder's
     `owner_id` and is now neither necessary nor sufficient for any act a
     surface draws.

     What it is for: the Library row in `shell/app-sidebar.tsx` is built from
     `GET /folders` and never fetches a detail, so before this field it had
     nothing but `is_owner` to gate Rename, Leave and Delete on, and both
     halves of that were measurably wrong — a Full-control non-owner was
     offered no Rename and a demoted owner was still offered Delete. Both
     surfaces now gate through `lib/folder-authority.ts`, which answers from
     `shared/folder-actions.ts`, so no bar is written twice. */
  my_access: folderAccessPreset,
  /*
  The M1 Label projection for a Folder (issue #226, parent #208): the viewer's
  own Personal Labels applied to this Folder, ordered active before archived,
  then lower(name), then id.

  **Only Personal, and that is the model rather than a simplification.** A
  Folder Label belongs to one Folder and classifies the Tasks inside it; it
  never classifies the Folder that owns it (R4), so there is no second array
  here to hold one. And because the array is the viewer's own, two members
  reading the same Folder read different arrays, exactly as they read
  different `my_shelf` values.
  */
  personal_labels: z.array(labelRef),
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
  /* The member's current Access preset (issue #228, R8A). It sits beside
     `role` rather than replacing it: `role` expressed no authority before
     this change and expresses none now, and dropping a field from a frozen
     response is a separate decision from adding one.

     Folder-visible to every member, which is R9 section 13's recommended M1
     rule: knowing what the people you work with may do is ordinary Work
     awareness. Pending-invite administration is the part that is not, and it
     is withheld separately below. */
  access: folderAccessPreset,
  joined_at: z.iso.datetime(),
  is_owner: z.boolean(),
})
export type FolderMember = z.infer<typeof folderMember>

export const folderPendingInvite = z.object({
  id: z.uuid(),
  email: z.string().min(1),
  task_id: z.uuid().nullable(),
  /** The preset this invite grants on acceptance (R9 section 5). Null cannot
   * occur on a folder invite -- the table's both-or-neither CHECK sees to
   * that -- and is admitted here because the projection's type is the
   * column's. */
  access: folderAccessPreset.nullable(),
  created_at: z.iso.datetime(),
  last_sent_at: z.iso.datetime(),
})
export type FolderPendingInvite = z.infer<typeof folderPendingInvite>

export const getFoldersResponse = z.array(folder)
export type GetFoldersResponse = z.infer<typeof getFoldersResponse>

/**
 * GET /folders/:id.
 *
 * `pending_invites` is **empty for every member below Full control** since
 * issue #228, which classifies a pending invite's email and intended Access
 * as member-administration data rather than ordinary Work: accepted R8A
 * gives administering people and Access to Full control alone. The key is
 * still present and still an array, because a response that
 * dropped a key would make "you may not see this" and "there are none" two
 * different shapes for the client to handle, and the second is the one the
 * panel already renders.
 */
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
