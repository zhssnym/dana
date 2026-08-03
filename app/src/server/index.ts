import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { DrizzleQueryError } from 'drizzle-orm'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import { pino } from 'pino'

import { createDbClient } from '../../db/client.js'
import type { DbClient } from '../../db/client.js'
import { createAuthRouter } from './auth/index.js'
import type { AuthConfig } from './auth/index.js'
import { errorBody } from './http/errors.js'
import { healthRouter } from './routes/health.js'

export const logger = pino()

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
   * Directory of the built client, present only after npm run build. The
   * boot path performs the existence check and passes the result, because
   * createApp itself performs no I/O (11.10).
   */
  clientDist?: string
}

/*
A stack safe to log, which a raw one is not once a database is behind the API.
Drizzle wraps every failed statement in an error whose message embeds the SQL
and its bound parameters, and Error.stack begins with that message: verified
here against the installed version, a failed insert put the invite email
address it was carrying straight into err.stack. Section 10.5 names invite
email addresses, tokens, and session identifiers as things Dana never logs, so
the wrapper's message is dropped and its frames, which say where the failure
happened, are kept. Other errors keep their message, which carries no
parameters.

The acceptance harness documents the same wrapper for its own reasons
(app/tests/helpers.ts). P9 folds this into the single 10.5 policy module that
all emission passes through; until then this is the one place the boot file
turns an error into a log line.
*/
function safeStack(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined
  const stack = err.stack ?? ''
  const carriesQuery =
    err instanceof DrizzleQueryError || err.message.startsWith('Failed query: ')
  if (!carriesQuery) return stack
  const frames = stack.indexOf('\n    at ')
  return frames === -1 ? err.name : `${err.name}${stack.slice(frames)}`
}

// createApp is synchronous, performs no I/O, and opens no database (11.10):
// everything a route needs arrives through options, already opened.
export function createApp(options: AppOptions = {}): express.Express {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json())

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
    createAuthRouter({ dbClient: options.dbClient, auth: options.auth }),
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

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const status =
      typeof err === 'object' &&
      err !== null &&
      'status' in err &&
      typeof err.status === 'number'
        ? err.status
        : 500
    // Only method, path, and status: request bodies and headers may carry
    // fields the 10.5 never-log list forbids, and req.path excludes the query
    // string, which on the auth callback carries the code and state.
    if (status >= 500) {
      logger.error(
        { method: req.method, path: req.path, status, stack: safeStack(err) },
        'request failed',
      )
      res.status(status).json(errorBody('internal_error', 'Something went wrong.'))
      return
    }
    const message = status === 400 ? 'Malformed request body.' : 'Request failed.'
    res.status(status).json(errorBody('bad_request', message))
  })

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
  logger.info({ database: dbClient.kind }, 'migrations applied')

  // The existence check lives here rather than in createApp, which performs
  // no I/O (11.10). Absent means a source checkout that never built the
  // client; Vite serves it in development.
  const clientDist = path.resolve(process.cwd(), 'dist', 'client')
  const hasClientBuild = existsSync(path.join(clientDist, 'index.html'))

  const port = Number(process.env.PORT ?? 3000)
  const app = createApp(
    hasClientBuild ? { dbClient, clientDist } : { dbClient },
  )
  const server = app.listen(port, () => {
    logger.info({ port }, 'dana listening')
  })
  // Binding errors (port in use, no permission) fire on the server after
  // main() resolves, so they need their own route into the structured
  // boot-failed log; without it they surface as a raw uncaught exception.
  server.on('error', (err: Error) => {
    logger.error({ stack: err.stack }, 'boot failed')
    process.exit(1)
  })
  const shutdown = (): void => {
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
    const stack = err instanceof Error ? err.stack : String(err)
    logger.error({ stack }, 'boot failed')
    process.exit(1)
  })
}
