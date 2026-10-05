/*
The 7.14 thread routes: Folder and Discussion conversations, one reply level,
reactions from a fixed set. Outside the viewer's membership is 404, never 403.
`/folders/:id/comments` is the Folder's General discussion. `?task=` is answered
410 `task_thread_moved` (a task's conversation is its Discussion now), so a
stale client is told instead of posting to the wrong thread. A resolved or
trashed Discussion refuses writes with 409 `discussion_frozen`.
*/
import type { Request, Response, Router } from 'express'
import { z } from 'zod'

import type { DbClient } from '../../../db/client.js'
import {
  DISCUSSION_FROZEN,
  patchCommentBody,
  postCommentBody,
  reactionKey,
} from '../../shared/comments.js'
import type { ReactionKey } from '../../shared/comments.js'
import { requireCsrf, requireSession } from '../auth/index.js'
import {
  accessibleComment,
  addReaction,
  createComment,
  deleteComment,
  discussionScope,
  editComment,
  removeReaction,
  threadView,
} from '../domain/comments.js'
import type { CommentThread, CreateCommentResult } from '../domain/comments.js'
import { accessOf, mayPerform } from '../domain/folder-access.js'
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

/* `task` is read only to refuse it. */
const threadQuery = z.object({ task: z.string().optional() })

const FOLDER_THREAD: CommentThread = { kind: 'folder' }

/** `true` when `?task=` was sent and has been answered 410. */
function sentTaskThread(res: Response, task: string | undefined): boolean {
  if (task === undefined) return false
  sendError(
    res,
    410,
    'task_thread_moved',
    "A task's conversation is its discussion now: POST /api/v1/tasks/:id/discussion.",
  )
  return true
}

const FROZEN_MESSAGE =
  'This discussion is resolved or in Trash, so its conversation takes no changes. Reopen or restore it first.'

const reactionParam = z.object({ reaction: reactionKey })

function sendFrozen(res: Response): void {
  sendError(res, 409, DISCUSSION_FROZEN, FROZEN_MESSAGE)
}

/** Shared so both thread routes answer the same mistakes the same way. */
function sendCreateOutcome(
  res: Response,
  outcome: CreateCommentResult,
  sentFileIds: boolean,
): void {
  switch (outcome.kind) {
    case 'discussion_not_here':
      // Purged between the read and the write.
      sendError(res, 404, 'not_found', 'Not found.')
      return
    case 'frozen':
      sendFrozen(res)
      return
    case 'parent_not_here':
      sendError(
        res,
        422,
        'validation_failed',
        'parent_id: must name a comment of this thread.',
      )
      return
    case 'file_not_here':
      // Name the field the caller actually sent.
      sendError(
        res,
        422,
        'validation_failed',
        sentFileIds
          ? 'file_ids: every id must name a file stored in this folder.'
          : 'file_id: must name a file stored in this folder.',
      )
      return
    case 'content_file_not_attached':
      sendContentFileNotAttached(res)
      return
    case 'empty':
      sendEmptyPost(res)
      return
    case 'mention_unknown':
      sendMentionUnknown(res)
      return
    case 'created':
      res.status(201).json(outcome.comment)
      return
  }
}

/* Answered the same for members and strangers, so it reveals nobody. */
function sendMentionUnknown(res: Response): void {
  sendError(res, 422, 'validation_failed', 'content: mentions a person who does not exist.')
}

/* A media block must name one of the comment's own file_ids. */
function sendContentFileNotAttached(res: Response): void {
  sendError(
    res,
    422,
    'validation_failed',
    "content: every picture or file in a post must be one of the comment's own file_ids.",
  )
}

