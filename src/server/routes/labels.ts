/*
Label routes. Unseen things are 404, never 403; a duplicate name or applying an
archived Label is 409. Task assignment is authorized inside the domain
transaction (`label.apply` depends on the current assignee). GET /labels reads
`folder_id` from the query, a gate the ac-397 sweep cannot see.
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import {
  FOLDER_LABEL_DEFINITION_CAP,
  FOLDER_PERSONAL_LABEL_CAP,
  PERSONAL_LABEL_DEFINITION_CAP,
  TASK_FOLDER_LABEL_CAP,
  TASK_PERSONAL_LABEL_CAP,
  getLabelsQuery,
  patchFolderLabelBody,
  patchPersonalLabelBody,
  postFolderLabelBody,
  postPersonalLabelBody,
} from '../../shared/labels.js'
import { requireCsrf, requireSession } from '../auth/index.js'
import { accessOf, mayPerform } from '../domain/folder-access.js'
import type { FolderAction } from '../domain/folder-access.js'
import { folderView } from '../domain/folders.js'
import {
  attachFolderLabel,
  attachTaskLabel,
  createFolderLabel,
  createPersonalLabel,
  detachFolderLabel,
  detachTaskLabel,
  listLabels,
  patchLabel,
  setLabelArchived,
} from '../domain/labels.js'
import type {
  ArchiveLabelResult,
  AttachResult,
  CreateLabelResult,
  DetachResult,
  PatchLabelResult,
} from '../domain/labels.js'
import { accessibleTask, taskView } from '../domain/tasks.js'
import { sendError } from '../http/errors.js'
import { parseBody } from '../http/parse-body.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { routerWithPreamble } from './preamble.js'

export interface LabelsRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
  securityLog?: SecurityLogger
}

function notFound(res: Response): void {
  sendError(res, 404, 'not_found', 'Not found.')
}

export function createLabelsRouter(options: LabelsRouterOptions = {}): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)
  const securityLog = options.securityLog ?? createSecurityLogger()

  /** Shared so create and rename answer a name collision the same way. */
  const sendDefinitionRefusal = (
    res: Response,
    outcome: CreateLabelResult | PatchLabelResult | ArchiveLabelResult,
    cap: number,
    collection: string,
  ): void => {
    switch (outcome.kind) {
      case 'duplicate_name':
        sendError(
          res,
          409,
          'conflict',
          `A label with that name already exists in this ${collection}. Names are compared without regard to case, and archived labels keep theirs.`,
        )
        return
      case 'definition_cap':
        sendError(
          res,
          422,
          'validation_failed',
          `labels: this ${collection} already holds ${String(cap)} labels, the most it can hold.`,
        )
        return
      case 'not_found':
        notFound(res)
        return
      default:
        return
    }
  }

  router.get('/labels', requireSession, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    /* Query, not body, so parseBody does not apply. */
    const parsed = getLabelsQuery.safeParse(req.query)
    if (!parsed.success) {
      sendError(
        res,
        422,
        'validation_failed',
        parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
      )
      return
    }
    const outcome = await listLabels(db, viewer(req), parsed.data)
    /* The query-string gate ac-397 cannot see: 404, so the Folder's existence never leaks. */
    if (outcome.kind === 'folder_not_found') {
      notFound(res)
      return
    }
    /* The cap is applied in the domain statement's LIMIT. */
    res.status(200).json({ rows: outcome.labels, truncated: outcome.truncated })
  })

  router.post(
    '/labels/personal',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const parsed = parseBody(postPersonalLabelBody, req, res, securityLog)
      if (parsed === null) return
      const outcome = await createPersonalLabel(db, viewer(req), {
        name: parsed.name,
        color: parsed.color,
        description: parsed.description ?? null,
      })
      if (outcome.kind !== 'created') {
        sendDefinitionRefusal(
          res,
          outcome,
          PERSONAL_LABEL_DEFINITION_CAP,
          'account',
        )
        return
      }
      res.status(201).json(outcome.label)
    },
  )

  /* Gated inside the statement by `owner_user_id = viewer`, so someone else's
     Label is 404. */
  router.patch(
    '/labels/personal/:labelId',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const labelId = parsedId(res, req.params.labelId)
      if (labelId === null) return
      const parsed = parseBody(patchPersonalLabelBody, req, res, securityLog)
      if (parsed === null) return
      const outcome = await patchLabel(db, viewer(req), labelId, null, parsed)
      if (outcome.kind !== 'patched') {
        sendDefinitionRefusal(
          res,
          outcome,
          PERSONAL_LABEL_DEFINITION_CAP,
          'account',
        )
        return
      }
      res.status(200).json(outcome.label)
    },
  )

  const personalArchive = (archived: boolean) =>
    async (req: Request, res: Response): Promise<void> => {
      const db = database(res)
      if (db === null) return
      const labelId = parsedId(res, req.params.labelId)
      if (labelId === null) return
      const outcome = await setLabelArchived(
        db,
        viewer(req),
        labelId,
        null,
        archived,
      )
      if (outcome.kind !== 'ok') {
        notFound(res)
        return
      }
      res.status(200).json(outcome.label)
    }

  router.post(
    '/labels/personal/:labelId/archive',
    requireSession,
    requireCsrf,
    mutationLimit,
    personalArchive(true),
  )

  router.post(
    '/labels/personal/:labelId/restore',
    requireSession,
    requireCsrf,
    mutationLimit,
    personalArchive(false),
  )

  /* Folder definitions: Can edit and above, no owner exception (#274). */

  /** Resolve the Folder (404 to outsiders), then ask mayPerform (403). Returns the id or null. */
  const gate = async (
    req: Request,
    res: Response,
    action: FolderAction,
  ): Promise<string | null> => {
    const db = database(res)
    if (db === null) return null
    const folderId = parsedId(res, req.params.folderId)
    if (folderId === null) return null
    const facts = await accessOf(db, viewer(req), folderId)
    if (facts === null) {
      notFound(res)
      return null
    }
    const decision = mayPerform(facts, action)
    if (!decision.allowed) {
      sendError(res, 403, 'forbidden', decision.reason)
      return null
    }
    return folderId
  }

  router.post(
    '/folders/:folderId/labels',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = await gate(req, res, 'label.vocabulary.manage')
      if (folderId === null) return
      const parsed = parseBody(postFolderLabelBody, req, res, securityLog)
      if (parsed === null) return
      const outcome = await createFolderLabel(db, folderId, {
        name: parsed.name,
        color: parsed.color,
        description: parsed.description ?? null,
      })
      if (outcome.kind !== 'created') {
        sendDefinitionRefusal(
          res,
          outcome,
          FOLDER_LABEL_DEFINITION_CAP,
          'folder',
        )
        return
      }
      res.status(201).json(outcome.label)
    },
  )

  router.patch(
    '/folders/:folderId/labels/:labelId',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = await gate(req, res, 'label.vocabulary.manage')
      if (folderId === null) return
      const labelId = parsedId(res, req.params.labelId)
      if (labelId === null) return
      const parsed = parseBody(patchFolderLabelBody, req, res, securityLog)
      if (parsed === null) return
      /* The path Folder is in the predicate, so another Folder's Label is 404. */
      const outcome = await patchLabel(
        db,
        viewer(req),
        labelId,
        folderId,
        parsed,
      )
      if (outcome.kind !== 'patched') {
        sendDefinitionRefusal(
          res,
          outcome,
          FOLDER_LABEL_DEFINITION_CAP,
          'folder',
        )
        return
      }
      res.status(200).json(outcome.label)
    },
  )

  const folderArchive = (archived: boolean) =>
    async (req: Request, res: Response): Promise<void> => {
      const db = database(res)
      if (db === null) return
      const folderId = await gate(req, res, 'label.vocabulary.manage')
      if (folderId === null) return
      const labelId = parsedId(res, req.params.labelId)
      if (labelId === null) return
      const outcome = await setLabelArchived(
        db,
        viewer(req),
        labelId,
        folderId,
        archived,
      )
      if (outcome.kind !== 'ok') {
        notFound(res)
        return
      }
      res.status(200).json(outcome.label)
    }

  router.post(
    '/folders/:folderId/labels/:labelId/archive',
    requireSession,
    requireCsrf,
    mutationLimit,
    folderArchive(true),
  )

  router.post(
    '/folders/:folderId/labels/:labelId/restore',
    requireSession,
    requireCsrf,
    mutationLimit,
    folderArchive(false),
  )

  /* Per-Label PUT and DELETE, not a full-set PATCH, so two members labelling at
     once cannot erase each other's assignments. */

  const sendAttachRefusal = (
    res: Response,
    outcome: AttachResult | DetachResult,
    cap: number,
    what: string,
  ): void => {
    switch (outcome.kind) {
      case 'not_found':
        notFound(res)
        return
      case 'forbidden':
        /* The caller sees the Task and Label, so 403 is safe; the reason is the rule's `why`. */
        sendError(res, 403, 'forbidden', outcome.reason)
        return
      case 'wrong_target':
        sendError(
          res,
          422,
          'validation_failed',
          `label_id: ${what}`,
        )
        return
      case 'archived':
        sendError(
          res,
          409,
          'conflict',
          'That label is archived and cannot be newly applied. Restore it first.',
        )
        return
      case 'assignment_cap':
        sendError(
          res,
          422,
          'validation_failed',
          `labels: this item already carries ${String(cap)} labels of that kind, the most it can carry.`,
        )
        return
      default:
        return
    }
  }

  router.put(
    '/tasks/:taskId/labels/:labelId',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const taskId = parsedId(res, req.params.taskId)
      if (taskId === null) return
      const labelId = parsedId(res, req.params.labelId)
      if (labelId === null) return
      /* 404 only. Authority is decided inside attachTaskLabel's transaction,
         because `label.apply` depends on the current assignee. No test covers
         the concurrent case. */
      if ((await accessibleTask(db, viewer(req), taskId)) === null) {
        notFound(res)
        return
      }
      const outcome = await attachTaskLabel(db, viewer(req), taskId, labelId)
      if (outcome.kind !== 'attached') {
        /* The domain does not say which Task cap refused; `satisfies` keeps the
           two equal so the message is right. */
        sendAttachRefusal(
          res,
          outcome,
          TASK_PERSONAL_LABEL_CAP satisfies typeof TASK_FOLDER_LABEL_CAP,
          'must name a personal label of yours or a label of this task\'s folder.',
        )
        return
      }
      res.status(200).json(await taskView(db, viewer(req), taskId))
    },
  )

  router.delete(
    '/tasks/:taskId/labels/:labelId',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const taskId = parsedId(res, req.params.taskId)
      if (taskId === null) return
      const labelId = parsedId(res, req.params.labelId)
      if (labelId === null) return
      if ((await accessibleTask(db, viewer(req), taskId)) === null) {
        notFound(res)
        return
      }
      const outcome = await detachTaskLabel(db, viewer(req), taskId, labelId)
      if (outcome.kind === 'forbidden') {
        /* Removal is refused at the same bar as application (#274). */
        sendError(res, 403, 'forbidden', outcome.reason)
        return
      }
      if (outcome.kind !== 'detached') {
        notFound(res)
        return
      }
      res.status(200).json(await taskView(db, viewer(req), taskId))
    },
  )

  router.put(
    '/folders/:folderId/labels/:labelId',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = await gate(req, res, 'personal.label')
      if (folderId === null) return
      const labelId = parsedId(res, req.params.labelId)
      if (labelId === null) return
      const outcome = await attachFolderLabel(
        db,
        viewer(req),
        folderId,
        labelId,
      )
      if (outcome.kind !== 'attached') {
        sendAttachRefusal(
          res,
          outcome,
          FOLDER_PERSONAL_LABEL_CAP,
          'must name a personal label of yours; a folder label classifies the tasks in its folder, never the folder itself.',
        )
        return
      }
      res.status(200).json(await folderView(db, viewer(req), folderId))
    },
  )

  router.delete(
    '/folders/:folderId/labels/:labelId',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const folderId = await gate(req, res, 'personal.label')
      if (folderId === null) return
      const labelId = parsedId(res, req.params.labelId)
      if (labelId === null) return
      const outcome = await detachFolderLabel(
        db,
        viewer(req),
        folderId,
        labelId,
      )
      if (outcome.kind === 'forbidden') {
        /* Unreachable today; mapped so a future domain refusal cannot become a 404. */
        sendError(res, 403, 'forbidden', outcome.reason)
        return
      }
      if (outcome.kind !== 'detached') {
        notFound(res)
        return
      }
      res.status(200).json(await folderView(db, viewer(req), folderId))
    },
  )

  return router
}
