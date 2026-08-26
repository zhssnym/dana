/*
AC-207: given a comment in a thread with participants, then each
participant except the actor gains a notification.

Participation is earned by writing in the thread, not by folder membership
alone: 4.14 fans a comment to the people in the conversation, so a member
who never spoke stays unpinged. Both sides of that line are asserted.

Spec: 4.14, 4.15, 7.14 (RFC 0005).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'talker', 'lurker'])

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-207 a comment reaches the conversation, not the roster', () => {
  test('participants are pinged, the silent member is not, the actor never', async () => {
    const [owner, talker, lurker] = (await cast.of(app)) as [Actor, Actor, Actor]
    for (const person of [talker, lurker]) {
      await connect(app.db, owner.id, person.id)
    }
    const folderId = await createFolder(owner, 's1 ac207 fanout')
    await addMemberOk(owner, folderId, talker.id)
    await addMemberOk(owner, folderId, lurker.id)

    const opening = await talker.browser.json(`/folders/${folderId}/comments`, 'POST', {
      body: 's1 ac207 the talker opens',
    })
    expectStatus(opening, 201, 'the opening comment stages (spec 7.14)')

    const reply = await owner.browser.json(`/folders/${folderId}/comments`, 'POST', {
      body: 's1 ac207 the owner answers',
    })
    expectStatus(reply, 201, 'the answer stages (spec 7.14)')

    const talkerInbox = await talker.browser.json('/notifications', 'GET')
    expectStatus(talkerInbox, 200, 'the participant lists notifications (spec 7.12)')
    expect(
      JSON.stringify(talkerInbox.json()).includes('ac207'),
      'the participant hears the answer (spec 4.14)',
    ).toBe(true)

    const lurkerInbox = await lurker.browser.json('/notifications', 'GET')
    expectStatus(lurkerInbox, 200, 'the lurker lists notifications (spec 7.12)')
    expect(
      JSON.stringify(lurkerInbox.json()).includes('ac207'),
      'a member who never spoke is not pinged (spec 4.14)',
    ).toBe(false)

    const ownerInbox = await owner.browser.json('/notifications', 'GET')
    expectStatus(ownerInbox, 200, 'the actor lists notifications (spec 7.12)')
    expect(
      JSON.stringify(ownerInbox.json()).includes('the owner answers'),
      'an actor is never notified of their own act (spec 4.14)',
    ).toBe(false)
  })
})
