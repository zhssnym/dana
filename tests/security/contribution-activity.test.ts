import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, expect, test } from 'vitest'

import { contributionActivity } from '../../src/server/domain/contribution-activity.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { addMemberOk, Cast, connect, createFolder, expectStatus, removeMember } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['manager', 'person', 'viewer'], 'contribution-activity')

beforeAll(async () => { app = await startAuthTestApp() }, 60_000)
afterAll(async () => {
  if (!app) return
  await cast.cleanup(app.db)
  await app.close()
})

test('UTC days count visible supported acts once and stop at the 90-day boundary', async () => {
  const [manager, person, viewer] = await cast.of(app) as [Actor, Actor, Actor]
  const projectId = await createFolder(manager, 'Activity context')
  await connect(app.db, manager.id, person.id)
  await connect(app.db, manager.id, viewer.id)
  await addMemberOk(manager, projectId, person.id, 'can_view')
  await addMemberOk(manager, projectId, viewer.id, 'can_view')
  const now = new Date('2026-10-14T12:00:00.000Z')
  const insert = async (verb: string, createdAt: string, subjectId = projectId,
    kind: 'folder' | 'task' | 'comment' = 'folder') => {
    await app.db.execute(sql`INSERT INTO events
      (id, actor_id, verb, subject_kind, subject_id, subject_name, folder_id, created_at)
      VALUES (${randomUUID()}::uuid, ${person.id}::uuid, ${verb}, ${kind},
        ${subjectId}::uuid, 'Activity context', ${projectId}::uuid,
        ${createdAt}::timestamptz)`)
  }
  await insert('created', '2026-07-17T00:00:00.000Z')
  await insert('edited', '2026-10-13T23:59:59.000Z')
  await insert('edited', '2026-10-13T23:59:59.500Z')
  await insert('renamed', '2026-10-14T00:00:00.000Z')
  await insert('mentioned', '2026-10-14T00:01:00.000Z')
  await insert('created', '2026-07-16T23:59:59.000Z')
  const task = await manager.browser.json('/tasks', 'POST', {
    folder_id: projectId, title: 'Visible task',
  })
  expectStatus(task, 201, 'visible task')
  const taskId = (task.json() as { id: string }).id
  await insert('created', '2026-10-14T03:00:00.000Z', taskId, 'task')
  await insert('completed', '2026-10-14T04:00:00.000Z', taskId, 'task')
  const commentId = randomUUID()
  await app.db.execute(sql`INSERT INTO comments (id, folder_id, author_id, body)
    VALUES (${commentId}::uuid, ${projectId}::uuid, ${person.id}::uuid, 'Visible comment')`)
  await insert('created', '2026-10-14T05:00:00.000Z', commentId, 'comment')
  const hidden = await manager.browser.json('/folders', 'POST', {
    parent_folder_id: projectId, name: 'Hidden reference', kind: 'doc',
  })
  expectStatus(hidden, 201, 'page to remove from activity')
  const hiddenId = (hidden.json() as { id: string }).id
  await insert('created', '2026-10-14T02:00:00.000Z', hiddenId)
  await app.db.execute(sql`UPDATE folders SET deleted_at = now() WHERE id = ${hiddenId}::uuid`)
  const result = await contributionActivity(app.db, viewer.id, projectId, person.id, now)
  expect(result?.days).toHaveLength(90)
  expect(result?.days[0]).toMatchObject({ date: '2026-07-17', count: 1 })
  expect(result?.days[88]).toMatchObject({ date: '2026-10-13', count: 1 })
  expect(result?.days[89]).toMatchObject({ date: '2026-10-14', count: 4,
    categories: [
      { name: 'Page renamed', count: 1 },
      { name: 'Task created', count: 1 },
      { name: 'Task completed', count: 1 },
      { name: 'Comment posted', count: 1 },
    ] })
  expect(result?.days[89]?.references).toHaveLength(2)
  await removeMember(manager, projectId, viewer.id)
  expect(await contributionActivity(app.db, viewer.id, projectId, person.id, now)).toBeNull()
})

test('empty history returns 90 zero days', async () => {
  const [manager, person] = await cast.of(app) as [Actor, Actor]
  const projectId = await createFolder(manager, 'Empty activity context')
  await connect(app.db, manager.id, person.id)
  await addMemberOk(manager, projectId, person.id, 'can_view')
  const result = await contributionActivity(app.db, manager.id, projectId, person.id,
    new Date('2026-10-14T00:00:00.000Z'))
  expect(result?.days.every((day) => day.count === 0)).toBe(true)
})
