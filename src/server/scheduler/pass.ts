// The 11.7 scheduler pass: one cycle as a plain callable (the timer lives in interval.ts).
// Reminders are claimed with FOR UPDATE SKIP LOCKED and held across the send, so overlapping ticks never double-send;
// a crash between send and mark duplicates at most one batch. Sweeps run after, in their own transactions.
import { sql } from 'drizzle-orm'
import { pino } from 'pino'

import type { DbClient } from '../../../db/client.js'
import type { ObjectStore } from '../files/store.js'
import { pruneExpiredSessions } from '../auth/index.js'
import { reclaimUnwornPictures } from '../domain/files.js'
import { destroyDiscussions } from '../domain/consultation.js'
import { destroyFolders, destroyTasks, removeObjects } from '../domain/trash.js'
import { SWEEP_BATCH, inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { createNotifier } from '../notify/index.js'
import type { NotificationSink, Notifier, OutboundMessage } from '../notify/index.js'
import { recordSchedulerPass } from '../observability/scheduler-pass.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'

/**
 * The log surface this module needs. A line may carry the task id and a reason only:
 * never the recipient address or the title (10.5).
 */
export interface SchedulerLogger {
  info(fields: Record<string, unknown>, message: string): void
  warn(fields: Record<string, unknown>, message: string): void
  error(fields: Record<string, unknown>, message: string): void
}

export interface ReminderPassDeps {
  dbClient: DbClient
  /** The 11.10 sink. Without one, every send logs its suppression and no email leaves. */
  notifications?: NotificationSink
  /** Optional because 11.7 fixes the dependencies at two. Defaults to this module's own pino instance. */
  logger?: SchedulerLogger
  /** 11.12's heartbeat URL, pinged after each successful cycle. Production only. */
  heartbeatUrl?: string
  /** The object store. The Trash purge removes objects after its delete commits. */
  fileStore?: ObjectStore
  /** For tests only; defaults to `SLOW_PASS_MS`. */
  slowPassMs?: number
}

export interface ReminderPassOutcome {
  sent: number
  /** Rows marked skipped by one of 8.6's rules. */
  skipped: number
  /** Rows whose send was refused, left scheduled for the next tick. */
  failed: number
  prunedSessions: number
  /** Trash rows past 30 days purged, cascades uncounted (11.7). */
  purgedTrash: number
  purgedEvents: number
  /** Unreferenced folder-less pictures older than 30 days, reclaimed with their objects. */
  reclaimedPictures: number
}

export type ReminderPass = () => Promise<ReminderPassOutcome>

/** 8.6: skipped when now() minus fire_at exceeds this, evaluated in SQL. */
const STALE_WINDOW = '6 hours'

/**
 * A pass this long logs even with nothing to report: half the 60-second tick, a warning before
 * `reminder_pass_overlapped`. Not imported from interval.ts, which imports this module.
 */
const SLOW_PASS_MS = 30_000

// Q11: claims due reminders. FOR UPDATE OF r locks reminder rows only; Postgres refuses a lock
// on the nullable side of an outer join. ORDER BY fire_at delivers the longest-waiting first.
const claimDueReminders = sql`
  SELECT r.task_id,
         t.status,
         t.assignee_id,
         t.title,
         to_char(t.due_date, 'YYYY-MM-DD') AS due_date,
         to_char(t.due_time, 'HH24:MI') AS due_time,
         fo.name AS folder_name,
         u.email AS assignee_email,
         (SELECT coalesce(json_agg(au.email ORDER BY ids.ord), '[]'::json)
            FROM unnest(t.assignee_ids) WITH ORDINALITY AS ids(user_id, ord)
            JOIN users au ON au.id = ids.user_id
           WHERE au.email IS NOT NULL) AS assignee_emails,
         now() - r.fire_at > ${STALE_WINDOW}::interval AS stale
    FROM reminders r
    JOIN tasks t ON t.id = r.task_id AND t.deleted_at IS NULL
    JOIN folders fo ON fo.id = t.folder_id AND fo.deleted_at IS NULL AND fo.archived_at IS NULL
    LEFT JOIN users u ON u.id = t.assignee_id
   WHERE r.state = 'scheduled'
     AND r.fire_at <= now()
   ORDER BY r.fire_at
     FOR UPDATE OF r SKIP LOCKED`

/** The two drivers render booleans differently, so never compare by identity. */
function isTrue(value: unknown): boolean {
  return value === true || value === 't' || value === 'true'
}

function text(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function recipientEmails(row: Record<string, unknown>): string[] {
  return Array.isArray(row.assignee_emails)
    ? row.assignee_emails.filter((email): email is string => typeof email === 'string')
    : text(row.assignee_email) === null ? [] : [String(row.assignee_email)]
}

/** 8.6's three skip rules, plus a missing recipient address. */
type SkipReason =
  | 'task_not_pending'
  | 'unassigned'
  | 'stale'
  | 'no_recipient_address'

function skipReasonFor(row: Record<string, unknown>): SkipReason | null {
  if (text(row.status) !== 'pending') return 'task_not_pending'
  if (text(row.assignee_id) === null) return 'unassigned'
  if (isTrue(row.stale)) return 'stale'
  // Unreachable when account deletion ran whole. Treated as the unassigned skip rather than thrown,
  // so one bad row does not take down the batch.
  if (recipientEmails(row).length === 0) return 'no_recipient_address'
  return null
}

function reminderMessage(row: Record<string, unknown>, email: string): OutboundMessage {
  return {
    template: 'reminder',
    to: email,
    reminder: {
      taskId: String(row.task_id),
      title: String(row.title),
      dueDate: String(row.due_date),
      dueTime: text(row.due_time),
      folderName: String(row.folder_name),
    },
  }
}

function markSent(tx: Executor, taskId: string): Promise<unknown> {
  return tx.execute(
    sql`UPDATE reminders SET state = 'sent', fired_at = now()
         WHERE task_id = ${taskId}::uuid`,
  )
}

function markSkipped(tx: Executor, taskId: string): Promise<unknown> {
  return tx.execute(
    sql`UPDATE reminders SET state = 'skipped', fired_at = now()
         WHERE task_id = ${taskId}::uuid`,
  )
}

// A failed ping is logged and swallowed: the monitor alerts on silence anyway.
// The URL is a credential; never log it.
async function pingHeartbeat(
  url: string,
  logger: SecurityLogger,
): Promise<void> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) {
      logger.operation(
        'warn',
        'scheduler_heartbeat_refused',
        { status: response.status },
      )
    }
  } catch (err: unknown) {
    logger.operation(
      'warn',
      'scheduler_heartbeat_unreachable',
      { reason: err instanceof Error ? err.name : 'unknown' },
    )
  }
}

