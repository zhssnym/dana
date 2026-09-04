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
import { putPageBody } from '../../shared/pages.js'
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
import { accessOf } from '../domain/folders.js'
import { today } from '../time/today.js'
import { pageView, putPage } from '../domain/pages.js'
import {
  createShelf,
  deleteShelf,
  duplicateShelf,
  listShelves,
  patchShelf,
  shelfView,
} from '../domain/shelves.js'
import { accessibleTask, taskView } from '../domain/tasks.js'
import type { ObjectStore } from '../files/store.js'
import { sendError, sendValidationError } from '../http/errors.js'
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
}

export function createWorkshopRouter(
  options: WorkshopRouterOptions = {},
): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)

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
      if ((await accessOf(db, viewer(req), folderId)) === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const parsed = putPageBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const outcome = await putPage(
        db,
        viewer(req),
        { folderId, shelfId: null },
        parsed.data.blocks,
      )
      if (outcome.kind === 'not_found') {
        // Unreachable behind the accessOf above, and kept because the module
        // refuses a home the viewer cannot see rather than trusting its
        // caller (issue #35).
        sendError(res, 404, 'not_found', 'Not found.')
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
      const parsed = postShelvesBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const outcome = await createShelf(db, viewer(req), parsed.data)
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
      const parsed = patchShelfBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const store = storeOf(res)
      if (store === null) return
      const outcome = await patchShelf(
        db,
        store,
        viewer(req),
        shelfId,
        parsed.data,
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
      const parsed = putPageBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const outcome = await putPage(
        db,
        viewer(req),
        { folderId: null, shelfId },
        parsed.data.blocks,
      )
      if (outcome.kind === 'not_found') {
        // Unreachable behind the shelfView above, for the same reason.
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
      if ((await accessOf(db, viewer(req), folderId)) === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const store = storeOf(res)
      if (store === null) return
      const outcome = await duplicateFolder(db, store, viewer(req), folderId)
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
      const newId = await duplicateTask(db, viewer(req), {
        id: source.id,
        folderId: source.folderId,
        title: source.title,
      })
      res.status(201).json(await taskView(db, viewer(req), newId))
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
      const parsed = importWorkflowBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      /*
      tz on frozen 7.6's own precedent of 2026-08-10 rather than on 7.0's
      view-endpoint rule: a present value that fails IANA validation is 422
      naming tz always, and an absent one is 422 exactly when a date would
      be evaluated. Since RFC 0005 change control item 44's B3, a file may
      carry a repeat or a reminder, and 4.5 and 8.6 admit neither without a
      date, so those are the files that evaluate one. Every file that
      imported before this widening still needs no zone.
      */
      const rawTz = req.query.tz
      let anchor: string | null = null
      if (rawTz !== undefined) {
        const zone = viewTz.safeParse(rawTz)
        if (!zone.success) {
          sendError(
            res,
            422,
            'validation_failed',
            'tz: must be a valid IANA timezone identifier',
          )
          return
        }
        anchor = today(zone.data)
      }
      if (anchor === null && needsImportAnchor(parsed.data)) {
        sendError(
          res,
          422,
          'validation_failed',
          'tz: must be supplied, as an IANA timezone identifier, when a task in the file carries a repeat or a reminder',
        )
        return
      }
      const outcome = await importWorkflow(db, viewer(req), parsed.data, anchor)
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
      const parsed = z.object({ to: z.uuid() }).safeParse(req.body)
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
        // Visible but not permitted (DES-225): the member sees the folder,
        // so the refusal may say why.
        sendError(
          res,
          403,
          'forbidden',
          'Only the folder owner can transfer ownership.',
        )
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
      const outcome = await transferOwnershipTo(
        db,
        viewer(req),
        folderId,
        parsed.data.to,
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
