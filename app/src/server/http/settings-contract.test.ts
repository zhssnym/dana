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

**Scope widened on 2026-09-04 by issue #152, and to a second subsection rather
than to more of this one.** Everything above is `/me/settings`, frozen 7.2's
three booleans. The last describe block below is AC-409 and it is 7.23's, the
v2 settings bundle at `/settings` — a different endpoint sharing one row of
`user_settings` and not one column of it. It is here because this is the file
that already boots the real application and holds the shared schemas against
what the wire answers, which is the whole of that criterion, and because the
two subsections are read together: 7.2's annotation now points at 7.23 and
issue #113 retires 7.2 into it.
*/
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../../../db/client.js'
import { cleanupUsers, createTestDb, rows } from '../../../tests/helpers.js'
import { TestBrowser } from '../../../tests/http-client.js'
import type { RawRequestOptions, RawResponse } from '../../../tests/http-client.js'
import { startOidcStub } from '../../../tests/oidc-stub.js'
import type { OidcStub } from '../../../tests/oidc-stub.js'
import {
  DEFAULT_CALENDAR_ZOOM,
  patchSettingsBody,
  settingsBundle,
} from '../../shared/bundle.js'
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

/* ------------------------------------------------------------------ *
 * AC-409, the 7.23 settings bundle
 * ------------------------------------------------------------------ */

/** One row of 7.23's fields table, cell for cell. */
interface DocumentedField {
  field: string
  type: string
  values: string
  fresh: string
}

/**
 * 7.23's fields table, read out of the markdown as text.
 *
 * Read rather than imported, the way `tests/ac-315-...` reads `routes.ts`,
 * and for a stronger reason than that one had: the document is the artifact
 * under test here. A criterion that imported its list from the same module
 * 7.23 is supposed to describe would assert the schema against itself and
 * pass on a document that had gone stale, which is precisely the state issue
 * #152 found section 7 in and precisely what this exists to stop recurring.
 *
 * The section is anchored by its heading and each row by the backticked name
 * in its first cell, so a rename of either yields no rows — which fails
 * loudly below rather than comparing two empty sets and agreeing.
 */
function fieldsDocumentedBy723(): DocumentedField[] {
  const document = readFileSync(
    fileURLToPath(
      new URL(
        '../../../../docs/spec/07-api/07.23-settings-bundle.md',
        import.meta.url,
      ),
    ),
    'utf8',
  )
  const section = /\n## The fields\n([\s\S]*?)(?=\n## |$)/.exec(document)?.[1]
  if (section === undefined) return []
  return [
    ...section.matchAll(
      /^\|\s*`([a-z_]+)`\s*\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/gm,
    ),
  ].map((row) => ({
    field: row[1] as string,
    type: (row[2] as string).trim(),
    values: (row[3] as string).trim(),
    fresh: (row[4] as string).trim(),
  }))
}

/** Every backticked token in a table cell, in the order the cell lists them. */
function backticked(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map((hit) => hit[1] as string)
}

/**
 * The cell's content when it is exactly one backticked token and nothing
 * else, or `null` when it is prose. That distinction is what lets a default
 * be compared against the wire where it is machine-readable and merely
 * required to be *said* where it is not; the set of prose cells is itself
 * asserted below, so prose is not a way to opt a field out of the check.
 */
