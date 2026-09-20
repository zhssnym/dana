/*
The 7.5 surface: invites, their five transitions, and the two lists. Handlers
validate with the shared schemas, resolve the actor through the domain
module, delegate every decision that touches rows, and serialize; no business
logic lives here (the API role's route convention).

Mounted under /api/v1 by the boot file, which is the Platform engineer's; the
wiring request is recorded in README.md beside this file. The router carries
its own session attachment so it composes whichever order routers mount in,
the folders router's arrangement exactly; that block is `preamble.ts` since
issue #36.

Status grammar, uniform with the rest of the surface (5.2, 5.4, 7.0, 10.2):
no session 401; an invite the caller cannot act on or see reads 404, never
403, so nothing leaks; an actor who can see the invite but may not take this
action gets 403; a transition against a terminal invite is 409, as is every
V-INV rule conflict; limits and field failures are 422; and the resend window
of 5.2 is this package's one 429, with Retry-After. One 409 here carries a
code of its own rather than `conflict`: accepting into a folder that is
sitting in Trash answers `folder_deleted` (issue #28), because a client has
to say something different for it than for an invite that is merely spent.

Two response shapes here are wider than frozen 7.5 enumerates, and both are
recorded for the endpoint shape review the RFC 0001 P5 row places after this
package rather than settled by it: the object inside { invite } is the
invite element the domain module produces, which is also what GET
/invites/sent lists, and the conversion answers { converted_to_share,
membership } with the member element 7.4's own mutation already answers.
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
Which invitation this is, decided from the row rather than from the request.

7.5 makes folder_id optional and item 32 splits the template on exactly that:
`invite_connection` when it is null, `invite_folder` when it is not. The
decision is made here, at the call site, from data already in hand, and it is
made in one function because three sites send an invitation, the create, the
resend and nothing else in between: two of them would otherwise repeat this
conditional and could one day disagree about it.

`folder_name` rides InviteElement because frozen 7.5's pending list carries
it, so a folder invitation names its folder without a read of its own. A
folder_id with no name would be a row whose folder vanished under it, which
the invite's own foreign key does not permit; the throw says so rather than
mailing somebody a blank.
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
 * Who may cancel or resend a pending invite (issue #228).
 *
 * **Both rules moved, and in the same direction.** Cancel was "the inviter or
 * the folder's owner"; resend was "the inviter" alone. R7 section L makes
 * both member administration, which is Full control's, and says the inviter
 * half out loud: a former inviter who is later downgraded loses Folder-invite
 * administration, because "I created the invite" is not permanent authority.
 * The owner half goes for the reason every other ownership-as-authority proxy
 * goes in #209 -- custody is not an operating permission.
 *
 * A **bare** roster invite carries no folder, so there is no Folder Access to
 * resolve and nobody to administer it but the person who sent it. That arm is
 * unchanged, and it is why this is a function rather than one call to
 * `mayPerform`.
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

  // 11.10: routes that touch the database require options.dbClient and fail
  // only when called without it (the auth and folders routers' convention).
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
      const parsed = parseBody(postInvitesBody, req, res, securityLog)
      if (parsed === null) return
      const result = await createInvite(db, viewer(req), parsed)
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
        case 'forbidden':
          // 10.2's second half: the folder resolved for this caller, so the
          // refusal may say which rule it broke (issue #228).
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
          // template, never the invite one: there is nothing to accept. Since
          // S19 it also names the sharer and the folder (RFC 0005 change
          // control item 32), both read by the transaction that granted.
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
          // 5.2's create row: one email sent, last_sent_at stamped by the
          // insert. The send follows the commit, so a rolled-back create can
          // never have mailed anybody.
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
      if (result.kind === 'folder_in_trash') {
        /*
        Issue #28, and 5.2's accept row as amended: the invite is still
        pending and the folder is in Trash, so this is a state conflict
        rather than a validation failure, which is 7.0's 409.

        The code is its own rather than the bare `conflict` the not-pending
        refusal answers, because a client has three different things to say
        here and only the code tells them apart: `not_found` is an invite
        that is not this caller's, `conflict` is an invite already settled,
        and `folder_deleted` is an invite that is still good and a folder
        that is not. A restore inside the thirty days makes this one
        acceptable and makes neither of the others so. 7.0 provides for
        exactly this, "409's rule conflicts gain their specific codes as the
        section 5 tables land".
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
      if (!mayAdministerInvite(facts)) {
        if (facts.isFolderMember) {
          sendError(
            res,
            403,
            'forbidden',
            'Only Full control can cancel an invite into this folder.',
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
      if (!mayAdministerInvite(facts)) {
        if (facts.isFolderMember) {
          sendError(
            res,
            403,
            'forbidden',
            'Only Full control can resend an invite into this folder.',
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
      // Read before the send rather than after it, which is the whole of what
      // this site owes the split: the invite element carries folder_id and
      // folder_name, and 5.2 gives resend one actor, the inviter, so the
      // caller's own display_name is the name the email says. Neither is a
      // read this handler did not already make.
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
