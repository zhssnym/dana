/*
The 7.4 contract as code, checked against the surface that answers: the
sibling of contract.test.ts, same skeleton, scoped to the folder shapes
the P2 shape review settled. The real createApp boots against the stub
issuer with the folders router mounted, and every response parses with
the shared schemas themselves, so the promise in src/shared/folders.ts
and the answer on the wire cannot drift silently.

Scope: shapes, the settled wrapper and key decisions, and envelope
conformance on this surface's refusals. The behaviors behind them are
AC-011 to AC-024's, and nothing here duplicates a criterion; where a
behavior is exercised (an add, a delete) it exists to produce a body
worth parsing.

One exactness gap is deliberate: the members' user object is not yet
pinned key-exact, because the mounted implementation still carries an
email field the review ruled out of the shape (routed to the
Collaboration engineer; the shared schema already states the ruled
form and parsing strips the extra key). The key-exact probe lands when
that finding does.
*/
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../../../db/client.js'
import { cleanupUsers, createTestDb, rows } from '../../../tests/helpers.js'
import { TestBrowser } from '../../../tests/http-client.js'
import type { RawRequestOptions } from '../../../tests/http-client.js'
import { startOidcStub } from '../../../tests/oidc-stub.js'
import type { OidcStub } from '../../../tests/oidc-stub.js'
import { errorEnvelope } from '../../shared/error-envelope.js'
import {
  deleteFolderResponse,
  folder,
  getFolderResponse,
  getFoldersResponse,
  postFolderMembersResponse,
} from '../../shared/folders.js'
import { createApp } from '../index.js'

let dbClient: DbClient
let stub: OidcStub
let server: Server
let origin: string
const created: string[] = []
const domain = `folders-contract-${randomUUID()}.test`

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
  for (const id of created) {
    await dbClient.db.execute(
      sql`DELETE FROM folder_members WHERE user_id = ${id}`,
    )
  }
  await cleanupUsers(dbClient.db, created)
  await dbClient.close()
})

