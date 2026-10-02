/*
"Referenced from" (issue #214). One GET per Dana Link target kind, no
writes, no table:

    GET /api/v1/tasks/:id/backlinks
    GET /api/v1/folders/:id/backlinks
    GET /api/v1/shelves/:id/backlinks
    GET /api/v1/facets/:id/backlinks
    GET /api/v1/discussions/:id/backlinks     (#320)
    GET /api/v1/outcomes/:id/backlinks        (#320)
    GET /api/v1/results/:id/backlinks         (#213)

#488 adds one richer facet-only projection:

    GET /api/v1/facets/:id/connected-work

It uses the same backlink scan, but answers the exact source blocks/posts and
their small previews so a facet can show the work rather than only the owning
document.

**Why a path id per kind rather than `?target=<link>`.** The ac-397 sweep sees
path parameters only; a target on the query string would be the one id no
structural check notices. Each route therefore names its target in the path
and has its own sweep row.

**The target is gated first, through `resolveReference`**, the same gate the
chip resolver uses, so a target the reader cannot open and a target that does
not exist are the same bare 404 here as there — and nothing is scanned for a
target the reader could not have named. Every source answered is then scoped
by the reader's access to *it* (`domain/backlinks.ts` and
`domain/connected-work.ts`).
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import type { ReferenceKind } from '../../shared/references.js'
import { requireSession } from '../auth/index.js'
import { backlinksOf } from '../domain/backlinks.js'
import { connectedWorkOf } from '../domain/connected-work.js'
import { resolveReference } from '../domain/references.js'
import { sendError } from '../http/errors.js'
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
  /* #320. Targets only: a Discussion's opening context and an Outcome's
     statement are plain text, which holds no `href`, so neither is a source. */
  ['discussions', 'discussion'],
  ['outcomes', 'outcome'],
  /* #213: a native Result. Its statement is a source too, as any facet block. */
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
        res
          .status(200)
          .json(await backlinksOf(db, viewerId, target, options.appOrigin))
      },
    )
  }

  router.get(
    '/facets/:id/connected-work',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const id = parsedId(res, req.params.id)
      if (id === null) return
      const viewerId = viewer(req)
      if ((await resolveReference(db, viewerId, { kind: 'facet', id })) === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(200).json(await connectedWorkOf(db, viewerId, id, options.appOrigin))
    },
  )

  return router
}
