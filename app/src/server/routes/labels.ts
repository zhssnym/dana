/*
The M1 Label surface (issue #226, parent #208): thirteen routes across four
groups — the definition listing, Personal definition CRUD, Folder definition
CRUD, and the two idempotent assignment pairs.

Handlers validate with the shared schemas, resolve access through the domain
modules, delegate every decision that touches rows, and serialize. No business
logic lives here, which is this directory's convention.

## Why one router rather than lines in three existing ones

Three of the four groups hang off paths another router already owns —
`/folders/:folderId/...` is `routes/folders.ts`'s prefix and
`/tasks/:taskId/...` is `routes/tasks.ts`'s. They are here anyway, because
what these thirteen share is a model rather than a prefix: one table, one set
of caps, one status grammar, one set of scope rules. Splitting them across
three files by the first segment of their path would put the Folder-Label
create three hundred lines from the Folder-Label patch.

**Nothing is shadowed by that choice and it is worth saying why.** Express
gives every mounted router the whole path and each matches its own registered
routes, so a request for `/folders/:id/labels` walks past `routes/folders.ts`
— which has no route of that shape — and reaches this one. The mount in
`index.ts` sits after both, before the `/api` catch-all, and the block there
records it.

## The status grammar, and the one decision #208 left open

Uniform across all thirteen, and it is the surface's (5.4, 7.0, 10.2):

- no session, 401, which `requireSession` answers and AC-236 sweeps;
- a Label, Task or Folder the viewer cannot see, **404** and never 403, so
  existence never leaks. A foreign Personal Label is not found rather than
  forbidden, and so is a Folder Label of a Folder the caller does not belong
  to;
- a visible thing with an invalid field value, **422**, the field named;
- a cap, **422**, naming the collection that is full;
- a state conflict, **409**.

**#208 leaves the uniqueness conflict open — "a controlled 409 or a
field-addressed 422, choose one convention and pin it with tests" — and this
file chooses 409.** A name that already exists in a catalog is not a bad
value: the same string is perfectly valid in the next Folder along and in the
viewer's Personal catalog, and it will be valid here the moment the Label
holding it is renamed. What refuses it is the state of the catalog, which is
what 409 means everywhere else on this surface — `Already a member of this
folder` is the closest existing neighbour and is the same shape of fact. It is
answered identically by the create and by the rename in both scopes, which is
the consistency #208 asks for.

The other 409 on this surface is applying an archived Label, which #208 fixes
directly. Both are state conflicts and both leave the row untouched.

**The listing is capped and the body says so.** `GET /labels` answers
`{ rows, truncated }` rather than a bare array, which is 10.3's standing rule
for a list response and the shape `getPlannedResponse` already uses. Its worst
case is 500 Personal definitions plus 250 for every Folder the viewer belongs
to, so it is one of the lists that rule is about.

## The gates, including the one no sweep can see

Every route below whose **path** carries an id resolves access before it acts,
and each has a row in AC-397's table saying what a signed-in stranger gets.
That sweep is path-only, and this surface has exactly one gate outside its
reach: **`GET /labels` takes `folder_id` from the query string**, so no
structural test drives it with a stranger's id. The gate is
`listLabels`'s own membership probe, and it answers 404 rather than 403 for
the reason above.

## Folder Access, not membership, is the gate (issue #274)

Folder Labels are not private annotations: they are shared vocabulary that
drives everybody's filters and views, so a read-only member relabelling other
people's work is a write wearing a read's clothes. Membership alone is
therefore not the bar; the Access ladder is.

So each route below names the action it performs and asks
`shared/folder-actions.ts` for the answer. **Nothing in this file states a
bar**, which is the same arrangement `routes/folders.ts` has. Three shapes,
and the third is the interesting one:

- the four **vocabulary** writes ask `label.vocabulary.manage`, whose answer is
  the preset alone, so `gate` below resolves it beside its own `accessOf`;
- the two **Folder assignment** routes ask `personal.label`, which is a
  Personal Label on a Folder and therefore outside Folder Access at every
  preset (#228's personal-actions rule). They go through the same `gate` for
  uniformity and refuse nobody a membership check had not refused already;
- the two **Task assignment** routes ask nothing here. `label.apply` carries
  `whenAssignedToActor`, so its answer depends on the Task's current assignee,
  and #228 requires that fact be read in the mutation's own transaction and
  snapshot. `domain/labels.ts` takes the row lock, reads it, and answers
  `forbidden` with the rule's sentence; this file turns that into a 403.

The four Personal-vocabulary routes name no Folder and are untouched: a
Personal Label is one person's own, and account ownership rather than Folder
Access governs it.
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
import { mayPerform } from '../domain/folder-access.js'
import type { FolderAction } from '../domain/folder-access.js'
import { accessOf, folderView } from '../domain/folders.js'
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

/** 10.2's one answer for "you cannot see this", whatever the reason. */
function notFound(res: Response): void {
  sendError(res, 404, 'not_found', 'Not found.')
}

