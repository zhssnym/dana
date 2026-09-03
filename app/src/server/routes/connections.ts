/*
The 7.3 surface: the roster and its one removal. Two endpoints, no request
body, and no business logic here (the API role's route convention): the
domain module answers both questions and this file maps them onto 7.0's
statuses.

Mounted under /api/v1 by the boot file, which is the Platform engineer's; the
wiring request is recorded in README.md beside this file. The router carries
its own session attachment so it composes whichever order routers mount in,
the folders router's arrangement exactly; that block, and the two helpers
beside it, are `preamble.ts` since issue #36.
*/
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
      // 7.3 names the elements and their order and no wrapper, so the array
      // answers bare, the same literal reading GET /folders takes.
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
      // A path id that is not a uuid names no connection, and 7.3 answers
      // 404 when there is no such connection, which is what parsedId sends.
      const userId = parsedId(res, req.params.userId)
      if (userId === null) return
      // Either side may call, which the canonical pair makes structural, so
      // there is no actor branch here at all. The memberships the pair once
      // sponsored are untouched: 7.3 says so, and the statement names one
      // table.
      if (!(await removeConnection(db, viewer(req), userId))) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(204).end()
    },
  )

  return router
}
