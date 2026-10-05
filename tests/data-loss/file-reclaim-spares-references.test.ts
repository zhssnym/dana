/*
Every **foreign key** into `files(id)` is an arm of the reclaim sweep, and this
is what makes that sentence keep being true. It is a narrower sentence than the
one this header opened with until 2026-09-20, and the narrowing is the point:
the old first line read "every column that can hold a file id", which **is not
true and this guard cannot make it true**.

**What it watches.** Issue #263. `reclaimUnwornPictures` in
`src/server/domain/files.ts` permanently deletes a folder-less picture and
its bytes thirty days after the last thing that named it stopped naming it, and
the only thing standing between a picture somebody is looking at and that
delete is `fileIsUnreferenced()` — five `NOT EXISTS` clauses, one per foreign
key into `files(id)`, written by hand. AC-700 to AC-704 pin those five, one
criterion each.

**What those five criteria structurally cannot catch is a sixth key.** A
migration that adds a new column referencing `files(id)` — a task cover, an
account banner, whatever comes next — is a green suite in every direction:
AC-001's catalog moves with the migration because it is meant to, the five
criteria go on passing because their five arms are untouched, and the new
column is simply absent from the reference query. Thirty days after the first
person uses the feature, the tick deletes their picture. There is no request to
point at, no log line above `database`-level, and for the two cascading keys no
row left saying the reference ever existed.

So the enumeration is read from the database's own catalog rather than
remembered, and asserted in both directions against the list below: a key this
file does not know about fails, and a key in this list that no longer exists
fails too. That is `ac-236` and `ac-397`'s shape, chosen for their reason —
the sweep cannot tell that somebody thought about a new column, only that they
did both halves.

**What it does not watch, and cannot.** This file reads `pg_constraint`, so a
reference held as anything other than a foreign key is not there to be read.
**`users.avatar_url` is the standing example and it is not hypothetical**:
`setAvatar` writes `'/api/v1/files/' + id` into a `text` column, so every
avatar row in the product is unreferenced as far as `fileIsUnreferenced()` is
concerned, and what spares it is the sweep's `kind IN ('cover', 'image')` and
nothing here. `files.ts` says so where the predicate is written; this header
said the opposite for one commit. **AC-705 is the case that holds that line**,
and if the sweep's scope clauses are what you are about to edit, that criterion
and not this guard is what will tell you.

Two further things this file is silent about, stated so that a green run is not
read as more than it is. It does not know whether step 2 of the order below —
the criterion — was written; nothing structural can. And it says nothing about
what the arms *do*: an arm whose `NOT EXISTS` were inverted mentions the
relation and the column exactly as a correct one does, which is AC-700 to
AC-704's half of the work rather than this one's.

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
/* #501 moved the predicate, unchanged, from files.ts into files-core.ts. */
const DOMAIN_FILES = path.join(APP_ROOT, 'src', 'server', 'domain', 'files-core.ts')

