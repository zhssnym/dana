/*
The person's bundle: GET/PATCH /settings (the only settings surface), saved
views, place covers and place descriptions, all per-person state.
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import {
  patchSettingsBody,
  patchViewBody,
  postViewBody,
} from '../../shared/bundle.js'
import { placeCoverPlace, putPlaceCoverBody } from '../../shared/covers.js'
import type { PlaceCoverPlace } from '../../shared/covers.js'
import { putPlaceDescriptionBody } from '../../shared/place-descriptions.js'
import { requireCsrf, requireSession } from '../auth/index.js'
import {
  createView,
  deleteView,
  listViews,
  patchView,
  readBundle,
  viewById,
  writeBundle,
} from '../domain/bundle.js'
import {
  deletePlaceCover,
  listPlaceCovers,
  putPlaceCover,
} from '../domain/covers.js'
import {
  listPlaceDescriptions,
  putPlaceDescription,
} from '../domain/place-descriptions.js'
import type { ObjectStore } from '../files/store.js'
import { sendError } from '../http/errors.js'
import { parseBody } from '../http/parse-body.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { retiredRoute } from '../observability/retired-route.js'
import { routerWithPreamble } from './preamble.js'

export interface BundleRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
  /** A place cover may copy the picture it names. */
  fileStore?: ObjectStore
  securityLog?: SecurityLogger
}

export function createBundleRouter(options: BundleRouterOptions = {}): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)
  const securityLog = options.securityLog ?? createSecurityLogger()

  /** Without a store a cover's bytes cannot be copied; refuse rather than store a broken row. */
  const storeOf = (res: Response): ObjectStore | null => {
    if (options.fileStore === undefined) {
      sendError(
        res,
        500,
        'internal_error',
        'The application was constructed without an object store.',
      )
      return null
    }
    return options.fileStore
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
      const parsed = parseBody(patchSettingsBody, req, res, securityLog)
      if (parsed === null) return
      res.status(200).json(await writeBundle(db, viewer(req), parsed))
    },
  )

  router.get('/views', requireSession, retiredRoute(securityLog, 'get_views'), async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    res.status(200).json(await listViews(db, viewer(req)))
  })

  router.post(
    '/views',
    requireSession,
    retiredRoute(securityLog, 'post_view'),
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const parsed = parseBody(postViewBody, req, res, securityLog)
      if (parsed === null) return
      const outcome = await createView(db, viewer(req), parsed)
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

  /* This router must be mounted after createViewsRouter: `/views/:id` would
     otherwise swallow `/views/my-day` and the other literal pages (404 for a
     non-uuid). No test catches it; see the mount block in index.ts. */
  router.get(
    '/views/:id',
    requireSession,
    retiredRoute(securityLog, 'get_view'),
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
    retiredRoute(securityLog, 'patch_view'),
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const viewId = parsedId(res, req.params.id)
      if (viewId === null) return
      const parsed = parseBody(patchViewBody, req, res, securityLog)
      if (parsed === null) return
      const view = await patchView(db, viewer(req), viewId, parsed)
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
    retiredRoute(securityLog, 'delete_view'),
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

  /** One of 4.20's fixed places; any other name is 404. */
  const parsedPlace = (
    res: Response,
    raw: unknown,
  ): PlaceCoverPlace | null => {
    const parsed = placeCoverPlace.safeParse(raw)
    if (!parsed.success) {
      sendError(res, 404, 'not_found', 'Not found.')
      return null
    }
    return parsed.data
  }

  router.get(
    '/place-covers',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      res.status(200).json({ covers: await listPlaceCovers(db, viewer(req)) })
    },
  )

  router.put(
    '/place-covers/:place',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const place = parsedPlace(res, req.params.place)
      if (place === null) return
      const parsed = parseBody(putPlaceCoverBody, req, res, securityLog)
      if (parsed === null) return
      const store = storeOf(res)
      if (store === null) return
      const outcome = await putPlaceCover(
        db,
        store,
        viewer(req),
        place,
        parsed,
      )
      if (outcome.kind === 'file_not_found') {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      /* Copying a cover spends the caller's quota exactly as an upload does. */
      if (outcome.kind === 'quota_exceeded') {
        sendError(
          res,
          413,
          'quota_exceeded',
          "You've used your 1 GB of storage. Delete some files to add more.",
        )
        return
      }
      res.status(200).json(outcome.cover)
    },
  )

  router.delete(
    '/place-covers/:place',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const place = parsedPlace(res, req.params.place)
      if (place === null) return
      await deletePlaceCover(db, viewer(req), place)
      res.status(204).end()
    },
  )

  router.get(
    '/place-descriptions',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      res
        .status(200)
        .json({ descriptions: await listPlaceDescriptions(db, viewer(req)) })
    },
  )

  router.put(
    '/place-descriptions/:place',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const place = parsedPlace(res, req.params.place)
      if (place === null) return
      const parsed = parseBody(putPlaceDescriptionBody, req, res, securityLog)
      if (parsed === null) return
      res
        .status(200)
        .json(await putPlaceDescription(db, viewer(req), place, parsed))
    },
  )

  return router
}
