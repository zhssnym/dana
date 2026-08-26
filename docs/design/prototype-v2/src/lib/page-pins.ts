/*
Which views are pinned to the sidebar.

DES-153's second half: **Settings is a pin list, not a page list.** One list
of every view a person has — shipped and, later, self-made — each with a pin
toggle, and the sidebar shows the pinned ones. That is the constraint that
stops the sidebar sprawling as views multiply: make fifty, pin three.

What this replaces is three named booleans — `Important`, `All`, `Done` —
which was v1's shape and could only ever describe v1's pages. Adding Abandoned
and Anytime to that would have meant adding two more booleans, and a person's
own saved view could never be in it at all. A map keyed by name has no such
ceiling, and it is also the shape the eventual column takes.

**A page that cannot be unpinned is not in the map.** `hideable: false` is
declared on the page (see `nav-model`), and this module never sees it — asking
here would put the same rule in two places, which is how one of them ends up
disagreeing.

Presentation only, and this is the honest half of DES-153: toggling *shipped*
views is free because the booleans already exist in `user_settings`. Views a
person makes themselves need a table and endpoints and stay NEEDS BACKEND.
*/

import { useSyncExternalStore } from "react"

import { NAV_PAGES, type NavPageName } from "@/lib/nav-model"

export const PAGE_PINS_STORAGE_KEY = "dana:prototype-page-pins"
const PAGE_PINS_EVENT = "dana:prototype-page-pins-change"

export type PagePins = Partial<Record<NavPageName, boolean>>

/* One parsed copy, so `useSyncExternalStore` gets a stable snapshot rather
   than a fresh object per read — the same arrangement `folder-presentation`
   uses, and for the same reason (a new object every read is an infinite
   render). */
let cached: PagePins | null = null

function read(): PagePins {
  if (typeof window === "undefined") return {}
  try {
    const value = JSON.parse(
      window.localStorage.getItem(PAGE_PINS_STORAGE_KEY) ?? "{}",
    )
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as PagePins)
      : {}
  } catch {
    return {}
  }
}

function snapshot(): PagePins {
  if (!cached) cached = read()
  return cached
}

export function setPagePinned(name: NavPageName, pinned: boolean) {
  const next = { ...snapshot(), [name]: pinned }
  cached = next
  window.localStorage.setItem(PAGE_PINS_STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(PAGE_PINS_EVENT, { detail: next }))
}

export function usePagePins(): PagePins {
  return useSyncExternalStore(
    (notify) => {
      function onChange(event: Event) {
        cached = (event as CustomEvent<PagePins>).detail ?? read()
        notify()
      }
      function onStorage() {
        cached = null
        notify()
      }
      window.addEventListener(PAGE_PINS_EVENT, onChange)
      window.addEventListener("storage", onStorage)
      return () => {
        window.removeEventListener(PAGE_PINS_EVENT, onChange)
        window.removeEventListener("storage", onStorage)
      }
    },
    snapshot,
    () => ({}),
  )
}

/*
Whether a page shows in the sidebar right now.

The shipped default is the page's own `pinned`; a person's choice overrides
it. A page that cannot be hidden is always shown, whatever is in the store —
because the store could carry a stale `false` from before that rule existed,
and a rule that only holds for new data is not a rule.
*/
export function isPagePinned(name: NavPageName, pins: PagePins): boolean {
  const page = NAV_PAGES.find((candidate) => candidate.name === name)
  if (!page) return false
  if (page.hideable === false) return true
  return pins[name] ?? page.pinned
}
