/*
AC-001: given migrations on an empty database, when the constraint catalog is
diffed against section 4, then every table, FK with its on-delete action,
CHECK, unique index, and index exists.

The expected side is app/db/constraint-catalog.ts, the Data engineer's hand
transcription of section 4, consumed here as data under the comparison rules
its header documents. Assertions read structured facts from pg_constraint and
pg_index, never deparsed SQL text (spec 11.10), so the same test passes on
PGlite and on a real Postgres. The two behavioural probes at the end read a
rejection's SQLSTATE and structured fields, or a constraint name, never the
server's message, so they pass whatever language that server writes in (issue
#92). Every list comparison is exact in both directions: a missing item and an
unexpected extra are equally red.

Two things are asserted independently of the catalog file, because the
catalog and the migration are allowed to change together in a single
defective commit: the table list, transcribed here straight from section 4,
and the composite assignee foreign key of 4.5, the one constraint in the
schema whose exact on-delete behavior no P0 criterion proves behaviorally.

Deferrability is asserted over every constraint the catalog names, not over
the foreign keys alone, and it is section 4 that fixes it: 4.15 records
comments_task_scope_fkey as DEFERRABLE INITIALLY IMMEDIATE since migration
0007, so that 7.6's move can re-scope a conversation inside one transaction.
A constraint that defers is one a transaction may hold broken across
statements, so the absence of the flag is asserted here as firmly as its
presence, and any other constraint quietly made deferrable is red. The same
comparison exists in db/verify.ts, which no CI step and no test runs (issue
#75); this is the copy that runs on both legs, so a fix-forward migration
dropping DEFERRABLE from 0007's constraint now fails the suite rather than
passing it.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../db/client.js'
import { constraintCatalog } from '../db/constraint-catalog.js'
import type { ExpectedTable, OnDelete } from '../db/constraint-catalog.js'
import {
  cleanupUsers,
  createTestDb,
  expectRejectedBy,
  expectRejectedWith,
  rows,
} from './helpers.js'

// Transcribed from section 4 directly, not read from the catalog file, so a
// catalog edit that drops or renames a table cannot narrow this suite's
// coverage without going red here.
const SECTION_4_TABLES = [
  'comment_files',
  'comment_likes',
  'comments',
  'connections',
  'events',
  'files',
  'folder_members',
  'folders',
  'invites',
  'my_day_entries',
  'notifications',
  'page_blocks',
  'reminders',
  'sample_objects',
  'shelves',
  'steps',
  'tasks',
  'user_page_covers',
  'user_page_descriptions',
  'user_settings',
  'user_views',
  'users',
]

// Section 10.1's sessions table is deliberately outside the section 4 model,
// and the 2026-07-31 amendment names it "the one named exception" this
// catalog admits. Admitted means tolerated, not required: AC-001 is about
// section 4, so it must neither fail when P1 adds the table nor pretend to
// assert a table section 4 does not describe. The table's own contract is
// asserted by AC-113, which is the criterion 10.1 fixes it for.
//
// This stays a list of one on purpose. Every other unexpected table is still
// a failure, which is the property that makes the exact comparison worth
// having.
const ADMITTED_OUTSIDE_SECTION_4 = ['sessions']

const onDeleteByCode: Record<string, OnDelete> = {
  c: 'cascade',
  r: 'restrict',
  n: 'set null',
  a: 'no action',
}

interface ActualConstraint {
  contype: string
  columns: string[]
  refTable: string | null
  refColumns: string[]
  onDelete: OnDelete | null
  onDeleteSetColumns: string[]
  deferrable: boolean
  deferred: boolean
}

interface ActualIndex {
  unique: boolean
  partial: boolean
  method: string
  columns: string[]
  descColumns: string[]
}

let client: DbClient
const createdUserIds: string[] = []

// Cold PGlite instances compile WASM, and parallel workers all do it at
// once, so setup gets far more than the default hook timeout.
beforeAll(async () => {
  client = await createTestDb()
}, 60_000)

afterAll(async () => {
  // Setup can fail before assignment; a missing client must not bury the
  // original failure under a TypeError.
  if ((client as DbClient | undefined) === undefined) return
  await cleanupUsers(client.db, createdUserIds)
  await client.close()
})

async function constraintsOf(
  table: string,
): Promise<Map<string, ActualConstraint>> {
  // Postgres 18 additionally catalogs NOT NULL as contype 'n' rows; the
  // catalog header places those outside AC-001's enumeration, so the filter
  // keeps only primary key, unique, check, and foreign key rows. The attname
  // aggregates are cast to text[] because node-postgres leaves name[]
  // unparsed while PGlite parses it; text[] parses on both.
  const raw = await rows(
    client.db,
    sql`
      SELECT
        c.conname AS name,
        c.contype::text AS contype,
        c.confdeltype::text AS on_delete_code,
        c.condeferrable AS deferrable,
        c.condeferred AS deferred,
        ref.relname AS ref_table,
        (SELECT array_agg(a.attname ORDER BY k.ord)::text[]
           FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols,
        (SELECT array_agg(a.attname ORDER BY k.ord)::text[]
           FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ord)
           JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum) AS ref_cols,
        (SELECT array_agg(a.attname ORDER BY a.attname)::text[]
           FROM unnest(c.confdelsetcols) k(attnum)
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS set_cols
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      LEFT JOIN pg_class ref ON ref.oid = c.confrelid
      WHERE n.nspname = 'public' AND t.relname = ${table}
        AND c.contype IN ('p', 'u', 'c', 'f')
    `,
  )
  const map = new Map<string, ActualConstraint>()
  for (const row of raw) {
    map.set(String(row.name), {
      contype: String(row.contype),
      columns: (row.cols as string[] | null) ?? [],
      refTable: row.ref_table === null ? null : String(row.ref_table),
      refColumns: (row.ref_cols as string[] | null) ?? [],
      onDelete:
        row.contype === 'f'
          ? (onDeleteByCode[String(row.on_delete_code)] ?? null)
          : null,
      onDeleteSetColumns: (row.set_cols as string[] | null) ?? [],
      deferrable: Boolean(row.deferrable),
      deferred: Boolean(row.deferred),
    })
  }
  return map
}

async function standaloneIndexesOf(
  table: string,
): Promise<Map<string, ActualIndex>> {
  // Primary key and unique constraints arrive with backing indexes named
  // like the constraint; those are already asserted through pg_constraint,
  // so only standalone CREATE INDEX statements are compared here (catalog
  // header). Expression members carry attnum 0 in indkey and surface as the
  // literal 'expr'; the DESC bit is indoption bit 0 per column.
  const raw = await rows(
    client.db,
    sql`
      SELECT
        i.relname AS name,
        x.indisunique AS is_unique,
        x.indpred IS NOT NULL AS is_partial,
        am.amname AS method,
        (SELECT array_agg(CASE WHEN k.attnum = 0 THEN 'expr' ELSE a.attname END ORDER BY k.ord)::text[]
           FROM unnest(x.indkey::int2[]) WITH ORDINALITY k(attnum, ord)
           LEFT JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum) AS cols,
        (SELECT array_agg(k.opt::int4 ORDER BY k.ord)
           FROM unnest(x.indoption::int2[]) WITH ORDINALITY k(opt, ord)) AS opts
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_class t ON t.oid = x.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_am am ON am.oid = i.relam
      WHERE n.nspname = 'public' AND t.relname = ${table}
        AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = x.indexrelid)
    `,
  )
  const map = new Map<string, ActualIndex>()
  for (const row of raw) {
    const columns = (row.cols as string[] | null) ?? []
    const opts = ((row.opts as number[] | null) ?? []).map(Number)
    map.set(String(row.name), {
      unique: Boolean(row.is_unique),
      partial: Boolean(row.is_partial),
      method: String(row.method),
      columns,
      descColumns: columns.filter((_, i) => ((opts[i] ?? 0) & 1) === 1),
    })
  }
  return map
}

describe('AC-001: migrated schema matches the section 4 catalog', () => {
  test('the ten tables of section 4 exist, exactly, and the catalog covers them', async () => {
    const raw = await rows(
      client.db,
      sql`
        SELECT t.relname AS name
        FROM pg_class t
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' AND t.relkind = 'r'
      `,
    )
    const present = raw.map((r) => String(r.name)).sort()
    expect(
      present.filter((name) => !ADMITTED_OUTSIDE_SECTION_4.includes(name)),
      `the migrated tables do not match section 4; the only table admitted outside it is ${ADMITTED_OUTSIDE_SECTION_4.join(', ')} (spec 10.1)`,
    ).toEqual(SECTION_4_TABLES)
    // The catalog itself admits nothing: 10.1 keeps sessions out of it, so a
    // catalog that grew an entry for the table would be transcribing a table
    // section 4 does not describe.
    expect(Object.keys(constraintCatalog).sort()).toEqual(SECTION_4_TABLES)
  })

  for (const [table, expected] of Object.entries(constraintCatalog) as [
    string,
    ExpectedTable,
  ][]) {
    test(`${table}: constraints match by name, type, columns, and on-delete action`, async () => {
      const actual = await constraintsOf(table)
      const expectedNames = [
        expected.primaryKey.name,
        ...expected.uniques.map((u) => u.name),
        ...expected.checks.map((c) => c.name),
        ...expected.foreignKeys.map((f) => f.name),
      ].sort()
      expect([...actual.keys()].sort()).toEqual(expectedNames)

      const pk = actual.get(expected.primaryKey.name)
      expect(pk?.contype, expected.primaryKey.name).toBe('p')
      expect(pk?.columns, expected.primaryKey.name).toEqual(
        expected.primaryKey.columns,
      )

      for (const unique of expected.uniques) {
        const row = actual.get(unique.name)
        expect(row?.contype, unique.name).toBe('u')
        expect(row?.columns, unique.name).toEqual(unique.columns)
      }

      for (const check of expected.checks) {
        const row = actual.get(check.name)
        expect(row?.contype, check.name).toBe('c')
        // CHECK column lists compare sorted: the expression imposes no
        // column order (catalog header).
        expect([...(row?.columns ?? [])].sort(), check.name).toEqual(
          check.columns,
        )
      }

      for (const fk of expected.foreignKeys) {
        const row = actual.get(fk.name)
        expect(row?.contype, fk.name).toBe('f')
        expect(row?.columns, fk.name).toEqual(fk.columns)
        expect(row?.refTable, fk.name).toBe(fk.references.table)
        expect(row?.refColumns, fk.name).toEqual(fk.references.columns)
        expect(row?.onDelete, fk.name).toBe(fk.onDelete)
        expect([...(row?.onDeleteSetColumns ?? [])].sort(), fk.name).toEqual(
          [...(fk.onDeleteSetColumns ?? [])].sort(),
        )
      }

      // Deferrability, over every catalogued constraint rather than over the
      // foreign keys alone: an absent flag asserts INITIALLY IMMEDIATE rather
      // than skipping, so a constraint quietly made deferrable is as red as
      // 4.15's deferrable one losing its flag. Postgres admits no deferrable
      // CHECK, and a primary key or unique constraint can be made deferrable,
      // which is why the map starts from every name and not from the foreign
      // keys.
      const expectedDeferral = new Map<
        string,
        { deferrable: boolean; deferred: boolean }
      >(expectedNames.map((name) => [name, { deferrable: false, deferred: false }]))
      for (const fk of expected.foreignKeys) {
        expectedDeferral.set(fk.name, {
          deferrable: fk.deferrable ?? false,
          deferred: fk.initiallyDeferred ?? false,
        })
      }
      for (const [name, want] of expectedDeferral) {
        const row = actual.get(name)
        expect(
          { deferrable: row?.deferrable, deferred: row?.deferred },
          name,
        ).toEqual(want)
      }
    })

    test(`${table}: standalone indexes match by name, uniqueness, method, partiality, and column order`, async () => {
      const actual = await standaloneIndexesOf(table)
      expect([...actual.keys()].sort()).toEqual(
        expected.indexes.map((i) => i.name).sort(),
      )
      for (const index of expected.indexes) {
        const row = actual.get(index.name)
        expect(row?.unique, index.name).toBe(index.unique)
        expect(row?.partial, index.name).toBe(index.partial)
        expect(row?.method, index.name).toBe(index.method ?? 'btree')
        expect(row?.columns, index.name).toEqual(index.columns)
        // Absent descColumns asserts all-ascending rather than skipping: an
        // accidental DESC anywhere would silently diverge from the frozen
        // 4.12 otherwise.
        expect(row?.descColumns, index.name).toEqual(index.descColumns ?? [])
      }
    })
  }

  test('spec anchor 4.5: losing membership unassigns, and only unassigns, the task', async () => {
    const actual = await constraintsOf('tasks')
    const fk = actual.get('tasks_assignee_membership_fkey')
    expect(fk?.contype).toBe('f')
    expect(fk?.columns).toEqual(['folder_id', 'assignee_id'])
    expect(fk?.refTable).toBe('folder_members')
    expect(fk?.refColumns).toEqual(['folder_id', 'user_id'])
    expect(fk?.onDelete).toBe('set null')
    expect(fk?.onDeleteSetColumns).toEqual(['assignee_id'])
  })

  test('AC-001 adversarial: NOT NULL is outside the named catalog but still enforced (INV-1)', async () => {
    // The catalog compares named constraints only; Postgres 18's contype 'n'
    // rows are excluded by its header. One behavioral probe keeps the class
    // covered, on the half of INV-1 that the foreign key alone cannot
    // enforce: a task with no folder at all.
    const userId = randomUUID()
    createdUserIds.push(userId)
    await client.db.execute(sql`INSERT INTO users (id) VALUES (${userId})`)
    // Attributed through the server's structured error fields rather than
    // its message: SQLSTATE 23502 is not_null_violation, and the table and
    // column arrive as fields of the ErrorResponse in their own right, set
    // by the server from the attribute that failed. The column name also
    // appears in the statement sent, so a fragment matched against text
    // could be satisfied by the statement itself and prove nothing; a field
    // the server wrote cannot be. The message is prose in the cluster's
    // language, which is why the English fragment this used to match was
    // the one assertion in the suite that could not run on a database the
    // Postgres leg creates for itself (spec 11.10, issue #92).
    await expectRejectedWith(
      () =>
        client.db.execute(sql`
          INSERT INTO tasks (folder_id, title, created_by)
          VALUES (NULL, 'A task with no folder', ${userId})
        `),
      { code: '23502', table: 'tasks', column: 'folder_id' },
    )
  })

  test('AC-001 adversarial: email uniqueness applies to active users only (4.1)', async () => {
    // users_email_active_idx is partial on deleted_at IS NULL. The predicate
    // text is deliberately not in the catalog, so behavior pins it: a soft
    // deleted user must free the address, a plain unique would not.
    const first = randomUUID()
    const second = randomUUID()
    createdUserIds.push(first, second)
    const email = `${first}@example.com`
    await client.db.execute(
      sql`INSERT INTO users (id, email) VALUES (${first}, ${email})`,
    )
    await expectRejectedBy(
      () =>
        client.db.execute(
          sql`INSERT INTO users (id, email) VALUES (${second}, ${email})`,
        ),
      'users_email_active_idx',
    )
    await client.db.execute(
      sql`UPDATE users SET deleted_at = now() WHERE id = ${first}`,
    )
    await client.db.execute(
      sql`INSERT INTO users (id, email) VALUES (${second}, ${email})`,
    )
    const survivors = await rows(
      client.db,
      sql`SELECT count(*)::int AS n FROM users WHERE email = ${email} AND deleted_at IS NULL`,
    )
    expect(Number(survivors[0]?.n)).toBe(1)
  })
})
