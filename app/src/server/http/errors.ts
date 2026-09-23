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
 * What a caller is told about a key no schema declares. Written here rather
 * than taken from zod, whose own sentence repeats the key it is already
 * prefixed with and reads as a validator talking to itself.
 */
const UNRECOGNIZED_KEY_MESSAGE = 'is not a field this endpoint accepts'

/**
 * 10.3's 422, with every failing field named in one message.
 *
 * An issue with an empty path is not about a field, and there are three
 * reasons it can be one.
 *
 * It is usually the body itself being something other than the object the
 * endpoint takes, which is what a request with no JSON content type produces,
 * since nothing parsed a body for the schema to see. Those answer a sentence a
 * person can act on rather than the validator's own phrasing, which would
 * surface "expected object, received undefined" to a caller who never
 * mentioned an object.
 *
 * Or it is a rule about the whole body rather than about one of its fields, a
 * schema-level refinement, which 7.9's PUT carries: its two modes are one exclusive-or and neither field is
 * the wrong one. That message is the schema author's and is written as a whole
 * sentence for exactly this position, because nothing prefixes it, and it
 * reaches the caller as written. Sending the missing-body sentence for it
 * would tell a caller who sent a JSON object that a JSON object is required,
 * which is the one answer they can prove wrong.
 *
 * Or it is a key the schema does not recognise. zod 4 reports one
 * `unrecognized_keys` issue per object rather than one per key, and gives the
 * issue the path of the object the keys sat in, which is empty for the body
 * itself. Read literally that is both wrong ways at once: at the root the
 * issue is dropped for having no path and the caller is told a JSON object is
 * required, having sent one, and one level down the field named is the
 * containing object rather than the key, carrying the validator's own
 * phrasing. So the keys are expanded here, one problem each, addressed from
 * the root the way every other field in this message is. Nothing in
 * `app/src/shared/` is strict and 11.14 rules that none of it becomes strict,
 * so this branch exists for a schema that declares its own refusal; it is
 * covered by a strict schema that lives in this module's test (#105).
 */
export function sendValidationError(res: Response, error: ZodError): void {
  const problems = error.issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        field: [...issue.path.map(String), key].join('.'),
        message: UNRECOGNIZED_KEY_MESSAGE,
      }))
    }
    if (issue.path.length === 0) return []
    return [
      {
        field: issue.path.map(String).join('.'),
        message: issue.message,
      },
    ]
  })
  if (problems.length === 0) {
    const bodyRule = error.issues.find((issue) => issue.code === 'custom')
    sendError(
      res,
      422,
      'validation_failed',
      bodyRule?.message ?? 'A JSON object body is required.',
    )
    return
  }
  sendFieldValidationError(res, problems)
}

export interface FieldProblem {
  field: string
  message: string
}

/**
 * The same 422, for the rules a schema cannot state.
 *
 * Some of 10.3's numbers are not properties of one value: Q3C's range is a
 * relation between start and end and is measured by the calendar arithmetic of
 * src/server/time, which decides which rule broke and says outright that
 * naming the field and choosing the status belong to the route. That leaves
 * one 422 built by a schema and another built by hand, and a caller should not
 * be able to tell which validated it. This is the one formatter, so they read
 * alike; sendValidationError above now goes through it too rather than
 * carrying a second copy of the sentence.
 */
export function sendFieldValidationError(
  res: Response,
  problems: readonly FieldProblem[],
): void {
  const sentences = problems.map(
    (problem) => `${problem.field}: ${problem.message}`,
  )
  sendError(res, 422, 'validation_failed', `${sentences.join('; ')}.`)
}
