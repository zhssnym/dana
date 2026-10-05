/*
The 7.5 invite routes. An invite the caller cannot see is 404, never 403;
visible but not permitted is 403; a settled invite is 409. Accepting into a
folder in Trash is 409 `folder_deleted`, so the client can say it differently.
Resend's 24-hour window is 429 with Retry-After.
*/
import type { Request, Response, Router } from 'express'

import type { Db, DbClient } from '../../../db/client.js'
import { postInvitesBody } from '../../shared/invites.js'
import { requireCsrf, requireSession } from '../auth/index.js'
import {
  sendError,
  sendFieldValidationError,
} from '../http/errors.js'
import { parseBody } from '../http/parse-body.js'
import { notifierOf } from '../notify/index.js'
import type { OutboundMessage } from '../notify/index.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'
import { mayPerform } from '../domain/folder-access.js'
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
import type { InviteActorFacts, InviteElement } from '../domain/invites.js'
import { routerWithPreamble } from './preamble.js'

export interface InvitesRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
  securityLog?: SecurityLogger
}

/*
The email template follows the row: `invite_connection` without a folder,
`invite_folder` with one. Shared by create and resend so they cannot disagree.
*/
function inviteMessage(
  invite: InviteElement,
  inviterName: string | null,
): OutboundMessage {
  if (invite.folder_id === null) {
    return {
      template: 'invite_connection',
      to: invite.email,
      connectionInvite: { inviterName },
    }
  }
  if (invite.folder_name === null) {
    throw new Error(
      `invite ${invite.id} names folder ${invite.folder_id} and no name came back with it`,
    )
  }
  return {
    template: 'invite_folder',
    to: invite.email,
    folderInvite: {
      inviterName,
      folderId: invite.folder_id,
      folderName: invite.folder_name,
    },
  }
}

/**
 * Folder invites: Full control administers them; having sent one is not
 * authority. A bare roster invite has no folder, so only its sender may.
 */
function mayAdministerInvite(facts: InviteActorFacts): boolean {
  if (facts.folderId === null) return facts.isInviter
  if (facts.folderFacts === null) return false
  return mayPerform(facts.folderFacts, 'invite.administer').allowed
}

export function createInvitesRouter(
  options: InvitesRouterOptions = {},
): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)
  const inviteMinuteLimit = optionalLimit(options.rateLimits?.invitesPerMinute)
  const inviteDayLimit = optionalLimit(options.rateLimits?.invitesPerDay)
  const securityLog = options.securityLog ?? createSecurityLogger()

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
      const parsed = parseBody(postInvitesBody, req, res, securityLog)
      if (parsed === null) return
      const result = await createInvite(db, viewer(req), parsed)
      switch (result.kind) {
        case 'own_email':
          // 422, not 409: no state could make your own address acceptable.
          sendFieldValidationError(res, [
            {
              field: 'email',
              message: 'is your own address, which needs no invitation',
            },
          ])
          return
        case 'forbidden':
          // The folder resolved for this caller, so 403 may name the rule.
          sendError(res, 403, 'forbidden', result.reason)
          return
        case 'folder_not_found':
          sendError(res, 404, 'not_found', 'Not found.')
          return
        case 'default_folder':
          sendError(
            res,
            409,
            'conflict',
            'The default folder cannot be shared.',
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
          // A bare invite's connection already exists; the copy is 9.8's.
          sendError(
            res,
            409,
            'conflict',
            "You're already connected to this person. They're in your People list.",
          )
          return
        case 'duplicate':
          // The existing id is in the message so the client can offer resend.
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
          // 8.7's instant share: send the share-grant email, not an invite.
          if (result.targetEmail !== null) {
            await notifierOf(req.app).send({
              template: 'share_grant',
              to: result.targetEmail,
              shareGrant: {
                inviterName: result.inviterName,
                folderId: result.folderId,
                folderName: result.folderName,
              },
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
          // The send follows the commit, so a rolled-back create mails nobody.
          securityLog.inviteEvent('invite_created', {
            inviteId: result.invite.id,
            actorId: viewer(req),
            status: 'pending',
          })
          await notifierOf(req.app).send(inviteMessage(result.invite, result.inviterName))
          res.status(201).json({ invite: result.invite })
          return
      }
    },
  )

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
      // Scoped by the caller's own address inside the query (Q12).
      res.status(200).json(await pendingInvitesFor(db, viewer(req)))
    },
  )

  /** The invite and the caller's standing toward it; 404 itself when the id names nothing. */
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
      'This invite is no longer pending.',
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
      // Not the addressee: 404, so they learn nothing about the invite (7.5).
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
      if (result.kind === 'folder_in_trash') {
        /*
        The invite is still good but its folder is in Trash: its own 409 code,
        since a restore within 30 days makes it acceptable again.
        */
        sendError(
          res,
          409,
          'folder_deleted',
          'This folder was deleted. It can be restored from Trash for 30 days, and the invite waits until then.',
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
        // The full Folder object, as a fresh GET /folders entry would give.
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
      // No email: the inviter sees it on their sent list.
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
      A folder member can see the invite (pending_invites), so a refusal is 403;
      anyone else, and every caller of a bare invite, gets 404.
      */
      if (!mayAdministerInvite(facts)) {
        if (facts.isFolderMember) {
          sendError(
            res,
            403,
            'forbidden',
            'Only people with Full control can cancel invitations to this folder.',
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
      // Same visibility rule as cancel.
      if (!mayAdministerInvite(facts)) {
        if (facts.isFolderMember) {
          sendError(
            res,
            403,
            'forbidden',
            'Only people with Full control can resend invitations to this folder.',
          )
          return
        }
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const result = await resendInvite(db, facts.id)
      if (result.kind === 'not_pending') {
        // Settled outranks the time window.
        notPending(res)
        return
      }
      if (result.kind === 'throttled') {
        res.set('Retry-After', String(result.retryAfterSeconds))
        sendError(
          res,
          429,
          'rate_limited',
          'This invite was sent within the last 24 hours.',
        )
        return
      }
      // The email names the caller as the sender.
      const invite = await inviteById(db, facts.id)
      await notifierOf(req.app).send(inviteMessage(invite, facts.viewerName))
      securityLog.inviteEvent('invite_resent', {
        inviteId: facts.id,
        actorId: viewer(req),
        status: 'resent',
      })
      res.status(200).json({ invite })
    },
  )

  return router
}
