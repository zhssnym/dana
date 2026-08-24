import { useSyncExternalStore } from "react"
import { record } from "@/lib/history"
import { trash } from "@/lib/trash"

export const PROTOTYPE_FOLDER_PRESENTATION_STORAGE_KEY =
  "dana:prototype-folder-presentation"
export const PROTOTYPE_FOLDER_PRESENTATION_EVENT =
  "dana:prototype-folder-presentation-change"

/*
What a folder looks like, beyond its name: the glyph a person picked for it,
the colour that glyph wears, the cover on its page, and the description under
its title. All of it is DES-130 and Lane 2 — the shipping folder has none of
these columns (DES-054 has owed the icon since v1) — so it lives here, in the
prototype's own storage, beside the rename/delete presentation state that was
already fixtures-only.

An uploaded cover is the one thing that does not persist: it is an object URL,
alive for the session, gone on reload. Persisting real image bytes into
localStorage is how a prototype invents a worse version of the storage problem
the real feature has to solve (DES-105); the picker's patterns and
illustrations persist by key and uploads are honestly ephemeral.
*/
export interface PrototypeFolderIdentity {
  glyph?: string
  color?: string
  cover?: string
  /* Vertical crop of a photographic cover, 0–100; gradients have no crop. */
  coverPos?: number
  description?: string
}

export interface PrototypeFolderPresentation {
  names: Record<string, string>
  deleted: string[]
  identity: Record<string, PrototypeFolderIdentity>
}

const emptyPresentation: PrototypeFolderPresentation = {
  names: {},
  deleted: [],
  identity: {},
}

const EMPTY_IDENTITY: PrototypeFolderIdentity = {}

export function readPrototypeFolderPresentation(): PrototypeFolderPresentation {
  if (typeof window === "undefined") return emptyPresentation

  try {
    const value = JSON.parse(
      window.localStorage.getItem(
        PROTOTYPE_FOLDER_PRESENTATION_STORAGE_KEY,
      ) ?? "{}",
    ) as Partial<PrototypeFolderPresentation>

    return {
      names:
        value.names && typeof value.names === "object" && !Array.isArray(value.names)
          ? Object.fromEntries(
              Object.entries(value.names).filter(
                ([, name]) => typeof name === "string" && Boolean(name.trim()),
              ),
            )
          : {},
      deleted: Array.isArray(value.deleted)
        ? value.deleted.filter((name): name is string => typeof name === "string")
        : [],
      identity:
        value.identity &&
        typeof value.identity === "object" &&
        !Array.isArray(value.identity)
          ? (value.identity as Record<string, PrototypeFolderIdentity>)
          : {},
    }
  } catch {
    return emptyPresentation
  }
}

/* One parsed copy, kept true by savePresentation and by the change event, so
   `useSyncExternalStore` gets stable snapshots instead of a fresh parse (and
   a fresh object, and an infinite render) per read. */
let cached: PrototypeFolderPresentation | null = null

function snapshot(): PrototypeFolderPresentation {
  if (!cached) cached = readPrototypeFolderPresentation()
  return cached
}

function savePresentation(next: PrototypeFolderPresentation) {
  cached = next
  window.localStorage.setItem(
    PROTOTYPE_FOLDER_PRESENTATION_STORAGE_KEY,
    JSON.stringify(next),
  )
  window.dispatchEvent(
    new CustomEvent(PROTOTYPE_FOLDER_PRESENTATION_EVENT, { detail: next }),
  )
}

function subscribe(onChange: () => void) {
  function handle(event: Event) {
    const detail = (event as CustomEvent<PrototypeFolderPresentation>).detail
    cached = detail ?? readPrototypeFolderPresentation()
    onChange()
  }
  window.addEventListener(PROTOTYPE_FOLDER_PRESENTATION_EVENT, handle)
  return () =>
    window.removeEventListener(PROTOTYPE_FOLDER_PRESENTATION_EVENT, handle)
}

/* A folder's picked look, live. The clean-handoff preview reads as unset so
   exports stay deterministic, the same rule shell-page applies to names. */
export function useFolderIdentity(name: string): PrototypeFolderIdentity {
  return useSyncExternalStore(subscribe, () => {
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("handoff") === "clean"
    ) {
      return EMPTY_IDENTITY
    }
    return snapshot().identity[name] ?? EMPTY_IDENTITY
  })
}

export function savePrototypeFolderIdentity(
  folderName: string,
  patch: Partial<PrototypeFolderIdentity>,
) {
  const current = snapshot()
  savePresentation({
    ...current,
    identity: {
      ...current.identity,
      [folderName]: { ...current.identity[folderName], ...patch },
    },
  })
}

export function renamePrototypeFolder(folderName: string, displayName: string) {
  const current = snapshot()
  const was = current.names[folderName] ?? folderName
  const now = displayName.trim()
  savePresentation({
    ...current,
    names: { ...current.names, [folderName]: now },
  })
  /* Written here rather than by the surface that asked, for the reason the
     whole log is built this way: three menus can rename a folder and only one
     of them would have remembered (lib/history). Coalescing turns a typed
     name into one line. */
  if (now && now !== was) {
    record({ kind: "folder", subject: folderName, name: now, verb: "renamed",
      detail: `from “${was}”` })
  }
}

export function deletePrototypeFolder(folderName: string) {
  const current = snapshot()
  /* Idempotent, because the act now has two callers — the shell does it and
     the event listener does it — and the second must not write a second
     history line or a second trash entry. Saying "already gone" here is
     cheaper than making the callers coordinate. */
  if (current.deleted.includes(folderName)) return
  /* Restorable for thirty days, like everything else deletable. A folder
     already had a `deleted` list here, which is the soft delete Trash needs —
     what was missing was anywhere to see it from. */
  trash({
    kind: "folder",
    subject: folderName,
    name: current.names[folderName] ?? folderName,
  })
  /*
  With the bar, which it did not have (DES-216).

  [[DES-200]] removed the folder's delete confirmation on the stated grounds
  that a folder now has *two* ways back — the undo bar and thirty days in the
  Trash. Only one of them existed: this recorded the act and passed no inverse,
  so nothing appeared in the corner. Removing a question on the strength of a
  safety net that was never built is the worst kind of mistake to make, because
  the reasoning reads correct in the decision record while the product is
  quietly less safe than it says.
  */
  record({
    kind: "folder",
    subject: folderName,
    name: current.names[folderName] ?? folderName,
    verb: "deleted",
    undo: () => restorePrototypeFolder(folderName),
  })
  savePresentation({
    ...current,
    deleted: [...new Set([...current.deleted, folderName])],
  })
}

export function restorePrototypeFolder(folderName: string) {
  const current = snapshot()
  if (!current.deleted.includes(folderName)) return
  savePresentation({
    ...current,
    deleted: current.deleted.filter((name) => name !== folderName),
  })
}