/**
 * Every foreign key into `files(id)` as of issue #263, and what a wrong sweep
 * costs on each. `ON DELETE CASCADE` is the expensive half: the referencing
 * row goes with the picture, so nothing is left to notice.
 *
 * **This list is a movable fixture, and a strict one.** "Never edit a test to
 * make your code pass" does not forbid moving it, because it describes the
 * shape of the schema rather than a behaviour anybody asked Dana for. A
 * migration that adds a sixth foreign key fails this file by design, and the
 * order to work in is:
 *
 * 1. add the matching `NOT EXISTS` arm to `fileIsUnreferenced()` in
 *    `src/server/domain/files.ts`;
 * 2. write the criterion that proves it, on the AC-700 to AC-704 pattern — a
 *    picture held through the new column, aged past thirty days, spared with
 *    its row and its object, beside an identically aged twin that nothing
 *    holds and is taken;
 * 3. then add the row here, and run this file.
 *
 * **Adding the row on its own does not make this file green**, and the
 * sentence it replaces — "doing step 4 on its own makes this file green and
 * leaves the 11.7 tick deleting a picture somebody is looking at" — was false
 * in one direction and true in the other, which is the worst shape a warning
 * can have. It was always false for a new *table*: the second test looked for
 * the relation name, found it missing and went red. It was true for a new
 * *column* on a table already listed — `shelves.banner_file_id` beside
 * `shelves.cover_file_id` — because that test matched on the relation alone,
 * and `folders`, `shelves` and `page_blocks` are exactly the tables that would
 * plausibly grow a banner, an icon or a thumbnail. **That hole is closed**: the
 * second test now ties each relation to the alias the predicate gives it and
 * looks for that alias's own column, so a listed key with no arm is red
 * whether it is a new table or a new column on an old one. The order above is
 * therefore about doing the work in the sensible sequence rather than about
 * keeping a data-destroying sweep honest, and the earlier list's step 3 —
 * "watch the second test below pass on the new arm" — is gone because it
 * measured nothing: that test iterates the list below, which does not contain
 * the new arm until the step after it, so it passed vacuously.
 *
 * **What is still on you and not on this file is step 2.** Nothing structural
 * can see whether the criterion was written.
 *
 * **Worked example, the one this file was written from.** On 2026-09-20 the
 * schema held exactly these five and `fileIsUnreferenced()` named all five, so
 * both tests passed with nothing to move. Removing any one arm from that
 * predicate left the first test green — the schema had not changed — and took
 * the second red naming the column, which is the direction that matters: the
 * guard reports the predicate falling behind the schema, never the reverse.
 * **Measured the same day on the column half, both ways round.** A throwaway
 * migration giving `shelves` a second `banner_file_id uuid REFERENCES
 * files(id)`, with a row added here and no arm in `fileIsUnreferenced()`,
 * passed this file 2 of 2 before the alias match below and fails 1 of 2 after
 * it, naming `shelves.banner_file_id`. And the `page_blocks` arm pointed at
 * `b.id = f.id` instead of `b.file_id = f.id` — a real arm reading a column
 * that cannot hold a file id, with the word `page_blocks` still in the
 * predicate — passed 2 of 2 before and fails 1 of 2 after. **A plain
 * `predicate.includes(arm.column)` would catch the first of those and not the
 * second**, three of the five arms being spelled `file_id`, which is why the
 * alias is read rather than the column alone.
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

/**
 * Whether the predicate names this key: the relation, the alias it introduces
 * for it, and that alias's own column.
 *
 * **The alias is what makes the column half work at all.** Three of the five
 * arms are spelled `file_id`, so a plain substring check for the column name
 * is satisfied by any one of them and a `shelves.banner_file_id` with no arm
 * reads as covered. Reading `FROM shelves s` first and then looking for
 * `s.banner_file_id` asks the question that was meant: does the clause over
 * *this* relation mention *this* column.
 *
 * Written against the predicate's spellings rather than a parse of it. A
 * missing alias falls back to the relation name, so `FROM shelves WHERE
 * shelves.cover_file_id` reads as covered too, and `AS` is admitted because
 * SQL admits it. Anything further from those shapes and the failure message
 * is the thing to read: this file measures one function's text, and a rewrite
 * it cannot follow must point it at whatever replaced it rather than be made
 * green.
 */
function namesArm(
  predicate: string,
  arm: { relation: string; column: string },
): boolean {
  if (!new RegExp(`\\b${arm.relation}\\b`).test(predicate)) return false
  const aliased = new RegExp(
    `\\b${arm.relation}\\s+(?:AS\\s+)?(?!WHERE\\b)(\\w+)`,
    'i',
  ).exec(predicate)
  const alias = aliased?.[1] ?? arm.relation
  return predicate.includes(`${alias}.${arm.column}`)
}

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

describe('the reclaim sweep has an arm for every reference into files', () => {
  test('the schema holds exactly the foreign keys this repository knows about', async () => {
    const live = await referencingColumns()
    const known = KNOWN_ARMS.map((arm) => `${arm.relation}.${arm.column}`).sort()

    expect(
      live,
      'a foreign key into files(id) arrived or left without this list moving. Every one of ' +
        'them is an arm of fileIsUnreferenced() in src/server/domain/files.ts, and a ' +
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

    const missing = KNOWN_ARMS.filter((arm) => !namesArm(predicate, arm)).map(
      (arm) =>
        `${arm.relation}.${arm.column} (${arm.onDelete})` +
        (new RegExp(`\\b${arm.relation}\\b`).test(predicate)
          ? ' — the relation is named but that column is not: either a second ' +
            'key on a table already listed, or an arm pointed at the wrong column'
          : ' — the relation is not named at all'),
    )

    expect(
      missing,
      'these columns can hold a file id and the reclaim predicate does not mention them, ' +
        'so the 11.7 tick will delete a picture they still name once its mark is thirty ' +
        'days old — row and bytes, permanently, with no act by anybody behind it',
    ).toEqual([])
  })
})
