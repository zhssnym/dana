// Logs `retired_route_hit` for a route marked for removal; zero hits in the logs means it can go.
// Mount it after `requireSession`, so anonymous hits stay a bare 401. The name is a source label.
import type { NextFunction, Request, RequestHandler, Response } from 'express'

import type { SecurityLogger } from '../security/log.js'

export const RETIRED_ROUTE_HIT_EVENT = 'retired_route_hit'

export function retiredRoute(log: SecurityLogger, name: string): RequestHandler {
  return (_req: Request, _res: Response, next: NextFunction) => {
    log.operation('info', RETIRED_ROUTE_HIT_EVENT, { reason: name })
    next()
  }
}
