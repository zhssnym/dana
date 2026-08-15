/*
Dana's complete 10.5 logging policy. Every method accepts a closed set of
metadata and translates it to the snake-case fields written to stdout. User
content, email addresses, request bodies, OAuth tokens, and session ids have
no parameter through which they can reach a log line.
*/
import { pino } from 'pino'

export interface LogSink {
  info(fields: Record<string, unknown>, message: string): void
  warn(fields: Record<string, unknown>, message: string): void
  error(fields: Record<string, unknown>, message: string): void
}

export interface AuthLogFields {
  userId?: string
  reason?: string
  provisioned?: boolean
  count?: number
}

export interface InviteLogFields {
  inviteId: string
  actorId: string
  status: 'pending' | 'accepted' | 'declined' | 'canceled' | 'resent'
}

export interface DeletionLogFields {
  actorId: string
  folderId?: string
  tasksOpen?: number
  tasksCompleted?: number
  tasksAbandoned?: number
  invites?: number
  foldersTransferred?: number
  foldersDeleted?: number
  memberships?: number
  connections?: number
  myDayEntries?: number
  sessions?: number
}

export interface RequestErrorLogFields {
  method: string
  path: string
  status: number
  error?: unknown
}

export interface OperationLogFields {
  reason?: string
  status?: number
  count?: number
  configured?: boolean
  template?: string
  database?: string
  port?: number
  missing?: string
}

export type AuthLogEvent =
  | 'sign_in'
  | 'sign_in_failed'
  | 'sign_out'
  | 'timezone_reminders_unresolved'
export type InviteLogEvent =
  | 'invite_created'
  | 'invite_accepted'
  | 'invite_declined'
  | 'invite_canceled'
  | 'invite_resent'
export type DeletionLogEvent = 'folder_deleted' | 'account_deleted'
export type OperationLogEvent =
  | 'notification_configuration'
  | 'axiom_logging_configured'
  | 'axiom_logging_incomplete'
  | 'outbound_email_suppressed'
  | 'scheduler_heartbeat_refused'
  | 'scheduler_heartbeat_unreachable'
  | 'reminder_pass_overlapped'
  | 'reminder_pass_failed'
  | 'migrations_applied'
  | 'server_listening'
  | 'boot_failed'

export interface SecurityLogger {
  authEvent(event: AuthLogEvent, fields?: AuthLogFields): void
  inviteEvent(event: InviteLogEvent, fields: InviteLogFields): void
  deletionEvent(event: DeletionLogEvent, fields: DeletionLogFields): void
  taskStatusEvent(fields: {
    taskId: string
    actorId: string
    status: 'pending' | 'completed' | 'abandoned'
  }): void
  reminderEvent(
    event: 'reminder_sent' | 'reminder_skipped' | 'reminder_send_failed',
    fields: { taskId: string; reason?: string },
  ): void
  requestError(fields: RequestErrorLogFields): void
  operation(
    level: 'info' | 'warn' | 'error',
    event: OperationLogEvent,
    fields?: OperationLogFields,
  ): void
}

/**
 * Error messages are never logged. Besides ordinary user-facing text, a
 * database driver's message can contain its full SQL and bound values. Stack
 * frames retain the useful code locations while dropping that first line.
 */
export function safeStack(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined
  const stack = error.stack ?? ''
  const frames = stack.indexOf('\n    at ')
  return frames === -1 ? error.name : `${error.name}${stack.slice(frames)}`
}

function safeReason(value: string): string {
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value) ? value : 'other'
}

function safeLabel(value: string): string {
  return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value) ? value : 'other'
}

function safeMissing(value: string): string {
  const names = value.split(',').map((name) => name.trim())
  return names.length > 0 && names.every((name) => /^[A-Z][A-Z0-9_]{0,63}$/.test(name))
    ? names.join(', ')
    : 'other'
}

