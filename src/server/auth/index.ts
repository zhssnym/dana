/* The auth module's public surface. */
export { createAuthRouter } from './router.js'
export type { AuthRouterOptions } from './router.js'
export { pruneExpiredSessions } from './sessions.js'
export type { AuthConfig } from './oidc.js'

/*
The middleware other routers use, in 11.3 order: attachSession, requireSession,
then requireCsrf on mutations. sessionOf is the only way to read the viewer.
*/
export {
  attachSession,
  requireCsrf,
  requireSession,
  sessionOf,
} from './middleware.js'
export type { SessionContext } from './middleware.js'
