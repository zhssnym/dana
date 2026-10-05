// The viewer from `/me`, and their avatar writes. Uploads are squared to 256px first and
// go through `api/http.ts`, so they get the offline check every write has.
import { useMe } from '../api/queries.js'
import { mutateApi, uploadAvatar } from '../api/http.js'
import { queryClient, writeFailureMessage } from '../api/queryClient.js'
import { showToast } from '../state/toasts.js'
import { initialsOf } from '../parts/presenters.js'

// Small, because nothing draws an avatar above 40px.
const MAX_EDGE = 256
const QUALITY = 0.82

export interface Viewer {
  // The user id, which the default face is keyed by.
  id?: string
  name: string
  initials: string
  email: string
  timezone: string
  // The served upload path, or nothing, in which case the default face stands in.
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
    id: user.id,
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
    // Success says nothing: the picture changing is the answer.
    .then(() => void client?.invalidateQueries())
    .catch((error: unknown) => showToast(writeFailureMessage(error)))
}

/**
 * Through `mutateApi` for the CSRF header and offline check; invalidating updates every
 * surface at once.
 */
export function clearViewerImage(): void {
  const client = queryClient()
  void mutateApi(null, { method: 'DELETE', path: '/me/avatar' })
    .then(() => void client?.invalidateQueries())
    .catch((error: unknown) => showToast(writeFailureMessage(error)))
}

/** The one field PATCH /me takes. */
export function setViewerTimezone(timezone: string): void {
  const client = queryClient()
  void mutateApi(null, { method: 'PATCH', path: '/me', body: { timezone } })
    .then(() => void client?.invalidateQueries())
    .catch((error: unknown) => showToast(writeFailureMessage(error)))
}

// Centre-cropped square, because avatars are circles and an uncropped portrait loses the
// top of the head.
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
