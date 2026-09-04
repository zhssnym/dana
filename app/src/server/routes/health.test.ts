import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, beforeAll, expect, test } from 'vitest'

import { createApp } from '../index.js'
import { recordDatabaseKind, recordSchedulerPass } from './health.js'

let server: Server
let baseUrl: string

beforeAll(() => {
  server = createApp().listen(0)
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${String(address.port)}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
})

test('GET /api/health answers 200 with the build version', async () => {
  const res = await fetch(`${baseUrl}/api/health`)
  expect(res.status).toBe(200)
  const body = (await res.json()) as {
    status: string
    version: string
    secondsSinceLastPass: number | null
    database: string | null
  }
  expect(body.status).toBe('ok')
  expect(body.version).toMatch(/^\d+\.\d+\.\d+$/)
  expect(body.secondsSinceLastPass).toBeNull()
  expect(
    body.database,
    'this app was constructed with no client, so nothing has declared an engine (issue #80)',
  ).toBeNull()
})

test('the engine the seam chose is readable from outside the container', async () => {
  /*
  Issue #80: a production process on the embedded database looked exactly like
  a healthy one from anywhere but Render's own logs, and every spin-down of it
  destroys every row. The boot declares the kind after `createDbClient`, the
  way the scheduler declares a pass, and this is the field that makes the
  condition answerable by a probe.
  */
  recordDatabaseKind('pglite')
  const fallen = await fetch(`${baseUrl}/api/health`)
  expect((await fallen.json() as { database?: unknown }).database).toBe('pglite')

  recordDatabaseKind('postgres')
  const healthy = await fetch(`${baseUrl}/api/health`)
  expect((await healthy.json() as { database?: unknown }).database).toBe('postgres')
})

test('a completed scheduler pass surfaces as an age in seconds', async () => {
  recordSchedulerPass()
  const res = await fetch(`${baseUrl}/api/health`)
  const body = (await res.json()) as { secondsSinceLastPass: number | null }
  expect(body.secondsSinceLastPass).toBeGreaterThanOrEqual(0)
})

test('an unknown API path answers the section 7.0 error envelope, not HTML', async () => {
  const res = await fetch(`${baseUrl}/api/nonexistent`)
  expect(res.status).toBe(404)
  expect(res.headers.get('content-type')).toContain('application/json')
  const body = (await res.json()) as unknown
  expect(body).toEqual({ error: { code: 'not_found', message: 'Not found.' } })
})

test('an unparseable JSON body answers 400 with the error envelope', async () => {
  const res = await fetch(`${baseUrl}/api/nonexistent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  })
  expect(res.status).toBe(400)
  const body = (await res.json()) as unknown
  expect(body).toEqual({
    error: { code: 'bad_request', message: 'Malformed request body.' },
  })
})
