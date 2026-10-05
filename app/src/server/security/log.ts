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
  /** 8.10 step 6c's total across its personal tables. */
  personalRows?: number
  sessions?: number
}

/** Who exported and how many bytes; nothing about the contents. */
export interface ExportLogFields {
  actorId: string
  bytes: number
}

/** No `script-sample` or query string: neither has a parameter here. */
export interface CspViolationLogFields {
  directive: string
  blockedUri: string
  documentPath: string
}

/**
 * A body key the schema does not declare: the route and the key names, never
 * values. Names are caller strings too, so they are whitelisted here.
 */
export interface UnknownRequestFieldsLogFields {
  /** Method and path template, never the concrete URL (it carries row ids). */
  route: string
  fields: readonly string[]
}

/**
 * One picture the 11.7 tick deleted unasked. This line is the only record
 * left afterwards, so it carries owner and bytes. Never add `files.name`:
 * it is a typed filename, which is user content.
 */
export interface FileReclaimedLogFields {
  fileId: string
  ownerId: string
  /** One of RECLAIMABLE_KINDS (`domain/files.ts`). */
  kind: string
  bytes: number
  /** Rendered by the database: when the thirty days started. */
  unreferencedSince: string | null
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
  /* The 11.7 pass's sweep counts and duration (delivery has its own lines). */
  reclaimedPictures?: number
  purgedTrash?: number
  purgedEvents?: number
  prunedSessions?: number
  durationMs?: number
  /**
   * A sentence written in source for operators, never a request or row value.
   * safeNote refuses anything but plain words.
   */
  note?: string
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
  /** Only when the pass did something or was slow; a quiet tick logs nothing. */
  | 'reminder_pass_completed'
  | 'migrations_applied'
  /** Its own event name so alerting can key on it. */
  | 'database_fallback_pglite'
  | 'database_connection_lost'
  | 'server_listening'
  /** Logged once at boot, with the host in `note`. */
  | 'canonical_host_enforced'
  | 'boot_failed'
  /** A route marked for removal was called; `reason` names it. */
  | 'retired_route_hit'

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
  exportEvent(fields: ExportLogFields): void
  fileReclaimed(fields: FileReclaimedLogFields): void
  cspViolation(fields: CspViolationLogFields): void
  unknownRequestFields(fields: UnknownRequestFieldsLogFields): void
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

/** Plain words only: no braces, quotes, angle brackets, = or newlines, so no
 * SQL or JSON fragment fits. */
function safeNote(value: string): string {
  return /^[A-Za-z0-9_ ,.'’\-:;()]{1,240}$/.test(value) ? value : 'other'
}

/* Callers already reduce reports to these shapes; the logger enforces them
   anyway. A value outside the shape becomes `other`, not a truncated sample. */
function safeDirective(value: string): string {
  return /^[a-z][a-z0-9-]{0,39}$/.test(value) ? value : 'other'
}

/** A CSP keyword, or a scheme with an optional host; no path or query. */
function safeBlockedUri(value: string): string {
  const keyword = /^[a-z][a-z-]{0,39}$/
  const schemeAndHost = /^[a-z][a-z0-9+.-]{0,31}:(\/\/[A-Za-z0-9.:*_-]{1,255})?$/
  return keyword.test(value) || schemeAndHost.test(value) ? value : 'other'
}

/** An absolute path, no query, fragment or `%` (Dana's routes need no encoding). */
function safeDocumentPath(value: string): string {
  return /^\/[A-Za-z0-9/_.~-]{0,255}$/.test(value) ? value : 'other'
}

/**
 * Exported so the Sentry copy uses exactly the same whitelisted values, which
 * also bounds the fingerprint space. Idempotent.
 */
export function safeCspViolation(
  fields: CspViolationLogFields,
): CspViolationLogFields {
  return {
    directive: safeDirective(fields.directive),
    blockedUri: safeBlockedUri(fields.blockedUri),
    documentPath: safeDocumentPath(fields.documentPath),
  }
}

/* A route label is a method and a path template. A uuid-shaped segment makes
   the whole label `other`, so a row id can never be logged. */
const UUID_SEGMENT =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function safeRoute(value: string): string {
  if (value.length > 160) return 'other'
  const space = value.indexOf(' ')
  if (space === -1) return 'other'
  const method = value.slice(0, space)
  const path = value.slice(space + 1)
  if (!/^[A-Z]{3,7}$/.test(method)) return 'other'
  if (!path.startsWith('/')) return 'other'
  const segments = path.split('/').slice(1)
  const ok = segments.every(
    (segment, index) =>
      (segment === '' && index === segments.length - 1) ||
      (/^:?[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(segment) &&
        !UUID_SEGMENT.test(segment)),
  )
  return ok ? value : 'other'
}

/** A snake_case key name, no dash or dot: secrets such as `oauth-token-value`
 * are valid JSON keys, so dashed names become `other` (AC-103). */
function safeFieldName(value: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value) ? value : 'other'
}

/** Names per line. `count` is taken from the raw distinct keys, before
 * mangling, so many ill-formed keys still show their number. */
const UNKNOWN_FIELD_LIMIT = 20

/** `YYYY-MM-DDTHH:MM:SSZ` only, enforced even though the database renders it. */
function safeInstant(value: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) ? value : 'other'
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
          ...(fields.personalRows === undefined
            ? {}
            : { personal_rows: fields.personalRows }),
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
    exportEvent(fields) {
      sink.info(
        {
          event: 'data_exported',
          actor_id: fields.actorId,
          bytes: fields.bytes,
        },
        'data export',
      )
    },
    fileReclaimed(fields) {
      sink.info(
        {
          event: 'file_reclaimed',
          file_id: fields.fileId,
          owner_id: fields.ownerId,
          kind: safeLabel(fields.kind),
          bytes: fields.bytes,
          unreferenced_since:
            fields.unreferencedSince === null
              ? null
              : safeInstant(fields.unreferencedSince),
        },
        'file reclaimed',
      )
    },
    cspViolation(fields) {
      const safe = safeCspViolation(fields)
      sink.warn(
        {
          event: 'csp_violation',
          directive: safe.directive,
          blocked_uri: safe.blockedUri,
          document_path: safe.documentPath,
        },
        'csp violation',
      )
    },
    unknownRequestFields(fields) {
      const distinct = new Set(fields.fields)
      const names = [...new Set([...distinct].map(safeFieldName))].sort()
      sink.warn(
        {
          event: 'unknown_request_fields',
          route: safeRoute(fields.route),
          fields: names.slice(0, UNKNOWN_FIELD_LIMIT),
          count: distinct.size,
        },
        'unknown request fields',
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
          ...(fields.reclaimedPictures === undefined
            ? {}
            : { reclaimed_pictures: fields.reclaimedPictures }),
          ...(fields.purgedTrash === undefined
            ? {}
            : { purged_trash: fields.purgedTrash }),
          ...(fields.purgedEvents === undefined
            ? {}
            : { purged_events: fields.purgedEvents }),
          ...(fields.prunedSessions === undefined
            ? {}
            : { pruned_sessions: fields.prunedSessions }),
          ...(fields.durationMs === undefined
            ? {}
            : { duration_ms: fields.durationMs }),
          ...(fields.note === undefined ? {} : { note: safeNote(fields.note) }),
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

export function logAuthEvent(
  event: AuthLogEvent,
  fields: AuthLogFields = {},
): void {
  defaultSecurityLogger.authEvent(event, fields)
}
