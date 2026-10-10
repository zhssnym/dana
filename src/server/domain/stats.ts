// Operator stats from rows Dana already keeps; no page names or content.
// "Active" uses session expires_at minus the TTL as last use, so signed-out people are undercounted.
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { GetStatsResponse } from '../../shared/stats.js'
import { rowsOf } from '../database.js'
import { operatorEmails } from './operators.js'

export { operatorEmails }

const WEEKS = 12

const workPages = sql`
  SELECT f.owner_id, f.created_at FROM folders f
   WHERE f.kind = 'work' AND NOT f.is_default AND f.deleted_at IS NULL AND f.archived_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM sample_objects s WHERE s.kind = 'folder' AND s.id = f.id)`

// Accounts without an email (sample people) are not counted.
const counted = sql`u.deleted_at IS NULL AND u.email IS NOT NULL`

const num = (value: unknown): number => Number(value ?? 0)

/*
One row per thing a counted person did: (user_id, at, what). Built from rows Dana already keeps.
Sample workspace objects are left out, so playing with the sample is not counted as use.
*/
const actions = sql`
  SELECT e.actor_id AS user_id, e.created_at AS at,
         CASE WHEN e.subject_kind = 'task' AND e.verb = 'created' THEN 'task_created'
              WHEN e.subject_kind = 'task' AND e.verb = 'completed' THEN 'task_completed'
              WHEN e.subject_kind = 'folder' AND e.verb = 'created' THEN 'page_created'
              ELSE 'edit' END AS what
    FROM events e
   WHERE e.subject_kind <> 'comment'
     AND NOT EXISTS (SELECT 1 FROM sample_objects so WHERE so.id = e.subject_id)
  UNION ALL SELECT c.author_id, c.created_at, 'comment' FROM comments c
   WHERE NOT EXISTS (SELECT 1 FROM sample_objects so WHERE so.id = c.folder_id)
  UNION ALL SELECT m.author_id, m.created_at, 'message' FROM direct_messages m
  UNION ALL SELECT f.owner_id, f.created_at, 'upload' FROM files f
   WHERE f.kind <> 'avatar' AND NOT EXISTS (SELECT 1 FROM sample_objects so WHERE so.id = f.folder_id)
  UNION ALL SELECT i.inviter_id, i.created_at, 'invite' FROM invites i`

// Every live page and task a person made, sample workspace and each Desk left out.
const allPages = sql`
  SELECT f.owner_id FROM folders f
   WHERE NOT f.is_default AND f.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM sample_objects s WHERE s.id = f.id)`
const allTasks = sql`
  SELECT t.created_by FROM tasks t
   WHERE t.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM sample_objects s WHERE s.id = t.id)`

