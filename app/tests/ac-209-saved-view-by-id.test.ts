/*
AC-209: given a saved view naming an assignee by id, when that person's
display name changes, then the view still matches them.

RFC 0004's hazard list says it in four words, ids never names, and this is
its acceptance shape: the definition is stored, the name changes
underneath, the view is re-read and still resolves the same person. A
definition storing "Sara Khan" fails here the day she is "Sara Ahmed".

Spec: 4.19, 7.16, 11.15 (RFC 0005).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'colleague'])

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-209 a view stores ids, never names', () => {
  test('the definition survives a rename', async () => {
    const [owner, colleague] = (await cast.of(app)) as [Actor, Actor]

    const saved = await owner.browser.json('/views', 'POST', {
      name: 's1 ac209 their work',
      definition: { assignee: [colleague.id] },
    })
    expectStatus(saved, 201, 'a view saves (spec 7.16)')
    const viewId = String((saved.json() as { id?: unknown }).id)

    await app.db.execute(sql`
      UPDATE users SET display_name = 's1 ac209 renamed person'
      WHERE id = ${colleague.id}::uuid
    `)

    const read = await owner.browser.json(`/views/${viewId}`, 'GET')
    expectStatus(read, 200, 'the view reads back (spec 7.16)')
    const definition = JSON.stringify(
      (read.json() as { definition?: unknown }).definition,
    )
    expect(
      definition.includes(colleague.id),
      'the definition names the person by id (spec 4.19)',
    ).toBe(true)
    expect(
      definition.includes('Sara') || definition.includes('renamed person'),
      'no display name is stored in a definition (11.15)',
    ).toBe(false)
  })
})
