/*
Table fifteen, and the one after it.

**The fact this guard exists for**, in issue #230's words rather than #253's,
because #230 met the same class on the same day and stated it better: **a row
that is never deleted fires no `ON DELETE` clause — not `CASCADE`, not
`SET NULL`, not `RESTRICT` — so a table that keyed its cleanup to `users` is
not cleaned up at all, and nothing anywhere reports it.** 8.10 step 7 scrubs
the `users` row rather than deleting it, deliberately, so that
`tasks.created_by` and the rest of the authorship graph keep resolving; every
clause hanging off that row is therefore dead, with no error, no log line, and
a schema that reads as though the matter were handled. Fourteen `CASCADE` keys
exist in section 4 and `sessions` is a fifteenth outside it, and on 2026-09-20
nine of the fifteen were keeping a departed account's rows indefinitely
(issue #253).

**Two of the three clauses are enumerated here and the third is not, on
purpose.** `CASCADE` promises to take the rows and takes none, which is #253.
`SET NULL` would promise to release a column and would leave it pointing at
the scrubbed account — **there is no such key on `users(id)` in this schema
today**, which is exactly why the next one will be written by somebody
assuming it works, and why it is enumerated rather than waited for.
`RESTRICT` and `NO ACTION` are the harmless direction and are the schema doing
what 8.10 wants, history keeping its author, so they are left alone. The
silent direction is the one that has to be argued for.

**What that means for the next person, which is the whole reason for this
file.** Adding a table with `REFERENCES users(id) ON DELETE CASCADE` is the
natural thing to do and it does not work, and nothing tells you. #227's own
issue text said Personal Labels leave "through ownership cascade"; they would
have outlived every account that made them. The nine tables of step 6c were
each one of those assumptions, and `labels` is the ninth on evidence rather
than on argument: issue #226 landed it on `main` while this branch waited,
this guard went red on `labels_owner_user_id_fkey` in both directions at the
rebase, and 0022_labels.sql's own comment beside the constraint said those
rows "go with their account (8.10)" while nothing took them. Without a guard,
table sixteen is another, and it is found by somebody reading the schema
years later rather than by the suite.

**What is asserted, and why it is three things rather than one.**

1. The catalog walk. Every `ON DELETE CASCADE` or `ON DELETE SET NULL`
   foreign key referencing `users(id)` in `db/constraint-catalog.ts` has an
   entry in `USER_CASCADE_DISPOSALS`, and every entry names a key that exists
   — exactly, in both directions, so a stale entry fails as loudly as a
   missing one. That is the walk issue #253 asks for, widened by one clause.
2. The schema query, which the walk cannot replace. `sessions` is proof:
   it carries such a key and is **not in the catalog at all**, being 10.1's
   table and outside section 4, which AC-001 records as its one admitted
   exception. A guard that only walked the catalog would therefore have been
   blind to the fifteenth key on the day it was written, and would be blind
   to a sixteenth added the same way. So the live migrated schema is read and
   held equal to the catalog plus that one named exception.
3. The binding to the code. An entry may not merely *say* a table is deleted:
   for each `deleted` disposition whose `where` names this transaction's own
   statements, the module source must carry a literal
   `DELETE FROM <table> WHERE`. Without this, the disposal list is a comment
   with a type annotation, and the failure it is supposed to prevent — a
   sentence saying a row is removed while nothing removes it — is exactly the
   failure it would then be made of.

**What it deliberately does not do.** It does not assert that a retention is
*right*, which no test can; it asserts that one was argued, in a sentence a
reviewer reads. And it does not re-assert behaviour: AC-620, AC-621 and
AC-622 delete a real account and read the rows.
*/
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../../db/client.js'
import { constraintCatalog } from '../../db/constraint-catalog.js'
import {
  USER_CASCADE_DISPOSALS,
  USER_RESTRICT_DISPOSALS,
} from '../../src/server/domain/account-deletion.js'
import { createTestDb, rows } from '../support/helpers.js'

/*
`sessions` is 10.1's and sits outside section 4, so `db/constraint-catalog.ts`
does not carry it and AC-001 admits it by name as the one table outside its
enumeration. This list is the same exception, kept at one entry for the same
reason AC-001 keeps its own at one: every *other* difference between the
catalog and the live schema stays a failure, which is the property that makes
the comparison worth running.
*/
const ADMITTED_OUTSIDE_SECTION_4 = ['sessions_user_id_fkey']

const here = path.dirname(fileURLToPath(import.meta.url))
const deletionModule = path.join(
  here,
  '..',
  '..',
  'src',
  'server',
  'domain',
  'account-deletion.ts',
)

