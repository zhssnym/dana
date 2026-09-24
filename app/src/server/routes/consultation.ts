/*
The 7.28 surface: a Folder's Consultation (issue #320) -- Discussions, their
Outcomes, and the Discussion's Trash pair.

Handlers validate with `shared/consultation.ts`, resolve existence, and hand
every decision that touches rows to `domain/consultation.ts`, which asks
`mayPerform` under the Discussion's row lock in the transaction that writes.

## The refusal order: 404, then 422, then 403, then 409

The facet surface's order (`routes/facets.ts` says why at length). Existence
first: a Discussion id is resolved to its Folder and the caller's membership
before the body is read, so a stranger learns nothing whatever they send.

Comments inside a Discussion are not here (the conversation routes own them),
and nor are Dana Link kinds (`routes/references.ts`).

## Every route here takes an id

So each one owes an `accessOf` gate and a row in
`app/tests/criteria/ac-397-authorization-sweep.test.ts`.
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import {
  createDiscussionBody,
  discussionListQuery,
  reopenDiscussionBody,
  resolveDiscussionBody,
  updateDiscussionBody,
} from '../../shared/consultation.js'
import { requireCsrf, requireSession } from '../auth/index.js'
import {
  createDiscussion,
  folderOfDiscussion,
  listDiscussions,
  listOutcomes,
  purgeDiscussion,
  readDiscussion,
  readOutcome,
  reopenDiscussion,
  resolveDiscussion,
  restoreDiscussion,
  trashDiscussion,
  updateDiscussion,
} from '../domain/consultation.js'
import type { ConsultationOutcome } from '../domain/consultation.js'
import { accessOf } from '../domain/folders.js'
import { removeObjects } from '../domain/trash.js'
import type { ObjectStore } from '../files/store.js'
import {
  sendError,
  sendFieldValidationError,
  sendValidationError,
} from '../http/errors.js'
import { parseBody } from '../http/parse-body.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { routerWithPreamble } from './preamble.js'

export interface ConsultationRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
  securityLog?: SecurityLogger
  /** The store the permanent delete removes comment uploads from, after its
   * transaction commits. */
  fileStore?: ObjectStore
}

