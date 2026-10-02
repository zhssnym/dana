/* Issue #497: migration 0066 backfills the singular M5 links into the
persisted many-to-many relation, removes discussions.task_id and the old
one-live-per-task constraint, and leaves duplicate prevention/cascade
behavior on the relation itself. */
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
interface JournalEntry { idx: number; when: number; tag: string }
let pglite: PGlite
let db: PgliteDatabase
let scratch: string
const ids = {
  owner: '00000000-0000-4000-8000-000000000001', folder: '10000000-0000-4000-8000-000000000001',
  firstTask: '20000000-0000-4000-8000-000000000001', secondTask: '20000000-0000-4000-8000-000000000002',
  firstDiscussion: '30000000-0000-4000-8000-000000000001', secondDiscussion: '30000000-0000-4000-8000-000000000002',
}

beforeAll(async () => {
  scratch = mkdtempSync(path.join(tmpdir(), 'dana-0066-'))
  mkdirSync(path.join(scratch, 'meta'))
  const journal = JSON.parse(readFileSync(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8')) as { entries: JournalEntry[] }
  const cut = journal.entries.findIndex((entry) => entry.tag.startsWith('0066_'))
  expect(cut).toBeGreaterThan(0)
  const through0065 = journal.entries.slice(0, cut)
  for (const entry of through0065) copyFileSync(path.join(migrationsFolder, `${entry.tag}.sql`), path.join(scratch, `${entry.tag}.sql`))
  writeFileSync(path.join(scratch, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries: through0065 }))
  pglite = await PGlite.create({ extensions: { pg_trgm } })
  db = drizzle(pglite)
  await migrate(db, { migrationsFolder: scratch })
  await db.execute(sql`INSERT INTO users (id, display_name) VALUES (${ids.owner}::uuid, 'Owner')`)
  await db.execute(sql`INSERT INTO folders (id, owner_id, name) VALUES (${ids.folder}::uuid, ${ids.owner}::uuid, 'Work')`)
  await db.execute(sql`INSERT INTO folder_members (folder_id, user_id, access) VALUES (${ids.folder}::uuid, ${ids.owner}::uuid, 'full_control')`)
  await db.execute(sql`INSERT INTO tasks (id, folder_id, title, created_by, created_at) VALUES
    (${ids.firstTask}::uuid, ${ids.folder}::uuid, 'First', ${ids.owner}::uuid, '2026-01-01 09:00:00+00'),
    (${ids.secondTask}::uuid, ${ids.folder}::uuid, 'Second', ${ids.owner}::uuid, '2026-01-02 09:00:00+00')`)
  await db.execute(sql`INSERT INTO discussions (id, folder_id, task_id, title, created_by, created_at) VALUES
    (${ids.firstDiscussion}::uuid, ${ids.folder}::uuid, ${ids.firstTask}::uuid, 'First discussion', ${ids.owner}::uuid, '2026-01-01 10:00:00+00'),
    (${ids.secondDiscussion}::uuid, ${ids.folder}::uuid, ${ids.secondTask}::uuid, 'Second discussion', ${ids.owner}::uuid, '2025-12-31 10:00:00+00')`)
  await migrate(db, { migrationsFolder })
}, 60_000)

afterAll(async () => { await pglite.close(); rmSync(scratch, { recursive: true, force: true }) })

describe('issue #497 migration 0066', () => {
  test('backfills every legacy edge and records task-origin provenance', async () => {
    expect(await rows(db, sql`SELECT discussion_id, task_id, created_via_task FROM discussion_tasks ORDER BY discussion_id`)).toEqual([
      { discussion_id: ids.firstDiscussion, task_id: ids.firstTask, created_via_task: true },
      { discussion_id: ids.secondDiscussion, task_id: ids.secondTask, created_via_task: false },
    ])
  })
  test('drops discussions.task_id and the old one-live index', async () => {
    expect(await rows(db, sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'discussions' AND column_name = 'task_id'`)).toEqual([])
    expect(await rows(db, sql`SELECT indexname FROM pg_indexes WHERE tablename = 'discussions' AND indexname = 'discussions_one_live_per_task_key'`)).toEqual([])
  })
  test('supports many-to-many and prevents duplicate pairs', async () => {
    await db.execute(sql`INSERT INTO discussion_tasks (discussion_id, task_id) VALUES (${ids.firstDiscussion}::uuid, ${ids.secondTask}::uuid), (${ids.secondDiscussion}::uuid, ${ids.firstTask}::uuid)`)
    expect((await rows(db, sql`SELECT count(*)::int AS n FROM discussion_tasks WHERE task_id = ${ids.firstTask}::uuid`))[0]?.n).toBe(2)
    expect((await rows(db, sql`SELECT count(*)::int AS n FROM discussion_tasks WHERE discussion_id = ${ids.firstDiscussion}::uuid`))[0]?.n).toBe(2)
    await expectRejectedBy(() => db.execute(sql`INSERT INTO discussion_tasks (discussion_id, task_id) VALUES (${ids.firstDiscussion}::uuid, ${ids.firstTask}::uuid)`), /unique|duplicate|discussion_tasks_pkey/i)
  })
  test('permanent endpoint deletion cascades only edges', async () => {
    await db.execute(sql`DELETE FROM tasks WHERE id = ${ids.secondTask}::uuid`)
    expect(await rows(db, sql`SELECT 1 FROM discussion_tasks WHERE task_id = ${ids.secondTask}::uuid`)).toEqual([])
    expect(await rows(db, sql`SELECT id FROM discussions ORDER BY id`)).toEqual([{ id: ids.firstDiscussion }, { id: ids.secondDiscussion }])
  })
})
