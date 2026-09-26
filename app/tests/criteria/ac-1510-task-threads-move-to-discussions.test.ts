/*
AC-1510: migration 0059 (M5) moves every task's conversation into one
Discussion of the task's Folder, linked to the task, without losing or
changing a post, and afterwards the schema refuses a task-scoped comment.

Built as ac-852 builds 0029's test: the database is migrated through 0058
from a copy of the journal cut there, seeded the way production holds task
threads, and then the real migrations folder is applied on top. PGlite on
either leg: what is under test is the migration SQL.
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
  folder: '10000000-0000-4000-8000-000000000001',
  live: '20000000-0000-4000-8000-000000000001',
  trashed: '20000000-0000-4000-8000-000000000002',
  quiet: '20000000-0000-4000-8000-000000000003',
  blank: '20000000-0000-4000-8000-000000000004',
  long: '20000000-0000-4000-8000-000000000005',
  root: '30000000-0000-4000-8000-000000000001',
  reply: '30000000-0000-4000-8000-000000000002',
  later: '30000000-0000-4000-8000-000000000003',
  onTrashed: '30000000-0000-4000-8000-000000000004',
  onBlank: '30000000-0000-4000-8000-000000000005',
  onLong: '30000000-0000-4000-8000-000000000006',
  general: '30000000-0000-4000-8000-000000000007',
  file: '40000000-0000-4000-8000-000000000001',
  event: '50000000-0000-4000-8000-000000000001',
  generalDiscussion: '60000000-0000-4000-8000-000000000001',
  desk: '10000000-0000-4000-8000-000000000002',
  onDesk: '20000000-0000-4000-8000-000000000006',
  done: '20000000-0000-4000-8000-000000000007',
  converted: '20000000-0000-4000-8000-000000000008',
  deskNote: '30000000-0000-4000-8000-000000000008',
  onDone: '30000000-0000-4000-8000-000000000009',
  convertedPost: '30000000-0000-4000-8000-00000000000a',
  onConverted: '30000000-0000-4000-8000-00000000000b',
  photographer: '60000000-0000-4000-8000-000000000002',
}

const longTitle = 'x'.repeat(300)

type Snapshot = Record<string, unknown>[]
const before: Record<string, Snapshot> = {}

async function commentsSnapshot(): Promise<Snapshot> {
  return rows(
    db,
    sql`SELECT id, folder_id, parent_id, author_id, body, content::text AS content,
               created_at::text AS created_at, edited_at::text AS edited_at
          FROM comments ORDER BY id`,
  )
}

async function hangersSnapshot(): Promise<Record<string, Snapshot>> {
  return {
    likes: await rows(db, sql`SELECT comment_id, user_id FROM comment_likes ORDER BY comment_id, user_id`),
    files: await rows(db, sql`SELECT comment_id, file_id FROM comment_files ORDER BY comment_id`),
    mentions: await rows(
      db,
      sql`SELECT id, user_id, comment_id, event_id FROM mention_notices ORDER BY id`,
    ),
    notifications: await rows(
      db,
      sql`SELECT user_id, event_id, read_at FROM notifications ORDER BY user_id`,
    ),
  }
}

beforeAll(async () => {
  scratch = mkdtempSync(path.join(tmpdir(), 'dana-0059-'))
  mkdirSync(path.join(scratch, 'meta'))
  const journal = JSON.parse(
    readFileSync(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: JournalEntry[] }
  const cut = journal.entries.findIndex((entry) => entry.tag.startsWith('0059_'))
  expect(cut).toBeGreaterThan(0)
  const through0058 = journal.entries.slice(0, cut)
  for (const entry of through0058) {
    copyFileSync(
      path.join(migrationsFolder, `${entry.tag}.sql`),
      path.join(scratch, `${entry.tag}.sql`),
    )
  }
  writeFileSync(
    path.join(scratch, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries: through0058 }),
  )

  pglite = await PGlite.create({ extensions: { pg_trgm } })
  db = drizzle(pglite)
  await migrate(db, { migrationsFolder: scratch })

  await db.execute(sql`
    INSERT INTO users (id, display_name) VALUES
      (${ids.owner}::uuid, 'Owner'), (${ids.member}::uuid, 'Member')`)
  await db.execute(sql`
    INSERT INTO folders (id, owner_id, name, is_default) VALUES
      (${ids.folder}::uuid, ${ids.owner}::uuid, 'Trip', false),
      (${ids.desk}::uuid, ${ids.owner}::uuid, 'Desk', true)`)
  await db.execute(sql`
    INSERT INTO folder_members (folder_id, user_id) VALUES
      (${ids.folder}::uuid, ${ids.owner}::uuid), (${ids.folder}::uuid, ${ids.member}::uuid),
      (${ids.desk}::uuid, ${ids.owner}::uuid)`)
  await db.execute(sql`
    INSERT INTO tasks (id, folder_id, title, created_by, deleted_at) VALUES
      (${ids.live}::uuid, ${ids.folder}::uuid, '  Book the van ', ${ids.owner}::uuid, NULL),
      (${ids.trashed}::uuid, ${ids.folder}::uuid, 'Old idea', ${ids.owner}::uuid, '2026-06-01 00:00:00+00'),
      (${ids.quiet}::uuid, ${ids.folder}::uuid, 'Nobody spoke', ${ids.owner}::uuid, NULL),
      (${ids.blank}::uuid, ${ids.folder}::uuid, '   ', ${ids.owner}::uuid, NULL),
      (${ids.long}::uuid, ${ids.folder}::uuid, ${longTitle}, ${ids.owner}::uuid, NULL),
      (${ids.onDesk}::uuid, ${ids.desk}::uuid, 'Call the dentist back', ${ids.owner}::uuid, NULL),
      (${ids.converted}::uuid, ${ids.folder}::uuid, 'Photographer?', ${ids.owner}::uuid, NULL)`)
  await db.execute(sql`
    INSERT INTO tasks (id, folder_id, title, created_by, status, completed_at, completed_by) VALUES
      (${ids.done}::uuid, ${ids.folder}::uuid, 'Pack', ${ids.owner}::uuid, 'completed', '2026-05-05 00:00:00+00', ${ids.owner}::uuid)`)
  await db.execute(sql`
    INSERT INTO discussions (id, folder_id, title, created_by, is_general) VALUES
      (${ids.generalDiscussion}::uuid, ${ids.folder}::uuid, 'General discussion', ${ids.owner}::uuid, true)`)
  await db.execute(sql`
    INSERT INTO discussions (id, folder_id, title, created_by, created_at, last_activity_at,
                             state, resolved_at, resolved_by) VALUES
      (${ids.photographer}::uuid, ${ids.folder}::uuid, 'Photographer?', ${ids.owner}::uuid,
       '2026-03-04 00:00:00+00', '2026-03-05 00:00:00+00',
       'resolved', '2026-03-05 00:00:00+00', ${ids.owner}::uuid)`)
  await db.execute(sql`
    INSERT INTO comments (id, folder_id, task_id, discussion_id, parent_id, author_id, body, content, created_at, edited_at) VALUES
      (${ids.root}::uuid, ${ids.folder}::uuid, ${ids.live}::uuid, NULL, NULL, ${ids.member}::uuid,
       'who drives?', ${JSON.stringify({ version: 1, blocks: [{ kind: 'paragraph', rich_content: [{ text: 'who drives?' }] }] })}::jsonb,
       '2026-05-01 10:00:00.123456+00', '2026-05-01 11:00:00+00'),
      (${ids.reply}::uuid, ${ids.folder}::uuid, ${ids.live}::uuid, NULL, ${ids.root}::uuid, ${ids.owner}::uuid,
       'I will', NULL, '2026-05-02 10:00:00+00', NULL),
      (${ids.later}::uuid, ${ids.folder}::uuid, ${ids.live}::uuid, NULL, NULL, ${ids.owner}::uuid,
       NULL, NULL, '2026-05-03 09:30:00.654321+00', NULL),
      (${ids.onTrashed}::uuid, ${ids.folder}::uuid, ${ids.trashed}::uuid, NULL, NULL, ${ids.owner}::uuid,
       'dropped', NULL, '2026-04-01 00:00:00+00', NULL),
      (${ids.onBlank}::uuid, ${ids.folder}::uuid, ${ids.blank}::uuid, NULL, NULL, ${ids.member}::uuid,
       'blank', NULL, '2026-04-02 00:00:00+00', NULL),
      (${ids.onLong}::uuid, ${ids.folder}::uuid, ${ids.long}::uuid, NULL, NULL, ${ids.member}::uuid,
       'long', NULL, '2026-04-03 00:00:00+00', NULL),
      (${ids.general}::uuid, ${ids.folder}::uuid, NULL, ${ids.generalDiscussion}::uuid, NULL, ${ids.owner}::uuid,
       'page talk', NULL, '2026-03-01 00:00:00+00', NULL),
      (${ids.deskNote}::uuid, ${ids.desk}::uuid, ${ids.onDesk}::uuid, NULL, NULL, ${ids.owner}::uuid,
       'their number is on the card', NULL, '2026-04-04 00:00:00+00', NULL),
      (${ids.onDone}::uuid, ${ids.folder}::uuid, ${ids.done}::uuid, NULL, NULL, ${ids.member}::uuid,
       'packed', NULL, '2026-04-05 00:00:00+00', NULL),
      (${ids.convertedPost}::uuid, ${ids.folder}::uuid, NULL, ${ids.photographer}::uuid, NULL, ${ids.owner}::uuid,
       NULL, ${JSON.stringify({ version: 1, blocks: [{ kind: 'paragraph', rich_content: { version: 1, runs: [{ text: 'Turned into a task: ' }, { text: 'Photographer?', href: `/app/tasks/${ids.converted}` }] } }] })}::jsonb,
       '2026-03-05 00:00:00+00', NULL),
      (${ids.onConverted}::uuid, ${ids.folder}::uuid, ${ids.converted}::uuid, NULL, NULL, ${ids.member}::uuid,
       'Ana can do it', NULL, '2026-03-06 00:00:00+00', NULL)`)
  await db.execute(sql`
    INSERT INTO comment_likes (comment_id, user_id) VALUES
      (${ids.root}::uuid, ${ids.owner}::uuid), (${ids.reply}::uuid, ${ids.member}::uuid)`)
  await db.execute(sql`
    INSERT INTO files (id, owner_id, folder_id, kind, name, mime, bytes) VALUES
      (${ids.file}::uuid, ${ids.owner}::uuid, ${ids.folder}::uuid, 'file', 'route.pdf', 'application/pdf', 3)`)
  await db.execute(sql`
    INSERT INTO comment_files (comment_id, file_id) VALUES (${ids.later}::uuid, ${ids.file}::uuid)`)
  await db.execute(sql`
    INSERT INTO events (id, actor_id, verb, subject_kind, subject_id, subject_name, folder_id, detail) VALUES
      (${ids.event}::uuid, ${ids.member}::uuid, 'created', 'comment', ${ids.root}::uuid, 'who drives?',
       ${ids.folder}::uuid, 'mentioned you in "Book the van"')`)
  await db.execute(sql`
    INSERT INTO mention_notices (user_id, comment_id, event_id) VALUES
      (${ids.owner}::uuid, ${ids.root}::uuid, ${ids.event}::uuid)`)
  await db.execute(sql`
    INSERT INTO notifications (user_id, event_id) VALUES (${ids.owner}::uuid, ${ids.event}::uuid)`)
  await db.execute(sql`
    INSERT INTO task_thread_reads (task_id, user_id, read_at) VALUES
      (${ids.live}::uuid, ${ids.member}::uuid, '2026-05-02 12:00:00+00')`)

  before.comments = await commentsSnapshot()
  Object.assign(before, await hangersSnapshot())

  await migrate(db, { migrationsFolder })
}, 60_000)

afterAll(async () => {
  await pglite.close()
  rmSync(scratch, { recursive: true, force: true })
})

describe('AC-1510 migration 0059 moves task threads into linked Discussions', () => {
  test('one Discussion per task with comments, titled with the task, and none for a quiet task', async () => {
    const made = await rows(
      db,
      sql`SELECT task_id, folder_id, title, created_by, state, is_general,
                 (created_at AT TIME ZONE 'UTC')::text AS created_at,
                 (last_activity_at AT TIME ZONE 'UTC')::text AS last_activity_at,
                 (trashed_at AT TIME ZONE 'UTC')::text AS trashed_at
            FROM discussions WHERE task_id IS NOT NULL ORDER BY task_id`,
    )
    expect(made).toEqual([
      {
        task_id: ids.live,
        folder_id: ids.folder,
        title: 'Book the van',
        created_by: ids.member,
        state: 'open',
        is_general: false,
        created_at: '2026-05-01 10:00:00.123456',
        last_activity_at: '2026-05-03 09:30:00.654321',
        trashed_at: null,
      },
      {
        // A trashed task's talk is live, so it cannot be purged with the
        // task or stranded beside a second thread after a restore.
        task_id: ids.trashed,
        folder_id: ids.folder,
        title: 'Old idea',
        created_by: ids.owner,
        state: 'open',
        is_general: false,
        created_at: '2026-04-01 00:00:00',
        last_activity_at: '2026-04-01 00:00:00',
        trashed_at: null,
      },
      {
        task_id: ids.blank,
        folder_id: ids.folder,
        title: 'Untitled task',
        created_by: ids.member,
        state: 'open',
        is_general: false,
        created_at: '2026-04-02 00:00:00',
        last_activity_at: '2026-04-02 00:00:00',
        trashed_at: null,
      },
      {
        task_id: ids.long,
        folder_id: ids.folder,
        title: 'x'.repeat(200),
        created_by: ids.member,
        state: 'open',
        is_general: false,
        created_at: '2026-04-03 00:00:00',
        last_activity_at: '2026-04-03 00:00:00',
        trashed_at: null,
      },
      {
        task_id: ids.onDesk,
        folder_id: ids.desk,
        title: 'Call the dentist back',
        created_by: ids.owner,
        state: 'open',
        is_general: false,
        created_at: '2026-04-04 00:00:00',
        last_activity_at: '2026-04-04 00:00:00',
        trashed_at: null,
      },
      {
        task_id: ids.done,
        folder_id: ids.folder,
        title: 'Pack',
        created_by: ids.member,
        // Open although the task is done: a resolved thread would freeze
        // its commenters out of their own words.
        state: 'open',
        is_general: false,
        created_at: '2026-04-05 00:00:00',
        last_activity_at: '2026-04-05 00:00:00',
        trashed_at: null,
      },
      {
        // Converted before M5: the old thread is linked, not a new one made,
        // and the conversion's resolve is undone.
        task_id: ids.converted,
        folder_id: ids.folder,
        title: 'Photographer?',
        created_by: ids.owner,
        state: 'open',
        is_general: false,
        created_at: '2026-03-04 00:00:00',
        last_activity_at: '2026-03-06 00:00:00',
        trashed_at: null,
      },
    ])
    expect(
      await rows(db, sql`SELECT task_id FROM discussions WHERE id = ${ids.photographer}::uuid`),
    ).toEqual([{ task_id: ids.converted }])
    expect(
      await rows(
        db,
        sql`SELECT (resolved_at AT TIME ZONE 'UTC')::text AS resolved_at, resolved_by, current_outcome_id
              FROM discussions WHERE task_id IN (${ids.done}::uuid, ${ids.converted}::uuid)`,
      ),
    ).toEqual([
      { resolved_at: null, resolved_by: null, current_outcome_id: null },
      { resolved_at: null, resolved_by: null, current_outcome_id: null },
    ])
  })

  test('every task comment sits in its task\'s Discussion; the General one is untouched', async () => {
    const scoped = await rows(
      db,
      sql`SELECT c.id, c.task_id, d.task_id AS discussion_task, d.is_general
            FROM comments c JOIN discussions d ON d.id = c.discussion_id
           ORDER BY c.id`,
    )
    expect(scoped).toEqual([
      { id: ids.root, task_id: null, discussion_task: ids.live, is_general: false },
      { id: ids.reply, task_id: null, discussion_task: ids.live, is_general: false },
      { id: ids.later, task_id: null, discussion_task: ids.live, is_general: false },
      { id: ids.onTrashed, task_id: null, discussion_task: ids.trashed, is_general: false },
      { id: ids.onBlank, task_id: null, discussion_task: ids.blank, is_general: false },
      { id: ids.onLong, task_id: null, discussion_task: ids.long, is_general: false },
      { id: ids.general, task_id: null, discussion_task: null, is_general: true },
      { id: ids.deskNote, task_id: null, discussion_task: ids.onDesk, is_general: false },
      { id: ids.onDone, task_id: null, discussion_task: ids.done, is_general: false },
      { id: ids.convertedPost, task_id: null, discussion_task: ids.converted, is_general: false },
      { id: ids.onConverted, task_id: null, discussion_task: ids.converted, is_general: false },
    ])
    expect(
      await rows(db, sql`SELECT discussion_id FROM comments WHERE id = ${ids.onConverted}::uuid`),
    ).toEqual([{ discussion_id: ids.photographer }])
  })

  test('authors, words, times, replies, likes, files, mentions and notifications are unchanged', async () => {
    expect(await commentsSnapshot()).toEqual(before.comments)
    const after = await hangersSnapshot()
    expect(after.likes).toEqual(before.likes)
    expect(after.files).toEqual(before.files)
    expect(after.mentions).toEqual(before.mentions)
    expect(after.notifications).toEqual(before.notifications)
    // The bell's join now lands the mention on the task's Discussion.
    expect(
      await rows(
        db,
        sql`SELECT d.task_id FROM notifications n
              JOIN events e ON e.id = n.event_id
              JOIN comments c ON e.subject_kind = 'comment' AND c.id = e.subject_id
              JOIN discussions d ON d.id = c.discussion_id`,
      ),
    ).toEqual([{ task_id: ids.live }])
  })

  test('whoever had read the task thread keeps that read; every other member has read it to its last post', async () => {
    expect(
      await rows(
        db,
        sql`SELECT d.task_id, r.user_id, (r.read_at AT TIME ZONE 'UTC')::text AS read_at
              FROM discussion_reads r JOIN discussions d ON d.id = r.discussion_id
             ORDER BY d.task_id, r.user_id`,
      ),
    ).toEqual([
      { task_id: ids.live, user_id: ids.owner, read_at: '2026-05-03 09:30:00.654321' },
      { task_id: ids.live, user_id: ids.member, read_at: '2026-05-02 12:00:00' },
      { task_id: ids.trashed, user_id: ids.owner, read_at: '2026-04-01 00:00:00' },
      { task_id: ids.trashed, user_id: ids.member, read_at: '2026-04-01 00:00:00' },
      { task_id: ids.blank, user_id: ids.owner, read_at: '2026-04-02 00:00:00' },
      { task_id: ids.blank, user_id: ids.member, read_at: '2026-04-02 00:00:00' },
      { task_id: ids.long, user_id: ids.owner, read_at: '2026-04-03 00:00:00' },
      { task_id: ids.long, user_id: ids.member, read_at: '2026-04-03 00:00:00' },
      { task_id: ids.onDesk, user_id: ids.owner, read_at: '2026-04-04 00:00:00' },
      { task_id: ids.done, user_id: ids.owner, read_at: '2026-04-05 00:00:00' },
      { task_id: ids.done, user_id: ids.member, read_at: '2026-04-05 00:00:00' },
      { task_id: ids.converted, user_id: ids.owner, read_at: '2026-03-06 00:00:00' },
      { task_id: ids.converted, user_id: ids.member, read_at: '2026-03-06 00:00:00' },
    ])
  })

  test('a task-scoped comment is refused, and a task has one live Discussion', async () => {
    await expectRejectedBy(
      () =>
        db.execute(sql`
          INSERT INTO comments (folder_id, task_id, author_id, body)
          VALUES (${ids.folder}::uuid, ${ids.quiet}::uuid, ${ids.owner}::uuid, 'late')`),
      'comments_no_task_scope_check',
    )
    await expectRejectedBy(
      () =>
        db.execute(sql`
          INSERT INTO discussions (folder_id, task_id, title, created_by)
          VALUES (${ids.folder}::uuid, ${ids.live}::uuid, 'Second', ${ids.owner}::uuid)`),
      'discussions_one_live_per_task_key',
    )
  })
})
