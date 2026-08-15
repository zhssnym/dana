import type { ErrorRequestHandler } from 'express'

import { errorBody } from '../http/errors.js'
import type { SecurityLogger } from '../security/log.js'
import type { ErrorTracker } from './error-tracker.js'

export function createRequestErrorHandler(
  securityLog: SecurityLogger,
  errorTracker: ErrorTracker,
): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const route = req.route as { path?: unknown } | undefined
    const safePath =
      typeof route?.path === 'string' ? `${req.baseUrl}${route.path}` : 'unmatched'
    const overLimit =
      typeof err === 'object' &&
      err !== null &&
      'type' in err &&
      err.type === 'entity.too.large'
    const status = overLimit
      ? 400
      : typeof err === 'object' &&
          err !== null &&
          'status' in err &&
          typeof err.status === 'number'
        ? err.status
        : 500

    if (status >= 500) {
      const context = { method: req.method, path: safePath, status }
      securityLog.requestError({ ...context, error: err })
      errorTracker.captureException(err, context)
      res.status(status).json(errorBody('internal_error', 'Something went wrong.'))
      return
    }

    const message = status === 400 ? 'Malformed request body.' : 'Request failed.'
    res.status(status).json(errorBody('bad_request', message))
  }
}
