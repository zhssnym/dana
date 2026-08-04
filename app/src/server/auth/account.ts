/*
The account half of 7.1: GET /me, PATCH /me, DELETE /me. Sessions and the
OIDC handshake live next door in router.ts; what these three share is that
they all speak for one authenticated person.

The /me body is 7.1's, exactly: user, settings, pending_invite_count. The
count is Q12's, the pending invites addressed to this person's email, which
the app surfaces the moment they arrive from a sign-in.
*/
import { sql } from 'drizzle-orm'
import type { Request, Response } from 'express'

import type { Db } from '../../../db/client.js'
import { patchMeBody } from '../../shared/me.js'
import type { MeResponse } from '../../shared/me.js'
import { sendError, sendValidationError } from '../http/errors.js'
import { clearSessionCookies } from './cookies.js'
import { inTransaction, rowsOf } from './provisioning.js'
import { sameZone } from './timezone-sync.js'

/*
The 7.1 body's shape comes from the contract rather than from a copy of it.
This was a local interface through P1, carried since that merge review as the
one-line convergence: src/shared/me.ts is what the client and the acceptance
suite read, so a second declaration here is a second promise that can drift
from the first. Its settings key is the same 7.2 object settings.ts answers.
*/
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

  // Q12: invites are addressed to an email address, matched lowercased (8.7).
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

  // INV-14 gives every user exactly one settings row. If it is missing the
  // invariant is broken, and coercing three nulls to false would answer with
  // a plausible object whose values are the inverse of two of 4.10's
  // defaults: a wrong answer that looks right. Refusing is the honest one.
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
): Promise<void> {
  const parsed = patchMeBody.safeParse(req.body)
  if (!parsed.success) {
    sendValidationError(res, parsed.error)
    return
  }

  // 8.1's alias rule applies to this endpoint in the same sentence that gives
  // it to the login path: "a reported zone that is a tzdb alias of the stored
  // one is not a different zone: no write, and no 8.6 recompute". Writing
  // US/Eastern over America/New_York would hand the account a zone its owner
  // never chose, and would trigger a recompute of every reminder for nothing.
  const current = await rowsOf(
    db,
    sql`SELECT timezone FROM users WHERE id = ${userId}`,
  )
  const stored = current[0]?.timezone
  const changed =
    typeof stored !== 'string' || !sameZone(parsed.data.timezone, stored)

  if (changed) {
    await db.execute(
      sql`UPDATE users SET timezone = ${parsed.data.timezone} WHERE id = ${userId}`,
    )
    // 7.1 also recomputes fire_at for scheduled reminders assigned to V
    // (8.6), and only when the zone actually changed. No reminder can exist
    // before P7 lands the table's writers, so there is nothing to recompute
    // here yet; the obligation is P7's to pick up, at this branch.
  }

  const body = await meBody(db, userId)
  if (body === null) {
    sendError(res, 401, 'unauthenticated', 'Sign in to continue.')
    return
  }
  res.status(200).json(body)
}

/*
DELETE /me runs the section 8.10 transaction. Steps 1 to 6 (invalidating sent
invites, transferring or deleting owned folders, cleaning memberships,
connections, and My Day entries) belong to the Collaboration engineer's module
and land with the packages that create those rows; per the RFC 0001 P1 row,
this stub carries only the two steps that exist at P1, and they are the two
this role owns outright:

  7  scrub the user row: google_sub, email, display_name, avatar_url set null,
     deleted_at = now()
  8  destroy all sessions of the user

The scrub is what makes the account gone: it releases the unique google_sub so
a future sign-in provisions a fresh account, and it empties the personal data
while leaving the row for tasks.created_by and friends to point at, which is
what 8.10 means by rendering as "Deleted user". No row is hard-deleted here,
so the RESTRICT tripwire on folders.owner_id that step ordering exists to
avoid cannot fire against this stub.

Both steps run inside one transaction, because 8.10's first words are "One
transaction" and the pair is exactly where that matters: a failure between a
committed scrub and an uncommitted revocation would leave a deleted account
whose every session still authenticates. Sessions are destroyed immediately
and all of them (11.6: revocation never waits for the pruning pass).
*/
export async function handleDeleteMe(
  db: Db,
  userId: string,
  res: Response,
): Promise<void> {
  await inTransaction(db, async (tx) => {
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
  })
  clearSessionCookies(res)
  res.status(204).end()
}
