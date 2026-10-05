/*
Issue #550: uploaded bytes must outlive a deploy.

Render's own filesystem is wiped on every deploy, so production keeps bytes
in a private R2 bucket, and a production boot with no durable store refuses
to start rather than accept uploads it will lose. #557 had made production
boot on the temporary directory; that is the behaviour this file now forbids.

The signing is checked against AWS's own published Signature Version 4
example: a wrong signature passes every other test here and fails every
upload in production with a 403.
*/
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { createR2Store, signV4 } from '../../src/server/files/r2-store.js'
import { resolveObjectStore } from '../../src/server/files/store.js'

const R2 = {
  R2_ACCOUNT_ID: 'acct',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'dana-files',
}

describe('choosing the file store at boot', () => {
  it('refuses a production boot with no durable store', () => {
    expect(() => resolveObjectStore({ NODE_ENV: 'production' })).toThrow(/not durable/)
  })

  it('refuses a partial R2 configuration in any environment', () => {
    const { R2_BUCKET: _dropped, ...partial } = R2
    expect(() => resolveObjectStore({ NODE_ENV: 'production', ...partial })).toThrow(/R2_BUCKET/)
    expect(() => resolveObjectStore({ NODE_ENV: 'development', ...partial })).toThrow(/R2_BUCKET/)
  })

  it('starts in production on R2, or on an explicitly named disk', () => {
    expect(() => resolveObjectStore({ NODE_ENV: 'production', ...R2 })).not.toThrow()
    expect(() => resolveObjectStore({ NODE_ENV: 'production', DANA_FILES_DIR: os.tmpdir() })).not.toThrow()
  })

  it('keeps the temporary directory for development and tests', async () => {
    const store = resolveObjectStore({ NODE_ENV: 'test', DANA_FILES_DIR: mkdtempSync(path.join(os.tmpdir(), 'dana-550-')) })
    await store.put('one', Buffer.from('bytes'))
    expect((await store.get('one'))?.toString()).toBe('bytes')
  })
})

describe('the R2 store', () => {
  /* An in-memory bucket that only answers requests signed for it. */
  function fakeR2(): { fetch: typeof fetch; objects: Map<string, Buffer>; seen: string[] } {
    const objects = new Map<string, Buffer>()
    const seen: string[] = []
    const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input))
      const headers = new Headers(init?.headers)
      seen.push(`${String(init?.method)} ${url.host}${url.pathname}`)
      if (!(headers.get('authorization') ?? '').startsWith('AWS4-HMAC-SHA256 Credential=key/')) {
        return new Response('denied', { status: 403 })
      }
      const key = url.pathname
      if (init?.method === 'PUT') {
        objects.set(key, Buffer.from(init.body as Uint8Array))
        return new Response(null, { status: 200 })
      }
      if (init?.method === 'DELETE') {
        objects.delete(key)
        return new Response(null, { status: 204 })
      }
      const bytes = objects.get(key)
      return bytes === undefined ? new Response('NoSuchKey', { status: 404 }) : new Response(new Uint8Array(bytes))
    }
    return { fetch: fake as typeof fetch, objects, seen }
  }

  const config = { endpoint: 'https://acct.r2.cloudflarestorage.com', bucket: 'dana-files', accessKeyId: 'key', secretAccessKey: 'secret' }

  it('puts, reads back, and removes the bytes under the file id', async () => {
    const r2 = fakeR2()
    const store = createR2Store(config, r2.fetch)
    const id = '6f1c6a0e-3b1f-4c55-9a8e-0d3f1b2c4d5e'

    await store.put(id, Buffer.from('picture bytes'))
    expect(r2.objects.get(`/dana-files/${id}`)?.toString()).toBe('picture bytes')
    expect((await store.get(id))?.toString()).toBe('picture bytes')

    await store.remove(id)
    expect(r2.objects.has(`/dana-files/${id}`)).toBe(false)
    expect(await store.get(id)).toBeNull()
    expect(r2.seen[0]).toBe(`PUT acct.r2.cloudflarestorage.com/dana-files/${id}`)
  })

  it('throws on a refused request rather than reporting the file missing', async () => {
    const r2 = fakeR2()
    const store = createR2Store({ ...config, accessKeyId: 'wrong' }, r2.fetch)
    await expect(store.put('x', Buffer.from('b'))).rejects.toThrow(/403/)
    await expect(store.get('x')).rejects.toThrow(/403/)
  })
})

describe('Signature Version 4', () => {
  /* AWS's published example: "Example: GET Object" in the S3 API reference,
     "Signature Calculations for the Authorization Header". */
  it('matches the signature AWS publishes for its GET Object example', () => {
    const headers = signV4({
      method: 'GET',
      url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
      headers: { range: 'bytes=0-9' },
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      service: 's3',
      amzDate: '20130524T000000Z',
    })
    expect(headers.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    )
  })
})
