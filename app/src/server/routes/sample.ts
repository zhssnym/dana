/*
The sample workspace surface (RFC 0005 change control item 60): GET, DELETE
and POST /api/v1/sample, every one the caller's own account and no other.
The two writes go through the 10.2 chokepoint the way every mutation does,
CSRF and the general mutation limit; the 204 says what it left standing in
one header, because a shared sample folder is the one thing removal will
not take and the strip should be able to say so.
*/
import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'

import { sql } from 'drizzle-orm'

import type { Db, DbClient } from '../../../db/client.js'
import { SAMPLE_KEPT_HEADER } from '../../shared/sample.js'
import {
  attachSession,
  requireCsrf,
  requireSession,
  sessionOf,
} from '../auth/index.js'
import { rowsOf } from '../domain/db.js'
import { removeObjects } from '../domain/trash.js'
import type { ObjectStore } from '../files/store.js'
import { sendError } from '../http/errors.js'
import {
  removeSampleWorkspace,
  restoreSampleWorkspace,
  sampleStatus,
} from '../sample/workspace.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'

export interface SampleRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
  fileStore?: ObjectStore
}

export function createSampleRouter(options: SampleRouterOptions = {}): Router {
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

  router.get('/sample', requireSession, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    res.status(200).json(await sampleStatus(db, viewer(req)))
  })

  router.delete(
    '/sample',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const removal = await removeSampleWorkspace(db, viewer(req))
      // 7.15's order: the rows are committed, so the bytes go now.
      await removeObjects(options.fileStore, removal.fileIds)
      if (removal.keptFolders.length > 0) {
        res.setHeader(SAMPLE_KEPT_HEADER, encodeURIComponent(removal.keptFolders.join('\n')))
      }
      res.status(204).end()
    },
  )

  router.post(
    '/sample',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const zone = await rowsOf(
        db,
        sql`SELECT timezone FROM users WHERE id = ${viewer(req)}::uuid`,
      )
      try {
        res
          .status(200)
          .json(
            await restoreSampleWorkspace(db, viewer(req), String(zone[0]?.timezone ?? 'UTC')),
          )
      } catch (error) {
        // 4.18's (user_id, name) unique: the person has a shelf of their own
        // by one of the sample's names, and the sample will not rename
        // theirs to make room for its own.
        if (/23505|unique/i.test(String((error as { message?: string })?.message ?? error))) {
          sendError(
            res,
            409,
            'conflict',
            'You already have a shelf named like one of the sample shelves. Rename it, then try again.',
          )
          return
        }
        throw error
      }
    },
  )

  return router
}
