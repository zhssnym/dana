/*
The P5 roster module: spec 7.3, backed by Q9's second half. A connection is
one row in canonical order (4.2, INV-9), so both directions of every question
are asked of the same row: whose roster it appears on, and which of the two
people is calling.

What this module deliberately does not do is guard anything else. The roster
is an addressing convenience, never an access control: 5.3 reads it when a
member is added and 8.7 reads it when an invite is created, and removing a
pair touches neither the memberships it once sponsored nor the tasks inside
them (AC-069).
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import { rowsOf } from './db.js'

export interface RosterEntry {
  user: {
    id: string
    display_name: string | null
    avatar_url: string | null
    email: string | null
  }
  connected_at: string
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/*
GET /connections: the viewer's roster, sorted display_name ascending then id,
excluding soft-deleted users.

The exclusion is defense in depth rather than the mechanism, which 4.2 is
explicit about: 8.10 step 5 deletes every connection row containing the
departing account, so a soft-deleted person is off both rosters before this
query runs. The clause stays because a roster that renders "Deleted user"
with an email beside it would be a privacy leak the moment the deletion
transaction ever missed a row.

The email is here and in no other person shape in the contract, 7.3's own
addition: a roster entry is someone the viewer has exchanged invites with,
and the address is what the sharing panel re-shares to.
*/
export async function listConnections(
  db: Db,
  viewerId: string,
): Promise<RosterEntry[]> {
  const found = await rowsOf(
    db,
    sql`SELECT u.id, u.display_name, u.avatar_url, u.email,
               c.created_at AS connected_at
        FROM connections c
        JOIN users u
          ON u.id = CASE WHEN c.user_a_id = ${viewerId}
                         THEN c.user_b_id ELSE c.user_a_id END
        WHERE (c.user_a_id = ${viewerId} OR c.user_b_id = ${viewerId})
          AND u.deleted_at IS NULL
        ORDER BY u.display_name ASC, u.id ASC`,
  )
  return found.map((row) => ({
    user: {
      id: String(row.id),
      display_name: nullableString(row.display_name),
      avatar_url: nullableString(row.avatar_url),
      email: nullableString(row.email),
    },
    connected_at:
      row.connected_at instanceof Date
        ? row.connected_at.toISOString()
        : new Date(String(row.connected_at)).toISOString(),
  }))
}

/**
 * DELETE /connections/:userId. Either side may call, which the canonical
 * ordering makes structural: the pair is addressed by least and greatest of
 * the two ids, so the caller's side of it never enters the predicate.
 *
 * False means no such connection, which 7.3 answers 404. Existing
 * memberships are untouched by construction: this statement names one table.
 */
export async function removeConnection(
  db: Db,
  viewerId: string,
  otherId: string,
): Promise<boolean> {
  const removed = await rowsOf(
    db,
    sql`DELETE FROM connections
         WHERE user_a_id = least(${viewerId}::uuid, ${otherId}::uuid)
           AND user_b_id = greatest(${viewerId}::uuid, ${otherId}::uuid)
         RETURNING user_a_id`,
  )
  return removed.length > 0
}
