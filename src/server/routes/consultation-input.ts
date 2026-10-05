/*
"Ask for input" rounds inside a Discussion. Decisions are in
domain/consultation-input.ts under the Discussion's row lock, refusing in the
order 404, 422, 403, 409. Every route takes a path id, so each needs an ac-397 row.
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import {
  closeInputRoundBody,
  openInputRoundBody,
  putInputResponseBody,
} from '../../shared/consultation-input.js'
import { requireCsrf, requireSession } from '../auth/index.js'
import {
  closeInputRound,
  getInputRound,
  listInputRounds,
  openInputRound,
  putInputResponse,
  withdrawInputResponse,
} from '../domain/consultation-input.js'
import type { InputOutcome } from '../domain/consultation-input.js'
import { sendError, sendFieldValidationError } from '../http/errors.js'
import { parseBody } from '../http/parse-body.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { routerWithPreamble } from './preamble.js'

export interface ConsultationInputRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
  securityLog?: SecurityLogger
}

export function createConsultationInputRouter(
  options: ConsultationInputRouterOptions = {},
): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)
  const securityLog = options.securityLog ?? createSecurityLogger()

  const answer = <T>(
    res: Response,
    outcome: InputOutcome<T>,
    onOk: (value: T) => void,
  ): void => {
    switch (outcome.kind) {
      case 'not_found':
        sendError(res, 404, 'not_found', 'Not found.')
        return
      case 'invalid':
        sendFieldValidationError(res, [
          { field: outcome.field, message: outcome.message },
        ])
        return
      case 'forbidden':
        sendError(res, 403, 'forbidden', outcome.reason)
        return
      case 'conflict':
        sendError(res, 409, 'conflict', outcome.message)
        return
      case 'ok':
        onOk(outcome.value)
    }
  }

  router.get(
    '/discussions/:id/input-rounds',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const discussionId = parsedId(res, req.params.id)
      if (discussionId === null) return
      answer(res, await listInputRounds(db, viewer(req), discussionId), (rounds) => {
        res.status(200).json({ input_rounds: rounds })
      })
    },
  )

  router.post(
    '/discussions/:id/input-rounds',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const discussionId = parsedId(res, req.params.id)
      if (discussionId === null) return
      /* The body is parsed first: a malformed body reveals nothing, and the
         domain's row-dependent 422s still follow its 404. */
      const body = parseBody(openInputRoundBody, req, res, securityLog)
      if (body === null) return
      answer(res, await openInputRound(db, viewer(req), discussionId, body), (round) => {
        res.status(201).json(round)
      })
    },
  )

  router.get(
    '/input-rounds/:id',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const roundId = parsedId(res, req.params.id)
      if (roundId === null) return
      answer(res, await getInputRound(db, viewer(req), roundId), (round) => {
        res.status(200).json(round)
      })
    },
  )

  router.post(
    '/input-rounds/:id/close',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const roundId = parsedId(res, req.params.id)
      if (roundId === null) return
      if (req.body !== undefined && parseBody(closeInputRoundBody, req, res, securityLog) === null) {
        return
      }
      answer(res, await closeInputRound(db, viewer(req), roundId), (round) => {
        res.status(200).json(round)
      })
    },
  )

  router.put(
    '/input-rounds/:id/response',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const roundId = parsedId(res, req.params.id)
      if (roundId === null) return
      const body = parseBody(putInputResponseBody, req, res, securityLog)
      if (body === null) return
      answer(res, await putInputResponse(db, viewer(req), roundId, body), (round) => {
        res.status(200).json(round)
      })
    },
  )

  router.delete(
    '/input-rounds/:id/response',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const roundId = parsedId(res, req.params.id)
      if (roundId === null) return
      answer(res, await withdrawInputResponse(db, viewer(req), roundId), () => {
        res.status(204).end()
      })
    },
  )

  return router
}
