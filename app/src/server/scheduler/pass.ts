/*
The 11.7 delivery pass: one cycle of 8.6's reminder loop, as a plain callable.

**Why a callable and not a route.** 11.7 requires the pass to stay one, so
that if hosting ever moves somewhere without an always-on process the
replacement is an external per-minute trigger hitting an authenticated
endpoint that runs one pass, rather than a rewrite. The 60-second interval and
its in-flight guard therefore live next door in ./interval.ts, and nothing
below knows a timer exists. The acceptance suite reaches exactly this
function, through the module path and the two dependency names 11.7 ratified
at the P7 mid-package change control; production composes the same callable at
boot.

**One transaction, claim then classify then send then mark.** The poll runs
inside the transaction and claims its rows with SELECT ... FOR UPDATE SKIP
LOCKED, which is what makes two ticks safe rather than merely unlikely: the
deploy overlap window can run two instances for about ninety seconds (11.7),
and a second tick meeting a claimed row skips it instead of sending a second
copy. The lock is held across the send for the same reason. A crash between
the send and the mark can duplicate at most one batch, which 8.6 accepts by
name, and the alternative (mark first, then send) trades a duplicate for a
silent non-delivery, which it does not.

**Nothing here computes a fire instant.** 8.6's arithmetic is the Scheduling
engineer's and this role's persona forbids restating it; the pass reads
fire_at as stored and compares it to the database's own now(), never to a
clock in this process. That also settles which clock decides staleness when
the two disagree.

**The stale window is evaluated in SQL, in 8.6's own direction.** now() minus
fire_at greater than six hours, computed by the same statement that selects
the row, so the comparison cannot be written the wrong way round in one place
and right in another, and so a row does not age between the poll and the
branch.

**Two duties, and that is the ceiling.** 8.6 calls this loop the only
background execution in v1, so pruning expired sessions rides here rather than
in a second scheduled process (11.7). It runs after the reminder work, on the
handle rather than inside the delivery transaction, because it is hygiene and
never revocation (11.6): its failure must not roll back a delivery that
already happened.
*/
import { sql } from 'drizzle-orm'
import { pino } from 'pino'

import type { DbClient } from '../../../db/client.js'
import type { ObjectStore } from '../files/store.js'
import { pruneExpiredSessions } from '../auth/index.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { createNotifier } from '../notify/index.js'
import type { NotificationSink, Notifier, OutboundMessage } from '../notify/index.js'
import { recordSchedulerPass } from '../routes/health.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'

/**
 * The log surface this module needs. Structural, so the boot file's own pino
 * instance satisfies it and a unit test can capture emission without one.
 *
 * 10.5 puts reminder sends and skips on the logged list, so this is not
 * optional decoration; what may appear in a line is the task id and a
 * machine-readable reason and nothing else. The recipient address never
 * reaches it, which is 10.5's never-log list, and neither does the title,
 * which the email carries and the log does not.
 */
export interface SchedulerLogger {
  info(fields: Record<string, unknown>, message: string): void
  warn(fields: Record<string, unknown>, message: string): void
  error(fields: Record<string, unknown>, message: string): void
}

export interface ReminderPassDeps {
  /** The one database handle (app/db/client.ts), already opened. */
  dbClient: DbClient
  /**
   * The 11.10 sink. Present under test, where it is the only way a send is
   * observable; in production the boot file passes the application's own
   * notifier, which carries the 11.8 transport. Absent, every send logs its
   * suppression and no email leaves, which is 11.8's development behavior.
   */
  notifications?: NotificationSink
  /**
   * Defaulted rather than required because 11.7 fixes this function's
   * dependencies at two, so the acceptance suite passes no logger and a
   * required one would make the ratified seam unusable. The default is a pino
   * instance of this module's own, the shape src/server/security/log.ts uses
   * and for its reason: importing the boot file's logger would point a module
   * the boot file composes back at the entrypoint that runs main(). Silence
   * was the alternative and was refused: a pass that delivers mail while
   * logging nothing is the hazard this role exists to prevent, and 10.5
   * requires the lines.
   */
  logger?: SchedulerLogger
  /**
   * 11.12's heartbeat, pinged after each successful cycle so that a dead tick
   * inside a live server is visible to something other than an uptime check.
   * Absent everywhere but production, where the boot file reads it from the
   * environment.
   */
  heartbeatUrl?: string
  /**
   * The S4 object store. The Trash purge collects the files rows its folder
   * deletes will cascade away and removes their objects after the delete
   * commits, those rows being the only index to the bytes (11.7, RFC 0005
   * change control item 18). Optional beside the two ratified deps for the
   * logger's reason; the boot file always passes the application's own
   * store, and a pass without one still purges rows exactly as before.
   */
  fileStore?: ObjectStore
}