export function createLabelsRouter(options: LabelsRouterOptions = {}): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)
  const securityLog = options.securityLog ?? createSecurityLogger()

  /** The two refusals every definition write shares, so the create and the
   * rename cannot answer a name collision differently. */
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

  /* ---------------------------------------------------------------- *
   * GET /labels — every definition the viewer may read, to 10.3's cap
   * ---------------------------------------------------------------- */

  router.get('/labels', requireSession, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    /* The query rather than the body, so this is not one of `parseBody`'s
       call sites; the unknown-key rule is about a body and there is none
       here. What the schema does carry is the two defaults —
       every scope, active only — so that an empty query has one meaning
       rather than one per reader. */
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
    /* The gate AC-397 cannot see: the id is in the query string, so the
       sweep never drives this route with a stranger's Folder. 404 rather than
       403, because a 403 would confirm the Folder exists (10.2). */
    if (outcome.kind === 'folder_not_found') {
      notFound(res)
      return
    }
    /* 10.3's capped-list body, `{ rows, truncated }`, which is the spelling
       every other capped response on this API already uses. The cap is
       applied in the domain, where the LIMIT can be part of the one statement
       rather than a slice of a list already read. */
    res.status(200).json({ rows: outcome.labels, truncated: outcome.truncated })
  })

  /* ---------------------------------------------------------------- *
   * Personal definitions
   * ---------------------------------------------------------------- */

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

  /* The three routes below carry an id in the path and every one of them is
     gated by `writableLabel`'s `owner_user_id = <viewer>` inside the
     statement, so a Label belonging to somebody else is not found rather than
     refused. AC-397 drives all three. */
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

  /* ---------------------------------------------------------------- *
   * Folder definitions
   *
   * Can edit and above create, rename, recolor, describe, archive and
   * restore, with no owner exception: a Folder's shared vocabulary belongs to
   * Can edit, and custody is irrelevant to it (#274; see the header).
   * ---------------------------------------------------------------- */

  /**
   * The folder id this act names, or null after this call has answered.
   *
   * Two steps, and the order is 10.2's, exactly as `routes/folders.ts`'s own
   * `gate` has it: resolve the Folder first, which answers 404 to anybody
   * outside it and so never confirms that it exists, and then ask the
   * resolver whether the *action* is permitted, which answers 403 to somebody
   * who demonstrably sees the Folder already.
   *
   * This is the `accessOf` gate AC-397 enumerates, plus the action check.
   * Nothing here decides anything: the whole
   * answer is `mayPerform`'s.
   */
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
      /* A Label that is not this Folder's is 404: `writableLabel` puts the
         path Folder in the predicate, so a Folder-B Label patched through
         Folder A resolves to nothing at all. */
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

  /* ---------------------------------------------------------------- *
   * Assignment: Task
   *
   * Per-Label PUT and DELETE rather than a full-set PATCH, which #208 asks
   * for in those words: two members labelling the same Task at the same
   * moment must not erase each other, and a replacement body cannot carry the
   * Personal assignments of the member who did not send it without showing
   * them to the one who did.
   * ---------------------------------------------------------------- */

  /** The refusals both assignment pairs share, so a Task and a Folder answer
   * the same shape of mistake the same way. */
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
        /* Issue #274. The caller sees the Task and the Label — membership was
           resolved before this — so 10.2 permits a 403 and the sentence is the
           rule's own `why` from `shared/folder-actions.ts`, which is product
           copy a person reads rather than a comment. */
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
      /* The Task gate: `accessibleTask` writes the membership join into its
         FROM clause, so an inaccessible Task is null rather than a row this
         handler has to remember to refuse.

         It answers the 404 and nothing else. The *authority* question is
         `attachTaskLabel`'s, because `label.apply`'s answer depends on the
         Task's current assignee and #228 requires that fact to be read inside
         the mutation's own transaction — this read is outside it, so an
         assignment that changed in between would be decided against a row
         that no longer exists. No test exercises the concurrent case for
         this action, so nothing would notice the lock's loss. */
      if ((await accessibleTask(db, viewer(req), taskId)) === null) {
        notFound(res)
        return
      }
      const outcome = await attachTaskLabel(db, viewer(req), taskId, labelId)
      if (outcome.kind !== 'attached') {
        /* Both Task caps are the same number, and the domain does not report
           which of the two refused, because nothing a caller can do depends
           on knowing: either way this task carries as many labels of that
           kind as it may. The number is read from a constant rather than
           written into the sentence, so a cap that moves moves the message
           with it, and the two are asserted equal here so that a future
           change to one of them fails at the type level rather than
           producing a message about the wrong limit. */
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
        /* R8 names application and removal in one clause, so removal is
           refused at the same bar and with the same sentence (#274). */
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

  /* ---------------------------------------------------------------- *
   * Assignment: Folder, Personal Labels only
   * ---------------------------------------------------------------- */

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
        /* Unreachable today: `personal.label` admits every member and the
           gate above has already answered. It is mapped rather than folded
           into the 404 below so that a refusal added inside the domain
           cannot silently become a not-found. */
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
