/*
The /me endpoints as code, 7.1's three: the request bodies the server
validates with, and the response shapes both sides read.

7.2's two were here as well until issue #113 retired them on 2026-09-04, and
their schemas followed on the merge that brought #150's client half in. The
three booleans they carried are still a shape this file declares, because
frozen 7.1's GET /me answers them under its `settings` key; what is gone is
the request body of an endpoint that no longer exists, and the two response
aliases that named this object after it.

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

z.boolean refuses every non-boolean without coercing, which was the whole of
AC-121 before #113 rewrote that criterion against 7.23's bundle. Null is
among the refusals rather than a clear: 4.10's three columns
are NOT NULL booleans with defaults, so there is no state to clear back to,
unlike the shelf and color of 7.4's my-membership, which the frozen text
itself marks nullable. Section 12 records that reading at the P2S opening;
this is where it is enforced.
*/
export const settingsToggle = z.boolean({ error: 'must be a boolean' })

/*
The settings object. Since issue #113 exactly one live endpoint answers it,
the settings key of the GET /me body (7.1), the two that also did having been
retired. One definition for one object, since copies of a shape are things
that can disagree, and this role exists to prevent per-endpoint variants of
the same object.

**Its two aliases went on 2026-09-04, one merge after the endpoints they were
named for**, exactly as the note that stood here promised. `getMeSettingsResponse`
and `patchMeSettingsResponse` were this object under 7.2's names, and
`patchMeSettingsBody` was the request body of `PATCH /me/settings`; all three
outlived their routes by one merge because the client on `main` still imported
them, and issue #150 is the branch that stopped. That branch is on this
integration branch now, nothing imports any of the four, and they are deleted
here. What is not dead is this object: 7.1 is frozen and untouched by #113, so
the `settings` key of `GET /me` still carries the three booleans, AC-116 still
pins that shape, and `domain/bundle.ts` still derives the three columns into
`pinned_views` per 4.19.
*/
export const settings = z.object({
  show_important: settingsToggle,
  show_all: settingsToggle,
  show_done: settingsToggle,
})
export type Settings = z.infer<typeof settings>

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

connections.ts types the same person's email non-nullable from that same fact,
and the P5 shape review settled the pair as a deliberate asymmetry rather than
flattening it. The short of it: frozen 7.3 carries an exclusion clause for its
list and frozen 7.1 carries none for this row, so that schema transcribes a
promise while this one reports a column. The grounds are recorded once, in
connections.ts, rather than twice here.
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