function sendEmptyPost(res: Response): void {
  sendError(
    res,
    422,
    'validation_failed',
    'content: a comment carries words or a file, at least one.',
  )
}

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
      if (sentTaskThread(res, query.data.task)) return
      res
        .status(200)
        .json(await threadView(db, folderId, FOLDER_THREAD))
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
      if (sentTaskThread(res, query.data.task)) return
      /* Can comment writes; Can view only reads. Attachments share the bar
         (`file.upload.comment`). */
      const allowed = mayPerform(facts, 'comment.create')
      if (!allowed.allowed) {
        sendError(res, 403, 'forbidden', allowed.reason)
        return
      }
      const outcome = await createComment(
        db,
        viewer(req),
        folderId,
        FOLDER_THREAD,
        parsed,
      )
      sendCreateOutcome(res, outcome, parsed.file_ids !== undefined)
    },
  )

  /*
  The Discussion resolves to its Folder and the Folder's access decides, so a
  missing Discussion and one elsewhere are the same 404. A trashed Discussion
  still reads but takes no writes.
  */
  router.get(
    '/discussions/:id/comments',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const discussionId = parsedId(res, req.params.id)
      if (discussionId === null) return
      const scope = await discussionScope(db, discussionId)
      const facts =
        scope === null ? null : await accessOf(db, viewer(req), scope.folderId)
      if (scope === null || facts === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const allowed = mayPerform(facts, 'discussion.read')
      if (!allowed.allowed) {
        sendError(res, 403, 'forbidden', allowed.reason)
        return
      }
      res.status(200).json(
        await threadView(db, scope.folderId, {
          kind: 'discussion',
          discussionId: scope.id,
        }),
      )
    },
  )

  router.post(
    '/discussions/:id/comments',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const discussionId = parsedId(res, req.params.id)
      if (discussionId === null) return
      const parsed = parseBody(postCommentBody, req, res, securityLog)
      if (parsed === null) return
      const scope = await discussionScope(db, discussionId)
      const facts =
        scope === null ? null : await accessOf(db, viewer(req), scope.folderId)
      if (scope === null || facts === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const allowed = mayPerform(facts, 'comment.create')
      if (!allowed.allowed) {
        sendError(res, 403, 'forbidden', allowed.reason)
        return
      }
      const outcome = await createComment(
        db,
        viewer(req),
        scope.folderId,
        { kind: 'discussion', discussionId: scope.id },
        parsed,
      )
      sendCreateOutcome(res, outcome, parsed.file_ids !== undefined)
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
      Author and currently Can comment: a downgraded author keeps their words
      but cannot edit them.
      */
      const allowed = mayPerform(access.facts, 'comment.mutate.own', {
        authorId: access.authorId,
      })
      if (!allowed.allowed) {
        sendError(res, 403, 'forbidden', allowed.reason)
        return
      }
      /* One gate covers both the words and the attachments. */
      const outcome = await editComment(db, viewer(req), access, parsed)
      switch (outcome.kind) {
        case 'file_not_here':
          // An id elsewhere and a missing id read the same (10.2).
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
        case 'content_file_not_attached':
          sendContentFileNotAttached(res)
          return
        case 'empty':
          sendEmptyPost(res)
          return
        case 'mention_unknown':
          sendMentionUnknown(res)
          return
        case 'gone':
          sendError(res, 404, 'not_found', 'Not found.')
          return
        case 'frozen':
          sendFrozen(res)
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
      Allowed as the author with Can comment, or as Full control (moderation).
      Ownership alone grants nothing.
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
            : 'Only people with Full control can remove other people\'s comments.',
        )
        return
      }
      if ((await deleteComment(db, viewer(req), access)) === 'frozen') {
        sendFrozen(res)
        return
      }
      res.status(204).end()
    },
  )

  /*
  Strangers 404, then Can-view members 403, then the key is checked (422).
  `fixed` serves the old like route as thumbs_up for cached clients.
  */
  const reactionRoute =
    (mode: 'add' | 'remove', fixed?: ReactionKey) =>
    async (req: Request, res: Response): Promise<void> => {
      const db = database(res)
      if (db === null) return
      const commentId = parsedId(res, req.params.id)
      if (commentId === null) return
      const access = await accessibleComment(db, viewer(req), commentId)
      if (access === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const may = mayPerform(access.facts, 'comment.like')
      if (!may.allowed) {
        sendError(res, 403, 'forbidden', may.reason)
        return
      }
      let reaction: ReactionKey
      if (fixed === undefined) {
        const parsed = reactionParam.safeParse({ reaction: req.params.reaction })
        if (!parsed.success) {
          sendValidationError(res, parsed.error)
          return
        }
        reaction = parsed.data.reaction
      } else {
        reaction = fixed
      }
      const outcome =
        mode === 'add'
          ? await addReaction(db, viewer(req), commentId, reaction)
          : await removeReaction(db, viewer(req), commentId, reaction)
      if (outcome === 'frozen') {
        sendFrozen(res)
        return
      }
      res.status(204).end()
    }

  router.put(
    '/comments/:id/reactions/:reaction',
    requireSession,
    requireCsrf,
    mutationLimit,
    reactionRoute('add'),
  )
  router.delete(
    '/comments/:id/reactions/:reaction',
    requireSession,
    requireCsrf,
    mutationLimit,
    reactionRoute('remove'),
  )
  router.put(
    '/comments/:id/like',
    requireSession,
    requireCsrf,
    mutationLimit,
    reactionRoute('add', 'thumbs_up'),
  )
  router.delete(
    '/comments/:id/like',
    requireSession,
    requireCsrf,
    mutationLimit,
    reactionRoute('remove', 'thumbs_up'),
  )

  return router
}
