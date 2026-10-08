import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { addMemberOk, Cast, connect, createFolder, expectStatus, removeMember } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { deleteAccount } from '../support/sharing-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 'dm610')

beforeAll(async () => { app = await startAuthTestApp() }, 60_000)
afterAll(async () => { if (app) { await cast.cleanup(app.db); await app.close() } })

test('a private conversation stays between two Team members across Works', async () => {
  const [owner, member, stranger] = await cast.of(app) as [Actor, Actor, Actor]
  const work = await createFolder(owner, 'Private messages')
  await connect(app.db, owner.id, member.id)
  await addMemberOk(owner, work, member.id, 'can_view')

  const open = (actor: Actor, folderId: string, memberId: string) =>
    actor.browser.json('/direct-conversations', 'POST', { folder_id: folderId, member_id: memberId })
  expectStatus(await open(owner, work, stranger.id), 404, 'not a Team member')
  expectStatus(await open(stranger, work, member.id), 404, 'not on the Work')
  expectStatus(await open(owner, work, owner.id), 422, 'no self DM')

  const first = await open(owner, work, member.id)
  expectStatus(first, 200, 'open a private conversation')
  const id = (first.json() as { id: string }).id
  const reverse = await open(member, work, owner.id)
  expectStatus(reverse, 200, 'the other participant opens the same conversation')
  expect((reverse.json() as { id: string }).id).toBe(id)

  const path = `/direct-conversations/${id}/messages`
  expectStatus(await stranger.browser.json(path, 'GET'), 404, 'outsider cannot read')
  expectStatus(await stranger.browser.json(path, 'POST', { body: 'Intrusion' }), 404, 'outsider cannot write')
  expectStatus(await owner.browser.json(`/direct-conversations/${randomUUID()}/messages`, 'GET'), 404, 'unknown conversation')
  expectStatus(await owner.browser.json(path, 'POST', { body: '  ' }), 422, 'empty message')
  const sent = await owner.browser.json(path, 'POST', { body: 'Hello privately' })
  expectStatus(sent, 201, 'participant sends')
  const messageId = (sent.json() as { id: string }).id
  const inbox = await member.browser.json('/direct-conversations', 'GET')
  expectStatus(inbox, 200, 'recipient sees the conversation')
  expect(inbox.json()).toMatchObject([{ id, member_id: owner.id, unread: 1, latest_id: messageId }])
  expect((await stranger.browser.json('/direct-conversations', 'GET')).json()).toEqual([])
  expectStatus(await stranger.browser.json(`/direct-conversations/${id}/read`, 'POST', { through: messageId }), 404, 'outsider cannot mark read')
  expectStatus(await member.browser.json(`/direct-conversations/${id}/read`, 'POST', { through: randomUUID() }), 404, 'only a message in this conversation is a read cursor')
  const read = await member.browser.json(path, 'GET')
  expectStatus(read, 200, 'participant reads')
  expect((read.json() as { messages: { body: string; author_id: string }[] }).messages).toMatchObject([{ body: 'Hello privately', author_id: owner.id }])
  expectStatus(await member.browser.json(`/direct-conversations/${id}/read`, 'POST', { through: messageId }), 200, 'recipient marks displayed messages read')
  expect((await member.browser.json('/direct-conversations', 'GET')).json()).toMatchObject([{ id, unread: 0 }])
  const ownerExport = await owner.browser.json('/me/export', 'GET')
  expectStatus(ownerExport, 200, 'a participant exports the DM')
  expect((ownerExport.json() as { direct_messages: { body: string; sent_by_me: boolean }[] }).direct_messages)
    .toMatchObject([{ body: 'Hello privately', sent_by_me: true }])
  const strangerExport = await stranger.browser.json('/me/export', 'GET')
  expectStatus(strangerExport, 200, 'an outsider exports only their own data')
  expect((strangerExport.json() as { direct_messages: unknown[] }).direct_messages).toEqual([])

  expectStatus(await removeMember(owner, work, member.id), 204, 'member leaves the Work')
  expectStatus(await open(owner, work, member.id), 404, 'the old Work cannot start a DM')
  expectStatus(await member.browser.json(path, 'POST', { body: 'Still private' }), 201, 'the existing DM belongs to its participants')

  const nextWork = await createFolder(owner, 'Another Work')
  await addMemberOk(owner, nextWork, member.id, 'can_view')
  const reopened = await open(owner, nextWork, member.id)
  expectStatus(reopened, 200, 'open from another shared Work')
  expect((reopened.json() as { id: string }).id).toBe(id)

  expectStatus(await deleteAccount(member), 204, 'a participant deletes their account')
  expectStatus(await owner.browser.json(path, 'GET'), 404, 'account deletion removes the private exchange')
})
