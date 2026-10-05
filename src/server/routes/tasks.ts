/*
The 7.6 to 7.9 task routes. A task or folder the viewer cannot see is 404,
never 403, so existence never leaks (10.2).
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

/** 403 is safe here: the domain already confirmed the caller sees the folder. */
function forbidden(res: Response, reason: string): void {
  sendError(res, 403, 'forbidden', reason)
}

/** A 422 for a rule the rows answer, worded like sendValidationError's. */
function fieldError(res: Response, field: string, problem: string): void {
  sendError(res, 422, 'validation_failed', `${field}: ${problem}.`)
}

function reminderError(res: Response, refusal: ReminderRefusal): void {
  fieldError(res, refusal.field, refusal.problem)
}

/*
7.6's transition envelope: all three keys are always present. The domain decides
which are filled.
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

  /* The Task document (#221): read by any member who sees the Task, written
     under `task.edit`. */

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
      Checked before parsing, because the schema would strip `status` and
      answer 200. A body-only check reads no row, so it leaks nothing.
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
          // 404, never 422: a 422 would confirm the hidden folder exists.
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
        case 'start_time_without_date':
          fieldError(res, 'start_time', 'requires a start_date')
          return
        case 'rule_without_date':
          // The row-dependent half; the schema refuses a rule sent with a cleared date.
          fieldError(res, 'recurrence_rule', 'requires a due_date')
          return
        case 'start_after_due':
          /* The domain names the end the body moved. */
          fieldError(
            res,
            result.field,
            result.field === 'start_date'
              ? 'must not be later than due_date'
              : 'must not be earlier than start_date',
          )
          return
        case 'start_after_due_time':
          fieldError(
            res,
            result.field,
            result.field === 'start_time' || result.field === 'start_date'
              ? 'must not be later than the Due endpoint when both endpoints are timed on the same day'
              : 'must not be earlier than the Start endpoint when both endpoints are timed on the same day',
          )
          return
        case 'reminder_refused':
          // Same refusals and words as 7.9's PUT.
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

  /*
  A present but invalid tz is 422 here. Whether an absent tz is a problem is the
  domain's call, since only the rows know whether a date gets evaluated. Wrapped
  in an object so the issue's path is ['tz'].
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
      A trashed task is invisible to the transition, so try the un-trash first;
      a miss costs one indexed read.
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
        /* Refused on Access: answer 403, not fall through to a 404 about a row
           the caller can see in Trash. */
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
          // Nothing happened; the same call with a tz succeeds.
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
          // Only undated, unfinished tasks have a hand order; others are a state conflict.
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

  /*
  The path task is the dependent; the body task is what it waits on. To make A
  block B, post to B naming A. Kept off TaskDetail, whose keys 7.0 fixes.
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
          // Either end; one answer so the caller learns nothing about which.
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
          // Already related: 200 with the existing edge, so retries are safe.
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
      // 404 for an edge that is not there, like other deletes here, not an idempotent 204.
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

  /* 7.7 steps: shims over checklist items for old clients, until the contract
     release (see domain/tasks.ts). */

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
      Absent or invalid tz is 422. Wrapped in an object so the issue's path is
      ['tz']; an empty path would read as a body error.
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
      // 200, not 201: the pull is insert-or-nothing and a repeat is a no-op.
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
      // 200 (7.8), and idempotent: no entry is nothing to remove.
      res.status(200).json(result.task)
    },
  )

  /*
  The body is parsed before the task is resolved, so a refusal reads no row.
  Row-dependent refusals come back from the domain.
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
          // The reminder has no object of its own, so answer the TaskDetail.
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
      // Idempotent: the 404 above is about the task, never the reminder.
      res.status(204).end()
    },
  )

  return router
}
