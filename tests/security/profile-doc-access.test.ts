import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, expect, test } from 'vitest'

import { accessOf, mayPerform } from '../../src/server/domain/folder-access.js'
import { recordEvent } from '../../src/server/domain/events.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { addMemberOk, Cast, connect, createFolder, expectStatus, removeMember } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

const objects = new Map<string, Buffer>()
let app: AuthTestApp
const cast = new Cast(['manager', 'person', 'teammate', 'outsider'], 'profile-doc')

beforeAll(async () => {
  app = await startAuthTestApp({ fileStore: {
    put: async (id, bytes) => { objects.set(id, bytes) },
    get: async (id) => objects.get(id) ?? null,
    remove: async (id) => { objects.delete(id) },
  } })
}, 60_000)
afterAll(async () => {
  if (!app) return
  await app.db.execute(sql`DELETE FROM profile_doc_roots WHERE profile_user_id IN (
    SELECT id FROM users WHERE email LIKE '%@profile-doc-folders.test')`)
  await cast.cleanup(app.db)
  await app.close()
})

test('only a root manager reorders visible profile tabs', async () => {
  const [manager, person, teammate, outsider] = await cast.of(app) as [Actor, Actor, Actor, Actor]
  const projectId = await createFolder(manager, 'Profile order')
  await connect(app.db, manager.id, person.id)
  await connect(app.db, manager.id, teammate.id)
  await addMemberOk(manager, projectId, person.id, 'can_view')
  await addMemberOk(manager, projectId, teammate.id, 'can_view')
  const path = `/folders/${projectId}/members/${person.id}/profile-docs`
  const first = await manager.browser.json(path, 'POST', { name: 'First', custody: 'project' })
  const second = await manager.browser.json(path, 'POST', { name: 'Second', custody: 'project' })
  expectStatus(first, 201, 'first tab')
  expectStatus(second, 201, 'second tab')
  const firstId = (first.json() as { id: string }).id
  const secondId = (second.json() as { id: string }).id
  const move = `${path}/${secondId}/position`
  expectStatus(await outsider.browser.json(move, 'PATCH', {
    before_id: null, after_id: firstId,
  }), 404, 'outsider cannot reorder')
  expectStatus(await teammate.browser.json(move, 'PATCH', {
    before_id: null, after_id: firstId,
  }), 403, 'reader cannot reorder')
  expectStatus(await manager.browser.json(move, 'PATCH', {
    before_id: null, after_id: firstId,
  }), 204, 'manager moves a managed tab')
  expect((await manager.browser.json(path, 'GET')).json()).toMatchObject({
    roots: [{ id: secondId }, { id: firstId }],
  })
})

