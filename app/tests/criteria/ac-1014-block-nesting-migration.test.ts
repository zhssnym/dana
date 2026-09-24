/*
AC-1014: migration 0038 (any block nests, toggle headings) runs over a
database that already holds nested content and changes none of it, and the
two CHECKs it writes admit exactly what 4.17 says.

The database is built through 0037 first, from a copy of the journal cut
before 0038, so the rows exist before 0038 runs exactly as in production;
then the real migrations folder is applied on top. It runs on PGlite whichever
leg is selected: what is under test is the migration SQL.

Spec: 4.17; migration 0038.
*/
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { expectRejectedBy, rows } from '../support/helpers.js'

const migrationsFolder = path.resolve(process.cwd(), 'db', 'migrations')

interface JournalEntry {
  idx: number
  when: number
  tag: string
}

let pglite: PGlite
let db: PgliteDatabase
let scratch: string

const ids = {
  owner: '00000000-0000-4000-8000-000000000001',
  folder: '10000000-0000-4000-8000-000000000001',
  task: '20000000-0000-4000-8000-000000000001',
  section: '30000000-0000-4000-8000-000000000001',
  bullet: '30000000-0000-4000-8000-000000000002',
  subBullet: '30000000-0000-4000-8000-000000000003',
  toggle: '30000000-0000-4000-8000-000000000004',
  inToggle: '30000000-0000-4000-8000-000000000005',
  heading: '30000000-0000-4000-8000-000000000006',
  taskParagraph: '30000000-0000-4000-8000-000000000007',
  taskHeading: '30000000-0000-4000-8000-000000000008',
}

type Snapshot = Record<string, unknown>[]
let before: Snapshot

async function blocksSnapshot(): Promise<Snapshot> {
  return rows(
    db,
    sql`SELECT id, folder_id, task_id, kind, text, section_block_id, list_parent_block_id,
               checked, page_position, updated_at::text AS updated_at
          FROM page_blocks ORDER BY id`,
  )
}

beforeAll(async () => {
  scratch = mkdtempSync(path.join(tmpdir(), 'dana-0038-'))
  mkdirSync(path.join(scratch, 'meta'))
  const journal = JSON.parse(
    readFileSync(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: JournalEntry[] }
  const cut = journal.entries.findIndex((entry) => entry.tag.startsWith('0038_'))
  expect(cut).toBeGreaterThan(0)
  const through0037 = journal.entries.slice(0, cut)
  for (const entry of through0037) {
    copyFileSync(
      path.join(migrationsFolder, `${entry.tag}.sql`),
      path.join(scratch, `${entry.tag}.sql`),
    )
  }
  writeFileSync(
    path.join(scratch, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries: through0037 }),
  )

  pglite = await PGlite.create({ extensions: { pg_trgm } })
  db = drizzle(pglite)
  await migrate(db, { migrationsFolder: scratch })

  await db.execute(sql`INSERT INTO users (id, display_name) VALUES (${ids.owner}::uuid, 'Owner')`)
  await db.execute(sql`
    INSERT INTO folders (id, owner_id, name, is_default) VALUES
      (${ids.folder}::uuid, ${ids.owner}::uuid, 'Nested', false)`)
  await db.execute(sql`
    INSERT INTO tasks (id, folder_id, title, created_by) VALUES
      (${ids.task}::uuid, ${ids.folder}::uuid, 'A task', ${ids.owner}::uuid)`)
  // What 0037 admits: list items under list items, writing under a toggle,
  // inside a Section; and a flat Task document.
  await db.execute(sql`
    INSERT INTO page_blocks (id, folder_id, kind, position, page_position, text) VALUES
      (${ids.section}::uuid, ${ids.folder}::uuid, 'section', 0, 'a0', 'Work'),
      (${ids.bullet}::uuid, ${ids.folder}::uuid, 'bullet', 1, 'a1', 'point'),
      (${ids.subBullet}::uuid, ${ids.folder}::uuid, 'bullet', 2, 'a2', 'sub point'),
      (${ids.toggle}::uuid, ${ids.folder}::uuid, 'toggle', 3, 'a3', 'details'),
      (${ids.inToggle}::uuid, ${ids.folder}::uuid, 'paragraph', 4, 'a4', 'hidden')`)
  await db.execute(sql`
    UPDATE page_blocks SET section_block_id = ${ids.section}::uuid
     WHERE id IN (${ids.bullet}::uuid, ${ids.subBullet}::uuid, ${ids.toggle}::uuid, ${ids.inToggle}::uuid)`)
  await db.execute(sql`UPDATE page_blocks SET list_parent_block_id = ${ids.bullet}::uuid WHERE id = ${ids.subBullet}::uuid`)
  await db.execute(sql`UPDATE page_blocks SET list_parent_block_id = ${ids.toggle}::uuid WHERE id = ${ids.inToggle}::uuid`)
  await db.execute(sql`
    INSERT INTO page_blocks (id, task_id, kind, position, page_position, text) VALUES
      (${ids.taskHeading}::uuid, ${ids.task}::uuid, 'heading2', 0, 'a0', 'Notes'),
      (${ids.taskParagraph}::uuid, ${ids.task}::uuid, 'paragraph', 1, 'a1', 'body')`)
  await db.execute(sql`
    INSERT INTO page_blocks (id, folder_id, kind, position, page_position, text) VALUES
      (${ids.heading}::uuid, ${ids.folder}::uuid, 'paragraph', 5, 'a5', 'root prose')`)

  before = await blocksSnapshot()
  await migrate(db, { migrationsFolder })
}, 60_000)

