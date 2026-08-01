/*
AC-006: given two concurrent first sign-ins with the same google_sub, when
both finish, then exactly one user row exists and both sessions reference it.

"Reference it" is the load-bearing phrase. A pair of sessions that both work
is weaker than the criterion: the failure this guards against is the losing
transaction provisioning a second account, or attaching its session to rows
the winner does not own, and both of those survive a test that only asks
whether each session authenticates. So both sessions are asked who they are,
and the two answers must be the same id, and that id must be the row counted.

Section 7.1 fixes the mechanism: "the whole transaction is idempotent under
the google_sub unique constraint (a concurrent duplicate loses and adopts the
winner's rows)". Adopting is why the folder and settings counts are asserted
too; a loser that retries provisioning from scratch after losing would leave
the winner's account with two Inboxes, violating INV-2.

On PGlite the two callbacks serialize onto one connection (spec 11.15), so the
genuine race runs on the postgres:18 leg of CI (11.11); the assertions are
outcomes and hold either way. The explicit timeout is deliberate: an
implementation that serializes provisioning with a lock rather than the unique
constraint deadlocks against itself on PGlite's single connection, and a named
timeout is a far better report than a hung CI job.

Spec: 7.1, INV-2, INV-14.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  beginAuthorization,
  cleanupAuthSubs,
  completeCallback,
  expectRedirect,
  followAuthorization,
  sessionCookieFrom,
  startAuthTestApp,
  usersForSub,
} from './auth-harness.js'
import type { AuthTestApp, UserRow } from './auth-harness.js'
import { rows } from './helpers.js'

let app: AuthTestApp
const sub = `sub-race-${randomUUID()}`
const domain = `ac006-${randomUUID()}.test`

beforeAll(async () => {
  app = await startAuthTestApp()
  app.stub.nextIdentity({
    sub,
    email: `racer@${domain}`,
    email_verified: true,
    name: 'Concurrent Racer',
  })
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cleanupAuthSubs(app.db, [sub])
  await app.close()
})

describe('AC-006: concurrent first sign-ins converge on one account', () => {
  test(
    'AC-006: exactly one user row exists and both sessions reference it',
    async () => {
      const first = app.browser()
      const second = app.browser()

      // Both authorizations are driven to completion before either callback
      // runs, so the concurrency lands exactly where the criterion puts it:
      // on two provisioning transactions, not on two authorization requests.
      const firstCallbackUrl = await followAuthorization(
        app,
        await beginAuthorization(app, first),
      )
      const secondCallbackUrl = await followAuthorization(
        app,
        await beginAuthorization(app, second),
      )

      const [firstCallback, secondCallback] = await Promise.all([
        completeCallback(first, firstCallbackUrl),
        completeCallback(second, secondCallbackUrl),
      ])

      for (const callback of [firstCallback, secondCallback]) {
        expectRedirect(callback, 'both concurrent callbacks must succeed')
      }

      const users = await usersForSub(app.db, sub)
      expect(
        users,
        'a concurrent duplicate must lose and adopt the winner (spec 7.1)',
      ).toHaveLength(1)
      const user = users[0] as UserRow

      await sessionCookieFrom(app, first, firstCallback)
      await sessionCookieFrom(app, second, secondCallback)

      const firstMe = await first.api('/me')
      const secondMe = await second.api('/me')
      expect(firstMe.status, 'the first session must authenticate').toBe(200)
      expect(secondMe.status, 'the second session must authenticate').toBe(200)

      const firstBody = firstMe.json() as { user: { id: string } }
      const secondBody = secondMe.json() as { user: { id: string } }
      expect(
        firstBody.user.id,
        'both sessions must reference the single surviving user row',
      ).toBe(user.id)
      expect(secondBody.user.id).toBe(user.id)

      // The loser adopted rather than re-provisioned: a second Inbox would
      // break INV-2, and a second settings row would break INV-14.
      const folders = await rows(
        app.db,
        sql`SELECT count(*)::int AS n FROM folders WHERE owner_id = ${user.id}`,
      )
      expect(Number(folders[0]?.n), 'the loser provisioned a second Inbox').toBe(1)
      const settings = await rows(
        app.db,
        sql`SELECT count(*)::int AS n FROM user_settings WHERE user_id = ${user.id}`,
      )
      expect(Number(settings[0]?.n), 'the loser provisioned second settings').toBe(1)
    },
    30_000,
  )
})