const ACTION_ORDER = ['task_created', 'task_completed', 'page_created', 'edit', 'comment', 'message', 'upload', 'invite']

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
      (SELECT count(*) FROM (${allPages}) p JOIN users u ON u.id = p.owner_id AND ${counted}) AS all_pages,
      (SELECT count(*) FROM (${allTasks}) t JOIN users u ON u.id = t.created_by AND ${counted}) AS all_tasks,
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

  const sources = await rowsOf(db, sql`
    SELECT COALESCE(u.signup_source, 'unknown') AS source, count(*) AS people,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM sessions s WHERE s.user_id = u.id
           AND s.expires_at - ${ttl} > now() - interval '30 days')) AS active_month
      FROM users u WHERE ${counted}
     GROUP BY 1 ORDER BY people DESC, source`)

  const heard = await rowsOf(db, sql`
    SELECT u.heard_about AS answer, count(*) AS people
      FROM users u WHERE ${counted} AND u.heard_about IS NOT NULL
     GROUP BY 1 ORDER BY people DESC, answer`)

  const recent = sql`
    SELECT a.* FROM (${actions}) a JOIN users u ON u.id = a.user_id AND ${counted}
     WHERE a.at > now() - interval '30 days'`

  const doing = await rowsOf(db, sql`
    SELECT what, count(*) AS times, count(DISTINCT user_id) AS people FROM (${recent}) r GROUP BY what`)

  const days = await rowsOf(db, sql`
    WITH r AS (${recent}),
         d AS (SELECT generate_series(date_trunc('day', now(), 'UTC') - interval '29 days',
                                      date_trunc('day', now(), 'UTC'), interval '1 day') AS start)
    SELECT to_char(d.start AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
      (SELECT count(DISTINCT r.user_id) FROM r WHERE r.at >= d.start AND r.at < d.start + interval '1 day') AS people
      FROM d ORDER BY d.start`)

  // In each person's own time zone, so "9 in the morning" means their morning.
  const hours = await rowsOf(db, sql`
    SELECT extract(hour FROM r.at AT TIME ZONE u.timezone)::int AS hour,
           extract(isodow FROM r.at AT TIME ZONE u.timezone)::int AS weekday, count(*) AS times
      FROM (${recent}) r JOIN users u ON u.id = r.user_id
     GROUP BY 1, 2`)

  const cohorts = await rowsOf(db, sql`
    WITH a AS (SELECT a.* FROM (${actions}) a),
         w AS (SELECT generate_series(date_trunc('week', now(), 'UTC') - interval '7 weeks',
                                      date_trunc('week', now(), 'UTC'), interval '1 week') AS start)
    SELECT to_char(w.start AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS week_start,
      count(u.id) AS joined,
      count(u.id) FILTER (WHERE EXISTS (SELECT 1 FROM a WHERE a.user_id = u.id
                                          AND a.at >= u.created_at + interval '1 day')) AS came_back,
      count(u.id) FILTER (WHERE EXISTS (SELECT 1 FROM a WHERE a.user_id = u.id
                                          AND a.at > now() - interval '7 days')) AS active_week
      FROM w LEFT JOIN users u ON ${counted}
       AND u.created_at >= w.start AND u.created_at < w.start + interval '1 week'
     GROUP BY w.start ORDER BY w.start`)

  const people = await rowsOf(db, sql`
    WITH pages AS (${workPages})
    SELECT u.email, COALESCE(u.signup_source, 'unknown') AS source, u.heard_about,
      to_char(u.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS joined_on,
      (SELECT to_char((max(s.expires_at) - ${ttl}) AT TIME ZONE 'UTC', 'YYYY-MM-DD')
         FROM sessions s WHERE s.user_id = u.id AND s.expires_at > now()) AS last_active_on,
      (SELECT count(*) FROM pages p WHERE p.owner_id = u.id) AS work_pages,
      (SELECT count(*) FROM (${allPages}) p WHERE p.owner_id = u.id) AS pages_total,
      (SELECT count(*) FROM (${allTasks}) t WHERE t.created_by = u.id) AS tasks_total
      FROM users u
     WHERE ${counted}
     ORDER BY last_active_on DESC NULLS LAST, u.created_at DESC`)

  const t = totals ?? {}
  return {
    people: { total: num(t.people_total), new_this_week: num(t.people_week) },
    active: { day: num(t.active_day), week: num(t.active_week), month: num(t.active_month) },
    work_pages: { total: num(t.pages_total), new_this_week: num(t.pages_week) },
    totals: { pages: num(t.all_pages), tasks: num(t.all_tasks) },
    weeks: weeks.map((row) => ({
      week_start: String(row.week_start),
      new_people: num(row.new_people),
      new_work_pages: num(row.new_work_pages),
    })),
    sources: sources.map((row) => ({
      source: String(row.source),
      people: num(row.people),
      active_month: num(row.active_month),
    })),
    usage: {
      actions: ACTION_ORDER.map((what) => {
        const row = doing.find((found) => found.what === what)
        return { what, times: num(row?.times), people: num(row?.people) }
      }),
      days: days.map((row) => ({ day: String(row.day), people: num(row.people) })),
      hours: Array.from({ length: 24 }, (_, hour) =>
        hours.filter((row) => num(row.hour) === hour).reduce((sum, row) => sum + num(row.times), 0)),
      weekdays: Array.from({ length: 7 }, (_, index) =>
        hours.filter((row) => num(row.weekday) === index + 1).reduce((sum, row) => sum + num(row.times), 0)),
      cohorts: cohorts.map((row) => ({
        week_start: String(row.week_start),
        joined: num(row.joined),
        came_back: num(row.came_back),
        active_week: num(row.active_week),
      })),
    },
    heard_about: heard.map((row) => ({ answer: String(row.answer), people: num(row.people) })),
    people_list: people.map((row) => ({
      email: typeof row.email === 'string' ? row.email : null,
      source: String(row.source),
      heard_about: typeof row.heard_about === 'string' ? row.heard_about : null,
      joined_on: String(row.joined_on),
      last_active_on: typeof row.last_active_on === 'string' ? row.last_active_on : null,
      work_pages: num(row.work_pages),
      pages_total: num(row.pages_total),
      tasks_total: num(row.tasks_total),
    })),
  }
}

export async function isOperator(db: Db, userId: string, operators: ReadonlySet<string>): Promise<boolean> {
  if (operators.size === 0 || userId === '') return false
  const [row] = await rowsOf(db, sql`
    SELECT email FROM users WHERE id = ${userId}::uuid AND deleted_at IS NULL`)
  return typeof row?.email === 'string' && operators.has(row.email)
}
