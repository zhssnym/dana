/*
A group heading's mark, drawn.

`views/grouping.ts` says which kind of mark an axis produced and never how to
draw one, for the reason that file is pure: it is the axis's answer and has
no folders, no components and no colours. This is the other half, and it is
one function so that Today, Scheduled, Assignments, All, Anytime, Abandoned
and Done cannot each grow their own.

**The mark is optional in the honest sense**: "if a section does not carry an
icon, the section should not feel like it's lacking something." A date rung
has no mark, this returns `undefined`, and `components/page/PageSection.tsx` renders no
slot at all, so that heading simply starts its name earlier.

**Both marks come from the resolvers the rest of the product uses**, which is
the whole point of the package this arrived in: a folder heading draws the
same glyph and colour as that folder's Library row and its task chips
(`parts/presenters.ts`), and a person heading draws the same disc, in the same
tint, as that person's assignee chip and roster row
(`components/person-face.tsx`).
*/
import type { ReactNode } from 'react'

import { PersonFace } from '../components/person-face.js'
import { folderMark, initialsOf } from '../parts/presenters.js'
import type { GroupMark } from './grouping.js'
import type { Folder } from '../../shared/folders.js'

export function groupHeadingMedia(
  mark: GroupMark | null,
  folders: readonly Folder[],
): ReactNode {
  if (mark === null) return undefined
  if (mark.kind === 'person') {
    /*
    Hidden from the accessible name, and this is the one thing about a face in
    a heading that is not obvious.

    A folder's mark is an `svg` and already `aria-hidden`, so it contributes
    nothing. A person's disc renders their initials as *text*, so a heading
    control drawing one un-hidden would be named "H You" rather than "You",
    and 9.1 requires a collapsible section's control to carry the section's
    name. The person is named beside it in the heading either way, so nothing
    is lost by hiding the disc: it is the second cue, which is this client's
    standing rule for anything a colour or a glyph says.
    */
    return (
      <span aria-hidden="true" className="flex shrink-0 items-center">
        {/* The prototype's own heading face, 20px: `assignments-screen.tsx`
            and `grouped-screen.tsx` both draw a section's avatar at
            `size-5 shrink-0 data-[size=sm]:size-5`, one step above the row's
            dense disc, because a heading's mark is read before the rows under
            it. */}
        <PersonFace
          id={mark.id}
          name={mark.name}
          initials={initialsOf(mark.name)}
          image={mark.image}
          dense
          className="size-5 shrink-0 data-[size=sm]:size-5"
        />
      </span>
    )
  }
  const resolved = folderMark(folders.find((folder) => folder.id === mark.folderId))
  return (
    <resolved.icon
      className="size-4 shrink-0"
      style={{ color: resolved.color }}
      strokeWidth={1.75}
      aria-hidden="true"
    />
  )
}
