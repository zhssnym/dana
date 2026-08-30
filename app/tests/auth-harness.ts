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
import type { Server } from 'node:http'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import { createApp } from '../src/server/index.js'
import type { Db, DbClient } from '../db/client.js'
import { cleanupUsers, createTestDb, rows } from './helpers.js'
import { TestBrowser, parseSetCookie, rawRequest } from './http-client.js'
import type { RawRequestOptions, RawResponse, StoredCookie } from './http-client.js'
import { startOidcStub } from './oidc-stub.js'
import type { OidcStub } from './oidc-stub.js'

// Re-exported so the criterion files have one import for the harness.
export { TestBrowser, parseSetCookie, rawRequest }
export type { RawRequestOptions, RawResponse, StoredCookie }

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

/*
What the notification module (11.8) hands the transport when it would send.
Spec 11.8 fixes the templates, four of them since the invite split of RFC
0005 change control item 32, and fixes that in tests the module logs instead
of sending; it fixes no call shape. The suite
needs the send observable because AC-024 counts share-grant emails, so the
harness offers this sink through the same construction seam that carries the
database handle, and normalizes whatever arrives rather than dictating key
names. The seam is assumed here exactly as options.dbClient once was, and is
escalated to the Integration Steward for ratification into 11.10.
*/
export interface OutboundEmail {
  template: string
  to: string
  raw: unknown
}

export interface EmailRecorder {
  sent(): readonly OutboundEmail[]
  /** Emails whose template names the 11.8 share-grant one. */
  shareGrants(): readonly OutboundEmail[]
  clear(): void
}

export interface AppOptions {
  /** Named as the boot file already names its own (src/server/index.ts). */
  dbClient?: DbClient
  auth?: AuthConfig
  notifications?: { send(message: unknown): void | Promise<void> }
  /** The S4 object store seam, restated structurally for AC-235: a purge
   * must be observable removing objects, and only an injected store can be
   * read afterwards. */
  fileStore?: {
    put(id: string, bytes: Buffer): Promise<void>
    get(id: string): Promise<Buffer | null>
    remove(id: string): Promise<void>
  }
  /** RFC 0005 change control item 60: the sample workspace at first
   * sign-in, off under this suite by its setup file. */
  sampleWorkspace?: boolean
}

type AppFactory = (
  options?: AppOptions,
) => ReturnType<typeof createApp> | Promise<ReturnType<typeof createApp>>

/*
The seam is 11.10's, ratified in full and implemented: options.dbClient and
options.auth at the P1 rulings, options.notifications at the mid-P2 one.
Under the default PGlite backend the suite's database is an in-memory handle
that cannot arrive as a connection string, which is why the DbClient is
passed as an object.

The double assertion outlives the ratification for two reasons. AppOptions
here restates 11.10 rather than importing createApp's own parameter type,
because this suite measures that signature and cannot borrow its definition
of correct. And the assertion absorbs signature evolution (a parameter
turning required, the factory turning async; the calls below await the
result either way), so a seam change fails this suite on the behavior it
asserts rather than on the typecheck gate, which would name nothing.
*/
const startApp = createApp as unknown as AppFactory

/* ------------------------------------------------------------------ *
 * The application under test
 * ------------------------------------------------------------------ */

export interface AuthTestApp {
  origin: string
  dbClient: DbClient
  db: Db
  stub: OidcStub
  /** Every outbound email the application attempted, via the injected sink. */
  emails: EmailRecorder
  /**
   * The sink object itself, the one createApp was constructed with. Exposed
   * for P7: the 11.7 reminder pass is a plain callable rather than a route, so
   * it is invoked directly and has to be handed the same sink the application
   * holds, or its sends would land in a recorder nothing reads. Every other
   * consumer wants `emails` and should keep wanting it.
   *
   * Optional for a boundary reason rather than a design one, the same
   * boundary tasks-harness.ts records for the pull's tz. Four unit tests under
   * src/server/routes/ build an AuthTestApp literal of their own and belong to
   * the Collaboration and Query engineers, so a required field here would fail
   * files outside this role's paths at the typecheck gate. startAuthTestApp
   * always sets it, and the P7 harness asserts it is there rather than
   * defaulting it away.
   */
  emailSink?: { send(message: unknown): void | Promise<void> }
  /**
   * The injected object store, when startAuthTestApp was handed one, so the
   * reminders harness can compose the 11.7 pass with the same store the
   * application holds (AC-235): a purge that removes objects from a store
   * nothing reads would be unobservable.
   */
  fileStore?: AppOptions['fileStore']
  /**
   * The constructed application object itself, for AC-236's structural
   * sweep: enumerating the mounted router is the only way "every mutating
   * route" can be asserted rather than sampled, and the object cannot be
   * reached over HTTP. Optional for the same boundary reason as emailSink;
   * startAuthTestApp always sets it.
   */
  application?: unknown
  browser(): TestBrowser
  close(): Promise<void>
}

