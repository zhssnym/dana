/*
Seeds the example dataset: two people sharing one folder, and a third who
shares nothing. Run from app/ with: npx tsx db/seed.ts

The dataset is constraint-conformant by construction. **It used to claim it
exercised every section 4 table and it wrote ten of the twenty-two**, which
issue #43 measured: no browser run began with a comment, a file, a page
block, a shelf, a saved view, an event, a notification, a cover or a sample
register row. It now writes twenty-one, and the twenty-second is sessions,
still empty on purpose: Playwright's sessions come from the development login
endpoint (11.10), and a token_hash here would name a token nobody holds.

**The eleven new tables are seeded under Nadia, a third person, and that is
not tidiness.** The browser leg reseeds once and runs its specs in one
worker against the result, and every spec that signs in signs in as Hassan
or Imran, so a shelf or a saved view added to either of them changes what a
hundred specs see: sidebar contents, empty states, notification counts and
folder lists are all asserted somewhere. Nadia is connected to nobody and
shares no folder, and every read path is either folder-scoped through
accessOf or keyed on the viewer, so nothing she owns can appear on Hassan's
or Imran's screen. The cost of that choice is honest and worth stating: the
browser leg still does not *start* with a comment or a shelf in front of the
person it signs in as, so a spec that wants one still creates it. What the
seed now buys is that every table has a row against which a migration, a
cascade or a query can be exercised, and that the truncate below is proved
against a populated database rather than an empty one.

Identifiers are fixed so end to end tests can reference rows; dates are
relative to today so the day-scoped pages (My Day, Planned) have content
whenever the seed runs. Reseeding wipes application rows first: it refuses to
run when NODE_ENV is production, and beyond that guard, pointing it at a
database asserts the data there is disposable.
*/
import { pathToFileURL } from 'node:url'

import { sql } from 'drizzle-orm'

import { createDbClient } from './client.js'
import type { Db } from './client.js'

export const seedIds = {
  hassan: '11111111-1111-4111-8111-111111111111',
  imran: '22222222-2222-4222-8222-222222222222',
  hassanInbox: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  imranInbox: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  groceries: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  taskBuyMilk: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  taskCallPlumber: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  taskWaterPlants: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  taskPayRent: '99999999-9999-4999-8999-999999999999',
  taskOldIdea: '88888888-8888-4888-8888-888888888888',
  taskSortInbox: '77777777-7777-4777-8777-777777777777',
  waterPlantsSeries: '66666666-6666-4666-8666-666666666666',
  // Nadia and hers. She is connected to nobody and shares no folder, so
  // nothing below is reachable from a session signed in as Hassan or Imran;
  // see the header for why the eleven tables she carries are hers.
  nadia: '33333333-3333-4333-8333-333333333333',
  nadiaInbox: '44444444-4444-4444-8444-444444444444',
  nadiaStudio: '55555555-5555-4555-8555-555555555555',
  taskNadiaDraft: '10101010-1010-4010-8010-101010101010',
  shelfNadiaReading: '20202020-2020-4020-8020-202020202020',
  fileNadiaSketch: '30303030-3030-4030-8030-303030303030',
  commentNadiaNote: '40404040-4040-4040-8040-404040404040',
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

/**
 * Empties every table in the public schema, read from the catalog rather
 * than listed here.
 *
 * The list used to be written out and it named the ten tables the seed
 * wrote. Issue #43 called that a contamination source; **measured on
 * 2026-09-02 it was not one**, and the reason is worth keeping rather than
 * quietly deleting: every table in this schema has a foreign key path to
 * users, so TRUNCATE ... CASCADE reached all twenty-two. A probe that put a
 * row in each of them and then ran the old statement left none behind.
 *
 * What was true is that the guarantee was accidental. A table with no path
 * to any listed one would have survived silently, and nothing would have
 * said so. Reading the list from pg_class makes it a guarantee instead: a
 * twenty-third table is emptied on the day it is created, with no line to
 * remember here. The migrator's own bookkeeping lives in the drizzle schema
 * and is deliberately untouched, which is what makes runMigrations()
 * idempotent across reseeds.
 */
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
    // Identifiers are interpolated raw, so anything that is not a plain
    // lower-case table name is refused rather than quoted around.
    .filter((name) => /^[a-z_][a-z0-9_]*$/.test(name))
  if (names.length === 0) {
    throw new Error('the seed found no tables to truncate: migrations did not run')
  }
  await db.execute(
    sql.raw(`TRUNCATE ${names.map((name) => `"${name}"`).join(', ')} CASCADE`),
  )
}

