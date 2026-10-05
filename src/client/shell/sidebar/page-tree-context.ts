import { createContext, useContext } from 'react'
import { folderGates } from '../../lib/folder-authority.js'
import type { Point } from '../library-drag.js'
import type { PageTree, TreeDrop } from '../page-tree.js'
import type { Folder } from '../../../shared/folders.js'

export const TREE_KEY = 'library:page-tree'

/* A context, not props, because a row at any depth asks the same questions. */
export interface PageTreeValue {
  readonly tree: PageTree
  readonly folded: ReadonlySet<string>
  readonly toggle: (id: string) => void
  readonly mark: TreeDrop['mark'] | null
  readonly probe: (carried: Folder, point: Point, allowRoot: boolean) => TreeDrop | null
  readonly clearMark: () => void
  readonly commit: (carried: Folder, drop: TreeDrop) => void
  readonly addInside: (parent: Folder) => void
  readonly mayEdit: (folder: Folder) => boolean
  readonly renaming: string | null
  readonly startRename: (id: string) => void
  readonly rename: (folder: Folder, name: string | null) => void
  readonly trash: (folder: Folder) => void
  readonly archive: (folder: Folder) => void
  readonly leave: (folder: Folder) => void
  readonly leaving: Folder | null
  readonly confirmLeave: () => void
  readonly cancelLeave: () => void
}

export const PageTreeContext = createContext<PageTreeValue | null>(null)

export function usePageTree(): PageTreeValue {
  const value = useContext(PageTreeContext)
  if (value === null) throw new Error('usePageTree outside the Library')
  return value
}

export function mayEditPage(folder: Folder): boolean {
  return folderGates({
    access: folder.my_access,
    isOwner: folder.is_owner,
    isDefault: folder.is_default,
  }).identity
}