/*
Field names are normalized by property rather than fixed by name, the same
philosophy as cookie identification: 11.8 fixes that a send has a template
and a recipient, not what the implementation calls them. A template counts
as the share-grant one when its words contain "share" and "grant" in order,
which admits share_grant, share-grant, shareGrant, and SHARE GRANT alike
while refusing the invite and reminder templates.
*/
function normalizeEmail(message: unknown): OutboundEmail {
  const record =
    typeof message === 'object' && message !== null
      ? (message as Record<string, unknown>)
      : {}
  const firstString = (keys: readonly string[]): string => {
    for (const key of keys) {
      const value = record[key]
      if (typeof value === 'string' && value !== '') return value
    }
    return ''
  }
  return {
    template: firstString(['template', 'kind', 'type', 'name']),
    to: firstString(['to', 'recipient', 'email', 'address']),
    raw: message,
  }
}

function isShareGrantTemplate(template: string): boolean {
  return /share[\s_-]?grant/i.test(template)
}

function createEmailRecorder(): EmailRecorder & {
  sink: { send(message: unknown): void }
} {
  const recorded: OutboundEmail[] = []
  return {
    sink: {
      send(message: unknown): void {
        recorded.push(normalizeEmail(message))
      },
    },
    sent: () => [...recorded],
    shareGrants: () =>
      recorded.filter((email) => isShareGrantTemplate(email.template)),
    clear: () => {
      recorded.length = 0
    },
  }
}

/*
Settled by the 2026-07-31 amendment. This was probed while 7.0's base path and
7.1's short spellings could each be read as the mount point; 7.1 now states
outright that its endpoints mount under the base path, so GET /auth/google is
GET /api/v1/auth/google. The probe is gone with the ambiguity: tolerating a
root mount would now mean tolerating a specification violation, which is the
opposite of this suite's job.
*/
const AUTH_BASE = '/api/v1'