export function createSecurityLogger(sink: LogSink = pino()): SecurityLogger {
  return {
    authEvent(event, fields = {}) {
      sink.info(
        {
          event,
          ...(fields.userId === undefined ? {} : { user_id: fields.userId }),
          ...(fields.reason === undefined
            ? {}
            : { reason: safeReason(fields.reason) }),
          ...(fields.provisioned === undefined
            ? {}
            : { provisioned: fields.provisioned }),
          ...(fields.count === undefined ? {} : { count: fields.count }),
        },
        'auth',
      )
    },
    inviteEvent(event, fields) {
      sink.info(
        {
          event,
          invite_id: fields.inviteId,
          actor_id: fields.actorId,
          status: fields.status,
        },
        'invite lifecycle',
      )
    },
    deletionEvent(event, fields) {
      sink.info(
        {
          event,
          actor_id: fields.actorId,
          ...(fields.folderId === undefined ? {} : { folder_id: fields.folderId }),
          ...(fields.tasksOpen === undefined ? {} : { tasks_open: fields.tasksOpen }),
          ...(fields.tasksCompleted === undefined
            ? {}
            : { tasks_completed: fields.tasksCompleted }),
          ...(fields.tasksAbandoned === undefined
            ? {}
            : { tasks_abandoned: fields.tasksAbandoned }),
          ...(fields.invites === undefined ? {} : { invites: fields.invites }),
          ...(fields.foldersTransferred === undefined
            ? {}
            : { folders_transferred: fields.foldersTransferred }),
          ...(fields.foldersDeleted === undefined
            ? {}
            : { folders_deleted: fields.foldersDeleted }),
          ...(fields.memberships === undefined
            ? {}
            : { memberships: fields.memberships }),
          ...(fields.connections === undefined
            ? {}
            : { connections: fields.connections }),
          ...(fields.myDayEntries === undefined
            ? {}
            : { my_day_entries: fields.myDayEntries }),
          ...(fields.sessions === undefined ? {} : { sessions: fields.sessions }),
        },
        'deletion',
      )
    },
    taskStatusEvent(fields) {
      sink.info(
        {
          event: 'task_status_changed',
          task_id: fields.taskId,
          actor_id: fields.actorId,
          status: fields.status,
        },
        'task status',
      )
    },
    reminderEvent(event, fields) {
      sink[event === 'reminder_send_failed' ? 'error' : 'info'](
        {
          event,
          task_id: fields.taskId,
          ...(fields.reason === undefined
            ? {}
            : { reason: safeReason(fields.reason) }),
        },
        'reminder',
      )
    },
    requestError(fields) {
      sink.error(
        {
          event: 'request_failed',
          method: fields.method,
          path: fields.path,
          status: fields.status,
          ...(fields.error instanceof Error
            ? { error_name: fields.error.name, stack: safeStack(fields.error) }
            : {}),
        },
        'request failed',
      )
    },
    operation(level, event, fields = {}) {
      sink[level](
        {
          event,
          ...(fields.reason === undefined
            ? {}
            : { reason: safeReason(fields.reason) }),
          ...(fields.status === undefined ? {} : { status: fields.status }),
          ...(fields.count === undefined ? {} : { count: fields.count }),
          ...(fields.configured === undefined
            ? {}
            : { configured: fields.configured }),
          ...(fields.template === undefined
            ? {}
            : { template: safeLabel(fields.template) }),
          ...(fields.database === undefined
            ? {}
            : { database: safeLabel(fields.database) }),
          ...(fields.port === undefined ? {} : { port: fields.port }),
          ...(fields.missing === undefined
            ? {}
            : { missing: safeMissing(fields.missing) }),
        },
        'operation',
      )
    },
  }
}

const defaultSecurityLogger = createSecurityLogger()

/** Compatibility function for auth helpers that predate per-app injection. */
export function logAuthEvent(
  event: AuthLogEvent,
  fields: AuthLogFields = {},
): void {
  defaultSecurityLogger.authEvent(event, fields)
}
