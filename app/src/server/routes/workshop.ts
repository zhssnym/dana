/*
The 7.16 surface (RFC 0005): pages, shelves, and the object acts. One
router because 7.16 is one section: the folder page, the shelf family with
its own page, duplicate for tasks and folders, the workflow import, and the
direct ownership transfer. Handlers validate with the shared schemas,
resolve access, delegate, and serialize.

Status grammar (7.0, 10.2): scope failures 404, never 403, except where the
viewer demonstrably sees the thing and lacks the role, which is 403 by the
DES-225 matrix (a member asking to transfer ownership); stale page evidence
409 with 5.1's copy; shape and cap failures 422 naming the field.
*/
import type { Request, Response, Router } from 'express'
import { z } from 'zod'

import type { DbClient } from '../../../db/client.js'
import { pageActionBody, putPageBody } from '../../shared/pages.js'
import type { TransferOwnershipResponse } from '../../shared/folders.js'
import { patchShelfBody, postShelvesBody } from '../../shared/shelves.js'
import type { ImportWorkflowResponse } from '../../shared/workflows.js'
import { viewTz } from '../../shared/views.js'
import {
  importWorkflowBody,
  needsImportAnchor,
} from '../../shared/workflows.js'
import { requireCsrf, requireSession } from '../auth/index.js'
import {
  duplicateFolder,
  duplicateTask,
  importWorkflow,
  transferOwnershipTo,
} from '../domain/acts.js'
import { accessOf, isEligibleSuccessor } from '../domain/folders.js'
import { mayPerform } from '../domain/folder-access.js'
import type { FolderAction } from '../domain/folder-access.js'
import { WorkflowLabelNameConflict } from '../domain/labels.js'
import { today } from '../time/today.js'
import { DocumentRefusal } from '../domain/page-document.js'
import { actOnFolderPage, pageView, putPage } from '../domain/pages.js'
import {
  createShelf,
  deleteShelf,
  duplicateShelf,
  listShelves,
  patchShelf,
  shelfView,
} from '../domain/shelves.js'
import { accessibleTask, mayActOnTask, taskView } from '../domain/tasks.js'
import type { ObjectStore } from '../files/store.js'
import {
  sendError,
  sendFieldValidationError,
} from '../http/errors.js'
import { parseBody } from '../http/parse-body.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { routerWithPreamble } from './preamble.js'

export interface WorkshopRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
  /** The S4 object store, needed since 2026-09-04: a shelf cover and a
   * duplicate both copy the picture they carry (issues #116 and #128, spec
   * 7.16). Optional beside the other two for `routes/files.ts`'s reason, and
   * guarded the same way. */
  fileStore?: ObjectStore
  securityLog?: SecurityLogger
}

/*
`?tz` for the two duplicates, on frozen 7.6's precedent of 2026-08-10, which
7.16's import already follows a few handlers below (issue #76).

Three states rather than two, which is why this answers a sentinel rather than
null: a zone that was named and is valid resolves to today(V); a zone that was
named and is not is 422 here and now, always, whether or not a date would have
been evaluated; and no zone at all is null, which the domain refuses only when
a date would in fact be re-anchored. That last decision belongs to the domain
because only it knows what dates the copy will carry, and it is the same seam
`needsImportAnchor` gives the import.

Until this date both endpoints took no zone at all and re-anchored on the
database session's `current_date`, which 8.1 forbids by name.
*/
const REFUSED = Symbol('tz refused')

const TZ_REQUIRED =
  'tz: must be supplied, as an IANA timezone identifier, when the copy carries a due date that may need re-anchoring on today'

function anchorOf(req: Request, res: Response): string | null | typeof REFUSED {
  const rawTz = req.query.tz
  if (rawTz === undefined) return null
  const zone = viewTz.safeParse(rawTz)
  if (!zone.success) {
    sendError(
      res,
      422,
      'validation_failed',
      'tz: must be a valid IANA timezone identifier',
    )
    return REFUSED
  }
  return today(zone.data)
}

