/*
The development login of 11.6, from both sides of its flag, and the loader
mechanism 11.15 warns about.

AC-114 owns the criterion and asserts it against a compiled production build,
which only the boot file can construct; this file covers what a module test
can: that the flag is read at construction time rather than at module load,
that the route exists when it is set and does not when it is not, and that a
session made this way is a real one. The name avoids matching
tsconfig.build.json's dev-login* exclusion, so nothing about the exclusion is
in question here.
*/
import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { sql } from 'drizzle-orm'
import express from 'express'
import { afterAll, beforeAll, expect, test } from 'vitest'

import type { DbClient } from '../../../db/client.js'
import { cleanupUsers, createTestDb, rows } from '../../../tests/support/helpers.js'
import { TestBrowser } from '../../../tests/support/http-client.js'
import { createAuthRouter } from './router.js'

let dbClient: DbClient
const servers: Server[] = []
const created: string[] = []

/** One application, built with the flag in whatever state the case wants. */
async function appWithFlag(value: string | undefined): Promise<string> {
  const previous = process.env.DANA_DEV_LOGIN
  if (value === undefined) delete process.env.DANA_DEV_LOGIN
  else process.env.DANA_DEV_LOGIN = value
  let router
  try {
    // 11.6: the flag is read here, at createApp() call time, never at module
    // load. Both applications in this file come from one loaded module.
    router = createAuthRouter({ dbClient })
  } finally {
    if (previous === undefined) delete process.env.DANA_DEV_LOGIN
    else process.env.DANA_DEV_LOGIN = previous
  }

  const app = express()
  app.use(express.json())
  app.use('/api/v1', router)
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } })
  })
  const server = app.listen(0, '127.0.0.1')
  servers.push(server)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}

beforeAll(async () => {
  dbClient = await createTestDb()
}, 60_000)

afterAll(async () => {
  for (const server of servers) {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  for (const id of created) {
    await dbClient.db.execute(sql`DELETE FROM folder_members WHERE user_id = ${id}`)
  }
  await cleanupUsers(dbClient.db, created)
  await dbClient.close()
})

test('with the flag set, dev-login provisions and signs in', async () => {
  const origin = await appWithFlag('1')
  const browser = new TestBrowser(origin)
  const sub = `devlogin-${randomUUID()}`

  const response = await browser.request(`${origin}/api/v1/auth/dev-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sub,
      email: `dev@${sub}.test`,
      timezone: 'Asia/Karachi',
    }),
  })
  expect(
    response.status,
    `dev-login must answer 200 with the flag set: ${response.body}`,
  ).toBe(200)

  const userId = String((response.json() as { user_id: string }).user_id)
  created.push(userId)

  // The same session machinery as a real sign-in, so Playwright's fixtures
  // exercise the real thing (11.10).
  const me = await browser.request(`${origin}/api/v1/me`)
  expect(me.status, 'the dev-login session does not authenticate').toBe(200)
  expect((me.json() as { user: { id: string } }).user.id).toBe(userId)

  // It provisions through the same transaction: one Inbox, one settings row.
  const folders = await rows(
    dbClient.db,
    sql`SELECT count(*)::int AS n FROM folders WHERE owner_id = ${userId}`,
  )
  expect(Number(folders[0]?.n)).toBe(1)
  const settings = await rows(
    dbClient.db,
    sql`SELECT count(*)::int AS n FROM user_settings WHERE user_id = ${userId}`,
  )
  expect(Number(settings[0]?.n)).toBe(1)

  // 11.6: the optional timezone carries the 7.1 tz semantics.
  const user = await rows(
    dbClient.db,
    sql`SELECT timezone FROM users WHERE id = ${userId}`,
  )
  expect(user[0]?.timezone).toBe('Asia/Karachi')
})

test('an absent timezone means UTC, and an invalid one is treated as absent', async () => {
  const origin = await appWithFlag('1')
  for (const [body, expected] of [
    [{}, 'UTC'],
    [{ timezone: 'Not/AZone' }, 'UTC'],
    [{ timezone: '+05:30' }, 'UTC'],
  ] as const) {
    const response = await new TestBrowser(origin).request(
      `${origin}/api/v1/auth/dev-login`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
    expect(response.status).toBe(200)
    const userId = String((response.json() as { user_id: string }).user_id)
    created.push(userId)
    const user = await rows(
      dbClient.db,
      sql`SELECT timezone FROM users WHERE id = ${userId}`,
    )
    expect(user[0]?.timezone, `body ${JSON.stringify(body)}`).toBe(expected)
  }
})

test('without the flag, the route does not exist', async () => {
  const origin = await appWithFlag(undefined)
  const response = await new TestBrowser(origin).request(
    `${origin}/api/v1/auth/dev-login`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    },
  )
  expect(response.status).toBe(404)
})

test('the flag is read per construction, not once per process', async () => {
  // The property AC-114's buildApp exists to check: one loaded module, two
  // applications, two different answers.
  const enabled = await appWithFlag('1')
  const disabled = await appWithFlag(undefined)

  const on = await new TestBrowser(enabled).request(
    `${enabled}/api/v1/auth/dev-login`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
  )
  expect(on.status).toBe(200)
  created.push(String((on.json() as { user_id: string }).user_id))

  const off = await new TestBrowser(disabled).request(
    `${disabled}/api/v1/auth/dev-login`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
  )
  expect(off.status).toBe(404)
})
