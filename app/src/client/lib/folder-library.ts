/*
Every folder a person actually has, in one list.

A hardcoded folder list in a menu disagrees with the sidebar two centimetres
away: it omits folders the person made, keeps showing any they deleted, and uses
the pre-rename name for any they renamed. The folder chip's menu, and every
other view of a task, lists the real folder library.

This reads `GET /folders`, which 7.4 sorts default-first then by name. Renames,
deletions and colours are not applied here because there is nothing to apply
them to: the response is what is true now.

**A choice carries its id.** A picker in this client has to write `folder_id`
into a 7.6 body, so the id rides along and is the field a caller should use. The
name stays because it is what the menu says.

**No "New folder…" entry is appended here.** 9.3 requires one in the picker, but
a list of folders that ends in something that is not a folder would make every
caller filter it back out. This module answers what the person has; offering
"none of these" is the picker's.
*/

import { useEffect, useMemo } from 'react'

import type { Folder } from '../../shared/folders.js'
import { useFolders } from '../api/queries.js'
import { folderMark } from '../parts/presenters.js'

export interface FolderChoice {
  /** 7.4's id; see the header. */
  readonly id: string
  readonly name: string
  readonly color: string
  /** 7.4's `is_default`, so a picker can say which one Desk is without a name match. */
  readonly isDefault: boolean
}

/**
 * The library, from the folder table.
 *
 * Pure, and mapped rather than sorted: 7.4 answers default-first then by name
 * and section 6's rule that "clients never re-sort" is a rule about every
 * ordered response, not only about view rows. A sort here would be this
 * client's own opinion of an order the server already fixed.
 */
export function folderLibrary(folders?: readonly Folder[]): FolderChoice[] {
  return (folders ?? published).map((folder) => ({
    id: folder.id,
    name: folder.name,
    color: folderMark(folder).color,
    isDefault: folder.is_default,
  }))
}

/*
The argument is optional.

`components/task-row.tsx` and `components/task-card.tsx` call `folderLibrary()`
bare, and each call sits inside a menu rather than at the top of a component:
one is in a `.map` over a list, one in a ternary's true branch, one in a chip's
render callback. A hook cannot be called from any of those.

So the list is published into this module by the bridge below, and the bare call
reads the snapshot. This is the arrangement `components/folder-mark.tsx` argues
for: it reads the store directly, so it does not re-render when the identity
changes; every current caller is inside a menu that is mounted fresh each time
it opens, which is why that is acceptable here and would not be on a row.

**The pure form stays**: `useFolderLibrary` passes the rows it read, the unit
tests pin the ordering rule against a list they hand in, and a caller holding a
list never depends on what some bridge last published.

**And there is still one record.** The snapshot is `useFolders()`'s own data,
not a second fetch and not a cache of a cache: the bridge subscribes to the same
query entry every hook reader subscribes to, so what is published is what the
subscribed readers are already rendering, one 8.3 refetch at a time.
*/
let published: readonly Folder[] = []

/** The rows behind the bare call, for the one other module that needs them
    without a hook. See `components/folder-mark.tsx`'s `folderMarkFor`. */
export function publishedFolders(): readonly Folder[] {
  return published
}

/**
 * The bridge, mounted once by the shell. Renders nothing.
 *
 * A component rather than an effect inside `useFolderLibrary`, because that
 * hook has many callers and a publisher with many writers is a publisher whose
 * value depends on unmount order.
 */
export function FolderLibraryMemory(): null {
  const folders = useFolders()
  const rows = folders.data
  useEffect(() => {
    published = rows ?? []
  }, [rows])
  return null
}

/**
 * The library as a surface takes it.
 *
 * `useFolders()` and not a fetch of its own: the chrome has already made this
 * read, so every chip, picker and menu on the page answers from one cache entry
 * and they cannot disagree about what folders exist. That is 8.3's arrangement.
 *
 * An empty list while the read is in flight or after it fails, rather than a
 * throw: a folder picker that cannot list folders offers nothing, and the
 * shared error treatment belongs to the page around it.
 */
export function useFolderLibrary(): FolderChoice[] {
  const folders = useFolders()
  const rows = folders.data
  return useMemo(() => folderLibrary(rows ?? []), [rows])
}