afterAll(async () => {
  if ((pglite as PGlite | undefined) !== undefined) await pglite.close()
  if (scratch) rmSync(scratch, { recursive: true, force: true })
})

describe('AC-1014 migration 0038 over existing nested content', () => {
  test('every stored row is unchanged and reads a null toggleable', async () => {
    expect(await blocksSnapshot()).toEqual(before)
    const toggles = await rows(db, sql`SELECT DISTINCT toggleable FROM page_blocks`)
    expect(toggles).toEqual([{ toggleable: null }])
  })

  test('any block but a Section takes a parent, on a Task document too, and never itself', async () => {
    // A Task-homed row nests now (0037 refused any home but folder or facet).
    await db.execute(sql`UPDATE page_blocks SET list_parent_block_id = ${ids.taskHeading}::uuid WHERE id = ${ids.taskParagraph}::uuid`)
    // A heading and a paragraph nest under a paragraph.
    await db.execute(sql`UPDATE page_blocks SET list_parent_block_id = ${ids.heading}::uuid WHERE id = ${ids.inToggle}::uuid`)
    await expectRejectedBy(
      () => db.execute(sql`UPDATE page_blocks SET list_parent_block_id = ${ids.bullet}::uuid WHERE id = ${ids.section}::uuid`),
      'page_blocks_list_parent_kind_check',
    )
    await expectRejectedBy(
      () => db.execute(sql`UPDATE page_blocks SET list_parent_block_id = id WHERE id = ${ids.bullet}::uuid`),
      'page_blocks_list_parent_kind_check',
    )
  })

  test('only a heading1-3 is toggleable', async () => {
    await db.execute(sql`UPDATE page_blocks SET toggleable = true WHERE id = ${ids.taskHeading}::uuid`)
    await expectRejectedBy(
      () => db.execute(sql`UPDATE page_blocks SET toggleable = true WHERE id = ${ids.toggle}::uuid`),
      'page_blocks_toggleable_kind_check',
    )
    await expectRejectedBy(
      () => db.execute(sql`UPDATE page_blocks SET toggleable = false WHERE id = ${ids.section}::uuid`),
      'page_blocks_toggleable_kind_check',
    )
  })
})
