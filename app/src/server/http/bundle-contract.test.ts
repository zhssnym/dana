/*
The 7.23 contract as code, checked against the surface that answers: the
sibling of contract.test.ts and folders-contract.test.ts, same skeleton,
scoped to the v2 settings bundle at `GET` and `PATCH /api/v1/settings`. The
real createApp boots against the stub issuer with the auth router mounted,
and the answers parse with the shared schemas themselves, so the promise in
src/shared/bundle.ts and the answer on the wire cannot drift silently.

**This file was `settings-contract.test.ts` and was frozen 7.2's, and it is
renamed rather than rewritten (issue #113, 2026-09-04).** It held the
`/me/settings` pair from the P2S opening until that endpoint was retired,
and everything below that could only ever have been about the three v1
booleans went with it: the exact-three-keys shape check, the ruled PATCH
body read key for key, and AC-119 to AC-123's neighbours. What survived is
what was never really about those three columns — the 7.0 taxonomy on a
settings surface — retargeted at the one that is left, and AC-409, which was
written for 7.23 in the first place (issue #152). The name now says what the
file is; a `settings-contract` that tested a different endpoint from the one
its name implies is the kind of drift this whole file exists to catch.

Scope, and what is deliberately not here. AC-378, AC-379, AC-380 and the
rewritten AC-119 to AC-121 own the behaviour of this endpoint; nothing below
repeats a criterion except AC-409, which lives here for the reason 12.3
records. What only a contract test can say is said here:

  - the shared schemas parse the real bodies, which is the drift check the
    acceptance suite cannot make, because it deliberately never imports them;
  - the 7.0 taxonomy on this surface. AC-118 pins the 400 edges on the /me
    routes only, by its own comment, so the boot-level rules reaching the
    7.23 route is an unasserted assumption everywhere else. Here it is
    asserted.

The two-method probe is this role's mandate rather than a criterion: section
7 and the implemented routes are meant to correspond exactly, so a method
7.23 never wrote must not answer.
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
import { cleanupUsers, createTestDb, rows } from '../../../tests/support/helpers.js'
import { TestBrowser } from '../../../tests/support/http-client.js'
import type { RawRequestOptions, RawResponse } from '../../../tests/support/http-client.js'
import { startOidcStub } from '../../../tests/support/oidc-stub.js'
import type { OidcStub } from '../../../tests/support/oidc-stub.js'
import {
  DEFAULT_CALENDAR_ZOOM,
  patchSettingsBody,
  settingsBundle,
} from '../../shared/bundle.js'
import { errorEnvelope } from '../../shared/error-envelope.js'
import { createApp } from '../index.js'

let dbClient: DbClient
let stub: OidcStub
let server: Server
let origin: string
const created: string[] = []
const domain = `bundle-contract-${randomUUID()}.test`

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
  const sub = `bundle-contract-${randomUUID()}`
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
  return api(person, '/settings', jsonInit('PATCH', JSON.stringify(body)))
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
  person ??= await signIn('Bundle Contract')
  return person
}

describe('the 7.0 taxonomy on the 7.23 surface', () => {
  test('a value outside an enumeration answers 422 in the envelope, naming the field', async () => {
    // 7.23's rule, which is 7.10's for an enumerated parameter applied to a
    // body: absent and wrong are different states, and a wrong value is never
    // quietly narrowed to the default.
    const who = await actor()
    const response = await patch(who, { theme: 'midnight' })
    expect(response.status).toBe(422)
    const parsed = errorEnvelope.safeParse(response.json())
    expect(issuesOf(parsed), 'the 422 must carry the 7.0 envelope').toEqual([])
    if (parsed.success) {
      expect(parsed.data.error.code).toBe('validation_failed')
      expect(
        parsed.data.error.message.includes('theme'),
        'a 422 names the failing field (spec 10.3, 7.23)',
      ).toBe(true)
    }
  })

  test('the 400 edges reach this surface too, in the envelope', async () => {
    // AC-118 pins these on the /me routes, by its own comment. The rules are
    // boot-level, so reaching this surface is an assumption until asserted,
    // and an assumption about a status is exactly what drifts.
    const who = await actor()
    const bodies: readonly [string, string][] = [
      ['{"theme": "dark"', 'a body that does not parse as JSON'],
      ['[]', 'an array, which parses but is not an object'],
      ['"theme"', 'a string'],
      ['42', 'a number'],
      ['true', 'a boolean'],
      ['null', 'null'],
      // Over 10.3's 3 MB JSON body row (RFC 0005 change control item 18),
      // which replaced the parser's undocumented 100 kB default so the
      // largest legal workflow file could reach its own caps.
      [`{"theme": "dark", "pad": "${'x'.repeat(3 * 1024 * 1024 + 1024)}"}`, 'a body over the parse limit'],
    ]
    for (const [body, what] of bodies) {
      const response = await api(who, '/settings', jsonInit('PATCH', body))
      expect(response.status, `${what} must answer 400 (spec 7.0)`).toBe(400)
      expect(
        errorEnvelope.safeParse(response.json()).success,
        `${what} must answer in the 7.0 envelope`,
      ).toBe(true)
    }
  })

  test('a mutation carrying no body at all answers what the 7.1 routes answer', async () => {
    // Nothing parsed a body, so the schema sees undefined and the issue has
    // no field path. The value matters less than the uniformity: two
    // surfaces of one contract must not disagree about the same malformed
    // request, and this asserts them against each other before asserting the
    // number. The comparison used to be against `PATCH /me/settings` one
    // router over and is against `PATCH /me` since issue #113 retired that
    // one; 7.1 is frozen, so it is the more durable partner anyway.
    const who = await actor()
    const bundle = await api(who, '/settings', { method: 'PATCH' })
    const me = await api(who, '/me', { method: 'PATCH' })
    expect(
      bundle.status,
      'the 7.23 mutation must answer a bodyless request exactly as the 7.1 one does',
    ).toBe(me.status)
    expect(bundle.status, 'which is the 422 errors.ts already spells').toBe(422)
    expect(errorEnvelope.safeParse(bundle.json()).success).toBe(true)
  })

  test('the session and CSRF refusals answer 401 and 403 in the envelope', async () => {
    const who = await actor()
    const stranger = new TestBrowser(origin)
    const refusals: readonly [number, RawResponse, string][] = [
      [401, await stranger.request(`${origin}/api/v1/settings`), 'a GET with no session'],
      [
        401,
        await stranger.request(`${origin}/api/v1/settings`, {
          ...jsonInit('PATCH', '{"theme":"dark"}'),
          csrf: 'omit',
        }),
        'a PATCH with no session, which must not answer 403 first',
      ],
      [
        403,
        await api(who, '/settings', {
          ...jsonInit('PATCH', '{"theme":"dark"}'),
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

  test('7.23 names two methods, and the surface answers no others', async () => {
    const who = await actor()
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const response = await api(
        who,
        '/settings',
        jsonInit(method, '{"theme":"dark"}'),
      )
      expect(
        response.status,
        `${method} /settings is not in 7.23 and must not answer`,
      ).toBe(404)
      expect(
        errorEnvelope.safeParse(response.json()).success,
        `${method} /settings must refuse in the 7.0 envelope`,
      ).toBe(true)
    }
  })

  test('a GET is safe: it writes nothing, updated_at included (7.0)', async () => {
    const who = await actor()
    const before = await rows(
      dbClient.db,
      sql`SELECT * FROM user_settings WHERE user_id = ${who.id}`,
    )
    await api(who, '/settings')
    await api(who, '/settings')
    expect(
      await rows(
        dbClient.db,
        sql`SELECT * FROM user_settings WHERE user_id = ${who.id}`,
      ),
      'GETs are safe (spec 7.0): a read must not move the row it read',
    ).toEqual(before)
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
 * Read rather than imported, the way `tests/criteria/ac-315-...` reads `routes.ts`,
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
