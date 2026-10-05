/*
`GET /api/v1/me/export`. It takes no id from the caller (no path, query or
body), so there is nothing to gate beyond the session: every statement is
scoped by the session's user id. A future parameter naming a resource would
need an accessOf gate. The limiter runs after requireSession so its key is a
real user id; it is not raised under test.
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
        // A live session whose user row is gone or scrubbed, as GET /me answers.
        sendError(res, 401, 'unauthenticated', 'Sign in to continue.')
        return
      }

      /* Serialized here so the logged byte count is exactly what was sent. */
      const body = JSON.stringify(document)
      const bytes = Buffer.byteLength(body)

      /* The filename comes from `exported_at`, so header and body agree on the date. */
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${exportFilename(document.exported_at)}"`,
      )
      res.setHeader('Content-Type', 'application/json; charset=utf-8')

      // Who exported and how large; nothing of the content (10.5).
      securityLog.exportEvent({ actorId: viewer(req), bytes })

      res.status(200).send(body)
    },
  )

  return router
}
