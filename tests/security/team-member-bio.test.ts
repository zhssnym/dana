import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'

import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { addMemberOk, Cast, connect, createFolder, expectStatus, removeMember } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 'bio')

beforeAll(async () => { app = await startAuthTestApp() }, 60_000)
afterAll(async () => { if (app) { await cast.cleanup(app.db); await app.close() } })

test('only the person edits a persistent bio; legacy project writing keeps its attribution', async () => {
  const [owner, member, stranger] = await cast.of(app) as [Actor, Actor, Actor]
  const folderId = await createFolder(owner, 'Team profiles')
  await connect(app.db, owner.id, member.id)
  await addMemberOk(owner, folderId, member.id, 'can_view')
  const secondFolderId = await createFolder(owner, 'Another team')
  await addMemberOk(owner, secondFolderId, member.id, 'can_view')
  const path = (id: string) => `/folders/${folderId}/members/${id}`

  expectStatus(await stranger.browser.json(`${path(member.id)}/bio`, 'PATCH', { bio: 'Hidden' }), 404, 'outsider')
  expectStatus(await member.browser.json(`${path(owner.id)}/bio`, 'PATCH', { bio: 'Changed' }), 403, 'another member')
  expectStatus(await owner.browser.json(`${path(member.id)}/bio`, 'PATCH', { bio: 'Manager text' }), 403, 'Full control cannot edit Bio')
  await app.db.execute(sql`UPDATE folder_members SET bio = 'Earlier project note', bio_author_id = ${owner.id}::uuid,
    bio_last_editor_id = ${owner.id}::uuid WHERE folder_id = ${folderId}::uuid AND user_id = ${member.id}::uuid`)
  expectStatus(await member.browser.json(`${path(member.id)}/bio`, 'PATCH', {
    content: { version: 1, runs: [{ text: 'Works on ', bold: true }, { text: 'planning.' }] },
    base_updated_at: null,
  }), 204, 'own overview')
  const detail = await owner.browser.json(path(member.id), 'GET')
  expectStatus(detail, 200, 'Team can read')
  expect(detail.json()).toMatchObject({
    bio: 'Works on planning.',
    bio_content: { version: 1, runs: [{ text: 'Works on ', bold: true }, { text: 'planning.' }] },
    legacy_bio: { text: 'Earlier project note', author: { id: owner.id } },
  })
  const firstUpdatedAt = (detail.json() as { bio_updated_at: string }).bio_updated_at

  expectStatus(await member.browser.json(`/folders/${secondFolderId}/members/${member.id}`, 'GET'), 200, 'Bio follows the person')
  expect((await member.browser.json(`/folders/${secondFolderId}/members/${member.id}`, 'GET')).json()).toMatchObject({
    bio: 'Works on planning.', legacy_bio: null,
  })
  expectStatus(await member.browser.json(`${path(member.id)}/bio`, 'PATCH', {
    content: { version: 1, runs: [{ text: 'Coordinates planning.', italic: true }] },
    base_updated_at: firstUpdatedAt,
  }), 204, 'person edits Bio')
  expect((await member.browser.json(path(member.id), 'GET')).json()).toMatchObject({
    bio: 'Coordinates planning.',
    legacy_bio: { text: 'Earlier project note', author: { id: owner.id } },
  })
  expectStatus(await member.browser.json(`${path(member.id)}/bio`, 'PATCH', {
    content: { version: 1, runs: [{ text: 'Stale' }] },
    base_updated_at: firstUpdatedAt,
  }), 409, 'stale overview')
  const exported = await member.browser.json('/me/export', 'GET')
  expectStatus(exported, 200, 'member export')
  expect(exported.json()).toMatchObject({
    account: { bio: 'Coordinates planning.', bio_content: { version: 1, runs: [{ text: 'Coordinates planning.', italic: true }] } },
    team_bios: [{ folder: { id: folderId }, bio: 'Earlier project note' }],
  })
  expectStatus(await member.browser.json(`${path(member.id)}/bio`, 'PATCH', { bio: 'x'.repeat(501) }), 422, 'length limit')
  expectStatus(await member.browser.json(`${path(member.id)}/bio`, 'PATCH', {
    content: { version: 1, runs: [{ text: 'x'.repeat(501) }] },
  }), 422, 'formatted length limit')
  expectStatus(await removeMember(owner, folderId, member.id), 204, 'remove teammate')
  expectStatus(await owner.browser.json(path(member.id), 'GET'), 404, 'profile is unavailable')
  expect((await member.browser.json('/me/export', 'GET')).json()).toMatchObject({
    account: { bio: 'Coordinates planning.' },
  })
})

