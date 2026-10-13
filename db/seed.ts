/*
Example data for local dev and the browser test: `npx tsx db/seed.ts`.
Ids are fixed so tests can name rows. Dates are relative to today.
Nadia shares nothing, so her rows never show for Hassan or Imran in the browser test.
The seed empties every table first. It refuses production and the TEST_DATABASE_URL database.
*/
import { pathToFileURL } from 'node:url'

import { sql } from 'drizzle-orm'

import { createDbClient } from './client.js'
import type { Db } from './client.js'

export const seedIds = {
  hassan: '11111111-1111-4111-8111-111111111111',
  imran: '22222222-2222-4222-8222-222222222222',
  hassanDesk: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  imranDesk: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  groceries: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  taskBuyMilk: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  taskCallPlumber: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  taskWaterPlants: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  taskPayRent: '99999999-9999-4999-8999-999999999999',
  taskOldIdea: '88888888-8888-4888-8888-888888888888',
  taskSortInbox: '77777777-7777-4777-8777-777777777777',
  waterPlantsSeries: '66666666-6666-4666-8666-666666666666',
  // Nadia shares nothing. See the header.
  nadia: '33333333-3333-4333-8333-333333333333',
  nadiaDesk: '44444444-4444-4444-8444-444444444444',
  nadiaStudio: '55555555-5555-4555-8555-555555555555',
  taskNadiaDraft: '10101010-1010-4010-8010-101010101010',
  shelfNadiaReading: '20202020-2020-4020-8020-202020202020',
  fileNadiaSketch: '30303030-3030-4030-8030-303030303030',
  commentNadiaNote: '40404040-4040-4040-8040-404040404040',
  discussionNadiaDraft: '41414141-4141-4141-8141-414141414141',
  eventNadiaCreated: '50505050-5050-4050-8050-505050505050',
  viewNadiaThisWeek: '60606060-6060-4060-8060-606060606060',
  blockNadiaSection: '70707070-7070-4070-8070-707070707070',
  blockNadiaParagraph: '80808080-8080-4080-8080-808080808080',
  blockNadiaImage: '90909090-9090-4090-8090-909090909090',
  blockNadiaFolderRef: '01010101-0101-4101-8101-010101010101',
  blockNadiaShelfParagraph: '02020202-0202-4202-8202-020202020202',
} as const

function isoDate(daysFromToday: number): string {
  const d = new Date(Date.now() + daysFromToday * 86400000)
  return d.toISOString().slice(0, 10)
}

/** Empties every public table. The list comes from pg_class, so a new table is included. */
async function truncateEveryApplicationTable(db: Db): Promise<void> {
  const result = (await db.execute(sql`
    SELECT t.relname AS name
    FROM pg_class t
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relkind = 'r'
    ORDER BY t.relname
  `)) as unknown as { rows: Array<{ name: unknown }> }
  const names = result.rows
    .map((row) => String(row.name))
    // The names go into raw SQL, so accept plain names only.
    .filter((name) => /^[a-z_][a-z0-9_]*$/.test(name))
  if (names.length === 0) {
    throw new Error('the seed found no tables to truncate: migrations did not run')
  }
  await db.execute(
    sql.raw(`TRUNCATE ${names.map((name) => `"${name}"`).join(', ')} CASCADE`),
  )
}

