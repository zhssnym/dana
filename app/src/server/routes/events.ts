/*
The 7.12 events and notifications routes. Events are never written here. A
scope the viewer cannot read is 404, never 403.
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import { eventsQuery, parseSubjectRef } from '../../shared/events.js'
import { requireCsrf, requireSession } from '../auth/index.js'
import {
  listFolderEvents,
  listNotifications,
  listSubjectEvents,
  markAllNotificationsRead,
  markNotificationRead,
} from '../domain/events.js'
import { accessOf } from '../domain/folder-access.js'
import { shelfView } from '../domain/shelves.js'
import { accessibleTask } from '../domain/tasks.js'
import { sendError, sendValidationError } from '../http/errors.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { routerWithPreamble } from './preamble.js'

export interface EventsRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
}

export function createEventsRouter(options: EventsRouterOptions = {}): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const mutationLimit = optionalLimit(options.rateLimits?.generalMutations)

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

    // Readable exactly when the subject is. Comment subjects are not resolved
    // here, so they are always 404.
    const subject = parseSubjectRef(String(parsed.data.subject))
    const readable =
      subject.kind === 'folder'
        ? (await accessOf(db, viewer(req), subject.id)) !== null
        : subject.kind === 'task'
          ? (await accessibleTask(db, viewer(req), subject.id)) !== null
          : subject.kind === 'shelf'
            ? (await shelfView(db, viewer(req), subject.id)) !== null
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
      const notificationId = parsedId(res, req.params.id)
      if (notificationId === null) return
      const outcome = await markNotificationRead(
        db,
        viewer(req),
        notificationId,
      )
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
