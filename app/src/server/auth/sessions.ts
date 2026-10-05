/*
Sessions (10.1): token_hash is the sha256 hex of the cookie token. Expiry is
checked in the same UPDATE that rolls it, so an expired session can never be
renewed (AC-113).
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import { sha256Hex } from './tokens.js'

export const SESSION_TTL_DAYS = 30

interface QueryResult {
  rows: Record<string, unknown>[]
}

async function query(db: Db, statement: SQL): Promise<Record<string, unknown>[]> {
  const result = (await db.execute(statement)) as unknown as QueryResult
  return result.rows
}

/* now() on the database side, matching the predicate, so clock skew never
   shortens or lengthens sessions. */
const expiry = sql.raw(`now() + interval '${String(SESSION_TTL_DAYS)} days'`)

/** Stores only the token's digest; the raw token lives only in the cookie. */
export async function createSession(
  db: Db,
  userId: string,
  token: string,
): Promise<void> {
  await db.execute(
    sql`INSERT INTO sessions (token_hash, user_id, expires_at)
        VALUES (${sha256Hex(token)}, ${userId}, ${expiry})`,
  )
}

export interface ResolvedSession {
  userId: string
}

/** Authenticates and rolls the expiry in one statement; an expired row is left unchanged. */
export async function resolveSession(
  db: Db,
  token: string,
): Promise<ResolvedSession | null> {
  const rows = await query(
    db,
    sql`UPDATE sessions
        SET expires_at = ${expiry}
        WHERE token_hash = ${sha256Hex(token)}
          AND expires_at > now()
          -- A scrubbed account authenticates nothing, whatever rows survive.
          -- Deletion destroys its sessions in the same transaction as the
          -- scrub (8.10), so this predicate should never be the thing that
          -- refuses; it is here so that revocation does not rest on one
          -- statement having run.
          AND EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = sessions.user_id AND u.deleted_at IS NULL
          )
        RETURNING user_id`,
  )
  const userId = rows[0]?.user_id
  return typeof userId === 'string' ? { userId } : null
}

/** Sign-out: one session, never the person's other clients (10.1). */
export async function destroySession(db: Db, token: string): Promise<void> {
  await db.execute(
    sql`DELETE FROM sessions WHERE token_hash = ${sha256Hex(token)}`,
  )
}

/** Account deletion: every session at once (8.10 step 8). */
export async function destroyAllSessionsForUser(
  db: Db,
  userId: string,
): Promise<void> {
  await db.execute(sql`DELETE FROM sessions WHERE user_id = ${userId}`)
}

/** Hygiene for the scheduler, not revocation: resolveSession already refuses expired rows. */
export async function pruneExpiredSessions(db: Db): Promise<number> {
  const rows = await query(
    db,
    sql`DELETE FROM sessions WHERE expires_at <= now() RETURNING token_hash`,
  )
  return rows.length
}
