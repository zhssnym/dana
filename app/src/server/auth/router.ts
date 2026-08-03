/*
The 7.1 auth and account surface, mounted by the boot file under /api/v1.

The handshake, in the order 11.6 fixes it:

  GET  /auth/google           state, nonce, PKCE S256, tz into the pending
                              record, redirect to the issuer
  GET  /auth/google/callback  validate all three single-use, refuse an
                              unverified email with the 9.2 page, provision or
                              adopt, sync the zone, issue a fresh session
  POST /auth/logout           destroy this session, not the person's others
  GET/PATCH/DELETE /me        the account endpoints, behind session then CSRF

Three rules run through every handler here.

**Nothing the request carries can move a redirect.** The authorization URL
comes from the configured issuer and the redirect_uri from the configured
origin, so a crafted Host, X-Forwarded-Host, or return parameter changes
neither. The callback URL handed to openid-client is rebuilt the same way,
which also keeps the redirect_uri in the token exchange identical to the one
in the authorization request (the library derives it from that URL).

**No Google token is ever written.** The access, refresh, and ID tokens exist
as locals inside the callback and are never stored, logged, or put in a
cookie; what survives the callback is a user id and the claims that 7.1 names.

**A refusal is a page, not an envelope.** The callback is a redirect target a
browser lands on, so the 7.0 JSON envelope would arrive as text on a blank
screen. The account endpoints, which clients call, use the envelope.
*/
import { Router } from 'express'
import type { Request, Response } from 'express'
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from 'openid-client'

import type { Db, DbClient } from '../../../db/client.js'
import { deleteMeBody } from '../../shared/me.js'
import { isIanaTimezone } from '../../shared/timezone.js'
import { sendError, sendValidationError } from '../http/errors.js'
import {
  handleDeleteMe,
  handleGetMe,
  handlePatchMe,
} from './account.js'
import {
  PENDING_COOKIE,
  clearPendingCookie,
  clearSessionCookies,
  readCookie,
  setPendingCookie,
  setSessionCookies,
} from './cookies.js'
import { attachSession, requireCsrf, requireSession, sessionOf } from './middleware.js'
import { OidcClient, authConfigFromEnvironment, callbackUrl } from './oidc.js'
import type { AuthConfig } from './oidc.js'
import { signInFailedPage, unverifiedEmailPage } from './pages.js'
import { PendingAuthorizations } from './pending.js'
import { provisionUser, syncTimezone } from './provisioning.js'
import type { GoogleIdentity } from './provisioning.js'
import { createSession, destroySession } from './sessions.js'
import { csrfTokenFor, newSessionToken } from './tokens.js'

export interface AuthRouterOptions {
  dbClient?: DbClient
  auth?: AuthConfig
}

/*
Built at runtime from pieces so no resolvable import names the module. 11.15
records why: tsc emits a tsconfig-excluded file whenever any import can be
resolved to it, a literal dynamic import() included, and tsconfig.build.json
excludes exactly this path. The loader treats a failed load as the route not
existing, which is what a production build produces.
*/
const DEV_LOGIN_SPECIFIER = ['./dev', 'login.js'].join('-')

interface DevLoginModule {
  handleDevLogin(
    db: Db,
    req: Request,
    res: Response,
    establish: (res: Response, userId: string) => Promise<void>,
  ): Promise<void>
}

/** Issues a fresh identifier, stores its digest, and sets both cookies. */
export async function establishSession(
  db: Db,
  res: Response,
  userId: string,
): Promise<void> {
  const token = newSessionToken()
  await createSession(db, userId, token)
  setSessionCookies(res, token, csrfTokenFor(token))
}

function refuse(res: Response, status: number, page: string): void {
  clearPendingCookie(res)
  res.status(status).type('html').send(page)
}