export interface ReminderPassOutcome {
  /** Rows delivered and marked sent. */
  sent: number
  /** Rows marked skipped by one of 8.6's three rules. */
  skipped: number
  /** Rows whose send was refused, left scheduled for the next tick. */
  failed: number
  /** Expired session rows the second duty removed (11.6, 11.7). */
  prunedSessions: number
  /** Trash rows past 30 days the third duty purged: folders and tasks,
   * their cascades uncounted (RFC 0005, 11.7). */
  purgedTrash: number
  /** Events past 90 days the fourth duty purged (4.13). */
  purgedEvents: number
}

export type ReminderPass = () => Promise<ReminderPassOutcome>

/** 8.6: skipped when now() minus fire_at exceeds this. Written once, in the
 * statement below, rather than compared here. */
const STALE_WINDOW = '6 hours'

/*
Q11, plus everything classifying the row needs, in one statement.

The reminder poll is section 6's Q11 ("reminders where state = 'scheduled' and
fire_at <= now()"), which the RFC's P7 row places here rather than in a query
session: it has no ordering, no cap and no cursor, and 11.7 rather than
section 6 specifies how it claims rows. The 4.8 partial index on (fire_at)
WHERE state = 'scheduled' is what it reads.

FOR UPDATE OF r locks the reminder rows alone. The task join is what 8.6's
first two skips read, and the user join is left outer because an unassigned
task is one of those skips rather than an error; locking either would be
wrong, and Postgres refuses a lock on the nullable side of an outer join in
any case.

ORDER BY fire_at so a batch that cannot be delivered whole delivers the
longest-waiting reminders first.
*/
const claimDueReminders = sql`
  SELECT r.task_id,
         t.status,
         t.assignee_id,
         t.title,
         to_char(t.due_date, 'YYYY-MM-DD') AS due_date,
         to_char(t.due_time, 'HH24:MI') AS due_time,
         u.email AS assignee_email,
         now() - r.fire_at > ${STALE_WINDOW}::interval AS stale
    FROM reminders r
    JOIN tasks t ON t.id = r.task_id AND t.deleted_at IS NULL
    JOIN folders fo ON fo.id = t.folder_id AND fo.deleted_at IS NULL
    LEFT JOIN users u ON u.id = t.assignee_id
   WHERE r.state = 'scheduled'
     AND r.fire_at <= now()
   ORDER BY r.fire_at
     FOR UPDATE OF r SKIP LOCKED`

/** The two drivers of 11.10 render a boolean column differently often enough
 * that reading it by identity is a bug waiting for the postgres:18 leg. */
function isTrue(value: unknown): boolean {
  return value === true || value === 't' || value === 'true'
}

