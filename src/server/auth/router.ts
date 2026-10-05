/*
The 7.1 auth and account routes. Rules for every handler:
- Nothing in the request can move a redirect: the authorization URL, the
  redirect_uri and the callback URL all come from configuration.
- Google tokens are never stored, logged or put in a cookie.
- Callback refusals answer a browser: the two 9.2 pages, or the landing page
  with a marker. Only the account endpoints use the JSON envelope.
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
import { ownedSharedFolders } from '../domain/folders.js'
import type { ObjectStore } from '../files/store.js'
import { sendError } from '../http/errors.js'
import { parseBody } from '../http/parse-body.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'
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
import {
  SIGN_IN_FAILED_TARGET,
  emailAlreadyClaimedPage,
  unverifiedEmailPage,
} from './pages.js'
import { PendingAuthorizations } from './pending.js'
import {
  EmailAlreadyClaimedError,
  emailStanding,
  isEmailCollision,
  provisionUser,
  syncTimezone,
} from './provisioning.js'
import type { GoogleIdentity } from './provisioning.js'
import { createSession, destroySession } from './sessions.js'
import { csrfTokenFor, newSessionToken } from './tokens.js'

export interface AuthRouterOptions {
  dbClient?: DbClient
  auth?: AuthConfig
  rateLimits?: RateLimits
  securityLog?: SecurityLogger
  /** DELETE /me removes the account's stored objects after the 8.10 transaction commits. */
  fileStore?: ObjectStore
  /** 7.20: write the sample workspace at a new account's first sign-in. */
  sampleWorkspace?: boolean
}

/*
Built from pieces so no import resolves to the module: tsc would otherwise emit
the file tsconfig.build.json excludes (11.15). A failed load means no route.
*/
const DEV_LOGIN_SPECIFIER = ['./dev', 'login.js'].join('-')

interface DevLoginModule {
  handleDevLogin(
    db: Db,
    req: Request,
    res: Response,
    establish: (res: Response, userId: string) => Promise<void>,
    sampleDefault?: boolean,
  ): Promise<void>
}

// Column bounds (4.1, 10.3) for Google's claims.
const MAX_EMAIL = 320
const MAX_DISPLAY_NAME = 200
const MAX_AVATAR_URL = 2000

function clamp(value: unknown, limit: number): string | null {
  if (typeof value !== 'string' || value === '') return null
  return value.length <= limit ? value : value.slice(0, limit)
}

export async function establishSession(
  db: Db,
  res: Response,
  userId: string,
): Promise<void> {
  const token = newSessionToken()
  await createSession(db, userId, token)
  setSessionCookies(res, token, csrfTokenFor(token))
}

/** The two 9.2 pages, both 403. Neither establishes anything. */
function refuseUnverified(res: Response): void {
  clearPendingCookie(res)
  res.status(403).type('html').send(unverifiedEmailPage())
}

function refuseClaimedEmail(res: Response): void {
  clearPendingCookie(res)
  res.status(403).type('html').send(emailAlreadyClaimedPage())
}

/** Every other refusal: back to the landing page with a marker. */
function refuse(res: Response): void {
  clearPendingCookie(res)
  res.redirect(303, SIGN_IN_FAILED_TARGET)
}

