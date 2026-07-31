/*
Seeds the example dataset of two users sharing one folder. Run from app/ with:
npx tsx db/seed.ts

The dataset is constraint-conformant by construction and exercises every
table: it is what Playwright runs against (spec 11.10) together with the
development login endpoint. Identifiers are fixed so end to end tests can
reference rows; dates are relative to today so the day-scoped pages (My Day,
Planned) have content whenever the seed runs. Reseeding wipes application
rows first: it refuses to run when NODE_ENV is production, and beyond that
guard, pointing it at a database asserts the data there is disposable.
*/
import { pathToFileURL } from 'node:url'

import { sql } from 'drizzle-orm'

import { createDbClient } from './client.js'

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
} as const

function isoDate(daysFromToday: number): string {
  const d = new Date(Date.now() + daysFromToday * 86400000)
  return d.toISOString().slice(0, 10)
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
  await db.execute(sql`
    TRUNCATE users, connections, folders, folder_members, tasks, steps,
      my_day_entries, reminders, invites, user_settings CASCADE
  `)

  await db.execute(sql`
    INSERT INTO users (id, google_sub, email, display_name, timezone) VALUES
      (${seedIds.hassan}, 'seed-google-sub-hassan', 'hassan@example.com', 'Hassan', 'Asia/Karachi'),
      (${seedIds.imran}, 'seed-google-sub-imran', 'imran@example.com', 'Imran', 'Europe/Berlin')
  `)
  await db.execute(sql`
    INSERT INTO user_settings (user_id) VALUES (${seedIds.hassan}), (${seedIds.imran})
  `)
  await db.execute(sql`
    INSERT INTO connections (user_a_id, user_b_id)
    VALUES (${seedIds.hassan}, ${seedIds.imran})
  `)
  await db.execute(sql`
    INSERT INTO folders (id, owner_id, name, is_default) VALUES
      (${seedIds.hassanInbox}, ${seedIds.hassan}, 'Inbox', true),
      (${seedIds.imranInbox}, ${seedIds.imran}, 'Inbox', true),
      (${seedIds.groceries}, ${seedIds.hassan}, 'Groceries', false)
  `)
  await db.execute(sql`
    INSERT INTO folder_members (folder_id, user_id, label, color) VALUES
      (${seedIds.hassanInbox}, ${seedIds.hassan}, NULL, NULL),
      (${seedIds.imranInbox}, ${seedIds.imran}, NULL, NULL),
      (${seedIds.groceries}, ${seedIds.hassan}, 'Home', '#33AA55'),
      (${seedIds.groceries}, ${seedIds.imran}, NULL, NULL)
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

  await client.close()
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  await seed()
  process.stdout.write('seed applied\n')
}
