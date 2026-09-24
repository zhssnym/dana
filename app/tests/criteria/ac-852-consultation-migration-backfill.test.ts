/*
AC-852 to AC-854: migration 0029 (issue #320) moves every Folder-level
conversation into one "General discussion" per Folder without losing or
duplicating anything, and the new schema refuses the states #320 forbids.

The database is built through 0028 first, from a copy of the journal cut at
0028, so that the rows exist **before** 0029 runs exactly as they do in
production; then the real migrations folder is applied on top. It runs on
PGlite whichever leg is selected: what is under test is the migration SQL,
which is the same text on both.
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
  member: '00000000-0000-4000-8000-000000000002',
  withThread: '10000000-0000-4000-8000-000000000001',
  desk: '10000000-0000-4000-8000-000000000002',
  trashed: '10000000-0000-4000-8000-000000000003',
  taskOnly: '10000000-0000-4000-8000-000000000004',
  empty: '10000000-0000-4000-8000-000000000005',
  task: '20000000-0000-4000-8000-000000000001',
  taskInThread: '20000000-0000-4000-8000-000000000002',
  root: '30000000-0000-4000-8000-000000000001',
  reply: '30000000-0000-4000-8000-000000000002',
  second: '30000000-0000-4000-8000-000000000003',
  deskComment: '30000000-0000-4000-8000-000000000004',
  trashedComment: '30000000-0000-4000-8000-000000000005',
  taskComment: '30000000-0000-4000-8000-000000000006',
  taskComment2: '30000000-0000-4000-8000-000000000007',
  file: '40000000-0000-4000-8000-000000000001',
}

type Snapshot = Record<string, unknown>[]
let before: Snapshot

async function commentsSnapshot(): Promise<Snapshot> {
  return rows(
    db,
    sql`SELECT id, folder_id, task_id, parent_id, author_id, body,
               created_at::text AS created_at, edited_at::text AS edited_at
          FROM comments ORDER BY id`,
  )
}

beforeAll(async () => {
  // Build a migrations folder that stops at 0028.
  scratch = mkdtempSync(path.join(tmpdir(), 'dana-0029-'))
  mkdirSync(path.join(scratch, 'meta'))
  const journal = JSON.parse(
    readFileSync(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: JournalEntry[] }
  const cut = journal.entries.findIndex((entry) => entry.tag.startsWith('0029_'))
  expect(cut).toBeGreaterThan(0)
  const through0028 = journal.entries.slice(0, cut)
  for (const entry of through0028) {
    copyFileSync(
      path.join(migrationsFolder, `${entry.tag}.sql`),
      path.join(scratch, `${entry.tag}.sql`),
    )
  }
  writeFileSync(
    path.join(scratch, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries: through0028 }),
  )

  pglite = await PGlite.create({ extensions: { pg_trgm } })
  db = drizzle(pglite)
  await migrate(db, { migrationsFolder: scratch })

  await db.execute(sql`
    INSERT INTO users (id, display_name) VALUES
      (${ids.owner}::uuid, 'Owner'), (${ids.member}::uuid, 'Member')`)
  await db.execute(sql`
    INSERT INTO folders (id, owner_id, name, is_default, deleted_at) VALUES
      (${ids.withThread}::uuid, ${ids.owner}::uuid, 'Thread', false, NULL),
      (${ids.desk}::uuid, ${ids.owner}::uuid, 'Desk', true, NULL),
      (${ids.trashed}::uuid, ${ids.owner}::uuid, 'Trashed', false, now()),
      (${ids.taskOnly}::uuid, ${ids.owner}::uuid, 'Task only', false, NULL),
      (${ids.empty}::uuid, ${ids.owner}::uuid, 'Empty', false, NULL)`)
  await db.execute(sql`
    INSERT INTO tasks (id, folder_id, title, created_by) VALUES
      (${ids.task}::uuid, ${ids.taskOnly}::uuid, 'A task', ${ids.owner}::uuid),
      (${ids.taskInThread}::uuid, ${ids.withThread}::uuid, 'Another', ${ids.owner}::uuid)`)
  await db.execute(sql`
    INSERT INTO comments (id, folder_id, task_id, parent_id, author_id, body, created_at, edited_at) VALUES
      (${ids.root}::uuid, ${ids.withThread}::uuid, NULL, NULL, ${ids.member}::uuid,
       'first words', '2026-01-01 10:00:00.123456+00', '2026-01-02 10:00:00+00'),
      (${ids.reply}::uuid, ${ids.withThread}::uuid, NULL, ${ids.root}::uuid, ${ids.owner}::uuid,
       'a reply', '2026-01-03 10:00:00+00', NULL),
      (${ids.second}::uuid, ${ids.withThread}::uuid, NULL, NULL, ${ids.owner}::uuid,
       NULL, '2026-02-01 09:30:00.654321+00', NULL),
      (${ids.deskComment}::uuid, ${ids.desk}::uuid, NULL, NULL, ${ids.owner}::uuid,
       'desk note', '2026-03-01 00:00:00+00', NULL),
      (${ids.trashedComment}::uuid, ${ids.trashed}::uuid, NULL, NULL, ${ids.owner}::uuid,
       'kept in trash', '2026-04-01 00:00:00+00', NULL),
      (${ids.taskComment}::uuid, ${ids.taskOnly}::uuid, ${ids.task}::uuid, NULL, ${ids.owner}::uuid,
       'on a task', '2026-05-01 00:00:00+00', NULL),
      (${ids.taskComment2}::uuid, ${ids.withThread}::uuid, ${ids.taskInThread}::uuid, NULL, ${ids.member}::uuid,
       'task beside a thread', '2026-05-02 00:00:00+00', NULL)`)
  await db.execute(sql`
    INSERT INTO comment_likes (comment_id, user_id) VALUES (${ids.root}::uuid, ${ids.owner}::uuid)`)
  await db.execute(sql`
    INSERT INTO files (id, owner_id, folder_id, kind, name, mime, bytes) VALUES
      (${ids.file}::uuid, ${ids.owner}::uuid, ${ids.withThread}::uuid, 'file', 'a.txt', 'text/plain', 3)`)
  await db.execute(sql`
    INSERT INTO comment_files (comment_id, file_id) VALUES (${ids.second}::uuid, ${ids.file}::uuid)`)

  before = await commentsSnapshot()

  // Now 0029, from the real folder, over the populated database.
  await migrate(db, { migrationsFolder })
  /* Building PGlite through 29 migrations takes seconds on its own, and the
     parallel suite on the CI runner pushes it past vitest's 10 s default. */
}, 60_000)

