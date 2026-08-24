/*
AC-201: given a workflow file naming ids, members, dates, or statuses, when
imported, then only structure and titles are created; given a file over the
10.3 import caps, then 422.

The import is the one endpoint that turns an unvalidated file into server
writes, so the test hands it a hostile file: real structure wrapped around
everything the privacy rule strips. The assertion is that the creation
succeeds while every smuggled field is ignored, which is stricter than
refusing the file, because refusing would make honest exports from older
versions unimportable.

Spec: 7.16, 10.3, DES-206 (RFC 0005).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
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

describe('AC-201 the import takes the shape and refuses the smuggling', () => {
  test('hostile fields are ignored; over-caps files are refused', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    const hostile = await owner.browser.json('/workflows/import', 'POST', {
      dana: 'workflow',
      version: 1,
      name: 's1 ac201 imported',
      folders: [
        {
          name: 's1 ac201 folder',
          id: '00000000-0000-4000-8000-000000000001',
          members: ['intruder@example.com'],
          tasks: [
            {
              title: 's1 ac201 task',
              status: 'completed',
              due_date: '2026-01-01',
              assignee_id: owner.id,
            },
          ],
        },
      ],
    })
    expectStatus(hostile, 201, 'a structurally valid file imports (spec 7.16)')
    const created = hostile.json() as { folders?: Array<{ id?: string }> }
    const newId = String(created.folders?.[0]?.id)
    expect(
      newId,
      'the file’s id is never honored; the server mints its own (spec 7.16)',
    ).not.toBe('00000000-0000-4000-8000-000000000001')

    const listed = await owner.browser.json(
      `/folders/${newId}/tasks?tz=UTC`,
      'GET',
    )
    expectStatus(listed, 200, 'the imported folder reads (spec 6 Q7)')
    const text = JSON.stringify(listed.json())
    expect(text.includes('s1 ac201 task'), 'the title traveled').toBe(true)
    expect(text.includes('completed'), 'statuses do not travel').toBe(false)
    expect(text.includes('2026-01-01'), 'dates do not travel').toBe(false)

    const oversized = await owner.browser.json('/workflows/import', 'POST', {
      dana: 'workflow',
      version: 1,
      name: 's1 ac201 too big',
      folders: Array.from({ length: 51 }, (_, index) => ({
        name: `s1 ac201 f${String(index)}`,
      })),
    })
    expectStatus(oversized, 422, 'over the 10.3 import caps is refused')
  })
})
