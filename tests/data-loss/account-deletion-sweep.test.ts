/*
Account deletion scrubs the users row and does not delete it, so no ON DELETE clause on users(id) fires.
Each such key needs an entry in account-deletion.ts that says what happens to its rows (issue #253).
The keys are read from the migrated schema.
*/
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../../db/client.js'
import {
  USER_CASCADE_DISPOSALS,
  USER_RESTRICT_DISPOSALS,
} from '../../src/server/domain/account-deletion.js'
import { createTestDb, rows } from '../support/helpers.js'

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

let client: DbClient

beforeAll(async () => {
  client = await createTestDb()
}, 60_000)

afterAll(async () => {
  if ((client as DbClient | undefined) === undefined) return
  await client.close()
})

describe('account deletion sweeps every inert cascade on users(id)', () => {
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

  test('the live schema and the cascade list name the same keys on users(id)', async () => {
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
      'every ON DELETE CASCADE or SET NULL key on users(id) needs one entry in USER_CASCADE_DISPOSALS, and every entry needs a key that exists. A missing entry is a table whose rows outlive the account.',
    ).toEqual(USER_CASCADE_DISPOSALS.map((entry) => entry.fk).sort())
  })

  test('every refusing key on users(id) says whether its rows are swept or outlive', async () => {
    const declared = USER_RESTRICT_DISPOSALS.map((entry) => entry.fk).sort()
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
    ).toEqual([
      'folders_archived_by_fkey',
      'folder_members_bio_author_id_fkey',
      'folder_members_bio_last_editor_id_fkey',
      'page_document_receipts_actor_id_fkey',
    ])
  })
})
