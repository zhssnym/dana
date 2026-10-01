/*
The 7.6 and 7.8 surfaces: tasks and My Day membership. Handlers
validate with the shared schemas, delegate every decision that touches rows
to the domain module, and serialize; no business logic lives here.

Mounted under /api/v1 by the boot file. The router carries its own session
attachment and steps aside when another router's already ran, the folders
router's arrangement, so it composes whichever order routers mount in behind
the same 11.3 links (session, CSRF on mutations, then the handler, with rate
limiting). That block is `preamble.ts` (issue #36).

Status grammar, uniform across the surface (5.4, 7.0, 10.2): no session 401;
a task or folder that does not exist, or that the viewer is not a member of,
404, never 403, so existence never leaks; the 5.1 state conflicts and the
INV-5 unassign guard 409; limit and membership failures 422 through the
shared schemas and the domain results.

Both My Day calls answer the affected TaskDetail, as
7.8 says. The shapes carry their grounds and their names in src/shared/tasks.ts, and the
handlers below answer them.
*/
import type { Request, Response, Router } from 'express'
import { z } from 'zod'

import type { DbClient } from '../../../db/client.js'
import {
  carriesStatus,
  patchStepBody,
  patchTaskBody,
  postTaskOrderBody,
  postTaskStepsBody,
  postTasksBody,
  putTaskReminderBody,
} from '../../shared/tasks.js'
import type { TaskCard, TaskDetail } from '../../shared/tasks.js'
import { postTaskDependencyBody } from '../../shared/task-dependencies.js'
import { viewTz } from '../../shared/views.js'
import { requireCsrf, requireSession } from '../auth/index.js'
import { sendError, sendFieldValidationError, sendValidationError } from '../http/errors.js'
import { documentTransaction } from '../../shared/page-document.js'
import { TaskDocumentRefusal } from '../domain/task-document.js'
import { parseBody } from '../http/parse-body.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'
import type { ObjectStore } from '../files/store.js'
import {
  addChecklistItemShim,
  createTask,
  deleteChecklistItemShim,
  deleteTask,
  deleteTaskReminder,
  dropFromMyDay,
  patchChecklistItemShim,
  patchTask,
  pullIntoMyDay,
  putTaskReminder,
  taskDocument,
  taskView,
  transitionTask,
  writeTaskDocument,
} from '../domain/tasks.js'
import type { ChecklistShimResult, ReminderRefusal, TransitionEvent } from '../domain/tasks.js'
import {
  createTaskDependency,
  deleteTaskDependency,
  readTaskDependencies,
} from '../domain/task-dependencies.js'
import { placeTaskInOrder } from '../domain/task-order.js'
import { restoreTask } from '../domain/trash.js'
import { routerWithPreamble } from './preamble.js'

export interface TasksRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
  securityLog?: SecurityLogger
  /** #221: a move copies a file its Task shares with what stays behind. */
  fileStore?: ObjectStore
}

function notFound(res: Response): void {
  sendError(res, 404, 'not_found', 'Not found.')
}

/** 10.2's other half, and the one every Access refusal on this surface uses
 * (issue #228): the caller demonstrably sees the folder -- the domain module
 * resolved their membership before it refused -- so there is no existence
 * left for a 404 to protect, and the refusal carries the resolver's own
 * sentence about which rule it broke. */
function forbidden(res: Response, reason: string): void {
  sendError(res, 403, 'forbidden', reason)
}

/** 10.3's 422 for a rule the rows answer rather than the body: the field is
 * named the way sendValidationError names one, so a caller reads one grammar
 * whichever layer refused. */
function fieldError(res: Response, field: string, problem: string): void {
  sendError(res, 422, 'validation_failed', `${field}: ${problem}.`)
}

/** The same 422 for the two refusals 7.9 names, which the domain
 * module raises because both read a row: the field is the mode the caller
 * sent, so a client reads one grammar whether the schema or the row refused
 * it (7.9, 4.8, 10.3). */
function reminderError(res: Response, refusal: ReminderRefusal): void {
  fieldError(res, refusal.field, refusal.problem)
}

