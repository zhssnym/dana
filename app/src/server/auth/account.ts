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
import { sendError, sendValidationError } from '../http/errors.js'
import { clearSessionCookies } from './cookies.js'
import { rowsOf } from './provisioning.js'
import { destroyAllSessionsForUser } from './sessions.js'

export interface MeBody {
  user: {
    id: string
    email: string | null
    display_name: string | null
    avatar_url: string | null
    timezone: string
  }
  settings: {
    show_important: boolean
    show_all: boolean
    show_done: boolean
  }
  pending_invite_count: number
}

export async function meBody(db: Db, userId: string): Promise<MeBody | null> {
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

  await db.execute(
    sql`UPDATE users SET timezone = ${parsed.data.timezone} WHERE id = ${userId}`,
  )
  // 7.1 also recomputes fire_at for scheduled reminders assigned to V (8.6).
  // No reminder can exist before P7 lands the table's writers, so there is
  // nothing to recompute here yet; the obligation is P7's to pick up.

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

Sessions are destroyed after the scrub commits, immediately and all of them
(11.6: revocation never waits for the pruning pass).
*/
export async function handleDeleteMe(
  db: Db,
  userId: string,
  res: Response,
): Promise<void> {
  await db.execute(
    sql`UPDATE users
        SET google_sub = NULL,
            email = NULL,
            display_name = NULL,
            avatar_url = NULL,
            deleted_at = now()
        WHERE id = ${userId}`,
  )
  await destroyAllSessionsForUser(db, userId)
  clearSessionCookies(res)
  res.status(204).end()
}
