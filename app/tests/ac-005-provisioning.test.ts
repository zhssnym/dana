/*
AC-005: given a first Google sign-in, when the callback completes, then one
user, one Inbox folder with owner membership, and one settings row exist,
created atomically (INV-14).

The criterion names four things and one adverb, and the adverb is the part a
naive test drops. "Created atomically" is not observable from a successful
sign-in, because a provisioning routine that runs four separate transactions
produces exactly the same rows as one that runs a single transaction. It is
only observable when something fails partway, so the second test injects a
fault into the last insert and asserts the first three rows are gone too.

The provisioned timezone is asserted here as of the 2026-07-31 amendment, which
gave 7.1 the tz query parameter this file previously had no way to send. Both
branches are pinned, because the amendment specifies two: a sign-in that
reports a zone stores that zone, and a sign-in that reports none stores UTC.
The second is the one an implementation gets wrong quietly, by defaulting to
the server's own zone, which is correct on a machine in UTC and wrong in
production the moment the host moves. Syncing on a returning login is AC-007's
subject, not this file's, and the explanation-page copy of a refusal is
AC-008's.

Spec: 7.1 (provisioning transaction and the tz parameter), 4.1, 4.3, 4.4, 4.10
(the four rows), INV-2, INV-3, INV-10, INV-14.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  cleanupAuthSubs,
  expectNoSession,
  isIanaTimezone,
  attemptSignIn,
  signIn,
  startAuthTestApp,
  userForSub,
  usersForSub,
} from './auth-harness.js'
import type { AuthTestApp, UserRow } from './auth-harness.js'
import { rows } from './helpers.js'

let app: AuthTestApp

// One address domain per run keeps this file's rows self-identifying, which
// the shared-Postgres leg requires (see helpers.ts), and lets the injected
// fault below fire on this file's provisioning alone.
const domain = `ac005-${randomUUID()}.test`
const firstSub = `sub-first-${randomUUID()}`
const faultSub = `sub-fault-${randomUUID()}`
const repeatSub = `sub-repeat-${randomUUID()}`
const zonelessSub = `sub-zoneless-${randomUUID()}`

// A zone that is neither UTC nor plausibly the machine's own, so storing it
// cannot be confused with defaulting.
const REPORTED_ZONE = 'Asia/Karachi'
const faultTag = randomUUID().replace(/-/g, '')

// Cold PGlite instances compile WASM, and parallel workers all do it at
// once, so setup gets far more than the default hook timeout.
beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  // The trigger is dropped here as well as inline: a mid-file failure would
  // otherwise strand it, and on the shared-Postgres leg a stranded fault
  // trigger breaks every other file's provisioning.
  await dropFault()
  await cleanupAuthSubs(app.db, [firstSub, faultSub, repeatSub, zonelessSub])
  await app.close()
})

async function installFault(): Promise<void> {
  await app.db.execute(
    sql.raw(`
      CREATE FUNCTION dana_fault_${faultTag}() RETURNS trigger
      LANGUAGE plpgsql AS $fn$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM users
          WHERE id = NEW.user_id AND email LIKE '%@${domain}'
        ) THEN
          RAISE EXCEPTION 'injected provisioning fault';
        END IF;
        RETURN NEW;
      END
      $fn$;
    `),
  )
  await app.db.execute(
    sql.raw(`
      CREATE TRIGGER dana_fault_trg_${faultTag}
      BEFORE INSERT ON user_settings
      FOR EACH ROW EXECUTE FUNCTION dana_fault_${faultTag}();
    `),
  )
}

async function dropFault(): Promise<void> {
  await app.db.execute(
    sql.raw(
      `DROP TRIGGER IF EXISTS dana_fault_trg_${faultTag} ON user_settings`,
    ),
  )
  await app.db.execute(
    sql.raw(`DROP FUNCTION IF EXISTS dana_fault_${faultTag}()`),
  )
}

async function countFolders(userId: string): Promise<number> {
  const result = await rows(
    app.db,
    sql`SELECT count(*)::int AS n FROM folders WHERE owner_id = ${userId}`,
  )
  return Number(result[0]?.n)
}

async function countSettings(userId: string): Promise<number> {
  const result = await rows(
    app.db,
    sql`SELECT count(*)::int AS n FROM user_settings WHERE user_id = ${userId}`,
  )
  return Number(result[0]?.n)
}

/** The full four-row shape 7.1 requires, asserted in one place. */
async function expectProvisioned(user: UserRow): Promise<void> {
  const folders = await rows(
    app.db,
    sql`SELECT * FROM folders WHERE owner_id = ${user.id}`,
  )
  expect(folders, 'first sign-in creates exactly one folder').toHaveLength(1)
  const inbox = folders[0] as { id: string; name: string; is_default: boolean }
  expect(inbox.is_default, 'the provisioned folder is the default folder').toBe(
    true,
  )
  expect(
    inbox.name,
    'RFC 0005 renames the default folder: provisioning says Desk',
  ).toBe('Desk')

  // INV-3 and INV-10: the default folder carries exactly one membership row,
  // its owner's. A provisioning routine that creates the folder and forgets
  // the membership leaves an account that cannot see its own Inbox, and every
  // row count above would still pass.
  const members = await rows(
    app.db,
    sql`SELECT user_id, role FROM folder_members WHERE folder_id = ${inbox.id}`,
  )
  expect(members, 'the Inbox has exactly one membership row (INV-3)').toHaveLength(1)
  expect(members[0]?.user_id, 'that membership is the owner\'s (INV-10)').toBe(
    user.id,
  )

  const settings = await rows(
    app.db,
    sql`SELECT * FROM user_settings WHERE user_id = ${user.id}`,
  )
  expect(settings, 'first sign-in creates exactly one settings row (INV-14)').toHaveLength(1)
  // Section 4.10 fixes the defaults, and 9.7 makes Done ship hidden.
  expect(settings[0]?.show_important).toBe(true)
  expect(settings[0]?.show_all).toBe(true)
  expect(settings[0]?.show_done).toBe(false)
}

