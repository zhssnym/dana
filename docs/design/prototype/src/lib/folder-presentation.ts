export const PROTOTYPE_FOLDER_PRESENTATION_STORAGE_KEY =
  "dana:prototype-folder-presentation"
export const PROTOTYPE_FOLDER_PRESENTATION_EVENT =
  "dana:prototype-folder-presentation-change"

export interface PrototypeFolderPresentation {
  names: Record<string, string>
  deleted: string[]
}

const emptyPresentation: PrototypeFolderPresentation = {
  names: {},
  deleted: [],
}

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
    }
  } catch {
    return emptyPresentation
  }
}

function savePresentation(next: PrototypeFolderPresentation) {
  window.localStorage.setItem(
    PROTOTYPE_FOLDER_PRESENTATION_STORAGE_KEY,
    JSON.stringify(next),
  )
  window.dispatchEvent(
    new CustomEvent(PROTOTYPE_FOLDER_PRESENTATION_EVENT, { detail: next }),
  )
}

export function renamePrototypeFolder(folderName: string, displayName: string) {
  const current = readPrototypeFolderPresentation()
  savePresentation({
    ...current,
    names: { ...current.names, [folderName]: displayName.trim() },
  })
}

export function deletePrototypeFolder(folderName: string) {
  const current = readPrototypeFolderPresentation()
  savePresentation({
    names: current.names,
    deleted: [...new Set([...current.deleted, folderName])],
  })
}

export function restorePrototypeFolder(folderName: string) {
  const current = readPrototypeFolderPresentation()
  if (!current.deleted.includes(folderName)) return
  savePresentation({
    ...current,
    deleted: current.deleted.filter((name) => name !== folderName),
  })
}
