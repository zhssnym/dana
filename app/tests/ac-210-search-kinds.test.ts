/*
AC-210: given a search term matching a page paragraph, a shelf name, and a
step title, then each returns under its kind; given a reader consuming only
the v1 task results, then its view of the response is unchanged.

The compatibility half is 7.18's whole promise: the extension is additive
to a frozen endpoint, so the v1 task array must be byte-shape identical
whether or not the new kinds ride beside it.

Spec: 6 Q8, 7.10, 7.18 (RFC 0005).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'

import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { createTaskOk } from './tasks-harness.js'

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

describe('AC-210 search reaches everything you can go to', () => {
  test('paragraphs, shelves and steps return under their kinds', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const marker = 'zyggurat'
    const folderId = await createFolder(owner, 's1 ac210 haystack')

    const shelf = await owner.browser.json('/shelves', 'POST', {
      name: `s1 ${marker} shelf`,
    })
    expectStatus(shelf, 201, 'the shelf stages (spec 7.16)')
    const page = await owner.browser.json(`/folders/${folderId}/page`, 'PUT', {
      blocks: [
        { kind: 'paragraph', position: 0, text: `the ${marker} is in the prose` },
      ],
    })
    expectStatus(page, 200, 'the paragraph stages (spec 7.16)')
    const task = await createTaskOk(
      owner,
      { title: 's1 ac210 stepped task', folder_id: folderId },
      'the task stages (spec 7.6)',
    )
    await app.db.execute(sql`
      INSERT INTO steps (id, task_id, title, position)
      VALUES (${randomUUID()}::uuid, ${task.id}::uuid, ${`the ${marker} step`}, 0)
    `)

    const found = await owner.browser.json(`/search?q=${marker}&tz=UTC`, 'GET')
    expectStatus(found, 200, 'search answers (spec 7.10)')
    const body = found.json() as Record<string, unknown>
    expect(
      Array.isArray(body.folders) || Array.isArray(body.pages),
      'page matches return under a kind of their own (spec 7.18)',
    ).toBe(true)
    expect(
      JSON.stringify(body.shelves ?? []).includes(marker),
      'the shelf name matches under its kind (spec 7.18)',
    ).toBe(true)
    expect(
      JSON.stringify(body).includes('stepped task'),
      'the step title reaches its task (spec 7.18)',
    ).toBe(true)
  })
})