async function signIn(name: string): Promise<Person> {
  const sub = `folders-contract-${randomUUID()}`
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

/** The eight keys of the 7.0 Folder object, and no others. */
const FOLDER_KEYS = [
  'counts',
  'id',
  'is_default',
  'is_owner',
  'member_count',
  'my_color',
  'my_label',
  'name',
]

let owner: Person
let member: Person
let folderId: string

async function staged(): Promise<{ owner: Person; member: Person; folderId: string }> {
  if (folderId === undefined) {
    owner = await signIn('Contract Owner')
    member = await signIn('Contract Member')
    await connect(owner.id, member.id)
    const response = await api(
      owner,
      '/folders',
      jsonInit('POST', { name: 'contract folder' }),
    )
    expect(response.status, 'staging POST /folders must answer 201').toBe(201)
    folderId = String((response.json() as { id?: unknown }).id)
  }
  return { owner, member, folderId }
}

describe('the 7.4 shapes against the mounted application', () => {
  test('POST /folders answers the Folder object, key-exact', async () => {
    const { owner } = await staged()
    const response = await api(
      owner,
      '/folders',
      jsonInit('POST', { name: 'shape probe' }),
    )
    expect(response.status).toBe(201)
    const body = response.json()
    const parsed = folder.safeParse(body)
    expect(
      parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      'the 201 body does not match the shared Folder schema',
    ).toEqual([])
    expect(
      Object.keys(body as Record<string, unknown>).sort(),
      'the Folder object carries exactly the 7.0 keys',
    ).toEqual(FOLDER_KEYS)
  })

  test('GET /folders answers the settled bare array, every entry a Folder', async () => {
    const { owner } = await staged()
    const response = await api(owner, '/folders')
    expect(response.status).toBe(200)
    const body = response.json()
    expect(
      Array.isArray(body),
      'the settled 7.4 list shape is the bare array',
    ).toBe(true)
    const parsed = getFoldersResponse.safeParse(body)
    expect(
      parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    ).toEqual([])
  })

  test('the detail extends Folder with members and pending_invites, key-exact at the top', async () => {
    const { owner, member, folderId } = await staged()
    const added = await api(
      owner,
      `/folders/${folderId}/members`,
      jsonInit('POST', { user_id: member.id }),
    )
    expect(added.status, 'the staging add must answer 201').toBe(201)
    const addedParsed = postFolderMembersResponse.safeParse(added.json())
    expect(
      addedParsed.success
        ? []
        : addedParsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      'the 201 member element does not match the shared schema',
    ).toEqual([])

    // A pending invite seeded directly: invite rows are P5's surface, and
    // only the element's shape is under test here.
    const inviteEmail = `pending-${randomUUID()}@${domain}`
    await dbClient.db.execute(
      sql`INSERT INTO invites (inviter_id, email, folder_id)
          VALUES (${owner.id}::uuid, ${inviteEmail}, ${folderId}::uuid)`,
    )

    const response = await api(owner, `/folders/${folderId}`)
    expect(response.status).toBe(200)
    const body = response.json()
    const parsed = getFolderResponse.safeParse(body)
    expect(
      parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      'the detail does not match the shared schema',
    ).toEqual([])
    expect(
      Object.keys(body as Record<string, unknown>).sort(),
      'the detail is the Folder keys plus the two settled list keys',
    ).toEqual([...FOLDER_KEYS, 'members', 'pending_invites'].sort())
    if (parsed.success) {
      expect(parsed.data.members).toHaveLength(2)
      expect(
        parsed.data.members.filter((element) => element.is_owner).length,
      ).toBe(1)
      expect(parsed.data.pending_invites).toHaveLength(1)
      expect(parsed.data.pending_invites[0]?.email).toBe(inviteEmail)
      expect(parsed.data.pending_invites[0]?.task_id).toBeNull()
    }

    await dbClient.db.execute(
      sql`DELETE FROM invites WHERE inviter_id = ${owner.id}`,
    )
  })

  test('both PATCH endpoints answer the Folder object a fresh GET would give', async () => {
    const { owner, folderId } = await staged()
    const renamed = await api(
      owner,
      `/folders/${folderId}`,
      jsonInit('PATCH', { name: 'contract folder renamed' }),
    )
    expect(renamed.status).toBe(200)
    const renamedParsed = folder.safeParse(renamed.json())
    expect(renamedParsed.success).toBe(true)
    if (renamedParsed.success) {
      expect(renamedParsed.data.name).toBe('contract folder renamed')
    }

    const labeled = await api(
      owner,
      `/folders/${folderId}/my-membership`,
      jsonInit('PATCH', { label: 'Contract', color: '#0044AA' }),
    )
    expect(labeled.status).toBe(200)
    const labeledParsed = folder.safeParse(labeled.json())
    expect(labeledParsed.success).toBe(true)
    if (labeledParsed.success) {
      expect(labeledParsed.data.my_label).toBe('Contract')
      expect(labeledParsed.data.my_color).toBe('#0044AA')
    }
  })

  test('DELETE answers exactly { deleted: { three tallies } }', async () => {
    const { owner } = await staged()
    const doomed = await api(
      owner,
      '/folders',
      jsonInit('POST', { name: 'doomed by contract' }),
    )
    const doomedId = String((doomed.json() as { id?: unknown }).id)
    const response = await api(owner, `/folders/${doomedId}`, {
      method: 'DELETE',
    })
    expect(response.status).toBe(200)
    const body = response.json()
    const parsed = deleteFolderResponse.safeParse(body)
    expect(parsed.success).toBe(true)
    expect(Object.keys(body as Record<string, unknown>)).toEqual(['deleted'])
    expect(
      Object.keys(
        (body as { deleted: Record<string, unknown> }).deleted,
      ).sort(),
    ).toEqual(['tasks_abandoned', 'tasks_completed', 'tasks_open'])
  })

  test('every refusal on this surface answers the 7.0 envelope', async () => {
    const { owner, member, folderId } = await staged()
    const defaultId = (
      getFoldersResponse.parse(
        (await api(owner, '/folders')).json(),
      ) as { id: string; is_default: boolean }[]
    ).find((entry) => entry.is_default)?.id

    const refusals: readonly [number, Promise<{ status: number; json(): unknown }>, string][] = [
      [
        403,
        api(member, `/folders/${folderId}`, jsonInit('PATCH', { name: 'no' })),
        'a member rename',
      ],
      [
        404,
        api(owner, '/folders/not-a-uuid'),
        'a non-uuid path id, which must never surface as a cast error',
      ],
      [
        409,
        api(owner, `/folders/${String(defaultId)}`, { method: 'DELETE' }),
        'the default folder delete',
      ],
      [
        422,
        api(owner, '/folders', jsonInit('POST', { name: '' })),
        'an out-of-range name',
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
    }
  })
})