export function createWorkshopRouter(
  options: WorkshopRouterOptions = {},
): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)

  /** `routes/folders.ts`'s gate, one router over (issue #228): resolve the
   * folder first so an outsider gets 10.2's 404, then ask the resolver
   * whether the act is this member's and answer 403 with its own sentence.
   * Duplicated as four lines rather than shared, because a router in this
   * directory takes its own `database`/`viewer` closures from the preamble
   * and a shared helper would have to be handed both. */
  const gate = async (
    req: Request,
    res: Response,
    folderId: string,
    action: FolderAction,
  ): Promise<boolean> => {
    const db = database(res)
    if (db === null) return false
    const facts = await accessOf(db, viewer(req), folderId)
    if (facts === null) {
      sendError(res, 404, 'not_found', 'Not found.')
      return false
    }
    const decision = mayPerform(facts, action)
    if (!decision.allowed) {
      sendError(res, 403, 'forbidden', decision.reason)
      return false
    }
    return true
  }
  const securityLog = options.securityLog ?? createSecurityLogger()

  /** `routes/files.ts`'s guard, one router over: an application constructed
   * without a store cannot copy a cover's bytes, and saying so is better than
   * storing a row whose picture was never written. */
  const storeOf = (res: Response): ObjectStore | null => {
    if (options.fileStore === undefined) {
      sendError(
        res,
        500,
        'internal_error',
        'The application was constructed without an object store.',
      )
      return null
    }
    return options.fileStore
  }

  /** 10.3's one limit that is not a 422, with section 9's copy. Written once
   * because three routes here can now spend the quota through a copy. */
  const overQuota = (res: Response): void => {
    sendError(
      res,
      413,
      'quota_exceeded',
      "You've used your 1 GB of storage. Delete some files to add more.",
    )
  }

  /* ---------------------------------------------------------------- *
   * The folder page (4.17): any member reads, any member edits (D1)
   * ---------------------------------------------------------------- */

  router.get(
    '/folders/:id/page',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      if ((await accessOf(db, viewer(req), folderId)) === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res
        .status(200)
        .json(await pageView(db, viewer(req), { folderId, shelfId: null }))
    },
  )

  router.put(
    '/folders/:id/page',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      /* #228's Can-edit list: the Folder page and composer are ordinary
         shared Work, so Can edit and above write them. The header above this block said
         "any member edits (D1)"; that was the rule before #209 and it is the
         one R8A narrows. */
      if (!(await gate(req, res, folderId, 'folder.page.edit'))) return
      const parsed = parseBody(putPageBody, req, res, securityLog)
      if (parsed === null) return
      const outcome = await putPage(
        db,
        viewer(req),
        { folderId, shelfId: null },
        parsed.blocks,
      )
      if (outcome.kind === 'not_found') {
        // Unreachable behind the accessOf above, and kept because the module
        // refuses a home the viewer cannot see rather than trusting its
        // caller (issue #35).
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      if (outcome.kind === 'file_not_here') {
        /* Issue #107: the block named a file the page cannot reach. The
           field is addressed the way a schema failure on the same block
           would address it, so a client reads one shape of 422 whichever
           validator refused it, and every offending block is named in one
           answer (10.3). A file that does not exist and one the caller
           cannot reach get this same sentence, as 7.16's cover does, because
           telling them apart is the disclosure (10.2). */
        sendFieldValidationError(
          res,
          outcome.blockIndexes.map((index) => ({
            field: `blocks.${String(index)}.file_id`,
            message: 'must name a file you can reach',
          })),
        )
        return
      }
      if (outcome.kind === 'stale') {
        // 5.1's copy for the lost half of a last-write-wins race.
        sendError(
          res,
          409,
          'conflict',
          'Someone else changed this block. Reload the page to see it.',
        )
        return
      }
      if (outcome.kind === 'forbidden') {
        /* Unreachable behind the route gate above and kept for its reason:
           the domain refuses a caller it was handed rather than trusting
           one (issue #35), and a result arm with no mapping would answer
           this 403 as an unhandled shape. */
        sendError(res, 403, 'forbidden', outcome.reason)
        return
      }
      res.status(200).json(outcome.page)
    },
  )

  router.post(
    '/folders/:id/page/actions',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      /* AC-397's explicit route gate, now carrying the Access answer too.
         A page action creates, deletes and reorders Sections and moves Tasks
         between them, which R8 keeps away from Can contribute in terms: they
         may place their own Task among *existing* Sections and may not
         rewrite the Folder's structure. `folder.section.manage` is the
         stricter of the two readings and is deliberately the one asked here,
         because this endpoint's body can carry either kind of action and
         telling them apart would put an authorization decision inside a
         batch. Said out loud in the pull request's refusals list. */
      if (!(await gate(req, res, folderId, 'folder.section.manage'))) return
      const parsed = parseBody(pageActionBody, req, res, securityLog)
      if (parsed === null) return
      const outcome = await actOnFolderPage(db, viewer(req), folderId, parsed)
      if (outcome.kind === 'not_found') {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      if (outcome.kind === 'stale') {
        sendError(
          res,
          409,
          'conflict',
          'Someone else changed this block. Reload the page to see it.',
        )
        return
      }
      if (outcome.kind === 'bad_anchor') {
        sendFieldValidationError(res, [{
          field: outcome.field,
          message: 'must name an item at this place on the folder page',
        }])
        return
      }
      if (outcome.kind === 'section_not_here') {
        sendFieldValidationError(res, [{
          field: 'section_block_id',
          message: 'must name a Section on this folder page',
        }])
        return
      }
      if (outcome.kind === 'file_not_here') {
        sendFieldValidationError(res, [{
          field: 'file_id',
          message: 'must name a file you can reach',
        }])
        return
      }
      if (outcome.kind === 'file_kind_mismatch') {
        /* #220: a block whose kind and whose file's kind disagree. It is a
           separate answer from the one above rather than folded into it,
           because the two say different things and only one of them is a
           scope failure. `file_not_here` must tell a caller nothing about a
           row they cannot reach; here they can reach it, the server has
           already said so, and what is wrong is the treatment they declared —
           so the sentence names the block kind and the kind the bytes were
           actually uploaded as, which is the only pair a caller can act on. */
        sendError(res, 422, 'validation_failed', outcome.message)
        return
      }
      if (outcome.kind === 'not_convertible') {
        sendError(res, 422, 'validation_failed', 'This page block cannot be changed that way.')
        return
      }
      if (outcome.kind === 'forbidden') {
        /* Unreachable behind the route gate above and kept for its reason:
           the domain refuses a caller it was handed rather than trusting
           one (issue #35), and a result arm with no mapping would answer
           this 403 as an unhandled shape. */
        sendError(res, 403, 'forbidden', outcome.reason)
        return
      }
      res.status(200).json(outcome.page)
    },
  )

  /* ---------------------------------------------------------------- *
   * Shelves (4.18): private by construction, every path viewer-scoped
   * ---------------------------------------------------------------- */

  router.get('/shelves', requireSession, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    res.status(200).json(await listShelves(db, viewer(req)))
  })

  router.post(
    '/shelves',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const parsed = parseBody(postShelvesBody, req, res, securityLog)
      if (parsed === null) return
      const outcome = await createShelf(db, viewer(req), parsed)
      if (outcome.kind === 'name_taken') {
        sendError(
          res,
          422,
          'validation_failed',
          'name: you already have a shelf with this name.',
        )
        return
      }
      res.status(201).json(outcome.shelf)
    },
  )

  router.get(
    '/shelves/:id',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const shelfId = parsedId(res, req.params.id)
      if (shelfId === null) return
      const shelf = await shelfView(db, viewer(req), shelfId)
      if (shelf === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(200).json(shelf)
    },
  )

  router.patch(
    '/shelves/:id',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const shelfId = parsedId(res, req.params.id)
      if (shelfId === null) return
      const parsed = parseBody(patchShelfBody, req, res, securityLog)
      if (parsed === null) return
      const store = storeOf(res)
      if (store === null) return
      const outcome = await patchShelf(
        db,
        store,
        viewer(req),
        shelfId,
        parsed,
      )
      if (outcome.kind === 'quota_exceeded') {
        overQuota(res)
        return
      }
      if (outcome.kind === 'not_found') {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      /* 422 rather than 404, matching 7.4's answer for the same field on a
         folder, because the shelf itself was found and the fault is in one
         value of the body. It leaks nothing: a file that does not exist and a
         file the caller cannot reach get this same sentence (10.2). */
      if (outcome.kind === 'cover_not_readable') {
        sendError(
          res,
          422,
          'validation_failed',
          'cover_file_id: must name a picture you can reach.',
        )
        return
      }
      if (outcome.kind === 'name_taken') {
        sendError(
          res,
          422,
          'validation_failed',
          'name: you already have a shelf with this name.',
        )
        return
      }
      res.status(200).json(outcome.shelf)
    },
  )

  router.delete(
    '/shelves/:id',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const shelfId = parsedId(res, req.params.id)
      if (shelfId === null) return
      if ((await deleteShelf(db, viewer(req), shelfId)) === 'not_found') {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(204).end()
    },
  )

  /*
  POST /shelves/:id/duplicate (7.16 as amended 2026-09-04; issues #117, #128).

  **Mounted after `/shelves/:id` and before `/shelves/:id/page`, and the order
  is not free.** Express matches in mount order and `/shelves/:id` is one
  segment, so it can never swallow this two-segment path; what would swallow
  it is a `/shelves/:id/:something` added above. The rule for this file is
  `bundle.ts`'s `/views/:id` note: literal segments below parameterised ones
  are safe, the reverse is not.

  **The gate is the domain's and it is a scope, not a check.** `duplicateShelf`
  selects `WHERE id = $1 AND user_id = $viewer`, so a shelf belonging to
  somebody else is `not_found` rather than forbidden — a shelf is private by
  construction (4.18) and 10.2 says ownership is invisible to those without
  it. There is no `accessOf` here because a shelf has no membership to
  resolve.
  */
  router.post(
    '/shelves/:id/duplicate',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const shelfId = parsedId(res, req.params.id)
      if (shelfId === null) return
      const store = storeOf(res)
      if (store === null) return
      const outcome = await duplicateShelf(db, store, viewer(req), shelfId)
      if (outcome.kind === 'not_found') {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      if (outcome.kind === 'quota_exceeded') {
        overQuota(res)
        return
      }
      if (outcome.kind === 'name_taken') {
        sendError(
          res,
          422,
          'validation_failed',
          'name: you already have a shelf with this name.',
        )
        return
      }
      res.status(201).json(outcome.shelf)
    },
  )

  router.get(
    '/shelves/:id/page',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const shelfId = parsedId(res, req.params.id)
      if (shelfId === null) return
      if ((await shelfView(db, viewer(req), shelfId)) === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res
        .status(200)
        .json(await pageView(db, viewer(req), { folderId: null, shelfId }))
    },
  )

  router.put(
    '/shelves/:id/page',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const shelfId = parsedId(res, req.params.id)
      if (shelfId === null) return
      if ((await shelfView(db, viewer(req), shelfId)) === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const parsed = parseBody(putPageBody, req, res, securityLog)
      if (parsed === null) return
      const outcome = await putPage(
        db,
        viewer(req),
        { folderId: null, shelfId },
        parsed.blocks,
      )
      if (outcome.kind === 'not_found') {
        // Unreachable behind the shelfView above, for the same reason.
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      if (outcome.kind === 'file_not_here') {
        // The shelf half of issue #107, and the clause behind it is the
        // other one: a shelf page has no folder to scope to, so the file is
        // gated by 7.15's own serving predicate. The answer is identical.
        sendFieldValidationError(
          res,
          outcome.blockIndexes.map((index) => ({
            field: `blocks.${String(index)}.file_id`,
            message: 'must name a file you can reach',
          })),
        )
        return
      }
      if (outcome.kind === 'stale') {
        sendError(
          res,
          409,
          'conflict',
          'Someone else changed this block. Reload the page to see it.',
        )
        return
      }
      if (outcome.kind === 'forbidden') {
        /* Unreachable behind the route gate above and kept for its reason:
           the domain refuses a caller it was handed rather than trusting
           one (issue #35), and a result arm with no mapping would answer
           this 403 as an unhandled shape. */
        sendError(res, 403, 'forbidden', outcome.reason)
        return
      }
      res.status(200).json(outcome.page)
    },
  )

  /* ---------------------------------------------------------------- *
   * The object acts
   * ---------------------------------------------------------------- */

  router.post(
    '/folders/:id/duplicate',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      /* #228's Can-edit list, which carries duplication: copying a whole
         shared work structure is more than ordinary read participation, so
         it is Can edit and above. The copy
         itself is the duplicator's own new Folder, of which they become owner
         and Full control -- `createFolder` sees to that -- so nothing about
         the source's Access travels with it. */
      if (!(await gate(req, res, folderId, 'folder.duplicate'))) return
      const anchor = anchorOf(req, res)
      if (anchor === REFUSED) return
      const store = storeOf(res)
      if (store === null) return
      const outcome = await duplicateFolder(
        db,
        store,
        viewer(req),
        folderId,
        anchor,
      )
      if (outcome.kind === 'quota_exceeded') {
        overQuota(res)
        return
      }
      if (outcome.kind === 'folder_cap') {
        sendError(
          res,
          422,
          'validation_failed',
          'You already have 200 custom folders, the most an account can hold.',
        )
        return
      }
      if (outcome.kind === 'tz_required') {
        sendError(res, 422, 'validation_failed', TZ_REQUIRED)
        return
      }
      res
        .status(201)
        .json({ id: outcome.id, name: outcome.name, shifted_days: outcome.shiftedDays })
    },
  )

  router.post(
    '/tasks/:id/duplicate',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const taskId = parsedId(res, req.params.id)
      if (taskId === null) return
      const source = await accessibleTask(db, viewer(req), taskId)
      if (source === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      /* #228: duplicating a Task is Can edit's. Accepted R8A would
         extend it to Can contribute "where implementation can preserve the
         accepted boundary", and this implementation cannot: `duplicateTask`
         copies the source's assignee, so a contributor could mint a second
         copy of somebody else's Task still assigned to that person, which is
         originating work *for* another member rather than for themselves.
         Refusing is the safe half of an ambiguity and is on the pull
         request's refusals list. */
      const mayCopy = mayActOnTask(source, 'task.duplicate')
      if (!mayCopy.allowed) {
        sendError(res, 403, 'forbidden', mayCopy.reason)
        return
      }
      const anchor = anchorOf(req, res)
      if (anchor === REFUSED) return
      const outcome = await duplicateTask(
        db,
        viewer(req),
        { id: source.id, folderId: source.folderId, title: source.title },
        anchor,
      )
      if (outcome.kind === 'tz_required') {
        sendError(res, 422, 'validation_failed', TZ_REQUIRED)
        return
      }
      res.status(201).json(await taskView(db, viewer(req), outcome.id))
    },
  )

  router.post(
    '/workflows/import',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const parsed = parseBody(importWorkflowBody, req, res, securityLog)
      if (parsed === null) return
      /*
      tz on frozen 7.6's own precedent of 2026-08-10 rather than on 7.0's
      view-endpoint rule: a present value that fails IANA validation is 422
      naming tz always, and an absent one is 422 exactly when a date would
      be evaluated. Since RFC 0005 change control item 44's B3, a file may
      carry a repeat or a reminder, and 4.5 and 8.6 admit neither without a
      date, so those are the files that evaluate one. Every file that
      imported before this widening still needs no zone.

      The parsing half moved into `anchorOf` at the top of this file when the
      two duplicates took the same precedent (issue #76); which requests must
      carry a zone is still this handler's own question, and `needsImportAnchor`
      is still how it answers it.
      */
      const anchor = anchorOf(req, res)
      if (anchor === REFUSED) return
      if (anchor === null && needsImportAnchor(parsed)) {
        sendError(
          res,
          422,
          'validation_failed',
          'tz: must be supplied, as an IANA timezone identifier, when a task in the file carries a repeat or a reminder',
        )
        return
      }
      const store = storeOf(res)
      if(store===null)return
      let outcome
      try { outcome = await importWorkflow(db, viewer(req), parsed, anchor, store) }
      catch(error:unknown){
        /* The one rule about a file that only the database can state: two
           Folder Label names `lower()` makes one. It reaches here as a throw
           out of a rolled-back transaction rather than as a parse failure,
           and is answered with the same 422 and the same field path a schema
           refusal of the same file would have carried, because a caller
           should not be able to tell which of the two refused them (#227
           area 4; 7.16, 10.3). */
        if(error instanceof WorkflowLabelNameConflict){
          sendFieldValidationError(res,[{field:error.field,message:error.message}])
          return
        }
        if(error instanceof DocumentRefusal){sendError(res,422,'validation_failed',error.message);return}
        throw error
      }
      if (outcome.kind === 'folder_cap') {
        sendError(
          res,
          422,
          'validation_failed',
          'folders: this file would take the account past 200 custom folders.',
        )
        return
      }
      /* Checked against the schema the client parses it with, rather
         than inlined into `res.json`, which takes `any` (#39). */
      const body: ImportWorkflowResponse = { folders: outcome.folders }
      res.status(201).json(body)
    },
  )

  router.post(
    '/folders/:id/transfer-ownership',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const parsed = parseBody(z.object({ to: z.uuid() }), req, res, securityLog)
      if (parsed === null) return
      /* Owner-only, and Full control does not confer it (R5's small custody
         set). The resolver says so as `atLeast: null, owner: 'required'`,
         which is the one rule on this surface that reads no preset at all. */
      if (!(await gate(req, res, folderId, 'folder.ownership.transfer'))) return
      const access = await accessOf(db, viewer(req), folderId)
      if (access === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      if (access.isDefault) {
        sendError(
          res,
          409,
          'conflict',
          'The default folder cannot change hands (INV-2).',
        )
        return
      }
      /*
      **Successor eligibility, which is new and is R6 section 2's whole
      point.** An owner may hand custody only to an active human member who
      currently holds Full control. Before #228 any member would do, which
      meant custody of a shared Folder could land on somebody with no
      administrative standing in it at all -- and, through the automatic
      "earliest remaining member" rule the leave path used, on somebody who
      had not been asked.

      422 rather than 403: the field the caller sent names somebody who does
      not qualify, which is a fact about the body, and it is the same 422 the
      non-member case already answered.
      */
      if (!(await isEligibleSuccessor(db, folderId, parsed.to))) {
        sendError(
          res,
          422,
          'validation_failed',
          'to: must be a member of this folder who currently has Full control.',
        )
        return
      }
      const outcome = await transferOwnershipTo(
        db,
        viewer(req),
        folderId,
        parsed.to,
      )
      if (outcome.kind === 'target_not_member') {
        sendError(
          res,
          422,
          'validation_failed',
          'to: must be a member of this folder.',
        )
        return
      }
      const body: TransferOwnershipResponse = { owner_id: outcome.ownerId }
      res.status(200).json(body)
    },
  )

  return router
}
