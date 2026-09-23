import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import { pino } from 'pino'

import { createDbClient } from '../../db/client.js'
import type { DbClient } from '../../db/client.js'
import { createAuthRouter } from './auth/index.js'
import type { AuthConfig } from './auth/index.js'
import { canonicalHostRedirect, canonicalOriginOf } from './http/canonical-host.js'
import { errorBody } from './http/errors.js'
import { attachNotifier, createNotifier, notifierOf } from './notify/index.js'
import type { NotificationSink } from './notify/index.js'
import { resolveEmailTransport } from './notify/resend.js'
import { reportConnectionLost } from './observability/connection-lost.js'
import { reportDatabaseFallback } from './observability/database-fallback.js'
import { createServerErrorTracker } from './observability/error-tracker.js'
import type { ErrorTracker } from './observability/error-tracker.js'
import { createApplicationLogger } from './observability/logger.js'
import { createRequestErrorHandler } from './observability/request-errors.js'
import { createDiskStore } from './files/store.js'
import type { ObjectStore } from './files/store.js'
import { createBundleRouter } from './routes/bundle.js'
import { createConnectionsRouter } from './routes/connections.js'
import { createConsultationInputRouter } from './routes/consultation-input.js'
import { createCoverPhotosRouter } from './routes/cover-photos.js'
import { createConversationRouter } from './routes/conversation.js'
import {
  CSP_REPORT_PATH,
  createCspReportRouter,
} from './routes/csp-report.js'
import { createEventsRouter } from './routes/events.js'
import { createExportRouter } from './routes/export.js'
import { createFacetsRouter } from './routes/facets.js'
import { createFilesRouter } from './routes/files.js'
import { createFoldersRouter } from './routes/folders.js'
import { HEALTH_PATH, healthRouter, recordDatabaseKind } from './routes/health.js'
import { createInvitesRouter } from './routes/invites.js'
import { createLabelsRouter } from './routes/labels.js'
import { createReferencesRouter } from './routes/references.js'
import { createBacklinksRouter } from './routes/backlinks.js'
import { createSampleRouter } from './routes/sample.js'
import { createTasksRouter } from './routes/tasks.js'
import { createTrashRouter } from './routes/trash.js'
import { createViewsRouter } from './routes/views.js'
import { createWorkshopRouter } from './routes/workshop.js'
import { startReminderScheduler } from './scheduler/index.js'
import { originOf } from './security/csp-report.js'
import { createRateLimits } from './security/rate-limit.js'
import type { RateLimits } from './security/rate-limit.js'
import { createSecurityLogger } from './security/log.js'
import type { SecurityLogger } from './security/log.js'

export const logger = pino()
const bootLog = createSecurityLogger(logger)

/**
 * Construction-time configuration for the 11.6 authentication module,
 * injectable so the acceptance suite can point the module at a stub issuer:
 * one that hardcodes accounts.google.com cannot be tested at all (11.10).
 * When absent, the module falls back to the environment quintet that remains
 * the production path: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
 * GOOGLE_ISSUER_URL, APP_ORIGIN, OIDC_ALLOW_INSECURE. This object wins over
 * all five.
 *
 * The type is the auth module's own, re-exported rather than restated: it
 * describes that module's configuration, and two copies of one interface are
 * two things that can disagree.
 */
export type { AuthConfig }

/** The construction seam of 11.10. */
export interface AppOptions {
  /**
   * The one database handle (app/db/client.ts). The boot path always passes
   * its own; the acceptance suite passes an in-memory PGlite that no
   * connection string could name. Routes that touch the database require it
   * and fail only when called without it, never at construction, so
   * database-free surfaces (health, route-presence probes) can construct
   * the application bare.
   */
  dbClient?: DbClient
  auth?: AuthConfig
  /**
   * The 11.10 notification sink, { send(message) }. When present, the 11.8
   * notify module delivers every outbound message to it instead of logging,
   * the only way a send is observable under test: 11.8 forbids real sending
   * there, and 10.5 keeps recipient addresses out of the logs. Absent, 11.8
   * stands unchanged: the module logs in development and tests, and sends
   * through the Resend transport in notify/resend.ts in production.
   */
  notifications?: NotificationSink
  /** Privacy-safe structured log sink, injectable for tests. */
  securityLog?: SecurityLogger
  /** Error tracker seam, injectable for tests; production resolves Sentry from env. */
  errorTracker?: ErrorTracker
  /** Explicit limiter set for focused tests. Production constructs its own. */
  rateLimits?: RateLimits
  /**
   * The object store (files/store.ts), bytes behind one interface.
   * Absent, a disk store is constructed over DANA_FILES_DIR, or the OS
   * temporary directory when that is unset, which is the test default;
   * construction does no I/O either way (11.10), the directory being made
   * at the first put.
   */
  fileStore?: ObjectStore
  /**
   * Directory of the built client, present only after npm run build. The
   * boot path performs the existence check and passes the result, because
   * createApp itself performs no I/O (11.10).
   */
  clientDist?: string
  /**
   * This deployment's own origin, APP_ORIGIN. Present, it is the canonical
   * host: every request arriving on any other one is redirected to it
   * (http/canonical-host.ts, issue #6). Absent, nothing redirects, which is
   * development and the test default.
   *
   * The boot fills it from the environment and hands it here, rather than
   * this file reading `process.env.APP_ORIGIN` as it does further down for
   * the reporting endpoint: a test harness can set APP_ORIGIN to its own
   * origin and drive the auth endpoints with crafted Host headers, and a
   * redirect that read the environment would answer those requests before an
   * auth endpoint saw one.
   */
  appOrigin?: string
  /**
   * Whether a brand-new account is written the sample workspace at its
   * first sign-in (7.20). Defaults to true unless
   * DANA_SAMPLE_WORKSPACE is 'off', read at createApp() call time; the
   * acceptance suite sets it off in its setup file so a fresh account is the
   * empty one its criteria count on, and the one file that measures the
   * sample passes true here.
   */
  sampleWorkspace?: boolean
}