/*
7.6's transition envelope, one shape for all four endpoints: the task, the
successor a recurring completion generates, and the successor a G-SERIES
uncomplete deletes. The keys are always present so the client contract never
changes shape. Which of them a call fills is the domain
module's answer and not this function's: 5.1 puts generation on two of the
four endpoints and the guard on the other two, and a no-op fills neither.
*/
function transitionBody(
  task: TaskDetail,
  generated: TaskCard | null = null,
  deletedSuccessorId: string | null = null,
): Record<string, unknown> {
  return {
    task,
    generated_task: generated,
    deleted_successor_id: deletedSuccessorId,
  }
}

export function createTasksRouter(options: TasksRouterOptions = {}): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)
  const securityLog = options.securityLog ?? createSecurityLogger()

  // 11.10: routes that touch the database require options.dbClient and fail
  // only when called without it (the auth router's convention).
  /* ---------------------------------------------------------------- *
   * Tasks
   * ---------------------------------------------------------------- */

  router.post(
    '/tasks',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const parsed = parseBody(postTasksBody, req, res, securityLog)
      if (parsed === null) return
      const result = await createTask(db, viewer(req), parsed)
      switch (result.kind) {
        case 'folder_not_found':
          // 7.6 guards the create on membership of the named folder, and an
          // inaccessible folder reads as nonexistent (10.2).
          notFound(res)
          return
        case 'assignee_not_member':
          fieldError(
            res,
            parsed.assignee_ids === undefined ? 'assignee_id' : 'assignee_ids',
            'must be a member of the folder the task is created in',
          )
          return
        case 'section_not_here':
          fieldError(
            res,
            'section_block_id',
            'must name a section of the folder the task is created in',
          )
          return
        case 'forbidden':
          forbidden(res, result.reason)
          return
        case 'created':
          res.status(201).json(result.task)
          return
      }
    },
  )

  router.get('/tasks/:id', requireSession, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    const taskId = parsedId(res, req.params.id)
    if (taskId === null) return
    const task = await taskView(db, viewer(req), taskId)
    if (task === null) {
      notFound(res)
      return
    }
    res.status(200).json(task)
  })

  /* ---------------------------------------------------------------- *
   * The Task document (issue #221): 7.16's PageView and document
   * transaction over the Task's own blocks. Read by any member who can
   * see the Task; written under `task.edit`, the gate a `notes` PATCH has.
   * ---------------------------------------------------------------- */

  router.get('/tasks/:id/document', requireSession, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    const taskId = parsedId(res, req.params.id)
    if (taskId === null) return
    const view = await taskDocument(db, viewer(req), taskId)
    if (view === null) {
      notFound(res)
      return
    }
    res.status(200).json(view)
  })

  router.put(
    '/tasks/:id/document',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const taskId = parsedId(res, req.params.id)
      if (taskId === null) return
      const parsed = parseBody(documentTransaction, req, res, securityLog)
      if (parsed === null) return
      try {
        res.status(200).json(await writeTaskDocument(db, viewer(req), taskId, parsed))
      } catch (error) {
        if (!(error instanceof TaskDocumentRefusal)) throw error
        if (error.outcome === 'not_found') {
          notFound(res)
          return
        }
        if (error.outcome === 'forbidden') {
          forbidden(res, error.message)
          return
        }
        if (error.outcome === 'invalid') {
          sendFieldValidationError(res, [
            { field: error.field ?? 'operations', message: error.message },
          ])
          return
        }
        sendError(res, 409, 'conflict', error.message)
      }
    },
  )

  router.patch(
    '/tasks/:id',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const taskId = parsedId(res, req.params.id)
      if (taskId === null) return
      /*
      7.6: "status is not accepted here (409 if present)". It is asked before
      the schema parses, because the schema would strip the field and answer
      200 on a request 7.6 refuses, and it is asked before access resolves
      because the answer is the same for every id: a body-level refusal that
      reads no row leaks nothing about which rows exist.
      */
      if (carriesStatus(req.body)) {
        sendError(
          res,
          409,
          'conflict',
          'Status is not accepted here; use the complete, uncomplete, abandon and restore endpoints.',
        )
        return
      }
      const parsed = parseBody(patchTaskBody, req, res, securityLog)
      if (parsed === null) return
      const result = await patchTask(db, viewer(req), taskId, parsed, options.fileStore)
      switch (result.kind) {
        case 'not_found':
        case 'target_not_found':
          // 7.6 reads 404 for a target the caller is not a member of, never
          // 422, because a 422 would confirm that a folder the caller cannot
          // see exists, which is the leak 10.2 forbids.
          notFound(res)
          return
        case 'assignee_not_member':
          fieldError(
            res,
            parsed.assignee_add_id !== undefined ? 'assignee_add_id'
              : parsed.assignee_remove_id !== undefined ? 'assignee_remove_id'
                : parsed.assignee_ids === undefined ? 'assignee_id' : 'assignee_ids',
            'must be a member of the task\'s folder',
          )
          return
        case 'section_not_here':
          fieldError(
            res,
            'section_block_id',
            'must name a section of the folder the task ends in',
          )
          return
        case 'quota_exceeded':
          sendError(
            res,
            413,
            'quota_exceeded',
            "You've used your 1 GB of storage. Delete some files to add more.",
          )
          return
        case 'unassign_single_member':
          sendError(
            res,
            409,
            'conflict',
            'This folder has one member, so its tasks stay assigned to them.',
          )
          return
        case 'time_without_date':
          fieldError(res, 'due_time', 'requires a due_date')
          return
        case 'rule_without_date':
          // 7.6's dependency check on the arm only the row can answer: the
          // body-level half is in the shared schema, which refuses a rule
          // sent in the same breath as a cleared date.
          fieldError(res, 'recurrence_rule', 'requires a due_date')
          return
        case 'start_after_due':
          /* 4.5's start-before-due CHECK said as a 422 before the constraint
             speaks, the way the two above are. The domain names which of the
             pair the body sent, because that is the end the person moved, and
             the message is written from the other end so it reads the same
             either way. */
          fieldError(
            res,
            result.field,
            result.field === 'start_date'
              ? 'must not be later than due_date'
              : 'must not be earlier than start_date',
          )
          return
        case 'reminder_refused':
          // The third field of the same dependency check, and 4.8's mode rule
          // with it. A reminder sent here writes the row 7.9's PUT writes, so
          // it answers the refusals 7.9 names, in the same words.
          reminderError(res, result.refusal)
          return
        case 'forbidden':
          forbidden(res, result.reason)
          return
        case 'patched':
          res.status(200).json(result.task)
          return
      }
    },
  )

  router.delete(
    '/tasks/:id',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const taskId = parsedId(res, req.params.id)
      if (taskId === null) return
      const result = await deleteTask(db, viewer(req), taskId)
      if (result === 'not_found') {
        notFound(res)
        return
      }
      if (result !== 'deleted') {
        forbidden(res, result.reason)
        return
      }
      res.status(204).end()
    },
  )

  /* ---------------------------------------------------------------- *
   * The 5.1 transitions
   * ---------------------------------------------------------------- */

  /*
  The tz of 7.6's two generating transitions, and it is two rules rather
  than one.

  This is the present-value half, which is the half a route can answer alone:
  a value that is not an IANA identifier is 422 naming tz, always, on either
  endpoint and whatever the row holds, because 7.0 refuses a value outside
  what a parameter admits rather than narrowing it to a default. The absent
  half is the domain module's, because only the rows can say whether the
  transition would evaluate a date, and it comes back as a result rather than
  as a value missing here.

  Undefined means the parameter was not sent. viewTz is imported rather than
  restated, the 7.8 pull's reason: it carries the 11.15 sign guard that closes
  Intl's offset-identifier hole, and a second validator on this surface would
  be a second answer to one of 10.3's rows. It is wrapped in an object so the
  issue carries path ['tz'] rather than the empty path sendValidationError
  reads as a body-shaped failure.

  Uncomplete and restore never reach this: 7.6 gives them no parameter, so a
  tz sent to one of them is an unknown query parameter and 7.0 tolerates it.
  */
  const zoneOf = (req: Request, res: Response): string | null | undefined => {
    if (!('tz' in req.query)) return undefined
    const zone = z.object({ tz: viewTz }).safeParse(req.query)
    if (!zone.success) {
      sendValidationError(res, zone.error)
      return null
    }
    return zone.data.tz
  }

  /** One handler for the four endpoints, because 7.6 gives them one response
   * and 5.1 one table; the event is the only thing that differs. */
  const transition =
    (event: TransitionEvent) => async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const taskId = parsedId(res, req.params.id)
      if (taskId === null) return
      let tz: string | undefined
      if (event === 'complete' || event === 'abandon') {
        const zone = zoneOf(req, res)
        if (zone === null) return
        tz = zone
      }
      /*
      One path, two graves, disjoint by construction (7.13): a
      trashed task is invisible to the 5.1 transition below, and a visible
      task is by definition not trashed, so "restore" means the one thing
      the row's state admits. The un-trash is tried first because its
      domain is the one the transition cannot see, and a miss costs one
      indexed read.
      */
      if (event === 'restore') {
        const untrashed = await restoreTask(db, viewer(req), taskId)
        if (untrashed === 'restored') {
          const returned = await taskView(db, viewer(req), taskId)
          if (returned === null) {
            notFound(res)
            return
          }
          res.status(200).json(transitionBody(returned))
          return
        }
        /* The un-trash refused on Access rather than on the row's state, so
           the fall-through below must not happen: this task *is* trashed, the
           5.1 transition cannot see it, and letting it through would turn a
           403 the caller earned into a 404 about a row they can see in Trash
           (issue #228). */
        if (untrashed !== 'not_found') {
          forbidden(res, untrashed.reason)
          return
        }
      }
      const result = await transitionTask(db, viewer(req), taskId, event, tz)
      switch (result.kind) {
        case 'not_found':
          notFound(res)
          return
        case 'conflict':
          sendError(res, 409, 'conflict', result.message)
          return
        case 'tz_required':
          // 7.6: the transition would run generation and no zone was
          // named, so nothing happened and the same call retried with one
          // gets the transition it asked for.
          fieldError(
            res,
            'tz',
            'must be supplied, as an IANA timezone identifier, on a repeating task',
          )
          return
        case 'forbidden':
          forbidden(res, result.reason)
          return
        case 'noop':
          res.status(200).json(transitionBody(result.task))
          return
        case 'transitioned':
          securityLog.taskStatusEvent({
            taskId: result.task.id,
            actorId: viewer(req),
            status: result.task.status,
          })
          res
            .status(200)
            .json(
              transitionBody(
                result.task,
                result.generatedTask,
                result.deletedSuccessorId,
              ),
            )
          return
      }
    }

  for (const event of [
    'complete',
    'uncomplete',
    'abandon',
    'restore',
  ] as const) {
    router.post(
      `/tasks/:id/${event}`,
      requireSession,
      requireCsrf,
      mutationLimit,
      transition(event),
    )
  }

  /* ---------------------------------------------------------------- *
   * 7.6's order endpoint
   * ---------------------------------------------------------------- */

  router.post(
    '/tasks/:id/order',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const taskId = parsedId(res, req.params.id)
      if (taskId === null) return
      const parsed = parseBody(postTaskOrderBody, req, res, securityLog)
      if (parsed === null) return
      const outcome = await placeTaskInOrder(db, viewer(req), taskId, {
        afterId: parsed.after_id,
        beforeId: parsed.before_id,
      })
      switch (outcome.kind) {
        case 'not_found':
          notFound(res)
          return
        case 'not_arrangeable':
          // A hand order is the unscheduled list's alone: a dated row is
          // ordered by its date and a completed one by when it was
          // finished, which is a state conflict rather than a bad request.
          sendError(
            res,
            409,
            'conflict',
            'Only an undated, unfinished task carries a hand order.',
          )
          return
        case 'bad_neighbour':
          fieldError(
            res,
            outcome.field,
            'must name another task in the same unscheduled list',
          )
          return
        case 'forbidden':
          forbidden(res, outcome.reason)
          return
        case 'placed':
          res.status(200).json(outcome.task)
          return
      }
    },
  )

  /* ---------------------------------------------------------------- *
   * Task dependencies (M1-C2, issue #224)
   * ---------------------------------------------------------------- */

  /*
  Three endpoints around one directed relation: the task in the path is the
  **dependent**, and the task in the body is what it waits on. "Blocks…" is
  the same contract with source and target reversed — to make A block B, the
  client posts to B naming A — which is why there is no second surface for it
  and no second row in the table.

  **They are not on the TaskDetail and deliberately not.** 7.0 enumerates
  that object's keys exactly, so a dependency projection folded into it would
  be a contract change rather than an addition beside one. A task's relations are their own
  read, which is also what lets a row-level client ask for them only where it
  draws them.

  The status grammar is this router's throughout: an inaccessible end of
  either kind is 404 and never 403 (10.2), a refusal the rows answer rather
  than the body is 422 naming the field (10.3), and the domain module makes
  every one of those decisions.
  */

  router.get(
    '/tasks/:id/dependencies',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const taskId = parsedId(res, req.params.id)
      if (taskId === null) return
      const found = await readTaskDependencies(db, viewer(req), taskId)
      if (found === null) {
        notFound(res)
        return
      }
      res.status(200).json(found)
    },
  )

  router.post(
    '/tasks/:id/dependencies',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const taskId = parsedId(res, req.params.id)
      if (taskId === null) return
      const parsed = parseBody(postTaskDependencyBody, req, res, securityLog)
      if (parsed === null) return
      const result = await createTaskDependency(
        db,
        viewer(req),
        taskId,
        parsed.blocking_task_id,
      )
      switch (result.kind) {
        case 'not_found':
          // Either end. One answer for both, so the refusal says nothing
          // about which of the two ids the caller was not allowed to name.
          notFound(res)
          return
        case 'self_dependency':
          fieldError(
            res,
            'blocking_task_id',
            'must name another task, because a task cannot wait on itself',
          )
          return
        case 'cycle':
          fieldError(
            res,
            'blocking_task_id',
            'must not already depend on this task, directly or through others',
          )
          return
        case 'exists':
          // The pair was already related, so nothing was created and the
          // request asked for a state that already held. 200 with the edge
          // that is there, which is what makes a retry safe.
          res.status(200).json(result.edge)
          return
        case 'forbidden':
          forbidden(res, result.reason)
          return
        case 'created':
          res.status(201).json(result.edge)
          return
      }
    },
  )

  router.delete(
    '/tasks/:id/dependencies/:dependencyId',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const taskId = parsedId(res, req.params.id)
      if (taskId === null) return
      const dependencyId = parsedId(res, req.params.dependencyId)
      if (dependencyId === null) return
      // 404 for an edge that is not there, which is this repository's normal
      // delete semantics (DELETE /connections/:userId, DELETE /tasks/:id)
      // rather than an idempotent 204: a caller naming an edge that does not
      // touch this task has asked for something that was never true.
      const result = await deleteTaskDependency(
        db,
        viewer(req),
        taskId,
        dependencyId,
      )
      if (result === 'not_found') {
        notFound(res)
        return
      }
      if (result !== 'deleted') {
        forbidden(res, result.reason)
        return
      }
      res.status(204).end()
    },
  )

  /* ---------------------------------------------------------------- *
   * 7.7 steps: shims over the body's checklist items for old clients,
   * until the contract release (domain/tasks.ts says why)
   * ---------------------------------------------------------------- */

  function answerShim(res: Response, result: ChecklistShimResult, status: number): void {
    switch (result.kind) {
      case 'not_found':
        notFound(res)
        return
      case 'forbidden':
        forbidden(res, result.reason)
        return
      case 'cap':
        fieldError(res, 'steps', 'a task holds at most 500 blocks')
        return
      case 'ok':
        if (status === 204) res.status(204).end()
        else res.status(status).json(result.task)
    }
  }

  router.post(
    '/tasks/:id/steps',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const taskId = parsedId(res, req.params.id)
      if (taskId === null) return
      const parsed = parseBody(postTaskStepsBody, req, res, securityLog)
      if (parsed === null) return
      answerShim(res, await addChecklistItemShim(db, viewer(req), taskId, parsed.title), 201)
    },
  )

  router.patch(
    '/steps/:id',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const itemId = parsedId(res, req.params.id)
      if (itemId === null) return
      const parsed = parseBody(patchStepBody, req, res, securityLog)
      if (parsed === null) return
      answerShim(res, await patchChecklistItemShim(db, viewer(req), itemId, parsed), 200)
    },
  )

  router.delete(
    '/steps/:id',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const itemId = parsedId(res, req.params.id)
      if (itemId === null) return
      answerShim(res, await deleteChecklistItemShim(db, viewer(req), itemId), 204)
    },
  )

  /* ---------------------------------------------------------------- *
   * 7.8 My Day membership
   * ---------------------------------------------------------------- */

  router.post(
    '/tasks/:id/my-day',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const taskId = parsedId(res, req.params.id)
      if (taskId === null) return
      /*
      7.8's tz: an absent or invalid one is
      422 naming the field, the treatment 7.0 gives the parameter on every
      view endpoint. viewTz is imported rather than restated for that reason,
      and wrapped in an object here so the issue carries path ['tz']: a bare
      viewTz.safeParse would raise an issue with an empty path, which
      sendValidationError drops, and the caller would read "A JSON object
      body is required." on a query-parameter failure.
      */
      const zone = z.object({ tz: viewTz }).safeParse(req.query)
      if (!zone.success) {
        sendValidationError(res, zone.error)
        return
      }
      const result = await pullIntoMyDay(db, viewer(req), taskId, zone.data.tz)
      if (result.kind === 'not_found') {
        notFound(res)
        return
      }
      // 200 rather than 201: 7.8 makes the pull an insert-or-nothing, and a
      // repeat is a no-op answering the same status as the first call.
      res.status(200).json(result.task)
    },
  )

  router.delete(
    '/tasks/:id/my-day',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const taskId = parsedId(res, req.params.id)
      if (taskId === null) return
      const result = await dropFromMyDay(db, viewer(req), taskId)
      if (result.kind === 'not_found') {
        notFound(res)
        return
      }
      // 200 and not 204, which 7.8 states outright, and idempotent: an
      // absent entry is nothing to remove rather than a missing resource.
      res.status(200).json(result.task)
    },
  )

  /* ---------------------------------------------------------------- *
   * 7.9 Reminder
   * ---------------------------------------------------------------- */

  /*
  The two endpoints 7.9 names, on the router the rest of the task
  surface already lives on: the row they address is 4.8's, keyed by the task
  in the path, and every guard on it is a fact about that task.

  The body is parsed before the task is resolved, the ordering 7.6's status
  refusal and 7.4 use: a
  refusal that reads no row tells a prober nothing about which rows exist.
  What the schema answers here is 4.8's exclusive-or and 10.3's offset range,
  properties of the value sent; the two refusals 7.9 names by name both read
  the task's own columns and are the domain module's, which is why they arrive
  as a result rather than as a parse failure.
  */
  router.put(
    '/tasks/:id/reminder',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const taskId = parsedId(res, req.params.id)
      if (taskId === null) return
      const parsed = parseBody(putTaskReminderBody, req, res, securityLog)
      if (parsed === null) return
      const result = await putTaskReminder(db, viewer(req), taskId, parsed)
      switch (result.kind) {
        case 'not_found':
          notFound(res)
          return
        case 'refused':
          reminderError(res, result.refusal)
          return
        case 'forbidden':
          forbidden(res, result.reason)
          return
        case 'written':
          // 200 with the affected TaskDetail: 7.0 gives the
          // reminder no object of its own and this section offers no GET for
          // one, so the parent task is the only object that reports the call.
          res.status(200).json(result.task)
          return
      }
    },
  )

  router.delete(
    '/tasks/:id/reminder',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const taskId = parsedId(res, req.params.id)
      if (taskId === null) return
      const result = await deleteTaskReminder(db, viewer(req), taskId)
      if (result === 'not_found') {
        notFound(res)
        return
      }
      if (result !== 'deleted') {
        forbidden(res, result.reason)
        return
      }
      // 7.9's own 204, and idempotent: the 404 above is the task's, never the
      // reminder's, so a second call and a task that never had one both land
      // here.
      res.status(204).end()
    },
  )

  return router
}
