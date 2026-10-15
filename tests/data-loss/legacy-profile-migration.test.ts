import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, expect, test } from 'vitest'

import { migrateLegacyProfileWriting } from '../../src/server/domain/legacy-profile-migration.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { addMemberOk, Cast, connect, createFolder, expectStatus, removeMember } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['manager', 'person', 'stranger'], 'legacy-migration')
let personId: string | null = null

beforeAll(async () => { app = await startAuthTestApp() }, 60_000)
afterAll(async () => {
  if (!app) return
  if (personId !== null) {
    await app.db.execute(sql`DELETE FROM profile_doc_migrations
      WHERE source_member_id = ${personId}::uuid`)
    await app.db.execute(sql`DELETE FROM folders WHERE id IN
      (SELECT root_folder_id FROM profile_doc_roots WHERE profile_user_id = ${personId}::uuid)`)
  }
  await cast.cleanup(app.db)
  await app.close()
})

test('text moves once into native Docs and keeps its source and original audience', async () => {
  const [manager, person, stranger] = await cast.of(app) as [Actor, Actor, Actor]
  personId = person.id
  const projectId = await createFolder(manager, 'Migration team')
  await connect(app.db, manager.id, person.id)
  await addMemberOk(manager, projectId, person.id, 'can_view')
  const content = (kind: string, text: string) => JSON.stringify({
    version: 1, blocks: [{ kind, content: { version: 1, runs: [{ text }] } }],
  })
  await app.db.execute(sql`INSERT INTO member_profile_sections
    (project_id, member_id, area, content, revision, updated_by)
    VALUES (${projectId}::uuid, ${person.id}::uuid, 'project',
            ${content('paragraph', 'Manager guidance')}::jsonb, 2, ${manager.id}::uuid),
           (${projectId}::uuid, ${person.id}::uuid, 'shared',
            ${content('bullet', 'My portfolio')}::jsonb, 3, ${person.id}::uuid)`)
  expect(await migrateLegacyProfileWriting(app.db, stranger.id, projectId, person.id))
    .toEqual({ migrated: 0, retained: 0 })
  expect(await migrateLegacyProfileWriting(app.db, manager.id, projectId, person.id))
    .toEqual({ migrated: 2, retained: 0 })
  expect(await migrateLegacyProfileWriting(app.db, manager.id, projectId, person.id))
    .toEqual({ migrated: 0, retained: 0 })
  const roots = (await app.db.execute(sql`SELECT r.root_folder_id, r.custody_project_id,
    r.audience, b.kind, b.text, m.source_revision, m.source_updated_by
    FROM profile_doc_migrations m
    JOIN profile_doc_roots r ON r.root_folder_id = m.root_folder_id
    JOIN page_blocks b ON b.folder_id = r.root_folder_id
    WHERE m.source_project_id = ${projectId}::uuid AND m.source_member_id = ${person.id}::uuid
    ORDER BY m.source_area`)).rows
  expect(roots).toMatchObject([
    { custody_project_id: projectId, audience: 'project_members', kind: 'paragraph',
      text: 'Manager guidance', source_revision: 2, source_updated_by: manager.id },
    { custody_project_id: null, audience: 'project_members', kind: 'bullet',
      text: 'My portfolio', source_revision: 3, source_updated_by: person.id },
  ])
  for (const root of roots) {
    const path = `/folders/${String(root.root_folder_id)}/page`
    expectStatus(await manager.browser.json(path, 'GET'), 200, 'original project can read')
    expectStatus(await stranger.browser.json(path, 'GET'), 404, 'stranger cannot read')
  }
  const migratedWrite = await manager.browser.json(
    `/folders/${projectId}/members/${person.id}/profile-content/project`, 'PUT', {
      base_revision: 2,
      content: { version: 1, blocks: [] },
    })
  expectStatus(migratedWrite, 409, 'old writer cannot diverge from the Doc')
  const ownExport = await person.browser.json('/me/export', 'GET')
  expectStatus(ownExport, 200, 'native Doc is exported once')
  const exported = ownExport.json() as {
    profile_sections: { area: string; member_id: string }[]
    folders: { id: string }[]
  }
  expect(exported.profile_sections.some((section) =>
    section.area === 'shared' && section.member_id === person.id)).toBe(false)
  expect(exported.folders.some((folder) => folder.id === roots[1]?.root_folder_id)).toBe(true)
  expect((await app.db.execute(sql`SELECT revision FROM member_profile_sections
    WHERE project_id = ${projectId}::uuid AND member_id = ${person.id}::uuid
    ORDER BY area`)).rows).toEqual([{ revision: 2 }, { revision: 3 }])
  expectStatus(await removeMember(manager, projectId, person.id), 204, 'person leaves')
  expectStatus(await person.browser.json(`/folders/${String(roots[1]?.root_folder_id)}/page`, 'GET'),
    200, 'person keeps their Doc')
  expectStatus(await person.browser.json(`/folders/${String(roots[0]?.root_folder_id)}/page`, 'GET'),
    404, 'project record stays with project')
  await addMemberOk(manager, projectId, person.id, 'can_view')
  expectStatus(await person.browser.json(`/folders/${String(roots[0]?.root_folder_id)}/page`, 'GET'),
    200, 'rejoining restores source project access')
})

