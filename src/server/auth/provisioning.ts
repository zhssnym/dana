/*
The 7.1 provisioning transaction: user, default Desk project with its Docs tab,
owner membership and settings row, all in the caller's transaction.
Idempotent through ON CONFLICT (google_sub) DO NOTHING, not read-then-write: of
two concurrent first sign-ins the loser waits on the winner's index tuple, then
adopts its rows (one Desk, INV-2; one settings row, INV-14).
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { Executor } from '../database.js'
import { inTransaction, rowsOf } from '../database.js'
import { recordAccessTransition } from '../domain/folder-access.js'
import type { SignupSource } from './pending.js'
import { sameZone, writeTimezone } from './timezone-sync.js'

/*
Must match the Desk sentence in the client's `routes.ts` (AC-315); nothing
checks it, so reword both together. New accounts only; never backfilled.
*/
export const DESK_DEFAULT_DESCRIPTION = 'A home for things you have not sorted yet.'

export interface GoogleIdentity {
  sub: string
  email: string
  displayName: string | null
  avatarUrl: string | null
}

export interface ProvisionOptions {
  source?: SignupSource | undefined
}

/**
 * A verified email already held by another live account. Dana never joins the
 * two (10.1); the callback shows a page for it. Carries no address or id.
 */
export class EmailAlreadyClaimedError extends Error {
  constructor() {
    super('this verified email already belongs to another account')
    this.name = 'EmailAlreadyClaimedError'
  }
}

export interface ProvisionedUser {
  id: string
  timezone: string
  created: boolean
}

export interface EmailStanding {
  subjectKnown: boolean
  addressClaimed: boolean
}

/*
The collision read. ON CONFLICT covers only google_sub, so a new subject on a
claimed address would raise on `users_email_active_idx`. Only an unknown
subject is refused: a known one keeps signing in even if its Google address
moved. Exported because the callback re-reads it after a rollback to catch two
new subjects racing for one address, without parsing driver error text.
*/
export async function emailStanding(
  executor: Executor,
  identity: GoogleIdentity,
): Promise<EmailStanding> {
  const found = await rowsOf(
    executor,
    sql`SELECT
          (SELECT count(*)::int FROM users
            WHERE google_sub = ${identity.sub}) AS mine,
          (SELECT count(*)::int FROM users
            WHERE email = ${identity.email.toLowerCase()}
              AND google_sub <> ${identity.sub}
              AND deleted_at IS NULL) AS theirs`,
  )
  return {
    subjectKnown: Number(found[0]?.mine ?? 0) > 0,
    addressClaimed: Number(found[0]?.theirs ?? 0) > 0,
  }
}

/**
 * The refusal condition, shared by provisionUser and the callback. Keep
 * `subjectKnown`: without it a returning user whose Google address moved onto
 * a live account is locked out, and no ordinary test notices (AC-346).
 */
export function isEmailCollision(standing: EmailStanding): boolean {
  return !standing.subjectKnown && standing.addressClaimed
}

/**
 * New accounts store the reported zone, or UTC. Existing accounts are left to
 * syncTimezone (8.1).
 */
export async function provisionUser(
  db: Db,
  identity: GoogleIdentity,
  reportedTimezone: string | undefined,
  options: ProvisionOptions = {},
): Promise<ProvisionedUser> {
  const source = options.source
  return inTransaction(db, async (tx) => {
    // Refused before the insert; see isEmailCollision.
    if (isEmailCollision(await emailStanding(tx, identity))) {
      throw new EmailAlreadyClaimedError()
    }

    const inserted = await rowsOf(
      tx,
      // Source order: a tagged link, then a pending invite, then the referrer host, else direct.
      sql`INSERT INTO users (google_sub, email, display_name, avatar_url, timezone, signup_source, signup_campaign)
          VALUES (
            ${identity.sub},
            ${identity.email.toLowerCase()},
            ${identity.displayName},
            ${identity.avatarUrl},
            ${reportedTimezone ?? 'UTC'},
            COALESCE(
              ${source?.tag ?? null}::text,
              (SELECT 'invite' FROM invites
                WHERE email = ${identity.email.toLowerCase()} AND status = 'pending' LIMIT 1),
              ${source?.referrer ?? null}::text,
              'direct'),
            ${source?.campaign ?? null}::text
          )
          ON CONFLICT (google_sub) DO NOTHING
          RETURNING id, timezone`,
    )

    const winner = inserted[0]
    if (winner === undefined) {
      // Lost the race or a returning login: adopt the existing rows, create nothing.
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
      sql`INSERT INTO folders (id, owner_id, name, is_default, description, project_id, kind, tab_position)
          SELECT g.id, ${userId}, 'Desk', true, ${DESK_DEFAULT_DESCRIPTION}, g.id, 'work', 'a0'
            FROM (SELECT gen_random_uuid() AS id) g
          RETURNING id`,
    )
    const folderId = String(folders[0]?.id)
    await tx.execute(
      sql`INSERT INTO folders (id, owner_id, name, project_id, kind, tab_position)
          VALUES (gen_random_uuid(), ${userId}, 'Docs', ${folderId}::uuid, 'doc', 'a1')`,
    )
    // The owner is a full_control member of their own Desk (INV-3, INV-10),
    // with its baseline history entry in the same transaction.
    await tx.execute(
      sql`INSERT INTO folder_members (folder_id, user_id, access)
          VALUES (${folderId}, ${userId}, 'full_control')`,
    )
    await recordAccessTransition(tx, {
      folderId,
      memberId: userId,
      previousAccess: null,
      newAccess: 'full_control',
      actorId: userId,
      transition: 'created_owner',
    })

    await tx.execute(sql`INSERT INTO user_settings (user_id) VALUES (${userId})`)

    return { id: userId, timezone: String(winner.timezone), created: true }
  })
}

/**
 * 8.1's auto-sync. No reported zone or an alias of the stored one means no
 * write and no 8.6 recompute (AC-086). Runs after provisionUser has committed.
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