/** One pass, awaited to completion. Returns counts, not rows. */
export function createReminderPass(deps: ReminderPassDeps): ReminderPass {
  const logger = createSecurityLogger(deps.logger ?? pino())
  const notifier: Notifier = createNotifier({
    sink: deps.notifications,
    logger: {
      info: (fields) => {
        logger.operation('info', 'outbound_email_suppressed', {
          template:
            typeof fields.template === 'string' ? fields.template : undefined,
        })
      },
    },
  })
  const db = deps.dbClient.db

  const slowPassMs = deps.slowPassMs ?? SLOW_PASS_MS

  return async function runPass(): Promise<ReminderPassOutcome> {
    const startedAt = Date.now()
    let sent = 0
    let skipped = 0
    let failed = 0

    await inTransaction(db, async (tx) => {
      const due = await rowsOf(tx, claimDueReminders)
      for (const row of due) {
        const taskId = String(row.task_id)
        const reason = skipReasonFor(row)
        if (reason !== null) {
          await markSkipped(tx, taskId)
          skipped += 1
          logger.reminderEvent('reminder_skipped', { taskId, reason })
          continue
        }
        try {
          for (const email of recipientEmails(row)) {
            await notifier.send(reminderMessage(row, email))
          }
        } catch (err: unknown) {
          // The row stays scheduled for the next tick. Rolling back would re-send everything this batch delivered.
          failed += 1
          logger.reminderEvent('reminder_send_failed', {
            taskId,
            reason: err instanceof Error ? err.name : 'unknown',
          })
          continue
        }
        await markSent(tx, taskId)
        sent += 1
        logger.reminderEvent('reminder_sent', { taskId })
      }
    })

    const prunedSessions = await pruneExpiredSessions(db)

    // Trash and event purges, each in its own SKIP LOCKED transaction so a failure cannot roll back a delivery.
    // Folders go first so their tasks go by cascade. Files are collected in the deleting statement and their
    // objects removed after commit. The SWEEP_BATCH cap bounds the claim, not the cascades.
    const folderPurge = await destroyFolders(
      db,
      sql`SELECT id FROM folders
           WHERE deleted_at < now() - interval '30 days'
           LIMIT ${SWEEP_BATCH}
           FOR UPDATE SKIP LOCKED`,
    )
    await removeObjects(deps.fileStore, folderPurge.fileIds)
    const taskPurge = await destroyTasks(
      db,
      sql`SELECT id FROM tasks
           WHERE deleted_at < now() - interval '30 days'
           LIMIT ${SWEEP_BATCH}
           FOR UPDATE SKIP LOCKED`,
    )
    await removeObjects(deps.fileStore, taskPurge.fileIds)
    // Trashed Discussions, on the same window. Their comments' uploads are collected too.
    const discussionPurge = await destroyDiscussions(
      db,
      sql`SELECT id FROM discussions
           WHERE trashed_at < now() - interval '30 days'
           LIMIT ${SWEEP_BATCH}
           FOR UPDATE SKIP LOCKED`,
    )
    await removeObjects(deps.fileStore, discussionPurge.fileIds)
    const purgedTrash =
      folderPurge.folderIds.length +
      taskPurge.taskIds.length +
      discussionPurge.discussionIds.length
    const purgedEvents = (
      await rowsOf(
        db,
        sql`DELETE FROM events WHERE id IN (
              SELECT id FROM events
               WHERE created_at < now() - interval '90 days'
               LIMIT ${SWEEP_BATCH}
               FOR UPDATE SKIP LOCKED)
            RETURNING id`,
      )
    ).length

    // Reclaims folder-less pictures nothing has referenced for thirty days, measured from
    // files.unreferenced_since, not created_at. The statement lives in domain/files-core.ts.
    const reclaimedPictures = (
      await reclaimUnwornPictures(db, deps.fileStore, logger)
    ).length

    // Liveness signals, only on a completed cycle: /api/health's pass age and the heartbeat.
    recordSchedulerPass()
    if (deps.heartbeatUrl !== undefined && deps.heartbeatUrl !== '') {
      await pingHeartbeat(deps.heartbeatUrl, logger)
    }

    // Log the pass only when a sweep touched a row or it ran slow; one line a minute of zeroes would bury it.
    // Logged here, not in interval.ts, so any driver and the acceptance suite see it.
    const durationMs = Date.now() - startedAt
    const swept =
      prunedSessions + purgedTrash + purgedEvents + reclaimedPictures
    if (swept > 0 || durationMs >= slowPassMs) {
      logger.operation('info', 'reminder_pass_completed', {
        reclaimedPictures,
        purgedTrash,
        purgedEvents,
        prunedSessions,
        durationMs,
      })
    }

    return {
      sent,
      skipped,
      failed,
      prunedSessions,
      purgedTrash,
      purgedEvents,
      reclaimedPictures,
    }
  }
}
