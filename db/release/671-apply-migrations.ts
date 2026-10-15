/** #671: isolated restored-database rehearsal ONLY. No production URL fallback. */
import { createDbClient } from '../client.js'

const url = process.env.DANA_671_REHEARSAL_URL
if (!url || process.env.DANA_671_ACK !== 'ISOLATED_REHEARSAL_ONLY') {
  throw new Error('Isolated rehearsal URL and explicit acknowledgment are required')
}

const db = await createDbClient({ url })
try {
  if (db.kind !== 'postgres') throw new Error('Expected PostgreSQL, not PGlite')
  await db.runMigrations()
} finally {
  await db.close()
}
