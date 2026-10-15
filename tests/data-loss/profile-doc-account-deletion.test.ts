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

  await inTransaction(app.db, (tx) => deleteAccountData(tx, manager.id))
  expect((await app.db.execute(sql`SELECT owner_id FROM folders WHERE id = ${managedId}::uuid`)).rows)
    .toEqual([{ owner_id: person.id }])
  expectStatus(await person.browser.json(`/folders/${managedId}/page`, 'GET'), 200,
    'successor retains the managed Doc')
  const removed = await inTransaction(app.db, (tx) => deleteAccountData(tx, person.id))
  expect(removed.fileIds).toContain(fileId)
  expect((await app.db.execute(sql`SELECT 1 FROM folders
    WHERE id IN (${managedId}::uuid, ${personalId}::uuid)`)).rows).toHaveLength(0)
})
