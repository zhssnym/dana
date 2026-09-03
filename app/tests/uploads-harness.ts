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
