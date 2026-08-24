/*
AC-185: given a folder member, when they list the folder's events, then
events return newest first; given a non-member, then the 10.2 not-found
shape.

The permission half is the sharp edge: events are the one read surface that
spans every object kind, so a scope miss here leaks activity about folders
a viewer was never in. The non-member expects the not-found shape rather
than 403 because 10.2 makes inaccessible and absent indistinguishable.

Spec: 4.13, 7.12, 10.2 (RFC 0005).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'outsider'])

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-185 events are the member’s to read', () => {
  test('a member lists newest first; a non-member meets not-found', async () => {
    const [owner, outsider] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await createFolder(owner, 's1 ac185 scope')

    const asMember = await owner.browser.json(`/events?folder=${folderId}`, 'GET')
    expectStatus(asMember, 200, 'a member reads the folder’s events (spec 7.12)')
    const events = (asMember.json() as { events?: unknown }).events
    expect(Array.isArray(events), 'events must be a list').toBe(true)
    const stamps = (events as Array<{ created_at?: string }>).map(
      (event) => event.created_at ?? '',
    )
    expect(
      [...stamps].sort().reverse(),
      'newest first (spec 7.12)',
    ).toEqual(stamps)

    const asOutsider = await outsider.browser.json(
      `/events?folder=${folderId}`,
      'GET',
    )
    expectStatus(
      asOutsider,
      404,
      'a non-member meets the not-found shape, never a 403 (spec 10.2)',
    )
  })
})
