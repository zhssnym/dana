/*
AC-492: given `kind=audio`, then only the explicit browser-compatible audio
MIME allowlist is accepted, every other declared type is refused, and a
declared type whose bytes are a different container is refused too.

AC-493: the same for `kind=video`.

AC-494: given `kind=voice`, then its existing behaviour is unchanged — it
still accepts `audio/*` at large, it still requires a folder, and it still
carries its own duration rule.

Issue #220, R1's upload/security contract, proofs 5, 6 and 7.

**What these prove, and what they deliberately do not.** R1 forbids
introducing FFmpeg or any media-probing subsystem in M1 and rules what to do
instead: keep the allowlist narrow and fail closed, with the generic File path
still available. So the assertions are about the allowlist and about the
container signature, and there is no assertion anywhere that a decoder would
play the bytes — proving that would need exactly the subsystem the issue rules
out, and a criterion that claimed it would be claiming more than the server
does.

**The container half is the security half.** A browser's MIME label is a guess
taken from the filename in the first place, which #220 says in terms is never
security truth. So each refusal case below hands the media path bytes that are
something else entirely under an allowlisted label. Without the container
check every one of them would be stored as previewable media and served inline
on this application's own origin.

**AC-494 exists because `voice` is the thing most likely to be broken by
accident here.** It is an audio kind, it predates #220, and R1 says in terms
that it stays distinct with its own rules. Narrowing it to the new allowlist
would refuse recordings that work today, and nothing in this issue asked for
that; this case is what would notice.

Spec: 4.16, 7.14, 7.15, 10.3.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  MP3_BYTES,
  MP4_BYTES,
  OGG_BYTES,
  ONE_PIXEL_PNG,
  WAV_BYTES,
  WEBM_BYTES,
  ZIP_BYTES,
  upload,
  uploadKindOk,
} from '../support/uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac492')
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

test('AC-492 the audio allowlist accepts its own set and nothing else', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac492 audio allowlist')

  const accepted = [
    { name: 'a.mp3', type: 'audio/mpeg', bytes: MP3_BYTES },
    { name: 'a.m4a', type: 'audio/mp4', bytes: MP4_BYTES },
    { name: 'a.ogg', type: 'audio/ogg', bytes: OGG_BYTES },
    { name: 'a.wav', type: 'audio/wav', bytes: WAV_BYTES },
    { name: 'a.weba', type: 'audio/webm', bytes: WEBM_BYTES },
  ]
  for (const file of accepted) {
    const id = await uploadKindOk(owner, 'audio', folder, file)
    expect(await kindOf(id), `${file.type} is on the audio allowlist`).toBe('audio')
  }

  /* Three refusals and three different reasons, which is the point of listing
     them separately. The first is a type that is not on the list at all. The
     second is a type that is not audio in any reading. The third is the one
     that matters: an allowlisted label over bytes that are a ZIP archive. */
  const refused = [
    { name: 'a.aiff', type: 'audio/aiff', bytes: WAV_BYTES, why: 'a type absent from the allowlist' },
    { name: 'a.png', type: 'image/png', bytes: ONE_PIXEL_PNG, why: 'a type that is not audio' },
    { name: 'a.mp3', type: 'audio/mpeg', bytes: ZIP_BYTES, why: 'an allowlisted label over another container' },
  ]
  for (const file of refused) {
    const answer = await upload(
      owner,
      '/files',
      { kind: 'audio', folder_id: folder },
      { name: file.name, type: file.type, bytes: file.bytes },
    )
    expectStatus(answer, 422, `audio fails closed on ${file.why} (#220 R1)`)
  }

  /* And the fallback R1 guarantees: every one of those may still be uploaded
     as a generic File, where nothing claims it is playable. */
  for (const file of refused) {
    const id = await uploadKindOk(owner, 'file', folder, {
      name: file.name,
      type: file.type,
      bytes: file.bytes,
    })
    expect(await kindOf(id), 'the generic File path stays available').toBe('file')
  }
})

test('AC-493 the video allowlist accepts its own set and nothing else', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac493 video allowlist')

  const accepted = [
    { name: 'v.mp4', type: 'video/mp4', bytes: MP4_BYTES },
    { name: 'v.webm', type: 'video/webm', bytes: WEBM_BYTES },
    { name: 'v.ogv', type: 'video/ogg', bytes: OGG_BYTES },
  ]
  for (const file of accepted) {
    const id = await uploadKindOk(owner, 'video', folder, file)
    expect(await kindOf(id), `${file.type} is on the video allowlist`).toBe('video')
  }

  const refused = [
    { name: 'v.mov', type: 'video/quicktime', bytes: MP4_BYTES, why: 'QuickTime, deliberately absent' },
    { name: 'v.avi', type: 'video/x-msvideo', bytes: WAV_BYTES, why: 'a type absent from the allowlist' },
    { name: 'v.mp3', type: 'audio/mpeg', bytes: MP3_BYTES, why: 'an audio type declared as video' },
    { name: 'v.mp4', type: 'video/mp4', bytes: ZIP_BYTES, why: 'an allowlisted label over another container' },
  ]
  for (const file of refused) {
    const answer = await upload(
      owner,
      '/files',
      { kind: 'video', folder_id: folder },
      { name: file.name, type: file.type, bytes: file.bytes },
    )
    expectStatus(answer, 422, `video fails closed on ${file.why} (#220 R1)`)
  }
})

test('AC-494 voice is untouched: audio/* at large, a folder required, its own cap', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac494 voice unchanged')

  /* `audio/ogg;codecs=opus` is what a browser's own recorder sends and is not
     on #220's narrow allowlist. `voice` must still take it — the allowlist is
     for uploaded composer audio, and narrowing the recorder's path was never
     asked for. */
  const recorded = await uploadKindOk(owner, 'voice', folder, {
    name: 'note.ogg',
    type: 'audio/ogg;codecs=opus',
    bytes: OGG_BYTES,
  })
  expect(await kindOf(recorded), 'a recorded note is a voice and not an audio').toBe('voice')

  // Still refuses a non-audio type, exactly as before.
  expectStatus(
    await upload(
      owner,
      '/files',
      { kind: 'voice', folder_id: folder },
      { name: 'note.png', type: 'image/png', bytes: ONE_PIXEL_PNG },
    ),
    422,
    'voice still refuses a type that is not audio (spec 4.16)',
  )

  // Still the only kind that requires a folder: migration 0024 leaves it out
  // of files_folderless_kind_check, and the route refuses it before that.
  expectStatus(
    await upload(
      owner,
      '/files',
      { kind: 'voice' },
      { name: 'note.ogg', type: 'audio/ogg', bytes: OGG_BYTES },
    ),
    422,
    'a voice note still hangs on a thread, and a thread lives in a folder',
  )

  // Still its own ten-minute ceiling (10.3), which #220 does not touch.
  expectStatus(
    await upload(
      owner,
      '/files',
      { kind: 'voice', folder_id: folder, duration_ms: String(10 * 60 * 1000 + 1) },
      { name: 'long.ogg', type: 'audio/ogg', bytes: OGG_BYTES },
    ),
    422,
    'a voice note is at most 10 minutes (spec 10.3)',
  )
})
