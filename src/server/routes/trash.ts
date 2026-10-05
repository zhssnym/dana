/*
The 7.13 Trash routes: list, restore, permanent delete. Access follows folder
membership, never who deleted; anything missing or out of reach is 404. Below
the delete bar the row is visible, so that refusal is 403. Task and folder
permanent deletes follow different rules (see domain/trash.ts).
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import { archiveFolder, archivedWorkView, destroyArchivedFolder, restoreArchivedFolder } from '../domain/archive.js'
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
  /** Objects are removed after the delete commits. */
  fileStore?: ObjectStore
}

export function createTrashRouter(options: TrashRouterOptions = {}): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)

  const archiveOutcome = (res: Response, outcome: Awaited<ReturnType<typeof archiveFolder>>): boolean => {
    if (outcome === 'done') return true
    if (outcome === 'not_found') sendError(res, 404, 'not_found', 'Not found.')
    else sendError(res, outcome.kind === 'forbidden' ? 403 : 409,
      outcome.kind === 'forbidden' ? 'forbidden' : 'conflict', outcome.reason)
    return false
  }

  router.get('/archive/folders', requireSession, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    res.status(200).json(await archivedWorkView(db, viewer(req)))
  })

  router.post('/folders/:id/archive', requireSession, requireCsrf, mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const id = parsedId(res, req.params.id)
      if (id === null) return
      if (archiveOutcome(res, await archiveFolder(db, viewer(req), id))) res.status(204).end()
    })

  router.post('/archive/folders/:id/restore', requireSession, requireCsrf, mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const id = parsedId(res, req.params.id)
      if (id === null) return
      if (archiveOutcome(res, await restoreArchivedFolder(db, viewer(req), id))) {
        res.status(200).json(await folderView(db, viewer(req), id))
      }
    })

  router.delete('/archive/folders/:id', requireSession, requireCsrf, mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const id = parsedId(res, req.params.id)
      if (id === null) return
      const outcome = await destroyArchivedFolder(db, viewer(req), id)
      if (typeof outcome === 'object' && outcome.kind === 'destroyed') {
        await removeObjects(options.fileStore, outcome.fileIds)
        res.status(204).end()
      } else archiveOutcome(res, outcome)
    })

  router.get('/trash', requireSession, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    res.status(200).json(await trashView(db, viewer(req)))
  })

  // POST /tasks/:id/restore lives in the tasks router: one handler forks on
  // whether the task is trashed. Only the folder restore is here.
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
      if (outcome !== 'restored') {
        if (outcome.kind === 'conflict') sendError(res, 409, 'conflict', outcome.reason)
        else sendError(res, 403, 'forbidden', outcome.reason)
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
      // The resolver's sentence: task and folder deletes have different rules.
      sendError(res, 403, 'forbidden', outcome.reason)
      return
    }
    // After the commit, so only rows that are gone lose their bytes.
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
