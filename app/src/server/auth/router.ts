/*
The 7.1 auth and account surface plus 7.2's settings pair, mounted by the boot
file under /api/v1.

The handshake, in the order 11.6 fixes it:

  GET  /auth/google           state, nonce, PKCE S256, tz into the pending
                              record, redirect to the issuer
  GET  /auth/google/callback  validate all three single-use, refuse an
                              unverified email or a claimed one with the two
                              9.2 pages, provision or adopt, sync the zone,
                              issue a fresh session
  POST /auth/logout           destroy this session, not the person's others
  GET/PATCH/DELETE /me        the account endpoints, behind session then CSRF
  GET/PATCH /me/settings      the 7.2 toggles, the same two middlewares

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

**A refusal answers a browser, not a client.** The callback is a redirect
target a person lands on, so the 7.0 JSON envelope would arrive as text on a
blank screen. The two refusals section 9 gives copy for render the 9.2 pages,
an unverified email and an email another account already holds; every other
one returns to the landing page with a marker rather than inventing copy
section 9 owns. The account endpoints, which clients call, use the envelope.
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
import type { ObjectStore } from '../files/store.js'
import { sendError, sendValidationError } from '../http/errors.js'
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
import { handleGetSettings, handlePatchSettings } from './settings.js'
import type { GoogleIdentity } from './provisioning.js'
import { createSession, destroySession } from './sessions.js'
import { csrfTokenFor, newSessionToken } from './tokens.js'

export interface AuthRouterOptions {
  dbClient?: DbClient
  auth?: AuthConfig
  rateLimits?: RateLimits
  securityLog?: SecurityLogger
  /** The S4 object store: DELETE /me removes the deleted account's objects
   * after the 8.10 transaction commits (step 6a, RFC 0005 change control
   * item 18). Optional for the same reason as dbClient: a route-presence
   * probe constructs the application bare. */
  fileStore?: ObjectStore
  /** Item 60: whether a brand-new account is written the sample workspace
   * at its first sign-in. createApp decides the default. */
  sampleWorkspace?: boolean
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
    sampleDefault?: boolean,
  ): Promise<void>
}

// Section 4.1 and 10.3's bounds on the columns Google's claims land in.
const MAX_EMAIL = 320
const MAX_DISPLAY_NAME = 200
const MAX_AVATAR_URL = 2000

