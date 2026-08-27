/*
The adapter seam for a picture on a page: `prototype-v2`'s `lib/page-images.ts`
rewritten over 7.15 and 4.17, lifted by RFC 0004's S26 for RFC 0005 change
control item 44's B7 and B11.

The prototype's module is a `localStorage` store keyed by the block's own id,
with its own header saying what the ported version would be, "object storage
plus a row, with an upload endpoint, a size limit, a content-type allowlist".
That is `POST /api/v1/files` and `files`, which exist, so what changes is where
the bytes go and nothing about the block.

**The downscale is B11 and it is the prototype's own, unchanged.** 1600px on
the long edge at 0.72, PNG kept as PNG because a screenshot of an interface is
the commonest thing anybody puts on a Dana page and JPEG turns its flat areas
to mush. It runs before the upload rather than after, which is the difference
between B11 and AC-231's server re-encode: the server's pass protects the
store, this one protects the person's connection, and neither replaces the
other. 10.3 carries the numbers.

**Two things the prototype's module returns that this one cannot.**

The first is the aspect ratio, and it is section 13 item 47 exactly as that
item predicted: `files` carries no dimensions and `page_blocks` carries no
ratio, so the authoring client knows the picture's shape from the `File` it
just chose and every other reader knows nothing. What ships is the reservation
working for the author and a 16 by 9 default for everyone else, which is the
honest half of a correctness fix rather than a styling problem, and the item is
where the pair of columns that would close it is recorded. Read it before
treating this as a gap somebody forgot.

The second is a synchronous answer. The lab writes the bytes and knows at once
whether the store took them; an upload is a round trip, so `savePageImage`
returns a promise carrying the file's id, and `components/page-image.tsx`'s
`take` is the one function in that file this costs. Its own seam comment says
so.
*/
import { mutateApi, uploadFile } from '../api/http.js'

/* The long edge and the quality, the prototype's own, and B11's numbers. */
const MAX_EDGE = 1600
const QUALITY = 0.72

/** A picture the person has just chosen, downscaled and measured. */
export interface ScaledImage {
  /** For the optimistic draw, so the picture is on the page before the round
   *  trip, the way it is in the lab. */
  readonly dataUrl: string
  /** Width over height, which only this client will ever know (item 47). */
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
 * Null where the upload was refused, which the block says in words rather than
 * dropping the picture silently: the prototype's own treatment of a full
 * store, kept because the fault it describes is the same one.
 */
export async function savePageImage(
  folderId: string,
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
 * A file, downscaled to something a page can keep, and measured.
 *
 * The prototype's function with one change: it returns the blob as well as the
 * data URL, because the bytes have somewhere to go here.
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
      /* PNG for anything with transparency, the prototype's own reason. */
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
            ratio: h === 0 ? 16 / 9 : w / h,
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
