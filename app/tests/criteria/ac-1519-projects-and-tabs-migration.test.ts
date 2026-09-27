/*
AC-1519: migration 0061 turns each top-level page into a project and its
facets into tabs, in the order the page drew them, moving every block, file
and membership (spec 4.3). AC-1520's stored half: a private tab becomes a
project whose only member is its owner.

Built as ac-1516 builds 0060's test: a database is migrated through 0060
from a copy of the journal cut there, seeded, and a second cut through 0061
is applied on top, so later migrations never run here. On the Postgres leg
(TEST_DATABASE_URL set) the same runs in a scratch database of its own on
that server, so 0061's SQL is exercised on both engines.
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

import { accessOf } from '../../src/server/domain/folder-access.js'
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
  const name = `${new URL(base).pathname.replace(/^\//, '')}_m61_${process.pid}`
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

let db: Scratch
let scratch: string

// Readable ids: a leading letter per case, then a serial.
function id(group: number, n: number): string {
  return `${group.toString(16).padStart(8, '0')}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
}
const u = { owner: id(1, 1), editor: id(1, 2), viewer: id(1, 3), deskTwo: id(1, 4), gone: id(1, 5) }
const A = { root: id(0xa, 0), main: id(0xa, 1), purpose: id(0xa, 2), consult: id(0xa, 3), results: id(0xa, 4),
  mine: id(0xa, 5), orphan: id(0xa, 6), pBlock: id(0xa, 7), mainBlock: id(0xa, 8), mineBlock: id(0xa, 9),
  orphanBlock: id(0xa, 10), task: id(0xa, 11) }
const B = { root: id(0xb, 0), main: id(0xb, 1), purpose: id(0xb, 2), consult: id(0xb, 3), results: id(0xb, 4),
  notes: id(0xb, 5), work: id(0xb, 6), h1: id(0xb, 7), result: id(0xb, 8) }
const C = { root: id(0xc, 0), main: id(0xc, 1), purpose: id(0xc, 2), consult: id(0xc, 3), results: id(0xc, 4),
  pBlock: id(0xc, 5) }
const D = { root: id(0xd, 0), main: id(0xd, 1), purpose: id(0xd, 2), consult: id(0xd, 3), results: id(0xd, 4),
  gear: id(0xd, 5), old: id(0xd, 6), image: id(0xd, 7), shared: id(0xd, 8), oldBlock: id(0xd, 9),
  mainImage: id(0xd, 10), file: id(0xd, 11), sharedFile: id(0xd, 12) }
const G = { root: id(0x6, 0), main: id(0x6, 1), purpose: id(0x6, 2), consult: id(0x6, 3), results: id(0x6, 4),
  c1: id(0x6, 5), c2: id(0x6, 6), home1: id(0x6, 7), para: id(0x6, 8) }
const H = { root: id(0x7, 0), sub: id(0x7, 1), subPurpose: id(0x7, 2), subResults: id(0x7, 3), grand: id(0x7, 4),
  subPara: id(0x7, 5), subTask: id(0x7, 6), grandHome: id(0x7, 7), purposeBlock: id(0x7, 8), subHome: id(0x7, 9),
  tasksOnly: id(0x7, 10), empty: id(0x7, 11), tasksOnlyHome: id(0x7, 12), tasksOnlyTask: id(0x7, 13) }
const J = { desk: id(0x8, 0), main: id(0x8, 1), purpose: id(0x8, 2), consult: id(0x8, 3), results: id(0x8, 4),
  pBlock: id(0x8, 5), discussion: id(0x8, 6), notes: id(0x8, 7), notesBlock: id(0x8, 8), deskTwo: id(0x8, 10), main2: id(0x8, 11), purpose2: id(0x8, 12),
  consult2: id(0x8, 13), results2: id(0x8, 14) }
const K = { root: id(0x9, 0), main: id(0x9, 1), blank: id(0x9, 2), blankBlock: id(0x9, 3) }
const N = { root: id(0xe, 0), main: id(0xe, 1), consult: id(0xe, 2), sub: id(0xe, 3), discussion: id(0xe, 4),
  subHome: id(0xe, 5) }
const P = { root: id(0xf, 0), discussion: id(0xf, 1), bare: id(0xf, 2) }
const Q = { root: id(0x11, 0), main: id(0x11, 1), mine: id(0x11, 2), mineBlock: id(0x11, 3), binned: id(0x11, 4),
  binnedBlock: id(0x11, 5) }

beforeAll(async () => {
  scratch = mkdtempSync(path.join(tmpdir(), 'dana-0061-'))
  const through0060 = path.join(scratch, 'a')
  const through0061 = path.join(scratch, 'b')
  cutThrough('0060_', through0060)
  cutThrough('0061_', through0061)

  db = await openScratch()
  await db.migrate(through0060)

  await db.exec(sql`INSERT INTO users (id, display_name) VALUES
    (${u.owner}::uuid, 'Owner'), (${u.editor}::uuid, 'Editor'), (${u.viewer}::uuid, 'Viewer'),
    (${u.deskTwo}::uuid, 'Desk two'), (${u.gone}::uuid, 'Gone')`)

  const folder = (fid: string, name: string, extra: { parent?: string; child?: string; isDefault?: boolean; owner?: string; deleted?: string } = {}) =>
    db.exec(sql`INSERT INTO folders (id, owner_id, name, is_default, parent_folder_id, child_position, deleted_at)
      VALUES (${fid}::uuid, ${extra.owner ?? u.owner}::uuid, ${name}, ${extra.isDefault ?? false},
              ${extra.parent ?? null}::uuid, ${extra.child ?? null}, ${extra.deleted ?? null}::timestamptz)`)
  const member = (fid: string, uid: string, access: string) =>
    db.exec(sql`INSERT INTO folder_members (folder_id, user_id, access, shelf_name)
      VALUES (${fid}::uuid, ${uid}::uuid, ${access}, ${uid === u.owner ? 'Shelf' : null})`)
  const facet = (fid: string, folderId: string, kind: string, position: string,
    extra: { hidden?: boolean; name?: string; owner?: string; deleted?: string; h1?: string } = {}) =>
    db.exec(sql`INSERT INTO folder_facets (id, folder_id, kind, position, hidden, display_name, owner_id, deleted_at, h1_block_id, created_by)
      VALUES (${fid}::uuid, ${folderId}::uuid, ${kind}, ${position}, ${extra.hidden ?? false}, ${extra.name ?? null},
              ${extra.owner ?? null}::uuid, ${extra.deleted ?? null}::timestamptz, ${extra.h1 ?? null}::uuid, ${u.owner}::uuid)`)
  const natives = async (folderId: string, ids: { main: string; purpose: string; consult: string; results: string },
    pos: [string, string, string, string] = ['a0', 'a1', 'a2', 'a3'], hidden: [boolean, boolean, boolean] = [false, false, false]) => {
    await facet(ids.main, folderId, 'main', pos[0])
    await facet(ids.purpose, folderId, 'purpose', pos[1], { hidden: hidden[0] })
    await facet(ids.consult, folderId, 'consultation', pos[2], { hidden: hidden[1] })
    await facet(ids.results, folderId, 'results', pos[3], { hidden: hidden[2] })
  }
  const block = (bid: string, home: { folder?: string; facet?: string }, kind: string, position: number,
    key: string, extra: { text?: string; ref?: string; file?: string } = {}) =>
    db.exec(sql`INSERT INTO page_blocks (id, folder_id, facet_id, kind, position, page_position, text, ref_folder_id, file_id)
      VALUES (${bid}::uuid, ${home.folder ?? null}::uuid, ${home.facet ?? null}::uuid, ${kind}, ${position}, ${key},
              ${extra.text ?? (kind === 'page' || kind === 'image' ? null : 'text')}, ${extra.ref ?? null}::uuid, ${extra.file ?? null}::uuid)`)

  // (a) untouched: Purpose with content, empty Results, shown Discussion,
  // Main blocks and a task; (f) a private tab, and one whose owner left.
  await folder(A.root, 'Trip')
  await member(A.root, u.owner, 'full_control')
  await member(A.root, u.editor, 'can_edit')
  await member(A.root, u.viewer, 'can_view')
  await natives(A.root, A)
  await facet(A.mine, A.root, 'private_blank', 'a4', { name: 'Mine', owner: u.editor })
  await facet(A.orphan, A.root, 'private_blank', 'a5', { name: 'Left behind', owner: u.gone })
  await block(A.pBlock, { facet: A.purpose }, 'paragraph', 0, 'a0', { text: 'Why we go' })
  await block(A.mainBlock, { folder: A.root }, 'paragraph', 0, 'a0', { text: 'Main' })
  await block(A.mineBlock, { facet: A.mine }, 'paragraph', 0, 'a0', { text: 'My notes' })
  await block(A.orphanBlock, { facet: A.orphan }, 'paragraph', 0, 'a0', { text: 'Nobody reads this' })
  await db.exec(sql`INSERT INTO tasks (id, folder_id, title, created_by, page_position)
    VALUES (${A.task}::uuid, ${A.root}::uuid, 'Book', ${u.owner}::uuid, 'a1')`)

  // (b) reordered, with a shared blank first, (l) a Work facet over an H1,
  // (m) a Result in Results.
  await folder(B.root, 'Build')
  await member(B.root, u.owner, 'full_control')
  await natives(B.root, B, ['a1', 'a3', 'a2', 'a4'])
  await facet(B.notes, B.root, 'shared_blank', 'a0', { name: 'Notes' })
  await block(B.h1, { folder: B.root }, 'heading1', 0, 'a0', { text: 'Phase one' })
  await facet(B.work, B.root, 'work', 'a5', { h1: B.h1 })
  await block(B.result, { facet: B.results }, 'result', 0, 'a0', { text: 'We shipped' })
  // A renamed Results facet: its tab is named Results again (resultsTab).
  await db.exec(sql`UPDATE folder_facets SET display_name = 'Outcomes' WHERE id = ${B.results}::uuid`)

  // (c) hidden Purpose with content, hidden empty Results and Discussion.
  await folder(C.root, 'Quiet')
  await member(C.root, u.owner, 'full_control')
  await natives(C.root, C, undefined, [true, true, true])
  await block(C.pBlock, { facet: C.purpose }, 'paragraph', 0, 'a0', { text: 'Hidden but written' })

  // (d) a shared blank with an image and its file; a second file also named
  // by Main stays; (e) a trashed shared blank.
  await folder(D.root, 'Gear')
  await member(D.root, u.owner, 'full_control')
  await natives(D.root, D)
  await facet(D.gear, D.root, 'shared_blank', 'a4', { name: 'Gear list' })
  await facet(D.old, D.root, 'shared_blank', 'a5', { name: 'Old list', deleted: '2026-09-01T00:00:00Z' })
  await db.exec(sql`INSERT INTO files (id, owner_id, folder_id, kind, name, mime, bytes) VALUES
    (${D.file}::uuid, ${u.owner}::uuid, ${D.root}::uuid, 'image', 'tent.png', 'image/png', 10),
    (${D.sharedFile}::uuid, ${u.owner}::uuid, ${D.root}::uuid, 'image', 'map.png', 'image/png', 10)`)
  await block(D.image, { facet: D.gear }, 'image', 0, 'a0', { file: D.file })
  await block(D.shared, { facet: D.gear }, 'image', 1, 'a1', { file: D.sharedFile })
  await block(D.mainImage, { folder: D.root }, 'image', 0, 'a0', { file: D.sharedFile })
  await block(D.oldBlock, { facet: D.old }, 'paragraph', 0, 'a0', { text: 'Old' })

  // (g) page links on Work: two children, one without a home block.
  await folder(G.root, 'Home')
  await member(G.root, u.owner, 'full_control')
  await member(G.root, u.viewer, 'can_view')
  await natives(G.root, G, undefined, [true, true, true])
  await folder(G.c1, 'Kitchen', { parent: G.root, child: 'a0' })
  await folder(G.c2, 'Garden', { parent: G.root, child: 'a1' })
  for (const c of [G.c1, G.c2]) {
    await member(c, u.owner, 'full_control')
    await member(c, u.viewer, 'can_view')
  }
  await block(G.para, { folder: G.root }, 'paragraph', 0, 'a0', { text: 'Rooms' })
  await block(G.home1, { folder: G.root }, 'page', 1, 'a1', { ref: G.c1 })

  // (h) a subpage with Purpose content and a child; (i) a subpage with tasks
  // only, and one with nothing.
  await folder(H.root, 'Office')
  await member(H.root, u.owner, 'full_control')
  await member(H.root, u.editor, 'can_edit')
  await folder(H.sub, 'Desk setup', { parent: H.root, child: 'a0' })
  await member(H.sub, u.owner, 'full_control')
  await member(H.sub, u.viewer, 'can_comment')
  await facet(H.subPurpose, H.sub, 'purpose', 'a1', { hidden: true })
  await facet(H.subResults, H.sub, 'results', 'a3')
  await block(H.purposeBlock, { facet: H.subPurpose }, 'paragraph', 0, 'a0', { text: 'Ergonomics' })
  await folder(H.grand, 'Chair', { parent: H.sub, child: 'a0' })
  await member(H.grand, u.owner, 'full_control')
  await block(H.subPara, { folder: H.sub }, 'paragraph', 0, 'a0', { text: 'Setup' })
  await block(H.grandHome, { folder: H.sub }, 'page', 1, 'a1', { ref: H.grand })
  await db.exec(sql`INSERT INTO tasks (id, folder_id, title, created_by, page_position)
    VALUES (${H.subTask}::uuid, ${H.sub}::uuid, 'Buy a lamp', ${u.owner}::uuid, 'a3')`)
  await block(H.subHome, { folder: H.root }, 'page', 0, 'a0', { ref: H.sub })
  await folder(H.tasksOnly, 'Errands', { parent: H.root, child: 'a1' })
  await member(H.tasksOnly, u.owner, 'full_control')
  await db.exec(sql`INSERT INTO tasks (id, folder_id, title, created_by, page_position)
    VALUES (${H.tasksOnlyTask}::uuid, ${H.tasksOnly}::uuid, 'Post', ${u.owner}::uuid, 'a0')`)
  await block(H.tasksOnlyHome, { folder: H.root }, 'page', 1, 'a1', { ref: H.tasksOnly })
  await folder(H.empty, 'Nothing', { parent: H.root, child: 'a2' })
  await member(H.empty, u.owner, 'full_control')

  // (j) Desk with Purpose content, a written blank and a discussion;
  // another Desk, empty.
  await folder(J.desk, 'Desk', { isDefault: true })
  await member(J.desk, u.owner, 'full_control')
  await natives(J.desk, J)
  await block(J.pBlock, { facet: J.purpose }, 'paragraph', 0, 'a0', { text: 'This week' })
  await facet(J.notes, J.desk, 'shared_blank', 'a4', { name: 'Notes' })
  await block(J.notesBlock, { facet: J.notes }, 'paragraph', 0, 'a0', { text: 'Paint colours' })
  await db.exec(sql`INSERT INTO discussions (id, folder_id, title, created_by)
    VALUES (${J.discussion}::uuid, ${J.desk}::uuid, 'Plans', ${u.owner}::uuid)`)
  await folder(J.deskTwo, 'Desk', { isDefault: true, owner: u.deskTwo })
  await member(J.deskTwo, u.deskTwo, 'full_control')
  await natives(J.deskTwo, { main: J.main2, purpose: J.purpose2, consult: J.consult2, results: J.results2 })

  // (k) a trashed root with a live blank.
  await folder(K.root, 'Archive', { deleted: '2026-09-10T00:00:00Z' })
  await member(K.root, u.owner, 'full_control')
  await facet(K.main, K.root, 'main', 'a0')
  await facet(K.blank, K.root, 'shared_blank', 'a4', { name: 'Leftovers' })
  await block(K.blankBlock, { facet: K.blank }, 'paragraph', 0, 'a0', { text: 'kept' })

  // (n) a subpage discussion under a root whose Discussion is hidden; a root
  // with no facets and a discussion; a root with nothing at all.
  await folder(N.root, 'Nest')
  await member(N.root, u.owner, 'full_control')
  await facet(N.main, N.root, 'main', 'a0')
  await facet(N.consult, N.root, 'consultation', 'a2', { hidden: true })
  await folder(N.sub, 'Egg', { parent: N.root, child: 'a0' })
  await member(N.sub, u.owner, 'full_control')
  await block(N.subHome, { folder: N.root }, 'page', 0, 'a0', { ref: N.sub })
  await db.exec(sql`INSERT INTO discussions (id, folder_id, title, created_by)
    VALUES (${N.discussion}::uuid, ${N.sub}::uuid, 'Hatch?', ${u.owner}::uuid)`)
  await folder(P.root, 'Plain')
  await member(P.root, u.owner, 'full_control')
  await db.exec(sql`INSERT INTO discussions (id, folder_id, title, created_by, trashed_at)
    VALUES (${P.discussion}::uuid, ${P.root}::uuid, 'Old talk', ${u.owner}::uuid, now())`)
  await folder(P.bare, 'Bare')
  await member(P.bare, u.owner, 'full_control')

  // (o) a trashed root holding the editor's live private tab, and one the
  // editor had trashed themselves.
  await folder(Q.root, 'Old trip', { deleted: '2026-09-12T00:00:00Z' })
  await member(Q.root, u.owner, 'full_control')
  await member(Q.root, u.editor, 'can_edit')
  await facet(Q.main, Q.root, 'main', 'a0')
  await facet(Q.mine, Q.root, 'private_blank', 'a4', { name: 'Mine too', owner: u.editor })
  await facet(Q.binned, Q.root, 'private_blank', 'a5', { name: 'Binned', owner: u.editor, deleted: '2026-09-11T00:00:00Z' })
  await block(Q.mineBlock, { facet: Q.mine }, 'paragraph', 0, 'a0', { text: 'Still mine' })
  await block(Q.binnedBlock, { facet: Q.binned }, 'paragraph', 0, 'a0', { text: 'Gone' })

  await db.migrate(through0061)
}, 120_000)

afterAll(async () => {
  await db?.close()
  rmSync(scratch, { recursive: true, force: true })
})

async function tabs(project: string): Promise<Record<string, unknown>[]> {
  return db.exec(sql`
    SELECT id, name, kind, tab_position, deleted_at IS NOT NULL AS trashed, trashed_with_folder_id
      FROM folders WHERE project_id = ${project}::uuid AND tab_position IS NOT NULL
     ORDER BY tab_position, id`)
}

async function homeOf(blockId: string): Promise<unknown> {
  return (await db.exec(sql`SELECT folder_id, facet_id FROM page_blocks WHERE id = ${blockId}::uuid`))[0]
}

async function membersOf(folderId: string): Promise<Record<string, unknown>[]> {
  return db.exec(sql`SELECT user_id, access, shelf_name FROM folder_members
    WHERE folder_id = ${folderId}::uuid ORDER BY user_id`)
}

function tab(tid: string, name: string, kind: string, key: string, trashed = false, trashedWith: string | null = null) {
  return { id: tid, name, kind, tab_position: key, trashed, trashed_with_folder_id: trashedWith }
}

describe('AC-1519 migration 0061 turns roots into projects and facets into tabs', () => {
  test('an untouched root keeps the drawn order: Purpose, Work, Results, Discussion', async () => {
    expect(await tabs(A.root)).toEqual([
      tab(A.purpose, 'Purpose', 'doc', 'a0'),
      tab(A.root, 'Trip', 'work', 'a1'),
      tab(A.results, 'Results', 'doc', 'a2'),
      tab(A.consult, 'Discussion', 'discussion', 'a3'),
    ])
    expect(await homeOf(A.pBlock)).toEqual({ folder_id: A.purpose, facet_id: null })
    expect(await homeOf(A.mainBlock)).toEqual({ folder_id: A.root, facet_id: null })
    expect(await db.exec(sql`SELECT folder_id FROM tasks WHERE id = ${A.task}::uuid`)).toEqual([{ folder_id: A.root }])
  })

  test("each tab has the root's people and presets, without personal fields", async () => {
    const people = [
      { user_id: u.owner, access: 'full_control', shelf_name: null },
      { user_id: u.editor, access: 'can_edit', shelf_name: null },
      { user_id: u.viewer, access: 'can_view', shelf_name: null },
    ]
    for (const t of [A.purpose, A.results, A.consult]) expect(await membersOf(t)).toEqual(people)
    expect((await membersOf(A.root))[0]).toEqual({ user_id: u.owner, access: 'full_control', shelf_name: 'Shelf' })
  })

  test('AC-1520 a private tab becomes a project whose only member is its owner', async () => {
    expect(await db.exec(sql`SELECT project_id, parent_folder_id, kind, tab_position, owner_id, name
      FROM folders WHERE id = ${A.mine}::uuid`)).toEqual([
      { project_id: A.mine, parent_folder_id: null, kind: 'doc', tab_position: 'a0', owner_id: u.editor, name: 'Mine' },
    ])
    expect(await membersOf(A.mine)).toEqual([{ user_id: u.editor, access: 'full_control', shelf_name: null }])
    expect(await homeOf(A.mineBlock)).toEqual({ folder_id: A.mine, facet_id: null })
    expect(await db.exec(sql`SELECT member_id, new_access, transition FROM folder_access_history
      WHERE folder_id = ${A.mine}::uuid`)).toEqual([
      { member_id: u.editor, new_access: 'full_control', transition: 'migration_initialized' },
    ])
  })

  test("AC-1520 the old page's other members get nothing of the private project", async () => {
    // The one access check every route resolves through (`accessOf`): null
    // is the 404 a route answers.
    expect(await accessOf(db.executor, u.owner, A.mine)).toBeNull()
    expect(await accessOf(db.executor, u.viewer, A.mine)).toBeNull()
    expect(await accessOf(db.executor, u.editor, A.mine)).toMatchObject({ folderId: A.mine, access: 'full_control' })
    // Everyone on the page still reads its shared tabs.
    expect(await accessOf(db.executor, u.viewer, A.purpose)).toMatchObject({ folderId: A.purpose, access: 'can_view' })
  })

  test('a private tab whose owner left is left where it was, visible to nobody', async () => {
    expect(await db.exec(sql`SELECT 1 FROM folders WHERE id = ${A.orphan}::uuid`)).toEqual([])
    expect(await homeOf(A.orphanBlock)).toEqual({ folder_id: null, facet_id: A.orphan })
  })

  test('a reordered root keeps its stored order; an H1 Work facet gets no tab; a Result moves; Results keeps its name', async () => {
    expect(await tabs(B.root)).toEqual([
      tab(B.notes, 'Notes', 'doc', 'a0'),
      tab(B.root, 'Build', 'work', 'a1'),
      tab(B.consult, 'Discussion', 'discussion', 'a2'),
      tab(B.purpose, 'Purpose', 'doc', 'a3'),
      tab(B.results, 'Results', 'doc', 'a4'),
    ])
    expect(await db.exec(sql`SELECT 1 FROM folders WHERE id = ${B.work}::uuid`)).toEqual([])
    expect(await homeOf(B.h1)).toEqual({ folder_id: B.root, facet_id: null })
    expect(await db.exec(sql`SELECT folder_id, kind, text FROM page_blocks WHERE id = ${B.result}::uuid`))
      .toEqual([{ folder_id: B.results, kind: 'result', text: 'We shipped' }])
  })

  test('hidden with content becomes a shown tab; hidden and empty gets none', async () => {
    expect(await tabs(C.root)).toEqual([
      tab(C.purpose, 'Purpose', 'doc', 'a0'),
      tab(C.root, 'Quiet', 'work', 'a1'),
    ])
    expect(await homeOf(C.pBlock)).toEqual({ folder_id: C.purpose, facet_id: null })
  })

  test('a blank becomes a Doc tab; its file follows its blocks unless something else names it', async () => {
    expect(await tabs(D.root)).toEqual([
      tab(D.purpose, 'Purpose', 'doc', 'a0'),
      tab(D.root, 'Gear', 'work', 'a1'),
      tab(D.results, 'Results', 'doc', 'a2'),
      tab(D.consult, 'Discussion', 'discussion', 'a3'),
      tab(D.gear, 'Gear list', 'doc', 'a4'),
      tab(D.old, 'Old list', 'doc', 'a5', true),
    ])
    expect(await db.exec(sql`SELECT id, folder_id FROM files ORDER BY id`)).toEqual([
      { id: D.file, folder_id: D.gear },
      { id: D.sharedFile, folder_id: D.root },
    ])
    expect(await homeOf(D.image)).toEqual({ folder_id: D.gear, facet_id: null })
    expect(await homeOf(D.oldBlock)).toEqual({ folder_id: D.old, facet_id: null })
  })

  test('page links move to a Pages tab after Work, with the children and a home for each', async () => {
    expect(await tabs(G.root)).toEqual([
      tab(G.root, 'Home', 'work', 'a0'),
      expect.objectContaining({ name: 'Pages', kind: 'doc', tab_position: 'a1', trashed: false }),
    ])
    const pages = String((await tabs(G.root))[1]?.id)
    expect(await db.exec(sql`SELECT id, parent_folder_id, project_id FROM folders
      WHERE id IN (${G.c1}::uuid, ${G.c2}::uuid) ORDER BY child_position`)).toEqual([
      { id: G.c1, parent_folder_id: pages, project_id: G.root },
      { id: G.c2, parent_folder_id: pages, project_id: G.root },
    ])
    expect(await db.exec(sql`SELECT kind, ref_folder_id, page_position FROM page_blocks
      WHERE folder_id = ${pages}::uuid ORDER BY page_position`)).toEqual([
      { kind: 'page', ref_folder_id: G.c1, page_position: 'a1' },
      { kind: 'page', ref_folder_id: G.c2, page_position: 'a2' },
    ])
    expect(await homeOf(G.para)).toEqual({ folder_id: G.root, facet_id: null })
    expect(await membersOf(pages)).toEqual([
      { user_id: u.owner, access: 'full_control', shelf_name: null },
      { user_id: u.viewer, access: 'can_view', shelf_name: null },
    ])
  })

  test("a subpage's Purpose becomes its child Doc page with the subpage's people and a home block", async () => {
    expect(await db.exec(sql`SELECT parent_folder_id, child_position, project_id, kind, name, tab_position
      FROM folders WHERE id = ${H.subPurpose}::uuid`)).toEqual([
      { parent_folder_id: H.sub, child_position: 'a1', project_id: H.root, kind: 'doc', name: 'Purpose', tab_position: null },
    ])
    expect(await homeOf(H.purposeBlock)).toEqual({ folder_id: H.subPurpose, facet_id: null })
    expect(await membersOf(H.subPurpose)).toEqual([
      { user_id: u.owner, access: 'full_control', shelf_name: null },
      { user_id: u.viewer, access: 'can_comment', shelf_name: null },
    ])
    expect(await db.exec(sql`SELECT kind, ref_folder_id, page_position, position FROM page_blocks
      WHERE folder_id = ${H.sub}::uuid ORDER BY page_position`)).toEqual([
      { kind: 'paragraph', ref_folder_id: null, page_position: 'a0', position: 0 },
      { kind: 'page', ref_folder_id: H.grand, page_position: 'a1', position: 1 },
      { kind: 'page', ref_folder_id: H.subPurpose, page_position: 'a4', position: 2 },
    ])
    // Empty Results on a subpage makes nothing.
    expect(await db.exec(sql`SELECT 1 FROM folders WHERE id = ${H.subResults}::uuid`)).toEqual([])
  })

  test('subpage kinds: page links or no tasks make a Doc, tasks alone a Work page', async () => {
    expect(await db.exec(sql`SELECT id, kind FROM folders
      WHERE id IN (${H.sub}::uuid, ${H.tasksOnly}::uuid, ${H.empty}::uuid, ${H.grand}::uuid) ORDER BY id`)).toEqual([
      { id: H.sub, kind: 'doc' },
      { id: H.grand, kind: 'doc' },
      { id: H.tasksOnly, kind: 'work' },
      { id: H.empty, kind: 'doc' },
    ])
    const pages = (await tabs(H.root)).find((t) => t.name === 'Pages')?.id
    expect(await db.exec(sql`SELECT ref_folder_id, page_position FROM page_blocks
      WHERE folder_id = ${String(pages)}::uuid ORDER BY page_position`)).toEqual([
      { ref_folder_id: H.sub, page_position: 'a0' },
      { ref_folder_id: H.tasksOnly, page_position: 'a1' },
      { ref_folder_id: H.empty, page_position: 'a2' },
    ])
  })

  test('Desk: tabs only for content and discussions; an empty Desk is one tab', async () => {
    expect(await tabs(J.desk)).toEqual([
      tab(J.purpose, 'Purpose', 'doc', 'a0'),
      tab(J.desk, 'Desk', 'work', 'a1'),
      tab(J.consult, 'Discussion', 'discussion', 'a2'),
      tab(J.notes, 'Notes', 'doc', 'a3'),
    ])
    expect(await homeOf(J.notesBlock)).toEqual({ folder_id: J.notes, facet_id: null })
    expect(await tabs(J.deskTwo)).toEqual([tab(J.deskTwo, 'Desk', 'work', 'a0')])
  })

  test('a trashed root takes its tabs to Trash with it', async () => {
    expect(await tabs(K.root)).toEqual([
      tab(K.root, 'Archive', 'work', 'a0', true, null),
      tab(K.blank, 'Leftovers', 'doc', 'a1', true, K.root),
    ])
  })

  test("a live private tab on a trashed page comes out live; a trashed one stays in Trash", async () => {
    expect(await db.exec(sql`SELECT id, deleted_at, trashed_with_folder_id FROM folders
      WHERE id IN (${Q.mine}::uuid, ${Q.binned}::uuid) ORDER BY id`)).toEqual([
      { id: Q.mine, deleted_at: null, trashed_with_folder_id: null },
      { id: Q.binned, deleted_at: expect.anything(), trashed_with_folder_id: null },
    ])
    const binned = await db.exec(sql`SELECT deleted_at = '2026-09-11T00:00:00Z'::timestamptz AS same
      FROM folders WHERE id = ${Q.binned}::uuid`)
    expect(binned).toEqual([{ same: true }])
    expect(await homeOf(Q.mineBlock)).toEqual({ folder_id: Q.mine, facet_id: null })
    expect(await tabs(Q.root)).toEqual([tab(Q.root, 'Old trip', 'work', 'a0', true, null)])
  })

  test('discussions anywhere in a project give it a Discussion tab', async () => {
    expect(await tabs(N.root)).toEqual([
      tab(N.root, 'Nest', 'work', 'a0'),
      expect.objectContaining({ name: 'Pages', kind: 'doc', tab_position: 'a1' }),
      tab(N.consult, 'Discussion', 'discussion', 'a2'),
    ])
    expect(await tabs(P.root)).toEqual([
      tab(P.root, 'Plain', 'work', 'a0'),
      expect.objectContaining({ name: 'Discussion', kind: 'discussion', tab_position: 'a1' }),
    ])
    expect(await tabs(P.bare)).toEqual([tab(P.bare, 'Bare', 'work', 'a0')])
    expect(await db.exec(sql`SELECT folder_id FROM discussions WHERE id = ${N.discussion}::uuid`))
      .toEqual([{ folder_id: N.sub }])
  })

  test('every page carries its project; nothing is left in a facet but the orphan', async () => {
    expect(await db.exec(sql`SELECT count(*)::int AS n FROM folders WHERE project_id IS NULL`)).toEqual([{ n: 0 }])
    expect(await db.exec(sql`SELECT count(*)::int AS n FROM page_blocks WHERE facet_id IS NOT NULL`)).toEqual([{ n: 1 }])
    expect(await db.exec(sql`SELECT id FROM folders WHERE id = project_id ORDER BY id`)).toEqual(
      [A.root, A.mine, B.root, C.root, D.root, G.root, H.root, J.desk, J.deskTwo, K.root, N.root, P.root, P.bare,
        Q.root, Q.mine, Q.binned]
        .sort()
        .map((x) => ({ id: x })),
    )
  })

  test("the old server's writes during the overlap still land", async () => {
    const late = id(0x10, 1)
    const lateChild = id(0x10, 2)
    await db.exec(sql`INSERT INTO folders (id, owner_id, name) VALUES (${late}::uuid, ${u.owner}::uuid, 'Late')`)
    await db.exec(sql`INSERT INTO folders (id, owner_id, name, parent_folder_id, child_position)
      VALUES (${lateChild}::uuid, ${u.owner}::uuid, 'Late child', ${late}::uuid, 'a0')`)
    expect(await db.exec(sql`SELECT id, project_id, kind, tab_position FROM folders
      WHERE id IN (${late}::uuid, ${lateChild}::uuid) ORDER BY id`)).toEqual([
      { id: late, project_id: late, kind: 'work', tab_position: 'a0' },
      { id: lateChild, project_id: late, kind: 'doc', tab_position: null },
    ])
    const written = id(0x10, 3)
    await db.exec(sql`INSERT INTO page_blocks (id, facet_id, kind, position, page_position, text)
      VALUES (${written}::uuid, ${A.purpose}::uuid, 'paragraph', 1, 'a1', 'late')`)
    expect(await homeOf(written)).toEqual({ folder_id: A.purpose, facet_id: null })
    // A facet that got no page (an empty Desk's Purpose) takes no write, so
    // nothing lands where no page reads it and the contract migration drops.
    const lost = id(0x10, 4)
    const refused: unknown = await db.exec(sql`INSERT INTO page_blocks (id, facet_id, kind, position, page_position, text)
      VALUES (${lost}::uuid, ${J.purpose2}::uuid, 'paragraph', 1, 'a1', 'lost')`).then(() => null, (e: unknown) => e)
    const err = refused as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } } | null
    expect(err?.cause?.constraint ?? err?.constraint).toBe('page_blocks_facet_has_page')
    expect(await db.exec(sql`SELECT id FROM page_blocks WHERE id = ${lost}::uuid`)).toEqual([])
    // The orphan private facet's row is left as it was and may still change in place.
    await db.exec(sql`UPDATE page_blocks SET text = 'still mine' WHERE id = ${A.orphanBlock}::uuid`)
    expect(await homeOf(A.orphanBlock)).toEqual({ folder_id: null, facet_id: A.orphan })
  })
})
