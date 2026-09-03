/*
The preamble every router in this directory used to begin with, in one place
(issue #36). Thirteen files carried a byte-identical copy of it, and it is
where `attachSession` runs, so a file that copied it wrongly — or a new file
that forgot it — would have been an authentication defect rather than an
untidy one.

**The router is created here rather than handed in, and that is the point.**
Express runs a router's layers in registration order, so a `router.use` added
after a route does not run for that route. A preamble that took an existing
router could therefore be called too late and look right; a preamble that
*returns* the router cannot be, because there is no router to register a
route on until the session middleware is already on it.

## What the session block actually does, measured rather than assumed

**In the mounted application it does nothing, and it is still worth keeping.**
`createApp` mounts `createAuthRouter` first at `/api/v1`, and that router's
own `router.use(attachSession(db))` matches every path under the mount, so
every request has its session resolved before any router in this directory
sees it. Measured 2026-09-03 by deleting the block from `routes/trash.ts`
outright: AC-236 stayed green (2 of 2), and AC-189 and AC-190 with it, which
is what a no-op looks like. Every mount site in the repository — `index.ts`
and the four `routes/*.test.ts` harnesses — puts the auth router first.

So what this block buys is **order tolerance**, which `routes/README.md` has
promised of every router here since P2: a router that attaches its own session
can be mounted before the auth router, or without it, and still authenticate.
Deleting it would make the mount order in `index.ts` load-bearing for
authentication as well as for path shadowing, which is the hazard the comment
above that mount block exists to prevent. It stays.

**And AC-236 cannot see its absence**, for the same reason it is a no-op: the
sweep drives the mounted application, where the auth router has already
attached the session, so a route file with no preamble at all answers 401 bare
and 403 tokenless exactly as one with it. What AC-236 does catch, on every
method since issue #33, is a route that forgets `requireSession`, and its two
counts are pinned to equality so a route cannot join the application without
that number moving in the same change. Authorization is covered by neither and
is still hand-written at every call site (issue #74).
*/
import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'

import type { Db, DbClient } from '../../../db/client.js'
import { attachSession, sessionOf } from '../auth/index.js'
import { sendError } from '../http/errors.js'

/** The one field of a router's options this module reads. Every router's own
 * options interface satisfies it structurally, extra fields and all. */
export interface PreambleOptions {
  dbClient?: DbClient
}

export interface RouterPreamble {
  /** The router, with the session middleware already registered on it. */
  router: Router
  /**
   * The database, or null after this call has answered 11.10's 500. A route
   * that touches data begins `const db = database(res); if (db === null)
   * return`, which is what lets a route-presence probe construct the whole
   * application with no database at all.
   */
  database: (res: Response) => Db | null
  /**
   * The authenticated viewer, V in the spec's language. Empty behind a route
   * with no `requireSession`, which is a bug in that route rather than a case
   * to handle: an empty id is a member of nothing, so a query written the way
   * this codebase writes them returns no rows.
   */
  viewer: (req: Request) => string
  /**
   * A uuid path parameter, or null after this call has answered 7.0's 404.
   *
   * A path id that is not a uuid names nothing that exists, and letting it
   * reach a query would surface as a cast error: a 500 wearing a taxonomy the
   * contract does not have. This was written three ways across seven files
   * before issue #38 — a module-level function in four, a closure constant in
   * three, and open-coded `safeParse` beside them — all with identical
   * behaviour. One way now.
   */
  parsedId: (res: Response, raw: unknown) => string | null
}

const uuidParam = z.uuid()

export function routerWithPreamble(options: PreambleOptions): RouterPreamble {
  const router = Router()

  if (options.dbClient !== undefined) {
    const attach = attachSession(options.dbClient.db)
    router.use((req: Request, res: Response, next: NextFunction) => {
      // Already attached by whichever router ran first, so the session is
      // resolved once per request however these are ordered.
      if (sessionOf(req) !== undefined) {
        next()
        return
      }
      attach(req, res, next)
    })
  }

  return {
    router,
    database: (res: Response): Db | null => {
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
    },
    viewer: (req: Request): string => sessionOf(req)?.userId ?? '',
    parsedId: (res: Response, raw: unknown): string | null => {
      const parsed = uuidParam.safeParse(raw)
      if (!parsed.success) {
        sendError(res, 404, 'not_found', 'Not found.')
        return null
      }
      return parsed.data
    },
  }
}
