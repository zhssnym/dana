/*
AC-297 to AC-302: the sample workspace (RFC 0005 change control item 60).

Numbered additively at the delegated sample-workspace row of 2026-08-30, the
next free numbers after the loose-ends row's AC-296.

- AC-297 Given a brand-new account, when it signs in for the first time,
  then the sample workspace is present with the content module's own
  counts, and it reaches every feature it claims to: shelves with labelled
  folders, page blocks with tasks under sections, steps, reminders,
  repeats, Today pulls, a folder conversation with a thread in one task,
  completed and trashed rows, and saved views.
- AC-298 Given that account, when it signs in again, then nothing more is
  created; and given a dev-login carrying `sample: false`, then the account
  holds Desk and nothing else.
- AC-299 Given the account has made a folder and a task of its own, when it
  DELETEs /sample, then every registered object is gone with everything
  that hung on it, the person's own folder and task survive, the register
  is empty, and GET /sample answers absent.
- AC-300 Given a sample task the person moved into a folder of their own,
  when they DELETE /sample, then that task survives as theirs.
- AC-301 Given a sample folder the person shared, when they DELETE /sample,
  then that folder and its tasks stand, the response names it, and the
  register is empty.
- AC-302 Given the sample removed, when the person POSTs /sample, then it
  is present again with the same counts; and a second POST changes nothing.

This file is the one place the sample is on: every other file's application
has it off by the suite's setup file, so the empty account their criteria
count on is what they get.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { SAMPLE_WORKSPACE } from '../src/server/sample/content.js'
import { SAMPLE_KEPT_HEADER } from '../src/shared/sample.js'
import { cleanupAuthSubs, startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  countRows,
  seedUser,
  signInActor,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { rows } from './helpers.js'

const EXPECTED = {
  shelves: SAMPLE_WORKSPACE.shelves.length,
  folders: SAMPLE_WORKSPACE.folders.length,
  tasks:
    SAMPLE_WORKSPACE.folders.reduce((sum, folder) => sum + folder.tasks.length, 0) +
    SAMPLE_WORKSPACE.desk.length,
  views: SAMPLE_WORKSPACE.views.length,
}

let app: AuthTestApp
const subs: string[] = []
const seeded: string[] = []

// 60 s rather than the 10 s hook default: under the whole parallel run the
// first measurement lost this file to the hook alone, twenty workers booting
// PGlite at once, while the six cases read green alone in three seconds.
beforeAll(async () => {
  process.env.DANA_DEV_LOGIN = '1'
  app = await startAuthTestApp({ sampleWorkspace: true })
}, 60_000)

afterAll(async () => {
  await cleanupAuthSubs(app.db, subs)
  for (const id of seeded) {
    await app.db.execute(sql`DELETE FROM users WHERE id = ${id}::uuid`)
  }
  await app.close()
})

async function fresh(slug: string): Promise<Actor> {
  const actor = await signInActor(app, slug, 'ac297')
  subs.push(actor.sub)
  return actor
}

async function status(actor: Actor): Promise<{ present: boolean; counts: Record<string, number> }> {
  const response = await actor.browser.json('/sample', 'GET')
  expect(response.status, `GET /sample: ${response.body}`).toBe(200)
  return response.json() as { present: boolean; counts: Record<string, number> }
}

async function registered(userId: string): Promise<Array<{ kind: string; id: string }>> {
  const found = await rows(
    app.db,
    sql`SELECT kind, id FROM sample_objects WHERE user_id = ${userId}::uuid`,
  )
  return found.map((row) => ({ kind: String(row.kind), id: String(row.id) }))
}

async function ownFolder(actor: Actor, name: string): Promise<string> {
  const response = await actor.browser.json('/folders', 'POST', { name })
  expect(response.status, `POST /folders: ${response.body}`).toBe(201)
  return String((response.json() as { id: string }).id)
}

async function ownTask(actor: Actor, title: string, folderId?: string): Promise<string> {
  const response = await actor.browser.json('/tasks', 'POST', {
    title,
    ...(folderId === undefined ? {} : { folder_id: folderId }),
  })
  expect(response.status, `POST /tasks: ${response.body}`).toBe(201)
  return String((response.json() as { id: string }).id)
}

async function removeSample(actor: Actor) {
  const response = await actor.browser.json('/sample', 'DELETE')
  expect(response.status, `DELETE /sample: ${response.body}`).toBe(204)
  return response
}

describe('the sample workspace (item 60)', () => {
  test('AC-297: a first sign-in opens onto the sample, whole', async () => {
    const actor = await fresh('first')
    const seen = await status(actor)
    expect(seen.present).toBe(true)
    expect(seen.counts).toEqual(EXPECTED)

    const db = app.db
    const u = sql`${actor.id}::uuid`
    // Shelves, and folders labelled onto them (4.18).
    expect(await countRows(db, sql`SELECT count(*)::int AS n FROM shelves WHERE user_id = ${u}`)).toBe(
      EXPECTED.shelves,
    )
    const labelled = await countRows(
      db,
      sql`SELECT count(*)::int AS n FROM folder_members m
          JOIN shelves s ON s.user_id = m.user_id AND s.name = m.label
          WHERE m.user_id = ${u}`,
    )
    expect(labelled, 'every shelved folder carries its shelf as a label').toBe(
      SAMPLE_WORKSPACE.folders.filter((folder) => folder.shelf !== undefined).length,
    )
    // Page blocks, and tasks under sections.
    expect(
      await countRows(
        db,
        sql`SELECT count(*)::int AS n FROM page_blocks b
            JOIN folders f ON f.id = b.folder_id WHERE f.owner_id = ${u}`,
      ),
    ).toBeGreaterThan(0)
    expect(
      await countRows(
        db,
        sql`SELECT count(*)::int AS n FROM tasks t
            JOIN page_blocks b ON b.id = t.section_block_id
            WHERE t.created_by = ${u} AND b.kind = 'section'`,
      ),
    ).toBeGreaterThan(0)
    // Steps, reminders, repeats, Today pulls.
    for (const [table, why] of [
      [sql`steps s JOIN tasks t ON t.id = s.task_id WHERE t.created_by = ${u}`, 'steps'],
      [sql`reminders r WHERE r.created_by = ${u}`, 'reminders'],
      [sql`tasks t WHERE t.created_by = ${u} AND t.recurrence_rule IS NOT NULL`, 'repeats'],
      [sql`my_day_entries e WHERE e.user_id = ${u}`, 'Today pulls'],
      [sql`tasks t WHERE t.created_by = ${u} AND t.status = 'completed'`, 'completed tasks'],
      [sql`tasks t WHERE t.created_by = ${u} AND t.deleted_at IS NOT NULL`, 'trashed tasks'],
      [sql`folders f WHERE f.owner_id = ${u} AND f.deleted_at IS NOT NULL`, 'a trashed folder'],
      [sql`tasks t JOIN folders f ON f.id = t.folder_id WHERE f.owner_id = ${u} AND f.is_default`, 'Desk tasks'],
      [sql`comments c WHERE c.author_id = ${u} AND c.task_id IS NULL`, 'a folder conversation'],
      [sql`comments c WHERE c.author_id = ${u} AND c.parent_id IS NOT NULL`, 'a thread reply'],
      [sql`user_views v WHERE v.user_id = ${u}`, 'saved views'],
    ] as const) {
      expect(
        await countRows(db, sql`SELECT count(*)::int AS n FROM ${table}`),
        `the sample carries ${why}`,
      ).toBeGreaterThan(0)
    }
    expect((await registered(actor.id)).length).toBe(
      EXPECTED.shelves + EXPECTED.folders + EXPECTED.tasks + EXPECTED.views,
    )
  })

  test('AC-298: a second sign-in adds nothing, and a declined account holds only Desk', async () => {
    const actor = await fresh('again')
    const before = await status(actor)
    app.stub.nextIdentity({
      sub: actor.sub,
      email: actor.email,
      email_verified: true,
      name: 'AC297 again',
    })
    const { signIn } = await import('./auth-harness.js')
    await signIn(app)
    const after = await status(actor)
    expect(after).toEqual(before)
    expect((await registered(actor.id)).length).toBe(
      EXPECTED.shelves + EXPECTED.folders + EXPECTED.tasks + EXPECTED.views,
    )

    // The door's opt-out: dev-login with sample false.
    const browser = app.browser()
    const sub = `ac297-declined-${Date.now()}`
    subs.push(sub)
    const login = await browser.json('/auth/dev-login', 'POST', { sub, sample: false }, { csrf: 'omit' })
    expect(login.status, login.body).toBe(200)
    const userId = String((login.json() as { user_id: string }).user_id)
    expect(await countRows(app.db, sql`SELECT count(*)::int AS n FROM folders WHERE owner_id = ${userId}::uuid`)).toBe(1)
    expect(await countRows(app.db, sql`SELECT count(*)::int AS n FROM tasks WHERE created_by = ${userId}::uuid`)).toBe(0)
    expect((await registered(userId)).length).toBe(0)
    const declined = await browser.json('/sample', 'GET')
    expect((declined.json() as { present: boolean }).present).toBe(false)
  })

  test('AC-299: removal takes every registered object and nothing of the person\'s own', async () => {
    const actor = await fresh('remove')
    const mine = await ownFolder(actor, 'My own folder')
    const myTask = await ownTask(actor, 'My own task', mine)
    const myDeskTask = await ownTask(actor, 'My own Desk task')
    const register = await registered(actor.id)
    expect(register.length).toBeGreaterThan(0)

    await removeSample(actor)

    const u = sql`${actor.id}::uuid`
    const db = app.db
    for (const entry of register) {
      const table =
        entry.kind === 'shelf'
          ? sql`shelves`
          : entry.kind === 'folder'
            ? sql`folders`
            : entry.kind === 'task'
              ? sql`tasks`
              : sql`user_views`
      expect(
        await countRows(db, sql`SELECT count(*)::int AS n FROM ${table} WHERE id = ${entry.id}::uuid`),
        `${entry.kind} ${entry.id} is gone`,
      ).toBe(0)
    }
    expect(await registered(actor.id)).toEqual([])
    for (const [table, why] of [
      [sql`steps s JOIN tasks t ON t.id = s.task_id WHERE t.created_by = ${u}`, 'steps'],
      [sql`reminders r WHERE r.created_by = ${u}`, 'reminders'],
      [sql`my_day_entries e WHERE e.user_id = ${u}`, 'Today pulls'],
      [sql`comments c WHERE c.author_id = ${u}`, 'comments'],
      [sql`page_blocks b JOIN folders f ON f.id = b.folder_id WHERE f.owner_id = ${u}`, 'page blocks'],
      [sql`shelves s WHERE s.user_id = ${u}`, 'shelves'],
      [sql`user_views v WHERE v.user_id = ${u}`, 'saved views'],
      [sql`folder_members m WHERE m.user_id = ${u} AND m.label IS NOT NULL`, 'labels'],
    ] as const) {
      expect(await countRows(db, sql`SELECT count(*)::int AS n FROM ${table}`), `no ${why} remain`).toBe(0)
    }
    // The person's own work, untouched.
    expect(await countRows(db, sql`SELECT count(*)::int AS n FROM folders WHERE owner_id = ${u}`)).toBe(2)
    expect(await countRows(db, sql`SELECT count(*)::int AS n FROM folders WHERE id = ${mine}::uuid AND deleted_at IS NULL`)).toBe(1)
    expect(await countRows(db, sql`SELECT count(*)::int AS n FROM tasks WHERE created_by = ${u}`)).toBe(2)
    for (const id of [myTask, myDeskTask]) {
      expect(await countRows(db, sql`SELECT count(*)::int AS n FROM tasks WHERE id = ${id}::uuid AND deleted_at IS NULL`)).toBe(1)
    }
    expect(await status(actor)).toEqual({ present: false, counts: { shelves: 0, folders: 0, tasks: 0, views: 0 } })
    // Removal is idempotent.
    await removeSample(actor)
  })

  test('AC-300: a sample task moved into the person\'s own folder is theirs', async () => {
    const actor = await fresh('moved')
    const mine = await ownFolder(actor, 'Kept')
    // The task with a thread, deliberately: a conversation is scoped to its
    // task's folder by 4.15's pair FK, and a move that did not carry it was
    // a 500 until migration 0007 let the pair defer.
    const threaded = (
      await rows(
        app.db,
        sql`SELECT t.id FROM sample_objects s JOIN tasks t ON t.id = s.id
            WHERE s.user_id = ${actor.id}::uuid AND s.kind = 'task'
              AND EXISTS (SELECT 1 FROM comments c WHERE c.task_id = t.id)
            LIMIT 1`,
      )
    )[0]
    if (threaded === undefined) throw new Error('the sample registered no task with a thread')
    const sampleTask = { kind: 'task', id: String(threaded.id) }
    const moved = await actor.browser.json(`/tasks/${sampleTask.id}`, 'PATCH', { folder_id: mine })
    expect(moved.status, moved.body).toBe(200)

    await removeSample(actor)

    expect(
      await countRows(app.db, sql`SELECT count(*)::int AS n FROM tasks WHERE id = ${sampleTask.id}::uuid AND folder_id = ${mine}::uuid`),
      'the adopted task survives where the person put it',
    ).toBe(1)
    expect(await countRows(app.db, sql`SELECT count(*)::int AS n FROM tasks WHERE created_by = ${actor.id}::uuid`)).toBe(1)
    expect(
      await countRows(app.db, sql`SELECT count(*)::int AS n FROM comments WHERE task_id = ${sampleTask.id}::uuid AND folder_id = ${mine}::uuid`),
      'its conversation moved with it',
    ).toBeGreaterThan(0)
    expect(await registered(actor.id)).toEqual([])
  })

  test('AC-301: a sample folder the person shared is left standing and named', async () => {
    const actor = await fresh('shared')
    const other = await seedUser(app.db, 'ac297-other')
    seeded.push(other)
    const sampleFolder = (
      await rows(
        app.db,
        sql`SELECT f.id, f.name FROM sample_objects s JOIN folders f ON f.id = s.id
            WHERE s.user_id = ${actor.id}::uuid AND s.kind = 'folder' AND f.deleted_at IS NULL
            ORDER BY f.name LIMIT 1`,
      )
    )[0]
    if (sampleFolder === undefined) throw new Error('the sample registered no live folder')
    const folderId = String(sampleFolder.id)
    await app.db.execute(
      sql`INSERT INTO folder_members (folder_id, user_id) VALUES (${folderId}::uuid, ${other}::uuid)`,
    )
    const itsTasks = await countRows(app.db, sql`SELECT count(*)::int AS n FROM tasks WHERE folder_id = ${folderId}::uuid`)
    expect(itsTasks).toBeGreaterThan(0)

    const response = await removeSample(actor)
    const kept = decodeURIComponent(String(response.headers[SAMPLE_KEPT_HEADER] ?? ''))
    expect(kept.split('\n')).toEqual([String(sampleFolder.name)])

    expect(await countRows(app.db, sql`SELECT count(*)::int AS n FROM folders WHERE id = ${folderId}::uuid`)).toBe(1)
    expect(await countRows(app.db, sql`SELECT count(*)::int AS n FROM tasks WHERE folder_id = ${folderId}::uuid`)).toBe(itsTasks)
    expect(await countRows(app.db, sql`SELECT count(*)::int AS n FROM folders WHERE owner_id = ${actor.id}::uuid`)).toBe(2)
    expect(await registered(actor.id)).toEqual([])
    expect((await status(actor)).present).toBe(false)
  })

  test('AC-302: POST /sample brings it back, once', async () => {
    const actor = await fresh('restore')
    await removeSample(actor)
    expect((await status(actor)).present).toBe(false)

    const first = await actor.browser.json('/sample', 'POST')
    expect(first.status, first.body).toBe(200)
    expect(first.json()).toEqual({ present: true, counts: EXPECTED })
    const ids = (await registered(actor.id)).map((entry) => entry.id).sort()

    const second = await actor.browser.json('/sample', 'POST')
    expect(second.status, second.body).toBe(200)
    expect(second.json()).toEqual({ present: true, counts: EXPECTED })
    expect((await registered(actor.id)).map((entry) => entry.id).sort()).toEqual(ids)
    expect(await countRows(app.db, sql`SELECT count(*)::int AS n FROM folders WHERE owner_id = ${actor.id}::uuid`)).toBe(
      EXPECTED.folders + 1,
    )
  })
})
