// Everyone a task can be given to: the viewer, then the folder's other members. The
// roster is the folder's members, not connections, because the server refuses an assignee
// who is not a member. Nothing here assumes the assignee is human.

import { useMemo } from 'react'

import type { GetFolderResponse } from '../../shared/folders.js'
import type { MeResponse } from '../../shared/me.js'
import { useFolder, useMe } from '../api/queries.js'
import { toConceptPerson } from '../tasks/task-concept.js'
import type { ConceptTask } from '../tasks/task-model.js'

/** A roster entry, as a lifted picker and chip take one. */
export type Person = NonNullable<ConceptTask['assignee']>

/**
 * The viewer comes from `/me` and the members are filtered by that id, so the viewer
 * appears once and first even if missing from the list.
 */
export function peopleLibrary(
  viewer: MeResponse['user'] | undefined,
  members: GetFolderResponse['members'] | undefined,
): Person[] {
  const others = (members ?? [])
    .filter((member) => member.user.id !== viewer?.id)
    .map((member) => toConceptPerson(member.user))
  return viewer === undefined ? others : [toConceptPerson(viewer), ...others]
}

/** Both reads are already cached. `useFolder` is disabled for a null id. */
export function usePeopleLibrary(folderId: string | null): Person[] {
  const me = useMe()
  const folder = useFolder(folderId ?? '', folderId !== null)
  const viewer = me.data?.user
  const members = folderId === null ? undefined : folder.data?.members
  return useMemo(() => peopleLibrary(viewer, members), [viewer, members])
}

/**
 * By id. Two entries with no id are never the same person, or an unassigned row would
 * look assigned to whoever the picker last drew.
 */
export function isSamePerson(a: Person | undefined, b: Person | undefined): boolean {
  return (
    a?.id !== undefined &&
    b?.id !== undefined &&
    a.id === b.id
  )
}
