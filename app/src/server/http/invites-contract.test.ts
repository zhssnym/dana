/*
The 7.5 and 7.3 contract as code, checked against the surface that answers:
the sibling of contract.test.ts and folders-contract.test.ts, same skeleton,
scoped to the shapes the P5 endpoint shape review settled. The real createApp
boots against the stub issuer with the invites and connections routers
mounted, and every response parses with the shared schemas themselves, so the
promise in src/shared/invites.ts and the answer on the wire cannot drift
silently.

This file exists because four of those shapes were floors until this review,
and a schema that agrees with a route only because nobody checked is what the
review is for. So the four settled decisions are each probed key-exact on the
raw body, not on the parse: a parse strips the extra field exactness exists to
notice, which is the lesson folders-contract.test.ts records where it pins the
members' person object.

Scope: shapes, the four settled decisions, and envelope conformance on this
surface's refusals. The behaviors behind them are AC-059 to AC-069's and
AC-139 to AC-141's, and nothing here duplicates a criterion; where a behavior
is exercised (a create, an acceptance, a resend) it exists to produce a body
worth parsing.
*/
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../../../db/client.js'
import { cleanupUsers, createTestDb, rows } from '../../../tests/support/helpers.js'
import { TestBrowser } from '../../../tests/support/http-client.js'
import type { RawRequestOptions } from '../../../tests/support/http-client.js'
import { startOidcStub } from '../../../tests/support/oidc-stub.js'
import type { OidcStub } from '../../../tests/support/oidc-stub.js'
import { getConnectionsResponse } from '../../shared/connections.js'
import { errorEnvelope } from '../../shared/error-envelope.js'
import {
  acceptInviteResponse,
  cancelInviteResponse,
  declineInviteResponse,
  getInvitesPendingResponse,
  getInvitesSentResponse,
  postInvitesConversionResponse,
  postInvitesResponse,
  resendInviteResponse,
} from '../../shared/invites.js'
import { createApp } from '../index.js'

let dbClient: DbClient
let stub: OidcStub
let server: Server
let origin: string
const created: string[] = []
const domain = `invites-contract-${randomUUID()}.test`

interface Person {
  jar: TestBrowser
  id: string
  email: string
}

