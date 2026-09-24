/*
The sample people (7.20) as SQL: users rows nobody can sign in as. They are
members of a sample's pages but never someone a page can be handed to, so
ownership transfer (8.9), account deletion (8.10) and "is anyone else here"
all look past them.
*/
import { sql, type SQL } from 'drizzle-orm'

import { SAMPLE_PEOPLE } from './content.js'

/** `user_id NOT IN (…the sample people…)`, for a column named by `column`. */
export function notSamplePerson(column: SQL): SQL {
  return sql`${column} NOT IN (${sql.join(
    SAMPLE_PEOPLE.map((person) => sql`${person.id}::uuid`),
    sql`, `,
  )})`
}
