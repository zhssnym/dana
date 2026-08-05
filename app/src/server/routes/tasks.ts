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

Two response shapes frozen 7.7 and 7.8 leave open are answered here as the
affected TaskDetail: a step mutation and a My Day pull both change what a
fresh GET /tasks/:id would say, and 7.1, 7.2 and 7.4 all answer a mutation
with what a fresh GET would give. Recommended by the shared-schema session
that precedes this one and provisional until the P3 endpoint shape review
rules on it, which is why the shape lives in the handler rather than in
src/shared.
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
} from '../../shared/tasks.js'
import type { TaskDetail } from '../../shared/tasks.js'
import {
  attachSession,
  requireCsrf,
  requireSession,
  sessionOf,
} from '../auth/index.js'
import { sendError, sendValidationError } from '../http/errors.js'
import {
  addStep,
  createTask,
  deleteStep,
  deleteTask,
  dropFromMyDay,
  patchStep,
  patchTask,
  pullIntoMyDay,
  taskView,
  transitionTask,
} from '../domain/tasks.js'
import type { TransitionEvent } from '../domain/tasks.js'

export interface TasksRouterOptions {
  dbClient?: DbClient
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

/*
7.6's transition envelope, one shape for all four endpoints: the task, the
successor a recurring completion generates, and the successor a G-SERIES
uncomplete deletes. Both companions are null until P6 lands 8.5 and the
G-SERIES branch, and the keys are answered from the first transition so the
client contract never changes shape under it.
*/
function transitionBody(task: TaskDetail): Record<string, unknown> {
  return { task, generated_task: null, deleted_successor_id: null }
}

export function createTasksRouter(options: TasksRouterOptions = {}): Router {
  const router = Router()

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
          // 7.6 admits 404 or 422 for a target the caller is not in; 404 is
          // the one the leak rule of 10.2 asks for everywhere else here.
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

  /** One handler for the four endpoints, because 7.6 gives them one response
   * and 5.1 one table; the event is the only thing that differs. */
  const transition =
    (event: TransitionEvent) => async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const taskId = parsedId(res, req.params.id)
      if (taskId === null) return
      const result = await transitionTask(db, viewer(req), taskId, event)
      switch (result.kind) {
        case 'not_found':
          notFound(res)
          return
        case 'conflict':
          sendError(res, 409, 'conflict', result.message)
          return
        case 'noop':
        case 'transitioned':
          res.status(200).json(transitionBody(result.task))
          return
      }
    }

  for (const event of [
    'complete',
    'uncomplete',
    'abandon',
    'restore',
  ] as const) {
    router.post(`/tasks/:id/${event}`, requireSession, requireCsrf, transition(event))
  }

  /* ---------------------------------------------------------------- *
   * 7.7 steps
   * ---------------------------------------------------------------- */

  router.post(
    '/tasks/:id/steps',
    requireSession,
    requireCsrf,
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
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const taskId = parsedId(res, req.params.id)
      if (taskId === null) return
      const result = await pullIntoMyDay(db, viewer(req), taskId)
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

  return router
}