/** The production store over DANA_FILES_DIR, or the OS temp path when that
 * is unset. Construction does no I/O (11.10); the directory is made at the
 * first put. Named so createApp's default and main() resolve one way: the
 * boot passes one instance to both the application and the scheduler, the
 * purge and DELETE /me removing objects from the store uploads land in. */
function defaultDiskStore(): ObjectStore {
  return createDiskStore(
    process.env.DANA_FILES_DIR !== undefined && process.env.DANA_FILES_DIR !== ''
      ? process.env.DANA_FILES_DIR
      : path.join(os.tmpdir(), 'dana-files'),
  )
}

/**
 * The sha256 of the one inline script in `app/index.html`, base64, in the
 * form a CSP hash-source takes. The theme script paints the first frame from
 * the localStorage mirror and cannot be moved into the bundle without
 * becoming the second frame, which is the flash it exists to prevent, so the
 * policy names it instead.
 *
 * It is a literal rather than a digest computed at boot because createApp
 * performs no I/O (11.10) and because the file it would read does not exist
 * in a source checkout that has never built. Nothing checks it
 * automatically: edit the inline script and this digest must be recomputed,
 * or the policy refuses the script and the theme flashes on cold load.
 *
 * And the digest is stable across checkouts only because `.gitattributes`
 * sets `* text=auto eol=lf`. `core.autocrlf` is true on at least one machine
 * here, and a CRLF working copy of `app/index.html` hashes to something else
 * entirely, which would ship a policy refusing the very script it names.
 */
const THEME_SCRIPT_HASH = 'sha256-Dj3RFqRnuo6lgqd0HI36Wj2p9AqPZv5+ymGddn+OUjw='

