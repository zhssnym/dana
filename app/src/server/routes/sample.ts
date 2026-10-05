/*
The 7.20 sample workspace routes, on the caller's own account only. The DELETE's
204 lists, in headers, the shared sample folders it kept or trashed.
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import { SAMPLE_KEPT_HEADER, SAMPLE_TRASHED_HEADER } from '../../shared/sample.js'
import { requireCsrf, requireSession } from '../auth/index.js'
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
import { routerWithPreamble } from './preamble.js'

export interface SampleRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
  fileStore?: ObjectStore
}

export function createSampleRouter(options: SampleRouterOptions = {}): Router {
  const { router, database, viewer } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)

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
      // Rows are committed, so the bytes go now.
      await removeObjects(options.fileStore, removal.fileIds)
      if (removal.keptFolders.length > 0) {
        res.setHeader(SAMPLE_KEPT_HEADER, encodeURIComponent(removal.keptFolders.join('\n')))
      }
      if (removal.trashedFolders.length > 0) {
        res.setHeader(
          SAMPLE_TRASHED_HEADER,
          encodeURIComponent(removal.trashedFolders.join('\n')),
        )
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
      const outcome = await restoreSampleWorkspace(db, viewer(req))
      if (outcome.kind === 'shelf_name_taken') {
        sendError(
          res,
          409,
          'conflict',
          'You already have a collection named like one of the sample collections. Rename it, then try again.',
        )
        return
      }
      res.status(200).json(outcome.status)
    },
  )

  return router
}
