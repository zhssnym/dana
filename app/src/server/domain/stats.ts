/*
The operators' stats, read from rows Dana already keeps; nothing new is
recorded about anyone to produce them. Counts, plus one row per account with
its email, join day, last active day and work page count, which is what the
Privacy page tells people operators can see. No page names or content.

- People: live accounts (`deleted_at IS NULL`).
- Work pages: live `folders` rows of kind 'work', minus each account's
  default folder (Desk) and minus what the sample workspace created, so the
  count is pages people made themselves. A trashed page is not counted.
- Active: every authenticated request rolls its session's `expires_at` to
  now() + SESSION_TTL_DAYS (auth/sessions.ts, passed in by the route because
  the domain may not import auth), so `expires_at - TTL` is when that session
  was last used. A person is active in a window when any of
  their sessions was. Signing out deletes the session, so someone who signed
  out is undercounted until they come back; there is no history beyond the
  30 days a session lives.
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { GetStatsResponse } from '../../shared/stats.js'
import { rowsOf } from '../database.js'

const WEEKS = 12

const workPages = sql`
  SELECT f.owner_id, f.created_at FROM folders f
   WHERE f.kind = 'work' AND NOT f.is_default AND f.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM sample_objects s WHERE s.kind = 'folder' AND s.id = f.id)`

const num = (value: unknown): number => Number(value ?? 0)

export async function readStats(db: Db, sessionTtlDays: number): Promise<GetStatsResponse> {
  const ttl = sql.raw(`interval '${String(Math.trunc(sessionTtlDays))} days'`)
  const [totals] = await rowsOf(db, sql`
    WITH pages AS (${workPages}),
         people AS (SELECT created_at FROM users WHERE deleted_at IS NULL),
         seen AS (
           SELECT s.user_id, max(s.expires_at) - ${ttl} AS at
             FROM sessions s JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
            WHERE s.expires_at > now()
            GROUP BY s.user_id)
    SELECT
      (SELECT count(*) FROM people) AS people_total,
      (SELECT count(*) FROM people WHERE created_at >= date_trunc('week', now())) AS people_week,
      (SELECT count(*) FROM pages) AS pages_total,
      (SELECT count(*) FROM pages WHERE created_at >= date_trunc('week', now())) AS pages_week,
      (SELECT count(*) FROM seen WHERE at > now() - interval '1 day') AS active_day,
      (SELECT count(*) FROM seen WHERE at > now() - interval '7 days') AS active_week,
      (SELECT count(*) FROM seen WHERE at > now() - interval '30 days') AS active_month`)

  const weeks = await rowsOf(db, sql`
    WITH pages AS (${workPages}),
         w AS (
           SELECT generate_series(
             date_trunc('week', now()) - ${sql.raw(`interval '${String(WEEKS - 1)} weeks'`)},
             date_trunc('week', now()),
             interval '1 week') AS start)
    SELECT to_char(w.start, 'YYYY-MM-DD') AS week_start,
      (SELECT count(*) FROM users u WHERE u.deleted_at IS NULL
          AND u.created_at >= w.start AND u.created_at < w.start + interval '1 week') AS new_people,
      (SELECT count(*) FROM pages p
          WHERE p.created_at >= w.start AND p.created_at < w.start + interval '1 week') AS new_work_pages
      FROM w ORDER BY w.start`)

  const people = await rowsOf(db, sql`
    WITH pages AS (${workPages})
    SELECT u.email,
      to_char(u.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS joined_on,
      (SELECT to_char((max(s.expires_at) - ${ttl}) AT TIME ZONE 'UTC', 'YYYY-MM-DD')
         FROM sessions s WHERE s.user_id = u.id AND s.expires_at > now()) AS last_active_on,
      (SELECT count(*) FROM pages p WHERE p.owner_id = u.id) AS work_pages
      FROM users u
     WHERE u.deleted_at IS NULL
     ORDER BY last_active_on DESC NULLS LAST, u.created_at DESC`)

  const t = totals ?? {}
  return {
    people: { total: num(t.people_total), new_this_week: num(t.people_week) },
    active: { day: num(t.active_day), week: num(t.active_week), month: num(t.active_month) },
    work_pages: { total: num(t.pages_total), new_this_week: num(t.pages_week) },
    weeks: weeks.map((row) => ({
      week_start: String(row.week_start),
      new_people: num(row.new_people),
      new_work_pages: num(row.new_work_pages),
    })),
    people_list: people.map((row) => ({
      email: typeof row.email === 'string' ? row.email : null,
      joined_on: String(row.joined_on),
      last_active_on: typeof row.last_active_on === 'string' ? row.last_active_on : null,
      work_pages: num(row.work_pages),
    })),
  }
}

/** `DANA_OPERATORS`: a comma-separated list of emails allowed to read the stats. */
export function operatorEmails(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? '').split(',').map((email) => email.trim().toLowerCase()).filter((email) => email !== ''),
  )
}

export async function isOperator(db: Db, userId: string, operators: ReadonlySet<string>): Promise<boolean> {
  if (operators.size === 0 || userId === '') return false
  const [row] = await rowsOf(db, sql`
    SELECT email FROM users WHERE id = ${userId}::uuid AND deleted_at IS NULL`)
  return typeof row?.email === 'string' && operators.has(row.email)
}
