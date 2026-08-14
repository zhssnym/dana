import type { AddressInfo } from 'node:net'

import express from 'express'
import type { RequestHandler } from 'express'
import { afterEach, describe, expect, test } from 'vitest'

import { createRateLimits, RATE_LIMIT_POLICY } from './rate-limit.js'

const servers: ReturnType<express.Express['listen']>[] = []

async function probe(handler: RequestHandler, count: number): Promise<Response[]> {
  const app = express()
  app.use(handler)
  app.all('/probe', (_req, res) => res.status(204).end())
  const server = app.listen(0, '127.0.0.1')
  servers.push(server)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const { port } = server.address() as AddressInfo
  const responses: Response[] = []
  for (let index = 0; index < count; index += 1) {
    responses.push(
      await fetch(`http://127.0.0.1:${String(port)}/probe`, { method: 'POST' }),
    )
  }
  return responses
}

async function probeUsers(
  handler: RequestHandler,
  users: string[],
): Promise<Response[]> {
  const app = express()
  app.use(handler)
  app.all('/probe', (_req, res) => res.status(204).end())
  const server = app.listen(0, '127.0.0.1')
  servers.push(server)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const { port } = server.address() as AddressInfo
  const responses: Response[] = []
  for (const user of users) {
    responses.push(
      await fetch(`http://127.0.0.1:${String(port)}/probe`, {
        method: 'POST',
        headers: { 'x-test-user': user },
      }),
    )
  }
  return responses
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  )
})

function expectLimited(response: Response): void {
  expect(response.status).toBe(429)
  expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0)
}

function expectOnlyLastLimited(responses: Response[]): void {
  expect(responses.slice(0, -1).every((response) => response.status === 204)).toBe(
    true,
  )
  expectLimited(responses.at(-1) as Response)
}

describe('P9 rate-limit policy', () => {
  test('AC-101: the sixth invite in one minute is refused', async () => {
    const limits = createRateLimits({
      keyFor: () => 'user-a',
      limits: { invitePerDay: 100 },
    })
    const responses = await probe(
      limits.invitesPerMinute,
      RATE_LIMIT_POLICY.invitePerMinute + 1,
    )
    expectOnlyLastLimited(responses)
  })

  test('AC-101: the twenty-first invite in one day is refused', async () => {
    const limits = createRateLimits({ keyFor: () => 'user-b' })
    const responses = await probe(
      limits.invitesPerDay,
      RATE_LIMIT_POLICY.invitePerDay + 1,
    )
    expectOnlyLastLimited(responses)
  })

  test('AC-101: invite quotas are isolated per user', async () => {
    const limits = createRateLimits({
      keyFor: (req) => req.get('x-test-user') ?? 'missing',
      limits: { invitePerDay: 100 },
    })
    const responses = await probeUsers(limits.invitesPerMinute, [
      ...Array.from({ length: RATE_LIMIT_POLICY.invitePerMinute }, () => 'a'),
      'b',
      'a',
    ])
    expect(responses.at(-2)?.status).toBe(204)
    expectLimited(responses.at(-1) as Response)
  })

  test('search and general mutation quotas use their frozen limits', async () => {
    const search = createRateLimits({ keyFor: () => 'user-c' })
    const searchResponses = await probe(
      search.search,
      RATE_LIMIT_POLICY.searchPerMinute + 1,
    )
    expectOnlyLastLimited(searchResponses)

    const mutations = createRateLimits({ keyFor: () => 'user-d' })
    const mutationResponses = await probe(
      mutations.generalMutations,
      RATE_LIMIT_POLICY.mutationsPerMinute + 1,
    )
    expectOnlyLastLimited(mutationResponses)
  })
})
