/*
Everyone a task can be given to, in one list.

W2 asks for the row's **assignee slot cut as an open set**, and it was closed
in the way that matters: the menu mapped `PEOPLE` from `task-model.ts`, three
names written for the row lab. That is the same fault `folderLibrary` was
built to fix one axis over (DES-114) — a lab constant shipped into the real
row — and it had the same visible symptom. The lab said *Sara* and *Hassan*
with initials SK and HN; the People screen, two clicks away, said **Sara
Khan** and **Hassan Ali** with initials SK and **HA**. So the list you gave
work to disagreed with the list of people you were actually connected to.

The roster is assembled the way the sidebar's folders are:

1. **The viewer first**, because "give it to me" is the most common answer and
   because a list of collaborators that omits you is a list you have to
   translate.
2. **Then the connections**, in the order the People screen shows them.

Faces are matched by first name, so a person keeps the portrait the fixtures
already gave them while taking the full name and initials the connection
carries. That is a fixture reconciliation and it goes away with the port,
where both come from one row in one table.

**Why this is an open set and not a longer closed one.** Nothing here says
*human*. An assignee is a name and a face, which is what
`docs/design/vision.md` will need when work can be given to "a person, an AI
agent, or both" — an agent arrives as another entry, in the same slot, with
the same treatment. W1 forbids a separate AI hue, so the fact that this list
has no notion of kind is the point rather than an omission: the day an agent
is assignable, nothing in the row changes.

Unassigned is a member of the set, not the absence of one. A row could set an
assignee and never clear it until F6, which is the closed-set fault in its
plainest form.
*/

import { FACE_HASSAN, FACE_IMRAN, FACE_SARA, firstName } from "@/lib/task-model"
import { shellConnections, shellViewer } from "@/fixtures"

export interface Person {
  name: string
  initials: string
  image?: string
}

/* The portraits the fixtures carry, by first name — the one thing a
   connection record has no column for. */
const FACES: Record<string, string> = {
  imran: FACE_IMRAN,
  sara: FACE_SARA,
  hassan: FACE_HASSAN,
}

function faceFor(name: string) {
  return FACES[firstName(name)?.toLowerCase() ?? ""]
}

export function peopleLibrary(): Person[] {
  return [
    {
      name: shellViewer.name,
      initials: shellViewer.initials,
      image: faceFor(shellViewer.name),
    },
    ...shellConnections.map((connection) => ({
      name: connection.name,
      initials: connection.initials,
      image: faceFor(connection.name),
    })),
  ]
}

/* Whether a name in a task is this person, tolerating the fixtures' short
   forms — "Sara" on a task and "Sara Khan" in the roster are one person, and
   will be one row after the port. */
export function isSamePerson(a: string | undefined, b: string | undefined) {
  const left = firstName(a)?.toLowerCase()
  const right = firstName(b)?.toLowerCase()
  return Boolean(left && right && left === right)
}
