import * as Sentry from '@sentry/node'

import { safeStack } from '../security/log.js'

export interface ErrorContext {
  method?: string
  path?: string
  status?: number
}

/**
 * A message that is not an exception, and the grouping it belongs to.
 *
 * `fingerprint` is the whole reason this exists (issue #99). A broken policy
 * refuses the same thing on every cold load for everybody, so a hundred
 * identical refusals must be one issue in Sentry rather than a hundred, and
 * only the caller knows which fields make two of them the same.
 *
 * `tags` carries what issue #80 first spelled as a field of its own named
 * `event`: the same event name the structured log line carries, so one
 * condition is searchable in Sentry and in the logs by one string. It is a
 * tag here rather than a field because the wave-1 merge kept one shape of
 * this object, and a tag is what the field always became.
 */
export interface MessageContext {
  level?: 'info' | 'warning' | 'error'
  /** Replaces Sentry's own grouping outright, which is the point. */
  fingerprint?: readonly string[]
  tags?: Readonly<Record<string, string>>
}

export interface ErrorTracker {
  captureException(error: unknown, context?: ErrorContext): void
  /**
   * A condition worth alerting on that is not an exception (issue #80).
   *
   * `captureException` cannot carry one: `sanitizedError` below replaces every
   * message with "A server error occurred" on purpose, because a driver's
   * error message carries its SQL and its bound values (11.15). So a message
   * a person needs to read has to travel by its own path. The rule that keeps
   * that safe is the one 10.5 states for logging: the sentence is written in
   * the source, never assembled from a request or a row.
   *
   * Not optional, and that is the wave-1 merge's decision rather than either
   * branch's. Issues #80 and #99 arrived within a day of each other with two
   * shapes of this method, one required and one optional; two shapes of one
   * tracker is how a caller ends up reporting nothing through a `?.` that was
   * never going to fire. Every tracker in the tree implements it — the no-op
   * below, the Sentry one, and both test stubs.
   */
  captureMessage(message: string, context?: MessageContext): void
}

export const noOpErrorTracker: ErrorTracker = {
  captureException: () => undefined,
  captureMessage: () => undefined,
}

/** A tracker receives a new error whose message contains no request or row
 * content. Only the error class and code locations survive. */
export function sanitizedError(error: unknown): Error {
  const clean = new Error('A server error occurred')
  clean.name = error instanceof Error ? error.name : 'UnknownError'
  clean.stack = safeStack(error) ?? clean.name
  return clean
}

export function createServerErrorTracker(
  env: NodeJS.ProcessEnv = process.env,
): ErrorTracker {
  const dsn = env.SENTRY_DSN ?? ''
  if (dsn === '') return noOpErrorTracker

  Sentry.init({
    dsn,
    environment: env.NODE_ENV,
    release: env.SENTRY_RELEASE ?? env.RENDER_GIT_COMMIT,
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
    defaultIntegrations: false,
    beforeSend(event) {
      delete event.request
      delete event.user
      delete event.contexts
      delete event.extra
      delete event.breadcrumbs
      return event
    },
  })

  return {
    captureException(error, context = {}) {
      Sentry.withScope((scope) => {
        if (context.method !== undefined) scope.setTag('http.method', context.method)
        if (context.path !== undefined) scope.setTag('http.path', context.path)
        if (context.status !== undefined) scope.setTag('http.status', context.status)
        Sentry.captureException(sanitizedError(error))
      })
    },
    captureMessage(message, context = {}) {
      // `beforeSend` above strips the request, user and context objects from
      // this event exactly as it does an exception's. The level defaults to
      // warning, which is what one CSP refusal is; a caller with a condition
      // somebody has to act on tonight passes 'error' (issue #80).
      const level = context.level ?? 'warning'
      Sentry.withScope((scope) => {
        scope.setLevel(level)
        if (context.fingerprint !== undefined) {
          scope.setFingerprint([...context.fingerprint])
        }
        for (const [name, value] of Object.entries(context.tags ?? {})) {
          scope.setTag(name, value)
        }
        Sentry.captureMessage(message, level)
      })
    },
  }
}
