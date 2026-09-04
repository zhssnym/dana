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

/**
 * 7.22's data export (10.5, amended 2026-09-04 for issue #77). Two fields and
 * there is deliberately no third: who exported, and how many bytes left.
 * The size is the one thing worth knowing after the fact — it is how anyone
 * would notice the endpoint growing past what building a document in memory
 * can carry — and it says nothing whatever about what was in it.
 */
export interface ExportLogFields {
  actorId: string
  bytes: number
}

/**
 * The 10.5 line a browser's own CSP violation report produces (issue #99).
 * Three fields and no fourth: a report also carries `script-sample`, a slice
 * of the refused script, and the query string of the document URL, and
 * neither has a parameter here through which it could reach a log line.
 */
export interface CspViolationLogFields {
  directive: string
  blockedUri: string
  documentPath: string
}

/**
 * A request body that carried a key its schema does not declare (issue #104,
 * 10.5 amended 2026-09-04). Two fields and deliberately no third: which route
 * received it, and the names of the keys that were dropped.
 *
 * **No value ever reaches this line, and there is no parameter through which
 * one could.** A key *name* is still a caller-supplied string, so it is
 * whitelisted here rather than at the call site, on the same reasoning
 * `safeCspViolation` is written here: 10.5's promise is that the logger has no
 * parameter user content can reach, not that every caller is careful.
 */
export interface UnknownRequestFieldsLogFields {
  /** Method and mounted path template, `PATCH /api/v1/folders/:id`. Never the
   * concrete URL: the template is what an operator greps for and the concrete
   * one carries row ids. */
  route: string
  /** The key names the schema did not declare. Order is not the caller's. */
  fields: readonly string[]
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
  /**
   * A whole sentence, for the one class of line where the event name is not
   * enough: a condition an operator has to understand at three in the morning
   * from the log alone (issue #80). It is prose written in the source, never a
   * value that came from a request or a row — `safeNote` below refuses
   * anything that is not plain words and clips the length, so a value that
   * ever became dynamic is a mangled line rather than a 10.5 leak.
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
  | 'migrations_applied'
  /** Production is running on the embedded database (issue #80). Its own
   * event name so alerting can key on it rather than on a substring of
   * `migrations_applied`, which reads as neutral information and is how this
   * went unnoticed. */
  | 'database_fallback_pglite'
  | 'database_connection_lost'
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
  exportEvent(fields: ExportLogFields): void
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

/** Plain words and the odd environment variable name, at most 240
 * characters: no braces, quotes, angle brackets, equals signs or newlines, so
 * neither SQL nor a JSON fragment can pass through this field whatever a
 * future caller hands it. */
function safeNote(value: string): string {
  return /^[A-Za-z0-9_ ,.'’\-:;()]{1,240}$/.test(value) ? value : 'other'
}

/* The three shapes a violation report may contribute, each narrow enough
   that no prose fits through it. security/csp-report.ts has already reduced
   a report to these, and these run anyway: 10.5's promise is that the logger
   has no parameter user content can reach, not that every caller is careful.
   A value outside the shape becomes `other` rather than being truncated,
   because half of a sample is still a sample. */
function safeDirective(value: string): string {
  return /^[a-z][a-z0-9-]{0,39}$/.test(value) ? value : 'other'
}

/** A CSP keyword (`inline`, `eval`), or a scheme with an optional host. A
 * path or a query is not a shape this admits. */
function safeBlockedUri(value: string): string {
  const keyword = /^[a-z][a-z-]{0,39}$/
  const schemeAndHost = /^[a-z][a-z0-9+.-]{0,31}:(\/\/[A-Za-z0-9.:*_-]{1,255})?$/
  return keyword.test(value) || schemeAndHost.test(value) ? value : 'other'
}

/** One absolute path, no query and no fragment: the two characters that
 * would begin either are outside the class, and so is `%`, because Dana's
 * own routes are ASCII segments and uuids, so nothing legitimate here needs
 * percent-encoding and an encoded segment is by definition somewhere bytes
 * can hide. */
function safeDocumentPath(value: string): string {
  return /^\/[A-Za-z0-9/_.~-]{0,255}$/.test(value) ? value : 'other'
}

/**
 * The three fields reduced to what 10.5 admits, exported because **the
 * Sentry copy of a violation has to be the same values and not merely
 * similar ones** (issue #99, reviewer finding 2). The route sent
 * `blockedUri` verbatim into a fingerprint, a message and a tag, so a
 * caller-supplied string reached the tracker unwhitelisted and the key
 * space of the fingerprint was unbounded — one changed character was one
 * more Sentry event. Sanitising here and handing the result to both is the
 * only shape in which the two cannot drift.
 *
 * Idempotent: every output of this function is a fixed point of it, so
 * `cspViolation` applying it again to an already-safe value is free and the
 * logger keeps its own guarantee whoever calls it.
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

/* The two shapes issue #104's line admits, each narrow enough that neither a
   value nor a row id fits through it. `parseBody` in src/server/http has
   already reduced a request to these; these run anyway, for the reason
   `safeCspViolation` gives above.

   A route label is one method and one path template. Every segment is a
   literal word or a `:param`, which is what Express registered, and a segment
   shaped like a uuid is refused outright rather than passed: the label is
   built from `req.baseUrl` as well as `req.route.path`, and a router mounted
   under a parameterised path — which this application has none of today —
   would put a concrete row id in the first half. `other` for the whole label
   rather than a repaired one, because a route this cannot spell is a route
   nobody should be reading a name off. */
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

/** One JSON key name, in exactly the shape `app/src/shared/` writes them:
 * snake_case, at most 64 characters, no dot and **no dash**.
 *
 * The dash was in this class when it was written and AC-103 refused it, which
 * is the criterion doing its job. A key name is the one field on this line
 * the caller chooses outright, and `oauth-token-value` and
 * `session-cookie-value` — two of the six strings 10.5 names as never
 * loggable — are valid JSON keys. Nothing stops a client sending a token *as*
 * a key. Narrowing to the class Dana's own keys occupy is what makes that a
 * mangled `other` instead of a leak, and it costs nothing: no request schema
 * in the contract declares a field with a dash or a dot in it, so no key this
 * line exists to report can be spelled with one either.
 *
 * It is a whitelist and not a proof. A short token of bare word characters
 * would pass, and the honest statement of what this buys is that the shapes a
 * secret actually takes — long, and punctuated — do not. */
function safeFieldName(value: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value) ? value : 'other'
}

/** At most this many names on one line. A caller can send an object of a
 * thousand keys within 10.3's body cap, and every one of them would otherwise
 * be a line as long as the body.
 *
 * `count` is the number of **distinct keys the caller actually sent**, taken
 * before `safeFieldName` runs, and the difference is not cosmetic: mangling
 * first would collapse every ill-formed key into one `other`, so forty dashed
 * keys would log `count: 1` and erase the magnitude signal for exactly the
 * caller this line exists to notice. Count the raw names, redact the list. */
const UNKNOWN_FIELD_LIMIT = 20

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
      /* Distinct before mangling, redacted after: `count` measures what the
         caller sent and `fields` says only what may be said about it. */
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

/** Compatibility function for auth helpers that predate per-app injection. */
export function logAuthEvent(
  event: AuthLogEvent,
  fields: AuthLogFields = {},
): void {
  defaultSecurityLogger.authEvent(event, fields)
}
