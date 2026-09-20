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

The members' user object is pinned key-exact below. The review deferred
that one probe while the mounted implementation still carried an email
field the ruling excluded; the Collaboration engineer's fix landed the
ruled shape (9653582), and the probe landed with it, reading the raw
body because a parse strips what exactness exists to notice.
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

/** The sixteen keys of the 7.0 Folder object, and no others; the 4.3
 * identity four joined with RFC 0005, and item 58's cover pair.
 *
 * **`my_label` and `my_shelf` are both listed and that is deliberate.** Issue
 * #226 renamed the key and #247 removes the old one; for the release between
 * the two, the card carries both, the same value from the same column, so
 * that a browser tab holding an old bundle across a deploy still reads a
 * shelf. This list being asserted key-exact is what documents the pair —
 * the assertion is the record, not an obstacle to be loosened — and when #247
 * lands, removing `my_label` from this array is how the contract half is
 * proved. `personal_labels` is the Label projection that arrived with the
 * rename, the viewer's own Personal Labels on this folder. */
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
  'my_color',
  'my_label',
  'my_shelf',
  'name',
  'personal_labels',
]

/** 7.4's member element, and inside it 7.0's person shape as the review
 * ruled it: no email, the TaskCard-assignee object. */
/* `access` joined the member element with issue #228 (#209 R8A, R9 section
   13): a member's current Access preset is Folder-visible to every member,
   and it sits beside `role` rather than replacing it -- `role` expressed no
   authority before the change and expresses none after it. */
const MEMBER_KEYS = ['access', 'is_owner', 'joined_at', 'role', 'user']
const PERSON_KEYS = ['avatar_url', 'display_name', 'id']

function expectMemberElementExact(element: unknown, where: string): void {
  const record = element as Record<string, unknown>
  expect(
    Object.keys(record).sort(),
    `${where} must carry exactly the member element keys`,
  ).toEqual(MEMBER_KEYS)
  expect(
    Object.keys(record.user as Record<string, unknown>).sort(),
    `${where} must carry exactly the ruled person shape, email excluded`,
  ).toEqual(PERSON_KEYS)
}

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
      jsonInit('POST', { user_id: member.id, access: 'can_edit' }),
    )
    expect(added.status, 'the staging add must answer 201').toBe(201)
    const addedParsed = postFolderMembersResponse.safeParse(added.json())
    expect(
      addedParsed.success
        ? []
        : addedParsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      'the 201 member element does not match the shared schema',
    ).toEqual([])
    expectMemberElementExact(added.json(), 'the POST members 201 body')

    // A pending invite seeded directly: invite rows are P5's surface, and
    // only the element's shape is under test here.
    const inviteEmail = `pending-${randomUUID()}@${domain}`
    await dbClient.db.execute(
      sql`INSERT INTO invites (inviter_id, email, folder_id, access)
          VALUES (${owner.id}::uuid, ${inviteEmail}, ${folderId}::uuid,
                  'can_edit')`,
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
    // Key-exactness reads the raw elements: parsed.data is post-strip and
    // would hide exactly the extra field this probe exists to refuse.
    for (const element of (body as { members: unknown[] }).members) {
      expectMemberElementExact(element, 'a detail members element')
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
      jsonInit('PATCH', { shelf: 'Contract', color: '#0044AA' }),
    )
    expect(labeled.status).toBe(200)
    const labeledParsed = folder.safeParse(labeled.json())
    expect(labeledParsed.success).toBe(true)
    if (labeledParsed.success) {
      expect(labeledParsed.data.my_shelf).toBe('Contract')
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

    /* The 403 row was "a member rename" until 2026-09-20. It stopped being a
       refusal: the member is staged at Can edit, and accepted #209 R8A makes
       a folder's identity ordinary shared Folder work, which Can edit
       changes. AC-011, AC-012 and AC-193 carry that decision and Hassan's
       ruling, https://github.com/zhssnym/dana/issues/228#issuecomment-5750892771.
       What this file needs is *a* 403 on this surface to parse, so the row is
       now the act the same member is still refused -- moving the folder
       itself to Trash, which Hassan's ruling of the same day makes Full
       control's (AC-015). It mutates nothing when the rule holds, and when it
       does not the status assertion fails before the envelope one. */
    const refusals: readonly [number, Promise<{ status: number; json(): unknown }>, string][] = [
      [
        403,
        api(member, `/folders/${folderId}`, { method: 'DELETE' }),
        'a Can-edit member trashing the folder',
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
