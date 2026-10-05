/*
Harness for the sharing criteria (AC-059 to AC-069, plus AC-133 to AC-141),
built on the auth harness and the folder and task layers: the same booted
application, stub identity provider, cookie-jar browsers, lazily signed-in
casts, and the scoped invariant sweeps, plus what 7.5, 7.3 and 8.7 need.

Five decisions worth the words.

**Setup goes through the API wherever the API exists.** Invites are created
with POST /invites and moved with the four transition endpoints, connections
are severed with DELETE /connections/:userId: a broken create fails every
file here on one attributable sentence. Folders, members, and tasks arrive
through their own endpoints. Direct writes are kept for state no endpoint can
produce (a last_sent_at 25 hours old, which is the only way to reach the far
side of the resend window without waiting a day) and for the 8.10 fixtures of
AC-133 to AC-138, which need rows no endpoint mints on demand.

**Recipients sign in with chosen identities.** Invite matching is 5.2's rule,
the lowercased Google email equals invites.email, so the harness must be
able to produce a session whose email is exactly, or deliberately not
exactly, the invited address. signInActorWithEmail drives the stub identity
provider with a named email and hands back the same Actor shape the folder
cast produces; callers register the id with Cast.trackUser so cleanup still
sweeps it.

**Enumerated shapes are restated here, once, and asserted key-exact; three
inner shapes are deliberately tolerant, and the tolerance is recorded at the
judge.** 7.5 enumerates the pending-list element and the acceptance
response's outer keys, and 7.3 enumerates the roster element, so those are
exact. What 7.5 does not enumerate is the object inside 201 { invite }, the
object behind the acceptance response's folder key, and the sent-list
element; each is judged only as far as 7.5 reaches.

**Outbound email is observed through the options.notifications sink**, which
makes sends observable to the suite; the 11.8 module names its templates
invite, share_grant, reminder, and the sink replaces the transport. Invite
emails are matched by word the way the auth harness matches share grants:
/invite/i admits any defensible spelling and refuses the other two templates.

**These files stay out of the rate limiter's way.** 10.4 gives invites 5 per
minute per user and 11.3 places the limiter ahead of the handler, so every
POST /invites a file issues spends budget whatever its status. Each file
therefore keeps every single actor's POST /invites calls at five or fewer.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import type { Db } from '../../db/client.js'
import { signIn, userForSub } from './auth-harness.js'
import type { AuthTestApp, OutboundEmail, UserRow } from './auth-harness.js'
import { expectStatus } from './folders-harness.js'
import type { FolderAccessPreset } from '../../src/shared/folder-access.js'
import type { Actor } from './folders-harness.js'
import type { RawResponse } from './http-client.js'
import { rows } from './helpers.js'
import { asRecord, expectExactKeys } from './tasks-harness.js'

/* ------------------------------------------------------------------ *
 * Actors with chosen identities
 * ------------------------------------------------------------------ */

/**
 * A signed-in actor whose Google email is exactly the given string, which is
 * what the 5.2 matching rule turns on. The caller owns cleanup: register the
 * returned id with Cast.trackUser, since this actor is not in any cast.
 */
export async function signInActorWithEmail(
  app: AuthTestApp,
  slug: string,
  email: string,
  prefix = 'p5',
): Promise<Actor> {
  const sub = `${prefix}-${slug}-${randomUUID()}`
  app.stub.nextIdentity({
    sub,
    email,
    email_verified: true,
    name: `${prefix.toUpperCase()} ${slug}`,
  })
  const { browser } = await signIn(app)
  const row = await userForSub(app.db, sub)
  expect(
    row,
    `sign-in must provision a user row for ${slug} (spec 7.1)`,
  ).toBeDefined()
  return { sub, email, id: (row as UserRow).id, browser }
}

/** An email no account holds, unique per call, lowercase as 10.3 stores
 * them. Centralized so no file invents a colliding convention. */