export function createConsultationRouter(
  options: ConsultationRouterOptions = {},
): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)
  const securityLog = options.securityLog ?? createSecurityLogger()

  const notFound = (res: Response): void => {
    sendError(res, 404, 'not_found', 'Not found.')
  }

  /** `true` when the outcome was a refusal and has been answered. */
  const refused = <T>(res: Response, outcome: ConsultationOutcome<T>): boolean => {
    if (outcome.kind === 'not_found') {
      notFound(res)
      return true
    }
    if (outcome.kind === 'invalid') {
      sendFieldValidationError(res, [
        { field: outcome.field, message: outcome.message },
      ])
      return true
    }
    if (outcome.kind === 'forbidden') {
      sendError(res, 403, 'forbidden', outcome.reason)
      return true
    }
    if (outcome.kind === 'conflict') {
      sendError(res, 409, 'conflict', outcome.message)
      return true
    }
    return false
  }

  const answer = <T>(
    res: Response,
    status: number,
    outcome: ConsultationOutcome<T>,
  ): void => {
    if (refused(res, outcome)) return
    res.status(status).json((outcome as { kind: 'ok'; value: T }).value)
  }

  /**
   * Step one for `/discussions/:id`: the Discussion exists and the caller is a
   * member of its live Folder, else 404 -- before any body is read. The
   * domain re-resolves both under the row lock; this is only the existence
   * half of the refusal order.
   */
  const visibleDiscussion = async (
    req: Request,
    res: Response,
  ): Promise<string | null> => {
    const db = database(res)
    if (db === null) return null
    const discussionId = parsedId(res, req.params.id)
    if (discussionId === null) return null
    const folderId = await folderOfDiscussion(db, discussionId)
    if (folderId === null || (await accessOf(db, viewer(req), folderId)) === null) {
      notFound(res)
      return null
    }
    return discussionId
  }

  /* ---------------------------------------------------------------- *
   * A Folder's Discussions
   * ---------------------------------------------------------------- */

  router.get(
    '/folders/:id/discussions',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const facts = await accessOf(db, viewer(req), folderId)
      if (facts === null) {
        notFound(res)
        return
      }
      const query = discussionListQuery.safeParse(req.query)
      if (!query.success) {
        sendValidationError(res, query.error)
        return
      }
      answer(res, 200, await listDiscussions(db, facts, query.data))
    },
  )

  router.post(
    '/folders/:id/discussions',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      if ((await accessOf(db, viewer(req), folderId)) === null) {
        notFound(res)
        return
      }
      const parsed = parseBody(createDiscussionBody, req, res, securityLog)
      if (parsed === null) return
      answer(res, 201, await createDiscussion(db, viewer(req), folderId, parsed))
    },
  )

  /* ---------------------------------------------------------------- *
   * One Discussion
   * ---------------------------------------------------------------- */

  router.get(
    '/discussions/:id',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const discussionId = parsedId(res, req.params.id)
      if (discussionId === null) return
      answer(res, 200, await readDiscussion(db, viewer(req), discussionId))
    },
  )

  router.patch(
    '/discussions/:id',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const discussionId = await visibleDiscussion(req, res)
      if (discussionId === null) return
      const parsed = parseBody(updateDiscussionBody, req, res, securityLog)
      if (parsed === null) return
      answer(
        res,
        200,
        await updateDiscussion(db, viewer(req), discussionId, parsed),
      )
    },
  )

  router.delete(
    '/discussions/:id',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const discussionId = parsedId(res, req.params.id)
      if (discussionId === null) return
      const outcome = await trashDiscussion(db, viewer(req), discussionId)
      if (refused(res, outcome)) return
      res.status(204).end()
    },
  )

  router.post(
    '/discussions/:id/resolve',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const discussionId = await visibleDiscussion(req, res)
      if (discussionId === null) return
      const parsed = parseBody(resolveDiscussionBody, req, res, securityLog)
      if (parsed === null) return
      answer(
        res,
        200,
        await resolveDiscussion(db, viewer(req), discussionId, parsed),
      )
    },
  )

  router.post(
    '/discussions/:id/reopen',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const discussionId = await visibleDiscussion(req, res)
      if (discussionId === null) return
      const parsed = parseBody(reopenDiscussionBody, req, res, securityLog)
      if (parsed === null) return
      answer(res, 200, await reopenDiscussion(db, viewer(req), discussionId))
    },
  )

  router.get(
    '/discussions/:id/outcomes',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const discussionId = parsedId(res, req.params.id)
      if (discussionId === null) return
      answer(res, 200, await listOutcomes(db, viewer(req), discussionId))
    },
  )

  /** An Outcome's stable direct route (#320): it and its parent Discussion. */
  router.get(
    '/outcomes/:id',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const outcomeId = parsedId(res, req.params.id)
      if (outcomeId === null) return
      answer(res, 200, await readOutcome(db, viewer(req), outcomeId))
    },
  )

  /* ---------------------------------------------------------------- *
   * Trash (7.13): 7.13's shape, as the facet pair is
   * ---------------------------------------------------------------- */

  router.post(
    '/discussions/:id/restore',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const discussionId = parsedId(res, req.params.id)
      if (discussionId === null) return
      answer(res, 200, await restoreDiscussion(db, viewer(req), discussionId))
    },
  )

  router.delete(
    '/trash/discussions/:id',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const discussionId = parsedId(res, req.params.id)
      if (discussionId === null) return
      const outcome = await purgeDiscussion(db, viewer(req), discussionId)
      if (refused(res, outcome)) return
      // After the commit, 7.15's order.
      await removeObjects(
        options.fileStore,
        (outcome as { kind: 'ok'; value: { fileIds: string[] } }).value.fileIds,
      )
      res.status(204).end()
    },
  )

  return router
}
