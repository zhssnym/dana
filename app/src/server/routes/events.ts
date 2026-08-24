/*
The 7.12 surface: events and notifications (RFC 0005). Handlers validate
with the shared schemas, resolve access through the domain modules, and
serialize; events are never written here, because the 10.2 chokepoint is the
only writer and it lives with the mutations.

Status grammar, the surface's usual (7.0, 10.2): no session 401; a scope the
viewer cannot read 404, never 403, so existence never leaks; a malformed
query 422 naming the field. The two read-state POSTs are idempotent through
their no-op rows and carry the CSRF link like every mutation (11.3).
*/
import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'

import type { Db, DbClient } from '../../../db/client.js'
import { eventsQuery, parseSubjectRef } from '../../shared/events.js'
import {
  attachSession,
  requireCsrf,
  requireSession,
  sessionOf,
} from '../auth/index.js'
import {
  listFolderEvents,
  listNotifications,
  listSubjectEvents,
  markAllNotificationsRead,
  markNotificationRead,
} from '../domain/events.js'
import { accessOf } from '../domain/folders.js'
import { accessibleTask } from '../domain/tasks.js'
import { sendError, sendValidationError } from '../http/errors.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'

export interface EventsRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
}

const uuidParam = z.uuid()

export function createEventsRouter(options: EventsRouterOptions = {}): Router {
  const router = Router()
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)

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

  router.get('/events', requireSession, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    const parsed = eventsQuery.safeParse(req.query)
    if (!parsed.success) {
      sendValidationError(res, parsed.error)
      return
    }

    if (parsed.data.folder !== undefined) {
      if ((await accessOf(db, viewer(req), parsed.data.folder)) === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(200).json(await listFolderEvents(db, parsed.data.folder))
      return
    }

    // The subject scope: readable exactly when the subject is (7.12).
    // Shelves and comments gain their resolutions with the packages that
    // write their events; until then a reference to one names nothing the
    // viewer can read, which 10.2 answers as not-found rather than a hint.
    const subject = parseSubjectRef(String(parsed.data.subject))
    const readable =
      subject.kind === 'folder'
        ? (await accessOf(db, viewer(req), subject.id)) !== null
        : subject.kind === 'task'
          ? (await accessibleTask(db, viewer(req), subject.id)) !== null
          : false
    if (!readable) {
      sendError(res, 404, 'not_found', 'Not found.')
      return
    }
    res.status(200).json(await listSubjectEvents(db, subject.kind, subject.id))
  })

  router.get(
    '/notifications',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      res.status(200).json(await listNotifications(db, viewer(req)))
    },
  )

  router.post(
    '/notifications/:id/read',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const parsed = uuidParam.safeParse(req.params.id)
      if (!parsed.success) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const outcome = await markNotificationRead(db, viewer(req), parsed.data)
      if (outcome === 'not_found') {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res.status(200).json({ read: true })
    },
  )

  router.post(
    '/notifications/read-all',
    requireSession,
    requireCsrf,
    mutationLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const updated = await markAllNotificationsRead(db, viewer(req))
      res.status(200).json({ read: updated })
    },
  )

  return router
}
