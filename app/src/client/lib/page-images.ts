/*
The adapter seam for a picture on a page, over 7.15 and 4.17: `POST
/api/v1/files` and the `files` row are where the bytes go.

**The downscale runs before the upload**: 1600px on the long edge at 0.72, PNG
kept as PNG because a screenshot of an interface is the commonest thing anybody
puts on a Dana page and JPEG turns its flat areas to mush. This is not AC-231's
server re-encode: the server's pass protects the store, this one protects the
person's connection, and neither replaces the other. 10.3 carries the numbers.

**The aspect ratio is on the wire** (issues #27, #108). 4.16 has `width` and
`height`, filled from the sharp pass 7.15 makes, and they describe the
**stored** object rather than the one that was sent, a 3000x1500 upload being
stored and reported as 2048x1024. 7.16 hands them to a block read as
`file_width` and `file_height`, 7.14 hands them to a comment's file as `width`
and `height`, and `POST /files` answers them on the 201. `reservedRatio` below
is the one place this client turns them into a number, and every reader of a
page gets the reservation rather than only whoever chose the picture.

**The fallback is not a stopgap.** Null means unknown, no backfill has been run,
and every file stored before those columns existed reports null indefinitely, so
16 by 9 has to stay exactly right for those pictures for as long as they exist.

**An upload is a round trip**, so `savePageImage` returns a promise carrying the
file's id, and `components/page-image.tsx`'s `take` awaits it.
*/
import { mutateApi, uploadFile } from '../api/http.js'

/* The long edge and the quality. */
const MAX_EDGE = 1600
const QUALITY = 0.72

/**
 * The shape a stored picture is drawn at when the wire does not say what its
 * shape is.
 *
 * Sixteen by nine is what every one of these surfaces already drew, and the
 * point of writing it once is that it must go on being what they draw. 4.16's
 * pair is nullable and no backfill has been run, so a picture uploaded before
 * migration 0009 reports null for ever; a reader that treated null as anything
 * but "unknown" would change what those pages look like today.
 */
export const FALLBACK_RATIO = 16 / 9

/**
 * Width over height where 4.16 measured the picture, and undefined where it
 * did not (issue #108).
 *
 * **One function for every surface that draws a stored picture**, a page
 * block's `file_width`/`file_height` and a comment file's `width`/`height`
 * being the same pair under two names. A rule spelled per surface is a rule
 * that drifts per surface, which is the reason `tokens.css` is one file.
 *
 * Zero and negative are read as unmeasured along with null. The columns are
 * declared positive and nothing should send a zero, but a zero height divides
 * into `Infinity` and a zero width into a ratio of nothing, and CSS accepts
 * both and draws an unbounded or collapsed box. A number that cannot be a
 * picture's is not a shape, and "no shape" already has an answer per surface.
 */
export function measuredRatio(
  width: number | null | undefined,
  height: number | null | undefined,
): number | undefined {
  if (width === null || width === undefined || width <= 0) return undefined
  if (height === null || height === undefined || height <= 0) return undefined
  return width / height
}

/**
 * The same reading for a surface whose answer to "no shape" is already 16 by
 * 9, which is the page block and only the page block.
 *
 * **The split between this and `measuredRatio` is the whole care of issue
 * #108 and is not a stylistic one.** Null means unknown and a surface must go
 * on drawing an unknown picture exactly as it draws it today, which is a
 * different thing on the two surfaces. `components/page-image.tsx` has always
 * reserved 16 by 9 for every picture, measured or not, so 16 by 9 is what
 * today draws there and keeping it is keeping the behaviour. A comment's
 * picture has never had a reservation at all: it takes its own proportion
 * once the bytes arrive, so imposing 16 by 9 on the unmeasured ones would
 * reshape every attachment posted before migration 0009, which is the
 * regression this pair exists to make impossible to write by accident.
 */
export function reservedRatio(
  width: number | null | undefined,
  height: number | null | undefined,
): number {
  return measuredRatio(width, height) ?? FALLBACK_RATIO
}

/** A picture the person has just chosen, downscaled and measured. */
export interface ScaledImage {
  /** For the optimistic draw, so the picture is on the page before the round
   *  trip, the way it is in the lab. */
  readonly dataUrl: string
  /**
   * Width over height, measured off the canvas this module just drew.
   *
   * It is the one reading that does not come from 4.16, and it is kept because
   * it is available a round trip earlier: the person who chose the picture has
   * its shape in hand before `POST /files` has answered with the stored one.
   * The two agree, the server's pass preserving the proportion while it
   * downscales, and the stored pair is what every later render reads.
   */
  readonly ratio: number
  /** What goes up. */
  readonly blob: Blob
  readonly name: string
}

/**
 * Where a stored picture is served from (7.15), or undefined for a block whose
 * file has not been chosen yet.
 *
 * The browser sends the session cookie for it, this being one origin (11.1).
 */
export function readPageImage(fileId: string): string | undefined {
  return fileId === '' ? undefined : `/api/v1/files/${fileId}`
}

/**
 * The bytes, stored, answering the id 4.17's `file_id` then names.
 *
 * `folderId` is null for a page with no folder — a shelf's — which `uploadFile`
 * turns into an upload carrying no `folder_id` part, the shape 7.15 admits for
 * `kind: image` (issue #167).
 *
 * Null where the upload was refused, which the block says in words rather than
 * dropping the picture silently.
 */
export async function savePageImage(
  folderId: string | null,
  scaled: ScaledImage,
): Promise<string | null> {
  try {
    const file = new File([scaled.blob], scaled.name, { type: scaled.blob.type })
    const stored = await uploadFile('image', folderId, file)
    return stored.id
  } catch {
    return null
  }
}

/**
 * The file behind a removed block.
 *
 * 4.17 deletes a block without touching anything else, and 7.15 has the
 * delete, so a picture nobody can reach any more is removed rather than left
 * to count against the quota for ever. A refusal is swallowed: the block is
 * already gone from the page and a toast about a file the person never named
 * would explain nothing.
 */
export function forgetPageImage(fileId: string): void {
  if (fileId === '') return
  void mutateApi(null, { method: 'DELETE', path: `/files/${fileId}` }).catch(() => {
    /* See above. */
  })
}

/**
 * A file, downscaled to something a page can keep, and measured. It returns the
 * blob as well as the data URL, because the bytes have somewhere to go.
 */
export function scaleImageFile(file: File): Promise<ScaledImage | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve(null)
      return
    }
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const w = image.naturalWidth
      const h = image.naturalHeight
      const scale = Math.min(1, MAX_EDGE / Math.max(w, h))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      const context = canvas.getContext('2d')
      if (context === null) {
        URL.revokeObjectURL(url)
        resolve(null)
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      /* PNG for anything with transparency. */
      const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      const dataUrl = canvas.toDataURL(type, QUALITY)
      URL.revokeObjectURL(url)
      canvas.toBlob(
        (blob) => {
          if (blob === null) {
            resolve(null)
            return
          }
          resolve({
            dataUrl,
            ratio: reservedRatio(w, h),
            blob,
            name: file.name,
          })
        },
        type,
        QUALITY,
      )
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })
}
