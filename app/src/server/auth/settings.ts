/*
The 7.2 settings endpoints, GET and PATCH /me/settings. They sit in the auth
module beside the 7.1 account endpoints because they speak for one
authenticated person and take no id at all: 4.10 keys user_settings on
user_id, so the viewer is the row. That is the whole of the 10.2 chokepoint
here, and it is why every statement below is keyed by the session's user id
and nothing the request carries.

Hidden pages are a navigation preference only (7.2). Nothing in this file
touches a row outside user_settings, and there is no reading of the toggles
under which it should: a hidden page is a page the client does not render,
never a licence to clear importance flags or archive completed rows (AC-123).
*/
import { sql } from 'drizzle-orm'
import type { Request, Response } from 'express'

import type { Db } from '../../../db/client.js'
import { patchMeSettingsBody } from '../../shared/me.js'
import type { PatchMeSettingsBody, Settings } from '../../shared/me.js'
import { parseBody } from '../http/parse-body.js'
import type { SecurityLogger } from '../security/log.js'
import { rowsOf } from '../database.js'

/** The three 7.2 columns, named once so read and write cannot select
 * different halves of the same object. */
const COLUMNS = sql`show_important, show_all, show_done`

/**
 * A stored row as the shared Settings shape.
 *
 * Refusing rather than coercing, for account.ts's reason: INV-14 gives every
 * user exactly one settings row and 4.10 makes all three columns NOT NULL
 * booleans, so anything else here is a broken invariant, and Boolean() would
 * turn it into a plausible object whose values are nobody's settings. A
 * missing row and a non-boolean column are the same fault and answer the same
 * way, as a 5xx rather than a confident wrong answer.
 */
function settingsFrom(
  row: Record<string, unknown> | undefined,
  userId: string,
): Settings {
  const stored = (key: keyof Settings): boolean => {
    const value = row?.[key]
    if (typeof value !== 'boolean') {
      throw new Error(
        `user ${userId} has no boolean ${key} in user_settings (INV-14, 4.10)`,
      )
    }
    return value
  }
  return {
    show_important: stored('show_important'),
    show_all: stored('show_all'),
    show_done: stored('show_done'),
  }
}

/** The GET /me/settings body: this account's row, never a constant. */
export async function readSettings(db: Db, userId: string): Promise<Settings> {
  const found = await rowsOf(
    db,
    sql`SELECT ${COLUMNS} FROM user_settings WHERE user_id = ${userId}`,
  )
  return settingsFrom(found[0], userId)
}

/*
The write. Any subset of the three booleans (7.2), and only the fields the
body carried are named in the statement.

That is a correctness property, not an economy. An implementation that reads
the row, merges the patch, and writes all three columns loses one side of two
concurrent disjoint PATCHes: each writes what it read before the other
committed, and the second overwrites the first's column with a stale value.
Naming only the present columns lets the two compose under any interleaving,
which is what AC-120 races for.

The answer comes from RETURNING rather than a follow-up SELECT, so the ruled
fresh-GET body is the row this statement produced, with no window between the
write and the read for another request to widen.

The empty subset writes nothing at all. It is a subset (7.2), so it answers
200 with the unchanged row rather than being refused, and a no-op UPDATE
would move updated_at for a request that changed nothing.
*/
export async function writeSettings(
  db: Db,
  userId: string,
  patch: PatchMeSettingsBody,
): Promise<Settings> {
  const sets = []
  if (patch.show_important !== undefined) {
    sets.push(sql`show_important = ${patch.show_important}`)
  }
  if (patch.show_all !== undefined) sets.push(sql`show_all = ${patch.show_all}`)
  if (patch.show_done !== undefined) {
    sets.push(sql`show_done = ${patch.show_done}`)
  }
  if (sets.length === 0) return readSettings(db, userId)

  sets.push(sql`updated_at = now()`)
  const updated = await rowsOf(
    db,
    sql`UPDATE user_settings SET ${sql.join(sets, sql`, `)}
        WHERE user_id = ${userId}
        RETURNING ${COLUMNS}`,
  )
  return settingsFrom(updated[0], userId)
}

export async function handleGetSettings(
  db: Db,
  userId: string,
  res: Response,
): Promise<void> {
  res.status(200).json(await readSettings(db, userId))
}

export async function handlePatchSettings(
  db: Db,
  userId: string,
  req: Request,
  res: Response,
  /* account.ts's reason, one file over (issue #104). */
  securityLog: SecurityLogger,
): Promise<void> {
  // Validate, then delegate: the schema refuses every non-boolean including
  // null (4.10 admits no null state) with a 422 naming the field, and it
  // refuses the whole body, so a valid field cannot land beside a refused one.
  const parsed = parseBody(patchMeSettingsBody, req, res, securityLog)
  if (parsed === null) return
  // 7.2, by the owner's ruling: the PATCH answers the GET /me/settings object.
  res.status(200).json(await writeSettings(db, userId, parsed))
}
