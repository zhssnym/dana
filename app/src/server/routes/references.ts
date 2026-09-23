/*
Dana Link references (issue #223, M1-C1). Two reads, no writes, no table.

    GET /api/v1/references/:kind/:id   one target, as a chip summary
    GET /api/v1/references/search      the picker's list, as it is typed

**Why the resolve endpoint takes a kind and an id rather than a URL.** The
grammar of a Dana Link is `src/shared/references.ts` and both sides import it,
so the client parses what was pasted and asks for the target it found; a URL
on the query string would put a second parser on this side of the wire and
give the two a way to disagree. What the issue requires of the paste path is
that it resolve "through the same authorization path as search", and it does:
both handlers below call `domain/references.ts`, which calls the same three
gates an ordinary read of each kind calls.

**Status grammar, and every line of it is the point of the feature.** A kind
outside the closed set, an id that is not a uuid, a target that is not there
and a target the viewer may not have all answer the same bare 404 — never 403,
which would confirm the row, and never a body carrying anything the caller did
not already send. That is 7.0's taxonomy and 10.2's rule, and it is what makes
an inaccessible target indistinguishable from a nonexistent one. A malformed
`q` is the ordinary 422 naming the field, because the query is the caller's
own and says nothing about anybody's data.

**Neither route is a grant.** Nothing here writes: no membership, no event, no
dependency, no reference row. AC-428's last clause is that no number of
either operation creates a membership, an Authority, an event or a
dependency.

`GET /references/search` carries 10.4's search limiter, the bucket
`GET /search` already uses, because it is the same act at the same cost and a
picker that types is the one caller able to make a lot of it.
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import { referenceKind, referenceSearchQuery } from '../../shared/references.js'
import { requireSession } from '../auth/index.js'
import { accessOf } from '../domain/folders.js'
import { resolveReference, searchReferences } from '../domain/references.js'
import { sendError, sendValidationError } from '../http/errors.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
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

  /* The literal path first. It is one segment after `/references` and the
     resolver below is two, so Express separates them on arity and this order
     is preference rather than necessity; it is written this way so that a
     later `/references/:something` cannot quietly acquire it. */
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

      /* **The gate AC-397 cannot see.** This folder id arrives on the query
         string, and that sweep is path-only, so nothing structural would
         notice if this block were deleted. Without it the context scope
         below would read a folder the viewer is not a member of — the join
         would still return no rows, so nothing would leak, but the caller
         would learn the difference between a folder with no matches and one
         they cannot see by nothing at all. 404 on both, as `GET /events`
         does with the same parameter for the same reason. */
      if (
        folder !== undefined &&
        (await accessOf(db, viewerId, folder)) === null
      ) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }

      res.status(200).json({
        results: await searchReferences(db, viewerId, {
          q,
          ...(folder === undefined ? {} : { folderId: folder }),
        }),
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
        // An unsupported kind is an unsupported URL, and an unsupported URL
        // names nothing: 404 with no hint, exactly as a well-formed link to
        // somebody else's row answers.
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

  return router
}