export function createAuthRouter(options: AuthRouterOptions = {}): Router {
  const router = Router()
  const pending = new PendingAuthorizations()
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)
  /* Keyed on the caller's address: there is no session yet. Per-client only
     because of the single trusted proxy hop (index.ts). */
  const signInBeginLimit = optionalLimit(options.rateLimits?.signInBegins)
  const signInCallbackLimit = optionalLimit(options.rateLimits?.signInCallbacks)
  const securityLog = options.securityLog ?? createSecurityLogger()

  // Resolved lazily, so an app built without auth config still builds.
  let client: OidcClient | undefined
  const oidc = (): OidcClient => {
    client ??= new OidcClient(options.auth ?? authConfigFromEnvironment())
    return client
  }

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

  router.get('/auth/google', signInBeginLimit, async (req: Request, res: Response) => {
    const config = oidc()
    const configuration = await config.configure()

    // 7.1: an unparseable zone is ignored, not 422, so sign-in never locks anyone out.
    const reported = req.query.tz
    const timezone =
      typeof reported === 'string' && isIanaTimezone(reported) ? reported : undefined

    const state = randomState()
    const nonce = randomNonce()
    const codeVerifier = randomPKCECodeVerifier()
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier)

    // The zone rides only the pending record, never a redirect target (7.1, 11.6).
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

  router.get('/auth/google/callback', signInCallbackLimit, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return

    // Single use and bound to this browser through the pending cookie (AC-105).
    const record = pending.take(readCookie(req, PENDING_COOKIE))
    if (record === undefined) {
      refuse(res)
      return
    }

    const config = oidc()
    const configuration = await config.configure()

    // A cancelled consent screen arrives as `error`: a refusal, not a 500.
    if (typeof req.query.error === 'string') {
      refuse(res)
      return
    }

    // Rebuilt from configuration, never from Host (AC-109); it also keeps the
    // token exchange's redirect_uri identical to the authorization request's.
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
        refuse(res)
        return
      }
      claims = verified as unknown as Record<string, unknown>
    } catch {
      // All one outcome and never a 5xx: every case is attacker-reachable input.
      refuse(res)
      return
    }

    const sub = typeof claims.sub === 'string' ? claims.sub : undefined
    const email = typeof claims.email === 'string' ? claims.email : undefined
    if (sub === undefined || email === undefined) {
      refuse(res)
      return
    }
    // An unverified email gets the 9.2 page and creates no rows.
    if (claims.email_verified !== true) {
      refuseUnverified(res)
      return
    }
    // An email cannot be trimmed to fit like a display name, so refuse.
    if (email.length > MAX_EMAIL) {
      refuse(res)
      return
    }

    const identity: GoogleIdentity = {
      sub,
      email,
      // Clamped: long Google profiles must not fail sign-in on a CHECK. Both are cosmetic.
      displayName: clamp(claims.name, MAX_DISPLAY_NAME),
      avatarUrl: clamp(claims.picture, MAX_AVATAR_URL),
    }

    let user
    try {
      user = await provisionUser(db, identity, record.timezone, {
        sample: options.sampleWorkspace === true,
      })
      await syncTimezone(db, user, record.timezone)
    } catch (error) {
      /*
      Provisioning rolled back (AC-005). An email already held by another live
      account gets the claimed-email page; Dana never joins the two (10.1). The
      re-read below also catches two new subjects racing for one address, which
      surfaces as a unique violation, without reading driver error text.
      */
      const claimed =
        error instanceof EmailAlreadyClaimedError ||
        // Same predicate as inside the transaction, so both apply one rule.
        isEmailCollision(
          // A failed re-read means "not a collision", never a 500 before sign-up.
          await emailStanding(db, identity).catch(() => ({
            subjectKnown: false,
            addressClaimed: false,
          })),
        )
      if (claimed) {
        securityLog.authEvent('sign_in_failed', { reason: 'email_already_claimed' })
        refuseClaimedEmail(res)
        return
      }
      securityLog.authEvent('sign_in_failed', { reason: 'provisioning_failed' })
      refuse(res)
      return
    }

    await establishSession(db, res, user.id)
    clearPendingCookie(res)
    securityLog.authEvent('sign_in', {
      userId: user.id,
      provisioned: user.created,
    })

    // Into the app (10.6), on this origin by construction (AC-109).
    res.redirect(303, '/app')
  })

  router.post(
    '/auth/logout',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const session = sessionOf(req)
      if (session !== undefined) {
        // Only this session: other clients stay signed in (10.1).
        await destroySession(db, session.token)
        securityLog.authEvent('sign_out', { userId: session.userId })
      }
      clearSessionCookies(res)
      res.status(204).end()
    },
  )

  router.get('/me', requireSession, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    await handleGetMe(db, sessionOf(req)?.userId ?? '', res)
  })

  router.patch(
    '/me',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      await handlePatchMe(db, sessionOf(req)?.userId ?? '', req, res, securityLog)
    },
  )

  router.delete(
    '/me',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const parsed = parseBody(deleteMeBody, req, res, securityLog)
      if (parsed === null) return
      const userId = sessionOf(req)?.userId ?? ''
      /*
      Owned shared folders must be transferred or deleted first: no silent
      succession on the interactive path (#228). The 409 lists them and whether
      each has an eligible successor. deleteAccountData keeps the automatic
      transfer for a future forced-removal path; nothing reaches it from here.
      */
      const blocking = await ownedSharedFolders(db, userId)
      if (blocking.length > 0) {
        sendError(
          res,
          409,
          'conflict',
          `Transfer ownership of ${String(blocking.length)} shared folder${blocking.length === 1 ? '' : 's'} before deleting your account: ${blocking
            .map(
              (folder) =>
                `${folder.name}${folder.hasEligibleSuccessor ? '' : ' (no member has Full control yet)'}`,
            )
            .join(', ')}.`,
        )
        return
      }
      const deleted = await handleDeleteMe(db, userId, res, options.fileStore)
      securityLog.deletionEvent('account_deleted', {
        actorId: userId,
        invites: deleted.invites,
        foldersTransferred: deleted.foldersTransferred,
        foldersDeleted: deleted.foldersDeleted,
        memberships: deleted.memberships,
        connections: deleted.connections,
        myDayEntries: deleted.myDayEntries,
        personalRows: deleted.personalRows,
        sessions: deleted.sessions,
      })
    },
  )

  /* The 7.2 /me/settings endpoints were retired (#113); `/settings` replaced
     them. The three columns are still stored and read. */

  // Read at createApp() time, never at module load (11.6).
  if (process.env.DANA_DEV_LOGIN === '1') {
    router.post('/auth/dev-login', async (req: Request, res: Response) => {
      let module: DevLoginModule
      try {
        module = (await import(DEV_LOGIN_SPECIFIER)) as DevLoginModule
      } catch {
        // A production build excludes the module, so the route does not exist.
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const db = database(res)
      if (db === null) return
      await module.handleDevLogin(
        db,
        req,
        res,
        (target, userId) => establishSession(db, target, userId),
        options.sampleWorkspace === true,
      )
    })
  }

  return router
}

export { pruneExpiredSessions } from './sessions.js'
