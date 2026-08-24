/*
Who is looking, and what they look like.

Imran's brief of 2026-08-23, item 2: a profile picture, uploaded in Settings.

**It is a store rather than a Settings detail**, and that is the whole point of
putting it here. The viewer's face is drawn in at least four places — the
sidebar's account button, the Settings row, an assignee chip when the work is
yours, and the sharing panel's owner line — and a picture that only Settings
knew about would be a picture you could see nowhere except the screen where you
chose it. The same shape as every other store here: read it, subscribe to it,
and the surfaces update without being told.

**Downscaled hard, to 256px.** An avatar is never drawn larger than 40px in this
product, so anything above a couple of hundred is bytes nobody sees. It also
keeps the whole thing well inside \`localStorage\` beside the page images, which
have their own store for the opposite reason — those are content and can be
large, this is one small thing.

Lane 2: the ported version is the same object storage the page images need, plus
a column on the user. Google's account picture is the more interesting half —
sign-in already carries one, and the honest ported default is *that*, with an
upload as the override. Nothing here decides that; the drawing is the same
either way.
*/

import { useSyncExternalStore } from "react"

export const VIEWER_STORAGE_KEY = "dana:prototype-viewer"
const VIEWER_EVENT = "dana:prototype-viewer-change"

/* One person, in a fixtures prototype. The ported version reads the session. */
export const VIEWER_NAME = "Imran Wafa"
export const VIEWER_INITIALS = "IW"

/* Small, because nothing draws an avatar above 40px. */
const MAX_EDGE = 256
const QUALITY = 0.82

export interface Viewer {
  name: string
  initials: string
  /* A data URL, or nothing — in which case the initials stand in, which is
     what every avatar in the product already falls back to. */
  image?: string
}

let cached: Viewer | null = null

function read(): Viewer {
  const base: Viewer = { name: VIEWER_NAME, initials: VIEWER_INITIALS }
  if (typeof window === "undefined") return base
  try {
    const value = JSON.parse(window.localStorage.getItem(VIEWER_STORAGE_KEY) ?? "{}")
    return value && typeof value.image === "string"
      ? { ...base, image: value.image }
      : base
  } catch {
    return base
  }
}

function snapshot(): Viewer {
  if (!cached) cached = read()
  return cached
}

export function readViewer() {
  return snapshot()
}

function write(next: Viewer) {
  cached = next
  try {
    window.localStorage.setItem(
      VIEWER_STORAGE_KEY,
      JSON.stringify({ image: next.image }),
    )
  } catch {
    /* A full store costs the picture, not the session. */
  }
  window.dispatchEvent(new CustomEvent(VIEWER_EVENT, { detail: next }))
}

export function setViewerImage(image: string | undefined) {
  write({ ...snapshot(), image })
}

export function useViewer(): Viewer {
  return useSyncExternalStore(
    (notify) => {
      function onChange(event: Event) {
        cached = (event as CustomEvent<Viewer>).detail ?? read()
        notify()
      }
      function onStorage() {
        cached = null
        notify()
      }
      window.addEventListener(VIEWER_EVENT, onChange)
      window.addEventListener("storage", onStorage)
      return () => {
        window.removeEventListener(VIEWER_EVENT, onChange)
        window.removeEventListener("storage", onStorage)
      }
    },
    snapshot,
    () => FALLBACK,
  )
}

const FALLBACK: Viewer = { name: VIEWER_NAME, initials: VIEWER_INITIALS }

/*
A file, cropped square and shrunk.

Square because every avatar in the product is a circle, and letting a portrait
photograph in un-cropped means the browser decides what to cut — which is
usually the top of somebody's head. Centre-cropping to the short edge first is
the same choice a person would make.
*/
export function squareImageFile(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(null)
      return
    }
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const edge = Math.min(image.naturalWidth, image.naturalHeight)
      const canvas = document.createElement("canvas")
      canvas.width = Math.min(MAX_EDGE, edge)
      canvas.height = canvas.width
      const context = canvas.getContext("2d")
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
      const dataUrl = canvas.toDataURL("image/jpeg", QUALITY)
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
