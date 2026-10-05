/*
Cloudflare R2 behind the ObjectStore interface (issue #550).

Render's ordinary filesystem is wiped on every deploy, so production keeps
uploaded bytes in an R2 bucket instead. The bucket stays private: nothing
here makes an object public or hands out a URL, and every read still goes
through `/api/v1/files/:id`, which checks access against the files table
before it asks this store for bytes.

R2 speaks the S3 API, so each call is one signed HTTP request (AWS Signature
Version 4, region `auto`). The signer is written out here rather than pulled
in as an SDK: three verbs on one bucket do not need a dependency, and the
signing is pinned against AWS's published example in
`tests/guards/guard-object-store.test.ts`.

Credentials come only from the environment (`resolveObjectStore` in
`store.ts`) and never reach the client.
*/
import { createHash, createHmac } from 'node:crypto'

import type { ObjectStore } from './store.js'

export interface R2Config {
  /** `https://<account id>.r2.cloudflarestorage.com`, or any S3-compatible origin. */
  readonly endpoint: string
  readonly bucket: string
  readonly accessKeyId: string
  readonly secretAccessKey: string
}

const REGION = 'auto'
const SERVICE = 's3'

const sha256Hex = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex')
const hmac = (key: string | Buffer, data: string): Buffer => createHmac('sha256', key).update(data).digest()

/** S3's URI encoding of one path segment: RFC 3986 unreserved characters stay. */
function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

export interface SignInput {
  readonly method: string
  /** Absolute URL; its path must already be encoded. */
  readonly url: URL
  /** Headers to sign, lower-case names. `host`, `x-amz-date` and
   * `x-amz-content-sha256` are added by the signer. */
  readonly headers?: Readonly<Record<string, string>>
  readonly payloadHash: string
  readonly accessKeyId: string
  readonly secretAccessKey: string
  readonly region: string
  readonly service: string
  /** `YYYYMMDDTHHMMSSZ`. */
  readonly amzDate: string
}

/** The headers of a Signature Version 4 request, Authorization included.
 * Exported so the signing can be checked against AWS's own example. */
export function signV4(input: SignInput): Record<string, string> {
  const day = input.amzDate.slice(0, 8)
  const headers: Record<string, string> = {
    ...input.headers,
    host: input.url.host,
    'x-amz-content-sha256': input.payloadHash,
    'x-amz-date': input.amzDate,
  }
  const names = Object.keys(headers).map((name) => name.toLowerCase()).sort()
  const canonicalHeaders = names.map((name) => `${name}:${(headers[name] ?? '').trim()}\n`).join('')
  const signedHeaders = names.join(';')
  const canonicalQuery = [...input.url.searchParams.entries()]
    .map(([k, v]) => `${encodeSegment(k)}=${encodeSegment(v)}`)
    .sort()
    .join('&')
  const canonicalRequest = [
    input.method,
    input.url.pathname,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join('\n')
  const scope = `${day}/${input.region}/${input.service}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', input.amzDate, scope, sha256Hex(canonicalRequest)].join('\n')
  const key = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), input.service), 'aws4_request')
  const signature = createHmac('sha256', key).update(stringToSign).digest('hex')
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
}

function amzDateOf(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function createR2Store(config: R2Config, fetchImpl: typeof fetch = fetch): ObjectStore {
  const base = config.endpoint.replace(/\/+$/, '')
  // The id is a uuid minted by the database, never caller input; it is
  // encoded anyway, so a key can never reach outside the bucket.
  const urlOf = (id: string): URL => new URL(`${base}/${encodeSegment(config.bucket)}/${encodeSegment(id)}`)

  const send = async (method: 'PUT' | 'GET' | 'DELETE', id: string, body?: Buffer): Promise<Response> => {
    const url = urlOf(id)
    const headers = signV4({
      method,
      url,
      headers: body === undefined ? {} : { 'content-type': 'application/octet-stream' },
      payloadHash: sha256Hex(body ?? ''),
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: REGION,
      service: SERVICE,
      amzDate: amzDateOf(new Date()),
    })
    // `host` is the connection's to set; fetch refuses it as a header.
    delete headers.host
    return fetchImpl(url, { method, headers, ...(body === undefined ? {} : { body: new Uint8Array(body) }) })
  }

  /* A failure that is not "no such object" (bad credentials, a missing
     bucket, R2 down) is an operational fault, so it throws and surfaces as a
     500 with the status in the log, rather than reading as a missing file. */
  const fail = async (verb: string, response: Response): Promise<never> => {
    const detail = (await response.text().catch(() => '')).slice(0, 200)
    throw new Error(`R2 ${verb} failed: ${String(response.status)} ${detail}`)
  }

  return {
    async put(id, bytes) {
      const response = await send('PUT', id, bytes)
      if (!response.ok) await fail('put', response)
    },
    async get(id) {
      const response = await send('GET', id)
      if (response.status === 404) {
        await response.body?.cancel()
        return null
      }
      if (!response.ok) return fail('get', response)
      return Buffer.from(await response.arrayBuffer())
    },
    async remove(id) {
      const response = await send('DELETE', id)
      // S3 answers 204 whether or not the object existed.
      if (!response.ok && response.status !== 404) await fail('remove', response)
    },
  }
}