// createApp is synchronous, performs no I/O, and opens no database (11.10):
// everything a route needs arrives through options, already opened.
export function createApp(options: AppOptions = {}): express.Express {
  const app = express()
  app.disable('x-powered-by')

  /*
  **Exactly one proxy hop, and never `true` (issue #153).**

  11.11 puts production behind Render's edge, which terminates TLS and opens
  its own socket to this process. So without this line `req.ip` is the edge's
  address for every visitor on earth, and every limiter 10.4 keys on an
  address is one bucket for the whole deployment rather than one per client:
  a limit meant to slow one abusive caller slows everybody, and a stranger
  holds the endpoint at 429 for all of them with a few requests a minute. It
  has been true since the first per-address limiter shipped, and nothing local
  could ever show it, because under test and in development the socket peer
  *is* the real client.

  `1` means: trust the one hop nearest this process, so `req.ip` is the last
  address in `X-Forwarded-For` — the one Render appended, naming whoever
  opened the connection to it. **`true` would trust the whole header**, which
  a client writes itself, so any caller could pick a fresh address per request
  and never meet a limit at all; express-rate-limit refuses that outright with
  `ERR_ERL_PERMISSIVE_TRUST_PROXY`. The number is a claim about the
  deployment, so it moves when the deployment gains a hop and not otherwise:
  a CDN in front of Render would make it 2, and a second one still not `true`.

  Locally and under test there is no proxy, no `X-Forwarded-For`, and this
  setting changes nothing — `req.ip` stays the socket peer.

  **This setting moves four request properties and not one, so here is what
  the other three reach, checked rather than assumed.** `req.hostname` reads
  `X-Forwarded-Host` and `req.secure` follows `req.protocol`. **`hostname` has
  had exactly one reader since issue #6 and it is the middleware mounted
  immediately below**, which wants precisely this: behind Render's edge the
  visitor's own address is in that header and the socket's `Host` is the
  platform's. Nothing reads `secure` or `subdomains` at all, and the session
  cookies are `secure: true` as literals rather than as a question about the
  request. `req.protocol` has exactly one reader,
  `routes/csp-report.ts`, and only as the fallback for an unset `APP_ORIGIN` —
  which `assertSignInIsPossible` refuses to boot without, so it is a
  development affordance and never the production path. A crafted
  `X-Forwarded-Proto` can now flip that fallback's scheme on a process
  configured without an origin; the comment there already records that the
  fallback trusts the caller's `Host` for the same decision and that a caller
  who forges it can log a line they could log anyway. And **no redirect target
  moves**: `auth/router.ts` builds the authorization URL, the `redirect_uri`
  and the callback URL from configuration, which is the rule written at the
  head of that file, and the canonical-host redirect below sends everyone to
  the configured origin whatever host they claimed. What a forged
  `X-Forwarded-Host` can do, since issue #6, is decide **whether** that
  redirect fires: claim the canonical host and it does not. That is a caller
  choosing to be served on the address they already reached, which is exactly
  what everyone got before this middleware existed, so the failure direction
  is back to the old behaviour for one caller and never past it.
  */
  app.set('trust proxy', 1)

  /*
  One host, one cookie jar (issue #6), and it is mounted first for a reason
  that is not ceremony: a request for a host this deployment does not answer
  on is answered here and goes no further, so the 301 carries no policy
  header, spends no limiter, parses no body and touches no session. The
  reasoning, the 404-for-mutations rule and why the origin arrives as an
  option rather than out of the environment are all in the module.

  `/api/health` is the one path exempted, and the literal comes from the
  router it exempts so the two cannot drift: Render's own probe reaches this
  service by its Render hostname, which is the non-canonical one by
  definition, and a 301 there fails the health check and with it the deploy.
  */
  const canonicalHost = canonicalHostRedirect({
    appOrigin: options.appOrigin,
    exempt: [HEALTH_PATH],
  })
  if (canonicalHost !== null) app.use(canonicalHost)

  /*
  10.8's response headers, ahead
  of everything that answers a request so every response carries them,
  refusals and errors included. The one response in front of them is the
  canonical-host redirect above, which is deliberate: a 301 off this
  deployment's address carries no document, so there is no policy to enforce
  on it and no report it could send back here.

  The policy is sized to what the client actually loads and no wider, and
  each widening past 'self' carries its reason:

  - style-src 'unsafe-inline': React style attributes carry runtime data the
    stylesheet cannot, 7.4's my_color on the sidebar dot among them, and the
    server-rendered signin page ships its own style element. Inline styles
    execute nothing; the directive that matters for scripts stays 'self'.
  - img-src data:: Vite inlines assets under its size threshold as data:
    URIs at build time. A data: image is bytes, not a document.
  - img-src https://*.googleusercontent.com: the account picture 7.2 stores
    at first sign-in, which is Google's `picture` claim and therefore a URL
    on Google's own user-content CDN. This is 10.8's own rule applied
    rather than relaxed: the client draws that picture on every surface that
    shows a person, and a refused image silently falls back to initials.
    **This is not the case `routes/cover-photos.ts` refused**, and the
    distinction is worth keeping. That header declines to widen img-src for
    a *search result*: an arbitrary third-party host chosen at runtime,
    where a directive wide enough to admit one is wide enough to admit any,
    so the bytes come through this origin instead. Here the host is fixed,
    it is the identity provider the session itself rests on, and no route
    in this application ever writes a caller-supplied string into
    `users.avatar_url` — provisioning writes Google's claim and 7.15's
    upload writes `/api/v1/files/:id`, and there is no third writer. The
    directive admits images and nothing else; `Referrer-Policy:
    strict-origin-when-cross-origin` below keeps the request from telling
    Google which page drew the face.
  - connect-src https://*.sentry.io: 11.12 sends client errors to Sentry
    when the build carried VITE_SENTRY_DSN; the wildcard covers the
    per-organization ingest hosts.

  The four directives below (issues #34 and #13) each answer a refusal
  quoted from the browser console against the production build. None can be
  seen in development: `npm run dev` serves the document from Vite, which
  sends no policy, and proxies only /api to this process.

  - script-src 'self' <sha256 of the theme script>: `index.html` carries one
    inline script that paints the theme from localStorage before the first
    frame, and with no script-src at all `default-src 'self'` governed it:
    "Executing inline script violates the following Content Security Policy
    directive 'default-src 'self''". So every person on Dark saw a white
    frame on every cold load. The hash is preferred over a nonce because
    this process serves `index.html` as a static file it never templates,
    and over 'unsafe-inline' because widening the one directive that decides
    whether an injected script runs, in order to remove a flash, is not a
    trade worth making. The literal below is the digest of that script's
    body, and must be recomputed whenever the script changes.
  - img-src blob:: the client turns a chosen File into an object URL and
    loads it into an Image to crop it (`lib/viewer.ts` squareImageFile), and
    draws the same kind of URL as the preview of an attachment that is still
    uploading. "Loading the image 'blob:...' violates the following Content
    Security Policy directive: img-src 'self' data: ...". This is the whole
    of issue #13: the avatar crop resolved null on the refusal, and the
    Settings screen's `if (square)` then did nothing at all, with no error
    anywhere, so a Google account picture worked (an https URL this policy
    already admitted) and an uploaded one silently never happened. A blob:
    URL is bytes this document already holds, addressable by nothing else
    and by no other origin, which is the same ground `data:` is admitted on
    two bullets up.
  - media-src 'self' blob:: a voice note is played back from the object URL
    of the Blob the recorder just produced, before it has been uploaded.
    "Loading media from 'blob:...' violates the following Content Security
    Policy directive: default-src 'self'". Same bytes, same reasoning; the
    directive is written out rather than left to fall back so that 'self',
    which the uploaded note is served from, is stated too.
  - connect-src data:: the crop hands a canvas data: URL back through
    `fetch()` to rebuild it as a File for the multipart upload, and
    connect-src is what governs a fetch of a data: URL: "Connecting to
    'data:image/jpeg;base64,...' violates the following Content Security
    Policy directive: connect-src 'self' https://*.sentry.io". This is the
    second wall in front of issue #13's upload, behind the img-src one.
    data: reaches no network, so admitting it here widens what this document
    can talk to by nothing at all; it is the img-src data: bullet's sentence
    read against the directive that happens to govern fetch.

  HSTS is deliberately absent: 10.8 gives it to the edge in front of the
  process, which is the only party that knows TLS is really terminating.

  **The last two directives are the reporting pair (issue #99).** A refusal
  raises no error the server sees and no error the client can report, so the
  policy names an endpoint and the browser posts its own refusals to it.

  Both generations of the mechanism are stated because browsers are split
  across them: `report-uri` is deprecated in Chromium and implemented
  everywhere, `report-to` is its replacement and needs the
  `Reporting-Endpoints` header below to say what the endpoint name means. A
  browser that honours both sends one report, not two, `report-to` winning
  where it is understood. Sending only the modern pair would lose Safari and
  Firefox today; sending only `report-uri` would lose Chromium the day it
  finishes removing it, silently, which is the failure this is here to stop.

  The endpoint value is absolute when APP_ORIGIN is set, which 11.11 makes
  certain in production. The header's value is parsed against the document's
  own URL, so a relative path is well defined too and is the development
  fallback; the absolute form is preferred because this is a header whose
  misconfiguration reports nothing and says nothing, and there is no reason
  to leave a resolution rule between it and working.
  */
  const reportEndpoint = `${originOf(process.env.APP_ORIGIN) ?? ''}${CSP_REPORT_PATH}`
  const securityHeaders: ReadonlyArray<[string, string]> = [
    [
      'Content-Security-Policy',
      "default-src 'self'; base-uri 'self'; object-src 'none'; " +
        "frame-ancestors 'none'; " +
        `script-src 'self' '${THEME_SCRIPT_HASH}'; ` +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob: https://*.googleusercontent.com; " +
        "media-src 'self' blob:; " +
        "frame-src https://www.youtube-nocookie.com https://player.vimeo.com; " +
        "connect-src 'self' data: https://*.sentry.io; " +
        `report-uri ${CSP_REPORT_PATH}; ` +
        'report-to csp-endpoint',
    ],
    ['Reporting-Endpoints', `csp-endpoint="${reportEndpoint}"`],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ]
  app.use((_req: Request, res: Response, next: NextFunction) => {
    for (const [name, value] of securityHeaders) res.setHeader(name, value)
    next()
  })
  const runningTests =
    process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'
  const rateLimits =
    options.rateLimits ??
    createRateLimits(
      runningTests
        ? {
            limits: {
              invitePerMinute: Number.MAX_SAFE_INTEGER,
              invitePerDay: Number.MAX_SAFE_INTEGER,
              searchPerMinute: Number.MAX_SAFE_INTEGER,
              mutationsPerMinute: Number.MAX_SAFE_INTEGER,
              cspReportsPerMinute: Number.MAX_SAFE_INTEGER,
              // Issue #168. Every auth criterion signs in repeatedly from
              // one address, and the whole suite shares this machine, so
              // twenty a minute would be measuring 10.4 rather than the
              // criterion. A test of the limiter constructs a real one.
              signInBeginsPerMinute: Number.MAX_SAFE_INTEGER,
              signInCallbacksPerMinute: Number.MAX_SAFE_INTEGER,
            },
          }
        : {},
    )
  const securityLog = options.securityLog ?? createSecurityLogger(logger)
  const errorTracker = options.errorTracker ?? createServerErrorTracker()
  const fileStore = options.fileStore ?? defaultDiskStore()
  const notifyLogger = {
    info(fields: Record<string, unknown>): void {
      securityLog.operation('info', 'notification_configuration', {
        configured:
          typeof fields.configured === 'boolean' ? fields.configured : undefined,
        template:
          typeof fields.template === 'string' ? fields.template : undefined,
        missing: typeof fields.missing === 'string' ? fields.missing : undefined,
      })
    },
  }

  // The 11.8 notify module is constructed with the application so the 11.10
  // sink can replace its log transport. The call sites are the routes'
  // (7.4 share grant, 7.5 invites) and reach the instance through
  // notifierOf(app); the 11.7 pass is handed the same instance in main()
  // below, so one construction decides what every outbound message does.
  //
  // The transport is resolved here rather than passed in, because it is a
  // fact about the process rather than about this application: 11.8 sends in
  // production and logs everywhere else, and resolveEmailTransport answers
  // undefined for every environment but the one. Reading environment
  // variables is not I/O, which is the same ground on which 11.6 has
  // createApp read DANA_DEV_LOGIN at this call.
  attachNotifier(
    app,
    createNotifier({
      sink: options.notifications,
      transport: resolveEmailTransport({ logger: notifyLogger }),
      logger: notifyLogger,
    }),
  )

  /*
  The CSP violation endpoint (issue #99), and **its position here is
  load-bearing in two ways** rather than one.

  It is ahead of the global `express.json` because it needs a 16 KB cap of
  its own and a parser told about `application/csp-report` and
  `application/reports+json`; behind it, an `application/json` body would be
  buffered at 3 MB before this router ever saw it, by an unauthenticated
  caller.

  And it is ahead of the non-object body guard below, which refuses an array
  outright — while the Reporting API's shape *is* an array, so behind that
  guard every modern browser's report would answer 400. Neither of these
  announces itself if the mount slides: the reports simply stop, which is
  the silence this endpoint exists to end.
  */
  app.use(
    CSP_REPORT_PATH,
    createCspReportRouter({
      securityLog,
      errorTracker,
      rateLimits,
      appOrigin: process.env.APP_ORIGIN,
    }),
  )

  // 10.3's JSON body row: 3 MB, sized
  // above the largest legal workflow file so every cap in the limits table
  // is reachable. The parser's default 100 kB was refusing legal imports
  // before 10.3's own caps could speak. Over the row, the parser answers
  // 400 before any field is read, which the table's closing sentence
  // records as the body ceiling's honest answer.
  app.use(express.json({ limit: 3 * 1024 * 1024 }))

  // 7.0: a body that parses to something other than an object is
  // malformed, 400, exactly like one that does not parse. The parser's
  // strict mode already refuses the scalar forms; arrays parse, so they are
  // refused here. The predicate still spells the whole rule rather than the
  // parser's current share of it, so a parser swap cannot reopen the edge.
  // undefined is a request that carried no JSON body at all, which is not
  // this rule's business.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const body: unknown = req.body
    const nonObject =
      body !== undefined &&
      (typeof body !== 'object' || body === null || Array.isArray(body))
    if (nonObject) {
      res.status(400).json(errorBody('bad_request', 'Malformed request body.'))
      return
    }
    next()
  })

  app.use(HEALTH_PATH, healthRouter)

  /*
  The mount order below is load-bearing in exactly one place (issue #37).
  Everything else here is order-independent, which
  is why the one exception is easy to lose: sixteen routers share the
  `/api/v1` mount and Express matches whole paths rather than prefixes, so a
  new router is safe when it meets no whole path an earlier one claims. The
  one exception:

  **`createViewsRouter` must stay ahead of `createBundleRouter`.** The views
  router owns 7.10's six literal pages, `GET /views/my-day`, `/views/tasks`,
  `/views/planned`, `/views/important`, `/views/all` and `/views/done`. The
  bundle router owns 4.19's `GET /views/:id`, which matches any single
  segment after `/views`, so mounted first it swallows all six: `parsedId`
  refuses `my-day` as a uuid and the page answers 404 instead of a view.

  `/views/planned/calendar` is two segments, so it is the only 7.10 page a
  swapped order leaves standing.

  **AC-236 does not catch this and cannot.** Both routes stay in the
  enumeration and both still answer 401 bare, so the sweep's counts and its
  statuses are unmoved. The guard against reordering is this comment and the
  two markers below.

  Anything mounted after these two is safe if its paths are literal or claim
  a prefix no earlier router uses. A new router carrying a one-segment
  `:param` under a prefix somebody else spells out is the shape to look for.
  */

  // The /api/v1 surface. The 7.1 auth and account endpoints mount
  // first; every later router stays ahead of
  // the catch-all below so unknown API paths answer JSON, not the SPA.
  //
  // Both options are handed straight through and both may be absent, which
  // is what 11.10 requires of this seam: createAuthRouter is synchronous,
  // opens nothing, and resolves the issuer lazily, so an application built
  // without configuration still builds and a route-presence probe still
  // works. The two rules that bind this mount are honored inside the module
  // rather than here: DANA_DEV_LOGIN is read at this call, never at module
  // load (11.6), and the dev-login loader uses a computed specifier and
  // treats a failed load as 404, because tsc would otherwise emit the module
  // tsconfig.build.json excludes (11.15).
  app.use(
    '/api/v1',
    createAuthRouter({
      dbClient: options.dbClient,
      auth: options.auth,
      rateLimits,
      securityLog,
      // 8.10 step 6a: DELETE /me removes the deleted account's objects
      // after its transaction commits, so the auth router holds the same
      // store the files router serves from.
      fileStore,
      sampleWorkspace: options.sampleWorkspace ?? process.env.DANA_SAMPLE_WORKSPACE !== 'off',
    }),
  )

  // 7.20's sample workspace: three routes under one path that no earlier
  // router claims.
  app.use(
    '/api/v1',
    createSampleRouter({ dbClient: options.dbClient, rateLimits, fileStore }),
  )

  // The folders router: after the auth router, whose session attachment
  // then serves both, and ahead of the catch-all.
  app.use(
    '/api/v1',
    createFoldersRouter({ dbClient: options.dbClient, rateLimits, securityLog }),
  )

  // The tasks router: the 7.6, 7.7 and 7.8 surfaces. Same position and the same reason,
  // and its paths (/tasks, /steps) meet nothing the folders router claims, so
  // the pair is order-independent between themselves.
  app.use(
    '/api/v1',
    createTasksRouter({ dbClient: options.dbClient, rateLimits, securityLog }),
  )

  /*
  The M1 Label router (issue #226, parent #208): the definition listing, the
  two definition CRUD groups, and the two assignment pairs.

  **Position is deliberate and is not load-bearing, which is worth separating.**
  It is mounted after the folders and tasks routers because three of its four
  groups hang off their prefixes and reading it here is how a person finds it;
  it would work anywhere ahead of the catch-all, because Express matches whole
  paths and neither of those routers registers a route of any of these shapes.
  `/folders/:id` is one segment and `/folders/:folderId/labels` is two;
  `/folders/:id/my-membership` and `/folders/:folderId/labels/:labelId` differ
  in their literal segment. Nothing here is a prefix of anything there, so
  nothing is shadowed in either direction — unlike the `/views/:id` case two
  blocks down, which genuinely is.
  */
  app.use(
    '/api/v1',
    createLabelsRouter({ dbClient: options.dbClient, rateLimits, securityLog }),
  )

  // The views router: the 7.10 read surface. Same position and the same reason. It shares the /folders
  // prefix with the folders router but no whole path with it, and Express
  // matches on the whole path, so that pair is order-independent too; every
  // endpoint on it is a GET, which 7.0 makes safe, so it takes no CSRF link.
  // Load-bearing position: ahead of the bundle router, whose `/views/:id`
  // would shadow this router's six literal `/views/...` pages. See the
  // block above `/api/v1`.
  app.use('/api/v1', createViewsRouter({ dbClient: options.dbClient, rateLimits }))

  // The invites and connections routers: the 7.5 invite surface with its five transitions and two lists, and
  // 7.3's roster with its one removal. Same position and the same reason. Their
  // paths (/invites, /invites/:id/..., /connections, /connections/:userId) meet
  // nothing the three routers above claim and nothing each other claims, so all
  // five are order-independent among themselves; their mutations carry the CSRF
  // link and their two GETs do not, which is 7.0's split. Both reach the notify
  // module through notifierOf(app), already attached above.
  app.use(
    '/api/v1',
    createInvitesRouter({ dbClient: options.dbClient, rateLimits, securityLog }),
  )
  app.use(
    '/api/v1',
    createConnectionsRouter({ dbClient: options.dbClient, rateLimits }),
  )

  // 7.12's events and notifications, and 7.13's
  // Trash with its two restores. Same position and session attachment as
  // the five above; their paths (/events, /notifications, /trash, and the
  // two /restore tails) meet nothing the earlier routers claim, so the set
  // stays order-independent.
  app.use(
    '/api/v1',
    createEventsRouter({ dbClient: options.dbClient, rateLimits }),
  )
  app.use(
    '/api/v1',
    createTrashRouter({ dbClient: options.dbClient, rateLimits, fileStore }),
  )

  // The files surface (7.15): uploads, authenticated serving, the
  // avatar. Same position as the two above; its paths meet nothing the
  // earlier routers claim.
  app.use(
    '/api/v1',
    createFilesRouter({
      dbClient: options.dbClient,
      fileStore,
      rateLimits,
      securityLog,
    }),
  )

  // The photo tier's three routes (7.15): the
  // Openverse search proxied so the CSP never widens, its thumbnails
  // streamed from this origin, and a chosen photograph landed through the
  // same createFile as an upload. Reasoning in routes/cover-photos.ts.
  app.use(
    '/api/v1',
    createCoverPhotosRouter({
      dbClient: options.dbClient,
      fileStore,
      rateLimits,
      securityLog,
    }),
  )

  // The workshop (7.16): pages, shelves, and the object acts. Its
  // /tasks/:id/duplicate and /folders/:id/duplicate tails meet nothing the
  // earlier routers claim, Express matching whole paths.
  app.use(
    '/api/v1',
    createWorkshopRouter({
      dbClient: options.dbClient,
      rateLimits,
      fileStore,
      securityLog,
    }),
  )

  // The conversation (7.14): threads, replies, likes.
  app.use(
    '/api/v1',
    createConversationRouter({
      dbClient: options.dbClient,
      rateLimits,
      securityLog,
    }),
  )

  // The bundle (4.19): the /settings surface (7.23) and the saved views.
  //
  // Load-bearing position: behind the views router. Its `GET /views/:id`
  // matches one segment after `/views` and would shadow that router's six
  // literal pages if it moved ahead. See the block above `/api/v1`.
  app.use(
    '/api/v1',
    createBundleRouter({
      dbClient: options.dbClient,
      rateLimits,
      fileStore,
      securityLog,
    }),
  )

  // 7.22's data export (issue #77): one GET at the literal path `/me/export`,
  // which no earlier router claims, so this mount is order-independent like
  // every other one but the views/bundle pair above. It is handed the
  // security log because 10.5 records one line per export, and the limiter
  // set because 10.4 gives the route five per hour of its own.
  app.use(
    '/api/v1',
    createExportRouter({ dbClient: options.dbClient, rateLimits, securityLog }),
  )

  // Dana Link references (issue #223): two GETs under the `/references`
  // prefix, which no earlier router claims, so this mount is
  // order-independent like every other one but the views/bundle pair above.
  // Its own `/references/:kind/:id` is two segments and its
  // `/references/search` is one, so neither shadows the other and neither
  // can reach a path outside the prefix. It takes the limiter set because
  // 10.4's search bucket covers the picker read.
  app.use(
    '/api/v1',
    createReferencesRouter({ dbClient: options.dbClient, rateLimits }),
  )

  // "Referenced from" (issue #214): `GET /{tasks,folders,shelves,facets}/:id/backlinks`.
  // Each is two segments past its prefix with the literal `backlinks`, a path
  // no earlier router claims, so this mount is order-independent. It takes
  // the app origin so an absolute same-origin Dana Link counts as one.
  app.use(
    '/api/v1',
    createBacklinksRouter({
      dbClient: options.dbClient,
      ...(options.appOrigin === undefined ? {} : { appOrigin: options.appOrigin }),
    }),
  )

  /*
  7.27's Folder facets (issue #210). **Eleven** routes: nine under
  `/folders/:id/facets`, and `POST /facets/:id/restore` and
  `DELETE /trash/facets/:id`, which are 7.13's shape for the Trash pair.

  **Position is deliberate and is not load-bearing**, which is worth
  separating, exactly as the Label router's block above says of itself.
  Express matches whole paths, and nothing here is a whole path any earlier
  router claims: `/folders/:id` is one segment past the prefix and
  `/folders/:id/facets` is two; `/folders/:id/page` is a different literal
  from `/folders/:id/facets`; `/trash/facets/:id` differs from
  `/trash/tasks/:id` and `/trash/folders/:id` in its literal segment; and
  `/facets/:id/restore` meets nothing at all. So this would work anywhere
  ahead of the catch-all, and it is here because reading it after the
  workshop router -- which owns the Folder page these facets sit beside -- is
  how a person finds it.

  **The order *inside* the router is load-bearing**, and that file says so:
  `/folders/:id/facets/order` and `/folders/:id/facets/my-order` are
  registered ahead of `/folders/:id/facets/:facetId`, which would otherwise
  claim both.
  */
  app.use(
    '/api/v1',
    createFacetsRouter({ dbClient: options.dbClient, rateLimits, securityLog }),
  )

  // Consultation input rounds (issue #321): `/discussions/:id/input-rounds`
  // and `/input-rounds/:id...`. The literal `input-rounds` segment meets
  // nothing any other router claims, so this mount is order-independent.
  app.use(
    '/api/v1',
    createConsultationInputRouter({ dbClient: options.dbClient, rateLimits, securityLog }),
  )

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json(errorBody('not_found', 'Not found.'))
  })

  // Present only after a build; npm run dev serves the client from Vite
  // instead, proxying /api here.
  if (options.clientDist !== undefined) {
    const clientIndex = path.join(options.clientDist, 'index.html')
    app.use(express.static(options.clientDist))
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(clientIndex)
    })
  }

  app.use(createRequestErrorHandler(securityLog, errorTracker))

  return app
}

