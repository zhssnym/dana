/*
The HTTP client and cookie jar the authentication suite drives the
application with, kept in its own module so a test can use them without
importing the application. AC-114 needs exactly that: it loads a compiled
build after setting environment variables, and a static import of the source
module anywhere in its graph would be hoisted above the assignment and would
settle the question before the test asked it.

node:http rather than fetch, because undici silently drops a Host request
header as a forbidden name and AC-109 turns on crafted Host headers.
*/
import { request as httpRequest } from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'

export interface RawResponse {
  status: number
  headers: IncomingHttpHeaders
  setCookie: readonly string[]
  location: string | null
  contentType: string
  body: string
  json(): unknown
}

export interface RawRequestOptions {
  method?: string
  headers?: Record<string, string>
  /** A Buffer is written raw; the byte length is computed either way. Added
   * for the 7.15 multipart criteria, whose payloads are binary. */
  body?: string | Buffer
  /** Sent verbatim as the Host header; fetch cannot do this. */
  hostHeader?: string
}

export async function rawRequest(
  target: string | URL,
  options: RawRequestOptions = {},
): Promise<RawResponse> {
  const url = typeof target === 'string' ? new URL(target) : target
  const headers: Record<string, string> = { ...options.headers }
  if (options.hostHeader !== undefined) headers.Host = options.hostHeader
  if (options.body !== undefined) {
    headers['content-length'] = String(Buffer.byteLength(options.body))
  }

  return new Promise<RawResponse>((resolve, reject) => {
    const req = httpRequest(
      {
        host: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: options.method ?? 'GET',
        headers,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            setCookie: res.headers['set-cookie'] ?? [],
            location: res.headers.location ?? null,
            contentType: res.headers['content-type'] ?? '',
            body,
            json: () => JSON.parse(body) as unknown,
          })
        })
      },
    )
    req.on('error', reject)
    if (options.body !== undefined) req.write(options.body)
    req.end()
  })
}

/* ------------------------------------------------------------------ *
 * Cookies
 * ------------------------------------------------------------------ */

export interface StoredCookie {
  name: string
  value: string
  /** The Set-Cookie line as sent, which is what AC-110 inspects. */
  raw: string
  httpOnly: boolean
  secure: boolean
  sameSite: string | null
}

interface ParsedCookie extends StoredCookie {
  deleted: boolean
}

export function parseSetCookie(raw: string): ParsedCookie {
  const segments = raw.split(';')
  const first = segments[0] ?? ''
  const equals = first.indexOf('=')
  const name = (equals === -1 ? first : first.slice(0, equals)).trim()
  const value = equals === -1 ? '' : first.slice(equals + 1).trim()

  let httpOnly = false
  let secure = false
  let sameSite: string | null = null
  let expired = false

  for (const segment of segments.slice(1)) {
    const [rawKey, ...rest] = segment.split('=')
    const key = (rawKey ?? '').trim().toLowerCase()
    const attribute = rest.join('=').trim()
    if (key === 'httponly') httpOnly = true
    else if (key === 'secure') secure = true
    else if (key === 'samesite') sameSite = attribute
    else if (key === 'max-age' && Number(attribute) <= 0) expired = true
    else if (key === 'expires') {
      const at = Date.parse(attribute)
      if (!Number.isNaN(at) && at <= Date.now()) expired = true
    }
  }

  return {
    name,
    value,
    raw,
    httpOnly,
    secure,
    sameSite,
    deleted: expired || value === '',
  }
}

/**
 * One browser: a cookie jar plus a transport. Cookies are never sent to the
 * identity provider's origin, matching a real browser and keeping the two
 * origins' cookies from contaminating each other.
 */
export class TestBrowser {
  private readonly jar = new Map<string, StoredCookie>()

  constructor(readonly origin: string) {}

  cookieHeader(): string | undefined {
    if (this.jar.size === 0) return undefined
    return [...this.jar.values()]
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ')
  }

  /** Applies a response's Set-Cookie lines, honoring deletions. */
  absorb(setCookie: readonly string[]): ParsedCookie[] {
    const parsed = setCookie.map(parseSetCookie)
    for (const cookie of parsed) {
      if (cookie.deleted) this.jar.delete(cookie.name)
      else this.jar.set(cookie.name, cookie)
    }
    return parsed
  }

  cookie(name: string): StoredCookie | undefined {
    return this.jar.get(name)
  }

  cookies(): readonly StoredCookie[] {
    return [...this.jar.values()]
  }

  /** Plants a value, which is how AC-108's fixation attempt is expressed. */
  plant(name: string, value: string): void {
    this.jar.set(name, {
      name,
      value,
      raw: `${name}=${value}`,
      httpOnly: false,
      secure: false,
      sameSite: null,
    })
  }

  forget(name: string): void {
    this.jar.delete(name)
  }

  /**
   * A second browser holding this one's cookies as they stand now. AC-105's
   * single-use case needs the jar as it was just before the callback ran, so
   * that the replay differs from the original in nothing but having already
   * happened.
   */
  clone(): TestBrowser {
    const copy = new TestBrowser(this.origin)
    for (const cookie of this.jar.values()) copy.jar.set(cookie.name, cookie)
    return copy
  }

  /**
   * csrf: 'auto' echoes the non-httpOnly cookie's value in X-CSRF-Token, which
   * is the double-submit contract of 11.6; 'omit' sends no header; any other
   * string is sent verbatim, which is how the mismatch cases are written.
   */
  async request(
    path: string,
    options: RawRequestOptions & { csrf?: 'auto' | 'omit' | string } = {},
  ): Promise<RawResponse> {
    const headers: Record<string, string> = { ...options.headers }
    const cookies = this.cookieHeader()
    if (cookies !== undefined) headers.cookie = cookies

    const csrf = options.csrf ?? 'auto'
    if (csrf === 'auto') {
      const token = this.csrfCookie()
      if (token !== undefined) headers['X-CSRF-Token'] = token.value
    } else if (csrf !== 'omit') {
      headers['X-CSRF-Token'] = csrf
    }

    const url = path.startsWith('http') ? path : `${this.origin}${path}`
    const response = await rawRequest(url, { ...options, headers })
    this.absorb(response.setCookie)
    return response
  }

  /** Spec 11.6: the CSRF token rides in a second, non-httpOnly cookie. */
  csrfCookie(): StoredCookie | undefined {
    return this.cookies().find(
      (cookie) => !cookie.httpOnly && cookie.value !== '',
    )
  }

  api(path: string, options?: RawRequestOptions & { csrf?: string }) {
    return this.request(`/api/v1${path}`, options)
  }

  /** body is optional for the bodyless verbs; JSON.stringify(undefined) is
   * undefined, so a GET sends no payload and no content-length. */
  json(
    path: string,
    method: string,
    body?: unknown,
    options: { csrf?: 'auto' | 'omit' | string } = {},
  ): Promise<RawResponse> {
    return this.api(path, {
      method,
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      ...options,
    })
  }
}

