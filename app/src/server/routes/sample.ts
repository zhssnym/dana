/*
The sample workspace surface (RFC 0005 change control item 60): GET, DELETE
and POST /api/v1/sample, every one the caller's own account and no other.
The two writes go through the 10.2 chokepoint the way every mutation does,
CSRF and the general mutation limit; the 204 says what it left standing in
one header, because a shared sample folder is the one thing removal will
not take and the strip should be able to say so.
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import { SAMPLE_KEPT_HEADER } from '../../shared/sample.js'
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
      const outcome = await restoreSampleWorkspace(db, viewer(req))
      if (outcome.kind === 'shelf_name_taken') {
        sendError(
          res,
          409,
          'conflict',
          'You already have a shelf named like one of the sample shelves. Rename it, then try again.',
        )
        return
      }
      res.status(200).json(outcome.status)
    },
  )

  return router
}