test('person-owned root, child and file inherit the root audience', async () => {
  const [manager, person, teammate, outsider] = await cast.of(app) as [Actor, Actor, Actor, Actor]
  const projectId = await createFolder(manager, 'Profile audience')
  await connect(app.db, manager.id, person.id)
  await connect(app.db, manager.id, teammate.id)
  await addMemberOk(manager, projectId, person.id, 'can_view')
  await addMemberOk(manager, projectId, teammate.id, 'can_view')
  const profilePath = `/folders/${projectId}/members/${person.id}/profile-docs`
  expectStatus(await manager.browser.json(profilePath, 'POST', {
    name: 'Not mine', custody: 'person',
  }), 403, 'manager cannot create a personal Doc')
  const created = await person.browser.json(profilePath, 'POST', {
    name: 'Private writing', custody: 'person',
  })
  expectStatus(created, 201, 'person creates a private Doc')
  const rootId = (created.json() as { id: string }).id
  expectStatus(await manager.browser.json(`${profilePath}/${rootId}/sharing`, 'GET'), 404,
    'project manager cannot read personal grants')
  expect((await person.browser.json(`${profilePath}/${rootId}/sharing`, 'GET')).json())
    .toEqual({ grants: [] })
  expect((await person.browser.json(profilePath, 'GET')).json()).toMatchObject({
    roots: [{ id: rootId, audience: 'only_me', custody: 'person', may_manage: true }],
  })
  expect((await teammate.browser.json(profilePath, 'GET')).json()).toMatchObject({ roots: [] })
  const child = await person.browser.json('/folders', 'POST', {
    parent_folder_id: rootId, name: 'Child writing', kind: 'doc',
  })
  expectStatus(child, 201, 'owner creates a real child page')
  const childId = (child.json() as { id: string }).id
  const firstPage = (await person.browser.json(`/folders/${rootId}/page`, 'GET')).json() as {
    revision: string
    items: { kind: 'block' | 'task'; id: string; section_block_id: string | null; list_parent_block_id: string | null }[]
  }
  const nativeChildId = randomUUID()
  const nativeBlockId = randomUUID()
  expectStatus(await person.browser.json(`/folders/${rootId}/page/actions`, 'POST', {
    action: 'document_transaction', mutation_id: randomUUID(), base_revision: firstPage.revision,
    operations: [
      { op: 'create_page', id: nativeChildId, block_id: nativeBlockId, title: 'Native child' },
      { op: 'set_outline', items: [
        ...firstPage.items.map((item) => ({
          kind: item.kind, id: item.id,
          section_block_id: item.section_block_id ?? null,
          list_parent_block_id: item.list_parent_block_id ?? null,
        })),
        { kind: 'block', id: nativeBlockId, section_block_id: null, list_parent_block_id: null },
      ] },
    ],
  }), 200, 'native Doc transaction creates a child')
  expectStatus(await person.browser.json(`/folders/${nativeChildId}/page`, 'GET'), 200,
    'owner reads the native child')
  const pageList = await person.browser.json(`/folders/${rootId}/profile-pages`, 'GET')
  expectStatus(pageList, 200, 'owner lists the profile Doc tree')
  expect(JSON.stringify(pageList.json())).toContain(nativeChildId)
  expectStatus(await teammate.browser.json(`/folders/${rootId}/profile-pages`, 'GET'), 404,
    'hidden tree has no list')
  expectStatus(await person.browser.json('/tasks', 'POST', {
    folder_id: rootId, title: 'Not a project task',
  }), 403, 'profile Doc does not create tasks')
  expectStatus(await person.browser.json(`/folders/${rootId}/tabs`, 'POST', {
    kind: 'doc',
  }), 422, 'profile Doc does not create project tabs')
  expectStatus(await person.browser.json(`/folders/${rootId}/import`, 'POST', {
    dana: 'workflow', version: 2, folders: [{ name: 'Not Work', tasks: [] }],
  }), 403, 'profile Doc does not import Work content')
  expectStatus(await person.browser.json('/folders', 'POST', {
    parent_folder_id: rootId, name: 'Not Work', kind: 'work',
  }), 422, 'profile Doc children stay Docs')
  expectStatus(await person.browser.json(`/folders/${childId}/location`, 'PATCH', {
    parent_folder_id: projectId,
  }), 422, 'child cannot escape its profile root')
  const fileId = randomUUID()
  objects.set(fileId, Buffer.from('private bytes'))
  await app.db.execute(sql`INSERT INTO files (id, owner_id, folder_id, kind, name, mime, bytes)
    VALUES (${fileId}::uuid, ${person.id}::uuid, ${childId}::uuid,
            'file', 'private.txt', 'text/plain', 13)`)

  const folderList = await person.browser.json('/folders?tabs=1', 'GET')
  expectStatus(folderList, 200, 'normal Folder list loads')
  expect(JSON.stringify(folderList.json())).not.toContain(rootId)
  expect(JSON.stringify(folderList.json())).not.toContain(childId)
  expectStatus(await person.browser.json(`/folders/${childId}/page`, 'GET'), 200, 'owner reads child')
  for (const viewer of [manager, teammate, outsider]) {
    expectStatus(await viewer.browser.json(`/folders/${rootId}`, 'GET'), 404, 'hidden root')
    expectStatus(await viewer.browser.json(`/folders/${childId}/page`, 'GET'), 404, 'hidden child')
    expectStatus(await viewer.browser.json(`/folders/${nativeChildId}/page`, 'GET'), 404,
      'hidden native child')
    expectStatus(await viewer.browser.api(`/files/${fileId}`), 404, 'hidden file bytes')
    expectStatus(await viewer.browser.json(`/references/folder/${nativeChildId}`, 'GET'), 404,
      'hidden child has no link preview')
    expectStatus(await viewer.browser.json(`/folders/${nativeChildId}/backlinks`, 'GET'), 404,
      'hidden child has no backlinks')
    expectStatus(await viewer.browser.json(`/events?folder=${nativeChildId}`, 'GET'), 404,
      'hidden child has no history')
  }
  expect(JSON.stringify((await teammate.browser.json('/search?q=Native%20child&tz=UTC', 'GET')).json()))
    .not.toContain(nativeChildId)
  expect(JSON.stringify((await teammate.browser.json('/references/search?q=Native%20child', 'GET')).json()))
    .not.toContain(nativeChildId)

  const audiencePath = `${profilePath}/${rootId}/audience`
  expectStatus(await manager.browser.json(audiencePath, 'PATCH', {
    audience: 'project_members', grants: [],
  }), 403, 'manager cannot change a personal audience')
  expectStatus(await person.browser.json(audiencePath, 'PATCH', {
    audience: 'project_members', grants: [],
  }), 204, 'person shares with current teammates')
  expect((await teammate.browser.json(profilePath, 'GET')).json()).toMatchObject({
    roots: [{ id: rootId, audience: 'project_members', may_edit: false }],
  })
  for (const viewer of [manager, teammate]) {
    expectStatus(await viewer.browser.json(`/folders/${childId}/page`, 'GET'), 200, 'project audience reads child')
    expectStatus(await viewer.browser.api(`/files/${fileId}`), 200, 'project audience reads file')
  }
  expectStatus(await outsider.browser.json(`/folders/${rootId}`, 'GET'), 404, 'outsider stays hidden')
  expect((await accessOf(app.db, teammate.id, childId))?.access).toBe('can_view')
  expect(mayPerform((await accessOf(app.db, teammate.id, childId))!, 'task.create').allowed).toBe(false)

  expectStatus(await person.browser.json(audiencePath, 'PATCH', {
    audience: 'selected_people', grants: [],
  }), 204, 'person replaces project audience')
  expectStatus(await manager.browser.json(`/folders/${childId}/page`, 'GET'), 404, 'former project audience is revoked')
  expectStatus(await person.browser.json(audiencePath, 'PATCH', {
    audience: 'selected_people', grants: [{ user_id: teammate.id, may_edit: false }],
  }), 204, 'person selects a reader')
  expect((await person.browser.json(`${profilePath}/${rootId}/sharing`, 'GET')).json())
    .toMatchObject({ grants: [{ user_id: teammate.id, may_edit: false }] })
  expectStatus(await teammate.browser.json(`${profilePath}/${rootId}/sharing`, 'GET'), 404,
    'selected reader cannot enumerate grants')
  expectStatus(await teammate.browser.json(`/folders/${childId}/page`, 'GET'), 200, 'selected reader sees child')
  expect(JSON.stringify((await teammate.browser.json('/search?q=Native%20child&tz=UTC', 'GET')).json()))
    .toContain(nativeChildId)
  expect((await accessOf(app.db, teammate.id, childId))?.access).toBe('can_view')
  const nativePage = (await teammate.browser.json(`/folders/${nativeChildId}/page`, 'GET')).json() as {
    revision: string
  }
  const editBlockId = randomUUID()
  const edit = {
    action: 'document_transaction', mutation_id: randomUUID(), base_revision: nativePage.revision,
    operations: [
      { op: 'put_block', id: editBlockId, block_kind: 'paragraph', text: 'Private prose',
        rich_content: null, file_id: null, ref_folder_id: null, width_pct: null, checked: null },
      { op: 'set_outline', items: [{
        kind: 'block', id: editBlockId, section_block_id: null, list_parent_block_id: null,
      }] },
    ],
  }
  expectStatus(await teammate.browser.json(`/folders/${nativeChildId}/page/actions`, 'POST', edit),
    403, 'selected reader cannot save')
  expectStatus(await person.browser.json(audiencePath, 'PATCH', {
    audience: 'selected_people', grants: [{ user_id: teammate.id, may_edit: true }],
  }), 204, 'person selects an editor')
  expect((await accessOf(app.db, teammate.id, childId))?.access).toBe('can_edit')
  expectStatus(await teammate.browser.json(`/folders/${nativeChildId}/page/actions`, 'POST', edit),
    200, 'selected editor saves with the native Doc transaction')
  expectStatus(await person.browser.json(`/folders/${nativeChildId}/page/actions`, 'POST', {
    ...edit, mutation_id: randomUUID(),
  }), 409, 'owner cannot overwrite an editor with a stale revision')
  const ownedFileId = randomUUID()
  await app.db.execute(sql`INSERT INTO files (id, owner_id, folder_id, kind, name, mime, bytes)
    VALUES (${ownedFileId}::uuid, ${teammate.id}::uuid, ${nativeChildId}::uuid,
            'file', 'former-editor-secret.txt', 'text/plain', 1)`)
  await recordEvent(app.db, {
    actorId: person.id, verb: 'edited', subjectKind: 'folder', subjectId: nativeChildId,
    subjectName: 'Native child', folderId: nativeChildId, recipients: [teammate.id],
  })
  expect(JSON.stringify((await teammate.browser.json('/notifications', 'GET')).json()))
    .toContain('Native child')
  expect(JSON.stringify((await teammate.browser.json('/me/export', 'GET')).json()))
    .toContain('former-editor-secret.txt')
  expectStatus(await teammate.browser.json(`/folders/${rootId}`, 'PATCH', { name: 'Changed title' }),
    403, 'an editor cannot manage the root')
  expectStatus(await person.browser.json(audiencePath, 'PATCH', {
    audience: 'only_me', grants: [],
  }), 204, 'person revokes the selected editor')
  expectStatus(await teammate.browser.api(`/files/${fileId}`), 404, 'revocation denies direct file bytes')
  expectStatus(await teammate.browser.json(`/references/folder/${nativeChildId}`, 'GET'), 404,
    'revocation denies link previews')
  expect(JSON.stringify((await teammate.browser.json('/search?q=Native%20child&tz=UTC', 'GET')).json()))
    .not.toContain(nativeChildId)
  expectStatus(await teammate.browser.json(`/folders/${nativeChildId}/page/actions`, 'POST', {
    ...edit, mutation_id: randomUUID(),
  }), 404, 'revocation denies a saved draft')
  expect(JSON.stringify((await teammate.browser.json('/notifications', 'GET')).json()))
    .not.toContain('Native child')
  expect(JSON.stringify((await teammate.browser.json('/me/export', 'GET')).json()))
    .not.toContain('former-editor-secret.txt')
  expectStatus(await person.browser.json(audiencePath, 'PATCH', {
    audience: 'selected_people', grants: [{ user_id: outsider.id, may_edit: false }],
  }), 204, 'person grants an unrelated viewer direct access')
  expectStatus(await outsider.browser.json(`/folders/${nativeChildId}/page`, 'GET'), 200,
    'selected viewer reads the native child')
  const secondProject = await createFolder(manager, 'Other project')
  await addMemberOk(manager, secondProject, person.id, 'can_view')
  expectStatus(await removeMember(manager, projectId, person.id), 204,
    'person leaves the original project')
  expectStatus(await person.browser.json(`/folders/${nativeChildId}/page`, 'GET'), 200,
    'person keeps their own Doc after departure')
  expect((await person.browser.json(
    `/folders/${secondProject}/members/${person.id}/profile-docs`, 'GET',
  )).json()).toMatchObject({ roots: [{ id: rootId, custody: 'person' }] })
  expectStatus(await person.browser.json(`/folders/${rootId}`, 'DELETE'), 200,
    'owner moves their profile Doc to Trash')
  expectStatus(await person.browser.json(`/folders/${nativeChildId}/page`, 'GET'), 404,
    'trashed root hides its child')
  expect(JSON.stringify((await person.browser.json('/trash', 'GET')).json())).toContain(rootId)
  expectStatus(await person.browser.json(`/folders/${rootId}/restore`, 'POST', {}), 200,
    'owner restores their profile Doc')
  expectStatus(await person.browser.json(`/folders/${nativeChildId}/page`, 'GET'), 200,
    'restored root restores the child')
  expectStatus(await person.browser.json(`/folders/${rootId}`, 'DELETE'), 200,
    'owner trashes the root again')
  expectStatus(await person.browser.json(`/trash/folders/${rootId}`, 'DELETE'), 204,
    'owner permanently deletes the root and children')
  expect((await app.db.execute(sql`SELECT 1 FROM folders WHERE id = ${nativeChildId}::uuid`)).rows)
    .toHaveLength(0)
  expect(objects.has(fileId)).toBe(false)
})

