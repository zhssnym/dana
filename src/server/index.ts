import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import { pino } from 'pino'

import { createDbClient } from '../../db/client.js'
import type { DbClient } from '../../db/client.js'
import { attachSession, createAuthRouter, sessionOf } from './auth/index.js'
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
import { resolveObjectStore } from './files/store.js'
import type { ObjectStore } from './files/store.js'
import { createBundleRouter } from './routes/bundle.js'
import { createConnectionsRouter } from './routes/connections.js'
import { createConsultationInputRouter } from './routes/consultation-input.js'
import { createCoverPhotosRouter } from './routes/cover-photos.js'
import { createConversationRouter } from './routes/conversation.js'
import { createDirectMessagesRouter } from './routes/direct-messages.js'
import { createFeedbackRouter } from './routes/feedback.js'
import {
  CSP_REPORT_PATH,
  createCspReportRouter,
} from './routes/csp-report.js'
import { createEventsRouter } from './routes/events.js'
import { createExportRouter } from './routes/export.js'
import { createConsultationRouter } from './routes/consultation.js'
import { createFilesRouter } from './routes/files.js'
import { createFoldersRouter } from './routes/folders.js'
import { HEALTH_PATH, healthRouter, recordDatabaseKind } from './routes/health.js'
import { createInvitesRouter } from './routes/invites.js'
import { createLabelsRouter } from './routes/labels.js'
import { createReferencesRouter } from './routes/references.js'
import { createBacklinksRouter } from './routes/backlinks.js'
import { createTasksRouter } from './routes/tasks.js'
import { createStatsRouter } from './routes/stats.js'
import { createTrashRouter } from './routes/trash.js'
import { createViewsRouter } from './routes/views.js'
import { createWorkshopRouter } from './routes/workshop.js'
import { startReminderScheduler } from './scheduler/index.js'
import { originOf } from './security/csp-report.js'
import { removeEverySampleWorkspace } from './sample/workspace.js'
import { createRateLimits } from './security/rate-limit.js'
import type { RateLimits } from './security/rate-limit.js'
import { createSecurityLogger } from './security/log.js'
import type { SecurityLogger } from './security/log.js'

export const logger = pino()
const bootLog = createSecurityLogger(logger)

export type { AuthConfig }

export interface AppOptions {
  /** Routes that need the database fail when called without it, never at construction. */
  dbClient?: DbClient
  auth?: AuthConfig
  /** When present, every outbound message goes here instead of being logged or sent. */
  notifications?: NotificationSink
  securityLog?: SecurityLogger
  errorTracker?: ErrorTracker
  rateLimits?: RateLimits
  /** Absent: a disk store over DANA_FILES_DIR or the OS temp dir. */
  fileStore?: ObjectStore
  /** Built client directory; main() checks it exists because createApp does no I/O. */
  clientDist?: string
  /**
   * The canonical origin; other hosts redirect to it. Passed in, not read from
   * env, so a test harness that sets APP_ORIGIN is not redirected.
   */
  appOrigin?: string
}

/** Test default. main() passes resolveObjectStore() (R2 in production) instead. */
function defaultDiskStore(): ObjectStore {
  return createDiskStore(
    process.env.DANA_FILES_DIR !== undefined && process.env.DANA_FILES_DIR !== ''
      ? process.env.DANA_FILES_DIR
      : path.join(os.tmpdir(), 'dana-files'),
  )
}

/*
CSP hash of the inline theme script in index.html. Recompute it whenever
that script changes, or the policy blocks it and the theme flashes on load.
The hash depends on LF line endings (.gitattributes).
*/
const THEME_SCRIPT_HASH = 'sha256-Dj3RFqRnuo6lgqd0HI36Wj2p9AqPZv5+ymGddn+OUjw='

