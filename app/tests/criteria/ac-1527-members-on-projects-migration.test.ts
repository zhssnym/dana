/*
AC-1527: migration 0062 moves people to the project (spec 4.4). For every
person the set of pages they can see is the same before and after; a page
whose people differ from its project's, either way, becomes its own project
with its sub-pages; otherwise the project's preset wins and the change is
recorded; a page's own membership rows stay, unread, with their shelf;
pending invites that would now open more pages are invalidated; every page
Responsibility moves to the project, ended unless it is the person's one
active there; a project the split leaves with discussions and no Discussion
tab gets one; a live page or tab of a project in Trash becomes its own
project and keeps its Responsibilities; every page gets its project's owner,
and keeps getting it after; tasks carry their project and their assignee is a
member of it; an invite names a project root, and one that names any other
page is invalidated on accept rather than widened to the project.

Built as ac-1519 builds 0061's test: a database is migrated through 0061
from a copy of the journal cut there, seeded, and a second cut through 0062
is applied on top. On the Postgres leg (TEST_DATABASE_URL set) the same runs
in a scratch database of its own on that server.
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

import type { Db } from '../../db/client.js'
import { removeMembership } from '../../src/server/domain/folders.js'
import { acceptInvite } from '../../src/server/domain/invites.js'
import { legBaseUrl } from '../support/postgres-leg.js'

const migrationsFolder = path.resolve(process.cwd(), 'db', 'migrations')

interface JournalEntry {
  idx: number
  when: number
  tag: string
}

interface Scratch {
  db: Db
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
      db: db as unknown as Db,
      exec: async (query) => ((await db.execute(query)) as unknown as { rows: Record<string, unknown>[] }).rows,
      migrate: (folder) => migratePglite(db, { migrationsFolder: folder }),
      close: () => pglite.close(),
    }
  }
  const name = `${new URL(base).pathname.replace(/^\//, '')}_m62_${process.pid}`
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
    db: db as unknown as Db,
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
const u = { owner: id(1, 1), editor: id(1, 2), viewer: id(1, 3), extra: id(1, 4), stranger: id(1, 5) }
// (a) same people, a different preset, owned by someone else, with invites,
// Responsibilities, a tab and an assigned task.
const A = { root: id(0xa, 0), sub: id(0xa, 1), tab: id(0xa, 2), task: id(0xa, 3), invite: id(0xa, 4),
  respRoot: id(0xa, 5), respSubE: id(0xa, 6), respSubV: id(0xa, 7), histV: id(0xa, 8), sub2: id(0xa, 9),
  respSub2V: id(0xa, 10), rootInvite: id(0xa, 11), histSelf: id(0xa, 12) }
// (b) a sub-page with one person more, and its grandchild.
const B = { root: id(0xb, 0), sub: id(0xb, 1), grand: id(0xb, 2), home: id(0xb, 3), task: id(0xb, 4),
  invite: id(0xb, 5) }
// (c) a sub-page missing one of the project's people.
const C = { root: id(0xc, 0), sub: id(0xc, 1), home: id(0xc, 2), invite: id(0xc, 3), talk: id(0xc, 4) }
// (d) a grandchild that differs while its parent does not.
const D = { root: id(0xd, 0), sub: id(0xd, 1), grand: id(0xd, 2), task: id(0xd, 3), disc: id(0xd, 4),
  talk: id(0xd, 5) }

// (e) a project in Trash with a live sub-page and a live tab (a trash that
// skipped what its trasher could not trash), each with a Responsibility.
const E = { root: id(0xe, 0), sub: id(0xe, 1), tab: id(0xe, 2), respSub: id(0xe, 3), respTab: id(0xe, 4) }

let db: Scratch
let scratch: string
let visibleBefore: string[]

const visibility = async (): Promise<string[]> =>
  (await db.exec(sql`SELECT m.user_id, f.id FROM folders f JOIN folder_members m ON m.folder_id = f.project_id
    ORDER BY m.user_id, f.id`)).map((row) => `${String(row.user_id)} ${String(row.id)}`)

beforeAll(async () => {
  scratch = mkdtempSync(path.join(tmpdir(), 'dana-0062-'))
  const through0061 = path.join(scratch, 'a')
  const through0062 = path.join(scratch, 'b')
  cutThrough('0061_', through0061)
  cutThrough('0062_', through0062)

  db = await openScratch()
  await db.migrate(through0061)

  await db.exec(sql`INSERT INTO users (id, display_name) VALUES
    (${u.owner}::uuid, 'Owner'), (${u.editor}::uuid, 'Editor'), (${u.viewer}::uuid, 'Viewer'),
    (${u.extra}::uuid, 'Extra'), (${u.stranger}::uuid, 'Stranger')`)
  // 0061's overlap trigger fills project_id, kind and tab_position.
  const folder = (fid: string, name: string, extra: { parent?: string; owner?: string } = {}) =>
    db.exec(sql`INSERT INTO folders (id, owner_id, name, parent_folder_id, child_position)
      VALUES (${fid}::uuid, ${extra.owner ?? u.owner}::uuid, ${name}, ${extra.parent ?? null}::uuid,
              ${extra.parent === undefined ? null : 'a0'})`)
  const member = (fid: string, uid: string, access: string, personal = false) =>
    db.exec(sql`INSERT INTO folder_members (folder_id, user_id, access, shelf_name, color)
      VALUES (${fid}::uuid, ${uid}::uuid, ${access}, ${personal ? 'Mine' : null}, ${personal ? '#336699' : null})`)
  const task = (tid: string, fid: string, assignee: string) =>
    db.exec(sql`INSERT INTO tasks (id, folder_id, title, created_by, assignee_id)
      VALUES (${tid}::uuid, ${fid}::uuid, 'Task', ${u.owner}::uuid, ${assignee}::uuid)`)
  const home = (bid: string, parent: string, child: string) =>
    db.exec(sql`INSERT INTO page_blocks (id, folder_id, kind, position, page_position, ref_folder_id)
      VALUES (${bid}::uuid, ${parent}::uuid, 'page', 0, 'a0', ${child}::uuid)`)
  const invite = (iid: string, fid: string, email: string) =>
    db.exec(sql`INSERT INTO invites (id, inviter_id, email, folder_id, access)
      VALUES (${iid}::uuid, ${u.owner}::uuid, ${email}, ${fid}::uuid, 'can_view')`)
  const discussion = (did: string, fid: string) =>
    db.exec(sql`INSERT INTO discussions (id, folder_id, title, created_by)
      VALUES (${did}::uuid, ${fid}::uuid, 'Talk', ${u.owner}::uuid)`)
  const responsibility = (rid: string, fid: string, uid: string, created: string) =>
    db.exec(sql`INSERT INTO folder_responsibilities
      (id, folder_id, member_id, content, content_hash, current_revision_no, updated_by, created_at)
      VALUES (${rid}::uuid, ${fid}::uuid, ${uid}::uuid, '{"items":[]}'::jsonb, 'h', 1, ${u.owner}::uuid,
              ${created}::timestamptz)`)

  await folder(A.root, 'Trip')
  await member(A.root, u.owner, 'full_control')
  await member(A.root, u.editor, 'can_edit')
  await member(A.root, u.viewer, 'can_view')
  await folder(A.sub, 'Packing', { parent: A.root, owner: u.editor })
  await member(A.sub, u.owner, 'full_control')
  await member(A.sub, u.editor, 'can_edit')
  await member(A.sub, u.viewer, 'can_comment', true)
  await db.exec(sql`INSERT INTO folders (id, owner_id, name, project_id, kind, tab_position)
    VALUES (${A.tab}::uuid, ${u.owner}::uuid, 'Purpose', ${A.root}::uuid, 'doc', 'a1')`)
  await member(A.tab, u.owner, 'full_control')
  await member(A.tab, u.editor, 'can_edit')
  await member(A.tab, u.viewer, 'can_view')
  await folder(A.sub2, 'Tickets', { parent: A.root })
  await member(A.sub2, u.owner, 'full_control')
  await member(A.sub2, u.editor, 'can_edit')
  await member(A.sub2, u.viewer, 'can_view')
  await task(A.task, A.sub, u.editor)
  await invite(A.invite, A.sub, 'a@example.com')
  await invite(A.rootInvite, A.root, 'root@example.com')
  await responsibility(A.respRoot, A.root, u.editor, '2026-01-01T00:00:00Z')
  await responsibility(A.respSubE, A.sub, u.editor, '2026-01-02T00:00:00Z')
  await responsibility(A.respSubV, A.sub, u.viewer, '2026-01-03T00:00:00Z')
  await db.exec(sql`INSERT INTO folder_responsibility_history
    (id, folder_id, member_id, responsibility_id, transition, revision_no, content, content_hash, actor_id)
    VALUES (${A.histV}::uuid, ${A.sub}::uuid, ${u.viewer}::uuid, ${A.respSubV}::uuid, 'responsibility_created', 1,
            '{"items":[]}'::jsonb, 'h', ${u.owner}::uuid)`)
  await responsibility(A.respSub2V, A.sub2, u.viewer, '2026-01-04T00:00:00Z')
  // The editor may edit their own Responsibilities on the page, not on the
  // project, and the page's history says so.
  await db.exec(sql`UPDATE folder_members SET can_edit_own_responsibilities = (folder_id = ${A.sub}::uuid)
    WHERE user_id = ${u.editor}::uuid AND folder_id IN (${A.root}::uuid, ${A.sub}::uuid)`)
  await db.exec(sql`INSERT INTO folder_responsibility_history (id, folder_id, member_id, transition, actor_id, effective_at)
    VALUES (${A.histSelf}::uuid, ${A.sub}::uuid, ${u.editor}::uuid, 'self_edit_granted', ${u.owner}::uuid,
            '2026-01-02T00:00:00Z'::timestamptz)`)

  await folder(B.root, 'Build')
  await member(B.root, u.owner, 'full_control')
  await member(B.root, u.editor, 'can_edit')
  await folder(B.sub, 'Side project', { parent: B.root })
  await member(B.sub, u.owner, 'full_control')
  await member(B.sub, u.editor, 'can_edit')
  await member(B.sub, u.extra, 'can_edit')
  await folder(B.grand, 'Parts', { parent: B.sub })
  await member(B.grand, u.owner, 'full_control')
  await member(B.grand, u.editor, 'can_view')
  await member(B.grand, u.extra, 'can_edit')
  await home(B.home, B.root, B.sub)
  await task(B.task, B.grand, u.extra)
  await invite(B.invite, B.sub, 'b@example.com')

  await folder(C.root, 'Home')
  await member(C.root, u.owner, 'full_control')
  await member(C.root, u.editor, 'can_edit')
  await member(C.root, u.viewer, 'can_view')
  await folder(C.sub, 'Private room', { parent: C.root })
  await member(C.sub, u.owner, 'full_control')
  await member(C.sub, u.editor, 'can_edit')
  await home(C.home, C.root, C.sub)
  await invite(C.invite, C.sub, 'c@example.com')
  await discussion(C.talk, C.sub)

  await folder(D.root, 'Garden')
  await member(D.root, u.owner, 'full_control')
  await member(D.root, u.editor, 'can_edit')
  await folder(D.sub, 'Beds', { parent: D.root })
  await member(D.sub, u.owner, 'full_control')
  await member(D.sub, u.editor, 'can_edit')
  await folder(D.grand, 'Secret bed', { parent: D.sub })
  await member(D.grand, u.owner, 'full_control')
  await task(D.task, D.grand, u.owner)
  // A Discussion tab whose people differ splits off; the talk on D.sub stays.
  await db.exec(sql`INSERT INTO folders (id, owner_id, name, project_id, kind, tab_position)
    VALUES (${D.disc}::uuid, ${u.owner}::uuid, 'Discussion', ${D.root}::uuid, 'discussion', 'a1')`)
  await member(D.disc, u.owner, 'full_control')
  await discussion(D.talk, D.sub)

  await folder(E.root, 'Old trip')
  await member(E.root, u.owner, 'full_control')
  await member(E.root, u.editor, 'can_edit')
  await folder(E.sub, 'Photos', { parent: E.root })
  await member(E.sub, u.owner, 'full_control')
  await member(E.sub, u.editor, 'can_edit')
  await db.exec(sql`INSERT INTO folders (id, owner_id, name, project_id, kind, tab_position)
    VALUES (${E.tab}::uuid, ${u.owner}::uuid, 'Notes', ${E.root}::uuid, 'doc', 'a1')`)
  await member(E.tab, u.owner, 'full_control')
  await member(E.tab, u.editor, 'can_edit')
  await db.exec(sql`UPDATE folders SET deleted_at = now() - interval '29 days' WHERE id = ${E.root}::uuid`)
  await responsibility(E.respSub, E.sub, u.editor, '2026-01-05T00:00:00Z')
  await responsibility(E.respTab, E.tab, u.editor, '2026-01-06T00:00:00Z')

  visibleBefore = (await db.exec(sql`SELECT user_id, folder_id FROM folder_members ORDER BY user_id, folder_id`))
    .map((row) => `${String(row.user_id)} ${String(row.folder_id)}`)

  await db.migrate(through0062)
}, 120_000)

// DROP DATABASE checkpoints, which takes longer than the default 10 s while
// the rest of the Postgres leg runs beside it.
afterAll(async () => {
  await db.close()
  rmSync(scratch, { recursive: true, force: true })
}, 60_000)

const place = async (fid: string) =>
  (await db.exec(sql`SELECT project_id, parent_folder_id, owner_id, tab_position FROM folders WHERE id = ${fid}::uuid`))[0]
// The scratch connection is the old instance's unless marked the way
// db/client.ts marks this server's (one connection on both engines).
const asNewServer = async <T,>(run: () => Promise<T>): Promise<T> => {
  await db.exec(sql`SELECT set_config('dana.step8', 'on', false)`)
  try {
    return await run()
  } finally {
    await db.exec(sql`SELECT set_config('dana.step8', '', false)`)
  }
}
const people = async (fid: string) =>
  (await db.exec(sql`SELECT user_id, access FROM folder_members WHERE folder_id = ${fid}::uuid ORDER BY user_id`))

describe('AC-1527 migration 0062: people belong to the project', () => {
  test('every person sees exactly the pages they saw (and the new Discussion tabs)', async () => {
    const added = (await db.exec(sql`SELECT id FROM folders WHERE kind = 'discussion'
      AND project_id IN (${C.sub}::uuid, ${D.root}::uuid)`)).map((row) => String(row.id))
    expect(added).toHaveLength(2)
    expect((await visibility()).filter((row) => !added.includes(row.split(' ')[1] ?? ''))).toEqual(visibleBefore)
  })

  test('a page keeps its own rows, unread, with the shelf step 9 reads', async () => {
    expect(await db.exec(sql`SELECT user_id, access, shelf_name, color FROM folder_members
      WHERE folder_id = ${A.sub}::uuid ORDER BY user_id`)).toEqual([
      { user_id: u.owner, access: 'full_control', shelf_name: null, color: null },
      { user_id: u.editor, access: 'can_edit', shelf_name: null, color: null },
      { user_id: u.viewer, access: 'can_comment', shelf_name: 'Mine', color: '#336699' },
    ])
    expect(await people(A.root)).toEqual([
      { user_id: u.owner, access: 'full_control' },
      { user_id: u.editor, access: 'can_edit' },
      { user_id: u.viewer, access: 'can_view' },
    ])
  })

  test('same people, another preset: the page stays, the project preset wins and is recorded', async () => {
    expect(await place(A.sub)).toEqual({ project_id: A.root, parent_folder_id: A.root, owner_id: u.owner, tab_position: null })
    expect(await place(A.tab)).toEqual({ project_id: A.root, parent_folder_id: null, owner_id: u.owner, tab_position: 'a1' })
    expect(await db.exec(sql`SELECT folder_id, member_id, previous_access, new_access, actor_id, transition
      FROM folder_access_history WHERE folder_id IN (${A.sub}::uuid, ${A.tab}::uuid)`)).toEqual([
      { folder_id: A.sub, member_id: u.viewer, previous_access: 'can_comment', new_access: 'can_view', actor_id: null,
        transition: 'migration_initialized' },
    ])
  })

  test('one person more: the page and its sub-pages become a project with their people', async () => {
    expect(await place(B.sub)).toEqual({ project_id: B.sub, parent_folder_id: null, owner_id: u.owner, tab_position: 'a0' })
    expect(await place(B.grand)).toEqual({ project_id: B.sub, parent_folder_id: B.sub, owner_id: u.owner, tab_position: null })
    expect(await people(B.sub)).toEqual([
      { user_id: u.owner, access: 'full_control' },
      { user_id: u.editor, access: 'can_edit' },
      { user_id: u.extra, access: 'can_edit' },
    ])
    expect(await db.exec(sql`SELECT kind, folder_id, ref_folder_id FROM page_blocks WHERE id = ${B.home}::uuid`))
      .toEqual([{ kind: 'folder_ref', folder_id: B.root, ref_folder_id: B.sub }])
  })

  test('one person fewer: the page becomes a project, and nobody joins it', async () => {
    expect(await place(C.sub)).toEqual({ project_id: C.sub, parent_folder_id: null, owner_id: u.owner, tab_position: 'a0' })
    expect((await people(C.sub)).map((row) => row.user_id)).toEqual([u.owner, u.editor])
    expect(await db.exec(sql`SELECT kind FROM page_blocks WHERE id = ${C.home}::uuid`)).toEqual([{ kind: 'folder_ref' }])
  })

  test('a grandchild that differs splits under a parent that does not', async () => {
    expect(await place(D.sub)).toEqual({ project_id: D.root, parent_folder_id: D.root, owner_id: u.owner, tab_position: null })
    expect(await place(D.grand)).toEqual({ project_id: D.grand, parent_folder_id: null, owner_id: u.owner, tab_position: 'a0' })
    expect(await people(D.grand)).toEqual([{ user_id: u.owner, access: 'full_control' }])
  })

  test('tasks carry their project and keep their assignee', async () => {
    expect(await db.exec(sql`SELECT id, project_id, assignee_id FROM tasks ORDER BY id`)).toEqual([
      { id: A.task, project_id: A.root, assignee_id: u.editor },
      { id: B.task, project_id: B.sub, assignee_id: u.extra },
      { id: D.task, project_id: D.grand, assignee_id: u.owner },
    ].sort((x, y) => x.id.localeCompare(y.id)))
  })

  test('invites that would now open more pages are invalidated; one on a project without sub-pages stays', async () => {
    expect(await db.exec(sql`SELECT id, status FROM invites ORDER BY id`)).toEqual([
      { id: A.invite, status: 'invalidated' },
      { id: A.rootInvite, status: 'invalidated' },
      { id: B.invite, status: 'invalidated' },
      { id: C.invite, status: 'pending' },
    ].sort((x, y) => x.id.localeCompare(y.id)))
  })

  test('every page Responsibility moves to the project, ended unless it is the one active there', async () => {
    expect(await db.exec(sql`SELECT id, folder_id, ended_at IS NOT NULL AS ended FROM folder_responsibilities
      ORDER BY id`)).toEqual([
      { id: A.respRoot, folder_id: A.root, ended: false },
      { id: A.respSubE, folder_id: A.root, ended: true },
      { id: A.respSubV, folder_id: A.root, ended: false },
      { id: A.respSub2V, folder_id: A.root, ended: true },
      { id: E.respSub, folder_id: E.sub, ended: false },
      { id: E.respTab, folder_id: E.tab, ended: false },
    ])
    expect(await db.exec(sql`SELECT folder_id FROM folder_responsibility_history WHERE id = ${A.histV}::uuid`))
      .toEqual([{ folder_id: A.root }])
    expect(await db.exec(sql`SELECT responsibility_id, folder_id, member_id, actor_id FROM folder_responsibility_history
      WHERE transition = 'responsibility_ended' ORDER BY responsibility_id`)).toEqual([
      { responsibility_id: A.respSubE, folder_id: A.root, member_id: u.editor, actor_id: u.owner },
      { responsibility_id: A.respSub2V, folder_id: A.root, member_id: u.viewer, actor_id: u.owner },
    ])
  })

  test('a self-edit grant that differed from the project is recorded where the project history ends', async () => {
    expect(await db.exec(sql`SELECT folder_id, can_edit_own_responsibilities AS may FROM folder_members
      WHERE user_id = ${u.editor}::uuid AND folder_id IN (${A.root}::uuid, ${A.sub}::uuid) ORDER BY folder_id`))
      .toEqual([{ folder_id: A.root, may: false }, { folder_id: A.sub, may: true }])
    expect(await db.exec(sql`SELECT folder_id, responsibility_id, transition, actor_id FROM folder_responsibility_history
      WHERE member_id = ${u.editor}::uuid AND transition IN ('self_edit_granted', 'self_edit_revoked')
      ORDER BY effective_at, id`)).toEqual([
      { folder_id: A.root, responsibility_id: null, transition: 'self_edit_granted', actor_id: u.owner },
      { folder_id: A.root, responsibility_id: A.respRoot, transition: 'self_edit_revoked', actor_id: u.owner },
    ])
  })

  test('a live page and tab of a project in Trash become projects and keep their Responsibilities', async () => {
    expect(await place(E.sub)).toEqual({ project_id: E.sub, parent_folder_id: null, owner_id: u.owner, tab_position: 'a0' })
    expect(await place(E.tab)).toEqual({ project_id: E.tab, parent_folder_id: null, owner_id: u.owner, tab_position: 'a1' })
    expect((await people(E.sub)).map((row) => row.user_id)).toEqual([u.owner, u.editor])
    expect(await db.exec(sql`SELECT count(*)::int AS n FROM folders WHERE project_id = ${E.root}::uuid`))
      .toEqual([{ n: 1 }])
  })

  test('a project the split leaves with discussions and no Discussion tab gets one', async () => {
    // The diverged Discussion tab is a project of its own now.
    expect(await place(D.disc)).toEqual({ project_id: D.disc, parent_folder_id: null, owner_id: u.owner, tab_position: 'a1' })
    const tabs = async (project: string) => db.exec(sql`SELECT name, kind, owner_id, tab_position, deleted_at
      FROM folders WHERE project_id = ${project}::uuid AND kind = 'discussion'`)
    expect(await tabs(D.root)).toEqual([
      { name: 'Discussion', kind: 'discussion', owner_id: u.owner, tab_position: 'a1', deleted_at: null },
    ])
    expect(await tabs(C.sub)).toEqual([
      { name: 'Discussion', kind: 'discussion', owner_id: u.owner, tab_position: 'a1', deleted_at: null },
    ])
    expect(await tabs(C.root)).toEqual([])
  })

  test('after it: a task takes its folder project, and a page takes no people of its own', async () => {
    const late = id(0x10, 1)
    await db.exec(sql`INSERT INTO tasks (id, folder_id, title, created_by)
      VALUES (${late}::uuid, ${A.sub}::uuid, 'Late', ${u.owner}::uuid)`)
    expect(await db.exec(sql`SELECT project_id FROM tasks WHERE id = ${late}::uuid`)).toEqual([{ project_id: A.root }])
    await db.exec(sql`UPDATE tasks SET folder_id = ${D.sub}::uuid, assignee_id = NULL WHERE id = ${late}::uuid`)
    expect(await db.exec(sql`SELECT project_id FROM tasks WHERE id = ${late}::uuid`)).toEqual([{ project_id: D.root }])
    // The old instance's copy onto a page is dropped for someone already on the project.
    const before = await people(A.sub)
    await db.exec(sql`INSERT INTO folder_members (folder_id, user_id, access)
      VALUES (${D.sub}::uuid, ${u.editor}::uuid, 'can_edit')`)
    expect(await people(D.sub)).toEqual([
      { user_id: u.owner, access: 'full_control' },
      { user_id: u.editor, access: 'can_edit' },
    ])
    // Anyone else is refused, never let in.
    const refused: unknown = await db.exec(sql`INSERT INTO folder_members (folder_id, user_id, access)
      VALUES (${A.sub}::uuid, ${u.stranger}::uuid, 'can_edit')`).then(() => null, (e: unknown) => e)
    const err = refused as { constraint?: string; cause?: { constraint?: string } } | null
    expect(err?.cause?.constraint ?? err?.constraint).toBe('folder_members_on_project_root')
    expect(await people(A.sub)).toEqual(before)
  })

  test('after it: a page takes its project owner, and follows the root when it changes hands', async () => {
    const late = id(0x10, 2)
    await db.exec(sql`INSERT INTO folders (id, owner_id, name, parent_folder_id, child_position, project_id, kind)
      VALUES (${late}::uuid, ${u.editor}::uuid, 'Late page', ${A.root}::uuid, 'b0', ${A.root}::uuid, 'doc')`)
    expect((await place(late))?.owner_id).toBe(u.owner)
    await db.exec(sql`UPDATE folders SET owner_id = ${u.editor}::uuid WHERE id = ${A.sub}::uuid`)
    expect((await place(A.sub))?.owner_id).toBe(u.owner)
    // A transfer, written the way transferOwnership writes it.
    await db.exec(sql`UPDATE folders SET owner_id = ${u.editor}::uuid WHERE project_id = ${A.root}::uuid`)
    await db.exec(sql`UPDATE folders SET owner_id = ${u.owner}::uuid WHERE id = ${A.root}::uuid`)
    expect(await db.exec(sql`SELECT DISTINCT owner_id FROM folders WHERE project_id = ${A.root}::uuid`))
      .toEqual([{ owner_id: u.owner }])
  })

  test('after it: an invite names a project root, and one on another page is invalidated on accept', async () => {
    const refused: unknown = await db.exec(sql`INSERT INTO invites (inviter_id, email, folder_id, access)
      VALUES (${u.owner}::uuid, 'late@example.com', ${A.sub}::uuid, 'can_view')`).then(() => null, (e: unknown) => e)
    const err = refused as { constraint?: string; cause?: { constraint?: string } } | null
    expect(err?.cause?.constraint ?? err?.constraint).toBe('invites_on_project_root')
    // A root with a pending invite moves into another project.
    const moved = id(0x10, 3)
    const pending = id(0x10, 4)
    await db.exec(sql`INSERT INTO folders (id, owner_id, name) VALUES (${moved}::uuid, ${u.owner}::uuid, 'Moved')`)
    await db.exec(sql`INSERT INTO invites (id, inviter_id, email, folder_id, access)
      VALUES (${pending}::uuid, ${u.owner}::uuid, 'stranger@example.com', ${moved}::uuid, 'full_control')`)
    // Only a project with the same people takes a root (folders_move_keeps_people).
    await db.exec(sql`INSERT INTO folder_members (folder_id, user_id, access)
      SELECT ${moved}::uuid, user_id, access FROM folder_members WHERE folder_id = ${A.root}::uuid`)
    await db.exec(sql`UPDATE folders SET parent_folder_id = ${A.root}::uuid, child_position = 'c0',
      project_id = ${A.root}::uuid, tab_position = NULL, kind = 'doc' WHERE id = ${moved}::uuid`)
    expect(await acceptInvite(db.db, u.stranger, pending)).toEqual({ kind: 'not_pending' })
    expect(await db.exec(sql`SELECT status, accepted_by FROM invites WHERE id = ${pending}::uuid`))
      .toEqual([{ status: 'invalidated', accepted_by: null }])
    expect(await db.exec(sql`SELECT folder_id FROM folder_members WHERE user_id = ${u.stranger}::uuid`)).toEqual([])
    expect(await db.exec(sql`SELECT count(*)::int AS n FROM connections`)).toEqual([{ n: 0 }])
  })

  test('after it: the old instance moves a page only between projects with the same people', async () => {
    const refused: unknown = await db.exec(sql`UPDATE folders SET parent_folder_id = ${D.root}::uuid,
      child_position = 'z0', project_id = ${D.root}::uuid WHERE id = ${A.sub2}::uuid`).then(() => null, (e: unknown) => e)
    const err = refused as { constraint?: string; cause?: { constraint?: string } } | null
    expect(err?.cause?.constraint ?? err?.constraint).toBe('folders_move_keeps_people')
    expect(await place(A.sub2)).toEqual({ project_id: A.root, parent_folder_id: A.root, owner_id: u.owner, tab_position: null })
  })

  test('after it: a page the old instance promotes takes its project people, not its stale rows', async () => {
    // Someone this server added to the project after 0062 has no row on the
    // page, and is assigned a task there.
    const late = id(0x10, 5)
    await asNewServer(() => db.exec(sql`INSERT INTO folder_members (folder_id, user_id, access)
      VALUES (${A.root}::uuid, ${u.stranger}::uuid, 'can_edit')`))
    await db.exec(sql`INSERT INTO tasks (id, folder_id, title, created_by, assignee_id)
      VALUES (${late}::uuid, ${A.sub}::uuid, 'Late', ${u.owner}::uuid, ${u.stranger}::uuid)`)
    await db.exec(sql`UPDATE folders SET parent_folder_id = NULL, child_position = NULL,
      project_id = id, tab_position = 'a0' WHERE id = ${A.sub}::uuid`)
    expect(await people(A.sub)).toEqual(await people(A.root))
    expect(await db.exec(sql`SELECT shelf_name FROM folder_members
      WHERE folder_id = ${A.sub}::uuid AND user_id = ${u.viewer}::uuid`)).toEqual([{ shelf_name: null }])
    // Its tasks keep their assignees.
    expect(await db.exec(sql`SELECT id, project_id, assignee_id FROM tasks
      WHERE id IN (${A.task}::uuid, ${late}::uuid) ORDER BY id`)).toEqual([
      { id: A.task, project_id: A.sub, assignee_id: u.editor },
      { id: late, project_id: A.sub, assignee_id: u.stranger },
    ].sort((x, y) => x.id.localeCompare(y.id)))
    await asNewServer(() => db.exec(sql`DELETE FROM folder_members
      WHERE folder_id IN (${A.root}::uuid, ${A.sub}::uuid) AND user_id = ${u.stranger}::uuid`))
  })

  test('after it: a page the old instance moves to the top level becomes a project and keeps its assignees', async () => {
    const assigned = id(0x10, 6)
    await db.exec(sql`INSERT INTO tasks (id, folder_id, title, created_by, assignee_id)
      VALUES (${assigned}::uuid, ${D.sub}::uuid, 'Dig', ${u.owner}::uuid, ${u.editor}::uuid)`)
    // Main's moveFolder to the top level writes only this.
    await db.exec(sql`UPDATE folders SET parent_folder_id = NULL, child_position = NULL WHERE id = ${D.sub}::uuid`)
    expect(await place(D.sub)).toEqual({ project_id: D.sub, parent_folder_id: null, owner_id: u.owner, tab_position: 'a0' })
    expect(await people(D.sub)).toEqual(await people(D.root))
    expect(await db.exec(sql`SELECT project_id, assignee_id FROM tasks WHERE id = ${assigned}::uuid`))
      .toEqual([{ project_id: D.sub, assignee_id: u.editor }])
  })

  test('after it: the old instance cannot change the people or invite on a project with other pages', async () => {
    const constraintOf = (e: unknown) => {
      const err = e as { constraint?: string; cause?: { constraint?: string } } | null
      return err?.cause?.constraint ?? err?.constraint
    }
    const before = await people(A.root)
    const attempts = [
      sql`INSERT INTO folder_members (folder_id, user_id, access) VALUES (${A.root}::uuid, ${u.stranger}::uuid, 'can_view')`,
      sql`DELETE FROM folder_members WHERE folder_id = ${A.root}::uuid AND user_id = ${u.viewer}::uuid`,
      sql`UPDATE folder_members SET access = 'full_control' WHERE folder_id = ${A.root}::uuid AND user_id = ${u.viewer}::uuid`,
    ]
    for (const attempt of attempts) {
      expect(constraintOf(await db.exec(attempt).then(() => null, (e: unknown) => e))).toBe('folder_members_old_server')
    }
    expect(await people(A.root)).toEqual(before)
    expect(constraintOf(await db.exec(sql`INSERT INTO invites (inviter_id, email, folder_id, access)
      VALUES (${u.owner}::uuid, 'old@example.com', ${A.root}::uuid, 'can_view')`).then(() => null, (e: unknown) => e)))
      .toBe('invites_old_server')
  })

  test('after it: a person removed from a project loses the rows 0062 left on its pages', async () => {
    expect(await people(A.tab)).toContainEqual({ user_id: u.viewer, access: 'can_view' })
    // Current server code reads 0063's assignee list. Keep the 0062 assertions
    // above on their original schema, then upgrade before invoking that code.
    const currentSchema = path.join(scratch, 'c')
    cutThrough('0063_', currentSchema)
    await db.migrate(currentSchema)
    for (const row of await db.exec(sql`SELECT assignee_id, assignee_ids FROM tasks WHERE assignee_id IS NOT NULL`)) {
      expect(row.assignee_ids).toEqual([row.assignee_id])
    }
    await asNewServer(() => removeMembership(db.db, A.root, u.viewer, { transferOwnership: false, actorId: u.owner }))
    expect(await db.exec(sql`SELECT f.id FROM folder_members m JOIN folders f ON f.id = m.folder_id
      WHERE m.user_id = ${u.viewer}::uuid AND f.project_id = ${A.root}::uuid`)).toEqual([])
    expect(await people(A.tab)).toEqual([
      { user_id: u.owner, access: 'full_control' },
      { user_id: u.editor, access: 'can_edit' },
    ])
  })
})
