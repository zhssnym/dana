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
