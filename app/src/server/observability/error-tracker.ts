import * as Sentry from '@sentry/node'

import { safeStack } from '../security/log.js'

export interface ErrorContext {
  method?: string
  path?: string
  status?: number
}

export interface ErrorTracker {
  captureException(error: unknown, context?: ErrorContext): void
}

export const noOpErrorTracker: ErrorTracker = {
  captureException: () => undefined,
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
  }
}
