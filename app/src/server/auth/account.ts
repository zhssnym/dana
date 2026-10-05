/* The account half of 7.1: GET, PATCH and DELETE /me. */
import { sql } from 'drizzle-orm'
import type { Request, Response } from 'express'

import type { Db } from '../../../db/client.js'
import type { ObjectStore } from '../files/store.js'
import { patchMeBody } from '../../shared/me.js'
import type { MeResponse } from '../../shared/me.js'
import { deleteAccountData } from '../domain/account-deletion.js'
import type { AccountDeletionCounts } from '../domain/account-deletion.js'
import { sendError } from '../http/errors.js'
import { parseBody } from '../http/parse-body.js'
import type { SecurityLogger } from '../security/log.js'
import { clearSessionCookies } from './cookies.js'
import { inTransaction, rowsOf } from '../database.js'
import { sameZone, writeTimezone } from './timezone-sync.js'

/* The body is typed by shared/me.ts, the contract the client reads. */
export async function meBody(db: Db, userId: string): Promise<MeResponse | null> {
  const found = await rowsOf(
    db,
    sql`SELECT u.id, u.email, u.display_name, u.avatar_url, u.timezone,
               s.show_important, s.show_all, s.show_done
        FROM users u
        LEFT JOIN user_settings s ON s.user_id = u.id
        WHERE u.id = ${userId} AND u.deleted_at IS NULL`,
  )
  const row = found[0]
  if (row === undefined) return null

  // Q12: invites matched by lowercased email (8.7).
  const email = row.email === null ? null : String(row.email)
  const pending =
    email === null
      ? 0
      : Number(
          (
            await rowsOf(
              db,
              sql`SELECT count(*)::int AS n FROM invites
                  WHERE email = ${email} AND status = 'pending'`,
            )
          )[0]?.n ?? 0,
        )

  // INV-14: a missing settings row is a broken invariant. Throw rather than
  // answer plausible but wrong defaults.
  if (row.show_important === null || row.show_important === undefined) {
    throw new Error(`user ${userId} has no user_settings row (INV-14)`)
  }

  return {
    user: {
      id: String(row.id),
      email,
      display_name: row.display_name === null ? null : String(row.display_name),
      avatar_url: row.avatar_url === null ? null : String(row.avatar_url),
      timezone: String(row.timezone),
    },
    settings: {
      show_important: Boolean(row.show_important),
      show_all: Boolean(row.show_all),
      show_done: Boolean(row.show_done),
    },
    pending_invite_count: pending,
  }
}

export async function handleGetMe(
  db: Db,
  userId: string,
  res: Response,
): Promise<void> {
  const body = await meBody(db, userId)
  if (body === null) {
    sendError(res, 401, 'unauthenticated', 'Sign in to continue.')
    return
  }
  res.status(200).json(body)
}

export async function handlePatchMe(
  db: Db,
  userId: string,
  req: Request,
  res: Response,
  /* The auth router's logger, so these lines land in the same sink. */
  securityLog: SecurityLogger,
): Promise<void> {
  const parsed = parseBody(patchMeBody, req, res, securityLog)
  if (parsed === null) return

  /*
  Compare and write in one transaction. A tzdb alias of the stored zone is not
  a change: no write and no reminder recompute (8.1). writeTimezone is shared
  with the login sync so both doors recompute (AC-086).
  */
  await inTransaction(db, async (tx) => {
    const current = await rowsOf(
      tx,
      sql`SELECT timezone FROM users WHERE id = ${userId}`,
    )
    const stored = current[0]?.timezone
    if (typeof stored === 'string' && sameZone(parsed.timezone, stored)) {
      return
    }
    await writeTimezone(tx, userId, parsed.timezone)
  })

  const body = await meBody(db, userId)
  if (body === null) {
    sendError(res, 401, 'unauthenticated', 'Sign in to continue.')
    return
  }
  res.status(200).json(body)
}

/*
DELETE /me: the whole 8.10 transaction. deleteAccountData runs steps 1 to 6c on
this transaction's executor; step 7 scrubs the user row (it is kept so
references render as "Deleted user", AC-138) and step 8 deletes every session.
All in one transaction, so a scrubbed account never keeps live sessions. The
explicit sessions DELETE is required: the row is updated, not deleted, so
`sessions_user_id_fkey`'s CASCADE never fires.
*/
export async function handleDeleteMe(
  db: Db,
  userId: string,
  res: Response,
  fileStore?: ObjectStore,
): Promise<AccountDeletionCounts & { sessions: number }> {
  const deleted = await inTransaction(db, async (tx) => {
    const counts = await deleteAccountData(tx, userId)
    const sessions = await rowsOf(
      tx,
      sql`SELECT count(*)::int AS n FROM sessions WHERE user_id = ${userId}`,
    )
    await tx.execute(
      sql`UPDATE users
          SET google_sub = NULL,
              email = NULL,
              display_name = NULL,
              avatar_url = NULL,
              deleted_at = now()
          WHERE id = ${userId}`,
    )
    await tx.execute(sql`DELETE FROM sessions WHERE user_id = ${userId}`)
    return { ...counts, sessions: Number(sessions[0]?.n ?? 0) }
  })
  // Objects leave the store only after the rows commit. Best effort: the
  // account is already gone, so a failed removal must not become a 500.
  if (fileStore !== undefined) {
    for (const id of deleted.fileIds) {
      try {
        await fileStore.remove(id)
      } catch {
        // The bytes are unreachable now; nothing to retry.
      }
    }
  }
  clearSessionCookies(res)
  res.status(204).end()
  return deleted
}
