/*
The sessions table of 10.1, which fixes four facts this module writes to: the
table name, user_id cascading from users(id), expires_at timestamptz reset to
30 days out by every authenticated request, and token_hash, the primary key,
holding the lowercase hex sha256 digest of the cookie's token.

The order inside resolveSession is the whole of AC-113's sharpest case. An
implementation that rolls the expiry and then checks it renews the row it is
about to reject, so an abandoned session never dies and the 30-day rule
silently becomes forever. Writing the check into the UPDATE's own WHERE clause
makes the wrong order unexpressible rather than merely avoided: the statement
extends a row only if that row is still live, and returns nothing otherwise.
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

/*
The deadline is computed by the database rather than by this process, because
the predicate that tests it is the database's now(). Mixing the two clocks
would make every session longer or shorter than 30 days by whatever the skew
between the application host and the Postgres host happens to be, silently and
in whichever direction.
*/
const expiry = sql.raw(`now() + interval '${String(SESSION_TTL_DAYS)} days'`)

/**
 * Issues a fresh identifier and stores only its digest. The raw token is the
 * return value and is never written anywhere: it exists in the response
 * cookie and nowhere else (10.1).
 */
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

/**
 * Authenticates a token and rolls its expiry in one statement. Returns null
 * for an unknown, malformed, or expired identifier, and an expired row is
 * left exactly as it was.
 */
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

/**
 * Account deletion: every session at once, and immediately (8.10 step 8).
 * 11.6 is explicit that revocation never waits for the pruning pass.
 */
export async function destroyAllSessionsForUser(
  db: Db,
  userId: string,
): Promise<void> {
  await db.execute(sql`DELETE FROM sessions WHERE user_id = ${userId}`)
}

/**
 * The opportunistic hygiene of 11.6, called by the scheduler pass (11.7). It is hygiene and not revocation: every path that
 * revokes does so by deleting rows itself, and resolveSession already refuses
 * an expired row this has not reached yet.
 */
export async function pruneExpiredSessions(db: Db): Promise<number> {
  const rows = await query(
    db,
    sql`DELETE FROM sessions WHERE expires_at <= now() RETURNING token_hash`,
  )
  return rows.length
}
