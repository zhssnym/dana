/*
Harness for the P1 authentication criteria (AC-005 to AC-010, AC-105 to
AC-115). It boots the real Express application in-process against a real
database and the stub identity provider of oidc-stub.ts, per spec 11.10, and
drives it over HTTP the way a browser would.

Three decisions worth the words:

**node:http, not fetch.** undici silently drops a Host request header, and
AC-109 turns on crafted Host headers, so a fetch-based client would pass that
criterion vacuously. One transport for everything also means raw Set-Cookie
strings are available for AC-110 rather than a parsed approximation.

**Cookies are identified by property, never by name.** Spec 11.6 fixes that
the session cookie is httpOnly and the CSRF cookie is not; it fixes no names.
A test that hardcodes a name would fail on a defensible implementation, which
is a false red, and the only failures worth having here are true ones.

**Every step of the sign-in flow asserts before it dereferences.** These tests
run before the implementation exists, so every request in the flow currently
answers 404 with no Location and no Set-Cookie. Without the guards, files would
die in beforeAll on a TypeError from new URL(null), which proves nothing and
tells the implementer nothing. With them, each file fails on a sentence naming
the missing behavior.
*/
import { request as httpRequest } from 'node:http'
import type { IncomingHttpHeaders, Server } from 'node:http'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import { createApp } from '../src/server/index.js'
import type { Db, DbClient } from '../db/client.js'
import { cleanupUsers, createTestDb, rows } from './helpers.js'
import { startOidcStub } from './oidc-stub.js'
import type { OidcStub } from './oidc-stub.js'

/* ------------------------------------------------------------------ *
 * The application construction seam
 * ------------------------------------------------------------------ */

export interface AuthConfig {
  issuerUrl: string
  clientId: string
  clientSecret: string
  appOrigin: string
  allowInsecureRequests: boolean
}

export interface AppOptions {
  /** Named as the boot file already names its own (src/server/index.ts). */
  dbClient?: DbClient
  auth?: AuthConfig
}

type AppFactory = (
  options?: AppOptions,
) => ReturnType<typeof createApp> | Promise<ReturnType<typeof createApp>>

/*
createApp takes no arguments today and never opens a database; boot does that
(src/server/index.ts). Under the default PGlite backend the suite's database is
an in-memory handle that cannot be passed by connection string, so the
application has to receive the DbClient object itself. That file belongs to the
Platform role, so this suite cannot add the parameter, and the exact signature
is escalated to the Integration Steward.

The double assertion is deliberate rather than lazy. A plain structural
assignment would break the typecheck gate the day the parameter lands as
required rather than optional, or the factory turns async, and a suite that
fails on typecheck fails for the wrong reason. This absorbs any of those
shapes; the calls below await the result, so sync and async factories both
work. It is the single place the seam is assumed, and it is what the
escalation ratifies.
*/
const startApp = createApp as unknown as AppFactory

/* ------------------------------------------------------------------ *
 * Raw HTTP
 * ------------------------------------------------------------------ */

export interface RawResponse {
  status: number
  headers: IncomingHttpHeaders
  setCookie: readonly string[]
  location: string | null
  contentType: string
  body: string
  json(): unknown
}

export interface RawRequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
  /** Sent verbatim as the Host header; fetch cannot do this. */
  hostHeader?: string
}

export async function rawRequest(
  target: string | URL,
  options: RawRequestOptions = {},
): Promise<RawResponse> {
  const url = typeof target === 'string' ? new URL(target) : target
  const headers: Record<string, string> = { ...options.headers }
  if (options.hostHeader !== undefined) headers.Host = options.hostHeader
  if (options.body !== undefined) {
    headers['content-length'] = String(Buffer.byteLength(options.body))
  }

  return new Promise<RawResponse>((resolve, reject) => {
    const req = httpRequest(
      {
        host: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: options.method ?? 'GET',
        headers,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            setCookie: res.headers['set-cookie'] ?? [],
            location: res.headers.location ?? null,
            contentType: res.headers['content-type'] ?? '',
            body,
            json: () => JSON.parse(body) as unknown,
          })
        })
      },
    )
    req.on('error', reject)
    if (options.body !== undefined) req.write(options.body)
    req.end()
  })
}

