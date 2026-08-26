/*
The 7.13 surface: the Trash listing and the two restores (RFC 0005). The
deletes that fill it live on the task and folder surfaces they always did;
what is new is only the way back.

Access by folder membership, never by who deleted (7.13), and the 10.2
grammar throughout: a row that does not exist, is not trashed, or is out of
the viewer's reach is one answer, 404. Restores answer the restored object
so the client can place it without a second round trip.
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
import { folderView } from '../domain/folders.js'
import { restoreFolder, trashView } from '../domain/trash.js'
import { sendError } from '../http/errors.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'

export interface TrashRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
}

const uuidParam = z.uuid()

function parsedId(res: Response, raw: unknown): string | null {
  const parsed = uuidParam.safeParse(raw)
  if (!parsed.success) {
    sendError(res, 404, 'not_found', 'Not found.')
    return null
  }
  return parsed.data
}

export function createTrashRouter(options: TrashRouterOptions = {}): Router {
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

  router.get('/trash', requireSession, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    res.status(200).json(await trashView(db, viewer(req)))
  })

  // POST /tasks/:id/restore is served by the tasks router, where frozen
  // 7.6's restore transition already owns the path: the two meanings have
  // disjoint domains (a trashed row is invisible to the transition), so one
  // handler forks on the row's state rather than two routers racing for the
  // route. Only the folder restore lives here.
  router.post(
    '/folders/:id/restore',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const outcome = await restoreFolder(db, viewer(req), folderId)
      if (outcome === 'not_found') {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(200).json(await folderView(db, viewer(req), folderId))
    },
  )

  return router
}
