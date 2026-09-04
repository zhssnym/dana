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
   * Optional so that a focused test can still inject a tracker in two lines
   * — AC-104's does — and so that adding this in 2026-09 did not require
   * editing a test to keep the compiler happy. Every tracker this module
   * builds implements it; a caller reaches it through `?.`.
   */
  captureMessage?(message: string, context?: MessageContext): void
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