// createApp is synchronous and does no I/O (11.10): everything arrives through options.
export function createApp(options: AppOptions = {}): express.Express {
  const app = express()
  app.disable('x-powered-by')

  /*
  Exactly one proxy hop (Render's edge), never `true`. Without it req.ip is the
  edge for everyone and per-address rate limits become one global bucket; `true`
  would trust the client-written X-Forwarded-For. Add 1 per extra proxy hop.
  */
  app.set('trust proxy', 1)

  /*
  Mounted first: a request for a foreign host is redirected before it spends a
  limiter or touches a session. Health is exempt because Render probes the
  non-canonical hostname, and a 301 there fails the deploy.
  */
  const canonicalHost = canonicalHostRedirect({
    appOrigin: options.appOrigin,
    exempt: [HEALTH_PATH],
  })
  if (canonicalHost !== null) app.use(canonicalHost)

  /*
  Security headers go on every response. CSP widenings past 'self':
  - style-src 'unsafe-inline': React style attributes carry runtime data.
  - img-src data: blob: (Vite-inlined assets, avatar crop, upload previews) and
    googleusercontent.com (the Google account picture).
  - media-src blob:: voice notes play back before upload.
  - connect-src data: (the crop fetches a data: URL) and sentry.io (client errors).
  - script-src hash: the inline theme script; see THEME_SCRIPT_HASH.
  Both report-uri and report-to are set because browsers support different ones.
  CSP is not applied by `npm run dev` (Vite serves the page), so test new
  sources against a production build.
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
        "frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.openstreetmap.org; " +
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
              // Auth tests sign in many times from one address.
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

  // One notifier for the app and the scheduler. The routes reach it through
  // notifierOf(app); the 11.10 sink, when given, replaces the transport.
  attachNotifier(
    app,
    createNotifier({
      sink: options.notifications,
      transport: resolveEmailTransport({ logger: notifyLogger }),
      logger: notifyLogger,
    }),
  )

  /*
  Mounted before express.json and the non-object body guard: CSP reports need
  their own 16 KB cap and content types, and the Reporting API sends an array,
  which the guard below would refuse.
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

  // 3 MB: above the largest legal workflow import, so the 10.3 caps can apply.
  app.use(express.json({ limit: 3 * 1024 * 1024 }))

  // 7.0: a JSON body that is not an object is malformed (the parser lets arrays
  // through). undefined means no JSON body.
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
  Mount order matters in one place: createViewsRouter must stay ahead of
  createBundleRouter, whose `GET /views/:id` would swallow the literal
  `/views/my-day` etc. pages. No test catches a swap.
  */

  app.use(
    '/api/v1',
    createAuthRouter({
      dbClient: options.dbClient,
      auth: options.auth,
      rateLimits,
      securityLog,
      // DELETE /me removes the account's files after commit (8.10 step 6a).
      fileStore,
    }),
  )

  app.use(
    '/api/v1',
    createFoldersRouter({ dbClient: options.dbClient, rateLimits, securityLog }),
  )

  app.use(
    '/api/v1',
    createTasksRouter({ dbClient: options.dbClient, rateLimits, securityLog, fileStore }),
  )

  app.use(
    '/api/v1',
    createLabelsRouter({ dbClient: options.dbClient, rateLimits, securityLog }),
  )

  // Must stay ahead of the bundle router (see above).
  app.use('/api/v1', createViewsRouter({ dbClient: options.dbClient, rateLimits, securityLog }))

  app.use(
    '/api/v1',
    createInvitesRouter({ dbClient: options.dbClient, rateLimits, securityLog }),
  )
  app.use(
    '/api/v1',
    createConnectionsRouter({ dbClient: options.dbClient, rateLimits }),
  )

  app.use(
    '/api/v1',
    createEventsRouter({ dbClient: options.dbClient, rateLimits }),
  )
  app.use(
    '/api/v1',
    createTrashRouter({ dbClient: options.dbClient, rateLimits, fileStore }),
  )

  app.use(
    '/api/v1',
    createFilesRouter({
      dbClient: options.dbClient,
      fileStore,
      rateLimits,
      securityLog,
    }),
  )

  // Openverse search is proxied so the CSP never widens; see routes/cover-photos.ts.
  app.use(
    '/api/v1',
    createCoverPhotosRouter({
      dbClient: options.dbClient,
      fileStore,
      rateLimits,
      securityLog,
    }),
  )

  app.use(
    '/api/v1',
    createWorkshopRouter({
      dbClient: options.dbClient,
      rateLimits,
      fileStore,
      securityLog,
    }),
  )

  app.use(
    '/api/v1',
    createConversationRouter({
      dbClient: options.dbClient,
      rateLimits,
      securityLog,
    }),
  )

  app.use('/api/v1', createDirectMessagesRouter({ dbClient: options.dbClient, rateLimits, securityLog }))
  app.use('/api/v1', createFeedbackRouter({ dbClient: options.dbClient, rateLimits, securityLog }))

  // Must stay behind the views router (see above).
  app.use(
    '/api/v1',
    createBundleRouter({
      dbClient: options.dbClient,
      rateLimits,
      fileStore,
      securityLog,
    }),
  )

  app.use(
    '/api/v1',
    createExportRouter({ dbClient: options.dbClient, rateLimits, securityLog }),
  )

  app.use('/api/v1', createStatsRouter({ dbClient: options.dbClient }))

  app.use(
    '/api/v1',
    createReferencesRouter({ dbClient: options.dbClient, rateLimits }),
  )

  app.use(
    '/api/v1',
    createBacklinksRouter({
      dbClient: options.dbClient,
      ...(options.appOrigin === undefined ? {} : { appOrigin: options.appOrigin }),
    }),
  )

  app.use(
    '/api/v1',
    createConsultationInputRouter({ dbClient: options.dbClient, rateLimits, securityLog }),
  )

  app.use(
    '/api/v1',
    createConsultationRouter({
      dbClient: options.dbClient,
      rateLimits,
      securityLog,
      fileStore,
    }),
  )

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json(errorBody('not_found', 'Not found.'))
  })

  // Present only after a build; npm run dev serves the client from Vite.
  if (options.clientDist !== undefined) {
    const clientIndex = path.join(options.clientDist, 'index.html')
    /*
    AC-956: a signed-in visit to bare / redirects to /app before the page is
    sent. no-store so the 302 is not cached past sign-out; a failed session
    lookup serves the page, because / is public.
    */
    if (options.dbClient !== undefined) {
      const attach = attachSession(options.dbClient.db)
      app.get('/', (req: Request, res: Response, next: NextFunction) => {
        if (req.originalUrl !== '/') {
          next()
          return
        }
        attach(req, res, (error?: unknown) => {
          if (error === undefined && sessionOf(req) !== undefined) {
            res.set('Cache-Control', 'no-store').redirect(302, '/app')
            return
          }
          next()
        })
      })
    }
    app.use(express.static(options.clientDist))
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(clientIndex)
    })
  }

  app.use(createRequestErrorHandler(securityLog, errorTracker))

  return app
}

