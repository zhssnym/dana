/*
The 7.5 surface: invites, their five transitions, and the two lists. Handlers
validate with the shared schemas, resolve the actor through the domain
module, delegate every decision that touches rows, and serialize; no business
logic lives here (the API role's route convention).

Mounted under /api/v1 by the boot file, which is the Platform engineer's; the
wiring request is recorded in README.md beside this file. The router carries
its own session attachment so it composes whichever order routers mount in,
the folders router's arrangement exactly.

Status grammar, uniform with the rest of the surface (5.2, 5.4, 7.0, 10.2):
no session 401; an invite the caller cannot act on or see reads 404, never
403, so nothing leaks; an actor who can see the invite but may not take this
action gets 403; a transition against a terminal invite is 409, as is every
V-INV rule conflict; limits and field failures are 422; and the resend window
of 5.2 is this package's one 429, with Retry-After.

Two response shapes here are wider than frozen 7.5 enumerates, and both are
recorded for the endpoint shape review the RFC 0001 P5 row places after this
package rather than settled by it: the object inside { invite } is the
invite element the domain module produces, which is also what GET
/invites/sent lists, and the conversion answers { converted_to_share,
membership } with the member element 7.4's own mutation already answers.
*/
import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'

import type { Db, DbClient } from '../../../db/client.js'
import { postInvitesBody } from '../../shared/invites.js'
import {
  attachSession,
  requireCsrf,
  requireSession,
  sessionOf,
} from '../auth/index.js'
import {
  sendError,
  sendFieldValidationError,
  sendValidationError,
} from '../http/errors.js'
import { notifierOf } from '../notify/index.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'
import { folderView, membersOf } from '../domain/folders.js'
import {
  acceptInvite,
  createInvite,
  inviteById,
  inviteFactsFor,
  pendingInvitesFor,
  resendInvite,
  sentInvites,
  settleInvite,
} from '../domain/invites.js'
import type { InviteActorFacts } from '../domain/invites.js'

export interface InvitesRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
  securityLog?: SecurityLogger
}

const uuidParam = z.uuid()

function parsedId(res: Response, raw: unknown): string | null {
  const parsed = uuidParam.safeParse(raw)
  if (!parsed.success) {
    sendError(res, 404, 'not_found', 'Not found.')
    return null
  }
  return parsed.data
}