export function createAuthRouter(options: AuthRouterOptions = {}): Router {
  const router = Router()
  const pending = new PendingAuthorizations()

  // Configuration is resolved once per application, and lazily: an
  // application constructed without auth configuration (the AC-114 probe, a
  // health-only boot) must still build, and only a request that needs the
  // issuer may fail.
  let client: OidcClient | undefined
  const oidc = (): OidcClient => {
    client ??= new OidcClient(options.auth ?? authConfigFromEnvironment())
    return client
  }

  /*
   * 11.10: routes that touch the database require options.dbClient and fail
   * only when called without it, which is what lets a route-presence probe
   * construct the application bare.
   */
  const database = (res: Response): Db | null => {
    if (options.dbClient === undefined) {
      sendError(
        res,
        500,
        'internal_error',
        'The application was constructed without a database.',
      )
      return null
    }
    return options.dbClient.db
  }

  if (options.dbClient !== undefined) {
    router.use(attachSession(options.dbClient.db))
  }

  /* ---------------------------------------------------------------- *
   * The handshake
   * ---------------------------------------------------------------- */

  router.get('/auth/google', async (req: Request, res: Response) => {
    const config = oidc()
    const configuration = await config.configure()

    // 7.1: an unparseable zone is treated as absent rather than answered 422,
    // a deliberate deviation from the 10.3 rule so a stale zone database can
    // never lock anyone out of sign-in.
    const reported = req.query.tz
    const timezone =
      typeof reported === 'string' && isIanaTimezone(reported) ? reported : undefined

    const state = randomState()
    const nonce = randomNonce()
    const codeVerifier = randomPKCECodeVerifier()
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier)

    // The zone rides the pending record and nothing else: never redirect_uri,
    // never any redirect target (7.1, 11.6).
    const id = pending.create({ state, nonce, codeVerifier, timezone })
    setPendingCookie(res, id)

    const authorizationUrl = buildAuthorizationUrl(configuration, {
      redirect_uri: callbackUrl(config.config),
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })
    res.redirect(302, authorizationUrl.toString())
  })

  router.get('/auth/google/callback', async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return

    // Single use, and bound to this browser: the record is reachable only
    // through the cookie the authorization request set (AC-105).
    const record = pending.take(readCookie(req, PENDING_COOKIE))
    if (record === undefined) {
      refuse(res, 400, signInFailedPage())
      return
    }

    const config = oidc()
    const configuration = await config.configure()

    // The provider's own refusal path, which every cancelled consent screen
    // walks: answered as a refusal, never as a 500.
    if (typeof req.query.error === 'string') {
      refuse(res, 400, signInFailedPage())
      return
    }

    // Rebuilt from configuration, never from the request's Host: this is both
    // the AC-109 guard and what keeps the redirect_uri in the token exchange
    // identical to the authorization request's.
    const currentUrl = new URL(callbackUrl(config.config))
    currentUrl.search = new URL(req.originalUrl, config.config.appOrigin).search

    let claims: Record<string, unknown>
    try {
      const tokens = await authorizationCodeGrant(configuration, currentUrl, {
        expectedState: record.state,
        expectedNonce: record.nonce,
        pkceCodeVerifier: record.codeVerifier,
      })
      const verified = tokens.claims()
      if (verified === undefined) {
        refuse(res, 400, signInFailedPage())
        return
      }
      claims = verified as unknown as Record<string, unknown>
    } catch {
      // A wrong state, a mismatched nonce, a bad signature, an expired or
      // foreign token: all one outcome, and none of them a 5xx, because every
      // one of them is attacker-reachable input.
      refuse(res, 400, signInFailedPage())
      return
    }

    const sub = typeof claims.sub === 'string' ? claims.sub : undefined
    const email = typeof claims.email === 'string' ? claims.email : undefined
    if (sub === undefined || email === undefined) {
      refuse(res, 400, signInFailedPage())
      return
    }
    // 7.1 and 10.1: an unverified email is refused with the 9.2 page, and no
    // rows are created.
    if (claims.email_verified !== true) {
      refuse(res, 403, unverifiedEmailPage())
      return
    }

    const identity: GoogleIdentity = {
      sub,
      email,
      displayName: typeof claims.name === 'string' ? claims.name : null,
      avatarUrl: typeof claims.picture === 'string' ? claims.picture : null,
    }

    const user = await provisionUser(db, identity, record.timezone)
    await syncTimezone(db, user, record.timezone)
    await establishSession(db, res, user.id)
    clearPendingCookie(res)

    // Into the app, on this origin by construction (7.1, AC-109).
    res.redirect(303, '/')
  })

  router.post(
    '/auth/logout',
    requireSession,
    requireCsrf,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const session = sessionOf(req)
      if (session !== undefined) {
        // One session. 10.1 draws the singular against account deletion's
        // plural, so signing out here must not touch the person's other
        // clients.
        await destroySession(db, session.token)
      }
      clearSessionCookies(res)
      res.status(204).end()
    },
  )

  /* ---------------------------------------------------------------- *
   * The account endpoints
   * ---------------------------------------------------------------- */

  router.get('/me', requireSession, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    await handleGetMe(db, sessionOf(req)?.userId ?? '', res)
  })

  router.patch(
    '/me',
    requireSession,
    requireCsrf,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      await handlePatchMe(db, sessionOf(req)?.userId ?? '', req, res)
    },
  )

  router.delete(
    '/me',
    requireSession,
    requireCsrf,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      // 7.1: the literal confirm string, else 422 naming the field.
      const parsed = deleteMeBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      await handleDeleteMe(db, sessionOf(req)?.userId ?? '', res)
    },
  )

  /* ---------------------------------------------------------------- *
   * The development login (11.6)
   * ---------------------------------------------------------------- */

  // Read at createApp() call time, never at module load (11.6), which is what
  // lets one process construct applications with and without it.
  if (process.env.DANA_DEV_LOGIN === '1') {
    router.post('/auth/dev-login', async (req: Request, res: Response) => {
      let module: DevLoginModule
      try {
        module = (await import(DEV_LOGIN_SPECIFIER)) as DevLoginModule
      } catch {
        // A production build excludes the module, so the load fails and the
        // route does not exist, whatever the environment variable says.
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const db = database(res)
      if (db === null) return
      await module.handleDevLogin(db, req, res, (target, userId) =>
        establishSession(db, target, userId),
      )
    })
  }

  return router
}

/** Re-exported so the boot file's scheduler wiring has one import (11.7). */
export { pruneExpiredSessions } from './sessions.js'
