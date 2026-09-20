/*
Multipart bodies for the 7.15 criteria, built by hand because the suite's
HTTP client is a raw socket writer, not fetch: FormData never enters it,
the bytes on the wire are exactly the Buffer handed over, and the boundary
is fixed so a failure prints a body a person can read.
*/
import { expect } from 'vitest'

import type { Actor } from './folders-harness.js'
import type { RawResponse } from './http-client.js'

const BOUNDARY = 'dana-s1-multipart-boundary'

export interface UploadFile {
  name: string
  type: string
  bytes: Buffer
}

export function multipartBody(
  fields: Record<string, string>,
  file: UploadFile,
): { body: Buffer; contentType: string } {
  const head: Buffer[] = []
  for (const [key, value] of Object.entries(fields)) {
    head.push(
      Buffer.from(
        `--${BOUNDARY}\r\ncontent-disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
        'utf8',
      ),
    )
  }
  head.push(
    Buffer.from(
      `--${BOUNDARY}\r\ncontent-disposition: form-data; name="file"; ` +
        `filename="${file.name}"\r\ncontent-type: ${file.type}\r\n\r\n`,
      'utf8',
    ),
  )
  const tail = Buffer.from(`\r\n--${BOUNDARY}--\r\n`, 'utf8')
  return {
    body: Buffer.concat([...head, file.bytes, tail]),
    contentType: `multipart/form-data; boundary=${BOUNDARY}`,
  }
}

/** A real 1x1 cobalt PNG (sharp's own output) so a server that decodes
 * bytes sees a true image; a hand-assembled one was refused for its CRCs,
 * which is the server doing its job. */
export const ONE_PIXEL_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
    '0000000970485973000003e8000003e801b57b526b0000000d49444154789c63a8' +
    '2efff61f00064102e8e9eec40b0000000049454e44ae426082',
  'hex',
)

/*
A real PNG of a stated size, for the criteria that assert 4.16's width and
height (issue #27, migration 0009).

**Generated rather than embedded, and generated with the encoder the server
decodes with.** `ONE_PIXEL_PNG` above is 1 by 1, so it cannot tell a stored
width from a stored height, and a hand-assembled PNG was already refused once
for its CRCs, which is the note above this file's constant. sharp is a
dependency of the application rather than of the suite, so the import is
dynamic and inside the function: a test file that never asks for a picture
never loads the native module.

The bytes are a flat colour, which PNG compresses to almost nothing, so even
the case that overflows the 2048px downscale costs a few kilobytes on the
wire.
*/
export async function imagePng(width: number, height: number): Promise<Buffer> {
  const { default: sharp } = await import('sharp')
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 32, g: 64, b: 128 },
    },
  })
    .png()
    .toBuffer()
}

export function upload(
  actor: Actor,
  path: string,
  fields: Record<string, string>,
  file: UploadFile,
): Promise<RawResponse> {
  const { body, contentType } = multipartBody(fields, file)
  return actor.browser.request(`/api/v1${path}`, {
    method: 'POST',
    body,
    headers: { 'content-type': contentType },
  })
}

/**
 * One stored image in a folder, answering its id: the shape every criterion
 * that needs a file to point at wants, rather than an upload it then has to
 * unwrap. Added for issue #22, where a comment carries up to ten of them and
 * a case that spelled the upload out eleven times would be unreadable.
 */
/**
 * One stored `cover`, in a folder or in none, answering its id.
 *
 * The null arm is what issues #20 and #100 added to 7.15: a cover is the one
 * kind that may stand outside a folder, because a shelf and a place page are
 * not folders and their covers belong to the person rather than to a folder's
 * membership. `folderId` null therefore sends **no** `folder_id` part at all,
 * which is the wire shape the route now admits, rather than an empty one.
 */
export async function uploadCoverOk(
  actor: Actor,
  folderId: string | null,
  name: string,
): Promise<string> {
  const stored = await upload(
    actor,
    '/files',
    folderId === null ? { kind: 'cover' } : { kind: 'cover', folder_id: folderId },
    { name, type: 'image/png', bytes: ONE_PIXEL_PNG },
  )
  expect(
    stored.status,
    `the cover upload of ${name} must land before anything can wear it (spec 7.15 as widened by issues #20 and #100); answered ${String(stored.status)} ${stored.body.slice(0, 160)}`,
  ).toBe(201)
  const id = (stored.json() as { id?: unknown }).id
  expect(typeof id, 'the stored row answers with its id (spec 7.0)').toBe('string')
  return id as string
}

export async function uploadImageOk(
  actor: Actor,
  folderId: string,
  name: string,
): Promise<string> {
  const stored = await upload(
    actor,
    '/files',
    { kind: 'image', folder_id: folderId },
    { name, type: 'image/png', bytes: ONE_PIXEL_PNG },
  )
  expect(
    stored.status,
    `the upload of ${name} must land before anything can reference it (spec 7.15); answered ${String(stored.status)} ${stored.body.slice(0, 160)}`,
  ).toBe(201)
  const id = (stored.json() as { id?: unknown }).id
  expect(typeof id, 'the stored row answers with its id (spec 7.0)').toBe('string')
  return id as string
}

/*
========================================================================
#220's media and generic-file fixtures
========================================================================

**These are container fixtures and not playable media, and that is the whole
of what the server checks.** #220 R1 forbids introducing FFmpeg or any media
probing in M1, so `createFile` validates two things and no more: the declared
MIME is on the narrow `audio` or `video` allowlist, and the bytes carry the
container signature that type implies. Nothing here claims a decoder would
play them, and no criterion below asserts that it would — asserting playback
would be asserting a subsystem the issue rules out.

What they *do* prove is the direction that matters. Each fixture pairs real
leading bytes with a declared type, so a case can hand the media path bytes
that are something else entirely — a ZIP, an HTML document, a PNG — under an
allowlisted label and watch it be refused. A browser's MIME label is a guess
taken from the filename, and a filename is presentation, never security truth.
*/

/** `ID3` tag, then one MPEG frame header. Declared `audio/mpeg`. */
export const MP3_BYTES = Buffer.concat([
  Buffer.from('ID3\u0003\u0000\u0000\u0000\u0000\u0000\u0000', 'latin1'),
  Buffer.from('fffb9064', 'hex'),
  Buffer.alloc(64),
])

/** An ISO base-media box: size, `ftyp`, `isom`. Declared `audio/mp4` or
 * `video/mp4` — the container is the same one, which is exactly why the kind
 * is declared by the caller and validated rather than inferred. */
export const MP4_BYTES = Buffer.concat([
  Buffer.from('0000001c', 'hex'),
  Buffer.from('ftypisom', 'latin1'),
  Buffer.from('00000200', 'hex'),
  Buffer.from('isomiso2mp41', 'latin1'),
  Buffer.alloc(32),
])

/** The EBML/Matroska signature, shared by WebM audio and WebM video. */
export const WEBM_BYTES = Buffer.concat([
  Buffer.from('1a45dfa3', 'hex'),
  Buffer.alloc(48),
])

/** An Ogg page header. */
export const OGG_BYTES = Buffer.concat([
  Buffer.from('OggS', 'latin1'),
  Buffer.alloc(48),
])

/** A RIFF/WAVE header. */
export const WAV_BYTES = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.from('24000000', 'hex'),
  Buffer.from('WAVEfmt ', 'latin1'),
  Buffer.alloc(32),
])

/** Bytes that are not any media container at all: a ZIP local file header,
 * which is what an `.xlsx`, a `.docx` and a `.jar` all begin with. */
export const ZIP_BYTES = Buffer.concat([
  Buffer.from('504b0304', 'hex'),
  Buffer.alloc(32),
])

/**
 * One stored file of any kind, in a folder or in none, answering its id.
 *
 * The folder-less arm sends **no** `folder_id` part at all, which is the wire
 * shape migration 0024 admits for every kind but `voice`, rather than an empty
 * one. `uploadImageOk` and `uploadCoverOk` above are the two special cases
 * that predate this; everything #220 adds goes through here.
 */
export async function uploadKindOk(
  actor: Actor,
  kind: string,
  folderId: string | null,
  file: UploadFile,
): Promise<string> {
  const stored = await upload(
    actor,
    '/files',
    folderId === null ? { kind } : { kind, folder_id: folderId },
    file,
  )
  expect(
    stored.status,
    `the ${kind} upload of ${file.name} must land before anything can reference it (spec 7.15, issue #220); answered ${String(stored.status)} ${stored.body.slice(0, 200)}`,
  ).toBe(201)
  const id = (stored.json() as { id?: unknown }).id
  expect(typeof id, 'the stored row answers with its id (spec 7.0)').toBe('string')
  return id as string
}
