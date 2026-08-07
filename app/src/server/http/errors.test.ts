import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import express from 'express'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { z } from 'zod'

import { deleteMeBody, patchMeBody } from '../../shared/me.js'
import {
  errorBody,
  sendError,
  sendFieldValidationError,
  sendValidationError,
} from './errors.js'

/*
The pair the two routes at the bottom compare. P4 produces the first 422 in
this surface that no schema can state: Q3C's range is a relation between start
and end, measured by the calendar arithmetic of src/server/time, which decides
which of the two rules broke and leaves naming the field and choosing the
status to the route. A caller must not be able to tell which validator refused
them, so the two sentences are asserted identical rather than left to two call
sites to keep in step by eye.
*/
const RANGE_PROBLEMS = [
  { field: 'start', message: 'must not be after end' },
  { field: 'end', message: 'must be at most 62 days after start' },
]

const rangeShaped = z.object({
  start: z.string({ error: 'must not be after end' }),
  end: z.string({ error: 'must be at most 62 days after start' }),
})

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
  // The two producers of one sentence, driven side by side: the same two
  // fields with the same two messages, once through a schema and once by
  // hand, the way the calendar range will answer.
  app.get('/hand-built-demo', (_req, res) => {
    sendFieldValidationError(res, RANGE_PROBLEMS)
  })
  app.get('/schema-built-demo', (_req, res) => {
    const parsed = rangeShaped.safeParse({})
    if (!parsed.success) {
      sendValidationError(res, parsed.error)
      return
    }
    res.status(200).end()
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

describe('sendFieldValidationError, for the rules no schema can state', () => {
  test('answers the same 422 and code as a schema failure', async () => {
    const res = await fetch(`${baseUrl}/hand-built-demo`)
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('validation_failed')
    expect(body.error.message).toBe(
      'start: must not be after end; end: must be at most 62 days after start.',
    )
  })

  test('and the identical sentence, field for field', async () => {
    /*
    The assertion this pair exists for. Both routes refuse the same two fields
    with the same two messages, and a caller reads one sentence either way.
    Red-proven against the previous shape of this module, where
    sendValidationError formatted the message inline: with the hand-built path
    joining on ", " or omitting the closing full stop, this case fails while
    every other case in this file stays green, which is exactly the drift a
    second formatter introduces.
    */
    const [hand, schema] = await Promise.all([
      fetch(`${baseUrl}/hand-built-demo`),
      fetch(`${baseUrl}/schema-built-demo`),
    ])
    expect(await schema.json()).toEqual(await hand.json())
  })
})
