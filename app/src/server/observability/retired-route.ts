/*
A route marked for removal writes one line when it is hit, then answers as it
always has. The architecture's step 1 removes routes no client calls; this
line is how a release proves that before they go: zero `retired_route_hit`
lines in the Render logs, then the removal ships.

It goes after `requireSession` on each route, so an anonymous hit is still a
bare 401 and writes nothing. The name is a fixed label written in the source,
never a value from the request.
*/
import type { NextFunction, Request, RequestHandler, Response } from 'express'

import type { SecurityLogger } from '../security/log.js'

export const RETIRED_ROUTE_HIT_EVENT = 'retired_route_hit'

export function retiredRoute(log: SecurityLogger, name: string): RequestHandler {
  return (_req: Request, _res: Response, next: NextFunction) => {
    log.operation('info', RETIRED_ROUTE_HIT_EVENT, { reason: name })
    next()
  }
}