/* ------------------------------------------------------------------ *
 * Cookies
 * ------------------------------------------------------------------ */

export interface StoredCookie {
  name: string
  value: string
  /** The Set-Cookie line as sent, which is what AC-110 inspects. */
  raw: string
  httpOnly: boolean
  secure: boolean
  sameSite: string | null
}

interface ParsedCookie extends StoredCookie {
  deleted: boolean
}

export function parseSetCookie(raw: string): ParsedCookie {
  const segments = raw.split(';')
  const first = segments[0] ?? ''
  const equals = first.indexOf('=')
  const name = (equals === -1 ? first : first.slice(0, equals)).trim()
  const value = equals === -1 ? '' : first.slice(equals + 1).trim()

  let httpOnly = false
  let secure = false
  let sameSite: string | null = null
  let expired = false

  for (const segment of segments.slice(1)) {
    const [rawKey, ...rest] = segment.split('=')
    const key = (rawKey ?? '').trim().toLowerCase()
    const attribute = rest.join('=').trim()
    if (key === 'httponly') httpOnly = true
    else if (key === 'secure') secure = true
    else if (key === 'samesite') sameSite = attribute
    else if (key === 'max-age' && Number(attribute) <= 0) expired = true
    else if (key === 'expires') {
      const at = Date.parse(attribute)
      if (!Number.isNaN(at) && at <= Date.now()) expired = true
    }
  }

  return {
    name,
    value,
    raw,
    httpOnly,
    secure,
    sameSite,
    deleted: expired || value === '',
  }
}

/**
 * One browser: a cookie jar plus a transport. Cookies are never sent to the
 * identity provider's origin, matching a real browser and keeping the two
 * origins' cookies from contaminating each other.
 */
export class TestBrowser {
  private readonly jar = new Map<string, StoredCookie>()

  constructor(readonly origin: string) {}

  cookieHeader(): string | undefined {
    if (this.jar.size === 0) return undefined
    return [...this.jar.values()]
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ')
  }

  /** Applies a response's Set-Cookie lines, honoring deletions. */
  absorb(setCookie: readonly string[]): ParsedCookie[] {
    const parsed = setCookie.map(parseSetCookie)
    for (const cookie of parsed) {
      if (cookie.deleted) this.jar.delete(cookie.name)
      else this.jar.set(cookie.name, cookie)
    }
    return parsed
  }

  cookie(name: string): StoredCookie | undefined {
    return this.jar.get(name)
  }

  cookies(): readonly StoredCookie[] {
    return [...this.jar.values()]
  }

  /** Plants a value, which is how AC-108's fixation attempt is expressed. */
  plant(name: string, value: string): void {
    this.jar.set(name, {
      name,
      value,
      raw: `${name}=${value}`,
      httpOnly: false,
      secure: false,
      sameSite: null,
    })
  }

  forget(name: string): void {
    this.jar.delete(name)
  }

  /**
   * A second browser holding this one's cookies as they stand now. AC-105's
   * single-use case needs the jar as it was just before the callback ran, so
   * that the replay differs from the original in nothing but having already
   * happened.
   */
  clone(): TestBrowser {
    const copy = new TestBrowser(this.origin)
    for (const cookie of this.jar.values()) copy.jar.set(cookie.name, cookie)
    return copy
  }