export function freshEmail(slug: string): string {
  return `${slug}-${randomUUID()}@p5-sharing.test`
}

/* ------------------------------------------------------------------ *
 * The 7.5 invite surface
 * ------------------------------------------------------------------ */

export interface InviteBody {
  email: string
  folder_id?: string
  task_id?: string
  /** R9 section 5's intended preset, required with a folder_id and refused
   * without one (issue #228). `postInvite` fills it where a caller sent a
   * folder and left it out, so a case written before Access existed still
   * parks the invite it meant. */
  access?: FolderAccessPreset
}

/** The unjudged transport: refusals answer the 7.0 envelope, not an invite.
 * body is unknown, the tasks-harness convention, so adversarial callers can
 * send malformed shapes without a cast standing in their way. */
export function postInvite(actor: Actor, body: unknown): Promise<RawResponse> {
  return actor.browser.json('/invites', 'POST', withDefaultAccess(body))
}

/**
 * Fills `access` for a body that names a folder and omits it (issue #228).
 *
 * It is written here rather than in every call site because `access` became
 * required with `folder_id` and roughly a dozen fixtures across the suite
 * predate it; `can_edit` is the standing migration 0023 gives an existing
 * member, so those fixtures keep meaning what they meant. **A body that
 * names `access` is passed through untouched**, which is what lets an
 * adversarial caller send a bad one and a #228 criterion send a chosen one.
 */
function withDefaultAccess(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body
  const shape = body as Record<string, unknown>
  if (shape.folder_id === undefined || 'access' in shape) return body
  return { ...shape, access: 'can_edit' }
}

/*
POST /invites asserted: 201 { invite }. 7.5 enumerates the outer key and
nothing inside it, so the envelope is exact and the inner object is judged
only for the id every transition endpoint needs.
*/
export async function createInviteOk(
  actor: Actor,
  body: InviteBody,
  why: string,
): Promise<{ id: string; invite: Record<string, unknown> }> {
  const response = await postInvite(actor, body)
  expectStatus(response, 201, why)
  const envelope = asRecord(response.json(), 'the POST /invites 201 body')
  expectExactKeys(
    envelope,
    ['invite'],
    'the POST /invites 201 body, which 7.5 writes as { invite }',
  )
  const invite = asRecord(envelope.invite, 'the created invite')
  expect(
    typeof invite.id,
    'the created invite carries its id, which every 7.5 transition endpoint addresses',
  ).toBe('string')
  return { id: invite.id as string, invite }
}

export function acceptInvite(actor: Actor, id: string): Promise<RawResponse> {
  return actor.browser.json(`/invites/${id}/accept`, 'POST', {})
}

export function declineInvite(actor: Actor, id: string): Promise<RawResponse> {
  return actor.browser.json(`/invites/${id}/decline`, 'POST', {})
}

export function cancelInvite(actor: Actor, id: string): Promise<RawResponse> {
  return actor.browser.json(`/invites/${id}/cancel`, 'POST', {})
}

export function resendInvite(actor: Actor, id: string): Promise<RawResponse> {
  return actor.browser.json(`/invites/${id}/resend`, 'POST', {})
}

export interface AcceptanceBody extends Record<string, unknown> {
  connection_created: unknown
  folder: unknown
  assigned_task_id: unknown
}

/*
POST /invites/:id/accept asserted: 200 with exactly the three keys 7.5
enumerates, { connection_created, folder or null, assigned_task_id or
null }. The folder key's inner object is the one shape here 7.5 names
without enumerating; when non-null it is judged as an object carrying the
granted folder's id, and the rest rides the shape review.
*/
export async function acceptInviteOk(
  actor: Actor,
  id: string,
  why: string,
): Promise<AcceptanceBody> {
  const response = await acceptInvite(actor, id)
  expectStatus(response, 200, why)
  const body = asRecord(response.json(), 'the acceptance body')
  expectExactKeys(
    body,
    ['assigned_task_id', 'connection_created', 'folder'],
    'the acceptance body, which 7.5 writes as { connection_created, folder or null, assigned_task_id or null }',
  )
  expect(
    typeof body.connection_created,
    'connection_created reports whether this acceptance minted the pair (spec 7.5, 8.7: the connection is created once)',
  ).toBe('boolean')
  return body as AcceptanceBody
}

