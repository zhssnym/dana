/*
The 7.4 folder and membership routes. Inaccessible or missing folders answer
404, never 403, so existence never leaks (10.2); visible but not permitted is 403.
*/
import type { Request, Response, Router } from 'express'
import { sql } from 'drizzle-orm'

import type { Db, DbClient } from '../../../db/client.js'
import {
  getFoldersQuery,
  patchFolderBody,
  patchFolderLocationBody,
  patchFolderMyMembershipBody,
  postFolderMembersBody,
  postFolderTabsBody,
  postFoldersBody,
  projectTabs,
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
  addMember,
  changeMemberAccess,
  createFolder,
  createSubPageIn,
  deleteFolder,
  folderView,
  isMember,
  listFolders,
  membersOf,
  otherMemberCount,
  pendingInvitesOf,
  patchFolderProfile,
  sectionProgressOf,
  recoverOwnerFullControl,
  removeMembership,
  setMyMembership,
  withoutProjectTabs,
} from '../domain/folders.js'
import {
  accessHistoryOf,
  accessOf,
  atLeast,
  mayPerform,
  otherFullControlCount,
  projectOf,
} from '../domain/folder-access.js'
import type { FolderAccess } from '../domain/folder-access.js'
import type { FolderAction } from '../domain/folder-access.js'
import {
  patchFolderMemberAccessBody,
} from '../../shared/folder-access.js'
import type { GetFolderAccessHistoryResponse } from '../../shared/folder-access.js'
import {
  patchMemberBioBody,
  putResponsibilityBody,
  putSelfEditGrantBody,
} from '../../shared/responsibility.js'
import type {
  GetFolderMemberDetailsResponse,
  GetResponsibilityHistoryResponse,
  GetResponsibilityResponse,
  PutResponsibilityResponse,
} from '../../shared/responsibility.js'
import {
  activeStandingOf,
  commitResponsibility,
  memberDetailsOf,
  responsibilityHistoryOf,
  setSelfEditGrant,
} from '../domain/responsibility.js'
import { readFolderDependencies } from '../domain/task-dependencies.js'
import { profileArea, putProfileContentBody } from '../../shared/member-profile.js'
import { profileSectionsOf, writeProfileSection } from '../domain/member-profile.js'
import type { GetFolderDependenciesResponse } from '../../shared/task-dependencies.js'
import { inTransaction } from '../database.js'
import { moveFolder, visibleAncestors } from '../domain/page-tree.js'
import { addTab } from '../domain/project-tabs.js'
import { retiredRoute } from '../observability/retired-route.js'
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

  /* Resolve the folder first (404 to outsiders), then ask mayPerform (403). */
  const gate = async (
    req: Request,
    res: Response,
    folderId: string,
    action: FolderAction,
  ): Promise<FolderAccess | null> => {
    const db = database(res)
    if (db === null) return null
    const facts = await accessOf(db, viewer(req), folderId)
    if (facts === null) {
      sendError(res, 404, 'not_found', 'Not found.')
      return null
    }
    const decision = mayPerform(facts, action)
    if (!decision.allowed) {
      sendError(res, 403, 'forbidden', decision.reason)
      return null
    }
    return facts
  }

  const STRANDED =
    'This folder would be left with nobody in Full control. Give another member Full control first.'

  /** Membership acts on any page apply to its project root. Call after the
   * page's own gate, so a stranger still gets 404. */
  const projectFor = async (db: Db, res: Response, folderId: string): Promise<string | null> => {
    const project = await projectOf(db, folderId)
    if (project === null) sendError(res, 404, 'not_found', 'Not found.')
    return project
  }

  const targetIsOwner = async (
    db: Db,
    folderId: string,
    targetId: string,
  ): Promise<boolean> => {
    const target = await accessOf(db, targetId, folderId)
    return target !== null && target.isOwner
  }

  /** Whether removing `userId` would leave no Full control member. */
  const lastCustodian = async (
    db: Db,
    folderId: string,
    userId: string,
  ): Promise<boolean> => {
    const held = await accessOf(db, userId, folderId)
    if (held === null || held.access !== 'full_control') return false
    const project = (await projectOf(db, folderId)) ?? folderId
    return (await otherFullControlCount(db, project, userId)) === 0
  }

  /*
  Shared by both leave routes. Owners must transfer ownership first: there is
  no automatic succession on a voluntary leave (only 8.10 account deletion
  transfers). The last Full-control member cannot leave either.
  */
  const leave = async (
    res: Response,
    folderId: string,
    actorId: string,
    access: FolderAccess,
  ): Promise<void> => {
    const db = database(res)
    if (db === null) return
    if (access.isDefault) {
      sendError(
        res,
        409,
        'conflict',
        'The default folder cannot be left.',
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
      sendError(
        res,
        409,
        'conflict',
        'Transfer ownership before leaving. Choose a member who has Full control.',
      )
      return
    }
    if (await lastCustodian(db, folderId, actorId)) {
      sendError(res, 409, 'conflict', STRANDED)
      return
    }
    await removeMembership(db, (await projectOf(db, folderId)) ?? folderId, actorId, {
      transferOwnership: false,
      actorId,
    })
    res.status(204).end()
  }

  router.get('/folders', requireSession, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    const query = getFoldersQuery.safeParse(req.query)
    if (!query.success) {
      sendError(res, 422, 'validation_failed', 'tabs: must be 1')
      return
    }
    const folders = await listFolders(db, viewer(req))
    res.status(200).json(query.data.tabs === '1' ? folders : withoutProjectTabs(folders))
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
      /* A sub-page: createSubPageIn gates the body id itself (404 non-member or
         trashed parent, 403 below Can edit) and copies the parent's members. */
      if (parsed.parent_folder_id !== undefined && parsed.parent_folder_id !== null) {
        const sub = await createSubPageIn(db, viewer(req), parsed.parent_folder_id, {
          name: parsed.name,
          description: parsed.description ?? null,
          kind: parsed.kind ?? 'doc',
        })
        switch (sub.kind) {
          case 'created':
            res.status(201).json(await folderView(db, viewer(req), sub.id))
            return
          case 'parent_not_found':
            sendError(res, 404, 'not_found', 'Not found.')
            return
          case 'forbidden':
            sendError(res, 403, 'forbidden', sub.reason)
            return
          case 'default_parent':
            sendError(res, 422, 'validation_failed', 'parent_folder_id: your personal folder cannot hold sub-pages.')
            return
          case 'discussion_parent':
            sendError(res, 422, 'validation_failed', 'parent_folder_id: a Discussion page holds threads, not pages.')
            return
          case 'too_deep':
            sendError(res, 422, 'validation_failed', 'parent_folder_id: pages can nest at most 20 deep.')
            return
          case 'folder_cap':
            sendError(
              res,
              422,
              'validation_failed',
              'You already have 200 custom folders, the most an account can hold.',
            )
            return
        }
      }
      /* Absent `kind` means a Work project; null leaves it unpicked. */
      const result = await createFolder(
        db,
        viewer(req),
        parsed.name,
        parsed.description ?? null,
        parsed.kind === undefined ? 'work' : parsed.kind,
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
      const facts = await accessOf(db, viewer(req), folderId)
      const folder = await folderView(db, viewer(req), folderId)
      if (folder === null || facts === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      // Pending invites are Full control's only; others get [] so "hidden" and
      // "none" have one shape. Members and their Access are visible to all.
      res.status(200).json({
        ...folder,
        ancestors: (await visibleAncestors(db, viewer(req), [folderId])).get(folderId) ?? [],
        section_progress: await sectionProgressOf(db, folderId),
        members: await membersOf(db, folderId),
        pending_invites: mayPerform(facts, 'invite.view').allowed
          ? await pendingInvitesOf(db, folderId)
          : [],
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
      const access = await gate(req, res, folderId, 'folder.profile.edit')
      if (access === null) return
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
      /* Trash is Full control's, not the owner's (#228). */
      const access = await gate(req, res, folderId, 'folder.trash')
      if (access === null) return
      if (access.isDefault) {
        sendError(
          res,
          409,
          'conflict',
          'The default folder cannot be deleted.',
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

  router.patch(
    '/folders/:id/location',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      /* Path id gate first. moveFolder checks the body ids (parent_folder_id,
         after_id) inside its transaction; the ac-397 sweep cannot see them. */
      const access = await gate(req, res, folderId, 'folder.page.edit')
      if (access === null) return
      const parsed = parseBody(patchFolderLocationBody, req, res, securityLog)
      if (parsed === null) return
      const outcome = await inTransaction(db, (tx) =>
        moveFolder(tx, viewer(req), folderId, parsed.parent_folder_id, parsed.after_id),
      )
      switch (outcome.kind) {
        case 'moved':
          res.status(200).json(await folderView(db, viewer(req), folderId))
          return
        case 'not_found':
          sendError(res, 404, 'not_found', 'Not found.')
          return
        case 'forbidden':
          sendError(res, 403, 'forbidden', outcome.reason)
          return
        case 'default_folder':
          sendError(res, 422, 'validation_failed', 'parent_folder_id: your personal folder always stays at the top level.')
          return
        case 'cycle':
          sendError(res, 422, 'validation_failed', 'parent_folder_id: a page cannot go inside itself or one of its own sub-pages.')
          return
        case 'too_deep':
          sendError(res, 422, 'validation_failed', 'parent_folder_id: pages can nest at most 20 deep.')
          return
        case 'not_a_sibling':
          sendError(res, 422, 'validation_failed', 'after_id: must name a page directly inside the new parent, or a tab of the same project.')
          return
        case 'not_movable':
          // The move toast shows this sentence as it is.
          sendError(res, 422, 'validation_failed', outcome.reason)
          return
      }
    },
  )

  /* `:id` is any page of the project: its own gate first, then addTab gates the root. */
  router.post(
    '/folders/:id/tabs',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const access = await gate(req, res, folderId, 'folder.page.edit')
      if (access === null) return
      const parsed = parseBody(postFolderTabsBody, req, res, securityLog)
      if (parsed === null) return
      const outcome = await addTab(db, viewer(req), folderId, parsed.kind)
      switch (outcome.kind) {
        case 'ok':
          res.status(201).json(projectTabs(await listFolders(db, viewer(req)), outcome.projectId))
          return
        case 'not_found':
          sendError(res, 404, 'not_found', 'Not found.')
          return
        case 'forbidden':
          sendError(res, 403, 'forbidden', outcome.reason)
          return
        case 'invalid':
          sendError(res, 422, 'validation_failed', outcome.reason)
          return
        case 'conflict':
          sendError(res, 409, 'conflict', outcome.reason)
          return
      }
    },
  )

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
      const access = await gate(
        req,
        res,
        folderId,
        'personal.membership_label',
      )
      if (access === null) return
      // The viewer id scopes the UPDATE, so another member's row is unreachable.
      const projectId = await projectFor(db, res, folderId)
      if (projectId === null) return
      await setMyMembership(db, viewer(req), projectId, parsed)
      const folder = await folderView(db, viewer(req), folderId)
      res.status(200).json(folder)
    },
  )

  router.post(
    '/folders/:id/members',
    requireSession,
    retiredRoute(securityLog, 'post_folder_member'),
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
      const access = await gate(req, res, folderId, 'member.add')
      if (access === null) return
      const projectId = await projectFor(db, res, folderId)
      if (projectId === null) return
      const result = await addMember(
        db,
        actorId,
        projectId,
        parsed.user_id,
        access,
        parsed.access,
        parsed.responsibility,
      )
      switch (result.kind) {
        case 'default_folder':
          sendError(
            res,
            409,
            'conflict',
            'The default folder cannot be shared.',
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
          5.3: the share-grant email follows a successful add. The members read
          supplies both the 201 body and the actor's display name.
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
          // Inserted in this request; missing means a bug, so fail as a 500.
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
      const projectId = await projectFor(db, res, folderId)
      if (projectId === null) return
      if (!(await isMember(db, projectId, targetId))) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }

      if (targetId !== actorId) {
        /* Removal is Full control's; the owner cannot be removed, only transfer
           ownership. */
        const decision = mayPerform(access, 'member.remove')
        if (!decision.allowed) {
          sendError(res, 403, 'forbidden', decision.reason)
          return
        }
        if (await targetIsOwner(db, folderId, targetId)) {
          sendError(
            res,
            403,
            'forbidden',
            "The folder's owner cannot be removed. Ownership has to be transferred first.",
          )
          return
        }
        if (await lastCustodian(db, folderId, targetId)) {
          sendError(res, 409, 'conflict', STRANDED)
          return
        }
        await removeMembership(db, projectId, targetId, {
          transferOwnership: false,
          actorId,
        })
        res.status(204).end()
        return
      }

      await leave(res, folderId, actorId, access)
    },
  )

  // Leaving via one's own membership; the same rules as the members path.
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
      const access = await gate(req, res, folderId, 'member.leave')
      if (access === null) return
      await leave(res, folderId, actorId, access)
    },
  )

  /*
  Change one member's Access. changeMemberAccess does the checks under the
  folder's row lock; this maps its outcomes to statuses.
  */
  router.patch(
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
      const parsed = parseBody(
        patchFolderMemberAccessBody,
        req,
        res,
        securityLog,
      )
      if (parsed === null) return
      const actorId = viewer(req)
      /* A member may change their own row at any preset; the domain still
         enforces continuity. */
      if (targetId === actorId) {
        const own = await accessOf(db, actorId, folderId)
        if (own === null) {
          sendError(res, 404, 'not_found', 'Not found.')
          return
        }
        /* Never self-promotion: without this, any member could grant themselves
           Full control. An owner's way back is owner.custody_recovery. */
        if (!atLeast(own.access, parsed.access)) {
          sendError(
            res,
            403,
            'forbidden',
            'You can lower your own access, but only an administrator can raise it.',
          )
          return
        }
      } else if ((await gate(req, res, folderId, 'member.access.change')) === null) {
        return
      }
      const projectId = await projectFor(db, res, folderId)
      if (projectId === null) return
      const outcome = await changeMemberAccess(
        db,
        actorId,
        projectId,
        targetId,
        parsed.access,
        { expected: parsed.expected_access },
      )
      switch (outcome.kind) {
        case 'not_member':
          sendError(res, 404, 'not_found', 'Not found.')
          return
        case 'target_is_owner':
          sendError(
            res,
            403,
            'forbidden',
            "Only the folder's owner can change the owner's access.",
          )
          return
        case 'would_strand':
          sendError(res, 409, 'conflict', STRANDED)
          return
        case 'stale':
          // Two racing changes: the loser is told what the row holds now.
          sendError(
            res,
            409,
            'conflict',
            `This member's access is now ${outcome.actual}. Reload and try again.`,
          )
          return
        case 'unchanged':
        case 'changed': {
          const members = await membersOf(db, folderId)
          const element = members.find((m) => m.user.id === targetId)
          if (element === undefined) {
            throw new Error(
              `membership ${targetId} vanished between the write and the read`,
            )
          }
          res.status(200).json(element)
          return
        }
      }
    },
  )

  /*
  Owner custody recovery: reads no preset, so an owner who lowered their own
  Access is never locked out. Recorded as `owner_recovered_full_control`.
  */
  router.post(
    '/folders/:id/owner-recovery',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const access = await gate(req, res, folderId, 'owner.custody_recovery')
      if (access === null) return
      const projectId = await projectFor(db, res, folderId)
      if (projectId === null) return
      const outcome = await recoverOwnerFullControl(
        db,
        viewer(req),
        projectId,
      )
      if (outcome.kind === 'not_member') {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const members = await membersOf(db, folderId)
      const element = members.find((m) => m.user.id === viewer(req))
      if (element === undefined) {
        throw new Error('the owner has no membership row after recovery')
      }
      res.status(200).json(element)
    },
  )

  /* Access history, visible to every current member through the ordinary gate. */
  const history = async (
    req: Request,
    res: Response,
    folderId: string,
    memberId?: string,
  ): Promise<void> => {
    const db = database(res)
    if (db === null) return
    const access = await gate(
      req,
      res,
      folderId,
      'member.access.history.read',
    )
    if (access === null) return
    const projectId = await projectFor(db, res, folderId)
    if (projectId === null) return
    const body: GetFolderAccessHistoryResponse = {
      entries: await accessHistoryOf(db, projectId, { memberId }),
    }
    res.status(200).json(body)
  }

  router.get(
    '/folders/:id/access-history',
    requireSession,
    retiredRoute(securityLog, 'get_folder_access_history'),
    async (req: Request, res: Response) => {
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      await history(req, res, folderId)
    },
  )

  router.get(
    '/folders/:id/members/:userId/access-history',
    requireSession,
    async (req: Request, res: Response) => {
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const memberId = parsedId(res, req.params.userId)
      if (memberId === null) return
      await history(req, res, folderId, memberId)
    },
  )

  /*
  Responsibility routes. The commit does not gate here: authority can depend on
  the target's self-edit grant, which must be read under the write's lock, so
  commitResponsibility decides inside its transaction.
  */
  const memberOfPath = (
    req: Request,
    res: Response,
  ): { folderId: string; memberId: string } | null => {
    const folderId = parsedId(res, req.params.id)
    if (folderId === null) return null
    const memberId = parsedId(res, req.params.userId)
    if (memberId === null) return null
    return { folderId, memberId }
  }

  router.get(
    '/folders/:id/members/:userId/responsibility',
    requireSession,
    retiredRoute(securityLog, 'get_member_responsibility'),
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const ids = memberOfPath(req, res)
      if (ids === null) return
      const access = await gate(req, res, ids.folderId, 'responsibility.read')
      if (access === null) return
      const projectId = await projectFor(db, res, ids.folderId)
      if (projectId === null) return
      /* A former member's document is answered as empty standing, not 404, so
         "none" and "hidden" cannot be told apart. */
      const body: GetResponsibilityResponse = {
        member_id: ids.memberId,
        responsibility: await activeStandingOf(db, projectId, ids.memberId),
      }
      res.status(200).json(body)
    },
  )

  router.put(
    '/folders/:id/members/:userId/responsibility',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const ids = memberOfPath(req, res)
      if (ids === null) return
      const parsed = parseBody(putResponsibilityBody, req, res, securityLog)
      if (parsed === null) return
      const facts = await accessOf(db, viewer(req), ids.folderId)
      if (facts === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const projectId = await projectFor(db, res, ids.folderId)
      if (projectId === null) return
      const outcome = await commitResponsibility(db, { ...facts, folderId: projectId }, ids.memberId, {
        content: parsed.content,
        base_revision: parsed.base_revision,
      })
      switch (outcome.kind) {
        case 'not_member':
          sendError(res, 404, 'not_found', 'Not found.')
          return
        case 'forbidden':
          sendError(res, 403, 'forbidden', outcome.reason)
          return
        case 'stale':
          sendError(
            res,
            409,
            'conflict',
            'These Responsibilities changed while you were editing. Your draft is retained; reconcile it with the current version.',
          )
          return
        case 'unchanged':
        case 'committed': {
          const body: PutResponsibilityResponse = {
            member_id: ids.memberId,
            committed: outcome.kind === 'committed',
            responsibility: outcome.standing,
          }
          res.status(200).json(body)
          return
        }
      }
    },
  )

  router.get(
    '/folders/:id/members/:userId/responsibility/history',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const ids = memberOfPath(req, res)
      if (ids === null) return
      const access = await gate(
        req,
        res,
        ids.folderId,
        'responsibility.history.read',
      )
      if (access === null) return
      /* A former member gets 404 from the gate; being a record's subject is not
         a way back into a folder. */
      const projectId = await projectFor(db, res, ids.folderId)
      if (projectId === null) return
      const page = await responsibilityHistoryOf(db, projectId, {
        memberId: ids.memberId,
      })
      const body: GetResponsibilityHistoryResponse = {
        entries: page.entries,
        truncated: page.truncated,
      }
      res.status(200).json(body)
    },
  )

  router.put(
    '/folders/:id/members/:userId/self-edit-grant',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const ids = memberOfPath(req, res)
      if (ids === null) return
      const parsed = parseBody(putSelfEditGrantBody, req, res, securityLog)
      if (parsed === null) return
      const access = await gate(
        req,
        res,
        ids.folderId,
        'responsibility.self_edit_grant.manage',
      )
      if (access === null) return
      const projectId = await projectFor(db, res, ids.folderId)
      if (projectId === null) return
      const outcome = await setSelfEditGrant(
        db,
        viewer(req),
        projectId,
        ids.memberId,
        parsed.enabled,
      )
      switch (outcome.kind) {
        case 'not_member':
          sendError(res, 404, 'not_found', 'Not found.')
          return
        case 'target_is_owner':
          sendError(
            res,
            403,
            'forbidden',
            "The folder's owner does not need this permission, and nobody else can set it for them.",
          )
          return
        case 'unchanged':
        case 'changed':
          res.status(200).json({
            member_id: ids.memberId,
            can_edit_own_responsibilities: outcome.enabled,
            changed: outcome.kind === 'changed',
          })
          return
      }
    },
  )

  /*
  Member details, readable by every member. The `viewer_may_*` flags only decide
  whether to draw a control; the routes above check again.
  */
  router.get(
    '/folders/:id/members/:userId',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const ids = memberOfPath(req, res)
      if (ids === null) return
      const access = await gate(req, res, ids.folderId, 'folder.read')
      if (access === null) return
      const projectId = await projectFor(db, res, ids.folderId)
      if (projectId === null) return
      const details = await memberDetailsOf(db, projectId, [ids.memberId])
      const member = details.get(ids.memberId)
      if (member === undefined) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const target = {
        memberId: ids.memberId,
        selfEditGranted: member.canEditOwnResponsibilities,
      }
      const profile = await profileSectionsOf(
        db, projectId, ids.memberId, viewer(req),
        mayPerform(access, 'responsibility.manage').allowed,
      )
      const body: GetFolderMemberDetailsResponse = {
        user: member.user,
        is_owner: member.isOwner,
        joined_at: member.joinedAt,
        bio: member.bio,
        bio_content: member.bioContent,
        bio_author: member.bioAuthor,
        bio_last_editor: member.bioLastEditor,
        bio_updated_at: member.bioUpdatedAt,
        viewer_may_edit_bio:
          ids.memberId === viewer(req) || mayPerform(access, 'responsibility.manage').allowed,
        access: member.access,
        viewer_may_change_access:
          mayPerform(access, 'member.access.change').allowed && !member.isOwner,
        can_edit_own_responsibilities: member.canEditOwnResponsibilities,
        viewer_may_change_self_edit_grant:
          mayPerform(access, 'responsibility.self_edit_grant.manage').allowed &&
          !member.isOwner,
        viewer_may_edit_responsibility:
          mayPerform(access, 'responsibility.manage', target).allowed ||
          mayPerform(access, 'responsibility.edit.own', target).allowed,
        responsibility: member.responsibility,
        profile_project: profile.project,
        profile_shared: profile.shared,
        profile_file_names: profile.file_names,
        profile_may_upload_file: mayPerform(access, 'file.upload.comment').allowed,
        profile_may_upload_image: mayPerform(access, 'file.upload.page').allowed,
        assigned_open_task_count: member.assignedOpenTaskCount,
        history: {
          responsibility_path: `/folders/${ids.folderId}/members/${ids.memberId}/responsibility/history`,
          access_path: `/folders/${ids.folderId}/members/${ids.memberId}/access-history`,
        },
      }
      res.status(200).json(body)
    },
  )

  router.patch(
    '/folders/:id/members/:userId/bio',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const ids = memberOfPath(req, res)
      if (ids === null) return
      const access = await gate(req, res, ids.folderId, 'folder.read')
      if (access === null) return
      const projectId = await projectFor(db, res, ids.folderId)
      if (projectId === null) return
      if (ids.memberId !== viewer(req) && !mayPerform(access, 'responsibility.manage').allowed) {
        sendError(res, 403, 'forbidden', 'You cannot edit this teammate’s bio.')
        return
      }
      const body = parseBody(patchMemberBioBody, req, res, securityLog)
      if (body === null) return
      const bio = body.content === undefined
        ? body.bio || null
        : body.content?.runs.map((run) => run.text).join('').trim() || null
      const content = bio === null || body.content === undefined ? null : body.content
      const actorId = viewer(req)
      // The API sends milliseconds. Advance the stored time for edits in the same millisecond.
      const updated = await db.execute(sql`
        UPDATE folder_members SET bio = ${bio},
          bio_content = ${content === null ? null : JSON.stringify(content)}::jsonb,
          bio_author_id = CASE WHEN ${bio === null} THEN NULL
            WHEN bio IS NULL THEN ${actorId}::uuid ELSE bio_author_id END,
          bio_last_editor_id = CASE WHEN ${bio === null} THEN NULL ELSE ${actorId}::uuid END,
          bio_updated_at = CASE WHEN ${bio === null} THEN NULL ELSE GREATEST(
            date_trunc('milliseconds', clock_timestamp()),
            COALESCE(bio_updated_at + interval '1 millisecond', '-infinity'::timestamptz)
          ) END
        WHERE folder_id = ${projectId}::uuid AND user_id = ${ids.memberId}::uuid
          AND (${body.base_updated_at === undefined} OR date_trunc('milliseconds', bio_updated_at) IS NOT DISTINCT FROM ${body.base_updated_at ?? null}::timestamptz)
          AND (${ids.memberId === actorId} OR EXISTS (
            SELECT 1 FROM folder_members actor
             WHERE actor.folder_id = ${projectId}::uuid
               AND actor.user_id = ${actorId}::uuid
               AND actor.access = 'full_control'
          ))
        RETURNING user_id
      `)
      if (updated.rows.length === 0) {
        const present = await db.execute(sql`
          SELECT 1 FROM folder_members
           WHERE folder_id = ${projectId}::uuid AND user_id = ${ids.memberId}::uuid
        `)
        if (present.rows.length === 0) sendError(res, 404, 'not_found', 'Not found.')
        else sendError(res, 409, 'conflict', 'This overview changed. Load it again before saving.')
        return
      }
      res.status(204).end()
    },
  )

  /*
   * Two contextual composer areas. A profile never grants a separate read scope:
   * every current project member may read, but only Full control edits project
   * content and only the member edits their own shared content.
   */
  router.put(
    '/folders/:id/members/:userId/profile-content/:area',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const ids = memberOfPath(req, res)
      if (ids === null) return
      const access = await gate(req, res, ids.folderId, 'folder.read')
      if (access === null) return
      const projectId = await projectFor(db, res, ids.folderId)
      if (projectId === null) return
      const parsedArea = profileArea.safeParse(req.params.area)
      if (!parsedArea.success) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const parsed = parseBody(putProfileContentBody, req, res, securityLog)
      if (parsed === null) return
      const result = await writeProfileSection(
        db, projectId, ids.memberId, viewer(req), parsedArea.data,
        parsed.content, parsed.base_revision,
      )
      switch (result) {
        case 'not_found': sendError(res, 404, 'not_found', 'Not found.'); return
        case 'forbidden': sendError(res, 403, 'forbidden', 'You cannot edit this profile area.'); return
        case 'invalid_file': sendError(res, 422, 'validation_failed', 'A file must belong to this project and match its kind.'); return
        case 'stale': sendError(res, 409, 'conflict', 'This content has changed. Reload before saving.'); return
        case 'written': res.status(204).end(); return
      }
    },
  )

  /* Every edge with both ends in this Folder, in one read for "Save as workflow". */
  router.get(
    '/folders/:id/dependencies',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const access = await gate(req, res, folderId, 'folder.read')
      if (access === null) return
      const body: GetFolderDependenciesResponse = {
        dependencies: await readFolderDependencies(db, folderId),
      }
      res.status(200).json(body)
    },
  )

  return router
}
