// The sample people (7.20): users nobody can sign in as. Ownership transfer, account deletion
// and "is anyone else here" checks must skip them.
import { sql, type SQL } from 'drizzle-orm'

import { SAMPLE_PEOPLE } from './content.js'

export function notSamplePerson(column: SQL): SQL {
  return sql`${column} NOT IN (${sql.join(
    SAMPLE_PEOPLE.map((person) => sql`${person.id}::uuid`),
    sql`, `,
  )})`
}
