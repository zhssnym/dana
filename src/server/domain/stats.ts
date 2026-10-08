// Operator stats from rows Dana already keeps; no page names or content.
// "Active" uses session expires_at minus the TTL as last use, so signed-out people are undercounted.
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { GetStatsResponse } from '../../shared/stats.js'
import { rowsOf } from '../database.js'

const WEEKS = 12

const workPages = sql`
  SELECT f.owner_id, f.created_at FROM folders f
   WHERE f.kind = 'work' AND NOT f.is_default AND f.deleted_at IS NULL AND f.archived_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM sample_objects s WHERE s.kind = 'folder' AND s.id = f.id)`

// Accounts without an email (sample people) are not counted.
const counted = sql`u.deleted_at IS NULL AND u.email IS NOT NULL`

const num = (value: unknown): number => Number(value ?? 0)

export async function readStats(db: Db, sessionTtlDays: number): Promise<GetStatsResponse> {
  const ttl = sql.raw(`interval '${String(Math.trunc(sessionTtlDays))} days'`)
  const [totals] = await rowsOf(db, sql`
    WITH pages AS (${workPages}),
         people AS (SELECT u.created_at FROM users u WHERE ${counted}),
         seen AS (
           SELECT s.user_id, max(s.expires_at) - ${ttl} AS at
             FROM sessions s JOIN users u ON u.id = s.user_id AND ${counted}
            WHERE s.expires_at > now()
            GROUP BY s.user_id)
    SELECT
      (SELECT count(*) FROM people) AS people_total,
      (SELECT count(*) FROM people WHERE created_at >= date_trunc('week', now(), 'UTC')) AS people_week,
      (SELECT count(*) FROM pages) AS pages_total,
      (SELECT count(*) FROM pages WHERE created_at >= date_trunc('week', now(), 'UTC')) AS pages_week,
      (SELECT count(*) FROM seen WHERE at > now() - interval '1 day') AS active_day,
      (SELECT count(*) FROM seen WHERE at > now() - interval '7 days') AS active_week,
      (SELECT count(*) FROM seen WHERE at > now() - interval '30 days') AS active_month`)

  const weeks = await rowsOf(db, sql`
    WITH pages AS (${workPages}),
         w AS (
           SELECT generate_series(
             date_trunc('week', now(), 'UTC') - ${sql.raw(`interval '${String(WEEKS - 1)} weeks'`)},
             date_trunc('week', now(), 'UTC'),
             interval '1 week') AS start)
    SELECT to_char(w.start AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS week_start,
      (SELECT count(*) FROM users u WHERE ${counted}
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
     WHERE ${counted}
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