  /**
   * csrf: 'auto' echoes the non-httpOnly cookie's value in X-CSRF-Token, which
   * is the double-submit contract of 11.6; 'omit' sends no header; any other
   * string is sent verbatim, which is how the mismatch cases are written.
   */
  async request(
    path: string,
    options: RawRequestOptions & { csrf?: 'auto' | 'omit' | string } = {},
  ): Promise<RawResponse> {
    const headers: Record<string, string> = { ...options.headers }
    const cookies = this.cookieHeader()
    if (cookies !== undefined) headers.cookie = cookies

    const csrf = options.csrf ?? 'auto'
    if (csrf === 'auto') {
      const token = this.csrfCookie()
      if (token !== undefined) headers['X-CSRF-Token'] = token.value
    } else if (csrf !== 'omit') {
      headers['X-CSRF-Token'] = csrf
    }

    const url = path.startsWith('http') ? path : `${this.origin}${path}`
    const response = await rawRequest(url, { ...options, headers })
    this.absorb(response.setCookie)
    return response
  }

  /** Spec 11.6: the CSRF token rides in a second, non-httpOnly cookie. */
  csrfCookie(): StoredCookie | undefined {
    return this.cookies().find(
      (cookie) => !cookie.httpOnly && cookie.value !== '',
    )
  }

  api(path: string, options?: RawRequestOptions & { csrf?: string }) {
    return this.request(`/api/v1${path}`, options)
  }

  json(
    path: string,
    method: string,
    body: unknown,
    options: { csrf?: 'auto' | 'omit' | string } = {},
  ): Promise<RawResponse> {
    return this.api(path, {
      method,
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      ...options,
    })
  }
}

/* ------------------------------------------------------------------ *
 * The application under test
 * ------------------------------------------------------------------ */

export interface AuthTestApp {
  origin: string
  dbClient: DbClient
  db: Db
  stub: OidcStub
  /** Probed once; see resolveAuthBase. */
  authBase(): Promise<string | null>
  browser(): TestBrowser
  close(): Promise<void>
}

/*
Section 7.0 fixes the base path /api/v1 for the API; section 7.1 spells the
auth endpoints /auth/google. An implementation may defensibly mount either
/api/v1/auth/* or /auth/*, and a suite that hardcodes the wrong one is red
forever with 404s indistinguishable from missing behavior. So it is probed
rather than guessed, and recorded as an escalation so it ends up decided
instead of discovered. This never skips an assertion: when neither exists, the
callers assert and name both candidates.
*/
const AUTH_BASE_CANDIDATES = ['/api/v1', ''] as const

export async function startAuthTestApp(): Promise<AuthTestApp> {
  const dbClient = await createTestDb()
  const stub = await startOidcStub()

  // The application needs its own origin to build redirect_uri and to police
  // redirect targets (AC-109), and the origin is only knowable once the port
  // is bound, so the server exists before the application it will serve.
  const server: Server = createServer()
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address() as AddressInfo
  const origin = `http://127.0.0.1:${String(port)}`

  const auth: AuthConfig = {
    issuerUrl: stub.issuerUrl,
    clientId: stub.clientId,
    clientSecret: stub.clientSecret,
    appOrigin: origin,
    allowInsecureRequests: true,
  }

  // Configuration is offered twice, as options and as environment variables,
  // because 11.11 makes secrets environment variables in production while the
  // database handle can only arrive as an object. Whichever wiring the
  // implementation adopts is already fed.
  process.env.GOOGLE_CLIENT_ID = auth.clientId
  process.env.GOOGLE_CLIENT_SECRET = auth.clientSecret
  process.env.GOOGLE_ISSUER_URL = auth.issuerUrl
  process.env.APP_ORIGIN = auth.appOrigin
  process.env.OIDC_ALLOW_INSECURE = '1'

  const app = await startApp({ dbClient, auth })
  server.on('request', app)

  let base: string | null | undefined

  const testApp: AuthTestApp = {
    origin,
    dbClient,
    db: dbClient.db,
    stub,

    async authBase() {
      if (base !== undefined) return base
      // "Not a 404" is not enough to conclude the endpoint is there. When a
      // previous local build has left dist/client/index.html behind, the
      // application mounts the single-page fallback (src/server/index.ts) and
      // answers any non-/api path with 200 and the shell, so a root-mounted
      // candidate looks present on a developer's machine and absent in CI,
      // where the build step runs after the tests. What identifies the
      // endpoint is that it does what 7.1 says: redirect.
      const probes = new Map<string, RawResponse>()
      for (const candidate of AUTH_BASE_CANDIDATES) {
        const probe = await rawRequest(`${origin}${candidate}/auth/google`)
        probes.set(candidate, probe)
        if (probe.status >= 300 && probe.status < 400 && probe.location !== null) {
          base = candidate
          return base
        }
      }
      // Nothing redirects. An endpoint that is present but answering an error
      // should still be addressed, so its own failure is what the tests
      // report rather than a misleading "no endpoint exists".
      for (const [candidate, probe] of probes) {
        if (probe.status !== 404 && !probe.contentType.includes('text/html')) {
          base = candidate
          return base
        }
      }
      base = null
      return base
    },

    browser() {
      return new TestBrowser(origin)
    },

    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
      await stub.close()
      await dbClient.close()
    },
  }

  return testApp
}

