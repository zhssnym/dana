/*
The 7.3 connections (roster) surface as code. It is one response shape and no
request body: the section's two endpoints are a GET and a DELETE addressed by
path, so there is nothing for a body schema to validate.
*/
import { z } from 'zod'

import { folderMemberUser } from './folders.js'

/*
GET /connections, frozen 7.3's element: { user: {id, display_name,
avatar_url, email}, connected_at }.

The user is 7.0's person shape extended by one field rather than restated,
the reuse tasks.ts already makes for TaskCard's assignee: three copies of one
object are three things that can disagree. The email is 7.3's own addition
and the only address any person shape in this contract carries, deliberately,
for the reason folders.ts records where it withholds one: a roster entry is
someone V has exchanged invites with, and the address is what the sharing
panel re-shares to, while co-members are not necessarily connected.

It is a plain string rather than the invites.ts write primitive, which is the
me.ts and folders.ts precedent for an address on the reading side: a stored
value passed V-INV or came from Google, and a response schema that refused
one would be failing a truth rather than reporting it. Not nullable, although
4.1's column is: 8.10's scrub is what empties that column, and this list
excludes soft-deleted users outright.

That last sentence disagrees with me.ts, which types the same person's email
nullable from the same fact about the same column, and the P5 shape review
settled the pair rather than flattening it. The difference is in the frozen
text, not in two authors' taste. 7.3's own sentence carries the exclusion,
"excluding soft-deleted users", so non-nullable here is that clause
transcribed: it is what makes a contract test notice a roster query that lost
its deleted_at filter, which is the regression the clause exists to forbid.
Frozen 7.1 carries no equivalent clause, so me.ts reports the column instead,
and it is right to. The two schemas describe what their endpoint promises,
which is the level a response shape works at, rather than agreeing about a
column neither of them is.

The asymmetry is not free and is recorded so a later reader does not read it
as drift. What it costs is that one field name carries two types across two
surfaces; what flattening would cost is more. Making both nullable would drop
7.3's only testable guarantee. Making both non-nullable does not merely
weaken a test: MeResponse's inferred type is the auth module's own return
type, so it fails the build at src/server/auth/account.ts, where the /me
handler reads the nullable column and reports what it read. Measured, not
inferred, during the review.

connected_at is 4.2's created_at under the name 7.3 gives it on the wire; the
column is NOT NULL, so the field never is. Ordering is the query's, 7.3's
display_name ascending then id, never the shape's.

A bare array with no wrapper, the notation 7.3 writes, as GET /folders
answers one.
*/
export const connectionUser = folderMemberUser.extend({
  email: z.string().min(1),
})
export type ConnectionUser = z.infer<typeof connectionUser>

export const connection = z.object({
  user: connectionUser,
  connected_at: z.iso.datetime(),
})
export type Connection = z.infer<typeof connection>

export const getConnectionsResponse = z.array(connection)
export type GetConnectionsResponse = z.infer<typeof getConnectionsResponse>

/*
DELETE /connections/:userId carries no body and answers 204, or 404 when no
such connection exists. Either side may call it, so there is no actor field
to validate and no schema to write: the pair is the path parameter plus the
session, and both are the route's to resolve. The memberships the pair
sponsored are untouched by it (7.3), which is a rule of the domain module
rather than of any shape.
*/