/*
Sign-in has exactly two doors: the Google handshake, which needs its three
secrets and this deployment's origin, and the development login, which needs
none of them. A process with neither can authenticate nobody, and until this
check existed it started anyway and answered /api/health with 200, so a deploy
carrying a typo in an environment variable went green and only the first person
to try signing in found out.

In production the count of doors is one, and the guard must say so: 11.6 makes the
development login absent from the compiled output regardless of environment
variables, so a production deploy carrying only DANA_DEV_LOGIN=1 used to
pass this check, boot, go green on its health check, 404 the door the flag
names and 500 the one it lacks the secrets for. That is the exact failure
the paragraph above says this guard exists to prevent, so under
NODE_ENV=production the Google trio is required unconditionally.

Refusing to start is the right failure because of what 11.5 already arranges:
the host keeps the old instance serving until the new one passes its health
check, so a boot that fails here cancels the deploy instead of replacing a
working sign-in with a broken one. The variables themselves are the module's
to interpret (11.10 keeps them the production path behind createApp's options);
this only asks whether a door that will actually exist is configured.
*/
function assertSignInIsPossible(): void {
  const production = process.env.NODE_ENV === 'production'
  if (!production && process.env.DANA_DEV_LOGIN === '1') return
  const missing = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'APP_ORIGIN',
  ].filter((name) => (process.env[name] ?? '') === '')
  if (missing.length === 0) return
  throw new Error(
    `sign-in is not configured: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} unset, and ${production ? 'a production build has no development login whatever DANA_DEV_LOGIN says (11.6)' : 'DANA_DEV_LOGIN is not enabled'}`,
  )
}

