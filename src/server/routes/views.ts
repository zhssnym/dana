/*
The 7.10 read routes: view pages, calendar, folder tasks and search. No
predicate or order lives here; reads are src/server/views'. A hidden folder is
404, never 403. All GETs, so no CSRF.
*/
import type { Request, Response, Router } from 'express'

import type { Db, DbClient } from '../../../db/client.js'
import {
  doneQuery,
  focusQuery,
  folderTasksQuery,
  plannedCalendarQuery,
  searchQuery,
  viewQuery,
} from '../../shared/views.js'
import { requireSession } from '../auth/index.js'
import { accessOf } from '../domain/folder-access.js'
import {
  sendError,
  sendFieldValidationError,
  sendValidationError,
} from '../http/errors.js'
import { optionalLimit } from '../security/rate-limit.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'
import type { RateLimits } from '../security/rate-limit.js'
import { checkCalendarRange, CALENDAR_RANGE_MAX_DAYS } from '../time/index.js'
import {
  allView,
  doneView,
  focusView,
  folderCompletedView,
  folderOpenView,
  importantView,
  myDayView,
  plannedCalendarView,
  plannedView,
  searchView,
  tasksView,
} from '../views/index.js'
import { retiredRoute } from '../observability/retired-route.js'
import { routerWithPreamble } from './preamble.js'

export interface ViewsRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
  securityLog?: SecurityLogger
}

export function createViewsRouter(options: ViewsRouterOptions = {}): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const searchLimit = optionalLimit(options.rateLimits?.search)
  const securityLog = options.securityLog ?? createSecurityLogger()

  /** tz is required on every view (7.0); there is no UTC default. */
  const zoneOf = (req: Request, res: Response): string | null => {
    const parsed = viewQuery.safeParse(req.query)
    if (!parsed.success) {
      sendValidationError(res, parsed.error)
      return null
    }
    return parsed.data.tz
  }

  router.get(
    '/views/my-day',
    requireSession,
    retiredRoute(securityLog, 'get_views_my_day'),
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const tz = zoneOf(req, res)
      if (tz === null) return
      res.status(200).json(await myDayView(db, viewer(req), tz))
    },
  )

  /* These read no date, but 7.0 still requires tz on every view. */
  const page =
    (read: (db: Db, viewerId: string) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      if (zoneOf(req, res) === null) return
      res.status(200).json(await read(db, viewer(req)))
    }

  router.get('/views/tasks', requireSession, retiredRoute(securityLog, 'get_views_tasks'), page(tasksView))
  router.get('/views/planned', requireSession, retiredRoute(securityLog, 'get_views_planned'), page(plannedView))
  router.get('/views/important', requireSession, retiredRoute(securityLog, 'get_views_important'), page(importantView))
  router.get('/views/all', requireSession, page(allView))

  /* No path id, so no ac-397 row; scoped by accessibleTasks and covered by
     guard-list-visibility. */
  router.get('/views/focus', requireSession, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    const parsed = focusQuery.safeParse(req.query)
    if (!parsed.success) {
      sendValidationError(res, parsed.error)
      return
    }
    const { tz, ...query } = parsed.data
    res.status(200).json(await focusView(db, viewer(req), tz, query))
  })

  router.get(
    '/views/planned/calendar',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const parsed = plannedCalendarQuery.safeParse(req.query)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const { tz: _tz, start, end, folder_id: folderId } = parsed.data
      /* Range rules come from src/server/time; the route names the fields. */
      const range = checkCalendarRange(start, end)
      if (!range.ok) {
        sendFieldValidationError(res, [
          {
            field: 'start, end',
            message:
              range.reason === 'inverted'
                ? 'start must not be after end'
                : `must span at most ${String(CALENDAR_RANGE_MAX_DAYS)} days, and this range spans ${String(range.days)}`,
          },
        ])
        return
      }
      const viewerId = viewer(req)
      if (folderId !== undefined && (await accessOf(db, viewerId, folderId)) === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      res
        .status(200)
        .json(await plannedCalendarView(db, viewerId, start, end, folderId))
    },
  )

  router.get(
    '/views/done',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const parsed = doneQuery.safeParse(req.query)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      const { tz, cursor } = parsed.data
      res.status(200).json(await doneView(db, viewer(req), tz, cursor))
    },
  )

  router.get(
    '/folders/:id/tasks',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const parsed = folderTasksQuery.safeParse(req.query)
      if (!parsed.success) {
        sendValidationError(res, parsed.error)
        return
      }
      /* The query is validated before the folder is resolved, so the order of
         checks reveals nothing about existence. */
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const viewerId = viewer(req)
      if ((await accessOf(db, viewerId, folderId)) === null) {
        sendError(res, 404, 'not_found', 'Not found.')
        return
      }
      const { tz, section, cursor } = parsed.data
      res
        .status(200)
        .json(
          section === 'completed'
            ? await folderCompletedView(db, viewerId, folderId, tz, cursor)
            : await folderOpenView(db, viewerId, folderId),
        )
    },
  )

  router.get('/search', requireSession, searchLimit, async (req: Request, res: Response) => {
    const db = database(res)
    if (db === null) return
    const parsed = searchQuery.safeParse(req.query)
    if (!parsed.success) {
      sendValidationError(res, parsed.error)
      return
    }
    const { tz: _tz, q, cursor } = parsed.data
    res.status(200).json(await searchView(db, viewer(req), q, cursor))
  })

  return router
}
