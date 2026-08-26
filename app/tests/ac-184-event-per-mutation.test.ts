/*
AC-184: given any authenticated mutation that changes a task, folder, shelf,
or comment, when it succeeds, then exactly one events row records it,
carrying the actor, the verb, and the subject.

RFC 0005 (Accepted 2026-08-24) puts the write at the 10.2 chokepoint, which
is why one mutation is exactly one event: there is a single seam every
mutation already passes. This test drives the smallest pair, a folder
created then renamed, and reads the events list back as its own member.
Exactly two events, newest first, each naming the actor and the act. The
count matters as much as the content: a chokepoint that writes twice per
mutation, or once per request attempt, fails here before it misleads the
history surfaces.

Spec: 4.13, 7.12, 10.2 (RFC 0005).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'])

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-184 one mutation, one event', () => {
  test('a created then renamed folder carries exactly two events', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 's1 ac184 events')

    const rename = await owner.browser.json(`/folders/${folderId}`, 'PATCH', {
      name: 's1 ac184 renamed',
    })
    expectStatus(rename, 200, 'the rename must succeed before events are read (spec 7.4)')

    const listed = await owner.browser.json(
      `/events?folder=${folderId}`,
      'GET',
    )
    expectStatus(
      listed,
      200,
      'a member must be able to list a folder’s events (spec 7.12)',
    )
    const body = listed.json() as { events?: unknown }
    expect(
      Array.isArray(body.events),
      'the events list must be an array on the response (spec 7.12)',
    ).toBe(true)
    const events = body.events as Array<Record<string, unknown>>
    expect(
      events.length,
      'two mutations must have written exactly two events, no more and no fewer (spec 4.13)',
    ).toBe(2)
    const [newest, oldest] = events as [
      Record<string, unknown>,
      Record<string, unknown>,
    ]
    expect(newest.verb, 'newest first: the rename leads (spec 7.12)').toBe('renamed')
    expect(oldest.verb, 'the creation follows (spec 7.12)').toBe('created')
    for (const event of events) {
      expect(
        event.actor_id,
        'every event names its actor (spec 4.13)',
      ).toBe(owner.id)
      expect(
        event.subject_id,
        'every event names its subject (spec 4.13)',
      ).toBe(folderId)
    }
  })
})