/*
Refuse to boot without a working sign-in, so a misconfigured deploy fails its
health check and the old instance keeps serving. Production has no dev login
(11.6), so it always needs the Google settings.
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
  // Local development reads .env; production and CI use real environment variables.
  if (existsSync('.env')) {
    process.loadEnvFile()
  }

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

  // Before the database: fail on the cheap check before migrating.
  assertSignInIsPossible()

  // The db seam falls back to TEST_DATABASE_URL; keep it from redirecting npm run dev.
  delete process.env.TEST_DATABASE_URL

  // Migrations apply before listening, so a failed one fails the health check
  // (11.5). The migrator takes no lock: this assumes one instance (11.1).
  // The tracker exists before the pool so it can receive onConnectionLost.
  const errorTracker = createServerErrorTracker()

  const dbClient = await createDbClient({
    url: process.env.DATABASE_URL === '' ? undefined : process.env.DATABASE_URL,
    dataDir: '.data',
    onConnectionLost: (event) => {
      reportConnectionLost({ event, log: runtimeBootLog, tracker: errorTracker })
    },
  })
  await dbClient.runMigrations()
  runtimeBootLog.operation('info', 'migrations_applied', {
    database: dbClient.kind,
  })

  reportDatabaseFallback({
    kind: dbClient.kind,
    nodeEnv: process.env.NODE_ENV,
    log: runtimeBootLog,
    tracker: errorTracker,
  })
  recordDatabaseKind(dbClient.kind)

  const clientDist = path.resolve(process.cwd(), 'dist', 'client')
  const hasClientBuild = existsSync(path.join(clientDist, 'index.html'))

  const port = Number(process.env.PORT ?? 3000)
  const runtimeSecurityLog = createSecurityLogger(runtimeLogger)
  // One store for the app and the scheduler's purge (11.7).
  const fileStore = resolveObjectStore()
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

  const canonical = canonicalOriginOf(process.env.APP_ORIGIN)
  if (canonical !== null) {
    runtimeBootLog.operation('info', 'canonical_host_enforced', {
      note: canonical.host,
    })
  }

  const server = app.listen(port, () => {
    runtimeBootLog.operation('info', 'server_listening', { port })
  })

  // One-time cleanup of the retired sample workspace (7.20). Remove with src/server/sample/.
  void removeEverySampleWorkspace(dbClient.db, fileStore).then(
    (count) => {
      if (count > 0) runtimeBootLog.operation('info', 'sample_workspaces_removed', { count })
    },
    (err: Error) => {
      runtimeBootLog.operation('error', 'sample_workspaces_removal_failed', { reason: err.name })
    },
  )

  // Started after listen, so a port that will not bind fails the deploy before
  // a pass sends anything. Assumes a single instance (11.1).
  const scheduler = startReminderScheduler({
    dbClient,
    notifications: notifierOf(app),
    logger: runtimeLogger,
    heartbeatUrl: process.env.SCHEDULER_HEARTBEAT_URL,
    fileStore,
  })
  // Binding errors fire after main() resolves, so they need their own handler.
  server.on('error', (err: Error) => {
    runtimeBootLog.operation('error', 'boot_failed', { reason: err.name })
    process.exit(1)
  })
  const shutdown = (): void => {
    // Stop the scheduler first, so no tick starts against a closing database.
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

/* Loggable boot failure (10.5 forbids messages): the SQLSTATE, or for a
   migration self-check `step N: <words>`, the words without the id after them. */
function bootFailure(err: unknown): { reason: string; note?: string } {
  const db = err instanceof Error && err.cause instanceof Error ? err.cause : err
  const code: unknown =
    typeof db === 'object' && db !== null ? (db as { code?: unknown }).code : undefined
  const reason =
    typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)
      ? `sqlstate_${code}`
      : err instanceof Error
        ? err.name
        : 'unknown'
  const check = db instanceof Error ? /^step (\d+): (.*)$/s.exec(db.message) : null
  if (check === null) return { reason }
  const words: string[] = []
  for (const word of (check[2] ?? '').split(' ')) {
    if (!/^[a-z]+$/.test(word)) break
    words.push(word)
  }
  return { reason, note: `Migration check failed, step ${check[1]}: ${words.join(' ')}` }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err: unknown) => {
    bootLog.operation('error', 'boot_failed', bootFailure(err))
    process.exit(1)
  })
}
