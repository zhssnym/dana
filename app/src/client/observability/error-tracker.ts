import * as Sentry from '@sentry/react'

function sanitizedClientError(error: unknown): Error {
  const clean = new Error('A client error occurred')
  if (!(error instanceof Error)) return clean
  clean.name = error.name
  const stack = error.stack ?? ''
  const frames = stack.indexOf('\n    at ')
  clean.stack = frames === -1 ? error.name : `${error.name}${stack.slice(frames)}`
  return clean
}

const dsn = import.meta.env.VITE_SENTRY_DSN
if (typeof dsn === 'string' && dsn !== '') {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
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

  window.addEventListener('error', (event) => {
    Sentry.captureException(sanitizedClientError(event.error))
  })
  window.addEventListener('unhandledrejection', (event) => {
    Sentry.captureException(sanitizedClientError(event.reason))
  })
}
