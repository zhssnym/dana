/*
The 7.16 routes: folder and shelf pages, shelves, duplicate, workflow import,
and ownership transfer. Scope failures are 404, never 403, unless the viewer
can see the thing and lacks the role.
*/
import type { Request, Response, Router } from 'express'
import { z } from 'zod'
import { sql } from 'drizzle-orm'

import type { DbClient } from '../../../db/client.js'
import { pageActionBody, putPageBody } from '../../shared/pages.js'
import { rowsOf } from '../database.js'
import { documentTransaction } from '../../shared/page-document.js'
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
import { isEligibleSuccessor } from '../domain/folders.js'
import { accessOf, mayPerform, projectOf } from '../domain/folder-access.js'
import { PAGE_TREE_EDIT_ACTION } from '../domain/page-tree.js'
import { legacyFacets } from '../domain/project-tabs.js'
import type { FolderAction } from '../domain/folder-access.js'
import { WorkflowLabelNameConflict } from '../domain/labels.js'
import { today } from '../time/today.js'
import { DocumentRefusal } from '../domain/page-document.js'
import { actOnFolderPage, actOnShelfPage, pageView, putPage } from '../domain/pages.js'
import { ShelfDocumentRefusal } from '../domain/shelf-document.js'
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
import { retiredRoute } from '../observability/retired-route.js'
import { routerWithPreamble } from './preamble.js'

export interface WorkshopRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
  /** Shelf covers and duplicates copy the picture's bytes. */
  fileStore?: ObjectStore
  securityLog?: SecurityLogger
}

