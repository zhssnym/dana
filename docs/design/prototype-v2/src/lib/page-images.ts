/*
Pictures on a page, and where the bytes live.

Imran's brief of 2026-08-23, item 5: a folder page should be able to hold an
image. It is also the answer to a question he asked earlier and that no control
could answer — *how does the first user get an idea of what to do here* — because
a page that can hold a picture can hold a worked example.

**Their own store, not the layout's.** A folder's sections, paragraphs and
assignments share one \`localStorage\` key, and images are three orders of
magnitude larger than everything else on a page. Putting them in that key means
the first person who adds two photographs loses their sections to a quota error.
Here, a full store costs pictures and nothing else, and the layout keeps a short
id rather than a megabyte.

**Downscaled on the way in**, which is the difference between a block that
survives a reload and one that does not. The folder cover takes an upload as a
session-only object URL and says so — right for a cover, which is decoration you
choose again in a second. An image *block* is content; it is the worked example,
and one that vanished when you refreshed would make the page a worse demo than
no picture at all. 1600px on the long edge at JPEG 0.72 puts a photograph around
200KB, which browsers hold a good number of.

Lane 2 travels with it and is larger than usual: the ported version is object
storage plus a row, with an upload endpoint, a size limit, a content-type
allowlist and a signed URL. None of that is drawn here. What ports is the
*block* — that a page is a list of things and one of them can be a picture.
*/

export const PAGE_IMAGE_STORAGE_KEY = "dana:prototype-page-images"

/* The long edge, and the quality. Chosen so a phone photograph lands near
   200KB: large enough to look like a photograph on a 1440px page, small
   enough that a page can carry several. */
const MAX_EDGE = 1600
const QUALITY = 0.72

type ImageStore = Record<string, string>

function read(): ImageStore {
  if (typeof window === "undefined") return {}
  try {
    const value = JSON.parse(
      window.localStorage.getItem(PAGE_IMAGE_STORAGE_KEY) ?? "{}",
    )
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as ImageStore)
      : {}
  } catch {
    return {}
  }
}

export function readPageImage(id: string): string | undefined {
  return read()[id]
}

export function savePageImage(id: string, dataUrl: string) {
  try {
    window.localStorage.setItem(
      PAGE_IMAGE_STORAGE_KEY,
      JSON.stringify({ ...read(), [id]: dataUrl }),
    )
    return true
  } catch {
    /* Out of room. The caller keeps the picture for this session and says so,
       rather than the block silently showing nothing after a reload. */
    return false
  }
}

export function forgetPageImage(id: string) {
  const store = read()
  delete store[id]
  try {
    window.localStorage.setItem(PAGE_IMAGE_STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* Nothing to do: the entry is gone from the copy that matters. */
  }
}

/*
A file, downscaled to something a page can keep.

Returns the data URL and the natural aspect ratio, because the block needs the
ratio *before* the picture paints — without it the page jumps by the height of
an image the moment one loads, which is the single most noticeable thing a page
of text can do wrong.
*/
export function scaleImageFile(
  file: File,
): Promise<{ dataUrl: string; ratio: number } | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(null)
      return
    }
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = image
      const scale = Math.min(1, MAX_EDGE / Math.max(w, h))
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      const context = canvas.getContext("2d")
      if (!context) {
        URL.revokeObjectURL(url)
        resolve(null)
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      /* PNG for anything with transparency — a screenshot of a UI is the
         commonest thing anybody will put on a Dana page, and JPEG turns its
         flat areas into mush at this quality. */
      const type = file.type === "image/png" ? "image/png" : "image/jpeg"
      const dataUrl = canvas.toDataURL(type, QUALITY)
      URL.revokeObjectURL(url)
      resolve({ dataUrl, ratio: w / h })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })
}
