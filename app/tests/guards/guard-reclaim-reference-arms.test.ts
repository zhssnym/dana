/*
Every column that can hold a file id is an arm of the reclaim sweep, and this
is what makes that sentence keep being true.

**Why this guard exists.** Issue #263. `reclaimUnwornPictures` in
`app/src/server/domain/files.ts` permanently deletes a folder-less picture and
its bytes thirty days after the last thing that named it stopped naming it, and
the only thing standing between a picture somebody is looking at and that
delete is `fileIsUnreferenced()` — five `NOT EXISTS` clauses, one per foreign
key into `files(id)`, written by hand. AC-700 to AC-704 pin those five, one
criterion each.

**What those five criteria structurally cannot catch is a sixth.** A migration
that adds a new column referencing `files(id)` — a task cover, an account
banner, whatever comes next — is a green suite in every direction: AC-001's
catalog moves with the migration because it is meant to, the five criteria go
on passing because their five arms are untouched, and the new column is simply
absent from the reference query. Thirty days after the first person uses the
feature, the tick deletes their picture. There is no request to point at, no
log line above `database`-level, and for the two cascading keys no row left
saying the reference ever existed.

So the enumeration is read from the database's own catalog rather than
remembered, and asserted in both directions against the list below: a key this
file does not know about fails, and a key in this list that no longer exists
fails too. That is `ac-236` and `ac-397`'s shape, chosen for their reason —
the sweep cannot tell that somebody thought about a new column, only that they
did both halves.

**It is a guard rather than a criterion** because it asserts the shape of the
schema against the shape of one function, which is a fact about this
repository rather than a behaviour anybody asked Dana for.
*/
import { sql } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../../db/client.js'
import { createTestDb, rows } from '../support/helpers.js'

const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const DOMAIN_FILES = path.join(APP_ROOT, 'src', 'server', 'domain', 'files.ts')

/**
 * Every foreign key into `files(id)` as of issue #263, and what a wrong sweep
 * costs on each. `ON DELETE CASCADE` is the expensive half: the referencing
 * row goes with the picture, so nothing is left to notice.
 *
 * **This list is one of the movable fixtures `docs/workflow/backend.md`
 * enumerates, and it is the strictest of them.** Rule 3 — never edit a test to
 * make your code pass — does not forbid moving it, because it describes the
 * shape of the schema rather than a behaviour anybody asked Dana for. What it
 * does forbid is moving it *first*. A migration that adds a sixth foreign key
 * fails this file by design, and the order that is safe is:
 *
 * 1. add the matching `NOT EXISTS` arm to `fileIsUnreferenced()` in
 *    `app/src/server/domain/files.ts`;
 * 2. write the criterion that proves it, on the AC-700 to AC-704 pattern — a
 *    picture held through the new column, aged past thirty days, spared with
 *    its row and its object, beside an identically aged twin that nothing
 *    holds and is taken;
 * 3. watch the second test below pass on the new arm, so that only this list
 *    is failing;
 * 4. then add the row here.
 *
 * Doing step 4 on its own makes this file green and leaves the 11.7 tick
 * deleting a picture somebody is looking at, thirty days later, with no
 * request behind it. There is no down migration and the bytes are gone.
 *
 * **Worked example, the one this file was written from.** On 2026-09-20 the
 * schema held exactly these five and `fileIsUnreferenced()` named all five, so
 * both tests passed with nothing to move. Removing any one arm from that
 * predicate left the first test green — the schema had not changed — and took
 * the second red naming the column, which is the direction that matters: the
 * guard reports the predicate falling behind the schema, never the reverse.
 */
const KNOWN_ARMS: readonly { relation: string; column: string; onDelete: string }[] = [
  { relation: 'comment_files', column: 'file_id', onDelete: 'CASCADE — the attachment row goes too' },
  { relation: 'folders', column: 'cover_file_id', onDelete: 'SET NULL — the folder is blanked' },
  { relation: 'page_blocks', column: 'file_id', onDelete: 'SET NULL — the block draws nothing' },
  { relation: 'shelves', column: 'cover_file_id', onDelete: 'SET NULL — the shelf is blanked' },
  { relation: 'user_page_covers', column: 'file_id', onDelete: 'CASCADE — the cover row and its crop go too' },
]

let client: DbClient

beforeAll(async () => {
  client = await createTestDb()
}, 120_000)

afterAll(async () => {
  if ((client as DbClient | undefined) === undefined) return
  await client.close()
})

async function referencingColumns(): Promise<string[]> {
  const found = await rows(
    client.db,
    sql`SELECT child.relname AS relation, att.attname AS column_name
          FROM pg_constraint con
          JOIN pg_class child ON child.oid = con.conrelid
          JOIN pg_class parent ON parent.oid = con.confrelid
          JOIN pg_namespace ns ON ns.oid = child.relnamespace
          JOIN LATERAL unnest(con.conkey) AS key(attnum) ON true
          JOIN pg_attribute att
            ON att.attrelid = con.conrelid AND att.attnum = key.attnum
         WHERE con.contype = 'f'
           AND parent.relname = 'files'
           AND ns.nspname = 'public'
         ORDER BY 1, 2`,
  )
  return found.map((row) => `${String(row.relation)}.${String(row.column_name)}`)
}

describe('the reclaim sweep has an arm for every reference into files (issue #263)', () => {
  test('the schema holds exactly the foreign keys this repository knows about', async () => {
    const live = await referencingColumns()
    const known = KNOWN_ARMS.map((arm) => `${arm.relation}.${arm.column}`).sort()

    expect(
      live,
      'a foreign key into files(id) arrived or left without this list moving. Every one of ' +
        'them is an arm of fileIsUnreferenced() in app/src/server/domain/files.ts, and a ' +
        'column missing from that predicate is a picture the 11.7 tick deletes thirty days ' +
        'after somebody starts using it, with no request to point at. Add the arm, add the ' +
        'criterion that proves it on the AC-700 to AC-704 pattern, and then move this list',
    ).toEqual(known)
  })

  test('fileIsUnreferenced names every one of them', () => {
    const source = readFileSync(DOMAIN_FILES, 'utf8')
    const start = source.indexOf('function fileIsUnreferenced()')
    expect(
      start,
      'fileIsUnreferenced() must still be the one predicate the sweep asks. If it was ' +
        'renamed or inlined, this guard is measuring nothing and must be pointed at ' +
        'whatever replaced it',
    ).toBeGreaterThan(-1)
    const predicate = source.slice(start, source.indexOf('\n}', start))

    const missing = KNOWN_ARMS.filter(
      (arm) => !predicate.includes(arm.relation),
    ).map((arm) => `${arm.relation}.${arm.column} (${arm.onDelete})`)

    expect(
      missing,
      'these columns can hold a file id and the reclaim predicate does not mention them, ' +
        'so the 11.7 tick will delete a picture they still name once its mark is thirty ' +
        'days old — row and bytes, permanently, with no act by anybody behind it',
    ).toEqual([])
  })
})
