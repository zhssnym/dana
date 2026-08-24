/*
The 7.6, 7.7 and 7.8 surfaces: tasks, steps, and My Day membership. Handlers
validate with the shared schemas, delegate every decision that touches rows
to the domain module, and serialize; no business logic lives here (the API
role's route convention).

Mounted under /api/v1 by the boot file, which is the Platform engineer's; the
wiring request is recorded in README.md beside this file. The router carries
its own session attachment and steps aside when another router's already ran,
the P2 folders router's arrangement, so it composes whichever order routers
mount in behind the same 11.3 links (session, CSRF on mutations, then the
handler; rate limiting joins at P9).

Status grammar, uniform across the surface (5.4, 7.0, 10.2): no session 401;
a task or folder that does not exist, or that the viewer is not a member of,
404, never 403, so existence never leaks; the 5.1 state conflicts and the
INV-5 unassign guard 409; limit and membership failures 422 through the
shared schemas and the domain results.

The step mutations and both My Day calls answer the affected TaskDetail, which
frozen 7.7 and 7.8 now say themselves: the shape review settled it and the
owner entered it, so what was provisional when this router landed is contract.
The shapes carry their grounds and their names in src/shared/tasks.ts, and the
handlers below answer them.
*/
import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'

import type { Db, DbClient } from '../../../db/client.js'
import {
  carriesStatus,
  patchStepBody,
  patchTaskBody,
  postTaskStepsBody,
  postTasksBody,
  putTaskReminderBody,
} from '../../shared/tasks.js'
import type { TaskCard, TaskDetail } from '../../shared/tasks.js'
import { viewTz } from '../../shared/views.js'
import {
  attachSession,
  requireCsrf,
  requireSession,
  sessionOf,
} from '../auth/index.js'
import { sendError, sendValidationError } from '../http/errors.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'
import {
  addStep,
  createTask,
  deleteStep,
  deleteTask,
  deleteTaskReminder,
  dropFromMyDay,
  patchStep,
  patchTask,
  pullIntoMyDay,
  putTaskReminder,
  taskView,
  transitionTask,
} from '../domain/tasks.js'
import type { ReminderRefusal, TransitionEvent } from '../domain/tasks.js'
import { restoreTask } from '../domain/trash.js'

export interface TasksRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
  securityLog?: SecurityLogger
}

/*
A path id that is not a uuid names nothing that exists, and letting it reach
a query would surface as a cast error, a 500 wearing a taxonomy the contract
does not have. 404 is 7.0's word for nonexistent (the P2 router's rule).
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

function notFound(res: Response): void {
  sendError(res, 404, 'not_found', 'Not found.')
}

/** 10.3's 422 for a rule the rows answer rather than the body: the field is
 * named the way sendValidationError names one, so a caller reads one grammar
 * whichever layer refused. */
function fieldError(res: Response, field: string, problem: string): void {
  sendError(res, 422, 'validation_failed', `${field}: ${problem}.`)
}

/** The same 422 for the two refusals frozen 7.9 names, which the domain
 * module raises because both read a row: the field is the mode the caller
 * sent, so a client reads one grammar whether the schema or the row refused
 * it (7.9, 4.8, 10.3). */
function reminderError(res: Response, refusal: ReminderRefusal): void {
  fieldError(res, refusal.field, refusal.problem)
}

