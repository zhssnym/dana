/*
Every folder a person actually has, in one list.

`docs/design/prototype-v2/src/lib/folder-library.ts`, read at `7d2064c`, over
this client's query layer. Its own header states the fault it exists to fix
and the fault is not a fixture problem, so it survives the port intact:
`FOLDERS` in `task-model.ts` was four hardcoded names written for the row lab,
the shell shipped that lab constant into the real row and the real card, and
"the menu you moved a task with disagreed with the sidebar two centimetres
away: it omitted Business, Ideas and Reading list, omitted every folder the
person had made, kept showing any they had deleted, and used the pre-rename
name for any they had renamed."

Imran, 2026-08-22, on the folder chip's menu: "that list should be the real
existing folder library plus the 'New folder' option. It should be also in
other views of the tasks."

**The seam, and it is the whole of this file's difference from the original.**
The prototype assembles the list from four fixture sources in the sidebar's
own order, applies its renames, removes its deletions and honours each
folder's chosen colour out of a `localStorage` presentation store. It says in
its own last paragraph what the port would do instead: "In the shipping
product the client would hold `GET /folders`, which 7.4 already sorts
default-first then by name, and this function is the fixtures-shaped stand-in
for exactly that call." So this reads that call. Renames, deletions and
colours are not applied here because there is nothing to apply them to: the
response is what is true now, which is the property the prototype's four
paragraphs were reaching for.

**And a second, smaller seam: a choice carries its id.** The prototype's
`FolderChoice` is a name and a colour, because a name is the only handle its
store has. A picker in this client has to write `folder_id` into a 7.6 body,
so the id rides along and is the field a caller should use. The name stays
because it is what the menu says.

**No "New folder…" entry is appended here.** 9.3 requires it and ledger entry
L-059 records it as absent and owed; that entry names S23 with S24's dialog,
because the entry is a menu item whose act opens a dialog and neither the menu
nor the dialog exists yet. A list of folders that ends in something that is
not a folder would also make every caller filter it back out. This module
answers what the person has; offering "none of these" is the picker's.
*/

import { useMemo } from 'react'

import type { Folder } from '../../shared/folders.js'
import { useFolders } from '../api/queries.js'
import { folderMark } from '../parts/presenters.js'

export interface FolderChoice {
  /** 7.4's id. The prototype has no such field; see the header's second seam. */
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
export function folderLibrary(folders: readonly Folder[]): FolderChoice[] {
  return folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    color: folderMark(folder).color,
    isDefault: folder.is_default,
  }))
}

/**
 * The library as a surface takes it.
 *
 * `useFolders()` and not a fetch of its own: the chrome has already made this
 * read, so every chip, picker and menu on the page answers from one cache
 * entry and they cannot disagree about what folders exist. That is 8.3's
 * arrangement and it is the reason the prototype's disagreeing-menus fault
 * cannot recur here for a caching reason, only for a second-source one.
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
