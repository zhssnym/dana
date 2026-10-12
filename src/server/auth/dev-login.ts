/*
The development-only login (11.6). It must never exist in a production build:
tsconfig.build.json excludes it, router.ts loads it by a runtime-built
specifier (any resolvable import would make tsc emit it), and a failed load is
a 404. It provisions through the real transaction; an invalid tz is ignored.
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
}

export async function handleDevLogin(
  db: Db,
  req: Request,
  res: Response,
  establish: (res: Response, userId: string) => Promise<void>,
): Promise<void> {
  // Query params too, so a plain HTML form can name the account.
  const body = { ...(req.query as object), ...((req.body ?? {}) as object) } as DevLoginBody

  // All optional: a bare POST signs in as a fresh account.
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

  let user
  try {
    user = await provisionUser(
      db,
      { sub, email, displayName: name, avatarUrl: null },
      timezone,
    )
  } catch (error) {
    /*
    A seed naming an email held by a different sub: answer a readable 409
    instead of a 500 in a test log.
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
