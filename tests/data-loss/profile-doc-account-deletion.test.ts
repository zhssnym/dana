import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, expect, test } from 'vitest'

import { deleteAccountData } from '../../src/server/domain/account-deletion.js'
import { inTransaction } from '../../src/server/database.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { addMemberOk, Cast, connect, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['manager', 'person'], 'profile-deletion')

beforeAll(async () => { app = await startAuthTestApp() }, 60_000)
afterAll(async () => {
  if (!app) return
  await cast.cleanup(app.db)
  await app.close()
})

test('account deletion transfers managed Docs and deletes personal Docs with their files', async () => {
  const [manager, person] = await cast.of(app) as [Actor, Actor]
  const projectId = await createFolder(manager, 'Custody transfer')
  await connect(app.db, manager.id, person.id)
  await addMemberOk(manager, projectId, person.id, 'can_view')
  const path = `/folders/${projectId}/members/${person.id}/profile-docs`
  const managed = await manager.browser.json(path, 'POST', {
    name: 'Project record', custody: 'project',
  })
  expectStatus(managed, 201, 'manager creates a project record')
  const managedId = (managed.json() as { id: string }).id
  const personal = await person.browser.json(path, 'POST', {
    name: 'Personal record', custody: 'person',
  })
  expectStatus(personal, 201, 'person creates a private record')
  const personalId = (personal.json() as { id: string }).id
  const fileId = randomUUID()
  await app.db.execute(sql`INSERT INTO files (id, owner_id, folder_id, kind, name, mime, bytes)
    VALUES (${fileId}::uuid, ${person.id}::uuid, ${personalId}::uuid,
            'file', 'private.txt', 'text/plain', 1)`)
  await app.db.execute(sql`INSERT INTO member_profile_sections
    (project_id, member_id, area, content, revision)
    VALUES (${projectId}::uuid, ${manager.id}::uuid, 'project',
            '{"version":1,"blocks":[]}'::jsonb, 1),
           (${projectId}::uuid, ${manager.id}::uuid, 'shared',
            '{"version":1,"blocks":[]}'::jsonb, 1)`)
  await app.db.execute(sql`INSERT INTO profile_doc_migrations
    (source_project_id, source_member_id, source_area, source_revision, source_content)
    VALUES (${projectId}::uuid, ${manager.id}::uuid, 'project', 1,
            '{"version":1,"blocks":[]}'::jsonb),
           (${projectId}::uuid, ${manager.id}::uuid, 'shared', 1,
            '{"version":1,"blocks":[]}'::jsonb)`)

  await inTransaction(app.db, (tx) => deleteAccountData(tx, manager.id))
  expect((await app.db.execute(sql`SELECT owner_id FROM folders WHERE id = ${managedId}::uuid`)).rows)
    .toEqual([{ owner_id: person.id }])
  expectStatus(await person.browser.json(`/folders/${managedId}/page`, 'GET'), 200,
    'successor retains the managed Doc')
  expect((await app.db.execute(sql`SELECT area FROM member_profile_sections
    WHERE project_id = ${projectId}::uuid AND member_id = ${manager.id}::uuid`)).rows)
    .toEqual([{ area: 'project' }])
  expect((await app.db.execute(sql`SELECT source_area FROM profile_doc_migrations
    WHERE source_project_id = ${projectId}::uuid AND source_member_id = ${manager.id}::uuid`)).rows)
    .toEqual([{ source_area: 'project' }])
  const removed = await inTransaction(app.db, (tx) => deleteAccountData(tx, person.id))
  expect(removed.fileIds).toContain(fileId)
  expect((await app.db.execute(sql`SELECT 1 FROM folders
    WHERE id IN (${managedId}::uuid, ${personalId}::uuid)`)).rows).toHaveLength(0)
})
