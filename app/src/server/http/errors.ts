/*
The 7.0 error envelope helpers. Every route answers its errors through these
so forty endpoints signal like one system. The canonical codes, one per
taxonomy status: bad_request 400, unauthenticated 401, forbidden 403,
not_found 404, conflict 409 (rule conflicts gain specific codes as the
section 5 tables land), validation_failed 422, rate_limited 429,
internal_error 500.

Route convention: safeParse the shared schema, sendValidationError on
failure, then delegate to a domain module. JSON parse failures never reach
these helpers, because express.json answers 400 through the boot file's
generic handler (7.0's malformed case); a schema failure is always 422 with
every failing field named in one message (10.3), so a multi-field body
reports all of its problems in a single answer.
*/
import type { Response } from 'express'
import type { ZodError } from 'zod'

import type { ErrorEnvelope } from '../../shared/error-envelope.js'

export function errorBody(code: string, message: string): ErrorEnvelope {
  return { error: { code, message } }
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
): void {
  res.status(status).json(errorBody(code, message))
}

/**
 * 10.3's 422, with every failing field named in one message.
 *
 * An issue with an empty path is not about a field: it is the body itself
 * being something other than the object the endpoint takes, which is what a
 * request with no JSON content type produces, since nothing parsed a body for
 * the schema to see. Those answer a sentence a person can act on rather than
 * the validator's own phrasing, which would surface "expected object,
 * received undefined" to a caller who never mentioned an object.
 */
export function sendValidationError(res: Response, error: ZodError): void {
  const fieldIssues = error.issues.filter((issue) => issue.path.length > 0)
  if (fieldIssues.length === 0) {
    sendError(
      res,
      422,
      'validation_failed',
      'A JSON object body is required.',
    )
    return
  }
  const problems = fieldIssues.map(
    (issue) => `${issue.path.map(String).join('.')}: ${issue.message}`,
  )
  sendError(res, 422, 'validation_failed', `${problems.join('; ')}.`)
}
