/*
The 7.0 error envelope helpers; every route answers errors through these.
Schema failures are 422 with every failing field in one message (10.3).
JSON parse failures are 400 from the app's error handler, not from here.
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

/** Our own sentence; zod's repeats the key it is already prefixed with. */
const UNRECOGNIZED_KEY_MESSAGE = 'is not a field this endpoint accepts'

/**
 * 10.3's 422, every failing field in one message. An issue with an empty path
 * is either a non-object body (answered with a plain sentence) or a body-level
 * refinement, whose own message is sent as written. `unrecognized_keys` (only
 * from a strict schema) is expanded to one problem per key.
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

/** The same 422 for rules a schema cannot state, so callers cannot tell which validated. */
export function sendFieldValidationError(
  res: Response,
  problems: readonly FieldProblem[],
): void {
  const sentences = problems.map(
    (problem) => `${problem.field}: ${problem.message}`,
  )
  sendError(res, 422, 'validation_failed', `${sentences.join('; ')}.`)
}