/*
7.6's transition envelope, one shape for all four endpoints: the task, the
successor a recurring completion generates, and the successor a G-SERIES
uncomplete deletes. The keys have been answered from the first transition so
the client contract never changes shape under it, and P6 is where the two
companions start carrying values. Which of them a call fills is the domain
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
  const router = Router()
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)
  const securityLog = options.securityLog ?? createSecurityLogger()

  // 11.10: routes that touch the database require options.dbClient and fail
  // only when called without it (the auth router's convention).
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
      const parsed = postTasksBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const result = await createTask(db, viewer(req), parsed.data)
      switch (result.kind) {
        case 'folder_not_found':
          // 7.6 guards the create on membership of the named folder, and an
          // inaccessible folder reads as nonexistent (10.2).
          notFound(res)
          return
        case 'assignee_not_member':
          fieldError(
            res,
            'assignee_id',
            'must be a member of the folder the task is created in',
          )
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
      const parsed = patchTaskBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const result = await patchTask(db, viewer(req), taskId, parsed.data)
      switch (result.kind) {
        case 'not_found':
        case 'target_not_found':
          // 7.6 reads 404 for a target the caller is not a member of, where
          // it once admitted 404 or 422: narrowed by owner ruling at the P3
          // shape review, because a 422 would confirm that a folder the
          // caller cannot see exists, which is the leak 10.2 forbids. This
          // line already answered the narrower of the two.
          notFound(res)
          return
        case 'assignee_not_member':
          fieldError(
            res,
            'assignee_id',
            'must be a member of the task\'s folder',
          )
          return
        case 'unassign_single_member':
          sendError(
            res,
            409,
            'conflict',
            'This folder has one member, so its tasks stay assigned to them (INV-5).',
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
        case 'reminder_refused':
          // The third field of the same dependency check, and 4.8's mode rule
          // with it. A reminder sent here writes the row 7.9's PUT writes, so
          // it answers the refusals 7.9 names, in the same words.
          reminderError(res, result.refusal)
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
      res.status(204).end()
    },
  )

  /* ---------------------------------------------------------------- *
   * The 5.1 transitions
   * ---------------------------------------------------------------- */

  /*
  The tz of frozen 7.6's two generating transitions, by owner ruling on
  2026-08-10, and it is two rules rather than one.

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
      One path, two graves, disjoint by construction (RFC 0005, 7.13): a
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
          // 7.6 as ruled: the transition would run generation and no zone was
          // named, so nothing happened and the same call retried with one
          // gets the transition it asked for.
          fieldError(
            res,
            'tz',
            'must be supplied, as an IANA timezone identifier, on a repeating task',
          )
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
   * 7.7 steps
   * ---------------------------------------------------------------- */

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
      const parsed = postTaskStepsBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const result = await addStep(db, viewer(req), taskId, parsed.data)
      switch (result.kind) {
        case 'not_found':
          notFound(res)
          return
        case 'step_cap':
          fieldError(
            res,
            'steps',
            'a task holds at most 50 steps, the most 10.3 allows',
          )
          return
        case 'added':
          res.status(201).json(result.task)
          return
      }
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
      const stepId = parsedId(res, req.params.id)
      if (stepId === null) return
      const parsed = patchStepBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const result = await patchStep(db, viewer(req), stepId, parsed.data)
      if (result.kind === 'not_found') {
        notFound(res)
        return
      }
      res.status(200).json(result.task)
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
      const stepId = parsedId(res, req.params.id)
      if (stepId === null) return
      const result = await deleteStep(db, viewer(req), stepId)
      if (result === 'not_found') {
        notFound(res)
        return
      }
      res.status(204).end()
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
      7.8's tz, by owner ruling on 2026-08-08: an absent or invalid one is
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
  The two endpoints frozen 7.9 names, on the router the rest of the task
  surface already lives on: the row they address is 4.8's, keyed by the task
  in the path, and every guard on it is a fact about that task.

  The body is parsed before the task is resolved, the ordering the P3 shape
  review checked on the wire for 7.6's status refusal and 7.4 already used: a
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
      const parsed = putTaskReminderBody.safeParse(req.body)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const result = await putTaskReminder(db, viewer(req), taskId, parsed.data)
      switch (result.kind) {
        case 'not_found':
          notFound(res)
          return
        case 'refused':
          reminderError(res, result.refusal)
          return
        case 'written':
          // 200 with the affected TaskDetail, by the owner's ruling of
          // 2026-08-10 on the silence this bullet carried: 7.0 gives the
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
      // 7.9's own 204, and idempotent: the 404 above is the task's, never the
      // reminder's, so a second call and a task that never had one both land
      // here. The ruling that gave the PUT a body left this bullet alone.
      res.status(204).end()
    },
  )

  return router
}