async function requireAuthBase(app: AuthTestApp): Promise<string> {
  const base = await app.authBase()
  expect(
    base,
    'no authorization endpoint: neither GET /api/v1/auth/google nor GET /auth/google exists (spec 7.1)',
  ).not.toBeNull()
  return base ?? ''
}

export async function authUrl(app: AuthTestApp, path: string): Promise<string> {
  return `${app.origin}${await requireAuthBase(app)}${path}`
}

/* ------------------------------------------------------------------ *
 * The sign-in flow, in pieces so attacks can enter partway
 * ------------------------------------------------------------------ */

/** Step one: the application's redirect to the identity provider. */
export async function beginAuthorization(
  app: AuthTestApp,
  browser: TestBrowser,
  options: RawRequestOptions = {},
): Promise<URL> {
  const response = await browser.request(await authUrl(app, '/auth/google'), options)
  expect(
    response.status,
    'GET /auth/google must redirect to Google (spec 7.1)',
  ).toBeGreaterThanOrEqual(300)
  expect(response.status).toBeLessThan(400)
  expect(
    response.location,
    'the authorization redirect carries no Location header',
  ).not.toBeNull()
  return new URL(response.location ?? '')
}

/** Step two: the identity provider's redirect back to the callback. */
export async function followAuthorization(
  app: AuthTestApp,
  authorizationUrl: URL,
): Promise<URL> {
  expect(
    authorizationUrl.origin,
    'the authorization request must go to the configured issuer',
  ).toBe(app.stub.issuerUrl)
  const response = await rawRequest(authorizationUrl)
  expect(
    response.location,
    `the identity provider refused the authorization request (${response.body})`,
  ).not.toBeNull()
  return new URL(response.location ?? '')
}

/** Step three: the callback, which is where the session is established. */
export async function completeCallback(
  browser: TestBrowser,
  callbackUrl: URL,
  options: RawRequestOptions = {},
): Promise<RawResponse> {
  return browser.request(callbackUrl.toString(), options)
}

export interface SignedIn {
  browser: TestBrowser
  session: StoredCookie
  csrf: StoredCookie
  callback: RawResponse
}

/**
 * The whole flow, asserting success at each step. Attack tests use the three
 * pieces above instead, so they can corrupt one step and observe the refusal.
 */
export async function signIn(
  app: AuthTestApp,
  browser: TestBrowser = app.browser(),
): Promise<SignedIn> {
  const authorization = await beginAuthorization(app, browser)
  const callbackUrl = await followAuthorization(app, authorization)
  const callback = await completeCallback(browser, callbackUrl)

  expect(
    callback.status,
    `the callback must establish a session and redirect into the app (spec 7.1), answered ${String(callback.status)}`,
  ).toBeGreaterThanOrEqual(300)
  expect(callback.status).toBeLessThan(400)

  const session = await sessionCookieFrom(app, browser, callback)
  const csrf = csrfCookieFrom(callback)
  return { browser, session, csrf, callback }
}

