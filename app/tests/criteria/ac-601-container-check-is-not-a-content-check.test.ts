/*
AC-601: given a payload whose leading bytes are an allowlisted container
signature and whose remainder is something else entirely, then it is stored
as previewable media — and what stops it being rendered is the response, not
the check that let it in.

Issue #220, and the adversarial review of the branch that added the container
check. **This criterion exists because a comment claimed more than the code
does.** `domain/files.ts` said the container check "proves that a caller
cannot hand the `audio` or `video` path an executable, a zip or an HTML
document by writing `audio/mpeg` on it". It does not. `containerOf` reads the
first bytes and nothing else, so anything at all may follow a real signature,
and one payload needs no prefix even in principle: a UTF-16LE byte-order mark
is `FF FE`, and `FF FE` is a legal MPEG-1 Layer I frame sync — eleven set sync
bits — which is exactly what the last arm of `containerOf` looks for.

**What this pins is the decision, so that a criterion that goes red says
which decision moved.** #220 R1 forbids FFmpeg and any media-probing
subsystem in M1 and rules what to do instead: a narrow allowlist, a leading-
byte container read, fail closed, and the generic File path still available.
A check that read further than the leading bytes would be the subsystem R1
rules out. So the first half below is not a hole to be closed on a quiet
afternoon; it is the ruled shape of the check, and the second half is where
the actual line is held.

**The second half is the whole point.** Three things stop those bytes being
rendered as a document on this application's own origin, and none of them is
the container check: `X-Content-Type-Options: nosniff`, so the browser will
not look past the declared type; a `Content-Type` that is the allowlisted
audio or video type the caller declared, which no browser renders as markup;
and 10.8's policy on the response itself — `default-src 'self'`,
`object-src 'none'`, and a `script-src` naming `'self'` and one hash with no
`unsafe-inline` anywhere in it. Each is asserted off the wire rather than off
the module, because a header a test reads from the source is a header nobody
proved was sent.

Spec: 4.16 as amended 2026-09-20, 7.15 as amended 2026-09-20, 10.3, 10.8.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { upload, uploadKindOk } from '../support/uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac601')
beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)
afterAll(async () => {
  if (app) {
    await cast.cleanup(app.db)
    await app.close()
  }
})

async function kindOf(id: string): Promise<string> {
  const rows = await app.db.execute(sql`SELECT kind FROM files WHERE id = ${id}::uuid`)
  const list =
    (rows as unknown as { rows?: Record<string, unknown>[] }).rows ??
    (rows as unknown as Record<string, unknown>[])
  return String(list[0]?.kind)
}

/** A DOS/PE stub behind a real ID3 tag: leading bytes that are a container
 *  signature, followed by bytes that are not media in any reading. */
const ID3_OVER_EXECUTABLE = Buffer.concat([
  Buffer.from('ID3\u0003\u0000\u0000\u0000\u0000\u0000\u0000', 'latin1'),
  Buffer.from('MZ\u0090\u0000\u0003\u0000\u0000\u0000', 'latin1'),
  Buffer.from('This program cannot be run in DOS mode.', 'latin1'),
])

/** A ZIP local file header behind a RIFF/WAVE header. `.xlsx`, `.docx` and
 *  `.jar` all begin with those four bytes. */
const WAV_OVER_ZIP = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.from('24000000', 'hex'),
  Buffer.from('WAVEfmt ', 'latin1'),
  Buffer.from('504b0304', 'hex'),
  Buffer.alloc(32),
])

/** An HTML document in UTF-16LE, which needs **no** prefix: its byte-order
 *  mark `FF FE` is itself the frame sync the last arm of `containerOf` reads,
 *  and it is a legal MPEG-1 Layer I header besides. */
const UTF16LE_HTML = Buffer.concat([
  Buffer.from([0xff, 0xfe]),
  Buffer.from('<html><body><script>alert(1)</script></body></html>', 'utf16le'),
])

test('AC-601 the container check reads leading bytes, and says nothing about the rest', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac601 leading bytes')

  const payloads = [
    { name: 'a.mp3', type: 'audio/mpeg', bytes: ID3_OVER_EXECUTABLE, what: 'an executable behind an ID3 tag' },
    { name: 'a.wav', type: 'audio/wav', bytes: WAV_OVER_ZIP, what: 'a ZIP behind a RIFF/WAVE header' },
    { name: 'a.mp3', type: 'audio/mpeg', bytes: UTF16LE_HTML, what: 'a UTF-16LE HTML document, whose BOM is the frame sync' },
  ]
  for (const payload of payloads) {
    const id = await uploadKindOk(owner, 'audio', folder, payload)
    expect(
      await kindOf(id),
      `${payload.what} passes a check that reads only the leading bytes (#220 R1 rules out reading further)`,
    ).toBe('audio')
  }

  /* And the check is a real check rather than nothing at all, which is what
     it is worth: bytes carrying no allowlisted signature are refused, so the
     honest mistake and the lazy attempt both fail closed. */
  const refused = await upload(
    owner,
    '/files',
    { kind: 'audio', folder_id: folder },
    { name: 'a.mp3', type: 'audio/mpeg', bytes: Buffer.from('<html><body>plain ASCII</body></html>', 'latin1') },
  )
  expectStatus(refused, 422, 'an ASCII HTML document carries no container signature at all')
})

test('AC-601 the response is what holds the line: nosniff, the declared type, and 10.8', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac601 the response holds the line')

  const id = await uploadKindOk(owner, 'audio', folder, {
    name: 'smuggled.mp3',
    type: 'audio/mpeg',
    bytes: UTF16LE_HTML,
  })
  const served = await owner.browser.request(`/api/v1/files/${id}`, { method: 'GET' })
  expectStatus(served, 200, 'the row serves to its own folder')

  expect(
    served.headers['x-content-type-options'],
    'nosniff, so the browser never looks past the declared type at the bytes',
  ).toBe('nosniff')
  expect(
    String(served.headers['content-type'] ?? ''),
    'the declared type is the allowlisted audio one, which no browser renders as markup',
  ).toMatch(/^audio\/mpeg\b/)
  /* Served inline, which is the uncomfortable half and the reason the other
     two assertions are the ones that matter. An `audio` row is previewable
     media by declaration, and a generic `file` is the kind that is always an
     attachment — AC-491 asserts that pair. */
  expect(String(served.headers['content-disposition'] ?? '')).toMatch(/^inline;/)

  const csp = String(served.headers['content-security-policy'] ?? '')
  expect(csp, "10.8's policy rides on this response too, not only on the shell").toContain(
    "default-src 'self'",
  )
  expect(csp, 'no plugin may be handed these bytes').toContain("object-src 'none'")
  const scriptSrc = /script-src ([^;]*)/.exec(csp)?.[1] ?? ''
  expect(scriptSrc, "script-src is 'self' and one hash").toContain("'self'")
  expect(
    scriptSrc,
    'and admits no inline script, which is what a smuggled document would need',
  ).not.toContain("'unsafe-inline'")

  /* The same bytes through the path R1 keeps available for exactly this:
     stored as a generic File, they are an attachment and nothing claims they
     are playable. */
  const asFile = await uploadKindOk(owner, 'file', folder, {
    name: 'smuggled.mp3',
    type: 'audio/mpeg',
    bytes: UTF16LE_HTML,
  })
  const downloaded = await owner.browser.request(`/api/v1/files/${asFile}`, { method: 'GET' })
  expect(String(downloaded.headers['content-disposition'] ?? '')).toMatch(/^attachment;/)
  expect(downloaded.headers['x-content-type-options']).toBe('nosniff')
})