export interface PendingInviteElement {
  id: string
  inviter: { id: unknown; display_name: unknown; avatar_url: unknown }
  folder_name: string | null
  created_at: unknown
}

/**
 * GET /invites/pending asserted: the login surface, scoped to the caller's
 * email. Element shape is 7.5's, exact: {id, inviter: {id, display_name,
 * avatar_url}, folder_name or null, created_at}. The inviter is 7.0's person
 * shape, the id keying their default face (2026-09-24).
 */
export async function invitesPending(
  actor: Actor,
): Promise<PendingInviteElement[]> {
  const response = await actor.browser.api('/invites/pending')
  expectStatus(
    response,
    200,
    'GET /invites/pending must answer the invites addressed to the caller\'s email (spec 7.5, 6 Q12)',
  )
  const body = response.json()
  expect(
    Array.isArray(body),
    'GET /invites/pending answers the array 7.5 enumerates',
  ).toBe(true)
  const elements: PendingInviteElement[] = []
  for (const [index, entry] of (body as unknown[]).entries()) {
    const where = `pending[${String(index)}]`
    const element = asRecord(entry, where)
    expectExactKeys(
      element,
      ['created_at', 'folder_name', 'id', 'inviter'],
      `${where}, which 7.5 writes as {id, inviter, folder_name or null, created_at}`,
    )
    const inviter = asRecord(element.inviter, `${where}.inviter`)
    expectExactKeys(
      inviter,
      ['avatar_url', 'display_name', 'id'],
      `${where}.inviter, which 7.5 gives as 7.0's person shape`,
    )
    expect(typeof element.id, `${where}.id must be a string`).toBe('string')
    expect(
      element.folder_name === null || typeof element.folder_name === 'string',
      `${where}.folder_name is a string for a folder invite and null for a bare one (spec 7.5)`,
    ).toBe(true)
    elements.push({
      id: element.id as string,
      inviter: inviter as PendingInviteElement['inviter'],
      folder_name: element.folder_name as string | null,
      created_at: element.created_at,
    })
  }
  return elements
}

/**
 * GET /invites/sent asserted as far as 7.5 reaches: 200, an array, newest
 * first, any status. 7.5 enumerates no element shape for this list, so
 * elements are read as records and callers find theirs by id. What is
 * asserted is what the criteria
 * need: the list exists, and an element names its invite and its status,
 * without which "the inviter sees declined" (AC-067) is not a sentence this
 * surface can satisfy at all.
 */
export async function invitesSent(
  actor: Actor,
): Promise<Record<string, unknown>[]> {
  const response = await actor.browser.api('/invites/sent')
  expectStatus(
    response,
    200,
    'GET /invites/sent must answer the caller\'s invites, newest first, any status (spec 7.5)',
  )
  const body = response.json()
  expect(
    Array.isArray(body),
    'GET /invites/sent answers a list (spec 7.5)',
  ).toBe(true)
  return (body as unknown[]).map((entry, index) =>
    asRecord(entry, `sent[${String(index)}]`),
  )
}

export function sentEntry(
  list: readonly Record<string, unknown>[],
  inviteId: string,
): Record<string, unknown> | undefined {
  return list.find((entry) => entry.id === inviteId)
}

/* ------------------------------------------------------------------ *
 * The 7.3 connection surface
 * ------------------------------------------------------------------ */

export interface RosterElement {
  user: { id: string; display_name: unknown; avatar_url: unknown; email: unknown }
  connected_at: unknown
}