/**
 * The clauses that promise to change a row when the referenced user goes, and
 * therefore the ones whose silence costs something. `restrict` and
 * `no action` are absent **from this list** and are enumerated separately
 * below: they promise to *refuse* a delete that never happens, which leaves
 * nothing in a wrong state, and that was the whole of the reasoning until
 * 2026-09-21.
 *
 * **Ruling 6 of issue #210 is why it was not enough.** "Leaves nothing in a
 * wrong state" is true of a row that is meant to outlive the account and false
 * of one that is not, and the two are indistinguishable from the clause. A
 * private facet under `folder_facets.owner_id` is the second kind: writing no
 * other member may read, in a folder the account is leaving, which nothing was
 * ever going to clear and nobody would ever have been able to read or remove
 * again. `USER_RESTRICT_DISPOSALS` makes each of the eighteen say which kind
 * it is, and the pair of tests below hold that list to the schema in both
 * directions.
 */
const SILENTLY_INERT: readonly string[] = ['cascade', 'set null']

/** The clauses that refuse rather than change, enumerated since Ruling 6. */
const REFUSES_RATHER_THAN_CHANGES: readonly string[] = ['restrict', 'no action']

/** The refusing keys on `users(id)` that section 4's catalog describes. */
function catalogRestrictKeys(): string[] {
  const found: string[] = []
  for (const table of Object.values(constraintCatalog)) {
    for (const key of table.foreignKeys) {
      if (
        REFUSES_RATHER_THAN_CHANGES.includes(key.onDelete) &&
        key.references.table === 'users' &&
        key.references.columns.length === 1 &&
        key.references.columns[0] === 'id'
      ) {
        found.push(key.name)
      }
    }
  }
  return found.sort()
}

/** The inert keys on `users(id)` that section 4's catalog describes. */
function catalogCascadeKeys(): string[] {
  const found: string[] = []
  for (const table of Object.values(constraintCatalog)) {
    for (const key of table.foreignKeys) {
      if (
        SILENTLY_INERT.includes(key.onDelete) &&
        key.references.table === 'users' &&
        key.references.columns.length === 1 &&
        key.references.columns[0] === 'id'
      ) {
        found.push(key.name)
      }
    }
  }
  return found.sort()
}

let client: DbClient

beforeAll(async () => {
  client = await createTestDb()
}, 60_000)

afterAll(async () => {
  if ((client as DbClient | undefined) === undefined) return
  await client.close()
})