export async function startAuthTestApp(
  options: { fileStore?: AppOptions['fileStore']; sampleWorkspace?: boolean } = {},
): Promise<AuthTestApp> {
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

  const emails = createEmailRecorder()
  const app = await startApp({
    dbClient,
    auth,
    notifications: emails.sink,
    ...(options.fileStore === undefined ? {} : { fileStore: options.fileStore }),
    // Item 60: off for every file but the one that measures the sample.
    ...(options.sampleWorkspace === undefined ? {} : { sampleWorkspace: options.sampleWorkspace }),
  })
  server.on('request', app)

  const testApp: AuthTestApp = {
    origin,
    dbClient,
    db: dbClient.db,
    stub,
    emails,
    emailSink: emails.sink,
    application: app,
    ...(options.fileStore === undefined ? {} : { fileStore: options.fileStore }),

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

export function authUrl(app: AuthTestApp, path: string): string {
  return `${app.origin}${AUTH_BASE}${path}`
}

/**
 * One named assertion for "this answered a redirect", rather than a pair of
 * bounds. Written as two comparisons, a 404 satisfies the lower bound and
 * fails the upper one, so the failure surfaces on whichever half carries no
 * message and the report names nothing. The status is in the message because
 * that is the fact worth reading.
 */
export function expectRedirect(response: RawResponse, why: string): void {
  const redirected =
    response.status >= 300 && response.status < 400 && response.location !== null
  expect(
    redirected,
    `${why}; answered ${String(response.status)}${response.location === null ? ' with no Location header' : ` to ${String(response.location)}`}`,
  ).toBe(true)
}

/* ------------------------------------------------------------------ *
 * The sign-in flow, in pieces so attacks can enter partway
 * ------------------------------------------------------------------ */

export interface AuthorizationOptions extends RawRequestOptions {
  /**
   * The 7.1 tz query parameter, the client's detected zone. Omitting the field
   * omits the parameter, which is its own case: 8.1 says a login carrying no
   * tz syncs nothing, and 7.1 provisions UTC for one.
   */
  tz?: string
}

/** Step one: the application's redirect to the identity provider. */
export async function beginAuthorization(
  app: AuthTestApp,
  browser: TestBrowser,
  options: AuthorizationOptions = {},
): Promise<URL> {
  const { tz, ...request } = options
  const target = new URL(authUrl(app, '/auth/google'))
  if (tz !== undefined) target.searchParams.set('tz', tz)

  const response = await browser.request(target.toString(), request)
  expectRedirect(
    response,
    `GET ${AUTH_BASE}/auth/google must redirect to Google (spec 7.1, whose endpoints mount under the 7.0 base path)`,
  )
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

export interface SignInOptions extends AuthorizationOptions {
  /** Reuses an existing jar, for the fixation and returning-login cases. */
  browser?: TestBrowser
}

/**
 * The whole flow, asserting success at each step. Attack tests use the three
 * pieces above instead, so they can corrupt one step and observe the refusal.
 */
export async function signIn(
  app: AuthTestApp,
  options: SignInOptions = {},
): Promise<SignedIn> {
  const browser = options.browser ?? app.browser()
  const authorization = await beginAuthorization(app, browser, options)
  const callbackUrl = await followAuthorization(app, authorization)
  const callback = await completeCallback(browser, callbackUrl)

  expectRedirect(
    callback,
    'the callback must establish a session and redirect into the app (spec 7.1)',
  )

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
  options: SignInOptions = {},
): Promise<{ browser: TestBrowser; callback: RawResponse; callbackUrl: URL }> {
  const browser = options.browser ?? app.browser()
  const authorization = await beginAuthorization(app, browser, options)
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

/**
 * IANA validity, which INV-14 requires of every provisioned user and 10.3
 * requires of every zone that enters the system.
 *
 * Intl.DateTimeFormat is the oracle, and 11.15 records that it is tolerant
 * beyond the tzdb: it accepts ECMA-402 offset identifiers like +05:30, which
 * are not IANA names and would break the 11.9 zone math. Without the sign
 * guard this predicate accepted them, so an implementation that stored an
 * offset arriving on the 7.1 tz query passed AC-007's INV-14 assertion while
 * violating the invariant it names. Nothing else in the suite discriminated
 * either: AC-007's one offset-shaped value, UTC+5, is refused by bare Intl
 * too, so it never exercised the difference.
 *
 * The guard is written here rather than imported from the shared validator
 * (app/src/shared/timezone.ts), by the Steward's ruling: this suite measures
 * that module and cannot borrow its definition of correct, or a wrong
 * validator would agree with itself. The two were checked once, off to the
 * side, against offsets, aliases, case variants and malformed input, and
 * agreed on every value; that is what makes the independence worth having
 * rather than merely principled.
 *
 * The oracle's other two tolerances stay, because the shared validator keeps
 * them deliberately: tzdb aliases validate, since 8.1 counts US/Eastern and
 * America/New_York as one zone, and names match case-insensitively.
 */
export function isIanaTimezone(value: unknown): boolean {
  if (typeof value !== 'string' || value === '') return false
  // No IANA name opens with a sign; every ECMA-402 offset identifier does.
  if (value.startsWith('+') || value.startsWith('-')) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ *
 * The sessions table (spec 10.1)
 * ------------------------------------------------------------------ */

/*
Section 10.1 fixes four facts about the sessions table as contract: it is named
sessions, it references users(id) through a user_id column declared ON DELETE
CASCADE, expiry is a timestamptz column named expires_at that every
authenticated request resets to 30 days out, and the lookup key is a token_hash
text column, the primary key, holding the lowercase hex sha256 digest of the
cookie's token. Everything else about the table is the Security engineer's.

Sessions are addressed here by user_id and never by the cookie value, because
the raw token is deliberately absent from the table: 10.1 keeps it nowhere at
rest. AC-113 relates the two once, in the direction the specification gives, by
hashing the cookie rather than by looking for it.
*/
export const SESSIONS_TABLE = 'sessions'

export async function sessionsTableExists(db: Db): Promise<boolean> {
  const found = await rows(
    db,
    sql`
      SELECT count(*)::int AS n FROM pg_class t
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relkind = 'r' AND t.relname = ${SESSIONS_TABLE}
    `,
  )
  return Number(found[0]?.n) > 0
}

/** Asserts the table is there before anything tries to read it, so a missing
 * table reports as the missing behavior it is rather than as a SQL error. */
export async function requireSessionsTable(db: Db): Promise<void> {
  expect(
    await sessionsTableExists(db),
    'no sessions table exists (spec 10.1 fixes its name, its user_id foreign key, and its expires_at column as contract)',
  ).toBe(true)
}

export async function sessionExpiriesForUser(
  db: Db,
  userId: string,
): Promise<Date[]> {
  const found = await rows(
    db,
    sql`SELECT expires_at FROM sessions WHERE user_id = ${userId} ORDER BY expires_at`,
  )
  return found.map((row) => new Date(String(row.expires_at)))
}

export async function countSessionsForUser(
  db: Db,
  userId: string,
): Promise<number> {
  const found = await rows(
    db,
    sql`SELECT count(*)::int AS n FROM sessions WHERE user_id = ${userId}`,
  )
  return Number(found[0]?.n)
}

/** Moves every session of one user to a chosen instant, which is how AC-113
 * reaches an expiry 30 days out without waiting for it. */
export async function setSessionExpiry(
  db: Db,
  userId: string,
  expiresAt: Date,
): Promise<void> {
  await db.execute(
    sql`UPDATE sessions SET expires_at = ${expiresAt.toISOString()}::timestamptz WHERE user_id = ${userId}`,
  )
}

/* ------------------------------------------------------------------ *
 * Rendered pages
 * ------------------------------------------------------------------ */

/**
 * The words a person would read, with tags removed and the entity forms of
 * the characters that appear in section 9's copy folded back. Copy assertions
 * compare against this rather than the raw body, because "can't" is equally
 * correctly served as can&#39;t, can&apos;t, or can&#x27;t, and none of those
 * is a copy difference.
 */
export function visibleText(html: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#34;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&nbsp;': ' ',
    '&rsquo;': '’',
    '&#8217;': '’',
  }
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[#a-zA-Z0-9]+;/g, (entity) => entities[entity.toLowerCase()] ?? entity)
    // A typographic apostrophe reads identically and is not a copy change.
    .replace(/’/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
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
