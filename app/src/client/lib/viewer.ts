/*
Who is looking, and what they look like, over 7.2's session and 7.15's avatar.

`useViewer` answers `/me`: the display name, the initials `parts/presenters.ts`
decides everywhere else, and `avatar_url`, which 7.15 sets from the upload and
which sign-in fills from Google where it can.

**`setViewerImage` is 7.15's `POST /me/avatar`.** `squareImageFile` runs first,
so what goes up is a 256px square, and then the bytes go to the one route that
sets a picture. The route answers the new serving path and the `/me` read
carries it from then on, so every surface that draws the face updates.

**The request goes through `api/http.ts`'s `uploadAvatar`**, so it takes the
same offline check as every other write: choosing a picture with no connection
reports 9.1's "Couldn't save. You're offline." rather than a generic failure.

**`clearViewerImage` is `DELETE /api/v1/me/avatar`** (7.15), behind the Settings
row's Remove control.

`squareImageFile`: square because every avatar in the product is a circle,
centre-cropped to the short edge because letting a portrait photograph in
un-cropped means the browser decides what to cut, which is usually the top of
somebody's head.
*/
import { useMe } from '../api/queries.js'
import { mutateApi, uploadAvatar } from '../api/http.js'
import { queryClient, writeFailureMessage } from '../api/queryClient.js'
import { showToast } from '../state/toasts.js'
import { initialsOf } from '../parts/presenters.js'

/* Small, because nothing draws an avatar above 40px. */
const MAX_EDGE = 256
const QUALITY = 0.82

export interface Viewer {
  name: string
  initials: string
  email: string
  timezone: string
  /* 7.15's serving path, or nothing, in which case the initials stand in,
     which is what every avatar in the product already falls back to. */
  image?: string
}

const FALLBACK: Viewer = { name: '', initials: '', email: '', timezone: '' }

export function useViewer(): Viewer {
  const me = useMe()
  const user = me.data?.user
  if (user === undefined) return FALLBACK
  const email = user.email ?? ''
  const name = user.display_name ?? email
  return {
    name,
    initials: initialsOf(name),
    email,
    timezone: user.timezone ?? '',
    ...(user.avatar_url === null ? {} : { image: user.avatar_url }),
  }
}

/** A data URL back into a file, which is what a multipart route takes. */
async function fileOf(dataUrl: string): Promise<File> {
  // eslint-disable-next-line no-restricted-syntax -- a data: URL round-trip to a Blob; reaches no network, so neither the CSRF header nor tz applies
  const blob = await (await fetch(dataUrl)).blob()
  return new File([blob], 'avatar.jpg', { type: blob.type || 'image/jpeg' })
}

export function setViewerImage(image: string): void {
  const client = queryClient()
  void fileOf(image)
    .then((file) => uploadAvatar(file))
    .then(() => {
      void client?.invalidateQueries()
      /* An upload says when it has landed. */
      showToast('Picture updated')
    })
    .catch((error: unknown) => showToast(writeFailureMessage(error)))
}

/**
 * 7.15's `DELETE /me/avatar`, the other half of the seam above.
 *
 * Through `mutateApi` rather than a hand-written `fetch` for the reason the
 * header gives for the upload: one write path, the CSRF header the caller
 * cannot forget, the offline check, and 9.1's "Couldn't save. You're offline."
 * on a Remove pressed with no connection. The route answers 204, so nothing is
 * parsed; the `/me` read is what tells every surface the picture is gone, and
 * invalidating is what makes the sidebar, the roster and the rows agree with
 * this screen in the same frame.
 */
export function clearViewerImage(): void {
  const client = queryClient()
  void mutateApi(null, { method: 'DELETE', path: '/me/avatar' })
    .then(() => {
      void client?.invalidateQueries()
      /* The mirror of the upload's own toast: a removal says when it landed. */
      showToast('Picture removed')
    })
    .catch((error: unknown) => showToast(writeFailureMessage(error)))
}

/** 7.1's PATCH /me, the one field it takes. */
export function setViewerTimezone(timezone: string): void {
  const client = queryClient()
  void mutateApi(null, { method: 'PATCH', path: '/me', body: { timezone } })
    .then(() => void client?.invalidateQueries())
    .catch((error: unknown) => showToast(writeFailureMessage(error)))
}

/*
A file, cropped square and shrunk.

Square because every avatar in the product is a circle, and letting a portrait
photograph in un-cropped means the browser decides what to cut, which is
usually the top of somebody's head. Centre-cropping to the short edge first is
the same choice a person would make.
*/
export function squareImageFile(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve(null)
      return
    }
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const edge = Math.min(image.naturalWidth, image.naturalHeight)
      const canvas = document.createElement('canvas')
      canvas.width = Math.min(MAX_EDGE, edge)
      canvas.height = canvas.width
      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(url)
        resolve(null)
        return
      }
      context.drawImage(
        image,
        (image.naturalWidth - edge) / 2,
        (image.naturalHeight - edge) / 2,
        edge,
        edge,
        0,
        0,
        canvas.width,
        canvas.height,
      )
      const dataUrl = canvas.toDataURL('image/jpeg', QUALITY)
      URL.revokeObjectURL(url)
      resolve(dataUrl)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })
}
