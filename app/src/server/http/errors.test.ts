import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import express from 'express'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { deleteMeBody, patchMeBody } from '../../shared/me.js'
import { errorBody, sendError, sendValidationError } from './errors.js'

/*
The helpers are driven through a real express app, the way route modules
will call them, so the wire shape is what gets asserted. The demo routes
follow the errors.ts convention: safeParse, sendValidationError, delegate.
*/
let server: Server
let baseUrl: string

beforeAll(() => {
  const app = express()
  app.use(express.json())
  app.get('/taxonomy-demo', (_req, res) => {
    sendError(res, 404, 'not_found', 'Not found.')
  })
  app.delete('/validate-demo', (req, res) => {
    const parsed = deleteMeBody.safeParse(req.body)
    if (!parsed.success) {
      sendValidationError(res, parsed.error)
      return
    }
    res.status(204).end()
  })
  app.patch('/multi-demo', (req, res) => {
    // A body failing two schemas' worth of fields at once, to prove the
    // message carries every failing field, not only the first (10.3).
    const parsed = patchMeBody.and(deleteMeBody).safeParse(req.body)
    if (!parsed.success) {
      sendValidationError(res, parsed.error)
      return
    }
    res.status(200).json(parsed.data)
  })
  server = app.listen(0)
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${String(address.port)}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
})

test('errorBody builds exactly the 7.0 envelope', () => {
  expect(errorBody('conflict', 'Already a member.')).toEqual({
    error: { code: 'conflict', message: 'Already a member.' },
  })
})

test('sendError answers the status and the envelope, nothing more', async () => {
  const res = await fetch(`${baseUrl}/taxonomy-demo`)
  expect(res.status).toBe(404)
  expect(res.headers.get('content-type')).toContain('application/json')
  expect(await res.json()).toEqual({
    error: { code: 'not_found', message: 'Not found.' },
  })
})

describe('sendValidationError', () => {
  test('answers 422, code validation_failed, with the field named (10.3)', async () => {
    const res = await fetch(`${baseUrl}/validate-demo`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: 'delete' }),
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('validation_failed')
    expect(body.error.message).toContain('confirm')
  })

  test('a valid body passes through the convention untouched', async () => {
    const res = await fetch(`${baseUrl}/validate-demo`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    })
    expect(res.status).toBe(204)
  })

  test('every failing field is named in one answer', async () => {
    const res = await fetch(`${baseUrl}/multi-demo`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timezone: 'Not/AZone', confirm: 'wrong' }),
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toContain('timezone')
    expect(body.error.message).toContain('confirm')
  })
})