export function createInvitesRouter(
  options: InvitesRouterOptions = {},
): Router {
  const router = Router()
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)
  const inviteMinuteLimit = optionalLimit(options.rateLimits?.invitesPerMinute)
  const inviteDayLimit = optionalLimit(options.rateLimits?.invitesPerDay)
  const securityLog = options.securityLog ?? createSecurityLogger()

  // 11.10: routes that touch the database require options.dbClient and fail
  // only when called without it (the auth and folders routers' convention).
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

  /* ---------------------------------------------------------------- *
   * Creating an invite: V-INV and the conversion (8.7)
   * ---------------------------------------------------------------- */

  router.post(
    '/invites',
    requireSession,
    requireCsrf,
    mutationLimit,
    inviteMinuteLimit,
    inviteDayLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const parsed = postInvitesBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const result = await createInvite(db, viewer(req), parsed.data)
      switch (result.kind) {
        case 'own_email':
          // 8.7's second validation. It is a 422 naming the field rather
          // than a 409, because the address is the request's own value and
          // no state could make it acceptable.
          sendFieldValidationError(res, [
            {
              field: 'email',
              message: 'is your own address, which needs no invitation',
            },
          ])
          return
        case 'folder_not_found':
          sendError(res, 404, 'not_found', 'Not found.')
          return
        case 'default_folder':
          sendError(
            res,
            409,
            'conflict',
            'The default folder cannot be shared (INV-3).',
          )
          return
        case 'already_member':
          sendError(
            res,
            409,
            'conflict',
            'That person is already a member of this folder.',
          )
          return
        case 'task_not_in_folder':
          sendFieldValidationError(res, [
            {
              field: 'task_id',
              message: 'must name a task inside the invited folder',
            },
          ])
          return
        case 'already_connected':
          // The owner's ruling of 2026-08-09, frozen 7.5's appended
          // paragraph: the connection a bare invite exists to create already
          // holds, so there is nothing this request could accomplish. The
          // copy is 9.8's People screen sentence.
          sendError(
            res,
            409,
            'conflict',
            "You're already connected to this person. They're in your People list.",
          )
          return
        case 'duplicate':
          // 8.7: "409 pointing at it". The id rides the message, which is
          // where the 7.0 envelope has room for it, so a client can offer
          // resend instead of a dead end.
          sendError(
            res,
            409,
            'conflict',
            `An invite to this address for this folder is already pending: ${result.existingId}.`,
          )
          return
        case 'member_cap':
          sendError(
            res,
            422,
            'validation_failed',
            'This folder already has 25 members, the most a folder can hold.',
          )
          return
        case 'converted': {
          // 8.7's instant share. The grant email is the share-grant
          // template, never the invite one: there is nothing to accept.
          if (result.targetEmail !== null) {
            await notifierOf(req.app).send({
              template: 'share_grant',
              to: result.targetEmail,
            })
          }
          const members = await membersOf(db, result.folderId)
          const granted = members.find(
            (member) => member.user.id === result.targetId,
          )
          if (granted === undefined) {
            throw new Error(
              `membership ${result.targetId} vanished between insert and read`,
            )
          }
          res
            .status(200)
            .json({ converted_to_share: true, membership: granted })
          return
        }
        case 'created':
          // 5.2's create row: one email sent, last_sent_at stamped by the
          // insert. The send follows the commit, so a rolled-back create can
          // never have mailed anybody.
          securityLog.inviteEvent('invite_created', {
            inviteId: result.invite.id,
            actorId: viewer(req),
            status: 'pending',
          })
          await notifierOf(req.app).send({
            template: 'invite',
            to: result.invite.email,
          })
          res.status(201).json({ invite: result.invite })
          return
      }
    },
  )

  /* ---------------------------------------------------------------- *
   * The two lists
   * ---------------------------------------------------------------- */

  router.get(
    '/invites/sent',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      res.status(200).json(await sentInvites(db, viewer(req)))
    },
  )

  router.get(
    '/invites/pending',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      // Scoped by the caller's own address inside the query (Q12), so this
      // handler has no way to ask for anybody else's list.
      res.status(200).json(await pendingInvitesFor(db, viewer(req)))
    },
  )

  /* ---------------------------------------------------------------- *
   * The five transitions (5.2)
   * ---------------------------------------------------------------- */

  /**
   * Resolves the invite and the caller's standing toward it, answering 404
   * itself when the id names nothing: an invite nobody can name is
   * nonexistent, and 10.2 makes that the same answer as one the caller may
   * not see.
   */
  const factsOf = async (
    req: Request,
    res: Response,
    db: Db,
  ): Promise<InviteActorFacts | null> => {
    const inviteId = parsedId(res, req.params.id)
    if (inviteId === null) return null
    const facts = await inviteFactsFor(db, viewer(req), inviteId)
    if (facts === undefined) {
      sendError(res, 404, 'not_found', 'Not found.')
      return null
    }
    return facts
  }

  const notPending = (res: Response): void => {
    sendError(
      res,
      409,
      'conflict',
      'This invite is no longer pending (spec 5.2).',
    )
  }

  router.post(
    '/invites/:id/accept',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const facts = await factsOf(req, res, db)
      if (facts === null) return
      // 5.2's actor guard, and 7.5 says outright that a mismatch is 404 and
      // not 403: an account that is not the addressee learns nothing about
      // the invite's existence or its state.
      if (!facts.isRecipient) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const result = await acceptInvite(db, viewer(req), facts.id)
      if (result.kind === 'not_pending') {
        notPending(res)
        return
      }
      if (result.kind === 'member_cap') {
        sendError(
          res,
          422,
          'validation_failed',
          'This folder already has 25 members, the most a folder can hold.',
        )
        return
      }
      securityLog.inviteEvent('invite_accepted', {
        inviteId: facts.id,
        actorId: viewer(req),
        status: 'accepted',
      })
      res.status(200).json({
        connection_created: result.connectionCreated,
        // Frozen 7.5 names the key and not its object. This answers what a
        // fresh GET /folders entry would give for the folder the acceptance
        // granted, the 7.4 mutation convention, and it is one of the shapes
        // routed to the endpoint shape review.
        folder:
          result.folderId === null
            ? null
            : await folderView(db, viewer(req), result.folderId),
        assigned_task_id: result.assignedTaskId,
      })
    },
  )

  router.post(
    '/invites/:id/decline',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const facts = await factsOf(req, res, db)
      if (facts === null) return
      if (!facts.isRecipient) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      if (!(await settleInvite(db, facts.id, 'declined'))) {
        notPending(res)
        return
      }
      securityLog.inviteEvent('invite_declined', {
        inviteId: facts.id,
        actorId: viewer(req),
        status: 'declined',
      })
      // 5.2's decline row has no email side effect: the inviter is told
      // nothing, and sees it on their sent list when they look.
      res.status(200).json({ invite: await inviteById(db, facts.id) })
    },
  )

  router.post(
    '/invites/:id/cancel',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const facts = await factsOf(req, res, db)
      if (facts === null) return
      /*
      5.2's two actors: the inviter, or the owner of the attached folder.
      The refusal splits on visibility, which is 5.4's own distinction: a
      co-member sees the invite on the folder detail (7.4's pending_invites)
      and may cancel only their own, so theirs is 403, while anybody else,
      including every caller of a bare invite that has no folder and
      therefore no owner arm, cannot see it at all and gets 404.
      */
      if (!facts.isInviter && !facts.isFolderOwner) {
        if (facts.isFolderMember) {
          sendError(
            res,
            403,
            'forbidden',
            'Only the inviter or the folder owner can cancel this invite.',
          )
          return
        }
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      if (!(await settleInvite(db, facts.id, 'canceled'))) {
        notPending(res)
        return
      }
      securityLog.inviteEvent('invite_canceled', {
        inviteId: facts.id,
        actorId: viewer(req),
        status: 'canceled',
      })
      res.status(200).json({ invite: await inviteById(db, facts.id) })
    },
  )

  router.post(
    '/invites/:id/resend',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const facts = await factsOf(req, res, db)
      if (facts === null) return
      // 5.2 gives resend one actor, the inviter. The folder's owner can see
      // the invite, so their refusal is 403 by the same visibility rule
      // cancel uses; anybody else gets 404.
      if (!facts.isInviter) {
        if (facts.isFolderOwner || facts.isFolderMember) {
          sendError(
            res,
            403,
            'forbidden',
            'Only the inviter can resend this invite.',
          )
          return
        }
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const result = await resendInvite(db, facts.id)
      if (result.kind === 'not_pending') {
        // Terminal outranks the window: a canceled invite is a state
        // conflict however old its anchor.
        notPending(res)
        return
      }
      if (result.kind === 'throttled') {
        res.set('Retry-After', String(result.retryAfterSeconds))
        sendError(
          res,
          429,
          'rate_limited',
          'This invite was sent within the last 24 hours (spec 5.2).',
        )
        return
      }
      await notifierOf(req.app).send({ template: 'invite', to: result.email })
      securityLog.inviteEvent('invite_resent', {
        inviteId: facts.id,
        actorId: viewer(req),
        status: 'resent',
      })
      res.status(200).json({ invite: await inviteById(db, facts.id) })
    },
  )

  return router
}