export async function seed(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('the seed truncates every table and refuses to run in production')
  }
  const client = await createDbClient({
    url: process.env.DATABASE_URL === '' ? undefined : process.env.DATABASE_URL,
    dataDir: '.data',
  })
  const { db } = client
  const today = isoDate(0)
  const tomorrow = isoDate(1)
  const nextWeek = isoDate(7)
  const yesterdayInstant = new Date(Date.now() - 86400000).toISOString()
  // What the 8.6 derivation yields for the seeded reminder: due 09:00 minus
  // 60 minutes in the assignee's zone, and the assignee is Hassan in
  // Asia/Karachi, fixed UTC+5 with no DST, so 08:00 there is 03:00Z in
  // every season. Real fire instants are computed only by the Scheduling
  // engineer's 8.6 module; a seed must merely be consistent with it.
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
  // Nadia is deliberately absent from this table. A connection would put her
  // in Hassan's people list, which ac-183 asserts by address, and in every
  // assignee and invite picker the browser leg opens.
  await db.execute(sql`
    INSERT INTO connections (user_a_id, user_b_id)
    VALUES (${seedIds.hassan}, ${seedIds.imran})
  `)
  await db.execute(sql`
    INSERT INTO folders (id, owner_id, name, is_default) VALUES
      (${seedIds.hassanInbox}, ${seedIds.hassan}, 'Inbox', true),
      (${seedIds.imranInbox}, ${seedIds.imran}, 'Inbox', true),
      (${seedIds.groceries}, ${seedIds.hassan}, 'Groceries', false),
      (${seedIds.nadiaInbox}, ${seedIds.nadia}, 'Inbox', true),
      (${seedIds.nadiaStudio}, ${seedIds.nadia}, 'Studio', false)
  `)
  await db.execute(sql`
    INSERT INTO folder_members (folder_id, user_id, label, color) VALUES
      (${seedIds.hassanInbox}, ${seedIds.hassan}, NULL, NULL),
      (${seedIds.imranInbox}, ${seedIds.imran}, NULL, NULL),
      (${seedIds.groceries}, ${seedIds.hassan}, 'Home', '#33AA55'),
      (${seedIds.groceries}, ${seedIds.imran}, NULL, NULL),
      (${seedIds.nadiaInbox}, ${seedIds.nadia}, NULL, NULL),
      (${seedIds.nadiaStudio}, ${seedIds.nadia}, NULL, NULL)
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
      (${seedIds.taskSortInbox}, ${seedIds.hassanInbox}, 'Sort inbox', NULL, 'pending',
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
    INSERT INTO invites (inviter_id, email, folder_id, task_id, status)
    VALUES (${seedIds.hassan}, 'sana@example.com', ${seedIds.groceries}, NULL, 'pending')
  `)

  /* ---------------------------------------------------------------- *
   * Nadia's half: the eleven tables the seed used to leave empty.
   *
   * Order is the foreign keys' rather than the story's. files before the
   * page blocks and the comment attachment that point at it; page_blocks
   * before the task that names a section; comments before their like and
   * their attachment; events before the notification that carries one.
   * ---------------------------------------------------------------- */

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
       NULL, NULL, ${seedIds.nadiaInbox}, NULL),
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
  await db.execute(sql`
    INSERT INTO comments (id, folder_id, task_id, parent_id, author_id, body) VALUES
      (${seedIds.commentNadiaNote}, ${seedIds.nadiaStudio}, ${seedIds.taskNadiaDraft},
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
  // preset rather than file_id, so the row needs no object in a store the
  // browser leg would then have to serve.
  await db.execute(sql`
    INSERT INTO user_page_covers (user_id, place, file_id, preset, focal_y)
    VALUES (${seedIds.nadia}, 'today', NULL, 'dusk', 40)
  `)
  // The sample register of 0007, which records what a sample workspace
  // created so 7.20's removal can find it again. Nadia's studio task stands
  // in for one; no browser spec signs in as her, so nothing offers to
  // remove it.
  await db.execute(sql`
    INSERT INTO sample_objects (user_id, kind, id) VALUES
      (${seedIds.nadia}, 'task', ${seedIds.taskNadiaDraft}),
      (${seedIds.nadia}, 'folder', ${seedIds.nadiaStudio}),
      (${seedIds.nadia}, 'shelf', ${seedIds.shelfNadiaReading}),
      (${seedIds.nadia}, 'view', ${seedIds.viewNadiaThisWeek})
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
