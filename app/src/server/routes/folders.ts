/*
The 7.4 surface: folders and membership. Handlers validate with the shared
schemas, resolve access through the domain module, delegate every decision
that touches rows, and serialize; no business logic lives here (the API
role's route convention).

Mounted under /api/v1 by the boot file, which is the Platform engineer's;
the wiring request is recorded in README.md beside this file. The router
carries its own session attachment so it composes whichever order routers
mount in: when the auth router ran first on this request, its attachSession
already resolved the cookie and this one steps aside, and when it did not,
this router still stands alone behind the same three middleware links
(11.3: session, CSRF on mutations, then the handler; rate limiting joins
at P9). That block lives in `preamble.ts` since issue #36, with what is and
is not true of it written down there.

Status grammar, uniform across the surface (5.4, 7.0, 10.2): no session
401; inaccessible or nonexistent folder 404, never 403, so existence never
leaks; visible but not permitted 403; the 5.3 and INV-2 rule conflicts
409; limit and guard failures 422 through the shared schemas and the
domain results.
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import {
  patchFolderBody,
  patchFolderMyMembershipBody,
  postFolderMembersBody,
  postFoldersBody,
} from '../../shared/folders.js'
import { requireCsrf, requireSession } from '../auth/index.js'
import { sendError } from '../http/errors.js'
import { parseBody } from '../http/parse-body.js'
import { notifierOf } from '../notify/index.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'
import {
  accessOf,
  addMember,
  createFolder,
  deleteFolder,
  folderView,
  isMember,
  listFolders,
  membersOf,
  otherMemberCount,
  pendingInvitesOf,
  patchFolderProfile,
  removeMembership,
  setMyMembership,
} from '../domain/folders.js'
import { routerWithPreamble } from './preamble.js'

export interface FoldersRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
  securityLog?: SecurityLogger
}

export function createFoldersRouter(
  options: FoldersRouterOptions = {},
): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)
  const securityLog = options.securityLog ?? createSecurityLogger()

  /* ---------------------------------------------------------------- *
   * Folders
   * ---------------------------------------------------------------- */

  router.get('/folders', requireSession, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    // 7.4 names the Folder objects and their order and no wrapper, so the
    // array answers bare, the literal reading; the API role's shape review
    // carries the routed wrapper question and this line is where its
    // answer lands.
    res.status(200).json(await listFolders(db, viewer(req)))
  })

  router.post(
    '/folders',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const parsed = parseBody(postFoldersBody, req, res, securityLog)
      if (parsed === null) return
      /* The description rides the create rather than a PATCH behind it
         (7.4, 2026-09-04). Absent is undefined here and NULL in the row,
         which is every folder made before this. */
      const result = await createFolder(
        db,
        viewer(req),
        parsed.name,
        parsed.description ?? null,
      )
      if (result.kind === 'folder_cap') {
        sendError(
          res,
          422,
          'validation_failed',
          'You already have 200 custom folders, the most an account can hold.',
        )
        return
      }
      res.status(201).json(result.folder)
    },
  )

  router.get(
    '/folders/:id',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const folder = await folderView(db, viewer(req), folderId)
      if (folder === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      // 7.4: Folder plus members plus pending invites, one object. The
      // pending-invites key name is the other half of the routed shape
      // question; pending_invites is the candidate, precise about which
      // invites 7.4 lists.
      res.status(200).json({
        ...folder,
        members: await membersOf(db, folderId),
        pending_invites: await pendingInvitesOf(db, folderId),
      })
    },
  )

  router.patch(
    '/folders/:id',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const parsed = parseBody(patchFolderBody, req, res, securityLog)
      if (parsed === null) return
      const access = await accessOf(db, viewer(req), folderId)
      if (access === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      // The DES-225 split (RFC 0005): the name stays the owner's, works
      // for the default folder too and carries no guard beyond ownership
      // (7.4); the 4.3 identity is the folder's and any member writes it.
      if (parsed.name !== undefined && !access.isOwner) {
        sendError(res, 403, 'forbidden', 'Only the folder owner can rename it.')
        return
      }
      const outcome = await patchFolderProfile(db, viewer(req), folderId, {
        name: parsed.name,
        icon: parsed.icon,
        color: parsed.color,
        coverFileId: parsed.cover_file_id,
        coverPreset: parsed.cover_preset,
        coverFocalY: parsed.cover_focal_y,
        description: parsed.description,
      })
      if (outcome === 'cover_not_here') {
        sendError(
          res,
          422,
          'validation_failed',
          'cover_file_id: must name an image stored in this folder.',
        )
        return
      }
      const folder = await folderView(db, viewer(req), folderId)
      res.status(200).json(folder)
    },
  )

  router.delete(
    '/folders/:id',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const access = await accessOf(db, viewer(req), folderId)
      if (access === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      if (!access.isOwner) {
        sendError(res, 403, 'forbidden', 'Only the folder owner can delete it.')
        return
      }
      if (access.isDefault) {
        sendError(
          res,
          409,
          'conflict',
          'The default folder cannot be deleted (INV-2).',
        )
        return
      }
      const deleted = await deleteFolder(db, viewer(req), folderId)
      securityLog.deletionEvent('folder_deleted', {
        actorId: viewer(req),
        folderId,
        tasksOpen: deleted.tasks_open,
        tasksCompleted: deleted.tasks_completed,
        tasksAbandoned: deleted.tasks_abandoned,
      })
      res.status(200).json({ deleted })
    },
  )

  /* ---------------------------------------------------------------- *
   * My membership: the personal label and color (4.4)
   * ---------------------------------------------------------------- */

  router.patch(
    '/folders/:id/my-membership',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const parsed = parseBody(patchFolderMyMembershipBody, req, res, securityLog)
      if (parsed === null) return
      const access = await accessOf(db, viewer(req), folderId)
      if (access === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      // Any member, own row only (5.4): the viewer id scopes the UPDATE,
      // so another member's row is unreachable by construction.
      await setMyMembership(db, viewer(req), folderId, parsed)
      const folder = await folderView(db, viewer(req), folderId)
      res.status(200).json(folder)
    },
  )

  /* ---------------------------------------------------------------- *
   * Members
   * ---------------------------------------------------------------- */

  router.post(
    '/folders/:id/members',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const parsed = parseBody(postFolderMembersBody, req, res, securityLog)
      if (parsed === null) return
      const actorId = viewer(req)
      const access = await accessOf(db, actorId, folderId)
      if (access === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const result = await addMember(
        db,
        actorId,
        folderId,
        parsed.user_id,
        access,
      )
      switch (result.kind) {
        case 'default_folder':
          sendError(
            res,
            409,
            'conflict',
            'The default folder cannot be shared (INV-3).',
          )
          return
        case 'already_member':
          sendError(res, 409, 'conflict', 'Already a member of this folder.')
          return
        case 'not_connected':
          sendError(
            res,
            422,
            'validation_failed',
            'No roster connection exists between you and this person.',
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
        case 'added': {
          /*
          5.3: the share-grant email follows the successful add alone, through
          Platform's notify module; under test the injected sink observes it,
          in production Resend sends it from P7 on.

          The members read moved ahead of the send at S19 and nothing else
          about the ordering moved: the add has already committed, and this
          read is the one the 201 body is built from either way. It is where
          the actor's own display_name is, which item 32 has the email name,
          and the actor is necessarily in it, a non-member being unable to
          reach this line. The folder's name comes from the access read this
          handler made before it granted. So the ruled copy costs no query.
          */
          const members = await membersOf(db, folderId)
          if (result.targetEmail !== null) {
            await notifierOf(req.app).send({
              template: 'share_grant',
              to: result.targetEmail,
              shareGrant: {
                inviterName:
                  members.find((member) => member.user.id === actorId)?.user
                    .display_name ?? null,
                folderId,
                folderName: access.name,
              },
            })
          }
          const added = members.find(
            (member) => member.user.id === parsed.user_id,
          )
          // The row was inserted in this request; not finding it is a state
          // the contract has no shape for, and the shape review ruled that
          // answering a degenerate body is worse than failing loudly (the
          // boot error handler envelopes this as the 500 it is).
          if (added === undefined) {
            throw new Error(
              `membership ${parsed.user_id} vanished between insert and read`,
            )
          }
          res.status(201).json(added)
          return
        }
      }
    },
  )

  router.delete(
    '/folders/:id/members/:userId',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const targetId = parsedId(res, req.params.userId)
      if (targetId === null) return
      const actorId = viewer(req)
      const access = await accessOf(db, actorId, folderId)
      if (access === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      if (!(await isMember(db, folderId, targetId))) {
        // The membership named by the path does not exist; 404 is 7.0's
        // word for that, and it holds for the leave-again repeat too.
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }

      // The three legal shapes of 5.3 and 7.4, in one place.
      if (targetId !== actorId) {
        if (!access.isOwner) {
          sendError(
            res,
            403,
            'forbidden',
            'Only the folder owner can remove another member.',
          )
          return
        }
        await removeMembership(db, folderId, targetId, {
          transferOwnership: false,
          actorId,
        })
        res.status(204).end()
        return
      }

      if (access.isOwner) {
        const others = await otherMemberCount(db, folderId, actorId)
        if (others === 0) {
          sendError(
            res,
            409,
            'conflict',
            'You are the only member. Delete the folder instead.',
          )
          return
        }
        await removeMembership(db, folderId, actorId, {
          transferOwnership: true,
          actorId,
        })
        res.status(204).end()
        return
      }

      await removeMembership(db, folderId, actorId, {
        transferOwnership: false,
        actorId,
      })
      res.status(204).end()
    },
  )

  /*
  The leave, addressed as one's own membership (RFC 0005; the 9.6 door).
  The same three shapes as the members path above with the target fixed to
  the caller, recorded at S5's change control as an alias of 5.3's leave
  rather than a new act: the ex-owner AC-202 frees walks through here.
  */
  router.delete(
    '/folders/:id/my-membership',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const actorId = viewer(req)
      const access = await accessOf(db, actorId, folderId)
      if (access === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      if (access.isDefault) {
        sendError(
          res,
          409,
          'conflict',
          'The default folder cannot be left (INV-2).',
        )
        return
      }
      if (access.isOwner) {
        const others = await otherMemberCount(db, folderId, actorId)
        if (others === 0) {
          sendError(
            res,
            409,
            'conflict',
            'You are the only member. Delete the folder instead.',
          )
          return
        }
        await removeMembership(db, folderId, actorId, {
          transferOwnership: true,
          actorId,
        })
        res.status(204).end()
        return
      }
      await removeMembership(db, folderId, actorId, {
        transferOwnership: false,
        actorId,
      })
      res.status(204).end()
    },
  )

  return router
}
