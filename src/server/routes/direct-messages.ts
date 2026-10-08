import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import {
  directMessageQuery,
  openDirectConversationBody,
  sendDirectMessageBody,
} from '../../shared/direct-messages.js'
import { requireCsrf, requireSession } from '../auth/index.js'
import {
  directMessagePage,
  openDirectConversation,
  sendDirectMessage,
} from '../domain/direct-messages.js'
import { sendError, sendValidationError } from '../http/errors.js'
import { parseBody } from '../http/parse-body.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { routerWithPreamble } from './preamble.js'

export function createDirectMessagesRouter(options: {
  dbClient?: DbClient
  rateLimits?: RateLimits
  securityLog?: SecurityLogger
} = {}): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)
  const securityLog = options.securityLog ?? createSecurityLogger()

  router.post('/direct-conversations', requireSession, requireCsrf, mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const body = parseBody(openDirectConversationBody, req, res, securityLog)
      if (body === null) return
      if (body.member_id === viewer(req)) {
        sendError(res, 422, 'validation_failed', 'member_id: choose another Team member.')
        return
      }
      const id = await openDirectConversation(db, viewer(req), body.folder_id, body.member_id)
      if (id === null) { sendError(res, 404, 'not_found', 'Not found.'); return }
      res.status(200).json({ id })
    })

  router.get('/direct-conversations/:id/messages', requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const id = parsedId(res, req.params.id)
      if (id === null) return
      const query = directMessageQuery.safeParse(req.query)
      if (!query.success) { sendValidationError(res, query.error); return }
      const page = await directMessagePage(db, viewer(req), id, query.data.before)
      if (page === null) { sendError(res, 404, 'not_found', 'Not found.'); return }
      res.status(200).json(page)
    })

  router.post('/direct-conversations/:id/messages', requireSession, requireCsrf, mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const id = parsedId(res, req.params.id)
      if (id === null) return
      const body = parseBody(sendDirectMessageBody, req, res, securityLog)
      if (body === null) return
      const message = await sendDirectMessage(db, viewer(req), id, body.body)
      if (message === null) { sendError(res, 404, 'not_found', 'Not found.'); return }
      res.status(201).json(message)
    })

  return router
}
