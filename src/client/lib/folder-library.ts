// Every folder the person has, from `GET /folders`, in the server's order. A choice
// carries its id for `folder_id` writes. No "New folder…" entry; that is the picker's.

import { useEffect } from 'react'

import type { Folder } from '../../shared/folders.js'
import { useFolders } from '../api/queries.js'
import { folderMark } from '../parts/presenters.js'

export interface FolderChoice {
  readonly id: string
  readonly name: string
  readonly color: string
  /** Lets a picker find Desk without a name match. */
  readonly isDefault: boolean
}

/** Mapped, never sorted: the server already fixed the order. */
export function folderLibrary(folders?: readonly Folder[]): FolderChoice[] {
  return (folders ?? published).map((folder) => ({
    id: folder.id,
    name: folder.name,
    color: folderMark(folder).color,
    isDefault: folder.is_default,
  }))
}

// Optional because some callers sit inside menus where no hook can run; the bare call
// reads the snapshot the bridge below publishes from `useFolders()`.
let published: readonly Folder[] = []

/** The published rows, for `folderMarkFor` in `components/folder-mark.tsx`. */
export function publishedFolders(): readonly Folder[] {
  return published
}

/**
 * The bridge, mounted once by the shell. A component, not an effect in
 * `useFolderLibrary`, so there is one publisher.
 */
export function FolderLibraryMemory(): null {
  const folders = useFolders()
  const rows = folders.data
  useEffect(() => {
    published = rows ?? []
  }, [rows])
  return null
}