describe('AC-005: first sign-in provisions atomically (INV-14)', () => {
  test('AC-005: one user, one Inbox with owner membership, one settings row', async () => {
    // Mixed case in, lowercased in storage: section 4.1 stores email
    // lowercased and 8.7 matches invites on the lowercased form, so a
    // provisioning routine that stores the claim verbatim breaks invite
    // matching later in a way no P1 test would otherwise see.
    app.stub.nextIdentity({
      sub: firstSub,
      email: `Ada.Lovelace@${domain}`,
      email_verified: true,
      name: 'Ada Lovelace',
    })

    await signIn(app, { tz: REPORTED_ZONE })

    const users = await usersForSub(app.db, firstSub)
    expect(users, 'exactly one user row for the google_sub').toHaveLength(1)
    const user = users[0] as UserRow
    expect(user.email, 'section 4.1 stores the email lowercased').toBe(
      `ada.lovelace@${domain}`,
    )
    expect(user.display_name).toBe('Ada Lovelace')
    expect(user.deleted_at).toBeNull()
    expect(
      user.timezone,
      'section 7.1 provisions users.timezone from the reported tz',
    ).toBe(REPORTED_ZONE)
    expect(
      isIanaTimezone(user.timezone),
      `INV-14 requires a valid IANA timezone, found ${String(user.timezone)}`,
    ).toBe(true)

    await expectProvisioned(user)
  })

  test('AC-005 adversarial: a first sign-in reporting no zone provisions UTC', async () => {
    // Section 7.1: "timezone from the reported tz, UTC when none was
    // reported". The mistake this catches is defaulting to the server's own
    // zone, which is invisible on a machine running in UTC and wrong in
    // production the day the host moves.
    app.stub.nextIdentity({
      sub: zonelessSub,
      email: `zoneless@${domain}`,
      email_verified: true,
      name: 'No Zone Reported',
    })

    await signIn(app)

    const user = await userForSub(app.db, zonelessSub)
    expect(user, 'the account must be provisioned').toBeDefined()
    expect(
      (user as UserRow).timezone,
      'a sign-in carrying no tz must provision UTC (spec 7.1)',
    ).toBe('UTC')
  })

  test('AC-005 adversarial: a fault in the last insert rolls back the first three', async () => {
    app.stub.nextIdentity({
      sub: faultSub,
      email: `faulted@${domain}`,
      email_verified: true,
    })
    await installFault()

    try {
      const { callback } = await attemptSignIn(app)
      expectNoSession(
        callback,
        'the provisioning transaction could not complete',
      )
    } finally {
      await dropFault()
    }

    // The whole point of the criterion's "atomically": the user, the folder,
    // and the membership must be gone too, not merely the settings row.
    expect(
      await usersForSub(app.db, faultSub),
      'a failed provisioning left a user row behind (INV-14)',
    ).toHaveLength(0)
    const orphanFolders = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM folders f
          WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = f.owner_id)`,
    )
    expect(Number(orphanFolders[0]?.n)).toBe(0)

    // And the account is still provisionable once the fault is gone, which
    // proves the rollback left no half-built state blocking a retry.
    const retry = await signIn(app)
    expect(retry.session.value).not.toBe('')
    const user = await userForSub(app.db, faultSub)
    expect(user, 'the retried sign-in provisions normally').toBeDefined()
    await expectProvisioned(user as UserRow)
  })

  test('AC-005 adversarial: signing in again provisions nothing a second time', async () => {
    // Section 7.1: "the whole transaction is idempotent under the google_sub
    // unique constraint". A routine that re-runs provisioning on every login
    // would violate INV-2 on the second one, and would do it in production on
    // day two rather than in this suite.
    app.stub.nextIdentity({
      sub: repeatSub,
      email: `returning@${domain}`,
      email_verified: true,
    })
    await signIn(app)
    const user = await userForSub(app.db, repeatSub)
    expect(user).toBeDefined()
    const id = (user as UserRow).id

    await signIn(app)

    expect(await usersForSub(app.db, repeatSub)).toHaveLength(1)
    expect(await countFolders(id), 'a second login created a second folder').toBe(1)
    expect(await countSettings(id), 'a second login created a second settings row').toBe(1)
  })
})