/**
 * The flow without the success assertions, for the attacks: the redirect to
 * the provider and the redirect back are still asserted, because they are
 * preconditions of the attack rather than part of it, but whatever the
 * callback answers is handed back unjudged.
 */
export async function attemptSignIn(
  app: AuthTestApp,
  browser: TestBrowser = app.browser(),
): Promise<{ browser: TestBrowser; callback: RawResponse; callbackUrl: URL }> {
  const authorization = await beginAuthorization(app, browser)
  const callbackUrl = await followAuthorization(app, authorization)
  const callback = await completeCallback(browser, callbackUrl)
  return { browser, callback, callbackUrl }
}

/**
 * No session was established. Used by every refusal case, so the assertion
 * that matters most in this package reads identically everywhere.
 */
export function expectNoSession(callback: RawResponse, why: string): void {
  const established = callback.setCookie
    .map(parseSetCookie)
    .filter((cookie) => cookie.httpOnly && !cookie.deleted)
  expect(
    established.map((cookie) => cookie.name),
    `a session cookie was issued although ${why}`,
  ).toEqual([])
}

/**
 * The session cookie is the httpOnly one the callback set (11.6). A callback
 * may legitimately set more than one httpOnly cookie, since it plausibly also
 * clears the pre-authentication state cookie; deletions are filtered out, and
 * if more than one live candidate remains they are disambiguated by which one
 * actually authenticates, rather than by guessing a name.
 */
export async function sessionCookieFrom(
  app: AuthTestApp,
  browser: TestBrowser,
  callback: RawResponse,
): Promise<StoredCookie> {
  const candidates = callback.setCookie
    .map(parseSetCookie)
    .filter((cookie) => cookie.httpOnly && !cookie.deleted)

  expect(
    candidates.length,
    'the callback set no httpOnly session cookie (spec 10.1, 11.6)',
  ).toBeGreaterThan(0)
  const first = candidates[0]
  if (candidates.length === 1 && first !== undefined) return first

  const authenticating: StoredCookie[] = []
  for (const candidate of candidates) {
    const probe = app.browser()
    probe.plant(candidate.name, candidate.value)
    const me = await probe.api('/me')
    if (me.status === 200) authenticating.push(candidate)
  }
  expect(
    authenticating.length,
    `expected exactly one of the callback's httpOnly cookies to authenticate, ${String(authenticating.length)} did`,
  ).toBe(1)
  return authenticating[0] as StoredCookie
}

/** The CSRF token rides in a second, non-httpOnly cookie (11.6). */
export function csrfCookieFrom(callback: RawResponse): StoredCookie {
  const candidates = callback.setCookie
    .map(parseSetCookie)
    .filter((cookie) => !cookie.httpOnly && !cookie.deleted)
  expect(
    candidates.length,
    'the callback set no readable CSRF cookie (spec 11.6 double submit)',
  ).toBe(1)
  return candidates[0] as StoredCookie
}

/* ------------------------------------------------------------------ *
 * Database inspection
 * ------------------------------------------------------------------ */

export interface UserRow extends Record<string, unknown> {
  id: string
  google_sub: string | null
  email: string | null
  display_name: string | null
  timezone: string
  deleted_at: string | null
}

export async function usersForSub(db: Db, sub: string): Promise<UserRow[]> {
  return (await rows(
    db,
    sql`SELECT * FROM users WHERE google_sub = ${sub}`,
  )) as UserRow[]
}

export async function userForSub(
  db: Db,
  sub: string,
): Promise<UserRow | undefined> {
  return (await usersForSub(db, sub))[0]
}

