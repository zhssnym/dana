/* The 7.3 roster: list and remove. */
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import { requireCsrf, requireSession } from '../auth/index.js'
import { sendError } from '../http/errors.js'
import { listConnections, removeConnection } from '../domain/connections.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { routerWithPreamble } from './preamble.js'

export interface ConnectionsRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
}

export function createConnectionsRouter(
  options: ConnectionsRouterOptions = {},
): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)

  router.get(
    '/connections',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      res.status(200).json(await listConnections(db, viewer(req)))
    },
  )

  router.delete(
    '/connections/:userId',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      // A non-uuid names no connection: parsedId's 404 is the right answer.
      const userId = parsedId(res, req.params.userId)
      if (userId === null) return
      // Either side may remove; memberships the pair sponsored are untouched (7.3).
      if (!(await removeConnection(db, viewer(req), userId))) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(204).end()
    },
  )

  return router
}
