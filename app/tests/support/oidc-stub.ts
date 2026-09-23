/*
A hostile stand-in for Google's OpenID Connect provider. AC-105 to AC-115
exist because the authentication module of spec 11.6 has no other reviewer, and they are only
testable if requests and tokens can be crafted: a wrong state, a replayed
nonce, a mismatched PKCE verifier, an unverified email, a token signed with
the wrong key. That is what this file is for. The authentication module must
pass against it unmodified, and fixing a failure never means editing this
stub.

It signs with node:crypto and depends on nothing outside the standard
library, so it stays usable whatever the implementation picks up.

Correctness details that are not obvious, each of which would otherwise make
the whole suite fail for a stub bug rather than an implementation one:

- The token response carries token_type. oauth4webapi, under openid-client 6,
  rejects a token response without it, and every sign-in would fail.
- Client authentication is accepted both as client_secret_post (openid-client
  6's default) and as client_secret_basic, so the stub does not dictate the
  implementation's choice by refusing the other one.
- The discovery document's issuer is byte-identical to the URL handed to the
  implementation, trailing slash included, because openid-client compares them
  exactly.
- authorization_response_iss_parameter_supported is deliberately not
  advertised: advertising it obliges the stub to return iss on every callback
  redirect, and openid-client enforces that.
- An authorization request without a PKCE challenge is refused (AC-107). This
  is what stops "the normal flow completes" from being satisfiable by an
  implementation that never sends one.
*/
import {
  createHash,
  createHmac,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign as cryptoSign,
} from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface StubIdentity {
  sub: string
  email: string
  email_verified: boolean
  name: string
  picture: string
}

// null on a claim means omit it entirely, which is how the missing-sub and
// missing-email attacks are expressed.
export interface IdTokenOverrides {
  nonce?: string | null
  aud?: string | null
  iss?: string | null
  sub?: string | null
  email?: string | null
  expiresInSeconds?: number
  alg?: 'RS256' | 'none' | 'HS256'
  rogueKey?: boolean
}

export interface OidcStub {
  issuerUrl: string
  clientId: string
  clientSecret: string
  authorizationEndpoint: string
  tokenEndpoint: string
  /** Identity returned from here on. Unspecified fields keep their defaults. */
  nextIdentity(identity?: Partial<StubIdentity>): StubIdentity
  currentIdentity(): StubIdentity
  /** Applies to the next authorization only. */
  overrideNextIdToken(overrides: IdTokenOverrides): void
  /** The next authorization redirects back with error= and no code. */
  failNextAuthorization(error: string): void
  /**
   * A fresh, valid code bound to the most recent authorization. Lets a replay
   * present a consumed state with a code that is not itself the reason for
   * refusal, so AC-105 pins state single-use rather than code single-use.
   */
  mintExtraCode(): string
  /** Drives an authorization directly, without the application in the path. */
  authorize(params: {
    redirectUri: string
    codeChallenge?: string
    nonce?: string
    state?: string
  }): Promise<{ code: string | null; error: string | null; state: string | null }>
  /** Calls the token endpoint directly. */
  exchangeCode(params: {
    code: string
    codeVerifier?: string
    redirectUri: string
  }): Promise<{ status: number; body: Record<string, unknown> }>
  /** Every access, refresh, and ID token this stub has ever issued (AC-115). */
  issuedTokens(): readonly string[]
  /** Every authorization request URL the application has sent here. */
  authorizationRequests(): readonly URL[]
  close(): Promise<void>
}

interface PendingAuthorization {
  redirectUri: string
  codeChallenge: string
  nonce: string | undefined
  identity: StubIdentity
  overrides: IdTokenOverrides | undefined
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function encodeJson(value: unknown): string {
  return base64url(JSON.stringify(value))
}

export function pkceChallengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function randomVerifier(): string {
  return randomBytes(32).toString('base64url')
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

export async function startOidcStub(): Promise<OidcStub> {
  const signingKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const rogueKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const keyId = `stub-${randomUUID()}`
  const clientId = `dana-test-client-${randomUUID()}`
  const clientSecret = `dana-test-secret-${randomUUID()}`

  const codes = new Map<string, PendingAuthorization>()
  const consumedCodes = new Set<string>()
  const issued: string[] = []
  const requests: URL[] = []
  let lastAuthorization: PendingAuthorization | undefined
  let pendingOverrides: IdTokenOverrides | undefined
  let pendingAuthorizationError: string | undefined

  let identity: StubIdentity = {
    sub: `google-sub-${randomUUID()}`,
    email: `person-${randomUUID()}@example.test`,
    email_verified: true,
    name: 'Test Person',
    picture: 'https://example.test/avatar.png',
  }

  const server: Server = createServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      sendJson(res, 500, {
        error: 'stub_failure',
        error_description: String(error),
      })
    })
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address() as AddressInfo
  const issuerUrl = `http://127.0.0.1:${String(port)}`

