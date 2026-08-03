/*
Discovery memoization, and specifically what happens when the first attempt
fails.

The acceptance suite cannot reach this: its stub issuer always answers, so a
cached rejection is invisible there and stays invisible however many criteria
pass. The issuer here is a few lines of node:http precisely so it can be told
to fail, which is the only way to observe the difference between memoizing a
promise and memoizing a result.

The metadata document is the minimum openid-client 6 accepts: the issuer must
match the URL it was handed byte for byte, and the endpoints have to be
present even though nothing in this file calls them.
*/
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, expect, test } from 'vitest'

import { OidcClient } from './oidc.js'
import type { AuthConfig } from './oidc.js'

interface FlakyIssuer {
  config: AuthConfig
  /** Metadata requests served so far, however they were answered. */
  requests(): number
  /** The next this many metadata requests answer 500. */
  failNext(count: number): void
  close(): Promise<void>
}

const servers: Server[] = []

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

async function startIssuer(): Promise<FlakyIssuer> {
  let served = 0
  let failures = 0

  const server = createServer((req, res) => {
    if (req.url !== '/.well-known/openid-configuration') {
      res.writeHead(404).end()
      return
    }
    served += 1
    if (failures > 0) {
      failures -= 1
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'temporarily_unavailable' }))
      return
    }
    const issuer = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ['code'],
        id_token_signing_alg_values_supported: ['RS256'],
      }),
    )
  })
  servers.push(server)

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`

  return {
    config: {
      issuerUrl: origin,
      clientId: 'test-client',
      clientSecret: 'test-secret',
      appOrigin: 'http://127.0.0.1:1',
      allowInsecureRequests: true,
    },
    requests: () => served,
    failNext: (count) => {
      failures = count
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      }),
  }
}

test('a successful configuration is fetched once and reused', async () => {
  const issuer = await startIssuer()
  const client = new OidcClient(issuer.config)

  const first = await client.configure()
  const second = await client.configure()

  expect(second, 'the second call rebuilt the configuration').toBe(first)
  expect(issuer.requests(), 'discovery ran more than once').toBe(1)
})

test('a transient failure does not disable sign-in for the life of the process', async () => {
  // The finding, made concrete: memoizing the promise rather than the result
  // caches the rejection, and every later sign-in fails identically until
  // somebody restarts the process.
  const issuer = await startIssuer()
  const client = new OidcClient(issuer.config)

  issuer.failNext(1)
  await expect(client.configure()).rejects.toThrow()

  const recovered = await client.configure()
  expect(recovered, 'the retry produced no configuration').toBeDefined()
  expect(
    issuer.requests(),
    'the second call never reached the issuer: the failure was cached',
  ).toBe(2)

  // And the recovered configuration is the one memoized from then on.
  expect(await client.configure()).toBe(recovered)
  expect(issuer.requests()).toBe(2)
})

test('repeated failures each retry, and a later success still sticks', async () => {
  const issuer = await startIssuer()
  const client = new OidcClient(issuer.config)

  issuer.failNext(3)
  for (const attempt of [1, 2, 3]) {
    await expect(
      client.configure(),
      `attempt ${String(attempt)} should have reached the issuer and failed`,
    ).rejects.toThrow()
  }
  expect(issuer.requests()).toBe(3)

  const configuration = await client.configure()
  expect(configuration).toBeDefined()
  expect(await client.configure()).toBe(configuration)
  expect(issuer.requests(), 'the successful result is memoized').toBe(4)
})

test('callers awaiting one failed attempt share its failure, not a stale cache', async () => {
  // Concurrency: three requests arriving together during one cold start make
  // one metadata request, all three see the same failure, and the next
  // request afterwards retries rather than inheriting it.
  const issuer = await startIssuer()
  const client = new OidcClient(issuer.config)

  issuer.failNext(1)
  const results = await Promise.allSettled([
    client.configure(),
    client.configure(),
    client.configure(),
  ])
  expect(results.map((r) => r.status)).toEqual([
    'rejected',
    'rejected',
    'rejected',
  ])
  expect(issuer.requests(), 'concurrent callers each opened their own attempt').toBe(1)

  await expect(client.configure()).resolves.toBeDefined()
  expect(issuer.requests()).toBe(2)
})