describe('account deletion sweeps every inert cascade on users(id)', () => {
  test('the disposal list and section 4 name the same foreign keys', () => {
    const declared = USER_CASCADE_DISPOSALS.map((entry) => entry.fk)
      .filter((fk) => !ADMITTED_OUTSIDE_SECTION_4.includes(fk))
      .sort()
    expect(
      declared,
      'every ON DELETE CASCADE or SET NULL key on users(id) needs an entry in USER_CASCADE_DISPOSALS saying what account deletion does about it, and every entry needs a key that still exists. A missing one is a table whose rows outlive the account that made them, in silence, because a row that is never deleted fires no ON DELETE clause at all and 8.10 step 7 scrubs rather than deletes; a stale one is a sentence about a constraint nobody can check.',
    ).toEqual(catalogCascadeKeys())
  })

  test('no entry appears twice, and each carries a reason', () => {
    const names = USER_CASCADE_DISPOSALS.map((entry) => entry.fk)
    expect(
      names.length,
      'one entry per foreign key: two entries for one key means two arguments, and nothing says which is in force',
    ).toBe(new Set(names).size)
    for (const entry of USER_CASCADE_DISPOSALS) {
      expect(
        entry.why.length,
        `${entry.fk} must carry an argument rather than a label: "the cascade handles it" is exactly the false premise this list exists to remove.`,
      ).toBeGreaterThan(80)
      if (entry.disposition === 'deleted') {
        expect(
          entry.where.length,
          `${entry.fk} says its rows are deleted, so it must name the statement that deletes them`,
        ).toBeGreaterThan(0)
      }
    }
  })

  test('every "deleted here" entry has a statement in the module', () => {
    const source = readFileSync(deletionModule, 'utf8')
    const swept = USER_CASCADE_DISPOSALS.filter(
      (entry) =>
        entry.disposition === 'deleted' && entry.where.includes('step 6c'),
    )
    expect(
      swept.length,
      "step 6c is the sweep this guard is about, so it must not be empty: an empty one means the nine tables went back to relying on a cascade that cannot fire",
    ).toBeGreaterThan(0)
    for (const entry of swept) {
      expect(
        source.includes(`DELETE FROM ${entry.table} WHERE`),
        `${entry.table} is declared as swept at step 6c, and account-deletion.ts carries no scoped "DELETE FROM ${entry.table} WHERE". A disposal entry is a sentence; this is the check that the sentence is true of the code beside it.`,
      ).toBe(true)
    }
  })

  test('the live schema holds no cascade on users(id) the catalog missed', async () => {
    const found = await rows(
      client.db,
      sql`SELECT c.conname AS name
            FROM pg_constraint c
            JOIN pg_class child ON child.oid = c.conrelid
            JOIN pg_class parent ON parent.oid = c.confrelid
            JOIN pg_namespace n ON n.oid = child.relnamespace
           WHERE c.contype = 'f'
             AND c.confdeltype IN ('c', 'n')
             AND parent.relname = 'users'
             AND n.nspname = 'public'`,
    )
    const live = found.map((row) => String(row.name)).sort()
    expect(
      live,
      'the migrated schema and USER_CASCADE_DISPOSALS must name the same keys, over both the clauses that fire on a delete that never comes. This is the half the catalog walk cannot do: sessions_user_id_fkey is one of these and db/constraint-catalog.ts has never carried it, so a table added outside section 4 the same way would be invisible to a guard that read the catalog alone (spec 10.1, AC-001).',
    ).toEqual(USER_CASCADE_DISPOSALS.map((entry) => entry.fk).sort())
  })

  test('every refusing key on users(id) says whether its rows are swept or outlive', async () => {
    /* Ruling 6 of issue #210, and it is the half this guard was blind to. The
       catalog and the live schema are both read, because the cascade half
       above records that `sessions_user_id_fkey` is outside section 4 and a
       table added the same way would be invisible to a catalog walk alone. */
    const declared = USER_RESTRICT_DISPOSALS.map((entry) => entry.fk).sort()
    expect(
      declared,
      'every ON DELETE RESTRICT or NO ACTION key on users(id) needs an entry in USER_RESTRICT_DISPOSALS saying whether a statement sweeps its rows or whether they deliberately outlive the account. "It only refuses a delete that never comes" is true of a row meant to outlive and false of one that is not, and the clause cannot tell you which: a departed member\'s private facet is the row that would survive, readable by nobody and removable by nobody (spec 4.30).',
    ).toEqual(catalogRestrictKeys())

    const live = await rows(
      client.db,
      sql`SELECT c.conname AS name
            FROM pg_constraint c
            JOIN pg_class child ON child.oid = c.conrelid
            JOIN pg_class parent ON parent.oid = c.confrelid
            JOIN pg_namespace n ON n.oid = child.relnamespace
           WHERE c.contype = 'f'
             AND c.confdeltype IN ('r', 'a')
             AND parent.relname = 'users'
             AND n.nspname = 'public'`,
    )
    expect(
      live.map((row) => String(row.name)).sort(),
      'and the migrated schema names the same keys, so a nineteenth is a decision somebody writes down rather than a silence',
    ).toEqual(declared)
  })

  test('every swept refusing key names a statement that exists', () => {
    const swept = USER_RESTRICT_DISPOSALS.filter(
      (entry) => entry.disposition === 'swept',
    )
    expect(
      swept.map((entry) => entry.fk).sort(),
      "three keys are swept rather than left to outlive: the account's own folders, its own uploads, and its private facets in folders it is leaving (4.30). A fourth appearing is a decision to read",
    ).toEqual([
      'files_owner_id_fkey',
      'folder_facets_owner_id_fkey',
      'folders_owner_id_fkey',
    ])
    for (const entry of USER_RESTRICT_DISPOSALS) {
      expect(
        entry.why.length,
        `${entry.fk} must carry an argument rather than a label, on the same rule the cascade list keeps`,
      ).toBeGreaterThan(80)
      /* Both directions, and the second is the one that was missing. An
         entry that says its rows are **swept** must name the statement; an
         entry that says they **outlive** must name none, because a `where`
         on one of those is a sentence claiming a sweep that is not happening
         -- which is exactly the shape of wrongness this whole list exists to
         refuse. The line that stood here was `expect(X).toBe(X)` over the
         same ternary twice and could never fail; found by the verification
         of 743a6ac. */
      if (entry.disposition === 'swept') {
        expect(
          entry.where.length,
          `${entry.fk} says its rows are swept and names no statement`,
        ).toBeGreaterThan(0)
      } else {
        expect(
          entry.where,
          `${entry.fk} says its rows outlive the account and names a statement anyway. One of the two is wrong, and a "where" nobody runs is the more dangerous half: it reads as a sweep that is happening`,
        ).toBe('')
      }
    }

    /* The one that is not in `account-deletion.ts` at all, and the reason is
       worth an assertion rather than a sentence: R-CLEAN is where a leave, a
       removal and 8.10 step 4 all meet, so the facet sweep is written once
       there and a hook on the deletion module would have missed two of the
       three paths. */
    const folders = readFileSync(
      path.join(here, '..', '..', 'src', 'server', 'domain', 'folders.ts'),
      'utf8',
    )
    expect(
      folders.includes('deletePrivateFacetsOf(tx, folderId, leaverId)'),
      "4.30 deletes private facets whenever a membership ends, so the sweep lives inside runRClean, the one place member removal, leaving and 8.10 step 4 all pass through. A hook on removeMembership would cover the first two and silently miss every account deletion.",
    ).toBe(true)
  })

  test('the retentions are deliberate', () => {
    const retained = USER_CASCADE_DISPOSALS.filter(
      (entry) => entry.disposition === 'retained',
    )
    expect(
      retained.map((entry) => entry.fk),
      'Every retained key must have an argument in 8.10 and its disposition beside the deletion code.',
    ).toEqual(['folders_archived_by_fkey', 'page_document_receipts_actor_id_fkey'])
  })
})
