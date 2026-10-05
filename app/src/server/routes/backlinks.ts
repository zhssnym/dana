/*
"Referenced from" backlink reads, plus explicit block-to-facet relations within
a project (for media blocks, which cannot hold an inline link).
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import { getProjectBlockFacetsQuery, getProjectBlockFacetsResponse, putBlockFacetsBody, putBlockFacetsResponse } from '../../shared/block-facets.js'
import type { ReferenceKind } from '../../shared/references.js'
import { requireCsrf, requireSession } from '../auth/index.js'
import { backlinksOf } from '../domain/backlinks.js'
import { resolveReference } from '../domain/references.js'
import { sendError, sendValidationError } from '../http/errors.js'
import { projectBlockFacets, setBlockFacets } from '../views/block-facets.js'
import { connectedWorkOf } from '../views/connected-work.js'
import { routerWithPreamble } from './preamble.js'

export interface BacklinksRouterOptions {
  dbClient?: DbClient
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

  /* These take ids from the query and body (two peers, neither subordinate),
     so the ac-397 sweep cannot see them; each authorizes explicitly below. */
  router.get(
    '/block-facets',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const parsed = getProjectBlockFacetsQuery.safeParse(req.query)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const answer = await projectBlockFacets(db, viewer(req), parsed.data.folder)
      if (answer === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(200).json(getProjectBlockFacetsResponse.parse(answer))
    },
  )

  router.put(
    '/block-facets',
    requireSession,
    requireCsrf,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const parsed = putBlockFacetsBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const result = await setBlockFacets(db, viewer(req), parsed.data.block_id, parsed.data.facet_ids)
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
