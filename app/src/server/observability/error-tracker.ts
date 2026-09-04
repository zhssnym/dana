import * as Sentry from '@sentry/node'

import { safeStack } from '../security/log.js'

export interface ErrorContext {
  method?: string
  path?: string
  status?: number
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
   */
  captureMessage(message: string, context?: MessageContext): void
}

export interface MessageContext {
  /** The same event name the structured log line carries, as a tag, so one
   * condition is searchable in both places by one string. */
  event?: string
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
      // Error level, because the conditions that travel this way are the ones
      // somebody has to act on; `beforeSend` above strips the request, user
      // and context objects from this event exactly as it does an exception's.
      Sentry.withScope((scope) => {
        if (context.event !== undefined) scope.setTag('event', context.event)
        Sentry.captureMessage(message, 'error')
      })
    },
  }
}