afterAll(async () => {
  await pglite.close()
  rmSync(scratch, { recursive: true, force: true })
})

describe('AC-852 migration 0029 moves Folder-level comments into one General discussion', () => {
  test('exactly one General discussion per Folder with Folder-level comments, none elsewhere', async () => {
    const discussions = await rows(
      db,
      sql`SELECT folder_id, title, context, created_by, state, current_outcome_id,
                 resolved_at, trashed_at, is_general,
                 (created_at AT TIME ZONE 'UTC')::text AS created_at,
                 (last_activity_at AT TIME ZONE 'UTC')::text AS last_activity_at
            FROM discussions ORDER BY folder_id`,
    )
    expect(discussions.map((row) => row.folder_id)).toEqual([
      ids.withThread,
      ids.desk,
      ids.trashed,
    ])
    for (const row of discussions) {
      expect(row).toMatchObject({
        title: 'General discussion',
        context: null,
        created_by: ids.owner,
        state: 'open',
        current_outcome_id: null,
        resolved_at: null,
        trashed_at: null,
        // The flag, not the title, is what the legacy thread keys on (4.31).
        is_general: true,
      })
    }
    // No fabricated activity: the thread's own first and last times.
    expect(discussions[0]).toMatchObject({
      created_at: '2026-01-01 10:00:00.123456',
      last_activity_at: '2026-02-01 09:30:00.654321',
    })
  })

  test('every Folder-level comment points at its Folder\'s discussion; Task comments are untouched', async () => {
    const scoped = await rows(
      db,
      sql`SELECT c.id, c.task_id, c.discussion_id, d.folder_id AS discussion_folder
            FROM comments c LEFT JOIN discussions d ON d.id = c.discussion_id
           ORDER BY c.id`,
    )
    for (const row of scoped) {
      if (row.task_id === null) {
        expect(row.discussion_id, String(row.id)).not.toBeNull()
      } else {
        expect(row.discussion_id, String(row.id)).toBeNull()
      }
    }
    const byId = new Map(scoped.map((row) => [row.id, row]))
    expect(byId.get(ids.root)?.discussion_id).toBe(byId.get(ids.reply)?.discussion_id)
    expect(byId.get(ids.root)?.discussion_id).toBe(byId.get(ids.second)?.discussion_id)
    expect(byId.get(ids.root)?.discussion_folder).toBe(ids.withThread)
    expect(byId.get(ids.deskComment)?.discussion_folder).toBe(ids.desk)
    expect(byId.get(ids.trashedComment)?.discussion_folder).toBe(ids.trashed)
  })

  test('comment content, authorship, timestamps, likes and files are unchanged', async () => {
    expect(await commentsSnapshot()).toEqual(before)
    expect(
      await rows(db, sql`SELECT comment_id, user_id FROM comment_likes`),
    ).toEqual([{ comment_id: ids.root, user_id: ids.owner }])
    expect(
      await rows(db, sql`SELECT comment_id, file_id FROM comment_files`),
    ).toEqual([{ comment_id: ids.second, file_id: ids.file }])
  })
})

