/*
The 7.13 surface: the Trash listing, the two restores, and since RFC 0005
change control item 36 the two permanent deletes. The deletes that fill it
live on the task and folder surfaces they always did; here is the way back
and the way out.

The permanent deletes are the folder owner's alone (item 38): a member who
is not the owner can see the row and is told 403, the one place on this
surface where 10.2's grammar admits a forbidden rather than a not-found.
Both answer 204 with nothing, there being nothing left to describe.

Access by folder membership, never by who deleted (7.13), and the 10.2
grammar throughout: a row that does not exist, is not trashed, or is out of
the viewer's reach is one answer, 404. Restores answer the restored object
so the client can place it without a second round trip.
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import { requireCsrf, requireSession } from '../auth/index.js'
import { folderView } from '../domain/folders.js'
import {
  destroyFolder,
  destroyTask,
  removeObjects,
  restoreFolder,
  trashView,
} from '../domain/trash.js'
import type { DestroyOutcome } from '../domain/trash.js'
import type { ObjectStore } from '../files/store.js'
import { sendError } from '../http/errors.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { routerWithPreamble } from './preamble.js'

export interface TrashRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
  /** The store the permanent deletes remove objects from after their
   * transaction commits (RFC 0005 change control item 36). */
  fileStore?: ObjectStore
}

export function createTrashRouter(options: TrashRouterOptions = {}): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)

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

  const destroyed = async (
    res: Response,
    outcome: DestroyOutcome,
  ): Promise<void> => {
    if (outcome.kind === 'not_found') {
      sendError(res, 404, 'not_found', 'Not found.')
      return
    }
    if (outcome.kind === 'forbidden') {
      sendError(
        res,
        403,
        'forbidden',
        'Only the folder owner can delete permanently.',
      )
      return
    }
    // After the commit, 7.15's order: a row that no longer exists is the
    // only thing that may lose its bytes.
    await removeObjects(options.fileStore, outcome.fileIds)
    res.status(204).end()
  }

  router.delete(
    '/trash/tasks/:id',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const taskId = parsedId(res, req.params.id)
      if (taskId === null) return
      await destroyed(res, await destroyTask(db, viewer(req), taskId))
    },
  )

  router.delete(
    '/trash/folders/:id',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      await destroyed(res, await destroyFolder(db, viewer(req), folderId))
    },
  )

  return router
}
