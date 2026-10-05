/*
The shared start of every router here. It creates the router itself so the
session middleware is always registered before any route (Express runs layers
in registration order). In the mounted app the auth router already attached
the session, so this is a no-op there; it keeps each router correct whatever
the mount order. AC-236 cannot see its absence. Authorization is still per route.
*/
import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'

import type { Db, DbClient } from '../../../db/client.js'
import { attachSession, sessionOf } from '../auth/index.js'
import { sendError } from '../http/errors.js'

/** The one option this module reads; every router's options satisfy it. */
export interface PreambleOptions {
  dbClient?: DbClient
}

export interface RouterPreamble {
  router: Router
  /** The database, or null after answering 500 (so an app can be built without one). */
  database: (res: Response) => Db | null
  /**
   * The viewer's id. Empty without `requireSession`, which is a route bug; an
   * empty id is a member of nothing, so queries return no rows.
   */
  viewer: (req: Request) => string
  /** A uuid path parameter, or null after answering 404: a non-uuid would be a cast error (500). */
  parsedId: (res: Response, raw: unknown) => string | null
}

const uuidParam = z.uuid()

export function routerWithPreamble(options: PreambleOptions): RouterPreamble {
  const router = Router()

  if (options.dbClient !== undefined) {
    const attach = attachSession(options.dbClient.db)
    router.use((req: Request, res: Response, next: NextFunction) => {
      // Already attached by an earlier router: resolve the session once per request.
      if (sessionOf(req) !== undefined) {
        next()
        return
      }
      attach(req, res, next)
    })
  }

  return {
    router,
    database: (res: Response): Db | null => {
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
    },
    viewer: (req: Request): string => sessionOf(req)?.userId ?? '',
    parsedId: (res: Response, raw: unknown): string | null => {
      const parsed = uuidParam.safeParse(raw)
      if (!parsed.success) {
        sendError(res, 404, 'not_found', 'Not found.')
        return null
      }
      return parsed.data
    },
  }
}
