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
import { errorBody } from './http/errors.js'
import { attachNotifier, createNotifier, notifierOf } from './notify/index.js'
import type { NotificationSink } from './notify/index.js'
import { resolveEmailTransport } from './notify/resend.js'
import { createServerErrorTracker } from './observability/error-tracker.js'
import type { ErrorTracker } from './observability/error-tracker.js'
import { createApplicationLogger } from './observability/logger.js'
import { createRequestErrorHandler } from './observability/request-errors.js'
import { createDiskStore } from './files/store.js'
import type { ObjectStore } from './files/store.js'
import { createConnectionsRouter } from './routes/connections.js'
import { createEventsRouter } from './routes/events.js'
import { createFilesRouter } from './routes/files.js'
import { createFoldersRouter } from './routes/folders.js'
import { healthRouter } from './routes/health.js'
import { createInvitesRouter } from './routes/invites.js'
import { createTasksRouter } from './routes/tasks.js'
import { createTrashRouter } from './routes/trash.js'
import { createViewsRouter } from './routes/views.js'
import { createWorkshopRouter } from './routes/workshop.js'
import { startReminderScheduler } from './scheduler/index.js'
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
   * through the Resend transport P7 landed in notify/resend.ts in production.
   */
  notifications?: NotificationSink
  /** Privacy-safe structured log sink, injectable for AC-103. */
  securityLog?: SecurityLogger
  /** Error tracker seam used by AC-104; production resolves Sentry from env. */
  errorTracker?: ErrorTracker
  /** Explicit limiter set for focused tests. Production constructs its own. */
  rateLimits?: RateLimits
  /**
   * The S4 object store (files/store.ts), bytes behind one interface.
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
}

// createApp is synchronous, performs no I/O, and opens no database (11.10):
// everything a route needs arrives through options, already opened.
export function createApp(options: AppOptions = {}): express.Express {
  const app = express()
  app.disable('x-powered-by')
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
            },
          }
        : {},
    )
  const securityLog = options.securityLog ?? createSecurityLogger(logger)
  const errorTracker = options.errorTracker ?? createServerErrorTracker()
  const fileStore =
    options.fileStore ??
    createDiskStore(
      process.env.DANA_FILES_DIR !== undefined &&
        process.env.DANA_FILES_DIR !== ''
        ? process.env.DANA_FILES_DIR
        : path.join(os.tmpdir(), 'dana-files'),
    )
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
  // sink can replace its log transport. The call sites are the Collaboration
  // engineer's (7.4 share grant, 7.5 invites) and reach the instance through
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

  app.use(express.json())

  // The amended 7.0 bullet, ruled at the P1 merge and held at this
  // package's gate: a body that parses to something other than an object is
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

  app.use('/api/health', healthRouter)

  // The frozen /api/v1 surface. The 7.1 auth and account endpoints mount
  // first, by the request recorded in src/server/auth/README.md; later
  // packages add their routers here, and every one of them stays ahead of
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
    }),
  )

  // The P2 folders router, mounted by the request recorded in
  // src/server/routes/README.md: after the auth router, whose session
  // attachment then serves both, and ahead of the catch-all.
  app.use(
    '/api/v1',
    createFoldersRouter({ dbClient: options.dbClient, rateLimits, securityLog }),
  )

  // The P3 tasks router, by the request beside the folders one in that same
  // ledger: the 7.6, 7.7 and 7.8 surfaces. Same position and the same reason,
  // and its paths (/tasks, /steps) meet nothing the folders router claims, so
  // the pair is order-independent between themselves.
  app.use(
    '/api/v1',
    createTasksRouter({ dbClient: options.dbClient, rateLimits, securityLog }),
  )

  // The P4 views router, by the third request in that same ledger: the 7.10
  // read surface. Same position and the same reason. It shares the /folders
  // prefix with the folders router but no whole path with it, and Express
  // matches on the whole path, so that pair is order-independent too; every
  // endpoint on it is a GET, which 7.0 makes safe, so it takes no CSRF link.
  app.use('/api/v1', createViewsRouter({ dbClient: options.dbClient, rateLimits }))

  // The P5 invites and connections routers, by the fourth request in that same
  // ledger: the 7.5 invite surface with its five transitions and two lists, and
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

  // The S3 pair (RFC 0005): 7.12's events and notifications, and 7.13's
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
    createTrashRouter({ dbClient: options.dbClient, rateLimits }),
  )

  // The S4 files surface (7.15): uploads, authenticated serving, the
  // avatar. Same position as its S3 siblings; its paths meet nothing the
  // earlier routers claim.
  app.use(
    '/api/v1',
    createFilesRouter({ dbClient: options.dbClient, fileStore, rateLimits }),
  )

  // The S5 workshop (7.16): pages, shelves, and the object acts. Its
  // /tasks/:id/duplicate and /folders/:id/duplicate tails meet nothing the
  // earlier routers claim, Express matching whole paths.
  app.use(
    '/api/v1',
    createWorkshopRouter({ dbClient: options.dbClient, rateLimits }),
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

Refusing to start is the right failure because of what 11.5 already arranges:
the host keeps the old instance serving until the new one passes its health
check, so a boot that fails here cancels the deploy instead of replacing a
working sign-in with a broken one. The variables themselves are the module's
to interpret (11.10 keeps them the production path behind createApp's options);
this only asks whether one of the two doors is configured at all.
*/
function assertSignInIsPossible(): void {
  if (process.env.DANA_DEV_LOGIN === '1') return
  const missing = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'APP_ORIGIN',
  ].filter((name) => (process.env[name] ?? '') === '')
  if (missing.length === 0) return
  throw new Error(
    `sign-in is not configured: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} unset, and DANA_DEV_LOGIN is not enabled`,
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
  const dbClient = await createDbClient({
    url: process.env.DATABASE_URL === '' ? undefined : process.env.DATABASE_URL,
    dataDir: '.data',
  })
  await dbClient.runMigrations()
  runtimeBootLog.operation('info', 'migrations_applied', {
    database: dbClient.kind,
  })

  // The existence check lives here rather than in createApp, which performs
  // no I/O (11.10). Absent means a source checkout that never built the
  // client; Vite serves it in development.
  const clientDist = path.resolve(process.cwd(), 'dist', 'client')
  const hasClientBuild = existsSync(path.join(clientDist, 'index.html'))

  const port = Number(process.env.PORT ?? 3000)
  const runtimeSecurityLog = createSecurityLogger(runtimeLogger)
  const app = createApp(
    hasClientBuild
      ? { dbClient, clientDist, securityLog: runtimeSecurityLog }
      : { dbClient, securityLog: runtimeSecurityLog },
  )
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
