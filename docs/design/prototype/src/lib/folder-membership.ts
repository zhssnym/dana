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
