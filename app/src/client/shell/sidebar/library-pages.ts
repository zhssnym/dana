/* What the Library column draws from the viewer's folders and shelves. */
import type { Folder } from '../../../shared/folders.js'
import type { Shelf } from '../../../shared/shelves.js'

/** A temporary shelf name that is unique in the viewer's current Library. */
export function untitledCollectionName(shelves: readonly Shelf[]): string {
  const names = new Set(shelves.map((shelf) => shelf.name.toLocaleLowerCase()))
  const base = 'Untitled collection'
  if (!names.has(base.toLocaleLowerCase())) return base
  for (let number = 2; ; number += 1) {
    const candidate = `${base} ${String(number)}`
    if (!names.has(candidate.toLocaleLowerCase())) return candidate
  }
}

export function inboxOf(folders: readonly Folder[]): Folder | null {
  return folders.find((folder) => folder.is_default) ?? null
}

/* Tabs are project-internal navigation, not Library rows. A true sub-page may
   live directly under a tab, so removing the tab must lift that parent edge to
   the project root. This mirrors the server's old-client projection, but only
   for the sidebar surface that deliberately keeps Tabs separate. */
export function libraryPages(folders: readonly Folder[]): Folder[] {
  const tabProjects = new Map(
    folders
      .filter((folder) => folder.tab_position !== null && folder.id !== folder.project_id)
      .map((folder) => [folder.id, folder.project_id]),
  )
  return folders
    .filter((folder) => !tabProjects.has(folder.id))
    .map((folder) => {
      const parent = folder.parent_folder_id
      if (parent === null || parent === undefined) return folder
      const lifted = tabProjects.get(parent)
      return lifted === undefined ? folder : { ...folder, parent_folder_id: lifted }
    })
}
