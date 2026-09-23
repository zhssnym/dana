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

/*
The 7.1 body's shape comes from the contract rather than from a copy of it:
src/shared/me.ts is what the client and the acceptance suite read, so a second declaration here is a second promise that can drift
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
  /* Handed in rather than constructed here, the way every router in this
     repository takes it: this is a handler the auth router calls, and its
     10.5 lines have to land in the same sink as that router's (issue #104). */
  securityLog: SecurityLogger,
): Promise<void> {
  const parsed = parseBody(patchMeBody, req, res, securityLog)
  if (parsed === null) return

  /*
  The comparison and its consequence in one transaction, and the whole of 7.1's
  second sentence about this endpoint inside it.

  8.1's alias rule applies here in the same sentence that gives it to the login
  path: "a reported zone that is a tzdb alias of the stored one is not a
  different zone: no write, and no 8.6 recompute". Writing US/Eastern over
  America/New_York would hand the account a zone its owner never chose, and
  would move every reminder instant for a request that changed nothing.

  The read joins the write here rather than preceding it from outside, so the
  decision is taken against the row the write then lands on. 8.3 still governs
  which zone survives two concurrent PATCHes, last write wins; what this buys is
  narrower and worth having, that no interleaving can leave the column moved by
  one request and the instants recomputed against the other's reading of it.

  writeTimezone is the login sync's function, called unchanged: 7.1 charges both
  doors with the same recompute (AC-086), and wiring only one of them is a
  defect.
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
DELETE /me runs the section 8.10 transaction, all of it. Steps 1 to 6c
(invalidating sent invites, transferring or deleting owned folders, cleaning
memberships, clearing connections, sweeping My Day, the files, and 6c's nine
personal tables) are src/server/domain/account-deletion.ts, called below with
this transaction's executor. The last two stay here:

  7  scrub the user row: google_sub, email, display_name, avatar_url set null,
     deleted_at = now()
  8  destroy all sessions of the user

That split is a deliberate module seam, and it is why
deleteAccountData takes an executor rather than a handle. One transaction, not
two: 8.10's first words are "One transaction", and eight steps across two of
them would be two failure modes, one of them a scrubbed account whose folders
were never handed on.

The call goes ahead of the scrub because 8.10 numbers it there, and the order
within those six steps is the module's own header to explain: it exists so the
RESTRICT on folders.owner_id (4.3) can never fire. It cannot fire from here in
any case, because step 7 scrubs the user row rather than deleting it, which is
also what lets tasks.created_by and friends keep pointing at it.

The scrub is what makes the account gone: it releases the unique google_sub so
a future sign-in provisions a fresh account, and it empties the personal data
while leaving the row for those surviving references to render as "Deleted
user" (AC-138).

Sessions are destroyed immediately and all of them (11.6: revocation never
waits for the pruning pass). A failure between a committed scrub and an
uncommitted revocation would leave a deleted account whose every session still
authenticates, which is the one-transaction argument seen from the near end.

**Step 8 is also the one thing standing between `sessions_user_id_fkey` and
the class issue #253 found**, and it is named here because the statement
below is the only place a reader can check it. That key is
`ON DELETE CASCADE`, which for every other table in this schema means the
rows are taken by nothing, the scrub two paragraphs up being an UPDATE. The
sessions of a deleted account leave because the DELETE below is written, not
because the constraint says so; `USER_CASCADE_DISPOSALS` in the domain module
carries the same sentence for the other fourteen.
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
  // 8.10 step 6a's second half: the objects leave the store only after the
  // rows committed, the order 7.15's delete uses. Best effort per id: the
  // deletion is committed and the sessions are gone, so a failed removal
  // must not turn an account that no longer exists into a 500 nobody can
  // retry; an object that survives a failed rm is unreachable, every row
  // that named it being gone.
  if (fileStore !== undefined) {
    for (const id of deleted.fileIds) {
      try {
        await fileStore.remove(id)
      } catch {
        // Unreachable bytes; the disk store's rm is force and rarely throws.
      }
    }
  }
  clearSessionCookies(res)
  res.status(204).end()
  return deleted
}
