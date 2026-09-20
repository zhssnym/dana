/*
Applies the migrations to a fresh database and diffs the live catalog facts
in pg_constraint and pg_index against constraint-catalog.ts, using the shape
rules that file documents. This is the data owner's own hygiene check for
keeping DDL, catalog, and spec section 4 in exact correspondence; the AC-001
acceptance test belongs to the Adversarial Test Engineer. Run from app/ with:
npx tsx db/verify.ts (in-memory PGlite, or TEST_DATABASE_URL through the
seam's fallback). Exits nonzero on any difference.
*/
import { sql } from 'drizzle-orm'

import { createDbClient } from './client.js'
import { constraintCatalog } from './constraint-catalog.js'
import type { ExpectedTable, OnDelete } from './constraint-catalog.js'

const client = await createDbClient()
await client.runMigrations()
const { db } = client

interface Row {
  [key: string]: unknown
}

async function rows(query: ReturnType<typeof sql>): Promise<Row[]> {
  const res = (await db.execute(query)) as unknown as { rows: Row[] }
  return res.rows
}

const problems: string[] = []
function problem(message: string): void {
  problems.push(message)
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

const onDeleteByCode: Record<string, OnDelete> = {
  c: 'cascade',
  r: 'restrict',
  n: 'set null',
  a: 'no action',
}

const tableRows = await rows(sql`
  SELECT t.relname AS name
  FROM pg_class t
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND t.relkind = 'r'
`)
// 10.1 keeps the sessions table out of the section 4 catalog, and AC-001
// admits it as the one named exception; this diff mirrors that ruling. The
// table's own contract is AC-113's to assert, not this file's.
const ADMITTED_OUTSIDE_SECTION_4 = ['sessions']
const actualTables = tableRows
  .map((r) => String(r.name))
  .filter((name) => !ADMITTED_OUTSIDE_SECTION_4.includes(name))
  .sort()
const expectedTables = Object.keys(constraintCatalog).sort()
if (!sameList(actualTables, expectedTables)) {
  problem(`tables: expected [${expectedTables.join(', ')}], found [${actualTables.join(', ')}]`)
}

for (const [table, expected] of Object.entries(constraintCatalog) as [
  string,
  ExpectedTable,
][]) {
  // The attname aggregates are cast to text[] because node-postgres leaves
  // name[] unparsed as a string while PGlite parses it; text[] parses on both.
  const conRows = await rows(sql`
    SELECT
      c.conname AS name,
      c.contype AS contype,
      c.confdeltype AS ondelete,
      c.condeferrable AS deferrable,
      c.condeferred AS deferred,
      rt.relname AS ref_table,
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
    LEFT JOIN pg_class rt ON rt.oid = c.confrelid
    WHERE n.nspname = 'public' AND t.relname = ${table}
      AND c.contype IN ('p', 'u', 'c', 'f')
  `)

  const byName = new Map(conRows.map((r) => [String(r.name), r]))
  const expectedNames = [
    expected.primaryKey.name,
    ...expected.uniques.map((u) => u.name),
    ...expected.checks.map((c) => c.name),
    ...expected.foreignKeys.map((f) => f.name),
  ].sort()
  const actualNames = [...byName.keys()].sort()
  if (!sameList(actualNames, expectedNames)) {
    problem(`${table} constraints: expected [${expectedNames.join(', ')}], found [${actualNames.join(', ')}]`)
  }

  const pk = byName.get(expected.primaryKey.name)
  if (pk === undefined || pk.contype !== 'p') {
    problem(`${table}: primary key ${expected.primaryKey.name} missing or not type p`)
  } else if (!sameList(expected.primaryKey.columns, (pk.cols as string[] | null) ?? [])) {
    problem(`${table}.${expected.primaryKey.name}: columns ${String(pk.cols)}`)
  }

  for (const u of expected.uniques) {
    const row = byName.get(u.name)
    if (row === undefined || row.contype !== 'u') {
      problem(`${table}: unique ${u.name} missing or not type u`)
    } else if (!sameList(u.columns, (row.cols as string[] | null) ?? [])) {
      problem(`${table}.${u.name}: columns ${String(row.cols)}`)
    }
  }

  for (const check of expected.checks) {
    const row = byName.get(check.name)
    if (row === undefined || row.contype !== 'c') {
      problem(`${table}: check ${check.name} missing or not type c`)
    } else {
      const actualCols = [...((row.cols as string[] | null) ?? [])].sort()
      if (!sameList(check.columns, actualCols)) {
        problem(`${table}.${check.name}: columns [${actualCols.join(', ')}]`)
      }
    }
  }

  for (const fk of expected.foreignKeys) {
    const row = byName.get(fk.name)
    if (row === undefined || row.contype !== 'f') {
      problem(`${table}: foreign key ${fk.name} missing or not type f`)
      continue
    }
    if (!sameList(fk.columns, (row.cols as string[] | null) ?? [])) {
      problem(`${table}.${fk.name}: columns ${String(row.cols)}`)
    }
    if (row.ref_table !== fk.references.table) {
      problem(`${table}.${fk.name}: references ${String(row.ref_table)}`)
    }
    if (!sameList(fk.references.columns, (row.ref_cols as string[] | null) ?? [])) {
      problem(`${table}.${fk.name}: referenced columns ${String(row.ref_cols)}`)
    }
    const actualOnDelete = onDeleteByCode[String(row.ondelete)]
    if (actualOnDelete !== fk.onDelete) {
      problem(`${table}.${fk.name}: on delete ${String(actualOnDelete)}, expected ${fk.onDelete}`)
    }
    const actualSetCols = (row.set_cols as string[] | null) ?? []
    const expectedSetCols = fk.onDeleteSetColumns ?? []
    if (!sameList([...expectedSetCols].sort(), [...actualSetCols].sort())) {
      problem(`${table}.${fk.name}: on delete set columns [${actualSetCols.join(', ')}]`)
    }
  }

  /*
  Deferrability, over every constraint the catalog names rather than over
  the foreign keys alone. Migration 0007 made comments_task_scope_fkey
  DEFERRABLE INITIALLY IMMEDIATE so 7.6's move can re-scope a conversation
  inside one transaction, and until this loop existed nothing anywhere
  observed that: the migration could be reverted, or any other constraint
  quietly made deferrable, and every check in this file and in AC-001 still
  passed. A constraint that defers is a constraint a transaction may hold
  broken across statements, so the absence of the flag is asserted as
  firmly as its presence.

  The same comparison now runs in tests/criteria/ac-001-constraint-catalog.test.ts,
  which is the copy CI executes: nothing runs this file, which was issue #75.
  It is kept here rather than deleted because this file is the data owner's
  whole-catalog check and a half of it missing would make the two disagree
  about what they cover; they read the same catalog, so they cannot disagree
  about the answer.
  */
  const expectedDeferral = new Map<string, { deferrable: boolean; deferred: boolean }>(
    expectedNames.map((name) => [name, { deferrable: false, deferred: false }]),
  )
  for (const fk of expected.foreignKeys) {
    expectedDeferral.set(fk.name, {
      deferrable: fk.deferrable ?? false,
      deferred: fk.initiallyDeferred ?? false,
    })
  }
  for (const [name, want] of expectedDeferral) {
    const row = byName.get(name)
    if (row === undefined) continue
    const isDeferrable = row.deferrable === true
    const isDeferred = row.deferred === true
    if (isDeferrable !== want.deferrable || isDeferred !== want.deferred) {
      problem(
        `${table}.${name}: deferrable=${String(isDeferrable)} initially deferred=${String(isDeferred)}, expected deferrable=${String(want.deferrable)} initially deferred=${String(want.deferred)}`,
      )
    }
  }

  const idxRows = await rows(sql`
    SELECT
      i.relname AS name,
      x.indisunique AS is_unique,
      am.amname AS method,
      x.indpred IS NOT NULL AS partial,
      (SELECT array_agg(CASE WHEN k.attnum = 0 THEN 'expr' ELSE a.attname END ORDER BY k.ord)::text[]
         FROM unnest(x.indkey::int2[]) WITH ORDINALITY k(attnum, ord)
         LEFT JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum) AS cols,
      (SELECT array_agg(k.opt ORDER BY k.ord)
         FROM unnest(x.indoption::int2[]) WITH ORDINALITY k(opt, ord)) AS opts
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_am am ON am.oid = i.relam
    WHERE n.nspname = 'public' AND t.relname = ${table}
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = x.indexrelid)
  `)
  const idxByName = new Map(idxRows.map((r) => [String(r.name), r]))
  const expectedIdxNames = expected.indexes.map((i) => i.name).sort()
  const actualIdxNames = [...idxByName.keys()].sort()
  if (!sameList(actualIdxNames, expectedIdxNames)) {
    problem(`${table} indexes: expected [${expectedIdxNames.join(', ')}], found [${actualIdxNames.join(', ')}]`)
  }

  for (const idx of expected.indexes) {
    const row = idxByName.get(idx.name)
    if (row === undefined) continue
    if (Boolean(row.is_unique) !== idx.unique) {
      problem(`${idx.name}: unique ${String(row.is_unique)}`)
    }
    if (Boolean(row.partial) !== idx.partial) {
      problem(`${idx.name}: partial ${String(row.partial)}`)
    }
    const method = idx.method ?? 'btree'
    if (row.method !== method) {
      problem(`${idx.name}: method ${String(row.method)}, expected ${method}`)
    }
    if (!sameList(idx.columns, (row.cols as string[] | null) ?? [])) {
      problem(`${idx.name}: columns ${String(row.cols)}`)
    }
    // Absent descColumns means all ascending, and that is asserted, not
    // skipped: an accidental DESC anywhere would silently diverge from the
    // frozen 4.12 otherwise.
    const opts = ((row.opts as (number | string)[] | null) ?? []).map(Number)
    const cols = (row.cols as string[] | null) ?? []
    const actualDesc = cols.filter((_, i) => ((opts[i] ?? 0) & 1) === 1)
    if (!sameList(idx.descColumns ?? [], actualDesc)) {
      problem(`${idx.name}: descending columns [${actualDesc.join(', ')}]`)
    }
  }
}

await client.close()

if (problems.length > 0) {
  process.stderr.write(`catalog verification failed (${String(problems.length)}):\n`)
  for (const p of problems) {
    process.stderr.write(`  ${p}\n`)
  }
  process.exit(1)
}
process.stdout.write(`catalog verified: ${String(expectedTables.length)} tables match (${client.kind})\n`)