describe('AC-853 the 0029 schema refuses what #320 forbids', () => {
  test('a comment cannot be both Task-scoped and Discussion-scoped', async () => {
    await expectRejectedBy(
      () =>
        db.execute(sql`
          UPDATE comments
             SET discussion_id = (SELECT id FROM discussions WHERE folder_id = ${ids.withThread}::uuid)
           WHERE id = ${ids.taskComment2}::uuid`),
      'comments_one_scope_check',
    )
  })

  test('a comment cannot name a Discussion of another Folder', async () => {
    await expectRejectedBy(
      () =>
        db.execute(sql`
          UPDATE comments
             SET discussion_id = (SELECT id FROM discussions WHERE folder_id = ${ids.desk}::uuid)
           WHERE id = ${ids.root}::uuid`),
      'comments_discussion_scope_fkey',
    )
  })

  /* Widened by 0040 (Wave 2 decision 3): a resolved Discussion may have no
     Outcome, a thread closed without a decision. An open one still never has
     one, resolved still means resolved_at, and a current Outcome is still one
     of the Discussion's own. */
  test('open never has a current Outcome, resolved needs resolved_at, and the Outcome is its own', async () => {
    const [own] = await rows(
      db,
      sql`INSERT INTO discussion_outcomes (discussion_id, statement, actor_id)
          SELECT id, 'own', ${ids.owner}::uuid FROM discussions WHERE folder_id = ${ids.withThread}::uuid
          RETURNING id`,
    )
    await expectRejectedBy(
      () =>
        db.execute(sql`
          UPDATE discussions SET current_outcome_id = ${String(own?.id)}::uuid
           WHERE folder_id = ${ids.withThread}::uuid`),
      'discussions_resolution_check',
    )
    await expectRejectedBy(
      () =>
        db.execute(sql`
          UPDATE discussions SET state = 'resolved'
           WHERE folder_id = ${ids.withThread}::uuid`),
      'discussions_resolution_check',
    )
    // 0040: closed without a decision is admitted, and reopens.
    await db.execute(sql`
      UPDATE discussions SET state = 'resolved', resolved_at = now()
       WHERE folder_id = ${ids.withThread}::uuid`)
    await db.execute(sql`
      UPDATE discussions SET state = 'open', resolved_at = NULL
       WHERE folder_id = ${ids.withThread}::uuid`)
    const [other] = await rows(
      db,
      sql`INSERT INTO discussion_outcomes (discussion_id, statement, actor_id)
          SELECT id, 'elsewhere', ${ids.owner}::uuid FROM discussions WHERE folder_id = ${ids.desk}::uuid
          RETURNING id`,
    )
    await expectRejectedBy(
      () =>
        db.execute(sql`
          UPDATE discussions
             SET state = 'resolved', resolved_at = now(), current_outcome_id = ${String(other?.id)}::uuid
           WHERE folder_id = ${ids.withThread}::uuid`),
      'discussions_current_outcome_fkey',
    )
  })
})

