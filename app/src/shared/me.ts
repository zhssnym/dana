/*
The 7.1 /me endpoints as code: the request bodies the server validates with,
and the response shape both sides read.

The server validates requests with these authoritatively; the client may
import them for convenience, which per 7.11 carries no authority. Convention
set here for every body schema to follow: z.object so unknown fields are
stripped, never refused (7.0 tolerates them), a camelCase schema named for
method and route, its inferred PascalCase type beside it, and per-field
messages phrased without the field name, because sendValidationError prefixes
the path when it builds the 422 (10.3).
*/
import { z } from 'zod'

import { ianaTimezone } from './timezone.js'

// PATCH /me. Body { timezone }, 422 if not IANA (7.1).
export const patchMeBody = z.object({
  timezone: ianaTimezone,
})
export type PatchMeBody = z.infer<typeof patchMeBody>

// DELETE /me. Body { confirm: "DELETE" }, literal string required, else 422
// (7.1). z.literal refuses every non-string and every other string, and the
// message spells the one accepted value.
export const deleteMeBody = z.object({
  confirm: z.literal('DELETE', { error: 'must be the literal string "DELETE"' }),
})
export type DeleteMeBody = z.infer<typeof deleteMeBody>

/*
The GET /me response, which 7.1 fixes as
{ user: {id, email, display_name, avatar_url, timezone}, settings,
pending_invite_count }, with settings carrying the three booleans 7.2 names
and 4.10 defaults.

It lives here rather than beside the handler because a response shape is the
half of the contract the client reads, and 7.11 plus this role's handoff make
app/src/shared the one artifact the client, the server, and the tests all
import. A shape declared next to its handler is a second definition of the
same promise, and two definitions are two things that can disagree.

Nullability follows section 4.1 rather than optimism: display_name and
avatar_url are genuinely absent when Google reports no name or picture. email
is nullable in the column because 8.10's scrub empties it, though a live
account always has one, since /me answers only for rows with deleted_at null
and provisioning always writes an address.
*/
export const meResponse = z.object({
  user: z.object({
    id: z.uuid(),
    email: z.string().nullable(),
    display_name: z.string().nullable(),
    avatar_url: z.string().nullable(),
    timezone: ianaTimezone,
  }),
  settings: z.object({
    show_important: z.boolean(),
    show_all: z.boolean(),
    show_done: z.boolean(),
  }),
  pending_invite_count: z.int().nonnegative(),
})
export type MeResponse = z.infer<typeof meResponse>
