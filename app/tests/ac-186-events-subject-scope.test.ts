/*
AC-186: given an event whose subject the viewer cannot read, when they read
events by subject, then the 10.2 not-found shape.

The by-subject read is history's own door (a task's footer, a folder's
sheet), and it must apply the same check the subject itself would: 10.2
scopes an event by what it is about, not by who wrote it.

Spec: 4.13, 7.12, 10.2 (RFC 0005).
*/
import { afterAll, beforeAll, describe, test } from 'vitest'

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

describe('AC-186 an event is as private as its subject', () => {
  test('by-subject reads answer per the viewer, not per the event', async () => {
    const [owner, outsider] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await createFolder(owner, 's1 ac186 subject')

    const asOwner = await owner.browser.json(
      `/events?subject=folder:${folderId}`,
      'GET',
    )
    expectStatus(asOwner, 200, 'the subject’s member reads its history (spec 7.12)')

    const asOutsider = await outsider.browser.json(
      `/events?subject=folder:${folderId}`,
      'GET',
    )
    expectStatus(
      asOutsider,
      404,
      'a viewer who cannot read the subject meets not-found (spec 10.2)',
    )
  })
})
