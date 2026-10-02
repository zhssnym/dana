/*
The 7.28 surface: a Folder's Consultation (issue #320) -- Discussions, their
Outcomes, Trash lifecycle, and issue #497's explicit Discussion ↔ Task links.

Every id-bearing Discussion mutation resolves the Discussion's Folder and
membership before reading its body. Domain functions re-resolve authority
under the row lock. The refusal order remains 404, 422, 403, 409.
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import {
  createDiscussionBody,
  discussionListQuery,
  linkDiscussionTaskBody,
  reopenDiscussionBody,
  resolveDiscussionBody,
  updateDiscussionBody,
} from '../../shared/consultation.js'
import { requireCsrf, requireSession } from '../auth/index.js'
import {
  createDiscussion,
  discussTask,
  folderOfDiscussion,
  folderOfTask,
  linkDiscussionTask,
  listDiscussions,
  listOutcomes,
  markDiscussionRead,
  purgeDiscussion,
  readDiscussion,
  readOutcome,
  reopenDiscussion,
  resolveDiscussion,
  restoreDiscussion,
  trashDiscussion,
  unlinkDiscussionTask,
  updateDiscussion,
} from '../domain/consultation.js'
import type { ConsultationOutcome } from '../domain/consultation.js'
import { accessOf, projectOf } from '../domain/folder-access.js'
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
import { retiredRoute } from '../observability/retired-route.js'
import { routerWithPreamble } from './preamble.js'

export interface ConsultationRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
  securityLog?: SecurityLogger
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

  /** Discussion existence/membership gate before a mutation body or a second
   * endpoint id is interpreted. The domain repeats the authority decision in
   * the transaction that writes. */
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
      const actorId = viewer(req)
      const facts = await accessOf(db, actorId, folderId)
      if (facts === null) {
        notFound(res)
        return
      }
      const projectId = await projectOf(db, folderId)
      const projectFacts = projectId === null ? null : await accessOf(db, actorId, projectId)
      if (projectFacts?.isDefault === true) {
        sendError(res, 409, 'conflict', 'Desk does not have Discussion.')
        return
      }
      const parsed = parseBody(createDiscussionBody, req, res, securityLog)
      if (parsed === null) return
      answer(res, 201, await createDiscussion(db, actorId, folderId, parsed))
    },
  )

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

  /** Issue #497 canonical add-link operation. Duplicate pairs are idempotent:
   * 201 when this call made the edge, 200 when it was already present. */
  router.post(
    '/discussions/:id/tasks',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const discussionId = await visibleDiscussion(req, res)
      if (discussionId === null) return
      const parsed = parseBody(linkDiscussionTaskBody, req, res, securityLog)
      if (parsed === null) return
      const outcome = await linkDiscussionTask(
        db,
        viewer(req),
        discussionId,
        parsed.task_id,
      )
      if (refused(res, outcome)) return
      const value = (
        outcome as {
          kind: 'ok'
          value: { created: boolean; discussion: unknown }
        }
      ).value
      res.status(value.created ? 201 : 200).json(value)
    },
  )

  /** Issue #497 canonical unlink. It is deliberately idempotent and carries
   * no body, so an authorized Discussion editor can remove a durable edge
   * after the Task moved or entered Trash without probing the Task. */
  router.delete(
    '/discussions/:id/tasks/:taskId',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const discussionId = await visibleDiscussion(req, res)
      if (discussionId === null) return
      const taskId = parsedId(res, req.params.taskId)
      if (taskId === null) return
      const outcome = await unlinkDiscussionTask(
        db,
        viewer(req),
        discussionId,
        taskId,
      )
      if (refused(res, outcome)) return
      res.status(204).end()
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

  router.put(
    '/discussions/:id/read',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const discussionId = await visibleDiscussion(req, res)
      if (discussionId === null) return
      const outcome = await markDiscussionRead(db, viewer(req), discussionId)
      if (refused(res, outcome)) return
      res.status(204).end()
    },
  )

  /** Current task UI compatibility: create/reuse the Discussion this route
   * made in the Task's current Folder. It no longer means a Task can have only
   * one linked Discussion. */
  router.post(
    '/tasks/:id/discussion',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const taskId = parsedId(res, req.params.id)
      if (taskId === null) return
      const folderId = await folderOfTask(db, taskId)
      if (folderId === null) {
        notFound(res)
        return
      }
      const actorId = viewer(req)
      const facts = await accessOf(db, actorId, folderId)
      if (facts === null) {
        notFound(res)
        return
      }
      const projectId = await projectOf(db, folderId)
      const projectFacts = projectId === null ? null : await accessOf(db, actorId, projectId)
      if (projectFacts?.isDefault === true) {
        sendError(res, 409, 'conflict', 'Desk does not have Discussion.')
        return
      }
      const outcome = await discussTask(db, actorId, taskId)
      if (refused(res, outcome)) return
      const { created, discussion, discussionTabId } = (
        outcome as { kind: 'ok'; value: { created: boolean; discussion: unknown; discussionTabId: string | null } }
      ).value
      res.status(created ? 201 : 200).json({ discussion, discussion_tab_id: discussionTabId })
    },
  )

  router.get(
    '/discussions/:id/outcomes',
    requireSession,
    retiredRoute(securityLog, 'get_discussion_outcomes'),
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const discussionId = parsedId(res, req.params.id)
      if (discussionId === null) return
      answer(res, 200, await listOutcomes(db, viewer(req), discussionId))
    },
  )

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
      await removeObjects(
        options.fileStore,
        (outcome as { kind: 'ok'; value: { fileIds: string[] } }).value.fileIds,
      )
      res.status(204).end()
    },
  )

  return router
}