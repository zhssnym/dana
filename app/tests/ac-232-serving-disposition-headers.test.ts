/*
AC-232: given a served file of kind file, then the response carries
X-Content-Type-Options: nosniff and Content-Disposition: attachment; given
a served image, then nosniff and inline.

The serving path's safety rests on one predicate, inline = kind !== 'file'
(routes/files.ts), because kind file is the only kind whose mime is
unconstrained. Nothing else in the suite asserts it, so a regression that
inverted or dropped it would serve member-chosen bytes inline on Dana's own
origin with every criterion green. Proposed by the S14 security review,
ruled in by RFC 0005 change control item 18, pinning behaviour the tree
already has.

Spec: 7.15, 10.2.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { ONE_PIXEL_PNG, upload } from './uploads-harness.js'
import type { RawResponse } from './http-client.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 's14')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

function header(response: RawResponse, name: string): string {
  const value = response.headers[name]
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join(', ')
  return ''
}

async function store(
  owner: Actor,
  folderId: string,
  kind: string,
  name: string,
  type: string,
  bytes: Buffer,
): Promise<string> {
  const stored = await upload(owner, '/files', { kind, folder_id: folderId }, {
    name,
    type,
    bytes,
  })
  expectStatus(stored, 201, `a ${kind} upload must store before serving is judged (spec 7.15)`)
  return String((stored.json() as { id?: unknown }).id)
}

describe('AC-232 the disposition split between kind file and the rest', () => {
  test('kind file serves as an attachment, images inline, nosniff on both', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 's14 ac232 headers')

    const documentId = await store(
      owner,
      folderId,
      'file',
      'notes.html',
      'text/html',
      Buffer.from('<p>ac232 document</p>', 'utf8'),
    )
    const asDocument = await owner.browser.request(`/api/v1/files/${documentId}`)
    expectStatus(asDocument, 200, 'the member is served the file (spec 7.15)')
    expect(
      header(asDocument, 'x-content-type-options'),
      'nosniff must ride every served file',
    ).toBe('nosniff')
    expect(
      header(asDocument, 'content-disposition').startsWith('attachment'),
      `kind file is the one kind whose mime is unconstrained, so it must never render inline; got ${header(asDocument, 'content-disposition')}`,
    ).toBe(true)

    const imageId = await store(
      owner,
      folderId,
      'image',
      'photo.png',
      'image/png',
      ONE_PIXEL_PNG,
    )
    const asImage = await owner.browser.request(`/api/v1/files/${imageId}`)
    expectStatus(asImage, 200, 'the member is served the image (spec 7.15)')
    expect(
      header(asImage, 'x-content-type-options'),
      'nosniff must ride served images too',
    ).toBe('nosniff')
    expect(
      header(asImage, 'content-disposition').startsWith('inline'),
      `a re-encoded raster is safe to render and 9.x draws it inline; got ${header(asImage, 'content-disposition')}`,
    ).toBe(true)
  })
})
