/*
The 7.14 surface (RFC 0005): the thread on a folder or a task, member-only
throughout, one reply level enforced, likes as one idempotent bit.

Status grammar (7.0, 10.2, DES-225): a folder or comment out of the
viewer's membership 404, never 403; a member touching another author's
words 403, the thread being visible to them; a reply below the one level, a
parent or task or file outside the thread's folder, all 422 naming the
field.
*/
import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'

import type { Db, DbClient } from '../../../db/client.js'
import { patchCommentBody, postCommentBody } from '../../shared/comments.js'
import {
  attachSession,
  requireCsrf,
  requireSession,
  sessionOf,
} from '../auth/index.js'
import {
  accessibleComment,
  createComment,
  deleteComment,
  editComment,
  likeComment,
  threadView,
  unlikeComment,
} from '../domain/comments.js'
import { accessOf } from '../domain/folders.js'
import { sendError, sendValidationError } from '../http/errors.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'

export interface ConversationRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
}

const uuidParam = z.uuid()
const threadQuery = z.object({ task: z.uuid().optional() })

export function createConversationRouter(
  options: ConversationRouterOptions = {},
): Router {
  const router = Router()
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)

  const database = (res: Response): Db | null => {
    if (options.dbClient === undefined) {
      sendError(
        res,
        500,
        'internal_error',
        'The application was constructed without a database.',
      )
      return null
    }
    return options.dbClient.db
  }

  if (options.dbClient !== undefined) {
    const attach = attachSession(options.dbClient.db)
    router.use((req: Request, res: Response, next: NextFunction) => {
      if (sessionOf(req) !== undefined) {
        next()
        return
      }
      attach(req, res, next)
    })
  }

  const viewer = (req: Request): string => sessionOf(req)?.userId ?? ''

  const parsedId = (res: Response, raw: unknown): string | null => {
    const parsed = uuidParam.safeParse(raw)
    if (!parsed.success) {
      sendError(res, 404, 'not_found', 'Not found.')
      return null
    }
    return parsed.data
  }

  router.get(
    '/folders/:id/comments',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const query = threadQuery.safeParse(req.query)
      if (!query.success) {
        sendValidationError(res, query.error)
        return
      }
      if ((await accessOf(db, viewer(req), folderId)) === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res
        .status(200)
        .json(
          await threadView(db, viewer(req), folderId, query.data.task ?? null),
        )
    },
  )

  router.post(
    '/folders/:id/comments',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const query = threadQuery.safeParse(req.query)
      if (!query.success) {
        sendValidationError(res, query.error)
        return
      }
      const parsed = postCommentBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      if ((await accessOf(db, viewer(req), folderId)) === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const outcome = await createComment(
        db,
        viewer(req),
        folderId,
        query.data.task ?? null,
        parsed.data,
      )
      switch (outcome.kind) {
        case 'task_not_here':
          sendError(
            res,
            422,
            'validation_failed',
            'task: must name a task of this folder.',
          )
          return
        case 'parent_not_here':
          sendError(
            res,
            422,
            'validation_failed',
            'parent_id: must name a comment of this thread.',
          )
          return
        case 'too_deep':
          sendError(
            res,
            422,
            'validation_failed',
            'parent_id: threads hold one level of replies.',
          )
          return
        case 'file_not_here':
          sendError(
            res,
            422,
            'validation_failed',
            'file_id: must name a file stored in this folder.',
          )
          return
        case 'created':
          res.status(201).json(outcome.comment)
          return
      }
    },
  )

  router.patch(
    '/comments/:id',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const commentId = parsedId(res, req.params.id)
      if (commentId === null) return
      const parsed = patchCommentBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const access = await accessibleComment(db, viewer(req), commentId)
      if (access === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      if (!access.isAuthor) {
        sendError(
          res,
          403,
          'forbidden',
          'Only the author can edit their comment.',
        )
        return
      }
      await editComment(db, viewer(req), access, parsed.data.body)
      res.status(200).json({ edited: true })
    },
  )

  router.delete(
    '/comments/:id',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const commentId = parsedId(res, req.params.id)
      if (commentId === null) return
      const access = await accessibleComment(db, viewer(req), commentId)
      if (access === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      if (!access.isAuthor && !access.isFolderOwner) {
        sendError(
          res,
          403,
          'forbidden',
          'Only the author or the folder owner can remove a comment.',
        )
        return
      }
      await deleteComment(db, viewer(req), access)
      res.status(204).end()
    },
  )

  router.put(
    '/comments/:id/like',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const commentId = parsedId(res, req.params.id)
      if (commentId === null) return
      if ((await accessibleComment(db, viewer(req), commentId)) === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      await likeComment(db, viewer(req), commentId)
      res.status(204).end()
    },
  )

  router.delete(
    '/comments/:id/like',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const commentId = parsedId(res, req.params.id)
      if (commentId === null) return
      if ((await accessibleComment(db, viewer(req), commentId)) === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      await unlikeComment(db, viewer(req), commentId)
      res.status(204).end()
    },
  )

  return router
}
