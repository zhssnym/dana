/*
Multipart bodies for the 7.15 criteria, built by hand because the suite's
HTTP client is a raw socket writer, not fetch: FormData never enters it,
the bytes on the wire are exactly the Buffer handed over, and the boundary
is fixed so a failure prints a body a person can read.
*/
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

/** A real, minimal 1x1 PNG so a server that sniffs bytes sees a true image. */
export const ONE_PIXEL_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000d49444154789c626001000000ffff03000006000557' +
    'bfabd40000000049454e44ae426082',
  'hex',
)

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
