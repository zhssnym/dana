/*
"Referenced from" (issue #214) and #488's two facet-reference forms.

Dana Links keep the reciprocal backlink reads below. #488 additionally gives a
whole persisted block an explicit, project-local facet relation, which is what
media/file blocks need because they cannot hold an inline chip. The two forms
converge only in Connected work; an adjacent block is never inferred.
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import { getProjectBlockFacetsResponse, putBlockFacetsBody, putBlockFacetsResponse } from '../../shared/block-facets.js'
import type { ReferenceKind } from '../../shared/references.js'
import { requireSession } from '../auth/index.js'
import { backlinksOf } from '../domain/backlinks.js'
import { resolveReference } from '../domain/references.js'
import { sendError, sendValidationError } from '../http/errors.js'
import { projectBlockFacets, setBlockFacets } from '../views/block-facets.js'
import { connectedWorkOf } from '../views/connected-work.js'
import { routerWithPreamble } from './preamble.js'

export interface BacklinksRouterOptions {
  dbClient?: DbClient
  /** The application's own origin, so an absolute same-origin Dana Link
   * counts as a reference exactly as `parseDanaLink` would admit it. Absent,
   * only the canonical relative form (`/app/tasks/:id`) is matched. */
  appOrigin?: string
}

const SEGMENTS: readonly (readonly [string, ReferenceKind])[] = [
  ['tasks', 'task'],
  ['folders', 'folder'],
  ['shelves', 'shelf'],
  ['facets', 'facet'],
  ['discussions', 'discussion'],
  ['outcomes', 'outcome'],
  ['results', 'result'],
]

export function createBacklinksRouter(
  options: BacklinksRouterOptions = {},
): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)

  for (const [segment, kind] of SEGMENTS) {
    router.get(
      `/${segment}/:id/backlinks`,
      requireSession,
      async (req: Request, res: Response) => {
        const db = database(res)
        if (db === null) return
        const id = parsedId(res, req.params.id)
        if (id === null) return
        const viewerId = viewer(req)
        const target = { kind, id }
        if ((await resolveReference(db, viewerId, target)) === null) {
          sendError(res, 404, 'not_found', 'Not found.')
          return
        }
        const answer = kind === 'facet'
          ? await connectedWorkOf(db, viewerId, id, options.appOrigin)
          : await backlinksOf(db, viewerId, target, options.appOrigin)
        res.status(200).json(answer)
      },
    )
  }

  /* One project-wide read feeds the small chips without one request per
     block. `:id` may be any live page in the project; membership is checked
     inside the view read and the response carries no unrelated project. */
  router.get(
    '/folders/:id/block-facets',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const pageId = parsedId(res, req.params.id)
      if (pageId === null) return
      const answer = await projectBlockFacets(db, viewer(req), pageId)
      if (answer === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(200).json(getProjectBlockFacetsResponse.parse(answer))
    },
  )

  /* Atomic replacement is the explicit link+unlink operation. The view-layer
     coordinator validates the source block, write authority, target Doc tabs
     and exact same-project boundary in one transaction. */
  router.put(
    '/blocks/:id/facets',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const blockId = parsedId(res, req.params.id)
      if (blockId === null) return
      const parsed = putBlockFacetsBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const result = await setBlockFacets(db, viewer(req), blockId, parsed.data.facet_ids)
      if (result.kind === 'not_found') {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      if (result.kind === 'forbidden') {
        sendError(res, 403, 'forbidden', result.reason)
        return
      }
      if (result.kind === 'invalid') {
        sendError(res, 422, 'validation_error', result.reason)
        return
      }
      res.status(200).json(putBlockFacetsResponse.parse(result.value))
    },
  )

  return router
}
