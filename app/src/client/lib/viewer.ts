/*
Who is looking, and what they look like: `prototype-v2`'s `lib/viewer.ts`
rewritten over 7.2's session and 7.15's avatar (RFC 0004's S27).

The prototype's header already names the seam: "the ported version reads the
session", and "Google's account picture is the more interesting half, sign-in
already carries one, and the honest ported default is *that*, with an upload
as the override. Nothing here decides that; the drawing is the same either
way." So `useViewer` answers `/me`: the display name, the initials
`parts/presenters.ts` decides everywhere else, and `avatar_url`, which 7.15
sets from the upload and which sign-in fills from Google where it can.

**`setViewerImage` is 7.15's `POST /me/avatar`.** The prototype crops and
shrinks to a data URL in the browser and stores that; here the same
`squareImageFile` runs first, so what goes up is the 256px square the
prototype would have kept, and then the bytes go to the one route that sets a
picture. The route answers the new serving path and the `/me` read carries it
from then on, so the four surfaces that draw the face update the way the
prototype's store updated them.

**The request goes through `api/http.ts`'s `uploadAvatar` since the polish
round of 2026-08-30**, where it was a hand-written `fetch` here. That copy was
written before this client had a multipart helper and never caught up, so it
was the one write in the product that skipped the offline check: choosing a
picture with no connection posted into the dark and reported the generic
failure rather than 9.1's "Couldn't save. You're offline." Nothing else about
it changes.

**Removal is not offered, and the reason is the contract.** 7.15 has a route
that sets an avatar and none that clears one, so `setViewerImage(undefined)`
would be a promise the API cannot keep; the screen's Remove control is behind
this seam and is drawn when a clearing route exists. Recorded at RFC 0005
change control item 55.

`squareImageFile` crosses verbatim: square because every avatar in the
product is a circle, centre-cropped to the short edge because "letting a
portrait photograph in un-cropped means the browser decides what to cut,
which is usually the top of somebody's head".
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
  const blob = await (await fetch(dataUrl)).blob()
  return new File([blob], 'avatar.jpg', { type: blob.type || 'image/jpeg' })
}

export function setViewerImage(image: string): void {
  const client = queryClient()
  void fileOf(image)
    .then((file) => uploadAvatar(file))
    .then(() => {
      void client?.invalidateQueries()
      /* polish: settings F7: an upload says when it has landed. */
      showToast('Picture updated')
    })
    .catch((error: unknown) => showToast(writeFailureMessage(error)))
}

/** 7.1's PATCH /me, the one field it takes (polish: settings F6). */
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