beforeAll(async () => {
  dbClient = await createTestDb()
  stub = await startOidcStub()

  server = createServer()
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`

  server.on(
    'request',
    createApp({
      dbClient,
      auth: {
        issuerUrl: stub.issuerUrl,
        clientId: stub.clientId,
        clientSecret: stub.clientSecret,
        appOrigin: origin,
        allowInsecureRequests: true,
      },
    }),
  )
}, 60_000)

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  await stub.close()
  // invites.inviter_id has no ON DELETE clause, so the rows go before the
  // accounts that sent them; connections cascade with the user.
  for (const id of created) {
    await dbClient.db.execute(sql`DELETE FROM invites WHERE inviter_id = ${id}`)
    await dbClient.db.execute(
      sql`DELETE FROM folder_members WHERE user_id = ${id}`,
    )
  }
  await cleanupUsers(dbClient.db, created)
  await dbClient.close()
})

async function signIn(name: string): Promise<Person> {
  const sub = `invites-contract-${randomUUID()}`
  const email = `${sub}@${domain}`
  stub.nextIdentity({ sub, email, email_verified: true, name })
  const jar = new TestBrowser(origin)
  const begun = await jar.request(`${origin}/api/v1/auth/google`)
  const provider = await fetch(new URL(begun.location ?? ''), {
    redirect: 'manual',
  })
  await jar.request(provider.headers.get('location') ?? '')

  const found = await rows(
    dbClient.db,
    sql`SELECT id FROM users WHERE google_sub = ${sub}`,
  )
  const id = String(found[0]?.id)
  created.push(id)
  return { jar, id, email }
}

async function connect(a: string, b: string): Promise<void> {
  await dbClient.db.execute(sql`
    INSERT INTO connections (user_a_id, user_b_id)
    VALUES (least(${a}::uuid, ${b}::uuid), greatest(${a}::uuid, ${b}::uuid))
    ON CONFLICT DO NOTHING
  `)
}

function api(person: Person, path: string, init?: RawRequestOptions) {
  return person.jar.request(`${origin}/api/v1${path}`, init)
}

function jsonInit(method: string, body: unknown): RawRequestOptions {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function issues(parsed: { success: boolean; error?: { issues: { path: (string | number | symbol)[]; message: string }[] } }): string[] {
  return parsed.success
    ? []
    : (parsed.error?.issues ?? []).map(
        (i) => `${i.path.map(String).join('.')}: ${i.message}`,
      )
}

function keysOf(value: unknown): string[] {
  return Object.keys(value as Record<string, unknown>).sort()
}

/** The nine fields of the settled 7.5 invite element, and no others. */
const INVITE_KEYS = [
  'created_at',
  'email',
  'folder_id',
  'folder_name',
  'id',
  'last_sent_at',
  'responded_at',
  'status',
  'task_id',
]

/** The keys of the 7.0 Folder object, folders-contract.test.ts's list; the
 * 4.3 identity four joined with RFC 0005, `my_shelf` plus `personal_labels`
 * with issue #226, and `my_access` with issue #228. `my_label` was `my_shelf`
 * under its previous name, carried beside it for one release so that a
 * browser tab holding an old bundle across a deploy still read a shelf; #247
 * retired it, and it is gone from here for that reason and no other. That
 * file's list carries the argument in full, including why neither list writes
 * its own length in prose. */
const FOLDER_KEYS = [
  'color',
  'counts',
  'cover_file_id',
  'cover_focal_y',
  'cover_preset',
  'description',
  'icon',
  'id',
  'is_default',
  'is_owner',
  'member_count',
  'my_access',
  'my_color',
  'my_shelf',
  'name',
  'personal_labels',
]

/** 7.4's member element and 7.0's person shape inside it, no email. */
/* `access` joined the member element with issue #228 (#209 R8A, R9 section
   13): a member's current Access preset is Folder-visible to every member,
   and it sits beside `role` rather than replacing it -- `role` expressed no
   authority before the change and expresses none after it. */
const MEMBER_KEYS = ['access', 'is_owner', 'joined_at', 'role', 'user']
const PERSON_KEYS = ['avatar_url', 'display_name', 'id']

/** Frozen 7.5's pending element, whose inviter carries two keys and not three. */
const PENDING_KEYS = ['created_at', 'folder_name', 'id', 'inviter']
const INVITER_KEYS = ['avatar_url', 'display_name']

/** Frozen 7.3's roster element, whose user is the person shape plus email. */
const CONNECTION_KEYS = ['connected_at', 'user']
const CONNECTION_USER_KEYS = ['avatar_url', 'display_name', 'email', 'id']

let inviter: Person
let connected: Person
let folderId: string

async function staged(): Promise<{
  inviter: Person
  connected: Person
  folderId: string
}> {
  if (folderId === undefined) {
    inviter = await signIn('Invite Contract Inviter')
    connected = await signIn('Invite Contract Connection')
    await connect(inviter.id, connected.id)
    const response = await api(
      inviter,
      '/folders',
      jsonInit('POST', { name: 'invite contract folder' }),
    )
    expect(response.status, 'staging POST /folders must answer 201').toBe(201)
    folderId = String((response.json() as { id?: unknown }).id)
  }
  return { inviter, connected, folderId }
}

/** A stranger's address: an invite is addressed to an email, not an account. */
function stranger(): string {
  return `stranger-${randomUUID()}@${domain}`
}

describe('the 7.5 and 7.3 shapes against the mounted application', () => {
  test('the 201 and the sent list carry one object, key-exact (settled shape 1)', async () => {
    const { inviter } = await staged()
    const email = stranger()
    const response = await api(
      inviter,
      '/invites',
      jsonInit('POST', { email }),
    )
    expect(response.status, 'a bare invite to a stranger parks (5.2)').toBe(201)
    const body = response.json()
    expect(
      issues(postInvitesResponse.safeParse(body)),
      'the 201 body does not match the shared schema',
    ).toEqual([])
    const wrapped = (body as { invite: unknown }).invite
    expect(
      keysOf(body),
      'the 201 wraps the element under exactly one key',
    ).toEqual(['invite'])
    expect(
      keysOf(wrapped),
      'the created invite carries exactly the settled nine fields',
    ).toEqual(INVITE_KEYS)

    const sent = await api(inviter, '/invites/sent')
    expect(sent.status).toBe(200)
    const list = sent.json()
    expect(
      Array.isArray(list),
      '7.5 writes this list, so it is the bare array',
    ).toBe(true)
    expect(
      issues(getInvitesSentResponse.safeParse(list)),
      'the sent list does not match the shared schema',
    ).toEqual([])
    const element = (list as unknown[]).find(
      (row) => (row as { id?: unknown }).id === (wrapped as { id: string }).id,
    )
    expect(element, 'the invite just created must be on its inviter\'s list').toBeDefined()
    expect(
      keysOf(element),
      'the settled reading: the 201 object and the sent element are one object',
    ).toEqual(INVITE_KEYS)
    expect(
      element,
      'and not merely the same keys, the same values',
    ).toEqual(wrapped)
  })

  test('the conversion answers the 7.4 member element, key-exact (settled shape 2)', async () => {
    const { inviter, connected, folderId } = await staged()
    const response = await api(
      inviter,
      '/invites',
      jsonInit('POST', { email: connected.email, folder_id: folderId, access: 'can_edit' }),
    )
    expect(
      response.status,
      'a connected email with a folder converts to an instant share (8.7)',
    ).toBe(200)
    const body = response.json()
    expect(
      issues(postInvitesConversionResponse.safeParse(body)),
      'the conversion body does not match the shared schema',
    ).toEqual([])
    expect(
      keysOf(body),
      'the settled reading: converted_to_share plus the membership it created',
    ).toEqual(['converted_to_share', 'membership'])
    const membership = (body as { membership: unknown }).membership
    expect(
      keysOf(membership),
      'the membership is 7.4\'s member element, the object POST members answers',
    ).toEqual(MEMBER_KEYS)
    expect(
      keysOf((membership as { user: unknown }).user),
      'and inside it the ruled person shape, email excluded',
    ).toEqual(PERSON_KEYS)
    expect(
      (membership as { user: { id: string } }).user.id,
      'the membership reported is the invited person\'s',
    ).toBe(connected.id)
  })

  test('the acceptance answers the full 7.0 Folder, key-exact (settled shape 3)', async () => {
    const { inviter, folderId } = await staged()
    const acceptor = await signIn('Invite Contract Acceptor')
    const created = await api(
      inviter,
      '/invites',
      jsonInit('POST', { email: acceptor.email, folder_id: folderId, access: 'can_edit' }),
    )
    expect(created.status, 'a stranger with a folder parks an invite').toBe(201)
    const inviteId = (created.json() as { invite: { id: string } }).invite.id

    const response = await api(acceptor, `/invites/${inviteId}/accept`, {
      method: 'POST',
    })
    expect(response.status).toBe(200)
    const body = response.json()
    expect(
      issues(acceptInviteResponse.safeParse(body)),
      'the acceptance body does not match the shared schema',
    ).toEqual([])
    expect(
      keysOf(body),
      'frozen 7.5 fixes these three outer keys and no fourth',
    ).toEqual(['assigned_task_id', 'connection_created', 'folder'])
    const folder = (body as { folder: unknown }).folder
    expect(
      keysOf(folder),
      'the settled reading: 7.0\'s Folder object, not 7.10\'s three-key stub',
    ).toEqual(FOLDER_KEYS)

    // The five fields that separate the two readings, each carrying a real
    // value here: this is what a client acquiring a folder cannot learn from
    // the stub, and the reason the review did not follow 7.10's ruling.
    const settled = folder as {
      is_owner: boolean
      member_count: number
      counts: { pending: number; completed: number }
    }
    expect(settled.is_owner, 'the acceptor joined, so they do not own it').toBe(
      false,
    )
    expect(
      settled.member_count,
      'the owner plus the converted member plus this acceptor',
    ).toBeGreaterThanOrEqual(2)
    expect(keysOf(settled.counts)).toEqual(['completed', 'pending'])
  })

  test('decline, cancel and resend each answer { invite } (settled shape 4)', async () => {
    const { inviter, folderId } = await staged()

    // decline, by the matched recipient, who must be an account to call it.
    const decliner = await signIn('Invite Contract Decliner')
    const toDecline = await api(
      inviter,
      '/invites',
      jsonInit('POST', { email: decliner.email, folder_id: folderId, access: 'can_edit' }),
    )
    expect(toDecline.status).toBe(201)
    const declineId = (toDecline.json() as { invite: { id: string } }).invite.id
    const declined = await api(decliner, `/invites/${declineId}/decline`, {
      method: 'POST',
    })
    expect(declined.status).toBe(200)
    expect(
      issues(declineInviteResponse.safeParse(declined.json())),
      'the decline body does not match the shared schema',
    ).toEqual([])
    expect(keysOf(declined.json())).toEqual(['invite'])
    const declinedInvite = (declined.json() as { invite: unknown }).invite
    expect(
      keysOf(declinedInvite),
      'the same settled element the 201 carries',
    ).toEqual(INVITE_KEYS)
    expect(
      (declinedInvite as { status: string; responded_at: string | null }).status,
      'a mutation answers what a fresh GET would, so the new state is on it',
    ).toBe('declined')
    expect(
      (declinedInvite as { responded_at: string | null }).responded_at,
      'and 4.9 stamps responded_at on every terminal transition',
    ).not.toBeNull()

    // cancel, by the inviter, whose target need not be an account at all.
    const toCancel = await api(
      inviter,
      '/invites',
      jsonInit('POST', { email: stranger(), folder_id: folderId, access: 'can_edit' }),
    )
    expect(toCancel.status).toBe(201)
    const cancelId = (toCancel.json() as { invite: { id: string } }).invite.id
    const canceled = await api(inviter, `/invites/${cancelId}/cancel`, {
      method: 'POST',
    })
    expect(canceled.status).toBe(200)
    expect(
      issues(cancelInviteResponse.safeParse(canceled.json())),
      'the cancel body does not match the shared schema',
    ).toEqual([])
    expect(keysOf((canceled.json() as { invite: unknown }).invite)).toEqual(
      INVITE_KEYS,
    )
    expect(
      (canceled.json() as { invite: { status: string } }).invite.status,
    ).toBe('canceled')

    // resend, by the inviter, past 5.2's window: the anchor is backdated
    // directly because the window is a state guard and only its body is
    // under test here.
    const toResend = await api(
      inviter,
      '/invites',
      jsonInit('POST', { email: stranger(), folder_id: folderId, access: 'can_edit' }),
    )
    expect(toResend.status).toBe(201)
    const resendId = (toResend.json() as { invite: { id: string } }).invite.id
    await dbClient.db.execute(
      sql`UPDATE invites SET last_sent_at = now() - interval '48 hours'
          WHERE id = ${resendId}`,
    )
    const resent = await api(inviter, `/invites/${resendId}/resend`, {
      method: 'POST',
    })
    expect(resent.status).toBe(200)
    expect(
      issues(resendInviteResponse.safeParse(resent.json())),
      'the resend body does not match the shared schema',
    ).toEqual([])
    const resentInvite = (resent.json() as { invite: unknown }).invite
    expect(keysOf(resentInvite)).toEqual(INVITE_KEYS)
    expect(
      (resentInvite as { status: string }).status,
      'a resend moves the anchor and leaves the state alone',
    ).toBe('pending')
  })

  test('GET /invites/pending answers frozen 7.5\'s element, key-exact', async () => {
    const { inviter, folderId } = await staged()
    const viewer = await signIn('Invite Contract Viewer')
    const withFolder = await api(
      inviter,
      '/invites',
      jsonInit('POST', { email: viewer.email, folder_id: folderId, access: 'can_edit' }),
    )
    expect(withFolder.status).toBe(201)

    const response = await api(viewer, '/invites/pending')
    expect(response.status).toBe(200)
    const list = response.json()
    expect(Array.isArray(list), '7.5 writes this list bare').toBe(true)
    expect(
      issues(getInvitesPendingResponse.safeParse(list)),
      'the pending list does not match the shared schema',
    ).toEqual([])
    expect((list as unknown[]).length, 'exactly the one invite staged').toBe(1)
    const element = (list as unknown[])[0]
    expect(
      keysOf(element),
      'frozen 7.5 enumerates this element field for field',
    ).toEqual(PENDING_KEYS)
    expect(
      keysOf((element as { inviter: unknown }).inviter),
      'a recipient has no claim on the inviter\'s id, so the shape omits it',
    ).toEqual(INVITER_KEYS)
    expect(
      (element as { folder_name: string | null }).folder_name,
      'a folder invite names its folder, which is the 7.5 discriminator',
    ).toBe('invite contract folder')
  })

  test('GET /connections answers frozen 7.3\'s element, key-exact and with the email', async () => {
    const { inviter, connected } = await staged()
    const response = await api(inviter, '/connections')
    expect(response.status).toBe(200)
    const list = response.json()
    expect(Array.isArray(list), '7.3 writes this list bare').toBe(true)
    expect(
      issues(getConnectionsResponse.safeParse(list)),
      'the roster does not match the shared schema',
    ).toEqual([])
    const element = (list as unknown[]).find(
      (row) =>
        (row as { user: { id: string } }).user.id === connected.id,
    )
    expect(element, 'the staged connection must be on the roster').toBeDefined()
    expect(keysOf(element), 'frozen 7.3 enumerates two keys').toEqual(
      CONNECTION_KEYS,
    )
    expect(
      keysOf((element as { user: unknown }).user),
      '7.3 is the one person shape in this contract that carries an address',
    ).toEqual(CONNECTION_USER_KEYS)
    expect(
      (element as { user: { email: string } }).user.email,
      'and it is the connected account\'s own, which the panel re-shares to',
    ).toBe(connected.email)
  })

  test('every refusal on this surface answers the 7.0 envelope', async () => {
    const { inviter, connected, folderId } = await staged()

    // Staged for the 429: a pending invite whose anchor is inside 5.2's window.
    const fresh = await api(
      inviter,
      '/invites',
      jsonInit('POST', { email: stranger(), folder_id: folderId, access: 'can_edit' }),
    )
    expect(fresh.status).toBe(201)
    const freshId = (fresh.json() as { invite: { id: string } }).invite.id

    const refusals: readonly [
      number,
      Promise<{
        status: number
        json(): unknown
        headers: Record<string, unknown>
      }>,
      string,
    ][] = [
      [
        422,
        api(inviter, '/invites', jsonInit('POST', { email: inviter.email })),
        'an invite to V\'s own address',
      ],
      [
        409,
        api(inviter, '/invites', jsonInit('POST', { email: connected.email })),
        'a bare invite to an existing connection (the 2026-08-09 ruling)',
      ],
      [
        404,
        api(inviter, `/invites/${randomUUID()}/accept`, { method: 'POST' }),
        'an invite id naming nothing, which must never read as 403',
      ],
      [
        404,
        api(inviter, '/invites/not-a-uuid/cancel', { method: 'POST' }),
        'a non-uuid path id, which must never surface as a cast error',
      ],
      [
        429,
        api(inviter, `/invites/${freshId}/resend`, { method: 'POST' }),
        'a resend inside 5.2\'s 24-hour window',
      ],
    ]
    for (const [expected, request, what] of refusals) {
      const response = await request
      expect(response.status, `${what} must answer ${String(expected)}`).toBe(
        expected,
      )
      expect(
        errorEnvelope.safeParse(response.json()).success,
        `${what} must carry the 7.0 envelope`,
      ).toBe(true)
      if (expected === 429) {
        expect(
          response.headers['retry-after'],
          '7.0 gives 429 a Retry-After',
        ).toBeDefined()
      }
    }
  })
})
