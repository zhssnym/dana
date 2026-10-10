/*
POST /feedback: any signed-in person. GET and PATCH: operators in DANA_OPERATORS only;
everyone else gets 404, as on /stats.
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import { patchFeedbackBody, postFeedbackBody } from '../../shared/feedback.js'
import { requireCsrf, requireSession } from '../auth/index.js'
import { createFeedback, listFeedback, setFeedbackDone } from '../domain/feedback.js'
import { isOperator, operatorEmails } from '../domain/stats.js'
import { sendError } from '../http/errors.js'
import { parseBody } from '../http/parse-body.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { routerWithPreamble } from './preamble.js'

export function createFeedbackRouter(options: {
  dbClient?: DbClient
  rateLimits?: RateLimits
  securityLog?: SecurityLogger
} = {}): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)
  const securityLog = options.securityLog ?? createSecurityLogger()
  const operator = (db: Parameters<typeof isOperator>[0], req: Request): Promise<boolean> =>
    isOperator(db, viewer(req), operatorEmails(process.env.DANA_OPERATORS))

  router.post('/feedback', requireSession, requireCsrf, mutationLimit, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    const body = parseBody(postFeedbackBody, req, res, securityLog)
    if (body === null) return
    const id = await createFeedback(db, viewer(req), body)
    if (id === null) {
      sendError(res, 422, 'validation_failed', 'content: a file is not yours or cannot be attached.')
      return
    }
    res.status(201).json({ id })
  })

  router.get('/feedback', requireSession, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    if (!(await operator(db, req))) { sendError(res, 404, 'not_found', 'Not found.'); return }
    res.status(200).json({ items: await listFeedback(db) })
  })

  router.patch('/feedback/:id', requireSession, requireCsrf, mutationLimit, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    if (!(await operator(db, req))) { sendError(res, 404, 'not_found', 'Not found.'); return }
    const id = parsedId(res, req.params.id)
    if (id === null) return
    const body = parseBody(patchFeedbackBody, req, res, securityLog)
    if (body === null) return
    if (!(await setFeedbackDone(db, id, body.done))) { sendError(res, 404, 'not_found', 'Not found.'); return }
    res.status(204).end()
  })

  return router
}