/**
 * GET /connections asserted: 7.3's element, exact: { user: {id,
 * display_name, avatar_url, email}, connected_at }. This is the one person
 * shape in the contract that carries an email, and deliberately: a roster
 * entry is someone the viewer exchanged invites with, and the email is what
 * the sharing panel re-shares to.
 */
export async function listConnections(actor: Actor): Promise<RosterElement[]> {
  const response = await actor.browser.api('/connections')
  expectStatus(
    response,
    200,
    'GET /connections must answer the caller\'s roster (spec 7.3, 6 Q9)',
  )
  const body = response.json()
  expect(
    Array.isArray(body),
    'GET /connections answers the list 7.3 enumerates',
  ).toBe(true)
  const elements: RosterElement[] = []
  for (const [index, entry] of (body as unknown[]).entries()) {
    const where = `connections[${String(index)}]`
    const element = asRecord(entry, where)
    expectExactKeys(
      element,
      ['connected_at', 'user'],
      `${where}, which 7.3 writes as { user, connected_at }`,
    )
    const user = asRecord(element.user, `${where}.user`)
    expectExactKeys(
      user,
      ['avatar_url', 'display_name', 'email', 'id'],
      `${where}.user, which 7.3 gives id, display_name, avatar_url, and email`,
    )
    expect(typeof user.id, `${where}.user.id must be a string`).toBe('string')
    elements.push({
      user: user as RosterElement['user'],
      connected_at: element.connected_at,
    })
  }
  return elements
}

export function rosterIds(roster: readonly RosterElement[]): string[] {
  return roster.map((element) => element.user.id)
}

export function deleteConnection(
  actor: Actor,
  userId: string,
): Promise<RawResponse> {
  return actor.browser.api(`/connections/${userId}`, { method: 'DELETE' })
}

/* ------------------------------------------------------------------ *
 * Account deletion, the 8.10 surface
 * ------------------------------------------------------------------ */

/** DELETE /me with the literal confirm string of 7.1. */
export function deleteAccount(actor: Actor): Promise<RawResponse> {
  return actor.browser.json('/me', 'DELETE', { confirm: 'DELETE' })
}

export interface UserColumns extends Record<string, unknown> {
  id: string
  google_sub: string | null
  email: string | null
  display_name: string | null
  avatar_url: string | null
  deleted_at: string | null
}

/** The identity columns 8.10 step 7 scrubs, read by id: after the scrub the
 * sub is null, so the auth harness's by-sub readers cannot find the row. */
export async function userRowById(
  db: Db,
  id: string,
): Promise<UserColumns | undefined> {
  const found = await rows(
    db,
    sql`
      SELECT id, google_sub, email, display_name, avatar_url,
             ${instantColumn('deleted_at')}
        FROM users WHERE id = ${id}
    `,
  )
  return found[0] as UserColumns | undefined
}

/* ------------------------------------------------------------------ *
 * Outbound email, through the ratified sink
 * ------------------------------------------------------------------ */

/** Emails whose template names the 11.8 invite one, by word rather than
 * spelling, the auth harness's own convention for share grants. share_grant
 * and reminder both fail the word test, so the filter discriminates. */
export function inviteEmails(app: AuthTestApp): readonly OutboundEmail[] {
  return app.emails.sent().filter((email) => /invite/i.test(email.template))
}

export function inviteEmailsTo(
  app: AuthTestApp,
  address: string,
): readonly OutboundEmail[] {
  return inviteEmails(app).filter((email) => email.to === address)
}

/* ------------------------------------------------------------------ *
 * Database truth, scoped to named rows
 * ------------------------------------------------------------------ */

/*
Instants are rendered by the database, the tasks-harness rule: PGlite hands
back the string Postgres printed while node-postgres parses OID 1184 into a
JS Date, and last_sent_at moves by less than a second across a resend, so a
driver-parsed read would retire the assertion that the resend touched it.
*/
const INSTANT_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'

