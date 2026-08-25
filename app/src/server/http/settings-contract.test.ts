/*
The 7.2 contract as code, checked against the surface that answers: the third
sibling of contract.test.ts and folders-contract.test.ts, same skeleton,
scoped to the settings pair. The real createApp boots against the stub issuer
with the auth router mounted, and the answers parse with the shared schemas
themselves, so the promise in src/shared/me.ts and the answer on the wire
cannot drift silently.

Scope, and what is deliberately not here. AC-119 to AC-123 own the behavior
of these endpoints and pass; nothing below repeats a criterion. What only a
contract test can say is said here:

  - the shared schemas parse the real bodies, which is the drift check the
    acceptance suite cannot make, because it deliberately never imports them;
  - the ruled PATCH body read raw and key-exact, since a parse strips exactly
    the extra field exactness exists to notice (the P2 review's lesson);
  - the 7.0 taxonomy on this surface. AC-118 pins the 400 edges on the /me
    routes only, by its own comment, so the boot-level rules reaching the 7.2
    routes is an unasserted assumption everywhere else. Here it is asserted.

The two-method probe is this role's mandate rather than a criterion: section 7
and the implemented routes are meant to correspond exactly, so a method 7.2
never wrote must not answer.
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
import type { RawRequestOptions, RawResponse } from '../../../tests/http-client.js'
import { startOidcStub } from '../../../tests/oidc-stub.js'
import type { OidcStub } from '../../../tests/oidc-stub.js'
import { errorEnvelope } from '../../shared/error-envelope.js'
import {
  getMeSettingsResponse,
  meResponse,
  patchMeSettingsResponse,
} from '../../shared/me.js'
import { createApp } from '../index.js'

let dbClient: DbClient
let stub: OidcStub
let server: Server
let origin: string
const created: string[] = []
const domain = `settings-contract-${randomUUID()}.test`

interface Person {
  jar: TestBrowser
  id: string
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
  await cleanupUsers(dbClient.db, created)
  await dbClient.close()
})

async function signIn(name: string): Promise<Person> {
  const sub = `settings-contract-${randomUUID()}`
  stub.nextIdentity({ sub, email: `${sub}@${domain}`, email_verified: true, name })
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
  return { jar, id }
}

function api(
  person: Person,
  path: string,
  init?: RawRequestOptions & { csrf?: 'auto' | 'omit' | string },
): Promise<RawResponse> {
  return person.jar.request(`${origin}/api/v1${path}`, init)
}

function jsonInit(method: string, body: string): RawRequestOptions {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  }
}

function patch(person: Person, body: unknown): Promise<RawResponse> {
  return api(person, '/me/settings', jsonInit('PATCH', JSON.stringify(body)))
}

/** The three 7.2 keys, sorted, and nothing else. */
const SETTINGS_KEYS = ['show_all', 'show_done', 'show_important']

/**
 * Read raw, on purpose. A schema parse strips an extra key, so parsing first
 * would hide the drift this exists to catch: user_id and updated_at are in
 * the same row and neither is in the frozen sentence.
 */
function expectSettingsExact(body: unknown, where: string): Record<string, unknown> {
  const record = body as Record<string, unknown>
  expect(
    Object.keys(record).sort(),
    `${where} must carry exactly the three 7.2 booleans`,
  ).toEqual(SETTINGS_KEYS)
  for (const key of SETTINGS_KEYS) {
    expect(typeof record[key], `${where} ${key} must be a boolean`).toBe('boolean')
  }
  return record
}

function issuesOf(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }): string[] {
  return result.success
    ? []
    : (result.error?.issues ?? []).map(
        (issue) => `${issue.path.map(String).join('.')}: ${issue.message}`,
      )
}

let person: Person | undefined

async function actor(): Promise<Person> {
  person ??= await signIn('Settings Contract')
  return person
}

