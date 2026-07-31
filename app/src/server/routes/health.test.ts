import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, beforeAll, expect, test } from 'vitest'

import { createApp } from '../index.js'
import { recordSchedulerPass } from './health.js'

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
  }
  expect(body.status).toBe('ok')
  expect(body.version).toMatch(/^\d+\.\d+\.\d+$/)
  expect(body.secondsSinceLastPass).toBeNull()
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
