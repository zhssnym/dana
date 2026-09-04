/*
The 7.14 surface (RFC 0005): the thread on a folder or a task, member-only
throughout, one reply level enforced, likes as one idempotent bit.

Status grammar (7.0, 10.2, DES-225): a folder or comment out of the
viewer's membership 404, never 403; a member touching another author's
words 403, the thread being visible to them; a reply below the one level, a
parent or task or file outside the thread's folder, all 422 naming the
field. Since issue #22 a comment carries up to 10.3's ten files, named by
`file_ids` in the order they are to be attached; eleven, a repeated id, and
`file_ids` sent beside `file_id` are all refused by the shared schema before
this router reads anything.

Since issue #94 the edit takes `file_ids` too, meaning the full new set:
omitted leaves the attachments alone, `[]` removes them, anything else makes
the set exactly those ids. The gate is the one the words already had — the
author, and nobody widened — and the answer carries the fresh comment beside
the `edited` flag it always carried, because the resolved file rows are
something the caller cannot compute from what it sent.
*/
import type { Request, Response, Router } from 'express'
import { z } from 'zod'

import type { DbClient } from '../../../db/client.js'
import { patchCommentBody, postCommentBody } from '../../shared/comments.js'
import { requireCsrf, requireSession } from '../auth/index.js'
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
import { routerWithPreamble } from './preamble.js'

export interface ConversationRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
}

const threadQuery = z.object({ task: z.uuid().optional() })

export function createConversationRouter(
  options: ConversationRouterOptions = {},
): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)

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
          // The message names the field the caller actually sent: 7.14 takes
          // `file_id` for one file and `file_ids` for up to 10.3's ten, and a
          // 422 that names the other one is a 422 nobody can act on.
          sendError(
            res,
            422,
            'validation_failed',
            parsed.data.file_ids === undefined
              ? 'file_id: must name a file stored in this folder.'
              : 'file_ids: every id must name a file stored in this folder.',
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
      /* Issue #94: one gate covers the words and the attachments. A person
         who may edit their own comment may change what it carries, and
         nobody else gains anything here. */
      const outcome = await editComment(db, viewer(req), access, parsed.data)
      switch (outcome.kind) {
        case 'file_not_here':
          // Names the field and nothing about the other side of the
          // membership: an id outside this folder and an id that does not
          // exist read identically (10.2, DES-225).
          sendError(
            res,
            422,
            'validation_failed',
            'file_ids: every id must name a file stored in this folder.',
          )
          return
        case 'nothing_left':
          sendError(
            res,
            422,
            'validation_failed',
            'file_ids: a comment carries words or a file, at least one; removing every attachment would leave neither.',
          )
          return
        case 'gone':
          sendError(res, 404, 'not_found', 'Not found.')
          return
        case 'edited':
          res.status(200).json({ edited: true, comment: outcome.comment })
          return
      }
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
