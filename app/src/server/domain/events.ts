// Events and their fan-out (4.13, 4.14). recordEvent runs inside the mutation's own transaction,
// so an act and its record commit together. Callers name recipients; the actor is never notified.
// Acts without their own verb record 'edited': the verb list is a CHECK constraint.
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type {
  EventLine,
  EventSubjectKind,
  EventVerb,
  NotificationLine,
} from '../../shared/events.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableIso(value: unknown): string | null {
  return value === null || value === undefined ? null : toIso(value)
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

export interface EventInput {
  actorId: string
  verb: EventVerb
  subjectKind: EventSubjectKind
  subjectId: string
  /** The name at act time, so a line reads after a rename (4.13). */
  subjectName: string
  /** The visibility scope; null only for acts with no folder. */
  folderId: string | null
  detail?: string
  /** Who the act concerns (4.14). The actor is always filtered out. */
  recipients?: readonly string[]
}

export async function recordEvent(
  tx: Executor,
  input: EventInput,
): Promise<string> {
  const inserted = await rowsOf(
    tx,
    sql`INSERT INTO events
          (actor_id, verb, subject_kind, subject_id, subject_name,
           folder_id, detail)
        VALUES (${input.actorId}::uuid, ${input.verb}, ${input.subjectKind},
                ${input.subjectId}::uuid, ${input.subjectName},
                ${input.folderId === null ? null : input.folderId},
                ${input.detail ?? null})
        RETURNING id`,
  )
  const eventId = String(inserted[0]?.id)
  const recipients = [
    ...new Set(
      (input.recipients ?? []).filter((userId) => userId !== input.actorId),
    ),
  ]
  for (const userId of recipients) {
    // A fresh event id cannot conflict; ON CONFLICT keeps a future replay harmless.
    await tx.execute(
      sql`INSERT INTO notifications (user_id, event_id)
          VALUES (${userId}::uuid, ${eventId}::uuid)
          ON CONFLICT (user_id, event_id) DO NOTHING`,
    )
  }
  return eventId
}

// The 7.12 reads. The route resolves access before calling.

const EVENT_COLUMNS = sql`e.id, e.actor_id, e.verb, e.subject_kind,
  e.subject_id, e.subject_name, e.folder_id, e.detail, e.created_at`

function eventFromRow(row: Record<string, unknown>): EventLine {
  return {
    id: String(row.id),
    actor_id: String(row.actor_id),
    verb: String(row.verb) as EventLine['verb'],
    subject_kind: String(row.subject_kind) as EventLine['subject_kind'],
    subject_id: String(row.subject_id),
    subject_name: String(row.subject_name),
    folder_id: nullableString(row.folder_id),
    detail: nullableString(row.detail),
    created_at: toIso(row.created_at),
  }
}

export interface EventList {
  events: EventLine[]
  truncated: boolean
}

/** 10.3's list cap. History reads skip `mentioned`: it only makes sense to the person it notified. */
const LIST_CAP = 1000

export async function listFolderEvents(
  db: Db,
  folderId: string,
): Promise<EventList> {
  const rows = await rowsOf(
    db,
    sql`SELECT ${EVENT_COLUMNS} FROM events e
        WHERE e.folder_id = ${folderId}
          AND e.verb <> 'mentioned'
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT ${LIST_CAP + 1}`,
  )
  return {
    events: rows.slice(0, LIST_CAP).map(eventFromRow),
    truncated: rows.length > LIST_CAP,
  }
}

export async function listSubjectEvents(
  db: Db,
  subjectKind: EventSubjectKind,
  subjectId: string,
): Promise<EventList> {
  const rows = await rowsOf(
    db,
    sql`SELECT ${EVENT_COLUMNS} FROM events e
        WHERE e.subject_kind = ${subjectKind} AND e.subject_id = ${subjectId}
          AND e.verb <> 'mentioned'
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT ${LIST_CAP + 1}`,
  )
  return {
    events: rows.slice(0, LIST_CAP).map(eventFromRow),
    truncated: rows.length > LIST_CAP,
  }
}

export interface NotificationList {
  notifications: NotificationLine[]
  truncated: boolean
}

export async function listNotifications(
  db: Db,
  viewerId: string,
): Promise<NotificationList> {
  const rows = await rowsOf(
    db,
    sql`SELECT n.id AS notification_id, n.read_at,
               n.created_at AS notified_at,
               c.discussion_id AS comment_discussion_id,
               ${EVENT_COLUMNS}
        FROM notifications n
        JOIN events e ON e.id = n.event_id
        LEFT JOIN comments c
          ON e.subject_kind = 'comment' AND c.id = e.subject_id
        WHERE n.user_id = ${viewerId}
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT ${LIST_CAP + 1}`,
  )
  return {
    notifications: rows.slice(0, LIST_CAP).map((row) => ({
      id: String(row.notification_id),
      read_at: nullableIso(row.read_at),
      created_at: toIso(row.notified_at),
      /* A task has no thread of its own; posts about a task live in its Discussion. */
      task_id: null,
      discussion_id: nullableString(row.comment_discussion_id),
      event: eventFromRow(row),
    })),
    truncated: rows.length > LIST_CAP,
  }
}

/** Idempotent. Null means not found, including another person's notification (10.2). */
export async function markNotificationRead(
  db: Db,
  viewerId: string,
  notificationId: string,
): Promise<'read' | 'not_found'> {
  const rows = await rowsOf(
    db,
    sql`UPDATE notifications
        SET read_at = coalesce(read_at, now())
        WHERE id = ${notificationId} AND user_id = ${viewerId}
        RETURNING id`,
  )
  return rows.length === 0 ? 'not_found' : 'read'
}

export async function markAllNotificationsRead(
  db: Db,
  viewerId: string,
): Promise<number> {
  const rows = await rowsOf(
    db,
    sql`UPDATE notifications SET read_at = now()
        WHERE user_id = ${viewerId} AND read_at IS NULL
        RETURNING id`,
  )
  return rows.length
}
