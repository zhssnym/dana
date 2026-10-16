/*
"Referenced from" backlink reads, and where the original of a synced block lives.
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import type { ReferenceKind } from '../../shared/references.js'
import { syncedSource } from '../../shared/synced-blocks.js'
import { requireSession } from '../auth/index.js'
import { backlinksOf } from '../domain/backlinks.js'
import { resolveReference } from '../domain/references.js'
import { syncedSourceOf } from '../domain/synced-blocks.js'
import { sendError } from '../http/errors.js'
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
        res.status(200).json(await backlinksOf(db, viewerId, target, options.appOrigin))
      },
    )
  }

  router.get(
    '/synced-blocks/:id',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const id = parsedId(res, req.params.id)
      if (id === null) return
      const source = await syncedSourceOf(db, viewer(req), id)
      if (source === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(200).json(syncedSource.parse(source))
    },
  )

  return router
}
