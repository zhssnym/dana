/*
GET /stats: aggregate counts for the people who run Dana, and nobody else.

The gate is an email allowlist, `DANA_OPERATORS`, checked against the signed-in
account. Everyone else, signed in or not, gets the same 404 an unknown path
gets, so the route does not say it exists.
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
