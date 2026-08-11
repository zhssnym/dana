/*
The 7.1 provisioning transaction: insert the user, the default Inbox folder
with its owner membership, and the settings row, atomically, and idempotently
under the google_sub unique constraint.

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
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import { sameZone, writeTimezone } from './timezone-sync.js'

/**
 * The one shape this module needs from a database handle or a transaction.
 * db/client.ts's Db is a union of two drizzle databases whose transaction and
 * execute signatures agree structurally; naming that shape here keeps the
 * union from forcing a cast at every call site.
 */
export interface Executor {
  execute(query: SQL): Promise<unknown>
}

interface Transactional {
  transaction<T>(run: (tx: Executor) => Promise<T>): Promise<T>
}

export async function inTransaction<T>(
  db: Db,
  run: (tx: Executor) => Promise<T>,
): Promise<T> {
  return (db as unknown as Transactional).transaction(run)
}

export async function rowsOf(
  executor: Executor,
  statement: SQL,
): Promise<Record<string, unknown>[]> {
  const result = (await executor.execute(statement)) as unknown as {
    rows: Record<string, unknown>[]
  }
  return result.rows
}

export interface GoogleIdentity {
  sub: string
  email: string
  displayName: string | null
  avatarUrl: string | null
}

export interface ProvisionedUser {
  id: string
  timezone: string
  /** False when a concurrent or earlier sign-in had already created the rows. */
  created: boolean
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
): Promise<ProvisionedUser> {
  return inTransaction(db, async (tx) => {
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
          VALUES (${userId}, 'Inbox', true)
          RETURNING id`,
    )
    const folderId = String(folders[0]?.id)
    // INV-3 and INV-10: the owner is a member of their own default folder,
    // or the account cannot see its own Inbox.
    await tx.execute(
      sql`INSERT INTO folder_members (folder_id, user_id) VALUES (${folderId}, ${userId})`,
    )
    await tx.execute(sql`INSERT INTO user_settings (user_id) VALUES (${userId})`)

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
