/*
Dana Link references (issue #223, M1-C1). Two reads, no writes, no table.

    GET /api/v1/references/:kind/:id   one target, as a chip summary
    GET /api/v1/references/search      the picker's list, as it is typed
    GET /api/v1/results/:id            where a native Result lives (#213)

#488 adds one rule to the picker when it is used inside a Work/project: facet
references are project-local. Generic Dana Links to Tasks/Folders/etc retain
their ordinary reach; only `kind: facet` rows are cut to the composing
project. An exact pasted URL can still resolve as navigation, but Connected
work likewise refuses to treat a cross-project facet href as a relationship.
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import { referenceKind, referenceSearchQuery } from '../../shared/references.js'
import { requireSession } from '../auth/index.js'
import { accessOf } from '../domain/folder-access.js'
import { resolveReference, resultLocation, searchReferences } from '../domain/references.js'
import { sendError, sendValidationError } from '../http/errors.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { projectFacetOptions } from '../views/block-facets.js'
import { routerWithPreamble } from './preamble.js'

export interface ReferencesRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
}

export function createReferencesRouter(
  options: ReferencesRouterOptions = {},
): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const searchLimit = optionalLimit(options.rateLimits?.search)

  router.get(
    '/references/search',
    requireSession,
    searchLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const parsed = referenceSearchQuery.safeParse(req.query)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const viewerId = viewer(req)
      const { q, folder } = parsed.data
      if (
        folder !== undefined &&
        (await accessOf(db, viewerId, folder)) === null
      ) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }

      const results = await searchReferences(db, viewerId, {
        q,
        ...(folder === undefined ? {} : { folderId: folder }),
      })
      if (folder === undefined) {
        res.status(200).json({ results })
        return
      }
      const localFacets = await projectFacetOptions(db, viewerId, folder)
      if (localFacets === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const allowed = new Set(localFacets.map((facet) => facet.id))
      res.status(200).json({
        results: results.filter((result) => result.kind !== 'facet' || allowed.has(result.id)),
      })
    },
  )

  router.get(
    '/references/:kind/:id',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const kind = referenceKind.safeParse(req.params.kind)
      if (!kind.success) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const id = parsedId(res, req.params.id)
      if (id === null) return

      const found = await resolveReference(db, viewer(req), {
        kind: kind.data,
        id,
      })
      if (found === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(200).json(found)
    },
  )

  router.get(
    '/results/:id',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const id = parsedId(res, req.params.id)
      if (id === null) return
      const found = await resultLocation(db, viewer(req), id)
      if (found === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(200).json(found)
    },
  )

  return router
}
