/*
The 7.1 provisioning transaction: insert the user, the default Inbox folder
with its owner membership, and the settings row, atomically, and idempotently
under the google_sub unique constraint.

Idempotence is under google_sub and nothing else, which leaves one collision
this transaction cannot absorb and must name: a Google subject Dana has not
seen, carrying a verified email that already belongs to a live account.
`users_email_active_idx` refuses it, and until 2026-09-03 the refusal reached
the person as an unexplained failure. It is now `EmailAlreadyClaimedError`,
below, and the callback turns it into a page that says what happened. Dana
does not join the two accounts; see 10.1 and the error's own comment.

Idempotence is the unique index doing the work rather than a read-then-write,
because a read-then-write is exactly the race AC-006 drives. The insert says
ON CONFLICT (google_sub) DO NOTHING RETURNING id, so of two concurrent first
sign-ins one inserts and the other returns no row; Postgres makes the loser's
insert wait on the winner's index tuple, so by the time it returns empty the
winner has committed and the follow-up select sees it. The loser then adopts
those rows and creates nothing, which is what keeps the account at one Inbox
(INV-2) and one settings row (INV-14).

Atomicity is the caller's transaction. Everything here runs on one executor,
so a fault anywhere (AC-005 injects one on the last insert) takes the user,
the folder, and the membership down with it.
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import { inTransaction, rowsOf } from '../database.js'
import { createSampleWorkspace } from '../sample/workspace.js'
import { sameZone, writeTimezone } from './timezone-sync.js'

export { inTransaction, rowsOf } from '../database.js'
export type { Executor } from '../database.js'

import type { Executor } from '../database.js'

export interface GoogleIdentity {
  sub: string
  email: string
  displayName: string | null
  avatarUrl: string | null
}

export interface ProvisionOptions {
  /**
   * Whether a brand-new account is written its sample workspace inside this
   * transaction (RFC 0005 change control item 60). The default is the
   * application's; the acceptance suite and the browser harness opt out so
   * that a fresh account is the empty one their criteria count on.
   */
  sample?: boolean
}

/**
 * A verified Google email that already belongs to a different live account.
 *
 * **The decision, ruled by Imran on issue #17 on 2026-09-03 and specified at
 * 10.1: Dana never joins two accounts because their addresses look alike.**
 * Joining is the only one of refuse, ask and join that can hand somebody
 * another person's account, and it cannot be taken back once it has. So the
 * behaviour does not change; what changes is that the refusal is now
 * distinguishable from every other reason a sign-in fails, because the
 * callback can only explain a refusal it can tell apart.
 *
 * **What this error carries and what it deliberately does not.** No email
 * address, no user id, no row. The callback needs to know which refusal this
 * is and nothing else, and the page it renders is addressed to somebody who
 * typed the address themselves.
 *
 * This class exists rather than a result union so that `ProvisionedUser` and
 * every one of this module's callers keep their shapes: the collision is
 * exceptional in the ordinary sense, one sign-in in the product's life, and a
 * union would put a branch nobody takes into four call sites.
 */
export class EmailAlreadyClaimedError extends Error {
  constructor() {
    super('this verified email already belongs to another account')
    this.name = 'EmailAlreadyClaimedError'
  }
}

export interface ProvisionedUser {
  id: string
  timezone: string
  /** False when a concurrent or earlier sign-in had already created the rows. */
  created: boolean
}

/** What the users table already holds about one Google identity. */
export interface EmailStanding {
  /** Whether this google_sub already has a row, deleted or not. */
  subjectKnown: boolean
  /** Whether a different, live account holds this address. */
  addressClaimed: boolean
}

/*
The collision read, issue #17. It is a read before a write, which is exactly
the shape the google_sub idempotence above refuses to use, and the difference
is worth stating because the two look alike and are not.

`ON CONFLICT (google_sub)` names one index and absorbs one collision. A new
subject arriving on a claimed address violates a different index,
`users_email_active_idx`, which that clause does not cover, so the insert
raises. Absorbing that one too is not available: `ON CONFLICT` takes one
conflict target, and a bare `ON CONFLICT DO NOTHING` would swallow both and
leave provisioning unable to say which happened, which is the one thing the
callback needs from it.

**Both counts are needed and the second is the one that is easy to forget.** A
subject Dana already knows adopts its rows below and never rewrites its stored
email, so an account whose address at Google has since changed to one somebody
else holds goes on signing in exactly as it did. Only a subject with no row
here can be refused for an address. Without `subjectKnown` gating the refusal,
this read would lock a returning person out of their own account over a change
made at Google, which is a worse failure than the one it exists to explain.

`deleted_at IS NULL` matches the index's own predicate: 8.10 scrubs the email
of a deleted account, so an address a deletion released is free again.

It is exported because the callback reads it a second time, outside the
transaction, on any provisioning fault: two brand-new subjects on one address
can both pass this read inside their own transactions and the loser's insert
then raises the unique violation for real. A raised transaction is aborted and
cannot be asked anything more, so the second look has to happen after the
rollback, and it is one query on a path that has already failed. That is what
makes the answer the same page for the race as for the ordinary case without
this module parsing a driver's error text, which 11.15 warns is where bound
parameters live.
*/
export async function emailStanding(
  executor: Executor,
  identity: GoogleIdentity,
): Promise<EmailStanding> {
  const found = await rowsOf(
    executor,
    sql`SELECT
          (SELECT count(*)::int FROM users
            WHERE google_sub = ${identity.sub}) AS mine,
          (SELECT count(*)::int FROM users
            WHERE email = ${identity.email.toLowerCase()}
              AND google_sub <> ${identity.sub}
              AND deleted_at IS NULL) AS theirs`,
  )
  return {
    subjectKnown: Number(found[0]?.mine ?? 0) > 0,
    addressClaimed: Number(found[0]?.theirs ?? 0) > 0,
  }
}

