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
at P9).

Status grammar, uniform across the surface (5.4, 7.0, 10.2): no session
401; inaccessible or nonexistent folder 404, never 403, so existence never
leaks; visible but not permitted 403; the 5.3 and INV-2 rule conflicts
409; limit and guard failures 422 through the shared schemas and the
domain results.
*/
import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'

import type { Db, DbClient } from '../../../db/client.js'
import {
  patchFolderBody,
  patchFolderMyMembershipBody,
  postFolderMembersBody,
  postFoldersBody,
} from '../../shared/folders.js'
import {
  attachSession,
  requireCsrf,
  requireSession,
  sessionOf,
} from '../auth/index.js'
import { sendError, sendValidationError } from '../http/errors.js'
import { notifierOf } from '../notify/index.js'
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
  removeMembership,
  renameFolder,
  setMyMembership,
} from '../domain/folders.js'

export interface FoldersRouterOptions {
  dbClient?: DbClient
}

/*
A path id that is not a uuid names nothing that exists, and letting it
reach a query would surface as a cast error, a 500 wearing a taxonomy the
contract does not have. 404 is 7.0's word for nonexistent.
*/
const uuidParam = z.uuid()

function parsedId(res: Response, raw: unknown): string | null {
  const parsed = uuidParam.safeParse(raw)
  if (!parsed.success) {
    sendError(res, 404, 'not_found', 'Not found.')
    return null
  }
  return parsed.data
}

export function createFoldersRouter(
  options: FoldersRouterOptions = {},
): Router {
  const router = Router()

  // 11.10: routes that touch the database require options.dbClient and
  // fail only when called without it (the auth router's convention).
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
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const parsed = postFoldersBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const result = await createFolder(db, viewer(req), parsed.data.name)
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
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const parsed = patchFolderBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const access = await accessOf(db, viewer(req), folderId)
      if (access === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      if (!access.isOwner) {
        sendError(res, 403, 'forbidden', 'Only the folder owner can rename it.')
        return
      }
      // 7.4: works for the default folder too; rename carries no guard
      // beyond ownership.
      await renameFolder(db, folderId, parsed.data.name)
      const folder = await folderView(db, viewer(req), folderId)
      res.status(200).json(folder)
    },
  )

  router.delete(
    '/folders/:id',
    requireSession,
    requireCsrf,
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
      const deleted = await deleteFolder(db, folderId)
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
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const parsed = patchFolderMyMembershipBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const access = await accessOf(db, viewer(req), folderId)
      if (access === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      // Any member, own row only (5.4): the viewer id scopes the UPDATE,
      // so another member's row is unreachable by construction.
      await setMyMembership(db, viewer(req), folderId, parsed.data)
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
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const parsed = postFolderMembersBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
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
        parsed.data.user_id,
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
          // 5.3: the share-grant email follows the successful add alone,
          // through Platform's notify module; under test the injected sink
          // observes it, in production Resend sends it from P7 on.
          if (result.targetEmail !== null) {
            await notifierOf(req.app).send({
              template: 'share_grant',
              to: result.targetEmail,
            })
          }
          const members = await membersOf(db, folderId)
          const added = members.find(
            (member) => member.user.id === parsed.data.user_id,
          )
          // The row was inserted in this request; not finding it is a state
          // the contract has no shape for, and the shape review ruled that
          // answering a degenerate body is worse than failing loudly (the
          // boot error handler envelopes this as the 500 it is).
          if (added === undefined) {
            throw new Error(
              `membership ${parsed.data.user_id} vanished between insert and read`,
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
        })
        res.status(204).end()
        return
      }

      await removeMembership(db, folderId, actorId, {
        transferOwnership: false,
      })
      res.status(204).end()
    },
  )

  return router
}