test('project context and member-curated content have distinct write grants and revisions', async () => {
  const [owner, member, stranger] = await cast.of(app) as [Actor, Actor, Actor]
  const folderId = await createFolder(owner, 'Scoped teammate content')
  await connect(app.db, owner.id, member.id)
  await addMemberOk(owner, folderId, member.id, 'can_view')
  const base = `/folders/${folderId}/members/${member.id}`
  const payload = (text: string, revision = 0) => ({
    base_revision: revision,
    content: { version: 1, blocks: [
      { kind: 'paragraph', content: { version: 1, runs: [{ text }] } },
    ] },
  })

  const initial = await member.browser.json(base, 'GET')
  expectStatus(initial, 200, 'member reads profile')
  expect(initial.json()).toMatchObject({
    profile_project: { content: { version: 1, blocks: [] }, revision: 0, may_edit: false },
    profile_shared: { content: { version: 1, blocks: [] }, revision: 0, may_edit: true },
  })
  expectStatus(await stranger.browser.json(`${base}/profile-content/project`, 'PUT', payload('Hidden')),
    404, 'stranger cannot write')
  expectStatus(await member.browser.json(`${base}/profile-content/project`, 'PUT', payload('Not mine')),
    403, 'member cannot manage project context')
  expectStatus(await owner.browser.json(`${base}/profile-content/shared`, 'PUT', payload('Not mine')),
    403, 'manager cannot impersonate member')
  expectStatus(await owner.browser.json(`${base}/profile-content/project`, 'PUT', payload('Backend guidelines')),
    204, 'Full control writes project context')
  expectStatus(await member.browser.json(`${base}/profile-content/shared`, 'PUT', payload('Portfolio note')),
    204, 'member writes own shared content')

  const updated = await owner.browser.json(base, 'GET')
  expectStatus(updated, 200, 'project reads both')
  expect(updated.json()).toMatchObject({
    profile_project: { revision: 1, updated_by: { id: owner.id }, content: { blocks: [
      { kind: 'paragraph', content: { runs: [{ text: 'Backend guidelines' }] } },
    ] } },
    profile_shared: { revision: 1, updated_by: { id: member.id }, content: { blocks: [
      { kind: 'paragraph', content: { runs: [{ text: 'Portfolio note' }] } },
    ] } },
  })

  const memberExport = await member.browser.json('/me/export', 'GET')
  expectStatus(memberExport, 200, 'member export includes curated content')
  expect(memberExport.json()).toMatchObject({
    version: 16,
    profile_sections: [{
      area: 'shared', member_id: member.id,
      content: { blocks: [{ kind: 'paragraph', content: { runs: [{ text: 'Portfolio note' }] } }] },
    }],
  })
  const ownerExport = await owner.browser.json('/me/export', 'GET')
  expectStatus(ownerExport, 200, 'project owner export includes project-managed content')
  expect(ownerExport.json()).toMatchObject({
    profile_sections: [{
      area: 'project', member_id: member.id,
      content: { blocks: [{ kind: 'paragraph', content: { runs: [{ text: 'Backend guidelines' }] } }] },
    }],
  })

  expectStatus(await member.browser.json(`${base}/profile-content/shared`, 'PUT', payload('Stale')),
    409, 'outdated revision is rejected')
  expectStatus(await member.browser.json(`${base}/profile-content/shared`, 'PUT', {
    base_revision: 1,
    content: { version: 1, blocks: [{ kind: 'file', file_id: randomUUID() }] },
  }), 422, 'unknown file is not accepted')
  expectStatus(await member.browser.json(`${base}/profile-content/shared`, 'PUT', payload('Updated note', 1)),
    204, 'current revision can advance')

  expectStatus(await removeMember(owner, folderId, member.id), 204, 'remove member')
  expectStatus(await owner.browser.json(base, 'GET'), 404, 'removed profile is not visible')
})
