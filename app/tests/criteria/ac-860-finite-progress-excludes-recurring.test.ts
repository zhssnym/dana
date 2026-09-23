/*
AC-860: given a Folder holding one-off Tasks (completed, pending, abandoned,
trashed) and a recurring series with a completed and a pending occurrence,
some in a Section, then the Folder's `progress` and each Section's
`section_progress` count one-off completed over one-off pending-or-completed,
report the pending recurring occurrence apart, and leave `counts` as it was.

The failure this exists for is the denominator that grows every time a
recurring Task is completed, because each occurrence is its own row (8.4). The
rows are seeded directly and read back before the wire is asserted, so the
numbers are checked against what is stored rather than against themselves.

Spec: 7.4 (Folder object, GET /folders/:id), 8.11.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  countRows,
  createFolder,
  expectStatus,
  folderInList,
  seedTask,
} from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'p3')

beforeAll(async () => {
  app = await startAuthTestApp()
})

afterAll(async () => {
  await cast.cleanup(app.db)
  await app.close()
})

async function seedSection(folderId: string, text: string): Promise<string> {
  const id = randomUUID()
  await app.db.execute(sql`
    INSERT INTO page_blocks (id, folder_id, kind, position, text)
    VALUES (${id}::uuid, ${folderId}::uuid, 'section', 0, ${text})`)
  return id
}

async function place(
  taskId: string,
  sectionId: string | null,
  extra: ReturnType<typeof sql> = sql``,
): Promise<void> {
  await app.db.execute(sql`
    UPDATE tasks SET section_block_id = ${sectionId}::uuid ${extra}
     WHERE id = ${taskId}::uuid`)
}

describe('AC-860 finite progress excludes recurring Tasks', () => {
  test('Folder progress and per-Section progress count one-off Tasks only', async () => {
    const [owner] = await cast.of(app)
    if (owner === undefined) throw new Error('cast must produce an owner')
    const folderId = await createFolder(owner, 'p3 ac860 progress')
    const section = await seedSection(folderId, 'p3 ac860 section')
    const empty = await seedSection(folderId, 'p3 ac860 empty')
    const base = { folderId, createdBy: owner.id }

    // One-off: completed outside a section, completed/pending/abandoned/trashed inside.
    await seedTask(app.db, { ...base, status: 'completed' })
    await place(await seedTask(app.db, { ...base, status: 'completed' }), section)
    await place(await seedTask(app.db, { ...base, status: 'pending' }), section)
    await place(await seedTask(app.db, { ...base, status: 'abandoned' }), section)
    await place(
      await seedTask(app.db, { ...base, status: 'pending' }),
      section,
      sql`, deleted_at = now()`,
    )
    // A recurring series: one completed occurrence and its pending successor.
    const series = randomUUID()
    const recurring = sql`, recurrence_rule = 'FREQ=DAILY', series_id = ${series}::uuid`
    for (const status of ['completed', 'pending'] as const) {
      await place(
        await seedTask(app.db, { ...base, status, dueDate: '2026-09-24' }),
        section,
        recurring,
      )
    }

    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM tasks WHERE folder_id = ${folderId}::uuid
              AND recurrence_rule IS NOT NULL AND section_block_id = ${section}::uuid`,
      ),
      'the seed must store two recurring occurrences in the section',
    ).toBe(2)

    const response = await owner.browser.api(`/folders/${folderId}`)
    expectStatus(response, 200, 'GET /folders/:id must answer the folder (spec 7.4)')
    const body = response.json() as Record<string, unknown>

    expect(body.counts, '`counts` keeps its pending/completed meaning').toEqual({
      pending: 2,
      completed: 3,
    })
    expect(body.progress, 'finite progress is one-off only; recurring apart').toEqual({
      done: 2,
      total: 3,
      recurring_active: 1,
    })
    const bySection = new Map(
      (body.section_progress as { section_block_id: string }[]).map((entry) => [
        entry.section_block_id,
        entry,
      ]),
    )
    expect(bySection.get(section)).toEqual({
      section_block_id: section,
      done: 1,
      total: 2,
      recurring_active: 1,
    })
    expect(bySection.get(empty), 'an empty section answers zeros').toEqual({
      section_block_id: empty,
      done: 0,
      total: 0,
      recurring_active: 0,
    })
    expect(bySection.size).toBe(2)

    const listed = await folderInList(owner, folderId)
    expect(listed?.progress, 'GET /folders carries the same Folder progress').toEqual(
      body.progress,
    )
  })
})
