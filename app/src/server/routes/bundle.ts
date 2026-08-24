/*
The person's bundle on the wire (RFC 0005): GET and PATCH /settings, the
v2 surface that answers 4.19's whole expansion, and the /views family for
saved views. Frozen 7.2's /me/settings is untouched next door; a v1 client
never meets these paths and a v2 client never needs that one.
*/
import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'

import type { Db, DbClient } from '../../../db/client.js'
import {
  patchSettingsBody,
  patchViewBody,
  postViewBody,
} from '../../shared/bundle.js'
import {
  attachSession,
  requireCsrf,
  requireSession,
  sessionOf,
} from '../auth/index.js'
import {
  createView,
  deleteView,
  listViews,
  patchView,
  readBundle,
  viewById,
  writeBundle,
} from '../domain/bundle.js'
import { sendError, sendValidationError } from '../http/errors.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'

export interface BundleRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
}

const uuidParam = z.uuid()

export function createBundleRouter(options: BundleRouterOptions = {}): Router {
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

  const parsedId = (res: Response, raw: unknown): string | null => {
    const parsed = uuidParam.safeParse(raw)
    if (!parsed.success) {
      sendError(res, 404, 'not_found', 'Not found.')
      return null
    }
    return parsed.data
  }

  router.get(
    '/settings',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      res.status(200).json(await readBundle(db, viewer(req)))
    },
  )

  router.patch(
    '/settings',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const parsed = patchSettingsBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      res.status(200).json(await writeBundle(db, viewer(req), parsed.data))
    },
  )

  router.get('/views', requireSession, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    res.status(200).json(await listViews(db, viewer(req)))
  })

  router.post(
    '/views',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const parsed = postViewBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const outcome = await createView(db, viewer(req), parsed.data)
      if (outcome.kind === 'view_cap') {
        sendError(
          res,
          422,
          'validation_failed',
          'You already have 50 saved views, the most an account can hold.',
        )
        return
      }
      res.status(201).json(outcome.view)
    },
  )

  router.get(
    '/views/:id',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const viewId = parsedId(res, req.params.id)
      if (viewId === null) return
      const view = await viewById(db, viewer(req), viewId)
      if (view === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(200).json(view)
    },
  )

  router.patch(
    '/views/:id',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const viewId = parsedId(res, req.params.id)
      if (viewId === null) return
      const parsed = patchViewBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const view = await patchView(db, viewer(req), viewId, parsed.data)
      if (view === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(200).json(view)
    },
  )

  router.delete(
    '/views/:id',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const viewId = parsedId(res, req.params.id)
      if (viewId === null) return
      if ((await deleteView(db, viewer(req), viewId)) === 'not_found') {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(204).end()
    },
  )

  return router
}
