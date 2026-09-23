/*
The development-only login of 11.6, and the one module in this codebase that
must not exist in a production build.

Three things keep that true, and all three are needed:

- tsconfig.build.json excludes src/server/auth/dev-login*, so tsc does not
  compile it.
- router.ts loads it through a specifier assembled at runtime, so no
  resolvable import names it. 11.15 records why that matters: tsc emits an
  excluded file anyway whenever any import can be resolved to it, a literal
  dynamic import() included, and the exclusion would then be decorative.
- The loader treats a failed load as the route not existing and answers 404,
  which is what a production build produces regardless of DANA_DEV_LOGIN.

It provisions through the same transaction as the callback, so a session made
here is indistinguishable from a real one, and it takes an optional timezone
with the 7.1 tz parameter's semantics: absent means UTC, invalid is treated as
absent rather than answered 422.
*/
import { randomUUID } from 'node:crypto'

import type { Request, Response } from 'express'

import type { Db } from '../../../db/client.js'
import { isIanaTimezone } from '../../shared/timezone.js'
import { sendError } from '../http/errors.js'
import { EmailAlreadyClaimedError, provisionUser, syncTimezone } from './provisioning.js'

interface DevLoginBody {
  email?: unknown
  sub?: unknown
  name?: unknown
  timezone?: unknown
  /** 7.20: `false` opts a brand-new account out of the sample workspace
   * and `true` opts it in, whatever the application's default; the browser
   * harness sends false so a fresh account is the empty one its criteria
   * count on. Honoured here and nowhere else. */
  sample?: unknown
}

export async function handleDevLogin(
  db: Db,
  req: Request,
  res: Response,
  establish: (res: Response, userId: string) => Promise<void>,
  sampleDefault = true,
): Promise<void> {
  // The query string is read beside the body so a plain HTML form, which
  // cannot post JSON, can still name the account: POST .../dev-login?sub=x.
  const body = { ...(req.query as object), ...((req.body ?? {}) as object) } as DevLoginBody

  // Every field is optional so that a bare POST signs in as a fresh account,
  // which is what the Playwright seeding path wants; naming an email or sub
  // signs in as that account, creating it the first time.
  const sub = typeof body.sub === 'string' && body.sub !== ''
    ? body.sub
    : `dev-login-${randomUUID()}`
  const email = typeof body.email === 'string' && body.email !== ''
    ? body.email
    : `${sub}@dev.local`
  const name = typeof body.name === 'string' && body.name !== '' ? body.name : 'Dev User'
  const timezone =
    typeof body.timezone === 'string' && isIanaTimezone(body.timezone)
      ? body.timezone
      : undefined

  const sample =
    body.sample === true || body.sample === 'true'
      ? true
      : body.sample === false || body.sample === 'false'
        ? false
        : sampleDefault

  let user
  try {
    user = await provisionUser(
      db,
      { sub, email, displayName: name, avatarUrl: null },
      timezone,
      { sample },
    )
  } catch (error) {
    /*
    Issue #17's collision reaches this route too, and it reaches it as a
    mistake in a seed rather than as a product event: a harness that names an
    email already held by a different sub. Answered as a refusal a person can
    read, because the alternative is a 500 in a Playwright log with nothing in
    it about which of the two names collided. The callback's own answer is the
    9.2 page; this route serves no browser and answers JSON like the rest of
    the API.
    */
    if (error instanceof EmailAlreadyClaimedError) {
      sendError(
        res,
        409,
        'conflict',
        `The email ${email} already belongs to a different account; name a different sub or email.`,
      )
      return
    }
    throw error
  }
  await syncTimezone(db, user, timezone)
  await establish(res, user.id)

  res.status(200).json({ user_id: user.id })
}
