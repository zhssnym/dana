/* Compatibility home for domain imports written before P9. The implementation
 * now lives at the server boundary so auth, time, domain, and scheduler code
 * cannot drift into separate database adapters. */
export { inTransaction, rowsOf } from '../database.js'
export type { Executor } from '../database.js'