function text(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/** 8.6's three skip rules, in the order that section writes them, plus the
 * one operational case it cannot have meant to leave undecided. */
type SkipReason =
  | 'task_not_pending'
  | 'unassigned'
  | 'stale'
  | 'no_recipient_address'

function skipReasonFor(row: Record<string, unknown>): SkipReason | null {
  if (text(row.status) !== 'pending') return 'task_not_pending'
  if (text(row.assignee_id) === null) return 'unassigned'
  if (isTrue(row.stale)) return 'stale'
  // Not a fourth rule of this role's invention: 4.1 makes users.email
  // nullable only for a scrubbed row (8.10 step 7), and R-CLEAN unassigns
  // that user's tasks before the scrub, so this is unreachable in a tree
  // where account deletion ran whole. It is treated as the unassigned skip
  // for the reason 8.6 gives that one, which is that there is no one person
  // to deliver to; the alternative, throwing, would take down every other
  // reminder in the batch for one unreachable row.
  if (text(row.assignee_email) === null) return 'no_recipient_address'
  return null
}

function reminderMessage(row: Record<string, unknown>): OutboundMessage {
  return {
    template: 'reminder',
    to: String(row.assignee_email),
    reminder: {
      taskId: String(row.task_id),
      title: String(row.title),
      dueDate: String(row.due_date),
      dueTime: text(row.due_time),
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

/*
11.12's heartbeat. A failure to reach the monitor is logged and swallowed:
the monitor's own contract is that silence alerts, so a ping that could not
be delivered produces the alert it should, and letting it fail the pass would
turn a monitoring outage into a delivery outage.

The URL is a credential in URL form and is never logged, only its outcome.
*/
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

/**
 * One pass, awaited to completion.
 *
 * Returns counts rather than rows: the caller that runs this on a timer has
 * nothing to do with the rows, and a unit test asserting counts cannot depend
 * on an ordering the specification does not fix.
 */
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

  return async function runPass(): Promise<ReminderPassOutcome> {
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
          await notifier.send(reminderMessage(row))
        } catch (err: unknown) {
          // The row stays scheduled, so the next tick retries it until it
          // crosses the stale window and is skipped honestly. Rolling the
          // whole transaction back instead would re-send every reminder this
          // batch already delivered.
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

    /*
    The third and fourth duties (RFC 0005, 11.7): the 30 day Trash purge and
    the 90 day event purge. Each claims its rows the way the reminder duty
    always has, SKIP LOCKED, in a transaction of its own, separate from the
    delivery's for the session prune's reason: a purge that fails can never
    roll back a delivery that already happened. A repeat finds nothing, so
    the missed-tick and overlap properties hold unchanged. Folders go before
    tasks so a task inside a purged folder goes by its folder's cascade
    rather than being counted twice. The fifth duty the RFC text named,
    notification fan-out, moved to the 10.2 chokepoint at S3's change
    control; the tick carries four.

    The folder purge collects its files rows before deleting (11.7, RFC
    0005 change control item 18): the cascade drops them, they are the only
    index to the bytes in the store, and read afterwards there is nothing
    left that knows the objects exist. The objects leave the store only
    after the delete commits, 7.15's order, so a rolled-back purge cannot
    have already destroyed bytes whose rows survived. The claim and the
    per-folder deletes share one transaction, which is what lets the DELETE
    address claimed ids alone rather than re-running the age predicate into
    rows another tick holds. Tasks carry no files rows (4.16 scopes files to
    folders), so the task purge stays one statement.
    */
    const folderPurge = await inTransaction(db, async (tx) => {
      const claimed = await rowsOf(
        tx,
        sql`SELECT id FROM folders
             WHERE deleted_at < now() - interval '30 days'
             FOR UPDATE SKIP LOCKED`,
      )
      const orphaned: string[] = []
      for (const row of claimed) {
        const folderId = String(row.id)
        const files = await rowsOf(
          tx,
          sql`SELECT id FROM files WHERE folder_id = ${folderId}`,
        )
        for (const file of files) orphaned.push(String(file.id))
        await tx.execute(sql`DELETE FROM folders WHERE id = ${folderId}`)
      }
      return { folders: claimed.length, orphaned }
    })
    if (deps.fileStore !== undefined) {
      for (const id of folderPurge.orphaned) {
        try {
          await deps.fileStore.remove(id)
        } catch {
          // Unreachable bytes: every row that named the object is gone, and
          // a purge must not fail the pass over one refused rm.
        }
      }
    }
    const purgedTasks = await rowsOf(
      db,
      sql`DELETE FROM tasks WHERE id IN (
            SELECT id FROM tasks
             WHERE deleted_at < now() - interval '30 days'
             FOR UPDATE SKIP LOCKED)
          RETURNING id`,
    )
    const purgedTrash = folderPurge.folders + purgedTasks.length
    const purgedEvents = (
      await rowsOf(
        db,
        sql`DELETE FROM events WHERE id IN (
              SELECT id FROM events
               WHERE created_at < now() - interval '90 days'
               FOR UPDATE SKIP LOCKED)
            RETURNING id`,
      )
    ).length

    // Both liveness signals, after the work and only on a cycle that
    // completed: /api/health's age since P0 (11.12), and the heartbeat whose
    // silence alerts.
    recordSchedulerPass()
    if (deps.heartbeatUrl !== undefined && deps.heartbeatUrl !== '') {
      await pingHeartbeat(deps.heartbeatUrl, logger)
    }

    return { sent, skipped, failed, prunedSessions, purgedTrash, purgedEvents }
  }
}
