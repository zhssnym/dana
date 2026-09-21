/*
The 7.5 invite surface as code: the POST /invites body the server validates
with, and the response shapes frozen 7.5 enumerates.

The conventions are me.ts's, unchanged: z.object so unknown fields are
stripped rather than refused (7.0 tolerates them), a camelCase schema named
for method and route, its inferred PascalCase type beside it, and per-field
messages phrased without the field name, because sendValidationError prefixes
the path when it builds the 422 (10.3).

Complete as of the P5 endpoint shape review, the one RFC 0001's P5 row places
after this package's routes. Through the schema session this file stopped
where frozen 7.5 stops: that section enumerates the pending-list element, the
acceptance response's three outer keys and the 201's wrapper, and enumerated
nothing inside the created invite, nothing inside the acceptance response's
folder, nothing at all for the sent list, and one key of the conversion
answer. Four shapes were therefore written as floors, loose and carrying only
what every candidate reading shared, so a route had something to build against
and the review had nothing to undo.

All four are settled below, each against the route that answers rather than
against a reading of the text alone, and each with its grounds in the block
introducing the response shapes. The precedent is this file's neighbour:
folders.ts left the GET /folders wrapper and the detail's invite key open at
P2, and the shape review settled both with the implemented routes in front of
it.
*/
import { z } from 'zod'

import { folderAccessPreset } from './folder-access.js'
import { responsibilityDocument } from './responsibility.js'