async function main(): Promise<void> {
  // Local development reads the gitignored .env that 11.11 names; production
  // and CI set real environment variables and ship no .env file.
  if (existsSync('.env')) {
    process.loadEnvFile()
  }

  // The direct Axiom destination is resolved only after the local .env has
  // loaded. Production already has these values in its process environment;
  // CI and ordinary local development omit them and keep the stdout-only
  // logger. A partial configuration never exposes the token and never removes
  // Render's stdout logs: it records the missing variable and stays local.
  const applicationLog = createApplicationLogger()
  const runtimeLogger = applicationLog.logger
  const runtimeBootLog = createSecurityLogger(runtimeLogger)
  if (applicationLog.axiom.state === 'enabled') {
    runtimeBootLog.operation('info', 'axiom_logging_configured', {
      configured: true,
    })
  } else if (applicationLog.axiom.state === 'incomplete') {
    runtimeBootLog.operation('warn', 'axiom_logging_incomplete', {
      configured: false,
      missing: applicationLog.axiom.missing,
    })
  }

  // Before the database, because a misconfigured deploy should fail on the
  // cheap check rather than after migrating.
  assertSignInIsPossible()

  // 11.10 scopes TEST_DATABASE_URL to the test suite, but the seam falls
  // back to it when no url is passed. Removing it from the boot's own
  // environment keeps a filled test variable from silently redirecting
  // npm run dev away from the .data directory it advertises.
  delete process.env.TEST_DATABASE_URL

  // 11.5: pending migrations apply at boot, before the health endpoint can
  // report ready. Listening starts only after they commit, so a failed
  // migration fails the deploy's health check and the old instance keeps
  // serving. The migrator takes no lock, which is safe exactly as long as
  // production is one instance with serial deploys (11.1); a second
  // instance would add boot-migration racing to 11.1's scale-out list.
  // While the dev server holds .data open, the db scripts (migrate, seed,
  // verify) must not target it concurrently: PGlite is single-connection
  // (11.15).
  /* Built before the pool rather than after it, which is the only reason this
     line moved: the seam reports a lost connection through a callback, and a
     tracker created afterwards could not be in it. */
  const errorTracker = createServerErrorTracker()

  const dbClient = await createDbClient({
    url: process.env.DATABASE_URL === '' ? undefined : process.env.DATABASE_URL,
    dataDir: '.data',
    /* Issue #174. Without this the seam writes one plain line to stderr, which
       is right for the suite and says nothing to alerting. The module beside
       this call carries the reasoning, including why the error a route sees is
       drizzle's rollback failure rather than the code recorded here. */
    onConnectionLost: (event) => {
      reportConnectionLost({ event, log: runtimeBootLog, tracker: errorTracker })
    },
  })
  await dbClient.runMigrations()
  runtimeBootLog.operation('info', 'migrations_applied', {
    database: dbClient.kind,
  })

  /* Issue #80. That line above is how the fallback was diagnosable at all, and
     it reads as neutral information: a production process on the embedded
     database looks exactly like a healthy one until the container restarts and
     everybody is signed out. The condition now says so in its own words, in a
     line of its own, and reaches Sentry; the module beside this call carries
     the reasoning, including why this is not a refusal to boot. The tracker is
     built above and handed to the application so the process holds one, rather
     than this line initialising Sentry a second time. */
  reportDatabaseFallback({
    kind: dbClient.kind,
    nodeEnv: process.env.NODE_ENV,
    log: runtimeBootLog,
    tracker: errorTracker,
  })
  // And from outside the container too, without Render's logs (11.12).
  recordDatabaseKind(dbClient.kind)

  // The existence check lives here rather than in createApp, which performs
  // no I/O (11.10). Absent means a source checkout that never built the
  // client; Vite serves it in development.
  const clientDist = path.resolve(process.cwd(), 'dist', 'client')
  const hasClientBuild = existsSync(path.join(clientDist, 'index.html'))

  const port = Number(process.env.PORT ?? 3000)
  const runtimeSecurityLog = createSecurityLogger(runtimeLogger)
  // One store instance for the whole process: the application serves and
  // deletes through it, and the scheduler's purge removes from it (11.7).
  const fileStore = defaultDiskStore()
  const app = createApp(
    hasClientBuild
      ? {
          dbClient,
          clientDist,
          securityLog: runtimeSecurityLog,
          fileStore,
          errorTracker,
          appOrigin: process.env.APP_ORIGIN,
        }
      : {
          dbClient,
          securityLog: runtimeSecurityLog,
          fileStore,
          errorTracker,
          appOrigin: process.env.APP_ORIGIN,
        },
  )

  /* Issue #6, and the only thing this middleware ever writes to the log. 10.5
     forbids a line per request and a redirect would not deserve one anyway;
     what a reader of Render's logs needs is whether the process is enforcing a
     canonical host and which one, which changes only at boot. Silence means
     APP_ORIGIN was unset, which in production `assertSignInIsPossible` has
     already refused to start on. The parse is the middleware's own, so this
     line cannot name a host the application is not in fact enforcing. */
  const canonical = canonicalOriginOf(process.env.APP_ORIGIN)
  if (canonical !== null) {
    runtimeBootLog.operation('info', 'canonical_host_enforced', {
      note: canonical.host,
    })
  }

  const server = app.listen(port, () => {
    runtimeBootLog.operation('info', 'server_listening', { port })
  })

  // 11.7's delivery loop, the only background execution in v1 (8.6) and the
  // one thing in this process that must still be working at 03:00. It is
  // started after listen rather than before, so a port that will not bind
  // fails the deploy without a pass having sent anything from an instance
  // that is about to die.
  //
  // The application's own notifier is what the pass sends through, rather
  // than a second construction: the sink of 11.10, when a caller injected
  // one, and the 11.8 transport otherwise, decided once above. A Notifier
  // satisfies the sink shape it is passed as, which is what makes one
  // decision serve both callers.
  //
  // Single instance, still (11.1): this interval assumes it, alongside the
  // in-memory rate limits, the boot migration run and the auth module's
  // pending authorizations. A second instance needs one elected tick owner.
  const scheduler = startReminderScheduler({
    dbClient,
    notifications: notifierOf(app),
    logger: runtimeLogger,
    heartbeatUrl: process.env.SCHEDULER_HEARTBEAT_URL,
    fileStore,
  })
  // Binding errors (port in use, no permission) fire on the server after
  // main() resolves, so they need their own route into the structured
  // boot-failed log; without it they surface as a raw uncaught exception.
  server.on('error', (err: Error) => {
    runtimeBootLog.operation('error', 'boot_failed', { reason: err.name })
    process.exit(1)
  })
  const shutdown = (): void => {
    // Before the server closes, so no tick starts against a database handle
    // that is on its way out. A pass already in flight finishes on its own.
    scheduler.stop()
    server.close(() => {
      void dbClient.close().finally(() => {
        process.exit(0)
      })
    })
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err: unknown) => {
    bootLog.operation('error', 'boot_failed', {
      reason: err instanceof Error ? err.name : 'unknown',
    })
    process.exit(1)
  })
}
