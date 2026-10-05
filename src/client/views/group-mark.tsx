/*
 * A group heading's mark: a folder's or a person's, from the same resolvers as rows and chips. Date rungs have
 * none.
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
     * Hidden from the accessible name: a person's disc renders initials as text, which would rename the
     * heading's control.
     */
    return (
      <span aria-hidden="true" className="flex shrink-0 items-center">
        {/* A heading's face is one step above the row's dense disc. */}
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