describe('the 7.2 shapes against the mounted application', () => {
  test('GET /me/settings answers what the shared schema promises', async () => {
    const who = await actor()
    const response = await api(who, '/me/settings')
    expect(response.status).toBe(200)
    expect(
      issuesOf(getMeSettingsResponse.safeParse(response.json())),
      'the 200 body does not match the shared settings schema',
    ).toEqual([])
    expectSettingsExact(response.json(), 'the GET /me/settings body')
  })

  test('the ruled PATCH body is the GET object, raw and key for key', async () => {
    // 7.2's appended sentence, on the wire: the schema binds both responses
    // to one named object, and this is the half of that binding the mounted
    // surface has to keep.
    const who = await actor()
    const patched = await patch(who, { show_done: true, show_all: false })
    expect(patched.status).toBe(200)
    expect(
      issuesOf(patchMeSettingsResponse.safeParse(patched.json())),
      'the PATCH body does not match the shared settings schema',
    ).toEqual([])
    const patchedBody = expectSettingsExact(patched.json(), 'the PATCH body')

    const fresh = await api(who, '/me/settings')
    expect(fresh.status).toBe(200)
    const freshBody = expectSettingsExact(fresh.json(), 'the fresh GET body')
    expect(
      patchedBody,
      'PATCH /me/settings answers the GET /me/settings object (spec 7.2, owner ruling)',
    ).toEqual(freshBody)
    expect(
      Object.keys(patchedBody).sort(),
      'one object means one key set, whichever endpoint answered',
    ).toEqual(Object.keys(freshBody).sort())
  })

  test('the empty subset answers the same object, not a thinner one', async () => {
    // A body carrying nothing still answers the whole object: the ruled
    // sentence names the GET object, with no subset-shaped variant of it.
    const who = await actor()
    const response = await patch(who, {})
    expect(response.status).toBe(200)
    const body = expectSettingsExact(response.json(), 'the empty-subset PATCH body')
    expect(body).toEqual((await api(who, '/me/settings')).json())
  })

  test('the settings key of GET /me is the same object, by the same schema', async () => {
    // 7.1 and 7.2 read one row, and src/shared/me.ts now declares the object
    // once for both. This is that single declaration observed from outside.
    const who = await actor()
    const me = await api(who, '/me')
    expect(me.status).toBe(200)
    expect(issuesOf(meResponse.safeParse(me.json())), 'the /me body drifted').toEqual([])
    const settings = (me.json() as { settings: unknown }).settings
    expectSettingsExact(settings, 'the settings key of GET /me')
    expect(settings).toEqual((await api(who, '/me/settings')).json())
  })

  test('unknown fields are tolerated and the object still answers (7.0)', async () => {
    const who = await actor()
    const response = await patch(who, {
      show_important: true,
      updated_at: 'yesterday',
      user_id: 'someone else',
    })
    expect(response.status).toBe(200)
    const body = expectSettingsExact(response.json(), 'the tolerating PATCH body')
    expect(
      body.show_important,
      'the valid field lands and the unknown ones are simply absent from the answer',
    ).toBe(true)
  })

  test('a GET is safe: it writes nothing, updated_at included (7.0)', async () => {
    const who = await actor()
    const before = await rows(
      dbClient.db,
      sql`SELECT * FROM user_settings WHERE user_id = ${who.id}`,
    )
    await api(who, '/me/settings')
    await api(who, '/me/settings')
    expect(
      await rows(
        dbClient.db,
        sql`SELECT * FROM user_settings WHERE user_id = ${who.id}`,
      ),
      'GETs are safe (spec 7.0): a read must not move the row it read',
    ).toEqual(before)
  })
})

