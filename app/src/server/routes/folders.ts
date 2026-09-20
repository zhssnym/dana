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

import type { Db, DbClient } from '../../../db/client.js'
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
  changeMemberAccess,
  createFolder,
  deleteFolder,
  folderView,
  isMember,
  listFolders,
  membersOf,
  otherMemberCount,
  pendingInvitesOf,
  patchFolderProfile,
  recoverOwnerFullControl,
  removeMembership,
  setMyMembership,
} from '../domain/folders.js'
import {
  accessHistoryOf,
  atLeast,
  mayPerform,
  otherFullControlCount,
} from '../domain/folder-access.js'
import type { FolderAccess } from '../domain/folders.js'
import type { FolderAction } from '../domain/folder-access.js'
import {
  patchFolderMemberAccessBody,
} from '../../shared/folder-access.js'
import type { GetFolderAccessHistoryResponse } from '../../shared/folder-access.js'
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

  /*
  The gate every folder-scoped handler in this file begins with (issue #228).

  It is two steps rather than one and the order is 10.2's: resolve the folder
  first, which answers 404 to anybody outside it and so never confirms that
  the folder exists; then ask the resolver whether the *action* is permitted,
  which answers 403 to somebody who demonstrably sees the folder already.
  Handing back the facts rather than a boolean is what lets the handler go on
  to use the preset, the owner flag and the folder's name without a second
  read.

  Nothing here decides anything. The whole answer is `mayPerform`'s, and this
  is the two lines of plumbing that carry it to a status code.
  */
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

  /* ---------------------------------------------------------------- *
   * Leaving, and the two rules that now stand in front of it
   * ---------------------------------------------------------------- */

  const STRANDED =
    'This folder would be left with nobody in Full control. Give another member Full control first.'

  /** Whether `targetId` is the structural owner of `folderId`. */
  const targetIsOwner = async (
    db: Db,
    folderId: string,
    targetId: string,
  ): Promise<boolean> => {
    const target = await accessOf(db, targetId, folderId)
    return target !== null && target.isOwner
  }

  /** Whether removing or releasing `userId` would leave no Full control
   * behind. Reads the target's own facts rather than the actor's, because the
   * invariant is about the standing being given up. */
  const lastCustodian = async (
    db: Db,
    folderId: string,
    userId: string,
  ): Promise<boolean> => {
    const held = await accessOf(db, userId, folderId)
    if (held === null || held.access !== 'full_control') return false
    return (await otherFullControlCount(db, folderId, userId)) === 0
  }

  /*
  The leave, shared by `DELETE /folders/:id/members/:userId` addressed at
  oneself and by `DELETE /folders/:id/my-membership`.

  **Automatic "earliest remaining member" succession is gone for an ordinary
  voluntary leave**, which is R6 section 2 and the single largest behaviour
  change in issue #228. Joining a folder first is not evidence that anybody
  intended you to hold custody of it, and the old rule handed custody on that
  evidence every time an owner walked away. An owner now transfers ownership
  explicitly, to an active member who currently holds Full control, and only
  then may leave; where no such member exists they must make one, or delete
  the folder.

  The continuity invariant is checked for every leaver, owner or not: the last
  active human Full-control member cannot walk out either.

  `transferOwnership: false` on every path through here is therefore not an
  omission. `domain/folders.ts`'s automatic transfer survives for one caller
  only -- 8.10's account-deletion transaction -- and R6 section 3 keeps that
  as a distinct audited recovery path rather than as ordinary succession,
  with `DELETE /me` refusing ahead of it so the ordinary road never reaches
  it.
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
      sendError(
        res,
        409,
        'conflict',
        'Transfer ownership before leaving. Choose a member who has Full control (R6).',
      )
      return
    }
    if (await lastCustodian(db, folderId, actorId)) {
      sendError(res, 409, 'conflict', STRANDED)
      return
    }
    await removeMembership(db, folderId, actorId, {
      transferOwnership: false,
      actorId,
    })
    res.status(204).end()
  }

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
      const facts = await accessOf(db, viewer(req), folderId)
      const folder = await folderView(db, viewer(req), folderId)
      if (folder === null || facts === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      // 7.4: Folder plus members plus pending invites, one object. The
      // pending-invites key name is the other half of the routed shape
      // question; pending_invites is the candidate, precise about which
      // invites 7.4 lists.
      //
      // The invites are Full control's alone since issue #228: R7 section B
      // and #228 both classify a pending invite's email and intended Access
      // as member administration rather than ordinary Work. Everyone else
      // gets the empty array rather than a missing key, so that "not yours to
      // see" and "there are none" stay one shape on the wire; the members
      // array, with each member's current Access, stays visible to every
      // member under R9 section 13.
      res.status(200).json({
        ...folder,
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
      /*
      **The DES-225 split is gone, and this is the decision that moved.**
      It used to read: the name is the owner's, the rest of the 4.3 identity
      is any member's. #209 R7 section C revises both halves in one sentence
      -- a Folder's identity is ordinary shared Work, so Can edit and above
      change all of it, and Can contribute and below change none of it. The
      old rule let a Can-view member repaint a folder they may not otherwise
      touch, and refused the rename to a Full-control administrator who was
      not the owner, which is precisely the ownership-as-authority proxy
      #209 exists to remove.

      AC-011 and AC-012 pin the superseded split and are named in the pull
      request as criteria whose decision moved.
      */
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
      /* R7 section N: moving a Folder to Trash is recoverable administrative
         deletion and belongs to Full control, not to custody. The owner who
         lowered their own Access no longer reaches it here; what they keep is
         `folder.restore` and the permanent destruction below, which are the
         two custody acts. AC-015 pins the superseded owner-only rule. */
      const access = await gate(req, res, folderId, 'folder.trash')
      if (access === null) return
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
      /* `personal.membership_label` rather than an ungated read: R7 section A
         puts a member's own label and colour for a Folder outside Folder
         Access, so every preset down to Can view may set it, and the action
         is *named* so that the audit in #228 is total rather than silent
         about it. */
      const access = await gate(
        req,
        res,
        folderId,
        'personal.membership_label',
      )
      if (access === null) return
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
      /* R7 section L: only Full control administers member standing. Before
         issue #228 any member could add any other, which is the widest of the
         membership-only write paths R8A closes. */
      const access = await gate(req, res, folderId, 'member.add')
      if (access === null) return
      const result = await addMember(
        db,
        actorId,
        folderId,
        parsed.user_id,
        access,
        parsed.access,
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
        /* R7 section L: removal is Full control's rather than the owner's.
           The same line refuses removing the structural owner outright: the
           owner leaves by transferring custody first, and nobody administers
           them out of it. AC-397's member row pins the 403 either way. */
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
            "The folder's owner cannot be removed. Ownership transfers before it is given up (R5, R6).",
          )
          return
        }
        if (await lastCustodian(db, folderId, targetId)) {
          sendError(res, 409, 'conflict', STRANDED)
          return
        }
        await removeMembership(db, folderId, targetId, {
          transferOwnership: false,
          actorId,
        })
        res.status(204).end()
        return
      }

      await leave(res, folderId, actorId, access)
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
      const access = await gate(req, res, folderId, 'member.leave')
      if (access === null) return
      await leave(res, folderId, actorId, access)
    },
  )

  /* ---------------------------------------------------------------- *
   * Access administration (issue #228, #209 R8A / R9)
   * ---------------------------------------------------------------- */

  /*
  Change one member's Access.

  Everything hard about this lives in `changeMemberAccess`, inside one
  transaction behind the folder's own row lock: the target is still a member,
  the `from` the caller believed is still true, the owner is not being
  administered by somebody else, the Folder is not left without a custodian,
  the write, and the append-only transition. This handler's whole job is the
  authority check in front of it and the mapping of six outcomes onto 7.0's
  status taxonomy.

  Hard stop 5: the path carries two ids and both are gated. `member.access.change`
  answers for the actor, and the row in `ac-397`'s table says what a stranger
  and a plain member each get.
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
      /* Self-demotion is not member administration and must not require it:
         R5 lets the owner lower their own Access, and R9 section 8 records a
         member lowering themselves as its own transition kind. A member
         acting on their own row is therefore admitted at any preset, and the
         rules that still bind them -- the continuity invariant, and the
         refusal to *raise* oneself -- are the domain's, below. */
      if (targetId === actorId) {
        const own = await accessOf(db, actorId, folderId)
        if (own === null) {
          sendError(res, 404, 'not_found', 'Not found.')
          return
        }
        /* Refusing rather than permitting: a member may lower their own
           standing and may never raise it. `atLeast(current, next)` is "what
           I hold is at least what I am asking for", so its negation is
           exactly a self-promotion. The owner's way back up is
           `owner.custody_recovery` below, a custody act with its own
           transition kind; anybody else's way back up is somebody else
           granting it. Without this line, "change my own access" would be a
           self-service promotion to Full control for every member of every
           folder in Dana. */
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
      const outcome = await changeMemberAccess(
        db,
        actorId,
        folderId,
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
            "Only the folder's owner can change the owner's access (R7 section M).",
          )
          return
        case 'would_strand':
          sendError(res, 409, 'conflict', STRANDED)
          return
        case 'stale':
          // R9 section 16: two racing changes must not both claim the same
          // `from`. The loser is told what the row actually holds now.
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
  Owner custody recovery (R5, R7 section M, R9 section 8).

  The one act on this surface that reads no preset at all. It exists so that
  an owner who lowered their ordinary Access -- which R5 explicitly permits,
  and which is the whole point of separating custody from Access -- is never
  locked out of their own Folder by the people they delegated to. The
  transition it writes is `owner_recovered_full_control` and not
  `access_changed`, because R9 section 8 requires ordinary History to show a
  recovery as a recovery rather than as an unexplained self-grant.
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
      const outcome = await recoverOwnerFullControl(
        db,
        viewer(req),
        folderId,
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

  /*
  The Access history, R9A's boundary drawn as two routes.

  #228 owns the *truth* of these records and owes two surfaces: the Folder's
  own history, and a member-specific recent view for the member panel. It
  owes no filter taxonomy, no search and no grouping -- those are the M2
  History product's under R9A, and inventing a query language here would be
  the duplication that section warns about.

  Visible to every current member (R9 section 13). A person whose membership
  ended keeps their entries in the record and loses the Folder, which is why
  these read through the ordinary gate rather than through the history table.
  */
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
    const body: GetFolderAccessHistoryResponse = {
      entries: await accessHistoryOf(db, folderId, { memberId }),
    }
    res.status(200).json(body)
  }

  router.get(
    '/folders/:id/access-history',
    requireSession,
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

  return router
}
