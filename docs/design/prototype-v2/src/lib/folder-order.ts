/*
The order a person put their folders in.

Until now the sidebar had none. Groups sorted by label, folders sorted by
name, and the alphabet decided where everything went — which is a reasonable
first arrangement and a poor permanent one, because the folders somebody
reaches for hourly are not the ones whose names begin with A. DES-169 settled
the same question one level down ("an arrangement is a person's, so it is
kept") for a page's sections; this is that ruling applied to the directory.

**The alphabet is the seed, not the rule.** Nothing is stored until somebody
drags something, so a sidebar nobody has touched still reads exactly as it
did — which is also why the clean-handoff export is unaffected. From the first
drag on, the stored list is the authority for the entries it names and the
alphabet places the rest, so a folder made tomorrow still has a defined home
without anybody having to decide where new things go.

**Two levels, because the sidebar has two.** `entries` is the directory itself,
top to bottom, holding groups and loose folders in one sequence — they share a
column, so they share an order. `within` is each group's own folders. A
folder's *membership* is not here: which group it belongs to already lives in
`folder-membership`, and storing it twice is how the two come to disagree.

**The arrangement is a person's, not the folder's** (DES-180). A folder group
is already a personal label — the group dialog says so in its own words — and
an order is the same kind of fact: both answer *how do I keep my desk*, and
neither says anything about the folder itself. Two people sharing a folder must
never be able to move it in each other's sidebar. So a ported version is a
per-user position beside the existing membership row, never a column on the
folder; the shape survives the port even though this storage does not.
*/

import { useSyncExternalStore } from "react"

export const FOLDER_ORDER_STORAGE_KEY = "dana:prototype-folder-order"
const FOLDER_ORDER_EVENT = "dana:prototype-folder-order-change"

export interface FolderOrder {
  /* The directory, top to bottom, as entry keys. */
  entries: string[]
  /* Each group's folders, in the order they sit under its heading. */
  within: Record<string, string[]>
}

export const EMPTY_FOLDER_ORDER: FolderOrder = { entries: [], within: {} }

/* Groups and folders share one sequence, so their keys have to be tellable
   apart — a group called "Home" and a folder called "Home" are different
   entries and a bare name could not say which. */
export const groupEntry = (label: string) => `group:${label}`
export const folderEntry = (name: string) => `folder:${name}`
export const isGroupEntry = (key: string) => key.startsWith("group:")
export const entryLabel = (key: string) => key.slice(key.indexOf(":") + 1)

function read(): FolderOrder {
  if (typeof window === "undefined") return EMPTY_FOLDER_ORDER
  try {
    const value = JSON.parse(
      window.localStorage.getItem(FOLDER_ORDER_STORAGE_KEY) ?? "{}",
    ) as Partial<FolderOrder>
    const entries = Array.isArray(value.entries)
      ? value.entries.filter((key): key is string => typeof key === "string")
      : []
    const within =
      value.within && typeof value.within === "object" && !Array.isArray(value.within)
        ? Object.fromEntries(
            Object.entries(value.within)
              .filter(([, names]) => Array.isArray(names))
              .map(([label, names]) => [
                label,
                (names as unknown[]).filter(
                  (name): name is string => typeof name === "string",
                ),
              ]),
          )
        : {}
    return { entries, within }
  } catch {
    return EMPTY_FOLDER_ORDER
  }
}

/* One parsed copy, so `useSyncExternalStore` gets a stable snapshot rather
   than a fresh object per read — a new object every read is an infinite
   render, which `folder-presentation` learned first. */
let cached: FolderOrder | null = null

function snapshot(): FolderOrder {
  if (!cached) cached = read()
  return cached
}

export function saveFolderOrder(next: FolderOrder) {
  cached = next
  window.localStorage.setItem(FOLDER_ORDER_STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(FOLDER_ORDER_EVENT, { detail: next }))
}

export function useFolderOrder(): FolderOrder {
  return useSyncExternalStore(
    (notify) => {
      function onChange(event: Event) {
        cached = (event as CustomEvent<FolderOrder>).detail ?? read()
        notify()
      }
      function onStorage() {
        cached = null
        notify()
      }
      window.addEventListener(FOLDER_ORDER_EVENT, onChange)
      window.addEventListener("storage", onStorage)
      return () => {
        window.removeEventListener(FOLDER_ORDER_EVENT, onChange)
        window.removeEventListener("storage", onStorage)
      }
    },
    /* The clean-handoff export reads as untouched, the same way a picked
       glyph and a chosen cover do. */
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("handoff") === "clean"
        ? EMPTY_FOLDER_ORDER
        : snapshot(),
    () => EMPTY_FOLDER_ORDER,
  )
}

/*
The stored order laid over a default one.

Stable by construction: an item the store names takes its stored position, and
one it does not keeps its place in the default sequence, at the end. That is
the property that lets a new folder appear without anyone deciding where new
folders go, and lets a stored key for a deleted folder do no harm at all.
*/
export function arrange<T>(items: T[], keyOf: (item: T) => string, stored: string[]): T[] {
  if (stored.length === 0) return items
  const rank = new Map(stored.map((key, index) => [key, index]))
  return items
    .map((item, index) => ({ item, index, at: rank.get(keyOf(item)) ?? Infinity }))
    .sort((a, b) => a.at - b.at || a.index - b.index)
    .map((entry) => entry.item)
}

/* Move one item and return the whole sequence, which is what gets stored:
   a list of positions is only meaningful as a list. */
export function moved(keys: string[], from: number, to: number): string[] {
  const next = [...keys]
  const [item] = next.splice(from, 1)
  if (item !== undefined) next.splice(to, 0, item)
  return next
}
