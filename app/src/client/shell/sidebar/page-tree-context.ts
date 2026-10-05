/* The page tree every Library row reads. */
import { createContext, useContext } from 'react'
import { folderGates } from '../../lib/folder-authority.js'
import type { Point } from '../library-drag.js'
import type { PageTree, TreeDrop } from '../page-tree.js'
import type { Folder } from '../../../shared/folders.js'

/** What the drop key says to the engine: the tree answers this point. */
export const TREE_KEY = 'library:page-tree'

/*
The page tree as every Library row sees it: the tree, the folds, what a drop
here would do, and the three acts (move, add inside, fold). One context
rather than props through the shelves, because a row at any depth in any
container asks the same questions.
*/
export interface PageTreeValue {
  readonly tree: PageTree
  readonly folded: ReadonlySet<string>
  readonly toggle: (id: string) => void
  readonly mark: TreeDrop['mark'] | null
  /** The drop a carried page proposes at a point, drawn as it is found. */
  readonly probe: (carried: Folder, point: Point, allowRoot: boolean) => TreeDrop | null
  readonly clearMark: () => void
  readonly commit: (carried: Folder, drop: TreeDrop) => void
  readonly addInside: (parent: Folder) => void
  readonly mayEdit: (folder: Folder) => boolean
  /** The row being renamed in place, and the acts a row's menu runs here. */
  readonly renaming: string | null
  readonly startRename: (id: string) => void
  readonly rename: (folder: Folder, name: string | null) => void
  readonly trash: (folder: Folder) => void
  readonly archive: (folder: Folder) => void
  readonly leave: (folder: Folder) => void
  /** The page whose leave is being confirmed. */
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
