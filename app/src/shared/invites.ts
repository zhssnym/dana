/*
The 7.5 invite surface as code: the POST /invites body the server validates
with, and the response shapes frozen 7.5 enumerates.

The conventions are me.ts's, unchanged: z.object so unknown fields are
stripped rather than refused (7.0 tolerates them), a camelCase schema named
for method and route, its inferred PascalCase type beside it, and per-field
messages phrased without the field name, because sendValidationError prefixes
the path when it builds the 422 (10.3).

Deliberately incomplete, recorded here so the next session reads the
disposition rather than rediscovering the gap. Frozen 7.5 enumerates the
pending-list element, the acceptance response's three outer keys, and the
201's outer key; it enumerates nothing inside the created invite, nothing
inside the acceptance response's folder, nothing at all for the sent list,
and one key of the conversion answer. RFC 0001's P5 row already places an
endpoint shape review after this package's routes and carries the conversion
response's wire shape into it, and the tester left the same inner shapes
tolerant in app/tests/sharing-harness.ts for the same reason. So the schemas
below stop where the frozen text stops, which is the precedent this file's
neighbour records: folders.ts left the GET /folders wrapper and the detail's
invite key open at P2, and the shape review settled both with the implemented
routes in front of it. Where a key is frozen and its object is not, the
object is written as a floor, loose and carrying only what every candidate
reading shares, so a route has something to build against and the review has
nothing to undo.
*/
import { z } from 'zod'

import { folderName } from './folders.js'

/*
10.3's email row, the one limit this surface carries: up to 320 characters,
syntactically valid, stored lowercased. 4.9 backs all three, with
CHECK (email = lower(email)) and the column's length, so a body that reached
the insert unlowercased would answer 500 where 8.7 promises a 422.

The lowercasing happens here rather than in the domain module because 8.7
writes it as V-INV's first validation, "lowercase and syntax-check email",
and because every later rule is case-insensitive equality on this value: the
own-email refusal, the roster conversion, and INV-11's dedupe. One transform
at the edge is what keeps those one rule rather than three; AC-059 sends a
case variant of the inviter's own address and expects the same 422 the exact
spelling gets.

Not trimmed, unlike views.ts's searchQ: Q8 says "q, trimmed" and 10.3 says
nothing of the sort here, so an address carrying a space is refused as the
invalid address it is. The lowercasing changes what the caller sent because
10.3 requires it, and nothing else here does.
*/
export const emailAddress = z
  .email({ error: 'must be a syntactically valid email address' })
  .max(320, { error: 'must be at most 320 characters' })
  .toLowerCase()

// Every id this section carries is a uuid and nothing more: what it points
// at, and whether V may point at it, are questions only the rows answer.
const uuid = z.uuid({ error: 'must be a uuid' })

/* ------------------------------------------------------------------ *
 * 7.5 request bodies
 * ------------------------------------------------------------------ */

/*
POST /invites, frozen 7.5's body: { email, folder_id optional, task_id
optional }.

Two of V-INV's validations are body facts and the rest are not. The email's
syntax is the primitive above. The dependency below is 4.9's
CHECK (task_id IS NULL OR folder_id IS NOT NULL) stated at the surface, so an
assignment intent naming no folder answers 422 naming the field rather than
the constraint's 500 (AC-065).

Everything else V-INV lists needs rows, and 7.11 lists it as
server-authoritative there: the inviter's own address, the folder's
accessibility and its default flag, the task's presence inside that folder,
the roster conversion with the 25-member cap the P5 kickoff ruling put on it,
the bare-invite 409 the owner ruled on 2026-08-09, INV-11's dedupe, and
10.4's rate limits, which are P9's middleware rather than this endpoint's
body.

Absent and null are different states, the reading 7.10's parameters already
take: 7.5 calls the two ids optional, and an explicit null is a value it
never names, so it answers 422 naming the field rather than being read as the
bare invite an omitted key asks for. The distinction is not pedantry on this
endpoint: with the owner's ruling standing, a folder_id the client meant to
send and nulled by accident is the difference between a conversion and a 409.
*/
export const postInvitesBody = z
  .object({
    email: emailAddress,
    folder_id: uuid.optional(),
    task_id: uuid.optional(),
  })
  .refine(
    (body) => body.task_id === undefined || body.folder_id !== undefined,
    { error: 'requires a folder_id', path: ['task_id'] },
  )
export type PostInvitesBody = z.infer<typeof postInvitesBody>

/*
The five transition endpoints, accept, decline, cancel and resend, take no
body at all: frozen 7.5 gives each an actor guard and a state guard and names
no field. There is therefore no schema for them, rather than an empty one; a
z.object({}) would read as a shape this section wrote, and 7.0 already
tolerates the unknown keys a caller sends anyway.
*/

/* ------------------------------------------------------------------ *
 * 7.5 response shapes
 * ------------------------------------------------------------------ */

/*
4.9's status vocabulary, which is 5.2's lifecycle read off the column:
pending plus its four terminal states. It belongs to the contract and not to
the table alone, because "any status" is what GET /invites/sent answers and
"409 when the invite is not pending" is what all five transition endpoints
refuse with.
*/
export const inviteStatus = z.enum([
  'pending',
  'accepted',
  'declined',
  'canceled',
  'invalidated',
])
export type InviteStatus = z.infer<typeof inviteStatus>

