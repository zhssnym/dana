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
import { provisionUser, syncTimezone } from './provisioning.js'

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
  const body = (req.body ?? {}) as DevLoginBody

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

  const user = await provisionUser(
    db,
    { sub, email, displayName: name, avatarUrl: null },
    timezone,
  )
  await syncTimezone(db, user, timezone)
  await establish(res, user.id)

  res.status(200).json({ user_id: user.id })
}