/*
`?tz` for the duplicates. Three states: valid resolves to today; present but
invalid is always 422; absent is null, which the domain refuses only when a
date would be re-anchored.
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

  /** Resolve the folder first (404 to outsiders), then ask mayPerform (403). */
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

  /** Without a store a cover's bytes cannot be copied; refuse rather than store a broken row. */
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

  const overQuota = (res: Response): void => {
    sendError(
      res,
      413,
      'quota_exceeded',
      "You've used your 1 GB of storage. Delete some files to add more.",
    )
  }

  // A Facet has the same document contract as Work. Its existing content
  // home may be a former tab; new Facets use the owning Page's content store.
  router.get(
    '/pages/:id/facets/:facetId/document',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const pageId = parsedId(res, req.params.id)
      const facetId = parsedId(res, req.params.facetId)
      if (pageId === null || facetId === null) return
      if ((await accessOf(db, viewer(req), pageId)) === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const found = await rowsOf(db, sql`
        SELECT pf.content_folder_id FROM page_facets pf
          JOIN folders p ON p.id = pf.page_id
         WHERE pf.page_id = ${pageId}::uuid AND pf.id = ${facetId}::uuid
           AND p.deleted_at IS NULL AND p.archived_at IS NULL
           AND (pf.content_folder_id IS NULL OR EXISTS (
             SELECT 1 FROM folders content
              WHERE content.id = pf.content_folder_id
                AND content.deleted_at IS NULL AND content.archived_at IS NULL
           ))`)
      if (found.length === 0) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const contentId = found[0]?.content_folder_id == null
        ? pageId : String(found[0].content_folder_id)
      res.status(200).json(await pageView(db, viewer(req), {
        folderId: contentId, shelfId: null, facetId,
      }))
    },
  )

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

  /* Retired facet reads, served from tab rows so old installed bundles still
     work. Remove with their ac-397 rows at the contract migration. */
  router.get(
    '/folders/:id/facets',
    requireSession,
    retiredRoute(securityLog, 'get_folder_facets'),
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      if ((await accessOf(db, viewer(req), folderId)) === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(200).json({ facets: await legacyFacets(db, folderId) })
    },
  )

  router.get(
    '/folders/:id/facets/:facetId/page',
    requireSession,
    retiredRoute(securityLog, 'get_folder_facet_page'),
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const tabId = parsedId(res, req.params.facetId)
      if (tabId === null) return
      // The facet is a tab now: gate on the tab and require it to be in `:id`'s project.
      if (
        (await accessOf(db, viewer(req), folderId)) === null ||
        (await accessOf(db, viewer(req), tabId)) === null ||
        (await projectOf(db, tabId)) !== folderId
      ) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res
        .status(200)
        .json(await pageView(db, viewer(req), { folderId: tabId, shelfId: null }))
    },
  )

  router.get(
    '/facets/:id/location',
    requireSession,
    retiredRoute(securityLog, 'get_facet_location'),
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const tabId = parsedId(res, req.params.id)
      if (tabId === null) return
      if ((await accessOf(db, viewer(req), tabId)) === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const projectId = await projectOf(db, tabId)
      if (projectId === null || (await accessOf(db, viewer(req), projectId)) === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(200).json({ folder_id: projectId })
    },
  )

  router.put(
    '/folders/:id/page',
    requireSession,
    retiredRoute(securityLog, 'put_folder_page'),
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
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
        // Unreachable behind the gate; the domain still refuses on its own (#35).
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      if (outcome.kind === 'file_not_here') {
        /* Same 422 shape as a schema failure. A missing file and an unreachable
           one get the same sentence, so existence does not leak (10.2). */
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
        /* Unreachable behind the gate; mapped so the domain's own refusal is not
           an unhandled shape. */
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
      /* Asks the stricter `folder.section.manage` for every action, since the
         body can carry structural actions and splitting the batch would put an
         authorization decision inside it. */
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
        /* The caller can reach the file, so naming the kind mismatch leaks nothing. */
        sendError(res, 422, 'validation_failed', outcome.message)
        return
      }
      if (outcome.kind === 'not_convertible') {
        sendError(res, 422, 'validation_failed', 'This page block cannot be changed that way.')
        return
      }
      if (outcome.kind === 'forbidden') {
        /* Unreachable behind the gate; mapped so the domain's own refusal is not
           an unhandled shape. */
        sendError(res, 403, 'forbidden', outcome.reason)
        return
      }
      res.status(200).json(outcome.page)
    },
  )

  /* Shelves are private: every path is viewer-scoped. */

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
      /* 422: the shelf was found and one body value is wrong. Missing and
         unreachable files get the same sentence (10.2). */
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
  Keep this after `/shelves/:id` and never add a `/shelves/:id/:something`
  above it. The domain scopes by owner, so someone else's shelf is not_found.
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
    retiredRoute(securityLog, 'put_shelf_page'),
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
        // Unreachable behind the shelfView above.
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      if (outcome.kind === 'file_not_here') {
        // Shelf pages have no folder, so 7.15's serving predicate gates the file.
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
        /* Unreachable behind the gate; mapped so the domain's own refusal is not
           an unhandled shape. */
        sendError(res, 403, 'forbidden', outcome.reason)
        return
      }
      res.status(200).json(outcome.page)
    },
  )

  /* The Shelf's document transaction (same body, base_revision and 409 as the
     folder page). The owner check runs under the Shelf row lock in the domain. */
  router.post(
    '/shelves/:id/page/actions',
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
      const parsed = parseBody(documentTransaction, req, res, securityLog)
      if (parsed === null) return
      try {
        res.status(200).json(await actOnShelfPage(db, viewer(req), shelfId, parsed))
      } catch (error) {
        if (!(error instanceof ShelfDocumentRefusal)) throw error
        if (error.outcome === 'not_found') {
          sendError(res, 404, 'not_found', error.message)
          return
        }
        if (error.outcome === 'invalid') {
          sendFieldValidationError(res, [{ field: error.field, message: error.message }])
          return
        }
        sendError(res, 409, 'conflict', error.message)
      }
    },
  )

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
      /* The copy is the duplicator's own new Folder; no source Access travels. */
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
      /* Can edit only: the copy keeps the source's assignee, so a contributor
         could mint tasks assigned to someone else. */
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

  /** Both import routes; the second makes the file's folders sub-pages of `:id`. */
  const importFile = async (
    req: Request,
    res: Response,
    parentId?: string,
  ): Promise<void> => {
      const db = database(res)
      if (db === null) return
      const parsed = parseBody(importWorkflowBody, req, res, securityLog)
      if (parsed === null) return
      /*
      A present invalid tz is always 422; an absent one is 422 only when a task
      carries a repeat or a reminder, which need a date.
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
      try { outcome = await importWorkflow(db, viewer(req), parsed, anchor, store, parentId) }
      catch(error:unknown){
        /* Duplicate label names under lower(): only the database can detect it.
           Answered with the same 422 and field path a schema refusal would use. */
        if(error instanceof WorkflowLabelNameConflict){
          sendFieldValidationError(res,[{field:error.field,message:error.message}])
          return
        }
        /* Document refusals carry `folders.<n>.page` when known, so they read
           like schema failures. */
        if(error instanceof DocumentRefusal){
          if(error.field!==undefined){sendFieldValidationError(res,[{field:error.field,message:error.message}]);return}
          sendError(res,422,'validation_failed',error.message);return
        }
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
      /* The parent's gate, re-read under the tree lock inside the import. */
      if (outcome.kind === 'parent_not_found') {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      if (outcome.kind === 'forbidden') {
        sendError(res, 403, 'forbidden', outcome.reason)
        return
      }
      if (outcome.kind === 'default_parent') {
        sendError(res, 422, 'validation_failed', 'Your personal folder cannot hold sub-pages.')
        return
      }
      if (outcome.kind === 'too_deep') {
        sendError(res, 422, 'validation_failed', 'Pages can nest at most 20 deep.')
        return
      }
      /* Typed against the client's schema; `res.json` takes `any`. */
      const body: ImportWorkflowResponse = { folders: outcome.folders }
      res.status(201).json(body)
  }

  router.post(
    '/workflows/import',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      await importFile(req, res)
    },
  )

  router.post(
    '/folders/:id/import',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      /* Gate before the body is read; the import checks again under the tree lock. */
      if (!(await gate(req, res, folderId, PAGE_TREE_EDIT_ACTION))) return
      await importFile(req, res, folderId)
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
      /* Owner-only; Full control does not confer it. */
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
          'Ownership of the default folder cannot be transferred.',
        )
        return
      }
      // Ownership belongs to the project, whichever page was named.
      const projectId = await projectOf(db, folderId)
      if (projectId === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      /*
      The successor must be an active member with Full control. 422, not 403:
      the problem is the body's `to`.
      */
      if (!(await isEligibleSuccessor(db, projectId, parsed.to))) {
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
        projectId,
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