test('project-managed root keeps project managers and follows membership', async () => {
  const [manager, person, teammate] = await cast.of(app) as [Actor, Actor, Actor]
  const projectId = await createFolder(manager, 'Managed profile')
  await connect(app.db, manager.id, person.id)
  await connect(app.db, manager.id, teammate.id)
  await addMemberOk(manager, projectId, person.id, 'can_view')
  await addMemberOk(manager, projectId, teammate.id, 'can_view')
  const profilePath = `/folders/${projectId}/members/${person.id}/profile-docs`
  const created = await manager.browser.json(profilePath, 'POST', {
    name: 'Guidelines', custody: 'project',
  })
  expectStatus(created, 201, 'manager creates a project-managed Doc')
  const rootId = (created.json() as { id: string }).id
  expectStatus(await manager.browser.json(`${profilePath}/${rootId}/audience`, 'PATCH', {
    audience: 'only_me', grants: [],
  }), 403, 'project-managed Doc cannot claim to be private to one person')
  expect((await accessOf(app.db, manager.id, rootId))?.access).toBe('full_control')
  expect((await accessOf(app.db, teammate.id, rootId))?.access).toBe('can_view')
  expectStatus(await removeMember(manager, projectId, teammate.id), 204, 'member leaves project')
  expectStatus(await teammate.browser.json(`/folders/${rootId}/page`, 'GET'), 404, 'departed member loses access')
  expectStatus(await removeMember(manager, projectId, person.id), 204,
    'profile subject leaves the custody project')
  expect((await manager.browser.json(profilePath, 'GET')).json()).toMatchObject({
    roots: [{ id: rootId, custody: 'project' }],
  })
  expectStatus(await manager.browser.json(`${profilePath}/${rootId}/audience`, 'PATCH', {
    audience: 'selected_people', grants: [],
  }), 204, 'manager can govern a Doc after its subject leaves')
  expectStatus(await manager.browser.json(`/folders/${rootId}/page`, 'GET'), 200,
    'manager retains project-managed content')
  const child = await manager.browser.json('/folders', 'POST', {
    parent_folder_id: rootId, name: 'Managed child', kind: 'doc',
  })
  expectStatus(child, 201, 'manager creates a managed child')
  const childId = (child.json() as { id: string }).id
  const fileId = randomUUID()
  objects.set(fileId, Buffer.from('managed bytes'))
  await app.db.execute(sql`INSERT INTO files (id, owner_id, folder_id, kind, name, mime, bytes)
    VALUES (${fileId}::uuid, ${manager.id}::uuid, ${childId}::uuid,
            'file', 'managed.txt', 'text/plain', 13)`)
  expectStatus(await manager.browser.json(`/folders/${projectId}`, 'DELETE'), 200,
    'manager moves the custody project to Trash')
  expectStatus(await manager.browser.json(`/trash/folders/${projectId}`, 'DELETE'), 204,
    'manager destroys the custody project and managed Doc')
  expect((await app.db.execute(sql`SELECT 1 FROM profile_doc_roots WHERE root_folder_id = ${rootId}::uuid`)).rows)
    .toHaveLength(0)
  expect(objects.has(fileId)).toBe(false)
})
