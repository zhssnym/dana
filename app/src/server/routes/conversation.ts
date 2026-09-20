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
import { mayPerform } from '../domain/folder-access.js'
import { sendError, sendValidationError } from '../http/errors.js'
import { parseBody } from '../http/parse-body.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { routerWithPreamble } from './preamble.js'

export interface ConversationRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
  securityLog?: SecurityLogger
}

const threadQuery = z.object({ task: z.uuid().optional() })

export function createConversationRouter(
  options: ConversationRouterOptions = {},
): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)
  const securityLog = options.securityLog ?? createSecurityLogger()

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
      const parsed = parseBody(postCommentBody, req, res, securityLog)
      if (parsed === null) return
      const facts = await accessOf(db, viewer(req), folderId)
      if (facts === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      /* Accepted R8A: Consultation is participation, and Can comment is the
         preset that names it. Can view reads the thread and does not write to
         it, which is the whole of the distinction between the two lowest
         rungs of R8A's ladder.

         The attachments a comment carries ride the same gate --
         `file.upload.comment` has the same bar -- so there is nothing to ask
         twice. */
      const allowed = mayPerform(facts, 'comment.create')
      if (!allowed.allowed) {
        sendError(res, 403, 'forbidden', allowed.reason)
        return
      }
      const outcome = await createComment(
        db,
        viewer(req),
        folderId,
        query.data.task ?? null,
        parsed,
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
            parsed.file_ids === undefined
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
      const parsed = parseBody(patchCommentBody, req, res, securityLog)
      if (parsed === null) return
      const access = await accessibleComment(db, viewer(req), commentId)
      if (access === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      /*
      **Authorship is provenance, not standing authority** (issue #228, and
      #209's accepted cross-cutting rule).

      Before this change the gate was `access.isAuthor` alone, which meant a
      member later reduced to Can view kept the power to rewrite every comment
      they had ever left. `comment.mutate.own` is both conditions in one
      answer: the actor is the author *and* currently holds Can comment or
      better. Losing standing loses the edit; it does not lose the words,
      which stay readable exactly as they were.
      */
      const allowed = mayPerform(access.facts, 'comment.mutate.own', {
        authorId: access.authorId,
      })
      if (!allowed.allowed) {
        sendError(res, 403, 'forbidden', allowed.reason)
        return
      }
      /* Issue #94: one gate covers the words and the attachments. A person
         who may edit their own comment may change what it carries, and
         nobody else gains anything here. */
      const outcome = await editComment(db, viewer(req), access, parsed)
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
      /*
      Two ways to be allowed, and neither is the old one.

      The rule was "author or folder owner". Both halves move: the author
      needs current Can comment standing, for the authorship reason above; and
      removing somebody *else's* comment is moderation, which #228's
      Full-control list gives to Full control rather than to custody. An
      owner who lowered their own Access to Can view no longer moderates, and a Full-control member
      who never owned anything now does.
      */
      const own = mayPerform(access.facts, 'comment.mutate.own', {
        authorId: access.authorId,
      })
      const moderating = mayPerform(access.facts, 'comment.moderate')
      if (!own.allowed && !moderating.allowed) {
        sendError(
          res,
          403,
          'forbidden',
          access.isAuthor
            ? own.reason
            : 'Only Full control can remove another member\'s comment.',
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
      const liked = await accessibleComment(db, viewer(req), commentId)
      if (liked === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      // #228's Can-comment list puts liking with commenting: Can view reads
      // the thread and leaves no mark on it.
      const mayLike = mayPerform(liked.facts, 'comment.like')
      if (!mayLike.allowed) {
        sendError(res, 403, 'forbidden', mayLike.reason)
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
      const unliked = await accessibleComment(db, viewer(req), commentId)
      if (unliked === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const mayUnlike = mayPerform(unliked.facts, 'comment.like')
      if (!mayUnlike.allowed) {
        sendError(res, 403, 'forbidden', mayUnlike.reason)
        return
      }
      await unlikeComment(db, viewer(req), commentId)
      res.status(204).end()
    },
  )

  return router
}