describe('AC-853 at most one open General discussion per Folder', () => {
  test('a second open, untrashed General is refused; resolved, trashed or ordinary ones are not', async () => {
    await expectRejectedBy(
      () =>
        db.execute(sql`
          INSERT INTO discussions (folder_id, title, created_by, is_general)
          VALUES (${ids.desk}::uuid, 'Renamed', ${ids.owner}::uuid, true)`),
      'discussions_one_open_general_key',
    )
    // An ordinary Discussion may carry the title; a trashed General may sit beside.
    await db.execute(sql`
      INSERT INTO discussions (folder_id, title, created_by)
      VALUES (${ids.desk}::uuid, 'General discussion', ${ids.owner}::uuid)`)
    await db.execute(sql`
      INSERT INTO discussions (folder_id, title, created_by, is_general, trashed_at)
      VALUES (${ids.desk}::uuid, 'General discussion', ${ids.owner}::uuid, true, now())`)
    expect(
      await rows(
        db,
        sql`SELECT count(*)::int AS n FROM discussions
             WHERE folder_id = ${ids.desk}::uuid AND is_general`,
      ),
    ).toEqual([{ n: 2 }])
    await db.execute(sql`
      DELETE FROM discussions WHERE folder_id = ${ids.desk}::uuid
         AND (NOT is_general OR trashed_at IS NOT NULL)`)
  })
})

describe('AC-854 Outcomes outlive their source comment and supersession', () => {
  test('resolve, reopen and resolve again keeps both Outcomes; deleting the source comment keeps the snapshot', async () => {
    const [discussion] = await rows(
      db,
      sql`SELECT id FROM discussions WHERE folder_id = ${ids.withThread}::uuid`,
    )
    const discussionId = String(discussion?.id)
    const [first] = await rows(
      db,
      sql`INSERT INTO discussion_outcomes (discussion_id, statement, actor_id, source_comment_id)
          VALUES (${discussionId}::uuid, 'first words', ${ids.owner}::uuid, ${ids.root}::uuid)
          RETURNING id`,
    )
    await db.execute(sql`
      UPDATE discussions
         SET state = 'resolved', resolved_at = now(), resolved_by = ${ids.owner}::uuid,
             current_outcome_id = ${String(first?.id)}::uuid
       WHERE id = ${discussionId}::uuid`)
    await db.execute(sql`
      UPDATE discussions
         SET state = 'open', resolved_at = NULL, resolved_by = NULL, current_outcome_id = NULL
       WHERE id = ${discussionId}::uuid`)
    const [second] = await rows(
      db,
      sql`INSERT INTO discussion_outcomes (discussion_id, statement, actor_id)
          VALUES (${discussionId}::uuid, 'changed our minds', ${ids.member}::uuid)
          RETURNING id`,
    )
    await db.execute(sql`
      UPDATE discussions
         SET state = 'resolved', resolved_at = now(), current_outcome_id = ${String(second?.id)}::uuid
       WHERE id = ${discussionId}::uuid`)

    // The source comment (and its reply, by cascade) is deleted.
    await db.execute(sql`DELETE FROM comments WHERE id = ${ids.root}::uuid`)

    expect(
      await rows(
        db,
        sql`SELECT id, statement, source_comment_id FROM discussion_outcomes
             WHERE discussion_id = ${discussionId}::uuid ORDER BY created_at, statement`,
      ),
    ).toEqual(
      expect.arrayContaining([
        { id: first?.id, statement: 'first words', source_comment_id: null },
        { id: second?.id, statement: 'changed our minds', source_comment_id: null },
      ]),
    )
  })

  test('purging the Folder removes its Discussions, Outcomes and comments', async () => {
    // A current Outcome still naming a live source comment must not block
    // the purge's single cascading statement.
    const [discussion] = await rows(
      db,
      sql`SELECT id FROM discussions WHERE folder_id = ${ids.withThread}::uuid`,
    )
    const discussionId = String(discussion?.id)
    const [live] = await rows(
      db,
      sql`INSERT INTO discussion_outcomes (discussion_id, statement, actor_id, source_comment_id)
          VALUES (${discussionId}::uuid, 'still sourced', ${ids.owner}::uuid, ${ids.second}::uuid)
          RETURNING id`,
    )
    await db.execute(sql`
      UPDATE discussions SET current_outcome_id = ${String(live?.id)}::uuid
       WHERE id = ${discussionId}::uuid`)
    await db.execute(sql`DELETE FROM folders WHERE id = ${ids.withThread}::uuid`)
    expect(
      await rows(
        db,
        sql`SELECT
              (SELECT count(*)::int FROM discussions WHERE folder_id = ${ids.withThread}::uuid) AS d,
              (SELECT count(*)::int FROM comments WHERE folder_id = ${ids.withThread}::uuid) AS c,
              (SELECT count(*)::int FROM discussion_outcomes o
                 WHERE NOT EXISTS (SELECT 1 FROM discussions d WHERE d.id = o.discussion_id)) AS orphans`,
      ),
    ).toEqual([{ d: 0, c: 0, orphans: 0 }])
  })
})
