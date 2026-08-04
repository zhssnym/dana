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
export const patchFolderBody = z.object({
  name: folderName,
})
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
})
export type Folder = z.infer<typeof folder>
