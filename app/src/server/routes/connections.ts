/*
The 7.3 surface: the roster and its one removal. Two endpoints, no request
body, and no business logic here (the API role's route convention): the
domain module answers both questions and this file maps them onto 7.0's
statuses.

Mounted under /api/v1 by the boot file, which is the Platform engineer's; the
wiring request is recorded in README.md beside this file. The router carries
its own session attachment so it composes whichever order routers mount in,
the folders router's arrangement exactly.
*/
import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'

import type { Db, DbClient } from '../../../db/client.js'
import {
  attachSession,
  requireCsrf,
  requireSession,
  sessionOf,
} from '../auth/index.js'
import { sendError } from '../http/errors.js'
import { listConnections, removeConnection } from '../domain/connections.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'

export interface ConnectionsRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
}

const uuidParam = z.uuid()

export function createConnectionsRouter(
  options: ConnectionsRouterOptions = {},
): Router {
  const router = Router()
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)

  const database = (res: Response): Db | null => {
    if (options.dbClient === undefined) {
      sendError(
        res,
        500,
        'internal_error',
        'The application was constructed without a database.',
      )
      return null
    }
    return options.dbClient.db
  }

  if (options.dbClient !== undefined) {
    const attach = attachSession(options.dbClient.db)
    router.use((req: Request, res: Response, next: NextFunction) => {
      if (sessionOf(req) !== undefined) {
        next()
        return
      }
      attach(req, res, next)
    })
  }

  const viewer = (req: Request): string => sessionOf(req)?.userId ?? ''

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
      const parsed = uuidParam.safeParse(req.params.userId)
      // A path id that is not a uuid names no connection, and 7.3 answers
      // 404 when there is no such connection.
      if (!parsed.success) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      // Either side may call, which the canonical pair makes structural, so
      // there is no actor branch here at all. The memberships the pair once
      // sponsored are untouched: 7.3 says so, and the statement names one
      // table.
      if (!(await removeConnection(db, viewer(req), parsed.data))) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(204).end()
    },
  )

  return router
}
