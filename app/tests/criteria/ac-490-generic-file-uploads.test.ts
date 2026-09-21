/*
AC-490: given the File command, when a file of any extension or of none is
uploaded as `kind=file`, then it is stored as a `file` row with the name it
arrived under, and it reads back as a `file` — never reclassified from what
its filename happens to say.

AC-495: given a stored `file`, when it is served, then it carries
`Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`,
whatever MIME the uploader declared.

Issue #220, R1 and R2, proofs 1, 2 and 8. The decision these pin is the one
the issue states twice: **a generic file is untrusted bytes, and its extension
and filename are presentation and never security truth.** So the cases below
deliberately upload bytes whose declared type is dangerous — `text/html`, and
an archive's — and assert that the server neither refuses them (R1 says any
extension or none) nor treats them as anything but an attachment.

The `nosniff` half is not decoration. Without it a browser is free to sniff a
`text/html` payload out of whatever type the response declares and run it on
this application's own origin, which is a session walking out the door; with
`attachment` beside it, the file is downloaded and never rendered. This is the
whole of "Dana never executes an uploaded file".

Spec: 4.16, 7.15, 10.2.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { ZIP_BYTES, upload, uploadKindOk } from '../support/uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac490')
beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)
afterAll(async () => {
  if (app) {
    await cast.cleanup(app.db)
    await app.close()
  }
})

/** The stored row, read by column. Never the prose of a server message: the
 * created databases answer in this cluster's language and a column read is
 * the locale-proof one (tests/guards/guard-postgres-leg-isolation.test.ts). */
async function storedRow(
  id: string,
): Promise<{ kind: string; name: string; mime: string }> {
  const rows = await app.db.execute(
    sql`SELECT kind, name, mime FROM files WHERE id = ${id}::uuid`,
  )
  const list = (rows as unknown as { rows?: Record<string, unknown>[] }).rows ??
    (rows as unknown as Record<string, unknown>[])
  const first = list[0]
  return {
    kind: String(first?.kind),
    name: String(first?.name),
    mime: String(first?.mime),
  }
}

test('AC-490 any extension, and no extension at all, survive as a File', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac490 generic files')

  /* Four shapes the File command must accept, and each is chosen because a
     server tempted to classify from a filename would get it wrong: an unknown
     extension, no extension at all, a double extension, and a name whose
     extension says one thing while the declared type says another. None of
     them changes what is stored. */
  const cases = [
    { name: 'ledger.q4data', type: 'application/octet-stream', bytes: ZIP_BYTES },
    { name: 'README', type: 'text/plain', bytes: Buffer.from('no extension here', 'utf8') },
    { name: 'report.tar.gz', type: 'application/gzip', bytes: ZIP_BYTES },
    { name: 'invoice.jpg', type: 'text/html', bytes: Buffer.from('<p>not a picture</p>', 'utf8') },
  ]

  for (const file of cases) {
    const id = await uploadKindOk(owner, 'file', folder, file)
    const row = await storedRow(id)
    expect(row.kind, `${file.name} is stored as a file (4.16, #220 R1)`).toBe('file')
    expect(row.name, `${file.name} keeps the name it arrived under`).toBe(file.name)
    expect(
      row.mime,
      `${file.name} keeps the declared type verbatim, believed for nothing`,
    ).toBe(file.type)
  }
})

test('AC-495 a generic File is always served as an attachment, with nosniff', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac495 attachment serving')

  /* The worst case on purpose: bytes that are a document, declared as a
     document, under a filename that says picture. If anything anywhere in
     this path decided from the extension, this is the upload that would be
     served inline. */
  const id = await uploadKindOk(owner, 'file', folder, {
    name: 'not-really.png',
    type: 'text/html',
    bytes: Buffer.from('<html><body>a document</body></html>', 'utf8'),
  })

  const served = await owner.browser.request(`/api/v1/files/${id}`, { method: 'GET' })
  expectStatus(served, 200, 'the uploader reads their own file (spec 7.15)')
  expect(
    served.headers['content-disposition'],
    'a file kind is served as an attachment and never inline (#220 R1)',
  ).toMatch(/^attachment;/)
  expect(
    served.headers['x-content-type-options'],
    'nosniff, so no browser may sniff a document out of the declared type',
  ).toBe('nosniff')
})

test('AC-490 a File upload is refused past 25 MiB, and the cap is unchanged', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac490 the cap holds')
  // 10.3's cap, which #220 R1 keeps for M1. One byte over, so the assertion
  // is about the boundary rather than about a number nobody chose.
  const overCap = Buffer.alloc(25 * 1024 * 1024 + 1)
  const refused = await upload(
    owner,
    '/files',
    { kind: 'file', folder_id: folder },
    { name: 'far-too-big.bin', type: 'application/octet-stream', bytes: overCap },
  )
  expectStatus(refused, 422, 'one byte past 25 MiB is refused (spec 10.3, #220 R1)')
})
