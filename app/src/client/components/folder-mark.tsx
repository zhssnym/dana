/*
A folder's mark, wherever a folder is named.

`docs/design/prototype-v2/src/components/folder-mark.tsx`, read at `b316785`,
over this client's folder table. That prototype is deleted (`a7886df`,
2026-09-01); read it in git history before that commit. Its own header states
the fault it exists to fix and the fault survives the port whole, Imran on
2026-08-22: the sidebar
shows the glyph a person picked for a folder, a house for Home, a car for
Travel, "and everywhere else the same folder was still drawing the generic
one. This thing needs consistency not only in Assignments page, in all task
rows wherever they might be." The cause it names is worth carrying too,
because it recurs: DES-130 put a folder's identity somewhere, and only the two
surfaces written *after* that ruling ever read it, so identity stopped at the
sidebar's edge. "An identity that only some surfaces honour is not an
identity; it is a decoration on one screen."

**A folder with no chosen glyph still answers the plain folder**, which is why
this can replace a literal safely: the default is the thing it is replacing.

**The seam, and it is the whole of this file's difference from the original.**
The prototype resolves a folder's glyph and colour out of a `localStorage`
presentation store keyed by *name*, because a name is the only handle its
fixtures have. Dana's identity is 4.3's own `icon` and `color` columns,
answered by `GET /folders`, which the chrome already holds; `parts/presenters.
ts` is the one resolver over it and owns the glyph table and the default
colour, so this asks that module rather than writing a second answer. A second
resolver here is exactly the fault DES-130 exists to prevent, one level down.

**The key stays the name, and that is the seam's cost stated plainly.** Every
lifted surface calls `FolderMark` and `useFolderMark` with a folder's name,
because `ConceptTask['folder']` is a name and a colour, and rewriting those
call sites is what the lift discipline forbids. So this looks the name up in
the table rather than the id, and two folders that share a name resolve to the
first. That is narrower than it sounds and is not a defect this file can fix:
`lib/task-concept.ts` already carries the id on the concept folder for exactly
the calls that need one, and 7.4's list is per person rather than global. The
honest alternative, threading an id through six lifted files, is the rewrite
the strategy exists to avoid.

**And a second, smaller seam: `folderPageMark` does not cross**, being
`nav-model.ts`'s, which is the navigation adapter's, and imported by nothing
this row lifts. `folderMarkFor` does cross, and its own justification crosses
with it: it is "the same answer without a hook, for the call sites that cannot
have one, an icon passed as a prop, or a mark resolved inside a `.map`. It
reads the store directly, so it does not re-render when the identity changes;
every current caller is inside a menu that is mounted fresh each time it
opens, which is why that is acceptable here and would not be on a row." The
store it reads here is `lib/folder-library.ts`'s published snapshot of
`useFolders()`, which is the same query entry the hook above subscribes to.
*/

import { useFolders } from '../api/queries.js'
import { publishedFolders } from '../lib/folder-library.js'
import { folderMark } from '../parts/presenters.js'
import type { IconProps, LucideIcon } from '../lib/icons.js'
import type { Folder } from '../../shared/folders.js'

/*
**A task with no folder is in Desk**, and that fact is resolved here rather
than at each call site.

It was not, and the seam showed: the card's folder chip read its *label* as
`task.folder?.name ?? "Desk"` and its *icon* from the mark resolver, so an
unfiled task said "Desk" beside a generic folder mark. One fallback written
twice, once correctly. Every call site that asks either question now gets the
same answer, because there is only one place the question is answered.

The name is the default folder's, which 9.3's entry-default table gives as the
destination of every capture and 9.1 pins first in the sidebar.
*/
export const DEFAULT_FOLDER_NAME = 'Desk'

export function folderNameOf(name: string | undefined): string {
  return name?.trim() ? name : DEFAULT_FOLDER_NAME
}

/**
 * The folder the person actually has by that name, or nothing.
 *
 * Desk is the case the fallback is for. 4.3 makes the default folder a row
 * like any other, so a viewer who has one has it in this list under whatever
 * they renamed it to; a viewer whose list has not arrived yet has none, and
 * gets the plain glyph rather than a flash of the wrong one.
 */
function folderNamed(name: string, folders: readonly Folder[]): Folder | undefined {
  return folders.find((candidate) => candidate.name === name)
}

export function useFolderMark(
  name: string | undefined,
  /* What the row already believed the colour was. A folder the person has
     never dressed keeps it, so nothing changes colour just because this
     started being asked. */
  fallbackColor?: string,
): { Icon: LucideIcon; color: string | undefined } {
  const folders = useFolders()
  const resolved = folderNameOf(name)
  const folder = folderNamed(resolved, folders.data ?? [])
  const mark = folderMark(folder)
  return {
    Icon: mark.icon,
    color: folder === undefined ? fallbackColor : mark.color,
  }
}

/*
The same answer without a hook, for the call sites that cannot have one: an
icon passed as a prop, or a mark resolved inside a `.map`.
*/
export function folderMarkFor(name: string | undefined): LucideIcon {
  const resolved = folderNameOf(name)
  return folderMark(folderNamed(resolved, publishedFolders())).icon
}

/* The whole mark, for the call sites that just want to draw it. */
export function FolderMark({
  name,
  color,
  className = 'size-4',
  strokeWidth = 1.75,
}: {
  name: string | undefined
  color?: string
  className?: string
  strokeWidth?: number
}): React.JSX.Element {
  const mark = useFolderMark(name, color)
  const style: IconProps['style'] = mark.color ? { color: mark.color } : undefined
  return (
    <mark.Icon
      className={className}
      style={style}
      strokeWidth={strokeWidth}
      aria-hidden="true"
    />
  )
}
