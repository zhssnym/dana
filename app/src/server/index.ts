import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import { pino } from 'pino'

import { healthRouter } from './routes/health.js'

export const logger = pino()

// Section 7.0 fixes the error envelope for the API surface; the scaffold's
// generic handlers use the same shape so Express never answers an /api path
// with its default HTML error page.
function errorBody(code: string, message: string) {
  return { error: { code, message } }
}

export function createApp(): express.Express {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json())

  app.use('/api/health', healthRouter)

  // The frozen /api/v1 surface mounts here as later packages land, always
  // before this catch-all so unknown API paths answer JSON, not the SPA.
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json(errorBody('not_found', 'Not found.'))
  })

  // Present only after a build; npm run dev serves the client from Vite
  // instead, proxying /api here.
  const clientDist = path.resolve(process.cwd(), 'dist', 'client')
  const clientIndex = path.join(clientDist, 'index.html')
  if (existsSync(clientIndex)) {
    app.use(express.static(clientDist))
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(clientIndex)
    })
  }

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const status =
      typeof err === 'object' &&
      err !== null &&
      'status' in err &&
      typeof err.status === 'number'
        ? err.status
        : 500
    // Only method, path, and status: request bodies and headers may carry
    // fields the 10.5 never-log list forbids once product routes exist.
    if (status >= 500) {
      const stack = err instanceof Error ? err.stack : undefined
      logger.error({ method: req.method, path: req.path, status, stack }, 'request failed')
      res.status(status).json(errorBody('internal_error', 'Something went wrong.'))
      return
    }
    const message = status === 400 ? 'Malformed request body.' : 'Request failed.'
    res.status(status).json(errorBody('bad_request', message))
  })

  return app
}

function main(): void {
  const port = Number(process.env.PORT ?? 3000)
  const app = createApp()
  const server = app.listen(port, () => {
    logger.info({ port }, 'dana listening')
  })
  const shutdown = (): void => {
    server.close(() => {
      process.exit(0)
    })
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main()
}
