/*
The authentication module's public surface, and the only thing the boot file
needs to import. Everything else here is internal: the boot file mounts one
router and calls one pruning function.

The wiring this module needs from app/src/server/index.ts, which belongs to
the Platform engineer, is written down in README.md beside this file.
*/
export { createAuthRouter } from './router.js'
export type { AuthRouterOptions } from './router.js'
export { pruneExpiredSessions } from './sessions.js'
export type { AuthConfig } from './oidc.js'

/*
The middleware every other backend role builds behind, in the 11.3 order:
attachSession, then requireSession, then requireCsrf on mutations. The
persona's Handoff calls that order a stable interface, so it belongs on this
surface rather than inside the auth router alone: P2's folder routes and
everything after mount their own routers and need the same three.

sessionOf is how a handler reads the authenticated viewer, V in the spec's
language. It is deliberately the only way: the context lives in a WeakMap, so
no route can reach it without importing this.
*/
export {
  attachSession,
  requireCsrf,
  requireSession,
  sessionOf,
} from './middleware.js'
export type { SessionContext } from './middleware.js'