describe('the 7.0 taxonomy on the 7.2 surface', () => {
  test('a wrong-typed field answers 422 in the envelope, naming the field', async () => {
    const who = await actor()
    const response = await patch(who, { show_done: 'yes' })
    expect(response.status).toBe(422)
    const parsed = errorEnvelope.safeParse(response.json())
    expect(issuesOf(parsed), 'the 422 must carry the 7.0 envelope').toEqual([])
    if (parsed.success) {
      expect(parsed.data.error.code).toBe('validation_failed')
      expect(
        parsed.data.error.message.includes('show_done'),
        'a 422 names the failing field (spec 10.3)',
      ).toBe(true)
    }
  })

  test('the 400 edges reach this surface too, in the envelope', async () => {
    // AC-118 pins these on the /me routes, by its own comment. The rules are
    // boot-level, so reaching the 7.2 routes is an assumption until asserted,
    // and an assumption about a status is exactly what drifts.
    const who = await actor()
    const bodies: readonly [string, string][] = [
      ['{"show_done": true', 'a body that does not parse as JSON'],
      ['[]', 'an array, which parses but is not an object'],
      ['"show_done"', 'a string'],
      ['42', 'a number'],
      ['true', 'a boolean'],
      ['null', 'null'],
      // Over 10.3's 3 MB JSON body row (RFC 0005 change control item 18),
      // which replaced the parser's undocumented 100 kB default so the
      // largest legal workflow file could reach its own caps.
      [`{"show_done": true, "pad": "${'x'.repeat(3 * 1024 * 1024 + 1024)}"}`, 'a body over the parse limit'],
    ]
    for (const [body, what] of bodies) {
      const response = await api(who, '/me/settings', jsonInit('PATCH', body))
      expect(response.status, `${what} must answer 400 (spec 7.0)`).toBe(400)
      expect(
        errorEnvelope.safeParse(response.json()).success,
        `${what} must answer in the 7.0 envelope`,
      ).toBe(true)
    }
  })

  test('a mutation carrying no body at all answers what the 7.1 routes answer', async () => {
    // Nothing parsed a body, so the schema sees undefined and the issue has
    // no field path. The value matters less than the uniformity: two routes
    // of one surface must not disagree about the same malformed request, and
    // this asserts them against each other before asserting the number.
    //
    // Only the no-body case is pinned here. A request that sends bytes under
    // a non-JSON content type answers this same 422 rather than the 400 the
    // identical bytes get under application/json, which this review found and
    // routed rather than blessed: pinning it would fight whoever rules on it.
    // With no body at all there is nothing that failed to parse, so 422 is
    // the answer on every reading, and that is the one worth a test.
    const who = await actor()
    const settings = await api(who, '/me/settings', { method: 'PATCH' })
    const me = await api(who, '/me', { method: 'PATCH' })
    expect(
      settings.status,
      'the 7.2 mutation must answer a bodyless request exactly as the 7.1 one does',
    ).toBe(me.status)
    expect(settings.status, 'which is the 422 errors.ts already spells').toBe(422)
    expect(errorEnvelope.safeParse(settings.json()).success).toBe(true)
  })

  test('the session and CSRF refusals answer 401 and 403 in the envelope', async () => {
    const who = await actor()
    const stranger = new TestBrowser(origin)
    const refusals: readonly [number, RawResponse, string][] = [
      [401, await stranger.request(`${origin}/api/v1/me/settings`), 'a GET with no session'],
      [
        401,
        await stranger.request(`${origin}/api/v1/me/settings`, {
          ...jsonInit('PATCH', '{"show_done":true}'),
          csrf: 'omit',
        }),
        'a PATCH with no session, which must not answer 403 first',
      ],
      [
        403,
        await api(who, '/me/settings', {
          ...jsonInit('PATCH', '{"show_done":true}'),
          csrf: 'omit',
        }),
        'a PATCH with a session but no CSRF token',
      ],
    ]
    for (const [expected, response, what] of refusals) {
      expect(response.status, `${what} must answer ${String(expected)}`).toBe(expected)
      expect(
        errorEnvelope.safeParse(response.json()).success,
        `${what} must carry the 7.0 envelope`,
      ).toBe(true)
    }
  })

  test('7.2 names two methods, and the surface answers no others', async () => {
    const who = await actor()
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const response = await api(
        who,
        '/me/settings',
        jsonInit(method, '{"show_done":true}'),
      )
      expect(
        response.status,
        `${method} /me/settings is not in 7.2 and must not answer`,
      ).toBe(404)
      expect(
        errorEnvelope.safeParse(response.json()).success,
        `${method} /me/settings must refuse in the 7.0 envelope`,
      ).toBe(true)
    }
  })
})
