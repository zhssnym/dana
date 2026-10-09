import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { addMemberOk, Cast, connect, createFolder, expectStatus, removeMember } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 'bio')

beforeAll(async () => { app = await startAuthTestApp() }, 60_000)
afterAll(async () => { if (app) { await cast.cleanup(app.db); await app.close() } })

test('overview keeps attribution, rejects stale edits, and ends with membership', async () => {
  const [owner, member, stranger] = await cast.of(app) as [Actor, Actor, Actor]
  const folderId = await createFolder(owner, 'Team profiles')
  await connect(app.db, owner.id, member.id)
  await addMemberOk(owner, folderId, member.id, 'can_view')
  const path = (id: string) => `/folders/${folderId}/members/${id}`

  expectStatus(await stranger.browser.json(`${path(member.id)}/bio`, 'PATCH', { bio: 'Hidden' }), 404, 'outsider')
  expectStatus(await member.browser.json(`${path(owner.id)}/bio`, 'PATCH', { bio: 'Changed' }), 403, 'another member')
  expectStatus(await member.browser.json(`${path(member.id)}/bio`, 'PATCH', {
    content: { version: 1, runs: [{ text: 'Works on ', bold: true }, { text: 'planning.' }] },
    base_updated_at: null,
  }), 204, 'own overview')
  const detail = await owner.browser.json(path(member.id), 'GET')
  expectStatus(detail, 200, 'Team can read')
  expect(detail.json()).toMatchObject({
    bio: 'Works on planning.',
    bio_content: { version: 1, runs: [{ text: 'Works on ', bold: true }, { text: 'planning.' }] },
    bio_author: { id: member.id },
    bio_last_editor: { id: member.id },
  })
  const firstUpdatedAt = (detail.json() as { bio_updated_at: string }).bio_updated_at

  expectStatus(await owner.browser.json(`${path(member.id)}/bio`, 'PATCH', {
    content: { version: 1, runs: [{ text: 'Coordinates planning.', italic: true }] },
    base_updated_at: firstUpdatedAt,
  }), 204, 'Full control')
  expect((await member.browser.json(path(member.id), 'GET')).json()).toMatchObject({
    bio: 'Coordinates planning.',
    bio_author: { id: member.id },
    bio_last_editor: { id: owner.id },
  })
  expectStatus(await member.browser.json(`${path(member.id)}/bio`, 'PATCH', {
    content: { version: 1, runs: [{ text: 'Stale' }] },
    base_updated_at: firstUpdatedAt,
  }), 409, 'stale overview')
  const exported = await member.browser.json('/me/export', 'GET')
  expectStatus(exported, 200, 'member export')
  expect(exported.json()).toMatchObject({ team_bios: [{
    folder: { id: folderId }, bio: 'Coordinates planning.',
    content: { version: 1, runs: [{ text: 'Coordinates planning.', italic: true }] },
  }] })
  expectStatus(await owner.browser.json(`${path(member.id)}/bio`, 'PATCH', { bio: 'x'.repeat(501) }), 422, 'length limit')
  expectStatus(await member.browser.json(`${path(member.id)}/bio`, 'PATCH', {
    content: { version: 1, runs: [{ text: 'x'.repeat(501) }] },
  }), 422, 'formatted length limit')
  expectStatus(await removeMember(owner, folderId, member.id), 204, 'remove teammate')
  expectStatus(await owner.browser.json(path(member.id), 'GET'), 404, 'profile is unavailable')
})