function soleLiteral(cell: string): string | null {
  return /^`([^`]+)`$/.exec(cell)?.[1] ?? null
}

/**
 * The values a field may take, from the schemas rather than from the
 * document, or `null` where neither schema fixes a list.
 *
 * Both are consulted because the two hold the enumeration in different
 * places: the response shape carries it directly for the five enumerated
 * fields, while `pinned_views` is a plain array of string there and it is the
 * *request* shape that constrains its elements to the nine native views.
 * `sidebar_order` and `arrangements` fix no list in either, and the `null`
 * they answer with is asserted against an absence of backticks in the
 * document, so a cell cannot start naming values no schema fixes.
 *
 * `.options`, `.unwrap()` and `.element` are zod 4's public surface rather
 * than the `_zod.def` walk `http/parse-body.ts` has to do; measured against
 * the installed zod on 2026-09-04.
 */
function valuesDeclaredFor(field: string): readonly string[] | null {
  const response = (settingsBundle.shape as Record<string, unknown>)[field] as
    | { options?: readonly string[] }
    | undefined
  if (Array.isArray(response?.options)) return response.options

  const request = (patchSettingsBody.shape as Record<string, unknown>)[
    field
  ] as { unwrap?: () => unknown } | undefined
  const inner = (
    typeof request?.unwrap === 'function' ? request.unwrap() : request
  ) as { element?: { options?: readonly string[] } } | undefined
  return Array.isArray(inner?.element?.options) ? inner.element.options : null
}

describe('AC-409: 7.23 names every field of the settings bundle', () => {
  const documented = fieldsDocumentedBy723()
  const byField = new Map(documented.map((row) => [row.field, row]))
  const schemaFields = Object.keys(settingsBundle.shape)

  /** The row 7.23 must carry for a field, or a failure naming the field. */
  function rowFor(field: string): DocumentedField {
    const row = byField.get(field)
    expect(
      row,
      `spec 7.23's "## The fields" table has no row for ${field}`,
    ).toBeDefined()
    return row as DocumentedField
  }

  test('the document names a field list at all, in the shape read above', () => {
    // Asserted first and separately. Everything below is measured against
    // this table, so a heading or a row shape the regexes stop matching would
    // otherwise turn the whole criterion into empty sets agreeing.
    expect(
      documented.length,
      'spec 7.23 must carry a "## The fields" table whose rows are ' +
        'field, type, values, fresh, the first cell backticked',
    ).toBeGreaterThan(0)
  })

  test('the request schema declares exactly the documented fields', () => {
    expect(
      Object.keys(patchSettingsBody.shape).sort(),
      'issue #152: a field PATCH /settings accepts with no row in 7.23 is a contract ' +
        'that has gone stale, and a row in 7.23 for a field the schema does not accept ' +
        'is a contract describing an endpoint nobody built',
    ).toEqual([...schemaFields].sort())
  })

  test('the response schema declares exactly the documented fields', () => {
    // The second half, and not the same assertion twice: shared/bundle.ts
    // holds a request schema and a response schema that are separate objects,
    // and 7.23 states one field list for both because the endpoint answers
    // the whole object on either method.
    expect(
      [...schemaFields].sort(),
      'the GET shape and 7.23 must name one list, PATCH answering the GET object',
    ).toEqual(documented.map((row) => row.field).sort())
  })

  test('each Values cell names the schema enumeration, in order', () => {
    // Iterated over the schema rather than over the table, so a field whose
    // row 7.23 never grew fails here by name instead of going unmeasured.
    // Both directions are asserted: a cell must name what a schema fixes, and
    // a cell whose schemas fix nothing must name nothing, so `theme` quietly
    // becoming a free string fails on the values it still advertises.
    for (const field of schemaFields) {
      const row = rowFor(field)
      const declared = valuesDeclaredFor(field)
      if (declared === null) {
        expect(
          backticked(row.values),
          `${field} fixes no value list in either schema, so 7.23 must not name one`,
        ).toEqual([])
        continue
      }
      expect(
        backticked(row.values),
        `spec 7.23 must name ${field}'s values exactly as the schema admits them, in ` +
          'order: a value added, removed or reordered in shared/bundle.ts and not here ' +
          'leaves the contract describing an endpoint that answers something else',
      ).toEqual([...declared])
    }
  })

  test('each documented default is what a fresh account actually reads', async () => {
    // The arm no static comparison can make, and the reason it signs a new
    // person in rather than reusing this file's: the column says "a fresh
    // account", and the shared actor has had its 7.2 flags written by the
    // cases above, which is exactly what the pin derivation reads.
    const newcomer = await signIn('AC-409 Fresh Account')
    const response = await api(newcomer, '/settings')
    expect(response.status).toBe(200)
    const served = response.json() as Record<string, unknown>

    const prose: string[] = []
    for (const field of schemaFields) {
      const row = rowFor(field)
      const literal = soleLiteral(row.fresh)
      if (literal === null) {
        expect(
          row.fresh.length,
          `${field}'s default is prose in 7.23, which is allowed only if it says something`,
        ).toBeGreaterThan(0)
        prose.push(field)
        continue
      }
      expect(
        served[field],
        `spec 7.23 says a fresh account reads ${literal} for ${field}. The defaults are ` +
          '4.10 columns, so this fails when a migration moves one and the document does ' +
          'not move with it',
      ).toEqual(
        literal === '[]' || literal === '{}'
          ? (JSON.parse(literal) as unknown)
          : literal,
      )
    }

    expect(
      prose,
      'exactly one default is not machine-readable, pinned_views, which is derived from ' +
        'the v1 flags until somebody first writes a pin list and has its own section in ' +
        '7.23. Prose is not a way to opt a field out of the comparison above',
    ).toEqual(['pinned_views'])
  })

  test('the calendar zoom default is the exported constant, not a copy', () => {
    // The one default the shared module does export. 7.23's cell, the value
    // the server reads a retired zoom back as, and the column's own DEFAULT
    // are meant to be one string; AC-378 pins the last two to each other and
    // this pins the document to them.
    expect(
      soleLiteral(rowFor('calendar_zoom').fresh),
      'spec 7.23 must name DEFAULT_CALENDAR_ZOOM as the zoom a fresh account reads',
    ).toBe(DEFAULT_CALENDAR_ZOOM)
  })

  test('and the body GET /api/v1/settings actually answers carries them', async () => {
    // A schema is a promise; this is the wire. 11.15's first loss class is a
    // field declared on both sides and served by neither, which every static
    // comparison above passes.
    const who = await actor()
    const response = await api(who, '/settings')
    expect(response.status).toBe(200)
    expect(
      Object.keys(response.json() as Record<string, unknown>).sort(),
      'the bundle on the wire must be exactly the fields 7.23 names: nothing extra, nothing missing',
    ).toEqual(documented.map((row) => row.field).sort())
    expect(
      issuesOf(settingsBundle.safeParse(response.json())),
      'and it must parse with the shared schema the client validates it against',
    ).toEqual([])
  })
})
