/*
AC-123 (proposed, P2S): given tasks of every status with steps, My Day
entries, and reminders in the viewer's folders, when the viewer PATCHes any
of the three toggles, then no row outside user_settings changes: hidden
pages are a navigation preference only.

The sentence under test is frozen 7.2's own: "Hidden pages are a navigation
preference only; no data changes." The defect it forbids is the helpful
handler, one that clears importance flags when Important is hidden or
archives completed rows when Done is, and 9.7's toggle descriptions make
that misreading available. No data changes is a data claim, so the
assertion is row-for-row equality of a before and after snapshot of every
application table the viewer can reach, scoped to this file's own rows
(helpers.ts: the TEST_DATABASE_URL leg shares one database). The settings
row itself is asserted to have changed, so the equality cannot be satisfied
by an endpoint that did nothing.

Tasks, steps, My Day entries, and reminders are later packages' surfaces,
seeded directly per the folders-harness rule; the folder arrives through
P2's own POST /folders.

This file is red until P2S lands the endpoint: the route answers 404 today.

Spec: 7.2 (frozen), 9.7, 4.10; RFC 0001 P2S row; criteria proposed to the
Steward for the section 12 amendment.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import type { Db } from '../db/client.js'
import {
  Cast,
  createFolder,
  defaultFolderOf,
  expectFolderInvariants,
  expectStatus,
  seedMyDayEntry,
  seedReminder,
  seedStep,
  seedTask,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  patchSettings,
  storedSettings,
} from './settings-harness.js'
import type { SettingsBooleans } from './settings-harness.js'
import { rows } from './helpers.js'

let app: AuthTestApp
const cast = new Cast(['settings-hoarder'])

interface Stage {
  actor: Actor
  inboxId: string
  folderId: string
}
let staged: Stage | undefined

/** One of everything the toggles could be misread as licensing to touch. */
async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [actor] = await cast.of(app)
    if (actor === undefined) throw new Error('cast must produce one actor')
    const inboxId = await defaultFolderOf(app.db, actor.id)
    const folderId = await createFolder(actor, 'p2s ac123 data')

    // Both folders are single-member, so every seed is assigned to the
    // actor (INV-5). The important flags are what show_important could be
    // misread against, the completed row what show_done could be.
    const important = await seedTask(app.db, {
      folderId,
      createdBy: actor.id,
      assigneeId: actor.id,
      important: true,
      dueDate: '2026-08-15',
    })
    await seedTask(app.db, {
      folderId,
      createdBy: actor.id,
      assigneeId: actor.id,
      status: 'completed',
    })
    await seedTask(app.db, {
      folderId,
      createdBy: actor.id,
      assigneeId: actor.id,
      status: 'abandoned',
    })
    await seedTask(app.db, {
      folderId: inboxId,
      createdBy: actor.id,
      assigneeId: actor.id,
      important: true,
    })
    await seedStep(app.db, important, 1)
    await seedStep(app.db, important, 2)
    await seedMyDayEntry(app.db, important, actor.id)
    await seedReminder(app.db, important, actor.id)

    staged = { actor, inboxId, folderId }
  }
  return staged
}

interface DataSnapshot {
  user: Record<string, unknown>[]
  folders: Record<string, unknown>[]
  memberships: Record<string, unknown>[]
  tasks: Record<string, unknown>[]
  steps: Record<string, unknown>[]
  myDay: Record<string, unknown>[]
  reminders: Record<string, unknown>[]
}

/** Every reachable row except user_settings, deterministically ordered. */
async function snapshot(db: Db, s: Stage): Promise<DataSnapshot> {
  return {
    user: await rows(db, sql`SELECT * FROM users WHERE id = ${s.actor.id}`),
    folders: await rows(
      db,
      sql`SELECT * FROM folders
          WHERE id IN (${s.inboxId}::uuid, ${s.folderId}::uuid) ORDER BY id`,
    ),
    memberships: await rows(
      db,
      sql`SELECT * FROM folder_members
          WHERE user_id = ${s.actor.id} ORDER BY folder_id`,
    ),
    tasks: await rows(
      db,
      sql`SELECT * FROM tasks
          WHERE folder_id IN (${s.inboxId}::uuid, ${s.folderId}::uuid)
          ORDER BY id`,
    ),
    steps: await rows(
      db,
      sql`SELECT st.* FROM steps st
          JOIN tasks t ON t.id = st.task_id
          WHERE t.folder_id IN (${s.inboxId}::uuid, ${s.folderId}::uuid)
          ORDER BY st.id`,
    ),
    myDay: await rows(
      db,
      sql`SELECT * FROM my_day_entries
          WHERE user_id = ${s.actor.id} ORDER BY task_id`,
    ),
    reminders: await rows(
      db,
      sql`SELECT r.* FROM reminders r
          JOIN tasks t ON t.id = r.task_id
          WHERE t.folder_id IN (${s.inboxId}::uuid, ${s.folderId}::uuid)
          ORDER BY r.task_id`,
    ),
  }
}

/** The PATCH, the settings change proven, and the data proven still. */
async function toggleAndExpectStillness(
  s: Stage,
  body: Partial<SettingsBooleans>,
  expectedSettings: SettingsBooleans,
  why: string,
): Promise<void> {
  const before = await snapshot(app.db, s)
  const response = await patchSettings(s.actor, body)
  expectStatus(
    response,
    200,
    `PATCH /me/settings with ${JSON.stringify(body)} must answer 200 (spec 7.2)`,
  )
  expect(
    await storedSettings(app.db, s.actor.id),
    `${why}: the settings row itself must have changed, or the stillness below proves nothing`,
  ).toEqual(expectedSettings)
  expect(
    await snapshot(app.db, s),
    `${why}: hidden pages are a navigation preference only, no data changes (spec 7.2); a row outside user_settings moved`,
  ).toEqual(before)
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-123: the toggles never touch data', () => {
  test('AC-123: sanity, the stage really holds rows the toggles could be misread against', async () => {
    const s = await stage()
    const before = await snapshot(app.db, s)
    expect(
      before.tasks.length,
      'the stage must hold the four seeded tasks',
    ).toBe(4)
    expect(
      before.tasks.filter((t) => t.important === true).length,
      'two of them are important, the rows show_important could be misread against',
    ).toBe(2)
    expect(
      before.tasks.filter((t) => t.status === 'completed').length,
      'one is completed, the row show_done could be misread against',
    ).toBe(1)
    expect(before.steps.length, 'the important task carries two steps').toBe(2)
    expect(before.myDay.length, 'and one My Day entry').toBe(1)
    expect(before.reminders.length, 'and one reminder').toBe(1)
  })

  test('AC-123: toggling every page off rewrites no row outside user_settings', async () => {
    const s = await stage()
    await toggleAndExpectStillness(
      s,
      { show_important: false, show_all: false, show_done: false },
      { show_important: false, show_all: false, show_done: false },
      'after hiding Important, All, and Done',
    )
  })

  test('AC-123: toggling back on rewrites no row outside user_settings either', async () => {
    // The symmetric direction, because an implementation could equally
    // misread showing Done as licensing a backfill.
    const s = await stage()
    await toggleAndExpectStillness(
      s,
      { show_important: true, show_all: true, show_done: true },
      { show_important: true, show_all: true, show_done: true },
      'after showing all three pages again',
    )
  })

  test('AC-123: invariants hold afterwards', async () => {
    const s = await stage()
    await expectFolderInvariants(app.db, [s.inboxId, s.folderId], [s.actor.id])
  })
})
