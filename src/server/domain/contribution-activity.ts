import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { z } from 'zod'
import type { getContributionActivityResponse } from '../../shared/contribution-activity.js'
import { rowsOf } from '../database.js'

type Activity = z.infer<typeof getContributionActivityResponse>
type Day = Activity['days'][number]

// UTC keeps the same calendar boundary for every viewer of a Team profile.
export async function contributionActivity(
  db: Db, viewerId: string, projectId: string, personId: string,
  now = new Date(),
): Promise<Activity | null> {
  const membership = await rowsOf(db, sql`SELECT 1 FROM folders p
    JOIN folder_members viewer ON viewer.folder_id = p.id AND viewer.user_id = ${viewerId}::uuid
    JOIN folder_members person ON person.folder_id = p.id AND person.user_id = ${personId}::uuid
    WHERE p.id = ${projectId}::uuid AND p.project_id = p.id
      AND p.deleted_at IS NULL AND p.archived_at IS NULL`)
  if (!membership.length) return null
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const start = new Date(today - 89 * 86_400_000)
  const end = new Date(today + 86_400_000)
  const days: Day[] = Array.from({ length: 90 }, (_, index) => ({
    date: new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10),
    count: 0, categories: [], references: [],
  }))
  const rows = await rowsOf(db, sql`SELECT e.id, e.created_at, e.verb, e.subject_kind,
      e.subject_id, e.subject_name
    FROM events e
    JOIN folders f ON f.id = e.folder_id AND f.project_id = ${projectId}::uuid
      AND f.deleted_at IS NULL AND f.archived_at IS NULL
    JOIN visible_folder_members visible ON visible.folder_id = f.project_id
      AND visible.user_id = ${viewerId}::uuid
    LEFT JOIN tasks task ON e.subject_kind = 'task' AND task.id = e.subject_id
      AND task.folder_id = f.id AND task.deleted_at IS NULL
    LEFT JOIN folders page ON e.subject_kind = 'folder' AND page.id = e.subject_id
      AND page.project_id = ${projectId}::uuid
      AND page.deleted_at IS NULL AND page.archived_at IS NULL
    LEFT JOIN comments comment ON e.subject_kind = 'comment' AND comment.id = e.subject_id
      AND comment.folder_id = f.id
    WHERE e.actor_id = ${personId}::uuid
      AND e.created_at >= ${start.toISOString()}::timestamptz
      AND e.created_at < ${end.toISOString()}::timestamptz
      AND ((task.id IS NOT NULL AND e.verb IN
          ('created', 'completed', 'reopened', 'abandoned', 'restored'))
        OR (page.id IS NOT NULL AND e.verb IN ('created', 'edited', 'renamed'))
        OR (comment.id IS NOT NULL AND e.verb = 'created'
          AND (comment.task_id IS NULL OR EXISTS (
            SELECT 1 FROM tasks linked WHERE linked.id = comment.task_id
              AND linked.deleted_at IS NULL))))
    ORDER BY e.created_at, e.id`)
  const seen = new Set<string>()
  for (const row of rows) {
    const date = new Date(String(row.created_at)).toISOString().slice(0, 10)
    const day = days.find((entry) => entry.date === date)
    if (!day) continue
    const kind = String(row.subject_kind)
    const verb = String(row.verb)
    const subjectId = String(row.subject_id)
    const key = `${date}:${kind}:${subjectId}:${verb}`
    if (verb === 'edited' && seen.has(key)) continue
    seen.add(key)
    const category = kind === 'comment' ? 'Comment posted' :
      `${kind === 'task' ? 'Task' : 'Page'} ${verb}` as Day['categories'][number]['name']
    day.count += 1
    const existing = day.categories.find((item) => item.name === category)
    if (existing) existing.count += 1
    else day.categories.push({ name: category, count: 1 })
    if (day.references.length < 3 && kind !== 'comment' &&
        !day.references.some((reference) => reference.kind === kind && reference.id === subjectId)) {
      day.references.push({ kind: kind as 'task' | 'folder', id: subjectId, name: String(row.subject_name) })
    }
  }
  return { timezone: 'UTC', days }
}
