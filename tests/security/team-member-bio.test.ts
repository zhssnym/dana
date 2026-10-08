import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { addMemberOk, Cast, connect, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 'bio')

beforeAll(async () => { app = await startAuthTestApp() }, 60_000)
afterAll(async () => { if (app) { await cast.cleanup(app.db); await app.close() } })

test('teammates can edit their own bio and Full control can edit another bio', async () => {
  const [owner, member, stranger] = await cast.of(app) as [Actor, Actor, Actor]
  const folderId = await createFolder(owner, 'Team profiles')
  await connect(app.db, owner.id, member.id)
  await addMemberOk(owner, folderId, member.id, 'can_view')
  const path = (id: string) => `/folders/${folderId}/members/${id}`

  expectStatus(await stranger.browser.json(`${path(member.id)}/bio`, 'PATCH', { bio: 'Hidden' }), 404, 'outsider')
  expectStatus(await member.browser.json(`${path(owner.id)}/bio`, 'PATCH', { bio: 'Changed' }), 403, 'another member')
  expectStatus(await member.browser.json(`${path(member.id)}/bio`, 'PATCH', { bio: '  Works on planning.  ' }), 204, 'own bio')
  const detail = await owner.browser.json(path(member.id), 'GET')
  expectStatus(detail, 200, 'Team can read')
  expect(detail.json()).toMatchObject({ bio: 'Works on planning.' })

  expectStatus(await owner.browser.json(`${path(member.id)}/bio`, 'PATCH', { bio: 'Coordinates planning.' }), 204, 'Full control')
  expect((await member.browser.json(path(member.id), 'GET')).json()).toMatchObject({ bio: 'Coordinates planning.' })
  const exported = await member.browser.json('/me/export', 'GET')
  expectStatus(exported, 200, 'member export')
  expect(exported.json()).toMatchObject({ team_bios: [{ folder: { id: folderId }, bio: 'Coordinates planning.' }] })
  expectStatus(await owner.browser.json(`${path(member.id)}/bio`, 'PATCH', { bio: 'x'.repeat(501) }), 422, 'length limit')
})