function instantColumn(name: string): ReturnType<typeof sql.raw> {
  return sql.raw(
    `to_char(${name} AT TIME ZONE 'UTC', '${INSTANT_FORMAT}') AS ${name}`,
  )
}

export interface InviteRow extends Record<string, unknown> {
  id: string
  inviter_id: string
  email: string
  folder_id: string | null
  task_id: string | null
  status: string
  last_sent_at: string
  responded_at: string | null
  accepted_by: string | null
  created_at: string
}

export async function inviteRow(
  db: Db,
  id: string,
): Promise<InviteRow | undefined> {
  const found = await rows(
    db,
    sql`
      SELECT id, inviter_id, email, folder_id, task_id, status, accepted_by,
             ${instantColumn('last_sent_at')},
             ${instantColumn('responded_at')},
             ${instantColumn('created_at')}
        FROM invites WHERE id = ${id}
    `,
  )
  return found[0] as InviteRow | undefined
}

/** The row, asserted present: a criterion about an invite's stored state
 * cannot be read off a row a wrong implementation deleted. */
export async function requireInviteRow(db: Db, id: string): Promise<InviteRow> {
  const row = await inviteRow(db, id)
  expect(row, `invite ${id} must still exist`).toBeDefined()
  return row as InviteRow
}

/** Invite rows for one inviter, newest first, matching the sent list's own
 * order so the two sides of an assertion agree on a sequence. */
export async function inviteRowsOfInviter(
  db: Db,
  inviterId: string,
): Promise<InviteRow[]> {
  const found = await rows(
    db,
    sql`
      SELECT id, inviter_id, email, folder_id, task_id, status, accepted_by,
             ${instantColumn('last_sent_at')},
             ${instantColumn('responded_at')},
             ${instantColumn('created_at')}
        FROM invites WHERE inviter_id = ${inviterId}
        ORDER BY created_at DESC, id DESC
    `,
  )
  return found as unknown as InviteRow[]
}

/**
 * Moves an invite's last_sent_at into the past, which is the only way to
 * reach the far side of 5.2's 24-hour resend window without waiting there:
 * the column is set by create and resend alone, and both stamp now().
 * setSessionExpiry moves session expiries the same way.
 */
export async function backdateLastSent(
  db: Db,
  inviteId: string,
  hoursAgo: number,
): Promise<void> {
  await db.execute(sql`
    UPDATE invites
       SET last_sent_at = now() - (${hoursAgo} * interval '1 hour')
     WHERE id = ${inviteId}
  `)
}

/** The connection rows for one unordered pair. INV-9 admits at most one,
 * in canonical order; both facts are the caller's to assert. */
export async function connectionPair(
  db: Db,
  a: string,
  b: string,
): Promise<Record<string, unknown>[]> {
  return rows(
    db,
    sql`
      SELECT user_a_id, user_b_id, ${instantColumn('created_at')}
        FROM connections
       WHERE user_a_id = least(${a}::uuid, ${b}::uuid)
         AND user_b_id = greatest(${a}::uuid, ${b}::uuid)
    `,
  )
}

export async function connectionCount(db: Db, userId: string): Promise<number> {
  const found = await rows(
    db,
    sql`
      SELECT count(*)::int AS n FROM connections
       WHERE user_a_id = ${userId} OR user_b_id = ${userId}
    `,
  )
  return Number(found[0]?.n ?? Number.NaN)
}

export async function membershipCount(db: Db, userId: string): Promise<number> {
  const found = await rows(
    db,
    sql`SELECT count(*)::int AS n FROM folder_members WHERE user_id = ${userId}`,
  )
  return Number(found[0]?.n ?? Number.NaN)
}

export async function myDayCountForUser(
  db: Db,
  userId: string,
): Promise<number> {
  const found = await rows(
    db,
    sql`SELECT count(*)::int AS n FROM my_day_entries WHERE user_id = ${userId}`,
  )
  return Number(found[0]?.n ?? Number.NaN)
}