/** Host and database only: the connection string has a password. */
function describeTarget(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname}`
  } catch {
    return 'an unparseable connection string'
  }
}

/** The Postgres test run shares the TEST_DATABASE_URL database. Do not empty it by accident. */
function refuseTheTestDatabase(explicitUrl: string | undefined): void {
  if (explicitUrl !== undefined) return
  const testUrl =
    process.env.TEST_DATABASE_URL === '' ? undefined : process.env.TEST_DATABASE_URL
  if (testUrl === undefined) return
  if (process.env.DANA_SEED_TEST_DATABASE === '1') return
  const target = describeTarget(testUrl)
  throw new Error(
    `the seed empties every table in the public schema. No DATABASE_URL is set, ` +
      `so it would have emptied ${target}, which is what TEST_DATABASE_URL names and ` +
      `what every file of the Postgres test leg shares. Set DATABASE_URL to the ` +
      `database you mean, or clear TEST_DATABASE_URL to seed the local PGlite .data ` +
      `directory, or set DANA_SEED_TEST_DATABASE=1 to empty ${target} on purpose.`,
  )
}

export async function seed(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('the seed truncates every table and refuses to run in production')
  }
  const explicitUrl =
    process.env.DATABASE_URL === '' ? undefined : process.env.DATABASE_URL
  refuseTheTestDatabase(explicitUrl)
  const client = await createDbClient({
    url: explicitUrl,
    dataDir: '.data',
  })
  const { db } = client
  const today = isoDate(0)
  const tomorrow = isoDate(1)
  const nextWeek = isoDate(7)
  const yesterdayInstant = new Date(Date.now() - 86400000).toISOString()
  // The reminder fires 60 minutes before 09:00 in Asia/Karachi (UTC+5, no DST): 03:00Z.
  const reminderFireInstant = `${tomorrow}T03:00:00Z`

  await client.runMigrations()
  await truncateEveryApplicationTable(db)

  await db.execute(sql`
    INSERT INTO users (id, google_sub, email, display_name, timezone) VALUES
      (${seedIds.hassan}, 'seed-google-sub-hassan', 'hassan@example.com', 'Hassan', 'Asia/Karachi'),
      (${seedIds.imran}, 'seed-google-sub-imran', 'imran@example.com', 'Imran', 'Europe/Berlin'),
      (${seedIds.nadia}, 'seed-google-sub-nadia', 'nadia@example.com', 'Nadia', 'UTC')
  `)
  await db.execute(sql`
    INSERT INTO user_settings (user_id)
    VALUES (${seedIds.hassan}), (${seedIds.imran}), (${seedIds.nadia})
  `)
  // No connection for Nadia: it would put her in Hassan's people list and pickers.
  await db.execute(sql`
    INSERT INTO connections (user_a_id, user_b_id)
    VALUES (${seedIds.hassan}, ${seedIds.imran})
  `)
  await db.execute(sql`
    INSERT INTO folders (id, owner_id, name, is_default) VALUES
      (${seedIds.hassanDesk}, ${seedIds.hassan}, 'Desk', true),
      (${seedIds.imranDesk}, ${seedIds.imran}, 'Desk', true),
      (${seedIds.groceries}, ${seedIds.hassan}, 'Groceries', false),
      (${seedIds.nadiaDesk}, ${seedIds.nadia}, 'Desk', true),
      (${seedIds.nadiaStudio}, ${seedIds.nadia}, 'Studio', false)
  `)
  // The four native facets of each folder, with the keys that migration 0027 used.
  await db.execute(sql`
    INSERT INTO folder_facets (folder_id, kind, position, created_by)
    SELECT f.id, k.kind, k.pos, f.owner_id
      FROM folders f
      CROSS JOIN (VALUES ('main', 'a0'),
                         ('purpose', 'a1'),
                         ('consultation', 'a2'),
                         ('results', 'a3')) AS k(kind, pos)
     WHERE f.id IN (${seedIds.hassanDesk}, ${seedIds.imranDesk},
                    ${seedIds.groceries}, ${seedIds.nadiaDesk},
                    ${seedIds.nadiaStudio})
  `)
  // The owner gets Full control and each other member gets Can edit (migration 0023).
  await db.execute(sql`
    INSERT INTO folder_members (folder_id, user_id, shelf_name, color, access)
    VALUES
      (${seedIds.hassanDesk}, ${seedIds.hassan}, NULL, NULL, 'full_control'),
      (${seedIds.imranDesk}, ${seedIds.imran}, NULL, NULL, 'full_control'),
      (${seedIds.groceries}, ${seedIds.hassan}, 'Home', '#33AA55', 'full_control'),
      (${seedIds.groceries}, ${seedIds.imran}, NULL, NULL, 'can_edit'),
      (${seedIds.nadiaDesk}, ${seedIds.nadia}, NULL, NULL, 'full_control'),
      (${seedIds.nadiaStudio}, ${seedIds.nadia}, NULL, NULL, 'full_control')
  `)

  await db.execute(sql`
    INSERT INTO tasks (id, folder_id, title, notes, status, important, due_date,
        due_time, recurrence_rule, series_id, assignee_id, created_by,
        completed_at, completed_by) VALUES
      (${seedIds.taskBuyMilk}, ${seedIds.groceries}, 'Buy milk', 'Two cartons', 'pending',
        true, ${today}, NULL, NULL, NULL, ${seedIds.hassan}, ${seedIds.hassan}, NULL, NULL),
      (${seedIds.taskCallPlumber}, ${seedIds.groceries}, 'Call plumber', NULL, 'pending',
        false, ${tomorrow}, '09:00', NULL, NULL, ${seedIds.hassan}, ${seedIds.hassan}, NULL, NULL),
      (${seedIds.taskWaterPlants}, ${seedIds.groceries}, 'Water plants', NULL, 'pending',
        false, ${nextWeek}, NULL, 'FREQ=WEEKLY;BYDAY=MO', ${seedIds.waterPlantsSeries},
        ${seedIds.hassan}, ${seedIds.hassan}, NULL, NULL),
      (${seedIds.taskPayRent}, ${seedIds.groceries}, 'Pay rent', NULL, 'completed',
        false, ${today}, NULL, NULL, NULL, ${seedIds.hassan}, ${seedIds.hassan},
        ${yesterdayInstant}, ${seedIds.hassan}),
      (${seedIds.taskOldIdea}, ${seedIds.groceries}, 'Old idea', NULL, 'abandoned',
        false, NULL, NULL, NULL, NULL, NULL, ${seedIds.imran}, NULL, NULL),
      (${seedIds.taskSortInbox}, ${seedIds.hassanDesk}, 'Sort inbox', NULL, 'pending',
        false, NULL, NULL, NULL, NULL, ${seedIds.hassan}, ${seedIds.hassan}, NULL, NULL)
  `)

  await db.execute(sql`
    INSERT INTO steps (task_id, title, done, position) VALUES
      (${seedIds.taskBuyMilk}, 'Check the fridge first', true, 1),
      (${seedIds.taskBuyMilk}, 'Oat milk for Imran', false, 2)
  `)
  await db.execute(sql`
    INSERT INTO my_day_entries (task_id, user_id, added_on)
    VALUES (${seedIds.taskBuyMilk}, ${seedIds.hassan}, ${today})
  `)
  await db.execute(sql`
    INSERT INTO reminders (task_id, offset_minutes, time_of_day, fire_at, created_by)
    VALUES (${seedIds.taskCallPlumber}, 60, NULL, ${reminderFireInstant}, ${seedIds.hassan})
  `)
  await db.execute(sql`
    INSERT INTO invites (inviter_id, email, folder_id, task_id, status, access)
    VALUES (${seedIds.hassan}, 'sana@example.com', ${seedIds.groceries}, NULL,
            'pending', 'can_edit')
  `)

  // Nadia's rows, in foreign key order.

  await db.execute(sql`
    INSERT INTO shelves (id, user_id, name, icon, color, description) VALUES
      (${seedIds.shelfNadiaReading}, ${seedIds.nadia}, 'Reading', 'book',
       '#4466CC', 'Long reads to come back to')
  `)
  await db.execute(sql`
    INSERT INTO files (id, owner_id, folder_id, kind, name, mime, bytes) VALUES
      (${seedIds.fileNadiaSketch}, ${seedIds.nadia}, ${seedIds.nadiaStudio},
       'image', 'sketch.png', 'image/png', 2048)
  `)
  await db.execute(sql`
    INSERT INTO page_blocks (id, folder_id, shelf_id, kind, position, text,
        file_id, ref_folder_id, width_pct) VALUES
      (${seedIds.blockNadiaSection}, ${seedIds.nadiaStudio}, NULL, 'section', 1,
       'This week', NULL, NULL, NULL),
      (${seedIds.blockNadiaParagraph}, ${seedIds.nadiaStudio}, NULL, 'paragraph', 2,
       'What the studio is for, in one line.', NULL, NULL, NULL),
      (${seedIds.blockNadiaImage}, ${seedIds.nadiaStudio}, NULL, 'image', 3,
       NULL, ${seedIds.fileNadiaSketch}, NULL, 75),
      (${seedIds.blockNadiaFolderRef}, ${seedIds.nadiaStudio}, NULL, 'folder_ref', 4,
       NULL, NULL, ${seedIds.nadiaDesk}, NULL),
      (${seedIds.blockNadiaShelfParagraph}, NULL, ${seedIds.shelfNadiaReading},
       'paragraph', 1, 'A shelf has a page too.', NULL, NULL, NULL)
  `)
  await db.execute(sql`
    INSERT INTO tasks (id, folder_id, title, notes, status, important, due_date,
        assignee_id, created_by, section_block_id) VALUES
      (${seedIds.taskNadiaDraft}, ${seedIds.nadiaStudio}, 'Draft the opening',
       'Sits under a section, so 4.15 has a row too.', 'pending', false,
       ${tomorrow}, ${seedIds.nadia}, ${seedIds.nadia}, ${seedIds.blockNadiaSection})
  `)
  // Talk about a task lives in its Discussion through the persisted M:N relation.
  await db.execute(sql`
    INSERT INTO discussions (id, folder_id, title, created_by) VALUES
      (${seedIds.discussionNadiaDraft}, ${seedIds.nadiaStudio},
       'Draft the opening', ${seedIds.nadia})
  `)
  await db.execute(sql`
    INSERT INTO discussion_tasks (discussion_id, task_id, created_via_task) VALUES
      (${seedIds.discussionNadiaDraft}, ${seedIds.taskNadiaDraft}, true)
  `)
  await db.execute(sql`
    INSERT INTO comments (id, folder_id, discussion_id, parent_id, author_id, body) VALUES
      (${seedIds.commentNadiaNote}, ${seedIds.nadiaStudio}, ${seedIds.discussionNadiaDraft},
       NULL, ${seedIds.nadia}, 'A note to self on the draft.')
  `)
  await db.execute(sql`
    INSERT INTO comment_likes (comment_id, user_id)
    VALUES (${seedIds.commentNadiaNote}, ${seedIds.nadia})
  `)
  await db.execute(sql`
    INSERT INTO comment_files (comment_id, file_id)
    VALUES (${seedIds.commentNadiaNote}, ${seedIds.fileNadiaSketch})
  `)
  await db.execute(sql`
    INSERT INTO events (id, actor_id, verb, subject_kind, subject_id,
        subject_name, folder_id, detail) VALUES
      (${seedIds.eventNadiaCreated}, ${seedIds.nadia}, 'created', 'task',
       ${seedIds.taskNadiaDraft}, 'Draft the opening', ${seedIds.nadiaStudio}, NULL)
  `)
  await db.execute(sql`
    INSERT INTO notifications (user_id, event_id, read_at)
    VALUES (${seedIds.nadia}, ${seedIds.eventNadiaCreated}, NULL)
  `)
  await db.execute(sql`
    INSERT INTO user_views (id, user_id, name, definition, pinned) VALUES
      (${seedIds.viewNadiaThisWeek}, ${seedIds.nadia}, 'This week',
       ${JSON.stringify({ kind: 'planned' })}::jsonb, false)
  `)
  // A preset, so the row needs no stored file.
  await db.execute(sql`
    INSERT INTO user_page_covers (user_id, place, file_id, preset, focal_y)
    VALUES (${seedIds.nadia}, 'today', NULL, 'dusk', 40)
  `)

  await client.close()
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  await seed()
  process.stdout.write('seed applied\n')
}
