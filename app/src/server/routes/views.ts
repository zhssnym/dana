/*
The 7.10 surface: the six view pages, the calendar, the folder page, and
search. Handlers validate with the shared schemas, delegate every read to
src/server/views, and serialize; no predicate and no order lives here, since an order
written in a handler is an order section 6 cannot be compared to.

Mounted under /api/v1 by the boot file. The router carries
its own session attachment and steps aside when another router's already ran,
the folders router's arrangement, so it composes whichever order routers
mount in behind the same 11.3 links. That block is `preamble.ts` since issue
#36.

GET /folders/:id/tasks lives here rather than in folders.ts: the path prefix
is the folders router's, but the endpoint is 7.10's. Express matches on the whole path, so the two routers never see
each other's requests whichever mounts first.

Status grammar (5.4, 7.0, 10.2): no session 401; a folder that does not exist
or that the viewer is not a member of 404, never 403, so existence never
leaks; every validation failure 422 with the field named, which for this
surface is tz on every endpoint, start and end on the calendar, q on search,
and section and cursor where they are taken.

Every endpoint is a GET, so there is no CSRF link on this router: 7.0 makes
GETs safe and requires the token on mutations, and this package has none.
*/
import type { Request, Response, Router } from 'express'

import type { Db, DbClient } from '../../../db/client.js'
import {
  doneQuery,
  folderTasksQuery,
  plannedCalendarQuery,
  searchQuery,
  viewQuery,
} from '../../shared/views.js'
import { requireSession } from '../auth/index.js'
import { accessOf } from '../domain/folders.js'
import {
  sendError,
  sendFieldValidationError,
  sendValidationError,
} from '../http/errors.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { checkCalendarRange, CALENDAR_RANGE_MAX_DAYS } from '../time/index.js'
import {
  allView,
  doneView,
  folderCompletedView,
  folderOpenView,
  importantView,
  myDayView,
  plannedCalendarView,
  plannedView,
  searchView,
  tasksView,
} from '../views/index.js'
import { routerWithPreamble } from './preamble.js'

export interface ViewsRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
}

export function createViewsRouter(options: ViewsRouterOptions = {}): Router {
  const { router, database, viewer, parsedId } = routerWithPreamble(options)
  const searchLimit = optionalLimit(options.rateLimits?.search)

  /**
   * The tz every view takes (7.0), and the whole of what six of the nine
   * endpoints validate. An absent tz fails the same check an invalid one
   * does, and the schema carries no default: UTC would hand most of the world the wrong
   * day with nothing on the wire to say it had been substituted.
   */
  const zoneOf = (req: Request, res: Response): string | null => {
    const parsed = viewQuery.safeParse(req.query)
    if (!parsed.success) {
      sendValidationError(res, parsed.error)
      return null
    }
    return parsed.data.tz
  }

  /* ---------------------------------------------------------------- *
   * The six pages
   * ---------------------------------------------------------------- */

  router.get(
    '/views/my-day',
    requireSession,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      const tz = zoneOf(req, res)
      if (tz === null) return
      res.status(200).json(await myDayView(db, viewer(req), tz))
    },
  )

  /*
  Four pages take nothing but tz and read no date at all: Q2, Q3, Q4 and Q5
  are predicates over due_date's nullness, the star and the status, none of
  which asks what day it is. tz is still required of them, because 7.0
  requires it of every view endpoint and a client that omits it on one page
  and not another is a client with a bug this refusal names.
  */
  const page =
    (read: (db: Db, viewerId: string) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return
      if (zoneOf(req, res) === null) return
      res.status(200).json(await read(db, viewer(req)))
    }

  router.get('/views/tasks', requireSession, page(tasksView))
  router.get('/views/planned', requireSession, page(plannedView))
  router.get('/views/important', requireSession, page(importantView))
  router.get('/views/all', requireSession, page(allView))

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
      const { tz: _tz, start, end } = parsed.data
      /*
      Q3C's two range rules, measured by src/server/time because they are
      calendar arithmetic, and answered here because that module says
      outright that naming the field and choosing the status are the
      route's. Both are 422 naming the pair, which adds no status to the
      surface: 7.0 already gives every endpoint 422 for a validation
      failure with the field named.
      */
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
      res
        .status(200)
        .json(await plannedCalendarView(db, viewer(req), start, end))
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

  /* ---------------------------------------------------------------- *
   * The folder page
   * ---------------------------------------------------------------- */

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
      /*
      The request is judged before the folder is resolved, so a malformed
      request answers the same 422 whoever sent it and a caller cannot read
      a folder's existence off the order the two checks run in.
      */
      const folderId = parsedId(res, req.params.id)
      if (folderId === null) return
      const viewerId = viewer(req)
      if ((await accessOf(db, viewerId, folderId)) === null) {
        // Q7 is "member only, else 404", and 7.0 makes inaccessible read as
        // 404 rather than 403 so nothing leaks that the folder exists.
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

  /* ---------------------------------------------------------------- *
   * Search
   * ---------------------------------------------------------------- */

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
