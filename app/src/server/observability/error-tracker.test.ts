import type { AddressInfo } from 'node:net'

import express from 'express'
import { afterEach, expect, test } from 'vitest'

import { createSecurityLogger } from '../security/log.js'
import type { ErrorTracker } from './error-tracker.js'
import { sanitizedError } from './error-tracker.js'
import { createRequestErrorHandler } from './request-errors.js'

let server: ReturnType<express.Express['listen']> | undefined

afterEach(async () => {
  if (server === undefined) return
  await new Promise<void>((resolve) => server?.close(() => resolve()))
  server = undefined
})

test('AC-104: a deliberately thrown server error reaches the tracker', async () => {
  const captured: unknown[] = []
  const tracker: ErrorTracker = {
    captureException: (error) => captured.push(error),
    // The interface's second path, unused here: issue #80 needs a condition
    // that is not an exception to reach the same tracker.
    captureMessage: () => undefined,
  }
  const sink = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  }
  const app = express()
  app.get('/deliberate-error', () => {
    throw new Error('deliberate test error')
  })
  app.use(createRequestErrorHandler(createSecurityLogger(sink), tracker))
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server?.once('listening', resolve))
  const { port } = server.address() as AddressInfo

  const response = await fetch(
    `http://127.0.0.1:${String(port)}/deliberate-error`,
  )
  expect(response.status).toBe(500)
  expect(captured).toHaveLength(1)
})

test('the Sentry copy strips the original error message', () => {
  const secret = 'private title and invitee@example.test'
  expect(JSON.stringify(sanitizedError(new Error(secret)))).not.toContain(secret)
  expect(sanitizedError(new Error(secret)).stack).not.toContain(secret)
})
