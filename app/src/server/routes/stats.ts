/*
GET /stats: aggregate counts for operators listed in DANA_OPERATORS (by email).
Everyone else gets 404, so the route does not reveal itself.
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import { requireSession } from '../auth/index.js'
import { SESSION_TTL_DAYS } from '../auth/sessions.js'
import { isOperator, operatorEmails, readStats } from '../domain/stats.js'
import { sendError } from '../http/errors.js'
import { routerWithPreamble } from './preamble.js'

export interface StatsRouterOptions {
  dbClient?: DbClient
}

export function createStatsRouter(options: StatsRouterOptions = {}): Router {
  const { router, database, viewer } = routerWithPreamble(options)

  router.get('/stats', requireSession, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    if (!(await isOperator(db, viewer(req), operatorEmails(process.env.DANA_OPERATORS)))) {
      sendError(res, 404, 'not_found', 'Not found.')
      return
    }
    res.status(200).json(await readStats(db, SESSION_TTL_DAYS))
  })

  return router
}
