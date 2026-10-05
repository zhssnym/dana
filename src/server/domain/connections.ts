// Connections (spec 7.3): one row per pair in canonical order (INV-9). The roster is for addressing, never access control.
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import { rowsOf } from '../database.js'

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

// GET /connections. Soft-deleted users are excluded as defence in depth: deletion already removes their rows.
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

/** DELETE /connections/:userId. Either side may call. Memberships are untouched. False means 404. */
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
