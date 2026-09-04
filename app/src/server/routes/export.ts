/*
7.22's one route: `GET /api/v1/me/export`, the person's own Dana data as a
single JSON file.

**A router of its own, for one route, and here is why rather than a line in
`auth/router.ts`.** The `/me` family is already split across three routers —
7.1's account endpoints in `auth/router.ts`, 7.2's settings beside them,
7.15's `/me/avatar` in `routes/files.ts` — so the path is not what decides
which file a handler lives in. What decides it is what the handler reaches
for, and this one reaches across nine tables through `domain/export.ts`.
Importing that into the authentication module, which is deliberately narrow
and holds the OIDC handshake, would widen the one file in this server that
most benefits from staying small.

**The authorization is the absence of an id.** This route parses nothing:
no path parameter, no query string, no body. The only identifier that
reaches the database is the session's user id, and every statement in
`domain/export.ts` is scoped by it inside its own FROM clause. There is no
`accessOf(...)` gate here because there is no resource named by the caller to
gate — which is a property to preserve rather than a hole to fill. A future
`?since=` or `?folder_id=` would change that and would owe a gate.

**`requireSession` is written here because nothing else writes it.** AC-236
sweeps every GET as well as every mutation since issue #33, so a read that
forgot it would fail that sweep rather than pass silently — but the sweep
enumerates what is mounted and cannot invent the middleware, and its reading
count moves in the same change as any new GET.

**The limiter is 7.22's own, five per hour per person (10.4).** It sits after
`requireSession` deliberately: an unauthenticated caller is refused before
the limiter runs, so no quota is spent on a request that was never going to
be answered, and the key is always a real user id rather than the shared
`no-session` bucket. Unlike the four limits above it in
`security/rate-limit.ts`, this one is **not** raised under test, because the
criterion that measures it drives the mounted application rather than the
limiter in isolation; nothing else in the suite calls this route.
*/
import type { Request, Response, Router } from 'express'

import type { DbClient } from '../../../db/client.js'
import { exportFilename } from '../../shared/export.js'
import { requireSession } from '../auth/index.js'
import { exportForViewer } from '../domain/export.js'
import { sendError } from '../http/errors.js'
import { createSecurityLogger } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { routerWithPreamble } from './preamble.js'

export interface ExportRouterOptions {
  dbClient?: DbClient
  rateLimits?: RateLimits
  securityLog?: SecurityLogger
}

export function createExportRouter(options: ExportRouterOptions = {}): Router {
  const { router, database, viewer } = routerWithPreamble(options)
  const exportLimit = optionalLimit(options.rateLimits?.dataExport)
  const securityLog = options.securityLog ?? createSecurityLogger()

  router.get(
    '/me/export',
    requireSession,
    exportLimit,
    async (req: Request, res: Response) => {
      const db = database(res)
      if (db === null) return

      const document = await exportForViewer(db, viewer(req))
      if (document === null) {
        // A live session whose user row is gone or scrubbed (8.10). 7.1's
        // GET /me answers the same way for the same reason.
        sendError(res, 401, 'unauthenticated', 'Sign in to continue.')
        return
      }

      /* Serialized here rather than through res.json, because the byte count
         is 10.5's one measurement of this act and inventing a second
         serialization to count would risk logging a length the caller never
         received. */
      const body = JSON.stringify(document)
      const bytes = Buffer.byteLength(body)

      /* 7.22: a browser saves this rather than rendering it. The filename is
         derived from the document's own `exported_at`, so the header and the
         body cannot disagree about which day it is. */
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${exportFilename(document.exported_at)}"`,
      )
      res.setHeader('Content-Type', 'application/json; charset=utf-8')

      // 10.5: who exported and how large it was. Nothing of the content: no
      // title, no name, no address, no id but the person's own.
      securityLog.exportEvent({ actorId: viewer(req), bytes })

      res.status(200).send(body)
    },
  )

  return router
}
