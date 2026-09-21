/*
AC-491: given the same physical file uploaded twice, once as previewable media
and once through the File command, then the server stores two rows of two
different kinds and preserves each — a JPG uploaded as `image` stays an image,
the same JPG uploaded as `file` stays a file, and neither is ever reclassified
from its extension.

Issue #220, R1's "Canonical composer block kinds" table, proofs 3 and 4. This
is the criterion for the sentence the issue puts in bold: **the backend must
preserve the declared, validated treatment rather than silently reclassifying
a File block from its extension.**

It is the hardest thing in #220 to get wrong loudly, which is why it is pinned
here. A server that classified from the filename would pass every other
criterion in this issue and fail only this one: the bytes are identical, the
name is identical, the upload succeeds either way, and the only difference is
a field the caller sent. The three pairs below — JPG, MP3, MP4 — are the three
the issue names by name.

Spec: 4.16, 7.15.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { MP3_BYTES, MP4_BYTES, ONE_PIXEL_PNG, uploadKindOk } from '../support/uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac491')
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
  const list = (rows as unknown as { rows?: Record<string, unknown>[] }).rows ??
    (rows as unknown as Record<string, unknown>[])
  return String(list[0]?.kind)
}

test('AC-491 the same bytes take the kind they were declared with, both ways', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac491 insertion mode')

  /* Three pairs. Within each pair the bytes, the filename and the declared
     MIME are all identical; only `kind` differs. Anything that read the
     filename would have to answer the same for both halves of a pair. */
  const pairs = [
    { media: 'image', name: 'photo.png', type: 'image/png', bytes: ONE_PIXEL_PNG },
    { media: 'audio', name: 'song.mp3', type: 'audio/mpeg', bytes: MP3_BYTES },
    { media: 'video', name: 'clip.mp4', type: 'video/mp4', bytes: MP4_BYTES },
  ] as const

  for (const pair of pairs) {
    const file = { name: pair.name, type: pair.type, bytes: pair.bytes }
    const asMedia = await uploadKindOk(owner, pair.media, folder, file)
    const asFile = await uploadKindOk(owner, 'file', folder, file)

    expect(asMedia, 'two uploads of one file are two independent rows').not.toBe(asFile)
    expect(
      await kindOf(asMedia),
      `${pair.name} dropped as media is stored as ${pair.media} (#220 R1)`,
    ).toBe(pair.media)
    expect(
      await kindOf(asFile),
      `${pair.name} inserted through the File command stays a file, whatever its extension says (#220 R1)`,
    ).toBe('file')
  }
})

test('AC-491 a File keeps its treatment when served, and media keeps its own', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac491 serving follows the kind')
  const file = { name: 'clip.mp4', type: 'video/mp4', bytes: MP4_BYTES }

  /* The consequence the person actually sees. Identical bytes under identical
     names: the one uploaded as video is offered to a player inline, the one
     inserted through the File command is downloaded. Insertion mode is not a
     label on a row, it is what the file does. */
  const asVideo = await uploadKindOk(owner, 'video', folder, file)
  const asFile = await uploadKindOk(owner, 'file', folder, file)

  const servedVideo = await owner.browser.request(`/api/v1/files/${asVideo}`, { method: 'GET' })
  const servedFile = await owner.browser.request(`/api/v1/files/${asFile}`, { method: 'GET' })

  expect(servedVideo.headers['content-disposition']).toMatch(/^inline;/)
  expect(servedFile.headers['content-disposition']).toMatch(/^attachment;/)
  // nosniff on both: the header is unconditional, and only the disposition
  // follows the kind.
  expect(servedVideo.headers['x-content-type-options']).toBe('nosniff')
  expect(servedFile.headers['x-content-type-options']).toBe('nosniff')
})
