/*
GET /stats answers the accounts on DANA_OPERATORS and no one else,
and what it answers is counts and one row per account, never a page's name.

**Why this exists.** The route takes no id, so the ac-397 sweep never drives
it, and ac-236 only proves it wants a session. The allowlist is the whole of
its authorization, and a slip there hands every signed-in person the
operators' view of Dana.

Spec: 7.0, 10.2.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { getStatsResponse } from '../../src/shared/stats.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { TestBrowser } from '../support/http-client.js'

let app: AuthTestApp
const cast = new Cast(['operator', 'stranger'], 'ac1546')
const before = process.env.DANA_OPERATORS
const PAGE = 'ac1546 private page name'

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if (before === undefined) delete process.env.DANA_OPERATORS
  else process.env.DANA_OPERATORS = before
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('the stats are the operators\' alone', () => {
  test('an operator reads counts, a stranger reads not found, no session reads 401', async () => {
    const [operator, stranger] = (await cast.of(app)) as [Actor, Actor]
    await createFolder(stranger, PAGE)
    process.env.DANA_OPERATORS = ` someone@else.test, ${operator.email.toUpperCase()} `

    const read = await operator.browser.api('/stats')
    expectStatus(read, 200, 'an operator reads the stats')
    const stats = getStatsResponse.parse(read.json())
    expect(stats.weeks).toHaveLength(12)
    expect(stats.people.total).toBeGreaterThanOrEqual(2)
    expect(stats.work_pages.total).toBeGreaterThanOrEqual(1)
    const row = stats.people_list.find((person) => person.email === stranger.email)
    expect(row?.work_pages).toBeGreaterThanOrEqual(1)
    expect(read.body).not.toContain(PAGE)

    const refused = await stranger.browser.api('/stats')
    const unknown = await stranger.browser.api('/no-such-route-ac1546')
    expectStatus(refused, 404, 'a stranger is told the route does not exist')
    expect(refused.json()).toEqual(unknown.json())

    expectStatus(await new TestBrowser(app.origin).api('/stats'), 401, 'no session is refused first')

    process.env.DANA_OPERATORS = ''
    expectStatus(await operator.browser.api('/stats'), 404, 'an empty list admits nobody')
  })
})
