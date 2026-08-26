import { record } from "@/lib/history"

export const PROTOTYPE_FOLDER_MEMBERSHIP_STORAGE_KEY =
  "dana:prototype-folder-memberships"
export const PROTOTYPE_FOLDER_MEMBERSHIP_EVENT =
  "dana:prototype-folder-membership-change"

export interface PrototypeFolderMembership {
  label: string | null
  color: string | null
}

export type PrototypeFolderMemberships = Record<
  string,
  PrototypeFolderMembership
>

export function readPrototypeFolderMemberships(): PrototypeFolderMemberships {
  if (typeof window === "undefined") return {}

  try {
    const value = JSON.parse(
      window.localStorage.getItem(PROTOTYPE_FOLDER_MEMBERSHIP_STORAGE_KEY) ??
        "{}",
    )
    if (!value || typeof value !== "object" || Array.isArray(value)) return {}

    return Object.fromEntries(
      Object.entries(value).filter(([, membership]) => {
        if (!membership || typeof membership !== "object") return false
        const candidate = membership as Partial<PrototypeFolderMembership>
        return (
          (candidate.label === null || typeof candidate.label === "string") &&
          (candidate.color === null || typeof candidate.color === "string")
        )
      }),
    ) as PrototypeFolderMemberships
  } catch {
    return {}
  }
}

export function savePrototypeFolderMembership(
  folderName: string,
  membership: PrototypeFolderMembership,
) {
  const memberships = readPrototypeFolderMemberships()
  const next = { ...memberships, [folderName]: membership }
  /* A shelf change is a move, and it is recorded where it happens (DES-198's
     rule for the acts, applied to the one that had no menu of its own). */
  if (membership.label !== memberships[folderName]?.label) {
    record({
      kind: "folder",
      subject: folderName,
      name: folderName,
      verb: "moved",
      detail: membership.label ? `to ${membership.label}` : "off its shelf",
    })
  }
  window.localStorage.setItem(
    PROTOTYPE_FOLDER_MEMBERSHIP_STORAGE_KEY,
    JSON.stringify(next),
  )
  window.dispatchEvent(
    new CustomEvent(PROTOTYPE_FOLDER_MEMBERSHIP_EVENT, {
      detail: { folderName, membership },
    }),
  )
}

export function savePrototypeFolderMemberships(
  updates: PrototypeFolderMemberships,
) {
  const memberships = readPrototypeFolderMemberships()
  const next = { ...memberships, ...updates }
  window.localStorage.setItem(
    PROTOTYPE_FOLDER_MEMBERSHIP_STORAGE_KEY,
    JSON.stringify(next),
  )

  Object.entries(updates).forEach(([folderName, membership]) => {
    window.dispatchEvent(
      new CustomEvent(PROTOTYPE_FOLDER_MEMBERSHIP_EVENT, {
        detail: { folderName, membership },
      }),
    )
  })
}

export function removePrototypeFolderMembership(folderName: string) {
  const memberships = readPrototypeFolderMemberships()
  if (!(folderName in memberships)) return
  const next = { ...memberships }
  delete next[folderName]
  window.localStorage.setItem(
    PROTOTYPE_FOLDER_MEMBERSHIP_STORAGE_KEY,
    JSON.stringify(next),
  )
}

/*
Which shelf a folder is on — the one answer, asked by everybody.

Imran, 2026-08-23: the Shelf page needed this and the sidebar already had it,
written inline: *an override if there is one, otherwise the fixture's own
label.* Two words of logic, and exactly the shape [[DES-155]] took out of the
folder mark — a rule living inside the surface that happened to need it first,
so the second surface writes a second copy and the two disagree the first time
somebody moves a folder.

The distinction the override carries is the part that cannot be guessed:
**having no entry is different from having an entry of `null`.** No entry means
"nobody has moved this, use the fixture"; `null` means "somebody took it off its
shelf". Collapsing the two puts a folder back on a shelf its owner removed it
from.
*/
export function folderShelf(
  folderName: string,
  base: Map<string, string> | Record<string, string>,
  memberships: PrototypeFolderMemberships = readPrototypeFolderMemberships(),
): string | null {
  if (Object.prototype.hasOwnProperty.call(memberships, folderName)) {
    return memberships[folderName]?.label ?? null
  }
  const fallback =
    base instanceof Map ? base.get(folderName) : base[folderName]
  return fallback ?? null
}

/* The fixtures' own labels, as a map. Built from whatever list of groups the
   caller has, so this module never imports the fixtures. */
export function baseShelfLabels(
  groups: Array<{ label: string; folders: Array<{ name: string }> }>,
) {
  return new Map(
    groups.flatMap((group) =>
      group.folders.map((folder) => [folder.name, group.label] as const),
    ),
  )
}