/**
 * The refusal's whole condition, written once because it is read twice.
 *
 * `provisionUser` asks it before the insert and the callback asks it again
 * after any provisioning fault, and the two questions are the same question:
 * a subject Dana has never seen, on an address a live account already holds.
 * Until 2026-09-03 the second site wrote it as `addressClaimed` alone, which
 * is a different rule and a wrong one, and it showed the claimed-email page to
 * a returning person whose address at Google had moved onto somebody else's
 * account and who then met any unrelated fault.
 *
 * **It is a function rather than two expressions because of what the two
 * expressions were about to cost.** `subjectKnown` looks like it does nothing
 * from either site alone: `emailStanding`'s `theirs` count already excludes
 * the subject's own row, so every ordinary returning login is unclaimed
 * whether the term is there or not, and deleting it passed the whole suite on
 * the day it was written. Only a returning subject whose address has since
 * moved onto a live account tells the two apart, and refusing that person is
 * the one dead end this product has: no password reset, no second factor, and
 * a page saying the account is somebody else's. AC-346 carries the case; this
 * function is what keeps a later reader from correcting one site to match the
 * other.
 */
export function isEmailCollision(standing: EmailStanding): boolean {
  return !standing.subjectKnown && standing.addressClaimed
}

/**
 * Runs the transaction for one identity. The reported zone is stored at
 * creation and UTC when none was reported (7.1); an existing account's zone
 * is left to syncTimezone, which is 8.1's rule rather than this one's.
 */
export async function provisionUser(
  db: Db,
  identity: GoogleIdentity,
  reportedTimezone: string | undefined,
  options: ProvisionOptions = {},
): Promise<ProvisionedUser> {
  return inTransaction(db, async (tx) => {
    // Issue #17: a subject Dana has never seen, on an address a live account
    // already holds, is refused here rather than at the index. The whole of
    // the reasoning is on emailStanding below.
    if (isEmailCollision(await emailStanding(tx, identity))) {
      throw new EmailAlreadyClaimedError()
    }

    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO users (google_sub, email, display_name, avatar_url, timezone)
          VALUES (
            ${identity.sub},
            ${identity.email.toLowerCase()},
            ${identity.displayName},
            ${identity.avatarUrl},
            ${reportedTimezone ?? 'UTC'}
          )
          ON CONFLICT (google_sub) DO NOTHING
          RETURNING id, timezone`,
    )

    const winner = inserted[0]
    if (winner === undefined) {
      // Lost the race, or simply a returning login: adopt the existing rows
      // and create nothing. Re-running provisioning here would give the
      // account a second Inbox (INV-2) and second settings (INV-14).
      const existing = await rowsOf(
        tx,
        sql`SELECT id, timezone FROM users WHERE google_sub = ${identity.sub}`,
      )
      const row = existing[0]
      if (row === undefined) {
        throw new Error('provisioning found no user row after a conflicting insert')
      }
      return {
        id: String(row.id),
        timezone: String(row.timezone),
        created: false,
      }
    }

    const userId = String(winner.id)
    const folders = await rowsOf(
      tx,
      sql`INSERT INTO folders (owner_id, name, is_default)
          VALUES (${userId}, 'Desk', true)
          RETURNING id`,
    )
    const folderId = String(folders[0]?.id)
    // INV-3 and INV-10: the owner is a member of their own default folder,
    // or the account cannot see its own Inbox.
    await tx.execute(
      sql`INSERT INTO folder_members (folder_id, user_id) VALUES (${folderId}, ${userId})`,
    )
    await tx.execute(sql`INSERT INTO user_settings (user_id) VALUES (${userId})`)

    // Item 60: the sample workspace, in this same transaction, so the first
    // page the person sees is already full and a fault anywhere leaves no
    // half-made account behind.
    if (options.sample === true) {
      await createSampleWorkspace(tx, userId, String(winner.timezone))
    }

    return { id: userId, timezone: String(winner.timezone), created: true }
  })
}

/**
 * 8.1's auto-sync: a successful login that reported a zone writes it when it
 * differs from the stored one. A login carrying no zone syncs nothing, and a
 * tzdb alias of the stored zone is not a different zone.
 *
 * Both of those are "no write, and no 8.6 recompute" in 8.1's own sentence, so
 * the two guards below are one guard read twice and the recompute sits behind
 * them rather than beside them. AC-086 asserts both absences with a real zone
 * change beside each, because an implementation that recomputes on every login
 * passes the positive cases and moves a traveler's instants for a sign-in that
 * changed nothing.
 *
 * The write and the recompute go in one transaction of this function's own.
 * provisionUser's has committed by the time we are called: the zone this
 * compares against is what that transaction settled, and reopening it to add a
 * conditional write would put the first login and the returning one on
 * different paths for no gain.
 */
export async function syncTimezone(
  db: Db,
  user: ProvisionedUser,
  reportedTimezone: string | undefined,
): Promise<void> {
  if (reportedTimezone === undefined) return
  if (sameZone(reportedTimezone, user.timezone)) return
  await inTransaction(db, (tx) => writeTimezone(tx, user.id, reportedTimezone))
}
