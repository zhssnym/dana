/*
The 7.1 provisioning transaction: insert the user, the default Desk folder
with its owner membership and its default description, and the settings row,
atomically, and idempotently under the google_sub unique constraint.

Idempotence is the unique index doing the work rather than a read-then-write,
because a read-then-write is exactly the race AC-006 drives. The insert says
ON CONFLICT (google_sub) DO NOTHING RETURNING id, so of two concurrent first
sign-ins one inserts and the other returns no row; Postgres makes the loser's
insert wait on the winner's index tuple, so by the time it returns empty the
winner has committed and the follow-up select sees it. The loser then adopts
those rows and creates nothing, which is what keeps the account at one Desk
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

/*
The words a brand-new Desk carries under its name (issue #68).

**It is Dana's own sentence for Desk, transcribed and not invented.** The
client's `routes.ts` has answered "Nothing decided about it yet" under that
page since RFC 0005, so writing anything else here would give one page two
descriptions of itself and make the folder disagree with the sidebar it
hangs in. It goes in `folders.description`, the column 4.3 already has, so
the person can rewrite or empty it through 7.4 like any other folder's, and
this is a default rather than a fixture: nothing restores it.

Only new accounts get it. Existing Desks are not backfilled, because a
migration that wrote words into a folder somebody had deliberately left
blank would be Dana putting sentences in a person's mouth, and there is no
way to tell the two blanks apart after the fact.
*/
export const DESK_DEFAULT_DESCRIPTION = 'Nothing decided about it yet'

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
  options: ProvisionOptions = {},
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
      // account a second Desk (INV-2) and second settings (INV-14).
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
      sql`INSERT INTO folders (owner_id, name, is_default, description)
          VALUES (${userId}, 'Desk', true, ${DESK_DEFAULT_DESCRIPTION})
          RETURNING id`,
    )
    const folderId = String(folders[0]?.id)
    // INV-3 and INV-10: the owner is a member of their own default folder,
    // or the account cannot see its own Desk.
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