  function publicJwk(): Record<string, unknown> {
    const jwk = signingKey.publicKey.export({ format: 'jwk' }) as Record<
      string,
      unknown
    >
    return { ...jwk, kid: keyId, alg: 'RS256', use: 'sig' }
  }

  function signIdToken(
    pending: PendingAuthorization,
  ): string {
    const overrides = pending.overrides ?? {}
    const alg = overrides.alg ?? 'RS256'
    const nowSeconds = Math.floor(Date.now() / 1000)

    const claims: Record<string, unknown> = {
      iss: issuerUrl,
      aud: clientId,
      sub: pending.identity.sub,
      email: pending.identity.email,
      email_verified: pending.identity.email_verified,
      name: pending.identity.name,
      picture: pending.identity.picture,
      iat: nowSeconds,
      exp: nowSeconds + (overrides.expiresInSeconds ?? 300),
    }
    if (pending.nonce !== undefined) claims.nonce = pending.nonce

    // A null override removes the claim; any other value replaces it. This is
    // how "an ID token whose nonce does not match" (AC-106) and the
    // missing-claim attacks are both expressed through one mechanism.
    for (const claim of ['nonce', 'aud', 'iss', 'sub', 'email'] as const) {
      const override = overrides[claim]
      if (override === undefined) continue
      if (override === null) {
        delete claims[claim]
      } else {
        claims[claim] = override
      }
    }

    const header = encodeJson({ alg, typ: 'JWT', kid: keyId })
    const payload = encodeJson(claims)
    const signingInput = `${header}.${payload}`

    if (alg === 'none') {
      return `${signingInput}.`
    }
    if (alg === 'HS256') {
      // The classic algorithm-confusion attack: an HMAC keyed with the client
      // secret, which an implementation that trusts the header's alg would
      // verify successfully.
      const mac = createHmac('sha256', clientSecret).update(signingInput).digest()
      return `${signingInput}.${base64url(mac)}`
    }
    const key: KeyObject = overrides.rogueKey
      ? rogueKey.privateKey
      : signingKey.privateKey
    const signature = cryptoSign('sha256', Buffer.from(signingInput), key)
    return `${signingInput}.${base64url(signature)}`
  }

  function handleDiscovery(res: ServerResponse): void {
    sendJson(res, 200, {
      issuer: issuerUrl,
      authorization_endpoint: `${issuerUrl}/authorize`,
      token_endpoint: `${issuerUrl}/token`,
      jwks_uri: `${issuerUrl}/jwks`,
      userinfo_endpoint: `${issuerUrl}/userinfo`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'email', 'profile'],
      claims_supported: ['sub', 'email', 'email_verified', 'name', 'picture'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: [
        'client_secret_post',
        'client_secret_basic',
      ],
    })
  }

  function handleAuthorize(url: URL, res: ServerResponse): void {
    requests.push(url)
    const params = url.searchParams
    const redirectUri = params.get('redirect_uri')
    const state = params.get('state')

    if (redirectUri === null) {
      sendJson(res, 400, {
        error: 'invalid_request',
        error_description: 'redirect_uri is required',
      })
      return
    }

    const redirect = (query: Record<string, string>): void => {
      const target = new URL(redirectUri)
      for (const [key, value] of Object.entries(query)) {
        target.searchParams.set(key, value)
      }
      if (state !== null) target.searchParams.set('state', state)
      res.writeHead(302, { location: target.toString() })
      res.end()
    }

    if (pendingAuthorizationError !== undefined) {
      const error = pendingAuthorizationError
      pendingAuthorizationError = undefined
      redirect({ error })
      return
    }

    if (params.get('client_id') !== clientId) {
      sendJson(res, 400, {
        error: 'invalid_client',
        error_description: 'unknown client_id',
      })
      return
    }
    if (params.get('response_type') !== 'code') {
      redirect({ error: 'unsupported_response_type' })
      return
    }

    const codeChallenge = params.get('code_challenge')
    // Refusing here is what gives AC-107 its teeth: an implementation that
    // omits PKCE cannot reach a successful sign-in at all.
    if (codeChallenge === null || params.get('code_challenge_method') !== 'S256') {
      redirect({ error: 'invalid_request' })
      return
    }

    const code = `code-${randomUUID()}`
    const nonce = params.get('nonce')
    const pending: PendingAuthorization = {
      redirectUri,
      codeChallenge,
      nonce: nonce ?? undefined,
      identity,
      overrides: pendingOverrides,
    }
    pendingOverrides = undefined
    codes.set(code, pending)
    lastAuthorization = pending
    redirect({ code })
  }

