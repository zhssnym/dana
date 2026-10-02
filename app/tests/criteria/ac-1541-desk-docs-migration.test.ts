/*
AC-1541: migration 0067 establishes Desk's Work + Docs shape without deleting
legacy content. An untouched Purpose page becomes Docs in place, an existing
Discussion row is retained for history but ordered out of the normal Desk
surface, and a Desk with no documentation receives Docs (spec 9.14, 7.30).
*/
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres'
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Executor } from '../../src/server/database.js'
import { legBaseUrl } from '../support/postgres-leg.js'

const migrationsFolder = path.resolve(process.cwd(), 'db', 'migrations')

interface JournalEntry {
  idx: number
  when: number
  tag: string
}

interface Scratch {
  executor: Executor
  exec(query: SQL): Promise<Record<string, unknown>[]>
  migrate(folder: string): Promise<void>
  close(): Promise<void>
}

async function openScratch(): Promise<Scratch> {
  const base = legBaseUrl()
  if (base === undefined) {
    const pglite = await PGlite.create({ extensions: { pg_trgm } })
    const db = drizzlePglite(pglite)
    return {
      executor: db,
      exec: async (query) => ((await db.execute(query)) as unknown as { rows: Record<string, unknown>[] }).rows,
      migrate: (folder) => migratePglite(db, { migrationsFolder: folder }),
      close: () => pglite.close(),
    }
  }

  const name = `${new URL(base).pathname.replace(/^\//, '')}_m67_${process.pid}`
  const admin = new pg.Client({ connectionString: base })
  admin.on('error', () => undefined)
  await admin.connect()
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`)
  await admin.query(`CREATE DATABASE "${name}"`)
  const url = new URL(base)
  url.pathname = `/${name}`
  const pool = new pg.Pool({ connectionString: url.toString(), max: 1 })
  pool.on('error', () => undefined)
  const db = drizzleNodePg(pool)
  return {
    executor: db,
    exec: async (query) => (await db.execute(query)).rows as Record<string, unknown>[],
    migrate: (folder) => migrateNodePg(db, { migrationsFolder: folder }),
    close: async () => {
      await pool.end()
      await admin.query(`DROP DATABASE IF EXISTS "${name}"`)
      await admin.end()
    },
  }
}

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

function id(group: number, n: number): string {
  return `${group.toString(16).padStart(8, '0')}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
}

const user = id(0x67, 1)
const desk = id(0x67, 2)
const purpose = id(0x67, 3)
const discussion = id(0x67, 4)
const notes = id(0x67, 5)
const block = id(0x67, 6)
const emptyDesk = id(0x67, 7)
const userTwo = id(0x67, 8)

let db: Scratch
let scratch: string

beforeAll(async () => {
  scratch = mkdtempSync(path.join(tmpdir(), 'dana-0067-'))
  const through0066 = path.join(scratch, 'a')
  const through0067 = path.join(scratch, 'b')
  cutThrough('0066_', through0066)
  cutThrough('0067_', through0067)

  db = await openScratch()
  await db.migrate(through0066)

  await db.exec(sql`INSERT INTO users (id, display_name) VALUES
    (${user}::uuid, 'Desk owner'), (${userTwo}::uuid, 'Second Desk owner')`)
  await db.exec(sql`INSERT INTO folders (id, owner_id, name, is_default, project_id, kind, tab_position) VALUES
    (${desk}::uuid, ${user}::uuid, 'Desk', true, ${desk}::uuid, 'work', 'a1'),
    (${purpose}::uuid, ${user}::uuid, 'Purpose', false, ${desk}::uuid, 'doc', 'a0'),
    (${discussion}::uuid, ${user}::uuid, 'Discussion', false, ${desk}::uuid, 'discussion', 'a2'),
    (${notes}::uuid, ${user}::uuid, 'Notes', false, ${desk}::uuid, 'doc', 'a3'),
    (${emptyDesk}::uuid, ${userTwo}::uuid, 'Desk', true, ${emptyDesk}::uuid, 'work', 'a0')`)
  await db.exec(sql`INSERT INTO folder_members (folder_id, user_id, access) VALUES
    (${desk}::uuid, ${user}::uuid, 'full_control'),
    (${emptyDesk}::uuid, ${userTwo}::uuid, 'full_control')`)
  await db.exec(sql`INSERT INTO folder_facets (id, folder_id, kind, position, created_by) VALUES
    (${purpose}::uuid, ${desk}::uuid, 'purpose', 'a1', ${user}::uuid)`)
  await db.exec(sql`INSERT INTO page_blocks (id, folder_id, kind, position, page_position, text)
    VALUES (${block}::uuid, ${purpose}::uuid, 'paragraph', 1, 'a0', 'kept writing')`)

  await db.migrate(through0067)
}, 60_000)

afterAll(async () => {
  await db?.close()
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true })
})

describe('AC-1541 Desk Docs migration', () => {
  test('AC-1541: Work is first, Purpose becomes Docs in place, and legacy Discussion survives', async () => {
    const tabs = await db.exec(sql`SELECT id, name, kind
      FROM folders
      WHERE project_id = ${desk}::uuid AND tab_position IS NOT NULL
        AND deleted_at IS NULL AND archived_at IS NULL
      ORDER BY tab_position, id`)

    expect(tabs).toEqual([
      { id: desk, name: 'Desk', kind: 'work' },
      { id: purpose, name: 'Docs', kind: 'doc' },
      { id: notes, name: 'Notes', kind: 'doc' },
      { id: discussion, name: 'Discussion', kind: 'discussion' },
    ])
    expect(
      await db.exec(sql`SELECT text FROM page_blocks WHERE id = ${block}::uuid`),
    ).toEqual([{ text: 'kept writing' }])
    expect(
      await db.exec(sql`SELECT folder_id FROM page_blocks WHERE id = ${block}::uuid`),
    ).toEqual([{ folder_id: purpose }])
  })

  test('AC-1541: a Desk without documentation receives one Docs page', async () => {
    const tabs = await db.exec(sql`SELECT name, kind, (id = project_id) AS root
      FROM folders
      WHERE project_id = ${emptyDesk}::uuid AND tab_position IS NOT NULL
        AND deleted_at IS NULL AND archived_at IS NULL
      ORDER BY tab_position, id`)
    expect(tabs).toEqual([
      { name: 'Desk', kind: 'work', root: true },
      { name: 'Docs', kind: 'doc', root: false },
    ])
  })
})
