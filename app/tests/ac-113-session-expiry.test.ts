/*
AC-113: given a session past its 30-day expiry, when presented, then 401; given
a session used before expiry, then its expiry extends (rolling).

Held through the first pass, because neither half is observable from outside
and the table's shape was the Security engineer's alone. The 2026-07-31
amendment fixed three facts in 10.1 as contract for exactly this reason: the
table is named sessions, it references users(id) through a user_id column
declared ON DELETE CASCADE, and expiry is a timestamptz column named
expires_at that every authenticated request resets to 30 days from that
request's time.

Rows are addressed by user_id, never by the cookie value. 11.6 makes the
identifier opaque and 10.1 does not say how it is stored; the Security persona
intends to hash it. Matching rows on the cookie value would be asserting a
storage decision the specification leaves open, and would go red against a
correct implementation.

The expiry is reached by moving the row rather than by waiting, which is the
only way a 30-day rule is testable at all. That makes the direction of each
move the thing to be careful about: a test that only ever moves expiry
backwards cannot tell a server that checks expiry from one that ignores it and
happens to have no old sessions.

The sharpest case here is the last one. An implementation that rolls the expiry
before checking it renews the session it was about to reject, so an abandoned
session never dies and the 30-day rule silently becomes infinite. It passes the
first test in this file, because the request that resurrects it is still
answered 401, and only the state left behind gives it away.

Every test asserts the table exists first, so a missing table reports as the
missing behavior it is rather than as a SQL error about an unknown relation.

Spec: 10.1 (the sessions contract and 30-day rolling expiry), 11.6 (opaque
identifiers, pruning is not revocation), 7.1.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  cleanupAuthSubs,
  countSessionsForUser,
  requireSessionsTable,
  sessionExpiriesForUser,
  setSessionExpiry,
  signIn,
  startAuthTestApp,
  userForSub,
} from './auth-harness.js'
import type { AuthTestApp, UserRow } from './auth-harness.js'
import { rows } from './helpers.js'

let app: AuthTestApp
const domain = `ac113-${randomUUID()}.test`
const expiredSub = `sub-expired-${randomUUID()}`
const rollingSub = `sub-rolling-${randomUUID()}`
const boundarySub = `sub-boundary-${randomUUID()}`
const zombieSub = `sub-zombie-${randomUUID()}`
const contractSub = `sub-contract-${randomUUID()}`

const DAY = 24 * 60 * 60 * 1000
const THIRTY_DAYS = 30 * DAY

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cleanupAuthSubs(app.db, [
    expiredSub,
    rollingSub,
    boundarySub,
    zombieSub,
    contractSub,
  ])
  await app.close()
})

async function accountFor(sub: string): Promise<UserRow> {
  const user = await userForSub(app.db, sub)
  expect(user, `no account exists for ${sub}`).toBeDefined()
  return user as UserRow
}

async function onlyExpiry(userId: string): Promise<Date> {
  const expiries = await sessionExpiriesForUser(app.db, userId)
  expect(
    expiries,
    'expected exactly one session row for this account (spec 10.1)',
  ).toHaveLength(1)
  return expiries[0] as Date
}

describe('AC-113: sessions expire after 30 days and roll while used', () => {
  test('AC-113: a session past its expiry answers 401', async () => {
    await requireSessionsTable(app.db)
    app.stub.nextIdentity({
      sub: expiredSub,
      email: `expired@${domain}`,
      email_verified: true,
      name: 'Long Gone',
    })

    const { browser } = await signIn(app)
    expect(
      (await browser.api('/me')).status,
      'the session must work before it is expired, or the 401 below proves nothing',
    ).toBe(200)

    const user = await accountFor(expiredSub)
    expect(
      await countSessionsForUser(app.db, user.id),
      'signing in created no session row (spec 10.1)',
    ).toBe(1)

    // One second past, rather than long past: the rule is an expiry, not a
    // staleness heuristic with slack in it.
    await setSessionExpiry(app.db, user.id, new Date(Date.now() - 1000))

    expect(
      (await browser.api('/me')).status,
      'a session past expires_at must answer 401 (spec 10.1)',
    ).toBe(401)
  })

  test('AC-113: a session used before expiry has its expiry extended', async () => {
    await requireSessionsTable(app.db)
    app.stub.nextIdentity({
      sub: rollingSub,
      email: `rolling@${domain}`,
      email_verified: true,
      name: 'Still Here',
    })

    const { browser } = await signIn(app)
    const user = await accountFor(rollingSub)

    // Moved close to expiry so an extension is unmistakable. A fresh session
    // already sits 30 days out, where a correct reset moves it by
    // milliseconds and could not be told apart from no reset at all.
    const nearExpiry = new Date(Date.now() + DAY)
    await setSessionExpiry(app.db, user.id, nearExpiry)

    const before = await onlyExpiry(user.id)
    expect(
      (await browser.api('/me')).status,
      'the session must still authenticate one day before expiry',
    ).toBe(200)
    const after = await onlyExpiry(user.id)

    expect(
      after.getTime(),
      'an authenticated request did not extend expires_at (spec 10.1: 30-day rolling expiry)',
    ).toBeGreaterThan(before.getTime())

    // "reset to 30 days from that request's time", so the new value is 30
    // days out, not merely larger. A one-hour tolerance covers the round trip
    // without admitting a different policy.
    const target = Date.now() + THIRTY_DAYS
    expect(
      Math.abs(after.getTime() - target),
      `expires_at was extended to ${after.toISOString()}, which is not 30 days from now (spec 10.1)`,
    ).toBeLessThan(60 * 60 * 1000)
  })

  test('AC-113 adversarial: the boundary is enforced on both sides', async () => {
    await requireSessionsTable(app.db)
    app.stub.nextIdentity({
      sub: boundarySub,
      email: `boundary@${domain}`,
      email_verified: true,
      name: 'On The Line',
    })

    const { browser } = await signIn(app)
    const user = await accountFor(boundarySub)

    // Just alive: a server that rejects this is expiring sessions early, and
    // nothing else in this package would notice.
    await setSessionExpiry(app.db, user.id, new Date(Date.now() + 5 * 60 * 1000))
    expect(
      (await browser.api('/me')).status,
      'a session five minutes from expiry must still authenticate (spec 10.1)',
    ).toBe(200)

    // Just dead.
    await setSessionExpiry(app.db, user.id, new Date(Date.now() - 5 * 60 * 1000))
    expect(
      (await browser.api('/me')).status,
      'a session five minutes past expiry must answer 401 (spec 10.1)',
    ).toBe(401)
  })

  test('AC-113 adversarial: presenting an expired session does not revive it', async () => {
    await requireSessionsTable(app.db)
    app.stub.nextIdentity({
      sub: zombieSub,
      email: `zombie@${domain}`,
      email_verified: true,
      name: 'Back From The Dead',
    })

    const { browser, session } = await signIn(app)
    const user = await accountFor(zombieSub)

    const expiredAt = new Date(Date.now() - DAY)
    await setSessionExpiry(app.db, user.id, expiredAt)

    expect((await browser.api('/me')).status).toBe(401)

    // The order matters and only the leftover state reveals it. A middleware
    // that rolls the expiry before testing it renews the row it is about to
    // reject, so the session never dies and 30 days quietly becomes forever.
    const remaining = await sessionExpiriesForUser(app.db, user.id)
    for (const expiry of remaining) {
      expect(
        expiry.getTime(),
        `a rejected request extended the expired session to ${expiry.toISOString()}: expiry is being rolled before it is checked (spec 10.1)`,
      ).toBeLessThanOrEqual(expiredAt.getTime())
    }

    // And a second attempt is still refused, from a clean jar, so a cleared
    // cookie cannot be mistaken for a dead session.
    const replay = app.browser()
    replay.plant(session.name, session.value)
    expect(
      (await replay.api('/me')).status,
      'the expired identifier authenticated on a second attempt',
    ).toBe(401)
  })

  test('AC-113: the sessions table matches the observable contract of 10.1', async () => {
    await requireSessionsTable(app.db)

    // The three facts 10.1 fixes so that this suite can observe expiry and so
    // that a shared-database run can clean up after itself. Everything else
    // about the table is the Security engineer's business.
    const columns = await rows(
      app.db,
      sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sessions'
      `,
    )
    const byName = new Map(
      columns.map((row) => [String(row.column_name), String(row.data_type)]),
    )
    expect(
      byName.has('user_id'),
      'sessions has no user_id column (spec 10.1)',
    ).toBe(true)
    expect(
      byName.get('expires_at'),
      'sessions.expires_at must be timestamptz (spec 10.1)',
    ).toBe('timestamp with time zone')

    const fk = await rows(
      app.db,
      sql`
        SELECT c.confdeltype::text AS on_delete, ref.relname AS ref_table,
               (SELECT array_agg(a.attname ORDER BY k.ord)::text[]
                  FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
                  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        LEFT JOIN pg_class ref ON ref.oid = c.confrelid
        WHERE n.nspname = 'public' AND t.relname = 'sessions' AND c.contype = 'f'
      `,
    )
    const userFk = fk.find(
      (row) =>
        String(row.ref_table) === 'users' &&
        ((row.cols as string[] | null) ?? []).includes('user_id'),
    )
    expect(
      userFk,
      'sessions.user_id has no foreign key onto users (spec 10.1)',
    ).toBeDefined()
    // Cascade so that test teardown hard-deleting a user cannot strand rows;
    // 10.1 records that it never fires in production, where 8.10 destroys
    // sessions explicitly.
    expect(
      String(userFk?.on_delete),
      'sessions.user_id must be declared ON DELETE CASCADE (spec 10.1)',
    ).toBe('c')
  })

  test('AC-113 adversarial: a fresh session starts 30 days out, not sooner', async () => {
    await requireSessionsTable(app.db)
    app.stub.nextIdentity({
      sub: contractSub,
      email: `fresh@${domain}`,
      email_verified: true,
      name: 'Newly Signed In',
    })

    const issuedAt = Date.now()
    await signIn(app)
    const user = await accountFor(contractSub)

    const expiry = await onlyExpiry(user.id)
    expect(
      Math.abs(expiry.getTime() - (issuedAt + THIRTY_DAYS)),
      `a new session expires at ${expiry.toISOString()}, which is not 30 days from sign-in (spec 10.1)`,
    ).toBeLessThan(60 * 60 * 1000)
  })
})
