/*
AC-1516: migration 0060 moves every step into its task's body as a checklist
item, with the same id, text and tick, in order, after the writing. A task's
lazy notes are materialized first, and nothing else changes (spec 4.17).

Built as ac-1510 builds 0059's test: a PGlite database is migrated through
0059 from a copy of the journal cut there, seeded, and then a second cut
through 0060 is applied on top, so later migrations never run here. The
`key_after` check also runs on the leg's own database (Postgres when
TEST_DATABASE_URL is set), where a collation-sensitive port would differ.
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

import { initialKeys, keyBetween } from '../../src/server/domain/fractional-index.js'
import { createTestDb, rows } from '../support/helpers.js'

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
  onlySteps: '20000000-0000-4000-8000-000000000001',
  lazyNotes: '20000000-0000-4000-8000-000000000002',
  withBody: '20000000-0000-4000-8000-000000000003',
  trashed: '20000000-0000-4000-8000-000000000004',
  nearCarry: '20000000-0000-4000-8000-000000000005',
  untouched: '20000000-0000-4000-8000-000000000006',
  nullKey: '20000000-0000-4000-8000-000000000007',
  oneLongLine: '20000000-0000-4000-8000-000000000008',
  emojiLine: '20000000-0000-4000-8000-000000000009',
  diverged: '20000000-0000-4000-8000-00000000000a',
  s1: '30000000-0000-4000-8000-000000000001',
  s2: '30000000-0000-4000-8000-000000000002',
  s3: '30000000-0000-4000-8000-000000000003',
  s4: '30000000-0000-4000-8000-000000000004',
  s5: '30000000-0000-4000-8000-000000000005',
  s6: '30000000-0000-4000-8000-000000000006',
  s7: '30000000-0000-4000-8000-000000000007',
  s8: '30000000-0000-4000-8000-000000000008',
  s9: '30000000-0000-4000-8000-000000000009',
  s10: '30000000-0000-4000-8000-00000000000a',
  s11: '30000000-0000-4000-8000-00000000000b',
  s12: '30000000-0000-4000-8000-00000000000c',
  s13: '30000000-0000-4000-8000-00000000000d',
  s14: '30000000-0000-4000-8000-00000000000e',
  s15: '30000000-0000-4000-8000-00000000000f',
  intro: '40000000-0000-4000-8000-000000000001',
  legacy: '40000000-0000-4000-8000-000000000002',
  last: '40000000-0000-4000-8000-000000000003',
  keyed: '40000000-0000-4000-8000-000000000004',
  unkeyed: '40000000-0000-4000-8000-000000000005',
  old: '40000000-0000-4000-8000-000000000006',
}

// Over 4000 characters with a line break inside the window, so it splits.
const longNotes = `${'a'.repeat(3000)}\n${'b'.repeat(2000)}`
// One line over 4000 characters: 0031 cuts it mid-line, with no line break.
const oneLongLine = 'x'.repeat(5000)
// The same in characters of more than one byte (and two UTF-16 units).
const emoji = '\u{1F600}'
const emojiLine = emoji.repeat(4001)

function cutThrough(prefix: string, into: string): void {
  mkdirSync(path.join(into, 'meta'), { recursive: true })
  const journal = JSON.parse(
    readFileSync(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: JournalEntry[] }
  const cut = journal.entries.findIndex((entry) => entry.tag.startsWith(prefix))
  expect(cut).toBeGreaterThan(0)
  const kept = journal.entries.slice(0, cut + 1)
  for (const entry of kept) {
    copyFileSync(path.join(migrationsFolder, `${entry.tag}.sql`), path.join(into, `${entry.tag}.sql`))
  }
  writeFileSync(path.join(into, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries: kept }))
}

type Snapshot = Record<string, unknown>[]
let untouchedBefore: Snapshot

async function blocksOf(taskId: string): Promise<Snapshot> {
  return rows(
    db,
    sql`SELECT id, kind, text, checked, page_position, position
          FROM page_blocks WHERE task_id = ${taskId}::uuid
         ORDER BY page_position ASC NULLS LAST, position, updated_at, id`,
  )
}

async function notesOf(taskId: string): Promise<unknown> {
  return (await rows(db, sql`SELECT notes FROM tasks WHERE id = ${taskId}::uuid`))[0]?.notes
}

beforeAll(async () => {
  scratch = mkdtempSync(path.join(tmpdir(), 'dana-0060-'))
  const through0059 = path.join(scratch, 'a')
  const through0060 = path.join(scratch, 'b')
  cutThrough('0059_', through0059)
  cutThrough('0060_', through0060)

  pglite = await PGlite.create({ extensions: { pg_trgm } })
  db = drizzle(pglite)
  await migrate(db, { migrationsFolder: through0059 })

  await db.execute(sql`INSERT INTO users (id, display_name) VALUES (${ids.owner}::uuid, 'Owner')`)
  await db.execute(sql`
    INSERT INTO folders (id, owner_id, name, is_default)
    VALUES (${ids.folder}::uuid, ${ids.owner}::uuid, 'Trip', false)`)
  await db.execute(sql`
    INSERT INTO folder_members (folder_id, user_id) VALUES (${ids.folder}::uuid, ${ids.owner}::uuid)`)
  await db.execute(sql`
    INSERT INTO tasks (id, folder_id, title, created_by, notes, deleted_at) VALUES
      (${ids.onlySteps}::uuid, ${ids.folder}::uuid, 'Only steps', ${ids.owner}::uuid, NULL, NULL),
      (${ids.lazyNotes}::uuid, ${ids.folder}::uuid, 'Lazy notes', ${ids.owner}::uuid, ${longNotes}, NULL),
      (${ids.withBody}::uuid, ${ids.folder}::uuid, 'With body', ${ids.owner}::uuid, ${'Intro\nLegacy'}, NULL),
      (${ids.trashed}::uuid, ${ids.folder}::uuid, 'Trashed', ${ids.owner}::uuid, NULL, '2026-06-01 00:00:00+00'),
      (${ids.nearCarry}::uuid, ${ids.folder}::uuid, 'Near carry', ${ids.owner}::uuid, 'Last', NULL),
      (${ids.untouched}::uuid, ${ids.folder}::uuid, 'Untouched', ${ids.owner}::uuid, 'keep me', NULL),
      (${ids.nullKey}::uuid, ${ids.folder}::uuid, 'Null key', ${ids.owner}::uuid, ${'Keyed\nUnkeyed'}, NULL),
      (${ids.oneLongLine}::uuid, ${ids.folder}::uuid, 'One long line', ${ids.owner}::uuid, ${oneLongLine}, NULL),
      (${ids.emojiLine}::uuid, ${ids.folder}::uuid, 'Emoji line', ${ids.owner}::uuid, ${emojiLine}, NULL),
      (${ids.diverged}::uuid, ${ids.folder}::uuid, 'Diverged', ${ids.owner}::uuid, 'New text only in notes', NULL)`)
  await db.execute(sql`
    INSERT INTO page_blocks (id, task_id, kind, position, page_position, text, checked) VALUES
      (${ids.intro}::uuid, ${ids.withBody}::uuid, 'paragraph', 0, 'a0', 'Intro', NULL),
      (${ids.legacy}::uuid, ${ids.withBody}::uuid, 'checklist', 1, 'a1', 'Legacy', true),
      (${ids.last}::uuid, ${ids.nearCarry}::uuid, 'paragraph', 0, 'ay', 'Last', NULL),
      (${ids.keyed}::uuid, ${ids.nullKey}::uuid, 'paragraph', 0, 'a0', 'Keyed', NULL),
      (${ids.unkeyed}::uuid, ${ids.nullKey}::uuid, 'paragraph', 1, NULL, 'Unkeyed', NULL),
      (${ids.old}::uuid, ${ids.diverged}::uuid, 'paragraph', 0, 'a0', 'Old', NULL)`)
  // Positions out of id order, and a tie broken by id (s2 before s3).
  await db.execute(sql`
    INSERT INTO steps (id, task_id, title, done, position) VALUES
      (${ids.s1}::uuid, ${ids.onlySteps}::uuid, 'Third', false, 5),
      (${ids.s2}::uuid, ${ids.onlySteps}::uuid, 'First', true, 1),
      (${ids.s3}::uuid, ${ids.onlySteps}::uuid, 'Second', false, 1),
      (${ids.s4}::uuid, ${ids.lazyNotes}::uuid, 'Pack', true, 1),
      (${ids.s5}::uuid, ${ids.lazyNotes}::uuid, 'Go', false, 2),
      (${ids.s6}::uuid, ${ids.withBody}::uuid, 'New one', true, 1),
      (${ids.s7}::uuid, ${ids.trashed}::uuid, 'Gone', true, 1),
      (${ids.s8}::uuid, ${ids.nearCarry}::uuid, 'One', false, 1),
      (${ids.s9}::uuid, ${ids.nearCarry}::uuid, 'Two', true, 2),
      (${ids.s10}::uuid, ${ids.nearCarry}::uuid, 'Three', false, 3),
      (${ids.s11}::uuid, ${ids.nearCarry}::uuid, 'Four', true, 4),
      (${ids.s12}::uuid, ${ids.nullKey}::uuid, 'After', false, 1),
      (${ids.s13}::uuid, ${ids.oneLongLine}::uuid, 'Read it', false, 1),
      (${ids.s14}::uuid, ${ids.emojiLine}::uuid, 'Smile', true, 1),
      (${ids.s15}::uuid, ${ids.diverged}::uuid, 'Step', false, 1)`)
  untouchedBefore = await rows(db, sql`SELECT * FROM tasks WHERE id = ${ids.untouched}::uuid`)

  await migrate(db, { migrationsFolder: through0060 })
}, 60_000)

afterAll(async () => {
  await pglite.close()
  rmSync(scratch, { recursive: true, force: true })
})

describe('AC-1516 migration 0060 moves steps into the task body as checklist items', () => {
  test('a task with only steps gets them in (position, id) order, ids and ticks kept', async () => {
    expect(await blocksOf(ids.onlySteps)).toEqual([
      { id: ids.s2, kind: 'checklist', text: 'First', checked: true, page_position: 'a0', position: 0 },
      { id: ids.s3, kind: 'checklist', text: 'Second', checked: false, page_position: 'a1', position: 1 },
      { id: ids.s1, kind: 'checklist', text: 'Third', checked: false, page_position: 'a2', position: 2 },
    ])
    expect(await notesOf(ids.onlySteps)).toBeNull()
  })

  test('lazy notes are materialized first, split as 0031 splits them, and kept', async () => {
    expect(await blocksOf(ids.lazyNotes)).toEqual([
      { id: expect.any(String), kind: 'paragraph', text: 'a'.repeat(3000), checked: null, page_position: 'a0', position: 0 },
      { id: expect.any(String), kind: 'paragraph', text: 'b'.repeat(2000), checked: null, page_position: 'a1', position: 1 },
      { id: ids.s4, kind: 'checklist', text: 'Pack', checked: true, page_position: 'a2', position: 2 },
      { id: ids.s5, kind: 'checklist', text: 'Go', checked: false, page_position: 'a3', position: 3 },
    ])
    expect(await notesOf(ids.lazyNotes)).toBe(longNotes)
  })

  test('one line over 4000 characters is cut mid-line and the notes are kept as they were', async () => {
    expect(await blocksOf(ids.oneLongLine)).toEqual([
      { id: expect.any(String), kind: 'paragraph', text: 'x'.repeat(4000), checked: null, page_position: 'a0', position: 0 },
      { id: expect.any(String), kind: 'paragraph', text: 'x'.repeat(1000), checked: null, page_position: 'a1', position: 1 },
      { id: ids.s13, kind: 'checklist', text: 'Read it', checked: false, page_position: 'a2', position: 2 },
    ])
    expect(await notesOf(ids.oneLongLine)).toBe(oneLongLine)
    expect(await blocksOf(ids.emojiLine)).toEqual([
      { id: expect.any(String), kind: 'paragraph', text: emoji.repeat(4000), checked: null, page_position: 'a0', position: 0 },
      { id: expect.any(String), kind: 'paragraph', text: emoji, checked: null, page_position: 'a1', position: 1 },
      { id: ids.s14, kind: 'checklist', text: 'Smile', checked: true, page_position: 'a2', position: 2 },
    ])
    expect(await notesOf(ids.emojiLine)).toBe(emojiLine)
  })

  test('steps go after the writing; existing blocks keep their keys; notes skip checklists', async () => {
    expect(await blocksOf(ids.withBody)).toEqual([
      { id: ids.intro, kind: 'paragraph', text: 'Intro', checked: null, page_position: 'a0', position: 0 },
      { id: ids.legacy, kind: 'checklist', text: 'Legacy', checked: true, page_position: 'a1', position: 1 },
      { id: ids.s6, kind: 'checklist', text: 'New one', checked: true, page_position: 'a2', position: 2 },
    ])
    expect(await notesOf(ids.withBody)).toBe('Intro')
  })

  test('notes the old server wrote alone (not the body) are kept, not replaced', async () => {
    expect(await blocksOf(ids.diverged)).toEqual([
      { id: ids.old, kind: 'paragraph', text: 'Old', checked: null, page_position: 'a0', position: 0 },
      { id: ids.s15, kind: 'checklist', text: 'Step', checked: false, page_position: 'a1', position: 1 },
    ])
    expect(await notesOf(ids.diverged)).toBe('New text only in notes')
  })

  test('a trashed task keeps its steps too', async () => {
    expect(await blocksOf(ids.trashed)).toEqual([
      { id: ids.s7, kind: 'checklist', text: 'Gone', checked: true, page_position: 'a0', position: 0 },
    ])
  })

  test('appending past az carries into b00', async () => {
    expect((await blocksOf(ids.nearCarry)).map((b) => [b.id, b.page_position])).toEqual([
      [ids.last, 'ay'],
      [ids.s8, 'az'],
      [ids.s9, 'b00'],
      [ids.s10, 'b01'],
      [ids.s11, 'b02'],
    ])
    expect(await notesOf(ids.nearCarry)).toBe('Last')
  })

  test('an unkeyed block is keyed in reader order before the append', async () => {
    expect((await blocksOf(ids.nullKey)).map((b) => [b.id, b.page_position])).toEqual([
      [ids.keyed, 'a0'],
      [ids.unkeyed, 'a1'],
      [ids.s12, 'a2'],
    ])
  })

  test('a task without steps is untouched, and the steps table is kept', async () => {
    expect(await rows(db, sql`SELECT * FROM tasks WHERE id = ${ids.untouched}::uuid`)).toEqual(untouchedBefore)
    expect(await blocksOf(ids.untouched)).toEqual([])
    expect(await rows(db, sql`SELECT count(*)::int AS n FROM steps`)).toEqual([{ n: 15 }])
  })

  test("the old server's steps writes during the overlap reach the body", async () => {
    const late = '50000000-0000-4000-8000-000000000001'
    const lateTask = '20000000-0000-4000-8000-0000000000b1'
    const copy = '20000000-0000-4000-8000-0000000000b2'
    await db.execute(sql`INSERT INTO steps (id, task_id, title, position) VALUES (${late}::uuid, ${ids.onlySteps}::uuid, 'Fourth', 9)`)
    await db.execute(sql`UPDATE steps SET title = 'First, renamed', done = false WHERE id = ${ids.s2}::uuid`)
    await db.execute(sql`DELETE FROM steps WHERE id = ${ids.s3}::uuid`)
    expect(await blocksOf(ids.onlySteps)).toEqual([
      { id: ids.s2, kind: 'checklist', text: 'First, renamed', checked: false, page_position: 'a0', position: 0 },
      { id: ids.s1, kind: 'checklist', text: 'Third', checked: false, page_position: 'a2', position: 2 },
      { id: late, kind: 'checklist', text: 'Fourth', checked: false, page_position: 'a3', position: 3 },
    ])
    // A step on a task whose notes were never materialized keeps the notes.
    await db.execute(sql`
      INSERT INTO tasks (id, folder_id, title, created_by, notes)
      VALUES (${lateTask}::uuid, ${ids.folder}::uuid, 'Late', ${ids.owner}::uuid, ${'Line one\nLine two'})`)
    await db.execute(sql`INSERT INTO steps (task_id, title, position) VALUES (${lateTask}::uuid, 'Do it', 1)`)
    expect((await blocksOf(lateTask)).map((b) => [b.kind, b.text, b.page_position])).toEqual([
      ['paragraph', 'Line one\nLine two', 'a0'],
      ['checklist', 'Do it', 'a1'],
    ])
    // The old server's copy writes the body and the steps in one transaction.
    await db.transaction(async (tx) => {
      await tx.execute(sql`INSERT INTO tasks (id, folder_id, title, created_by) VALUES (${copy}::uuid, ${ids.folder}::uuid, 'Copy', ${ids.owner}::uuid)`)
      await tx.execute(sql`INSERT INTO page_blocks (task_id, kind, position, page_position, text, checked) VALUES (${copy}::uuid, 'checklist', 0, 'a0', 'Third', false)`)
      await tx.execute(sql`INSERT INTO steps (task_id, title, position) VALUES (${copy}::uuid, 'Third', 5)`)
    })
    expect((await blocksOf(copy)).map((b) => b.text)).toEqual(['Third'])
  })

  test('migration_util.key_after is keyBetween(k, null) on the leg database', async () => {
    const client = await createTestDb()
    try {
      const probes = [...initialKeys(4000), 'a0V', 'Zzz', 'az', 'b0zz', 'Yzz', `A${'0'.repeat(25)}1`]
      const got = await rows(
        client.db,
        sql`SELECT k, migration_util.key_after(k) AS next
              FROM unnest(${`{${probes.join(',')}}`}::text[]) WITH ORDINALITY AS p(k, n) ORDER BY n`,
      )
      expect(got.map((r) => r.next)).toEqual(probes.map((k) => keyBetween(k, null)))
      expect(await rows(client.db, sql`SELECT migration_util.key_after(NULL) AS next`)).toEqual([{ next: 'a0' }])
    } finally {
      await client.close()
    }
  })
})