/** IANA validity, which INV-14 requires of every provisioned user. */
export function isIanaTimezone(value: unknown): boolean {
  if (typeof value !== 'string' || value === '') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

interface ReferencingColumn {
  table_schema: string
  table_name: string
  column_name: string
}

/**
 * Every column anywhere in the database with a foreign key onto users(id).
 * The sessions table belongs to the Security engineer and lives outside the
 * section 4 model (10.1), so its shape is unknown here; discovering references
 * rather than listing them keeps cleanup correct on the shared-Postgres CI leg
 * once that table exists.
 */
async function columnsReferencingUsers(db: Db): Promise<ReferencingColumn[]> {
  return (await rows(
    db,
    sql`
      SELECT tc.table_schema, tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.constraint_schema = tc.constraint_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.constraint_schema = tc.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'users'
        AND ccu.column_name = 'id'
    `,
  )) as unknown as ReferencingColumn[]
}

/**
 * Removes every trace of the named users. Test files must leave the database
 * as they found it: Vitest runs files in parallel workers, and on the
 * TEST_DATABASE_URL leg they all share one database (see helpers.ts).
 */
export async function cleanupAuthUsers(
  db: Db,
  userIds: readonly string[],
): Promise<void> {
  if (userIds.length === 0) return
  const references = await columnsReferencingUsers(db)
  // tasks and folders first, in that order: both hold RESTRICT keys onto
  // users, and deleting a folder cascades its tasks away.
  const rank = (table: string): number =>
    table === 'tasks' ? 0 : table === 'folders' ? 1 : 2
  const ordered = [...references].sort(
    (a, b) => rank(a.table_name) - rank(b.table_name),
  )

  for (const id of userIds) {
    for (const reference of ordered) {
      const target = sql.raw(
        `"${reference.table_schema}"."${reference.table_name}"`,
      )
      const column = sql.raw(`"${reference.column_name}"`)
      await db.execute(sql`DELETE FROM ${target} WHERE ${column} = ${id}`)
    }
  }
  await cleanupUsers(db, userIds)
}

export async function cleanupAuthSubs(
  db: Db,
  subs: readonly string[],
): Promise<void> {
  const ids: string[] = []
  for (const sub of subs) {
    for (const row of await usersForSub(db, sub)) ids.push(row.id)
  }
  await cleanupAuthUsers(db, ids)
}

export interface SecretHit {
  table: string
  column: string
  secret: string
}

/**
 * Searches every text-ish column of every non-system schema for the given
 * values. AC-115 uses it to prove no Google token was persisted anywhere,
 * including in a session table this suite cannot see.
 */
export async function sweepForSecrets(
  db: Db,
  secrets: readonly string[],
): Promise<SecretHit[]> {
  const columns = (await rows(
    db,
    sql`
      SELECT table_schema, table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND data_type IN ('text', 'character varying', 'character',
                          'json', 'jsonb', 'bytea')
    `,
  )) as unknown as {
    table_schema: string
    table_name: string
    column_name: string
    data_type: string
  }[]

  const hits: SecretHit[] = []
  for (const column of columns) {
    const qualified = `"${column.table_schema}"."${column.table_name}"`
    // bytea casts to a hex string, which would hide an ASCII token; escape
    // encoding keeps printable bytes printable.
    const expression =
      column.data_type === 'bytea'
        ? `encode("${column.column_name}", 'escape')`
        : `"${column.column_name}"::text`

    for (const secret of secrets) {
      const found = await rows(
        db,
        sql`
          SELECT count(*)::int AS n FROM ${sql.raw(qualified)}
          WHERE strpos(${sql.raw(expression)}, ${secret}) > 0
        `,
      )
      if (Number(found[0]?.n) > 0) {
        hits.push({
          table: `${column.table_schema}.${column.table_name}`,
          column: column.column_name,
          secret,
        })
      }
    }
  }
  return hits
}