import { folder, folderMember, folderName } from './folders.js'

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
/*
`access` joined this body with issue #228 (R9 section 5: "A pending Folder
invite must persist the **intended Access preset**").

It is required exactly when `folder_id` is, and refused when it is not -- a
bare roster invite grants no Folder Access, so a preset on one would be a
value nothing could ever read, and the table's own both-or-neither CHECK says
the same thing one layer down. There is no default: the preset a person
arrives with is somebody's decision, and a default would make it nobody's.

The server reads it in `createInvite`, which stores it on the pending row and,
on the instant-share arm, writes it straight into the membership and its
`null -> preset` transition; `acceptInvite` reads it back when the invite is
accepted. AC-519 drives both arms and reads the stored value back.
*/
export const postInvitesBody = z
  .object({
    email: emailAddress,
    folder_id: uuid.optional(),
    task_id: uuid.optional(),
    access: folderAccessPreset.optional(),
    /*
    Issue #230's optional initial Responsibility content (#230 "Invite /
    member activation"). Optional in the ordinary sense -- absent means the
    member arrives with no document, because R10 forbids fabricating one --
    and refused without a folder for `access`'s reason: a bare roster invite
    creates no Folder standing for a Responsibility to belong to, and the
    table's own CHECK says the same thing a second time.

    The server reads it in `createInvite`, which stores it on the invite row,
    and in `acceptInvite`, which turns it into the first revision **attributed
    to the inviter** at the moment membership becomes active. R9 section 5's
    sentence about Access governs it word for word: do not represent the
    recipient as having authored the content merely because they accepted.
    AC-569 drives both halves.
    */
    responsibility: responsibilityDocument.optional(),
  })
  .refine(
    (body) => body.task_id === undefined || body.folder_id !== undefined,
    { error: 'requires a folder_id', path: ['task_id'] },
  )
  .refine((body) => (body.folder_id === undefined) === (body.access === undefined), {
    error: 'is required with a folder_id, and is not accepted without one',
    path: ['access'],
  })
  .refine(
    (body) => body.responsibility === undefined || body.folder_id !== undefined,
    { error: 'is not accepted without a folder_id', path: ['responsibility'] },
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
The response side of 7.5, settled at this role's P5 shape review with the
routes mounted and answering. Frozen 7.5 fixes the pending element field for
field, the acceptance response's three outer keys, and the 201's wrapper; the
four decisions below are the ones it leaves open. Each is a candidate for a
one-sentence recording in the frozen text through the Steward, the shape 7.2,
7.4 and 7.10 each took for the same reason.

- The object inside 201 { invite } and the GET /invites/sent element are one
  object, the nine-field invite below. This file already carried that as the
  strongest candidate, and the routes confirm it rather than merely permitting
  it: both bodies come from one serializer over one column list in the domain
  module, so there was no second shape to choose between. What makes it right
  rather than convenient is 7.5's own sentence for the sent list, "V's
  invites, newest first, any status". The rows it lists are the rows POST
  /invites creates, "any status" is only meaningful if status is a field of
  them, and AC-067's inviter who sees a declined invite reads it here.
  The element is wider than 7.4's pending_invites element, which carries five
  of these nine, and that is not drift. The folder detail's list is scoped to
  one folder and to pending rows, so folder_id, folder_name, status and
  responded_at would each be constant there; this list spans every folder and
  every state, and needs all four to say which invite it is showing.

- The conversion answers { converted_to_share: true, membership }, the
  membership being the 7.4 member element. Frozen 7.5 writes "response 200
  { converted_to_share: true, membership created }", and the second half of
  that is prose about an effect; membership is that prose transcribed as the
  key. The element is 7.4's own rather than a new one because the conversion
  is 8.7's grant, the same grant POST /folders/:id/members performs, and
  7.4's ruled convention is that it answers the member element it created.
  One concept, one object.

- The acceptance response's folder is the full 7.0 Folder object, what a fresh
  GET would give. This is the reading 7.4 takes and not the {id, name,
  is_default} stub the owner ruled for 7.10's grouped views on 2026-08-07, and
  the two do not conflict because they answer different questions. 7.10's stub
  is a group heading, and that ruling said outright why: a heading needs what a
  card's folder label needs, while Folder's counts, is_owner, member_count,
  my_shelf and my_color are 7.4's business, where a client that wants them
  already goes. An acceptance is not a heading. It is the moment a client
  acquires a folder it did not have, and every one of those five fields is
  something it needs and has no other way to learn here: whether it now owns
  the folder, how many members it has, the 8.11 counts the sidebar renders
  next to it. The stub would force a second request for a folder the client
  learned about one line earlier, which is the round trip the
  mutation-answers-a-fresh-GET convention of 7.1, 7.2 and 7.4 exists to
  avoid.

- decline, cancel and resend answer { invite }, the same wrapper and the same
  object the 201 carries. Frozen 7.5 gives each of them "200." and no body, so
  the convention decides rather than the text: a mutation answers what a fresh
  GET would, which is 7.1's PATCH /me, 7.2's PATCH /me/settings and 7.4's four
  mutations, and the fresh read of a settled invite is the sent-list element.
  The wrapper is the 201's rather than a bare object, so one endpoint family
  speaks one way and a client parses every invite body the same.
*/

/*
The invite as 7.5 reports it, the object POST /invites' 201 wraps, GET
/invites/sent lists, and decline, cancel and resend each answer.

Field by field against 4.9's columns. email is a plain string rather than the
write primitive above, the me.ts and folders.ts precedent for an address on
the reading side: a stored address passed V-INV on the way in, and a response
schema that refused one would be failing a truth rather than reporting it.
folder_id and folder_name are both null for a bare invite and both set for a
folder one, the name riding along because the pending list frozen 7.5 does
enumerate carries a name rather than an id, and the inviter's own list renders
the same sentence about the same folder; folder_name reuses the 7.4 primitive,
as pendingInvite below does. task_id is 4.9's optional assignment intent.
created_at and last_sent_at are NOT NULL columns, the second stamped by the
insert and moved by resend, which is what lets a client show the 5.2 window
rather than discovering it as a 429. responded_at is null for a pending invite
and set by every terminal transition.

accepted_by is deliberately absent, and this is the one place the settled
shape withholds a column: it is a bare user id, and this surface offers no
person shape to render it with. A client that needs the acceptor has 7.4's
members list, where the same person arrives as 7.0's person object.
*/
export const invite = z.object({
  id: uuid,
  email: z.string().min(1),
  folder_id: uuid.nullable(),
  folder_name: folderName.nullable(),
  task_id: uuid.nullable(),
  status: inviteStatus,
  created_at: z.iso.datetime(),
  last_sent_at: z.iso.datetime(),
  responded_at: z.iso.datetime().nullable(),
})
export type Invite = z.infer<typeof invite>

export const postInvitesResponse = z.object({ invite })
export type PostInvitesResponse = z.infer<typeof postInvitesResponse>

/*
GET /invites/sent: the same element, newest first, any status. The order is
the query's, never the shape's, and 7.5 fixes it. A bare array with no
wrapper, the notation 7.5 writes for both of its lists.
*/
export const getInvitesSentResponse = z.array(invite)
export type GetInvitesSentResponse = z.infer<typeof getInvitesSentResponse>

/*
The other answer POST /invites can give, 7.5's instant share. converted_to_share
is the literal true, since a body reporting false would be reporting the 201
case, which has its own status; the status is what separates the two answers,
so a client picks the shape by status rather than narrowing a union by key.
*/
export const postInvitesConversionResponse = z.object({
  converted_to_share: z.literal(true),
  membership: folderMember,
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

Which object rides in folder was the one shape 7.5 names without enumerating,
and it was a real question rather than an obvious one, 7.4 and 7.10 answering
a folder key two different ways. The review settled it as 7.0's full Folder
object, for the reasons the settlement block above gives.
*/
export const acceptInviteResponse = z.object({
  connection_created: z.boolean(),
  folder: folder.nullable(),
  assigned_task_id: uuid.nullable(),
})
export type AcceptInviteResponse = z.infer<typeof acceptInviteResponse>

/*
decline, cancel and resend, each 7.5's bare "200." and each answering the
invite the transition settled, in the 201's wrapper. Three names for one
schema rather than one name used three times, the folders.ts precedent where
patchFolderResponse and patchFolderMyMembershipResponse are both the Folder
object: an endpoint's response is its own promise, and naming them apart is
what lets one of the three move later without dragging the others.
*/
export const declineInviteResponse = postInvitesResponse
export const cancelInviteResponse = postInvitesResponse
export const resendInviteResponse = postInvitesResponse
