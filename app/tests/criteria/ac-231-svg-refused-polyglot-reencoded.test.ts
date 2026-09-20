/*
AC-231: given an upload declaring an image kind with mime image/svg+xml,
then 422; and given a raster upload whose bytes carry an HTML tail behind a
valid image, then what is served back is re-encoded with no tail surviving.

The RASTER_MIMES allowlist and sharp's re-encode are the whole defence
against a scriptable document on Dana's own origin: SVG decodes like an
image and serves like a document, and a GIF-then-HTML polyglot is an image
to the decoder and a page to a sniffing renderer. AC-194 exercises only
application/pdf, which is not the attack. Proposed by the S14 security
review, ruled in by RFC 0005 change control item 18, pinning behaviour the
tree already has.

Spec: 4.16, 7.15, 10.3.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { ONE_PIXEL_PNG, upload } from '../support/uploads-harness.js'

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

const SVG_DOCUMENT = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>document.title="owned"</script></svg>',
  'utf8',
)

const HTML_TAIL = '<html><script>document.title="ac231-owned"</script></html>'

describe('AC-231 image kinds admit raster only, and raster is re-encoded', () => {
  test('image/svg+xml is refused 422 for an image kind', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 's14 ac231 svg')

    const refused = await upload(
      owner,
      '/files',
      { kind: 'image', folder_id: folderId },
      { name: 'vector.svg', type: 'image/svg+xml', bytes: SVG_DOCUMENT },
    )
    expectStatus(
      refused,
      422,
      'SVG must be refused for image kinds: it decodes like an image and serves like a scriptable document (spec 4.16)',
    )
  })

  test('a PNG with an HTML tail is stored re-encoded, and the tail is gone', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 's14 ac231 polyglot')

    const polyglot = Buffer.concat([ONE_PIXEL_PNG, Buffer.from(HTML_TAIL, 'utf8')])
    const stored = await upload(
      owner,
      '/files',
      { kind: 'image', folder_id: folderId },
      { name: 'photo.png', type: 'image/png', bytes: polyglot },
    )
    expectStatus(
      stored,
      201,
      'a decodable raster stores; the defence is the re-encode, not a refusal (spec 7.15)',
    )
    const fileId = String((stored.json() as { id?: unknown }).id)

    const served = await owner.browser.request(`/api/v1/files/${fileId}`)
    expectStatus(served, 200, 'the member is served the stored object (spec 7.15)')
    expect(
      served.body.includes('ac231-owned'),
      'the HTML tail survived the round trip: the stored object was not re-encoded, and a sniffing renderer would execute it',
    ).toBe(false)
    expect(
      served.body.includes('<script'),
      'script text survived the re-encode',
    ).toBe(false)
  })
})
