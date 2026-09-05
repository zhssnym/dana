/*
Everyone a task can be given to, in one list.

`docs/design/prototype-v2/src/lib/people-library.ts`, read at `7d2064c`, over
this client's query layer. That prototype is deleted (`a7886df`, 2026-09-01);
read it in git history before that commit. Its own header records the fault:
the assignee menu mapped `PEOPLE` from `task-model.ts`, three names written
for the row lab, so
"the lab said Sara and Hassan with initials SK and HN; the People screen, two
clicks away, said Sara Khan and Hassan Ali with initials SK and HA. So the
list you gave work to disagreed with the list of people you were actually
connected to."

**Why this is an open set and not a longer closed one**, kept because it is a
design decision rather than a fixture note. Nothing here says *human*. An
assignee is a name and a face, which is what `docs/design/vision.md` asked for
when work can be given to "a person, an AI agent, or both": an agent arrives
as another entry, in the same slot, with the same treatment. That document is
deleted (`a7886df`, 2026-09-01) and is in git history before that commit, and
**no numbered spec section carries the open-set intent today**, so the quoted
words are the record. The fact that this list has no notion of kind is the
point rather than an omission.

**And unassigned is a member of the set, not the absence of one** (ledger
L-094, closed). It is not in the array, because the array is people; it is the
`null` a picker offers beside them and the `null` `conceptPatchToBody` sends.

**The seam, and it is the one substantive difference.** The prototype's roster
is the viewer plus every connection, because its fixtures carry no membership
and a connection is the only relationship it models. Dana's roster is the
**folder's members**, because 4.4 makes assignment a membership fact and 10.2
refuses an assignee who is not one: offering a connection who is not in the
folder would draw a menu whose entries the server rejects, which is the
opposite of what this module exists for. The order is the prototype's, viewer
first and then the rest, "because a list of collaborators that omits you is a
list you have to translate", and 7.4's own member order behind that.

The second, smaller difference is `isSamePerson`. The prototype tolerates its
fixtures' short forms, matching "Sara" on a task against "Sara Khan" in the
roster by first name, and says so: "will be one row after the port". This is
after the port, so it compares ids. A first-name comparison here would make
two colleagues who share one first name into one person.

**No faces table.** The prototype matches portraits by first name because "a
connection record has no column for" one; 7.0's person carries `avatar_url`
and `tasks/task-concept.ts` reads it, so the reconciliation the original needed
has nothing left to reconcile.
*/

import { useMemo } from 'react'

import type { GetFolderResponse } from '../../shared/folders.js'
import type { MeResponse } from '../../shared/me.js'
import { useFolder, useMe } from '../api/queries.js'
import { toConceptPerson } from '../tasks/task-concept.js'
import type { ConceptTask } from '../tasks/task-model.js'

/** A roster entry, as a lifted picker and a lifted chip take one. */
export type Person = NonNullable<ConceptTask['assignee']>

/**
 * The roster for one folder: the viewer, then the folder's other members.
 *
 * Pure, so the ordering rule above is a thing a unit test can pin rather than
 * a thing a hook does on the way past.
 *
 * The viewer is taken from `/me` rather than from the member list, and then
 * the member list is filtered by that id: a viewer who is a member appears
 * once and first, and a viewer who is somehow not one still appears, which is
 * the honest reading of "a list of collaborators that omits you is a list you
 * have to translate".
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

/**
 * The roster as a picker takes it, for the folder a task is in.
 *
 * Both reads are ones the chrome and the folder page have already made, so a
 * picker opening over a row costs nothing beyond the cache lookup (8.3).
 * `folderId` is nullable because a picker can be mounted before its task is
 * known, and `useFolder` is disabled on a null id rather than fetching a
 * folder called "null".
 */
export function usePeopleLibrary(folderId: string | null): Person[] {
  const me = useMe()
  const folder = useFolder(folderId ?? '', folderId !== null)
  const viewer = me.data?.user
  const members = folderId === null ? undefined : folder.data?.members
  return useMemo(() => peopleLibrary(viewer, members), [viewer, members])
}

/**
 * Whether two roster entries are one person.
 *
 * By id, per the header. Two entries with no id are never the same person
 * rather than always the same person: an absent id is an unknown, and a
 * comparison that answers true on two unknowns is how an unassigned row comes
 * to look assigned to whoever the picker last drew.
 */
export function isSamePerson(a: Person | undefined, b: Person | undefined): boolean {
  return (
    a?.id !== undefined &&
    b?.id !== undefined &&
    a.id === b.id
  )
}
