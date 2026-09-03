/*
The S3 domain module: the event record and its fan-out (4.13, 4.14), written
at the 10.2 chokepoint and read by the 7.12 surfaces.

**One mutation, one event, one transaction.** recordEvent is called by the
mutation that passed the chokepoint, inside the mutation's own transaction,
so an act and its record commit or vanish together and a retried request can
never record an act that did not happen. The change control note in RFC 0005
moves fan-out here from the tick for the same reason: the notification rows
ride the same transaction, atomic with the event, and AC-187 reads them in
the same breath as the mutation. The 4.14 uniqueness stands behind this as
the constraint-level backstop against any path double-fanning an event.

**Recipients are the caller's to name.** The chokepoint knows who an act
concerns (the assignee it just wrote, the members it just orphaned); this
module only enforces the one rule 4.14 states for everyone: an actor is
never notified of their own act.

**Who wires what.** S3 wires folders and tasks below; S5 and S6 wire shelves,
pages, duplicates and comments through this same function when their
mutations land. The verb for an act with no verb of its own (a step toggled,
a reminder set, a member added) is 'edited' with the half a verb cannot
carry in detail, because 4.13's verb list is a CHECK constraint and not a
suggestion box.
*/
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

/* ------------------------------------------------------------------ *
 * The chokepoint write
 * ------------------------------------------------------------------ */

export interface EventInput {
  actorId: string
  verb: EventVerb
  subjectKind: EventSubjectKind
  subjectId: string
  /** The name at act time, so a line reads after a rename (4.13). */
  subjectName: string
  /** The visibility scope; null only for acts with no folder (none in S3). */
  folderId: string | null
  detail?: string
  /** Who the act concerns (4.14). The actor is filtered here, always. */
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
    // ON CONFLICT alongside the 4.14 unique: a fresh event id makes a
    // conflict impossible today, and keeps a future replayer harmless.
    await tx.execute(
      sql`INSERT INTO notifications (user_id, event_id)
          VALUES (${userId}::uuid, ${eventId}::uuid)
          ON CONFLICT (user_id, event_id) DO NOTHING`,
    )
  }
  return eventId
}

/* ------------------------------------------------------------------ *
 * The 7.12 reads (access resolved by the route before the call)
 * ------------------------------------------------------------------ */

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

/** 10.3's list cap, shared by the three list reads below. */
const LIST_CAP = 1000

export async function listFolderEvents(
  db: Db,
  folderId: string,
): Promise<EventList> {
  const rows = await rowsOf(
    db,
    sql`SELECT ${EVENT_COLUMNS} FROM events e
        WHERE e.folder_id = ${folderId}
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
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT ${LIST_CAP + 1}`,
  )
  return {
    events: rows.slice(0, LIST_CAP).map(eventFromRow),
    truncated: rows.length > LIST_CAP,
  }
}

/* ------------------------------------------------------------------ *
 * Notifications: the recipient's list and read state (7.12)
 * ------------------------------------------------------------------ */

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
               n.created_at AS notified_at, c.task_id AS comment_task_id,
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
      /* polish: search F3. The task a comment sits on, so the bell can land
         on the task with its thread open rather than on the folder. Null
         for a folder-level comment and for every other subject. */
      task_id: nullableString(row.comment_task_id),
      event: eventFromRow(row),
    })),
    truncated: rows.length > LIST_CAP,
  }
}

/** 200 on the viewer's row whether or not it was already read (an idempotent
 * transition through its no-op, 7.0's discipline); null is 10.2's not-found,
 * another person's notification being nonexistent to this viewer. */
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