/*
The object inside 201 { invite }. Frozen 7.5 writes the wrapper key and
nothing within it, so this is a floor rather than a shape: an id, because the
five transition endpoints address the row by one and both lists that
enumerate an invite element carry it (7.4's pending_invites, 7.5's pending
list below), and loose, so the fields the shape review settles ride through
rather than being stripped by a schema that predates the decision.
*/
export const createdInvite = z.looseObject({ id: uuid })
export type CreatedInvite = z.infer<typeof createdInvite>

export const postInvitesResponse = z.object({ invite: createdInvite })
export type PostInvitesResponse = z.infer<typeof postInvitesResponse>

/*
The other answer POST /invites can give, 7.5's instant share: "response 200
{ converted_to_share: true, membership created }". The first key is written
out and its value is the literal true, since a body reporting false would be
reporting the 201 case, which has its own status. The second half of that
sentence is prose about an effect that may or may not be a key on the wire,
and it is exactly the question RFC 0001's P5 row routes to the endpoint shape
review, so this stays loose until the review says what rides beside it.

The status separates the two answers, 201 for a created invite and 200 for a
conversion, so a client picks the shape by status rather than narrowing a
union by key.
*/
export const postInvitesConversionResponse = z.looseObject({
  converted_to_share: z.literal(true),
})
export type PostInvitesConversionResponse = z.infer<
  typeof postInvitesConversionResponse
>

/*
GET /invites/pending, frozen 7.5 field for field: [{id, inviter:
{display_name, avatar_url}, folder_name or null, created_at}]. It backs the
login surface, which Q12 answers by the viewer's lowercased email.

The inviter carries no id, and that is the frozen text's choice rather than
an omission here: 7.0's person shape has three keys and 7.4's members element
uses all three, while this element enumerates two. A recipient reading an
invite has no claim on the inviter's id, which addresses nothing they may
call.

folder_name is null for a bare invite, which is the discriminator this whole
surface turns on after the owner's ruling of 2026-08-09, and it reuses the
7.4 name primitive because 4.3's CHECK guarantees a stored folder name
satisfies it, the reuse folders.ts's own object makes.

A bare array with no wrapper, the notation 7.5 writes and the reading 7.4's
list already took.
*/
export const pendingInvite = z.object({
  id: uuid,
  inviter: z.object({
    display_name: z.string().nullable(),
    avatar_url: z.string().nullable(),
  }),
  folder_name: folderName.nullable(),
  created_at: z.iso.datetime(),
})
export type PendingInvite = z.infer<typeof pendingInvite>

export const getInvitesPendingResponse = z.array(pendingInvite)
export type GetInvitesPendingResponse = z.infer<
  typeof getInvitesPendingResponse
>

/*
GET /invites/sent has no schema here, deliberately. Frozen 7.5 gives it one
sentence, "V's invites, newest first, any status", which fixes the order and
the status filter and enumerates no element at all, so there is nothing to
transcribe and any element written here would be this session inventing the
contract rather than recording it. It rides the endpoint shape review with
the two loose objects above; the tester made the same call and reads the
elements as records in app/tests/sharing-harness.ts.

One reading is recorded for that review rather than settled now, because it
is the reason the gap is narrow: "V's invites" is the same row POST /invites
answers with, so the strongest candidate is that this list's element and the
created invite are one object, which would make inviteStatus above a field of
both and AC-067's "the inviter sees declined" a sentence the shape satisfies
outright. What it costs is that the sent list is the inviter's own view and
may want what the created invite does not carry, the recipient's response
among it.
*/

/*
POST /invites/:id/accept, frozen 7.5's three outer keys: 200
{ connection_created, folder or null, assigned_task_id or null }.

connection_created reports whether this acceptance minted the pair: 8.7
upserts the connection under INV-9, so a second invite from the same inviter
accepts into an idempotent no-op and answers false.

folder is null for a bare invite, and for a folder invite whose acceptor was
already a member, 8.7 granting membership only when the acceptor is not one.
assigned_task_id is null unless the conditional assignment applied, which 8.7
skips silently when the task moved out of the folder or already has an
assignee (AC-066).

Which object rides in folder is the one shape 7.5 names without enumerating,
and it is a real question rather than an obvious one: 7.4 answers with the
full Folder object of 7.0 while 7.10's grouped views answer a folder key with
the {id, name, is_default} stub, and the owner ruled that second reading at
P4 rather than leaving an implementation to pick. So this stops at what both
readings share, an object carrying the granted folder's id, and the review
takes the rest.

decline, cancel and resend answer 200 and no body this section names, so they
get no schema, for the reason their request side gets none.
*/
export const acceptedFolder = z.looseObject({ id: uuid })
export type AcceptedFolder = z.infer<typeof acceptedFolder>

export const acceptInviteResponse = z.object({
  connection_created: z.boolean(),
  folder: acceptedFolder.nullable(),
  assigned_task_id: uuid.nullable(),
})
export type AcceptInviteResponse = z.infer<typeof acceptInviteResponse>
