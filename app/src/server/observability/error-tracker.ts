import * as Sentry from '@sentry/node'

import { safeStack } from '../security/log.js'

export interface ErrorContext {
  method?: string
  path?: string
  status?: number
}

/** A non-exception message and its Sentry grouping. */
export interface MessageContext {
  level?: 'info' | 'warning' | 'error'
  fingerprint?: readonly string[]
  tags?: Readonly<Record<string, string>>
}

export interface ErrorTracker {
  captureException(error: unknown, context?: ErrorContext): void
  /**
   * A message apart from exceptions, because `sanitizedError` blanks exception text.
   * Write the sentence in source, never from a request or a row (10.5).
   */
  captureMessage(message: string, context?: MessageContext): void
}

export const noOpErrorTracker: ErrorTracker = {
  captureException: () => undefined,
  captureMessage: () => undefined,
}

/** A copy of the error without request or row content: only the class and stack survive. */
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
