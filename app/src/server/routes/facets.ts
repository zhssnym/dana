/*
The 7.27 surface: Folder facets (issue #210, M1-F), on Hassan's technical
ruling of 2026-09-21,
https://github.com/zhssnym/dana/issues/210#issuecomment-5756722756, section 3.

Handlers validate with the shared schemas, resolve access through the domain
modules, delegate every decision that touches rows, and serialize. Nothing
here decides anything, which is this directory's convention.

## The refusal order, which is the one thing about this file to read first

**404, then 422, then 403, then 409**, on every route that takes an id, and it
is deliberately not the order the rest of this directory happens to use.

- **Existence first** (10.2): a person who is not in the Folder learns nothing
  about it, so the membership resolution runs before the body is looked at and
  answers 404 whatever the body said.
- **Then the body**, because an authority refusal has to be able to name what
  it refused. "You may not create a Work facet here" is a different sentence
  from "you may not create a facet at all", and a 403 raised before the body
  was read cannot tell them apart -- worse, `facet.create` at
  `whenOwnPrivateFacet` depends on *which kind* was asked for, so the gate
  literally cannot be asked until the body is known.
- **Then the preset**, which is `mayPerform`'s and nobody else's.
- **Then state**: the stale `updated_at`, the second Work facet on one H1, the
  native that is hidden rather than deleted. Every one of those is meaningful
  only on a body already valid and an actor already permitted.

So `foundFolder` below resolves membership and hands back the facts, and the
**action gate lives inside the domain functions**, after their own 422s. That
is why this file has no `gate` helper of the shape `routes/folders.ts` has.

## Every route here takes an id, so every route here owes two things

An `accessOf(...)` gate -- there is no authorization chokepoint, whatever 10.2
says -- and a row in `app/tests/criteria/ac-397-authorization-sweep.test.ts`
saying what a stranger gets. Both are in this change; hard stop 5.
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import {
  patchFacetBody,
  postFacetBody,
  putFacetOrderBody,
  putMyFacetOrderBody,
  shareFacetBody,
} from '../../shared/facets.js'
import { documentTransaction } from '../../shared/page-document.js'
import { requireCsrf, requireSession } from '../auth/index.js'
import {
  applyFacetDocument,
  createFacet,
  deleteFacet,
  destroyFacet,
  facetPageGate,
  facetPageView,
  listFacets,
  patchFacet,
  purposeFacetFolderId,
  restoreFacet,
  setFacetOrder,
  setMyFacetOrder,
  shareFacet,
  FacetDocumentRefusal,
} from '../domain/facets.js'
import type { FacetOutcome } from '../domain/facets.js'
import { accessOf } from '../domain/folders.js'
import type { FolderAccess } from '../domain/folders.js'
import { mayPerform } from '../domain/folder-access.js'
import { sendError, sendFieldValidationError } from '../http/errors.js'
import { parseBody } from '../http/parse-body.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { routerWithPreamble } from './preamble.js'

export interface FacetsRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
  securityLog?: SecurityLogger
}

export function createFacetsRouter(options: FacetsRouterOptions = {}): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)
  const securityLog = options.securityLog ?? createSecurityLogger()

  /**
   * Step one of the refusal order and nothing else: the Folder exists, is not
   * trashed, and the caller is a member of it. Anything else is 404, which is
   * 10.2's rule that a refusal must never confirm that a Folder exists.
   *
   * It returns the facts rather than a boolean so that the handler can pass
   * them to the domain function, which asks `mayPerform` in the transaction
   * that writes.
   */
  const foundFolder = async (
    req: Request,
    res: Response,
    folderId: string,
  ): Promise<FolderAccess | null> => {
    const db = database(res)
    if (db === null) return null
    const facts = await accessOf(db, viewer(req), folderId)
    if (facts === null) {
      sendError(res, 404, 'not_found', 'Not found.')
      return null
    }
    return facts
  }

  /**
   * The one place a domain outcome becomes a refusal status. `true` means the
   * response has been written and the handler is done.
   *
   * Split from `answer` below rather than folded into it, because the two page
   * routes do asynchronous work *after* the gate and a callback that returns a
   * promise into a `void` slot is a rejection nobody awaits.
   */
  const refused = <T>(res: Response, outcome: FacetOutcome<T>): boolean => {
    if (outcome.kind === 'not_found') {
      sendError(res, 404, 'not_found', 'Not found.')
      return true
    }
    if (outcome.kind === 'invalid') {
      sendFieldValidationError(res, [
        { field: outcome.field, message: outcome.message },
      ])
      return true
    }
    if (outcome.kind === 'forbidden') {
      // The resolver's own sentence, which is product copy a person reads.
      sendError(res, 403, 'forbidden', outcome.reason)
      return true
    }
    if (outcome.kind === 'conflict') {
      sendError(res, 409, 'conflict', outcome.message)
      return true
    }
    return false
  }

  /** `refused` for the handlers whose success path is synchronous. */
  const answer = <T>(
    res: Response,
    outcome: FacetOutcome<T>,
    onOk: (value: T) => void,
  ): void => {
    if (refused(res, outcome)) return
    onOk((outcome as { kind: 'ok'; value: T }).value)
  }

  /* ---------------------------------------------------------------- *
   * The listing
   * ---------------------------------------------------------------- */

  router.get(
    '/folders/:id/facets',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const facts = await foundFolder(req, res, folderId)
      if (facts === null) return
      /* Any member reads the list (`folder.read`), and the list is already
         scoped: a private facet belonging to somebody else is absent from it,
         by a clause inside the FROM. So this gate is the membership one and
         the privacy one is the query's, which is the shape this codebase
         prefers -- a query that forgets the scope returns nothing rather than
         somebody else's rows. */
      const decision = mayPerform(facts, 'folder.read')
      if (!decision.allowed) {
        sendError(res, 403, 'forbidden', decision.reason)
        return
      }
      res
        .status(200)
        .json({ facets: await listFacets(db, viewer(req), folderId) })
    },
  )

  /* ---------------------------------------------------------------- *
   * Create
   * ---------------------------------------------------------------- */

  router.post(
    '/folders/:id/facets',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const facts = await foundFolder(req, res, folderId)
      if (facts === null) return
      const parsed = parseBody(postFacetBody, req, res, securityLog)
      if (parsed === null) return
      answer(
        res,
        await createFacet(db, facts, {
          kind: parsed.kind,
          h1BlockId: parsed.h1_block_id,
          displayName: parsed.display_name,
          afterFacetId: parsed.after_facet_id,
        }),
        (facet) => {
          res.status(201).json(facet)
        },
      )
    },
  )

  /* ---------------------------------------------------------------- *
   * The two order writes, ahead of `/facets/:facetId`
   * ---------------------------------------------------------------- */

  /*
  **`order` and `my-order` are registered before `:facetId`, and that is
  load-bearing.** Express matches whole paths in registration order, so
  `/folders/:id/facets/:facetId` would claim `/folders/:id/facets/order` --
  `parsedId` would refuse `order` as a uuid and the reorder would answer 404.
  It is the same hazard `index.ts`'s mount block records for `/views/:id`
  against 7.10's six literal pages, one router down.

  Neither route has a `:facetId`, so no other order among these four matters.
  */

  router.put(
    '/folders/:id/facets/order',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const facts = await foundFolder(req, res, folderId)
      if (facts === null) return
      const parsed = parseBody(putFacetOrderBody, req, res, securityLog)
      if (parsed === null) return
      answer(res, await setFacetOrder(db, facts, parsed.order), (facets) => {
        res.status(200).json({ facets })
      })
    },
  )

  router.put(
    '/folders/:id/facets/my-order',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const facts = await foundFolder(req, res, folderId)
      if (facts === null) return
      const parsed = parseBody(putMyFacetOrderBody, req, res, securityLog)
      if (parsed === null) return
      /* `personal.view_preferences`: membership and nothing else. #228's
         personal-actions rule puts a member's own arrangement of rows only
         they can see outside Folder Access entirely, so a Can-view member
         arranges their own private facets exactly as a Full-control one
         does. */
      const decision = mayPerform(facts, 'personal.view_preferences')
      if (!decision.allowed) {
        sendError(res, 403, 'forbidden', decision.reason)
        return
      }
      answer(
        res,
        await setMyFacetOrder(
          db,
          viewer(req),
          folderId,
          parsed.placements.map((placement) => ({
            facetId: placement.facet_id,
            afterFacetId: placement.after_facet_id,
          })),
        ),
        (facets) => {
          res.status(200).json({ facets })
        },
      )
    },
  )

  /* ---------------------------------------------------------------- *
   * The facet document, ahead of `/facets/:facetId` for the same reason
   * ---------------------------------------------------------------- */

  router.get(
    '/folders/:id/facets/:facetId/page',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const facetId = parsedId(res, req.params.facetId)
      if (facetId === null) return
      const facts = await foundFolder(req, res, folderId)
      if (facts === null) return
      const gated = await facetPageGate(db, facts, facetId)
      if (refused(res, gated)) return
      res.status(200).json(await facetPageView(db, facetId))
    },
  )

  router.post(
    '/folders/:id/facets/:facetId/page/actions',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const facetId = parsedId(res, req.params.facetId)
      if (facetId === null) return
      const facts = await foundFolder(req, res, folderId)
      if (facts === null) return
      /* **`documentTransaction` alone, not `pageActionBody`.** 7.16's other
         six actions -- `insert_block`, `update_block`, `delete_block`,
         `insert_task`, `move_item`, `convert_paragraph_to_task` -- are the
         pre-canvas vocabulary and three of them are about Tasks, which a
         facet has none of. A facet document is written by the canvas or not
         at all. */
      const parsed = parseBody(documentTransaction, req, res, securityLog)
      if (parsed === null) return
      /* **No gate call here, and its absence is the fix rather than an
         omission.** `applyFacetDocument` resolves the facet and asks
         `mayPerform` inside its own transaction, under the row lock that
         transaction holds until it commits. Gating out here would open a
         second transaction, take a lock and release it before the write
         started -- which is what 16ce81b did, and what the adversarial review
         of it found: a conversion landing in that window was authorized by a
         row the write never saw. The refusals leave through
         `FacetDocumentRefusal` so that one door carries all four. */
      try {
        res.status(200).json(await applyFacetDocument(db, facts, facetId, parsed))
      } catch (error) {
        if (!(error instanceof FacetDocumentRefusal)) throw error
        if (error.outcome === 'not_found') {
          sendError(res, 404, 'not_found', 'Not found.')
          return
        }
        if (error.outcome === 'forbidden') {
          // The resolver's own sentence, as every other refusal on this
          // surface carries it.
          sendError(res, 403, 'forbidden', error.message)
          return
        }
        if (error.outcome === 'invalid') {
          sendFieldValidationError(res, [
            { field: error.field ?? 'operations', message: error.message },
          ])
          return
        }
        // 7.16's own 409 for a lost last-write-wins race, word for word.
        sendError(res, 409, 'conflict', error.message)
      }
    },
  )

  /* ---------------------------------------------------------------- *
   * Share, ahead of `/facets/:facetId` for the same reason
   * ---------------------------------------------------------------- */

  router.post(
    '/folders/:id/facets/:facetId/share',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const facetId = parsedId(res, req.params.facetId)
      if (facetId === null) return
      const facts = await foundFolder(req, res, folderId)
      if (facts === null) return
      const parsed = parseBody(shareFacetBody, req, res, securityLog)
      if (parsed === null) return
      answer(res, await shareFacet(db, facts, facetId), (facet) => {
        res.status(200).json(facet)
      })
    },
  )

  /* ---------------------------------------------------------------- *
   * One facet
   * ---------------------------------------------------------------- */

  router.patch(
    '/folders/:id/facets/:facetId',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const facetId = parsedId(res, req.params.facetId)
      if (facetId === null) return
      const facts = await foundFolder(req, res, folderId)
      if (facts === null) return
      const parsed = parseBody(patchFacetBody, req, res, securityLog)
      if (parsed === null) return
      answer(
        res,
        await patchFacet(db, facts, facetId, {
          displayName: parsed.display_name,
          hidden: parsed.hidden,
          updatedAt: parsed.updated_at,
        }),
        (facet) => {
          res.status(200).json(facet)
        },
      )
    },
  )

  router.delete(
    '/folders/:id/facets/:facetId',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const facetId = parsedId(res, req.params.facetId)
      if (facetId === null) return
      const facts = await foundFolder(req, res, folderId)
      if (facts === null) return
      answer(res, await deleteFacet(db, facts, facetId), () => {
        res.status(204).end()
      })
    },
  )

  /* ---------------------------------------------------------------- *
   * Stable Purpose navigation
   * ---------------------------------------------------------------- */

  /**
   * The canonical Dana Link is /app/facets/:id, but the actual Purpose
   * workspace is a facet of its Folder. Return only that routing fact.
   *
   * The first read identifies a live native Purpose and nothing else. The
   * second is the explicit Folder membership gate required of every
   * id-bearing route: an inaccessible Purpose and a missing one therefore
   * leave through the identical 404, and hiding the Purpose is irrelevant.
   */
  router.get(
    '/facets/:id/location',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const facetId = parsedId(res, req.params.id)
      if (facetId === null) return
      const folderId = await purposeFacetFolderId(db, facetId)
      if (
        folderId === null ||
        (await accessOf(db, viewer(req), folderId)) === null
      ) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(200).json({ folder_id: folderId })
    },
  )

  /* ---------------------------------------------------------------- *
   * Trash (7.13)
   * ---------------------------------------------------------------- */

  /*
  These two are keyed on the facet alone rather than on the Folder, which is
  7.13's shape: `POST /facets/:id/restore` mirrors `POST /folders/:id/restore`
  and `DELETE /trash/facets/:id` mirrors `DELETE /trash/tasks/:id`. A trashed
  row's Folder is reached through the row, because 7.13's access is by
  membership at read time and never by who deleted.

  They live in this router rather than in `routes/trash.ts` because everything
  they call is in `domain/facets.ts`, and neither path meets anything the trash
  router claims: `/trash/tasks/:id` and `/trash/folders/:id` differ from
  `/trash/facets/:id` in a literal segment.
  */

  router.post(
    '/facets/:id/restore',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const facetId = parsedId(res, req.params.id)
      if (facetId === null) return
      answer(res, await restoreFacet(db, viewer(req), facetId), (facet) => {
        res.status(200).json(facet)
      })
    },
  )

  router.delete(
    '/trash/facets/:id',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const facetId = parsedId(res, req.params.id)
      if (facetId === null) return
      answer(res, await destroyFacet(db, viewer(req), facetId), () => {
        res.status(204).end()
      })
    },
  )

  return router
}
