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
  listShelves,
  patchShelf,
  shelfView,
} from '../domain/shelves.js'
import { accessibleTask, taskView } from '../domain/tasks.js'
import {
  sendError,
  sendFieldValidationError,
  sendValidationError,
} from '../http/errors.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { routerWithPreamble } from './preamble.js'

export interface WorkshopRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
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
      const outcome = await patchShelf(db, viewer(req), shelfId, parsed.data)
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
      const anchor = anchorOf(req, res)
      if (anchor === REFUSED) return
      const outcome = await duplicateFolder(db, viewer(req), folderId, anchor)
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

      The parsing half moved into `anchorOf` at the top of this file when the
      two duplicates took the same precedent (issue #76); which requests must
      carry a zone is still this handler's own question, and `needsImportAnchor`
      is still how it answers it.
      */
      const anchor = anchorOf(req, res)
      if (anchor === REFUSED) return
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