  function clientAuthOk(
    req: IncomingMessage,
    body: URLSearchParams,
  ): boolean {
    const header = req.headers.authorization
    if (header !== undefined && header.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
      const separator = decoded.indexOf(':')
      const id = decodeURIComponent(decoded.slice(0, separator))
      const secret = decodeURIComponent(decoded.slice(separator + 1))
      return id === clientId && secret === clientSecret
    }
    return (
      body.get('client_id') === clientId &&
      body.get('client_secret') === clientSecret
    )
  }

  async function handleToken(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = new URLSearchParams(await readBody(req))

    if (!clientAuthOk(req, body)) {
      sendJson(res, 401, {
        error: 'invalid_client',
        error_description: 'client authentication failed',
      })
      return
    }
    if (body.get('grant_type') !== 'authorization_code') {
      sendJson(res, 400, { error: 'unsupported_grant_type' })
      return
    }

    const code = body.get('code') ?? ''
    const pending = codes.get(code)
    if (pending === undefined) {
      sendJson(res, 400, {
        error: 'invalid_grant',
        error_description: consumedCodes.has(code)
          ? 'authorization code already redeemed'
          : 'unknown authorization code',
      })
      return
    }

    const verifier = body.get('code_verifier')
    if (verifier === null || pkceChallengeFor(verifier) !== pending.codeChallenge) {
      sendJson(res, 400, {
        error: 'invalid_grant',
        error_description: 'PKCE verifier does not match the challenge',
      })
      return
    }

    const redirectUri = body.get('redirect_uri')
    if (redirectUri !== null && redirectUri !== pending.redirectUri) {
      sendJson(res, 400, {
        error: 'invalid_grant',
        error_description: 'redirect_uri does not match the authorization',
      })
      return
    }

    codes.delete(code)
    consumedCodes.add(code)

    // Distinctive values, because AC-115 sweeps the whole database for them.
    const accessToken = `stub-access-token-${randomUUID()}`
    const refreshToken = `stub-refresh-token-${randomUUID()}`
    const idToken = signIdToken(pending)
    issued.push(accessToken, refreshToken, idToken)

    sendJson(res, 200, {
      access_token: accessToken,
      refresh_token: refreshToken,
      id_token: idToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid email profile',
    })
  }

  async function handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url ?? '/', issuerUrl)
    switch (url.pathname) {
      case '/.well-known/openid-configuration':
        handleDiscovery(res)
        return
      case '/authorize':
        handleAuthorize(url, res)
        return
      case '/token':
        await handleToken(req, res)
        return
      case '/jwks':
        sendJson(res, 200, { keys: [publicJwk()] })
        return
      case '/userinfo':
        sendJson(res, 200, { ...identity })
        return
      default:
        sendJson(res, 404, { error: 'not_found' })
    }
  }

  return {
    issuerUrl,
    clientId,
    clientSecret,
    authorizationEndpoint: `${issuerUrl}/authorize`,
    tokenEndpoint: `${issuerUrl}/token`,

    nextIdentity(next = {}) {
      identity = { ...identity, ...next }
      return identity
    },

    currentIdentity() {
      return identity
    },

    overrideNextIdToken(overrides) {
      pendingOverrides = overrides
    },

    failNextAuthorization(error) {
      pendingAuthorizationError = error
    },

    mintExtraCode() {
      if (lastAuthorization === undefined) {
        throw new Error('mintExtraCode called before any authorization')
      }
      const code = `code-${randomUUID()}`
      codes.set(code, lastAuthorization)
      return code
    },

    async authorize({ redirectUri, codeChallenge, nonce, state }) {
      const target = new URL(`${issuerUrl}/authorize`)
      target.searchParams.set('client_id', clientId)
      target.searchParams.set('response_type', 'code')
      target.searchParams.set('redirect_uri', redirectUri)
      target.searchParams.set('scope', 'openid email profile')
      if (codeChallenge !== undefined) {
        target.searchParams.set('code_challenge', codeChallenge)
        target.searchParams.set('code_challenge_method', 'S256')
      }
      if (nonce !== undefined) target.searchParams.set('nonce', nonce)
      if (state !== undefined) target.searchParams.set('state', state)

      const response = await fetch(target, { redirect: 'manual' })
      const location = response.headers.get('location')
      if (location === null) {
        return { code: null, error: 'no_redirect', state: null }
      }
      const back = new URL(location)
      return {
        code: back.searchParams.get('code'),
        error: back.searchParams.get('error'),
        state: back.searchParams.get('state'),
      }
    },

    async exchangeCode({ code, codeVerifier, redirectUri }) {
      const form = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      })
      if (codeVerifier !== undefined) form.set('code_verifier', codeVerifier)
      const response = await fetch(`${issuerUrl}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
      })
      return {
        status: response.status,
        body: (await response.json()) as Record<string, unknown>,
      }
    },

    issuedTokens() {
      return issued
    },

    authorizationRequests() {
      return requests
    },

    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    },
  }
}