test('file references stay on the legacy source', async () => {
  const [manager, person] = await cast.of(app) as [Actor, Actor]
  const projectId = await createFolder(manager, 'File migration')
  await connect(app.db, manager.id, person.id)
  await addMemberOk(manager, projectId, person.id, 'can_view')
  const fileId = randomUUID()
  await app.db.execute(sql`INSERT INTO files (id, owner_id, folder_id, kind, name, mime, bytes)
    VALUES (${fileId}::uuid, ${person.id}::uuid, ${projectId}::uuid,
      'file', 'source.txt', 'text/plain', 1)`)
  await app.db.execute(sql`INSERT INTO member_profile_sections
    (project_id, member_id, area, content, revision, updated_by)
    VALUES (${projectId}::uuid, ${person.id}::uuid, 'shared',
      ${JSON.stringify({ version: 1, blocks: [{ kind: 'file', file_id: fileId }] })}::jsonb,
      1, ${person.id}::uuid)`)
  expect(await migrateLegacyProfileWriting(app.db, manager.id, projectId, person.id))
    .toEqual({ migrated: 0, retained: 1 })
  expect((await app.db.execute(sql`SELECT 1 FROM profile_doc_migrations
    WHERE source_project_id = ${projectId}::uuid`)).rows).toHaveLength(0)
  expect((await app.db.execute(sql`SELECT content FROM member_profile_sections
    WHERE project_id = ${projectId}::uuid AND member_id = ${person.id}::uuid`)).rows)
    .toMatchObject([{ content: { blocks: [{ file_id: fileId }] } }])
})

test('an invalid source rolls back all native copies', async () => {
  const [manager, person] = await cast.of(app) as [Actor, Actor]
  const projectId = await createFolder(manager, 'Invalid migration')
  await connect(app.db, manager.id, person.id)
  await addMemberOk(manager, projectId, person.id, 'can_view')
  await app.db.execute(sql`INSERT INTO member_profile_sections
    (project_id, member_id, area, content, revision)
    VALUES (${projectId}::uuid, ${person.id}::uuid, 'project',
      '{"version":1,"blocks":[{"kind":"paragraph","content":{"version":1,"runs":[{"text":"Safe"}]}}]}'::jsonb, 1),
      (${projectId}::uuid, ${person.id}::uuid, 'shared',
      '{"version":9,"blocks":[]}'::jsonb, 1)`)
  await expect(migrateLegacyProfileWriting(app.db, manager.id, projectId, person.id)).rejects.toThrow()
  expect((await app.db.execute(sql`SELECT 1 FROM profile_doc_migrations
    WHERE source_project_id = ${projectId}::uuid`)).rows).toHaveLength(0)
  expect((await app.db.execute(sql`SELECT 1 FROM profile_doc_roots
    WHERE profile_user_id = ${person.id}::uuid AND custody_project_id = ${projectId}::uuid`)).rows)
    .toHaveLength(0)
})
