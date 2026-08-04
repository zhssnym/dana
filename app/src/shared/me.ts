/*
The /me endpoints as code, 7.1's three and 7.2's two: the request bodies the
server validates with, and the response shapes both sides read.

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
The 7.2 settings surface. One primitive serves all three fields on both
sides, because the three carry one rule: a boolean, and nothing else.

z.boolean refuses every non-boolean without coercing, which is the whole of
AC-121. Null is among the refusals rather than a clear: 4.10's three columns
are NOT NULL booleans with defaults, so there is no state to clear back to,
unlike the label and color of 7.4's my-membership, which the frozen text
itself marks nullable. Section 12 records that reading at the P2S opening;
this is where it is enforced.
*/
export const settingsToggle = z.boolean({ error: 'must be a boolean' })

/*
The 7.2 settings object: GET /me/settings answers it, the settings key of
the GET /me body carries it (7.1), and PATCH /me/settings answers it too by
the owner ruling now standing in 7.2. One definition for one object, since
three copies of a shape are three things that can disagree, and this role
exists to prevent per-endpoint variants of the same object.
*/
export const settings = z.object({
  show_important: settingsToggle,
  show_all: settingsToggle,
  show_done: settingsToggle,
})
export type Settings = z.infer<typeof settings>

export const getMeSettingsResponse = settings

/*
The ruled PATCH body, by construction rather than by transcription: 7.2's
appended sentence says PATCH /me/settings answers the GET /me/settings
object, the fresh-GET convention 7.1 carries on PATCH /me and 7.4 on each of
its mutations. Binding the name to the same schema is how a ruling stops
being a sentence two shapes might each claim to satisfy.
*/
export const patchMeSettingsResponse = settings

/*
PATCH /me/settings. Body: any subset of the three booleans (7.2), which the
P2 merge ratified as the section 7 PATCH reading, absent unchanged and every
present value valid. The empty subset is a subset, so {} parses; refusing it
with an at-least-one-field rule would refuse a body the frozen sentence
admits (AC-120).

Absent must survive parsing as absent, not as undefined-valued, because the
handler writes only the fields it finds here: an implementation that reads,
merges, and writes all three columns loses one side of two concurrent
disjoint PATCHes, which AC-120 races for.

Written out field by field rather than derived from the settings object
above with .partial(). They coincide today because frozen 7.2 says both are
the three booleans, but one is what the endpoint accepts and the other is
what it answers; deriving would silently make any later read-only field
writable.
*/
export const patchMeSettingsBody = z.object({
  show_important: settingsToggle.optional(),
  show_all: settingsToggle.optional(),
  show_done: settingsToggle.optional(),
})
export type PatchMeSettingsBody = z.infer<typeof patchMeSettingsBody>

/*
The GET /me response, which 7.1 fixes as
{ user: {id, email, display_name, avatar_url, timezone}, settings,
pending_invite_count }, its settings key the 7.2 object above rather than a
copy of it: 7.1 and 7.2 read one row, so they answer one shape.

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
  settings,
  pending_invite_count: z.int().nonnegative(),
})
export type MeResponse = z.infer<typeof meResponse>