function clamp(value: unknown, limit: number): string | null {
  if (typeof value !== 'string' || value === '') return null
  return value.length <= limit ? value : value.slice(0, limit)
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

/**
 * The 9.2 pages, the only two this module renders, for the two refusals
 * section 9 gives copy for.
 *
 * Both answer 403 and neither establishes anything. 7.0's taxonomy puts them
 * there together: the person is who they say they are and the act is refused,
 * which is what 403 means, and neither is a 404, the resource in each case
 * being their own address.
 */
function refuseUnverified(res: Response): void {
  clearPendingCookie(res)
  res.status(403).type('html').send(unverifiedEmailPage())
}

function refuseClaimedEmail(res: Response): void {
  clearPendingCookie(res)
  res.status(403).type('html').send(emailAlreadyClaimedPage())
}

/**
 * Every other refusal. Back to the landing page with a marker, inventing no
 * copy: a browser is what lands here, and section 9 owns what it reads.
 */
function refuse(res: Response): void {
  clearPendingCookie(res)
  res.redirect(303, SIGN_IN_FAILED_TARGET)
}

export function createAuthRouter(options: AuthRouterOptions = {}): Router {
  const router = Router()
  const pending = new PendingAuthorizations()
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)
  const securityLog = options.securityLog ?? createSecurityLogger()

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
      refuse(res)
      return
    }

    const config = oidc()
    const configuration = await config.configure()

    // The provider's own refusal path, which every cancelled consent screen
    // walks: answered as a refusal, never as a 500.
    if (typeof req.query.error === 'string') {
      refuse(res)
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
        refuse(res)
        return
      }
      claims = verified as unknown as Record<string, unknown>
    } catch {
      // A wrong state, a mismatched nonce, a bad signature, an expired or
      // foreign token: all one outcome, and none of them a 5xx, because every
      // one of them is attacker-reachable input.
      refuse(res)
      return
    }

    const sub = typeof claims.sub === 'string' ? claims.sub : undefined
    const email = typeof claims.email === 'string' ? claims.email : undefined
    if (sub === undefined || email === undefined) {
      refuse(res)
      return
    }
    // 7.1 and 10.1: an unverified email is refused with the 9.2 page, and no
    // rows are created.
    if (claims.email_verified !== true) {
      refuseUnverified(res)
      return
    }
    // 10.3 caps a stored email at 320 characters, and an address is an
    // identifier: it cannot be trimmed to fit the way a display name can, so
    // one that does not fit is a refusal rather than a mangled account.
    if (email.length > MAX_EMAIL) {
      refuse(res)
      return
    }

    const identity: GoogleIdentity = {
      sub,
      email,
      // Section 4.1's CHECK constraints bound both of these, and neither is
      // this API's input to validate: they arrive from Google. Clamping keeps
      // an unusually long profile from turning a legitimate sign-in into a
      // constraint violation, and both columns are nullable and cosmetic, so
      // clamping costs nothing an account depends on.
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
      A provisioning fault rolls the whole transaction back (AC-005), and the
      person still needs an answer.

      One case is now ruled and is answered with words rather than with the
      landing page's bare marker: a google_sub Dana has never seen, carrying a
      verified email a live account already holds. Imran's ruling on issue #17
      of 2026-09-03, specified at 10.1, is that Dana refuses and never joins
      the two accounts, and that the refusal explains itself. `provisionUser`
      throws it by name; the second read below catches the same collision when
      two brand-new subjects raced each other to one address, which the first
      read cannot see from inside its own transaction and which arrives here
      as an ordinary unique violation. The re-read costs one query on a path
      that has already failed, and it is how this handler tells the two apart
      without reading a driver's error text, where 11.15 records that bound
      parameters live.

      Everything else stays exactly as it was: refused, logged, and returned
      to the landing page with the marker, inventing no copy section 9 has not
      written.
      */
      const claimed =
        error instanceof EmailAlreadyClaimedError ||
        // One predicate, shared with the read inside the transaction, because
        // the two are asking the same question and were briefly written as two
        // different rules: this site read `addressClaimed` alone, which showed
        // the claimed-email page to a returning person whose address at Google
        // had moved onto a live account and who then met any unrelated fault.
        // syncTimezone is inside this same try, so that is reachable.
        isEmailCollision(
          // The second look is itself a database call, on a path a database
          // fault is the likeliest reason for reaching. It answers "not a
          // collision" rather than throwing, because a throw here would turn a
          // handled refusal into a 500 on the one endpoint a person meets
          // before they have an account.
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

    // Into the app (7.1), which 10.6 fixes at /app, and on this origin by
    // construction (AC-109).
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
        // One session. 10.1 draws the singular against account deletion's
        // plural, so signing out here must not touch the person's other
        // clients.
        await destroySession(db, session.token)
        securityLog.authEvent('sign_out', { userId: session.userId })
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
    mutationLimit,
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
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      // 7.1: the literal confirm string, else 422 naming the field.
      const parsed = deleteMeBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const userId = sessionOf(req)?.userId ?? ''
      const deleted = await handleDeleteMe(db, userId, res, options.fileStore)
      securityLog.deletionEvent('account_deleted', {
        actorId: userId,
        invites: deleted.invites,
        foldersTransferred: deleted.foldersTransferred,
        foldersDeleted: deleted.foldersDeleted,
        memberships: deleted.memberships,
        connections: deleted.connections,
        myDayEntries: deleted.myDayEntries,
        sessions: deleted.sessions,
      })
    },
  )

  /* ---------------------------------------------------------------- *
   * The settings endpoints (7.2)
   * ---------------------------------------------------------------- */

  // A read carries no CSRF requirement: 7.0 puts the header on mutations
  // only, and requiring it here would break every page load.
  router.get('/me/settings', requireSession, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    await handleGetSettings(db, sessionOf(req)?.userId ?? '', res)
  })

  router.patch(
    '/me/settings',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      await handlePatchSettings(db, sessionOf(req)?.userId ?? '', req, res)
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

/** Re-exported so the boot file's scheduler wiring has one import (11.7). */
export { pruneExpiredSessions } from './sessions.js'
