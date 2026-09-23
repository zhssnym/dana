/*
The Library's own answers to the two questions the engine asks about anything
that is not the list it is sorting: which container a point is inside, and how
a sidebar row becomes a grip.

`lib/use-sortable-list.ts` sorts one list and asks two questions about
anything else, `onOver` while the pointer moves and `onDropAt` on release
(DES-171). Answering them is the surface's job, because only the surface knows
what else is on it. This file is the Library's answers, kept out of
`app-sidebar.tsx` so that the sidebar reads as a sidebar.
*/

import type { PointerEvent as ReactPointerEvent } from 'react'

import { useDropZones } from '../lib/drop-zones.js'
import type { DropZones } from '../lib/drop-zones.js'

export type { Point, DropZones as LibraryZones } from '../lib/drop-zones.js'

/**
 * The directory itself as a place a release can land.
 *
 * Distinct from any group's key and from null, which is an answer rather than
 * a place: null means the pointer is inside nothing this surface registered,
 * and the directory key means it is inside the column but inside no group.
 * DES-171 makes that the way out of a group, and it needs no target of its
 * own: "a directory is its containers and the space around them, so inside
 * the directory but inside no group already means unsectioned". A target
 * existing only while you are already dragging is a target nobody can
 * discover.
 */
export const DIRECTORY = 'library:directory'

/*
The registry itself is `lib/drop-zones.ts` since the board became its second
caller, and it is re-exported here under the name the sidebar already used so
that nothing in `app-sidebar.tsx` moved for it. What stays this file's is the
Library's own answer to what the registry is asked about: `DIRECTORY` is the
key that names the column itself, and it is the outer one the registry's
enclosure rule is written for.
*/
export function useLibraryZones(): DropZones {
  return useDropZones(DIRECTORY)
}

/**
 * A sidebar row as the drag's grip.
 *
 * A press on a sidebar row is ambiguous in a way a task row's is not: the row
 * *is* a link, and the engine's `surfaceProps` deliberately refuses to start a
 * drag from one, a press on a control belonging to that control. So the grip
 * here is the whole row, guarded by hand: anything marked `data-no-drag`, the
 * hover actions and a group's menu, keeps its press, and everything else may
 * become a drag.
 */
export function grip(base: {
  onPointerDown: (event: ReactPointerEvent) => void
}): { onPointerDown: (event: ReactPointerEvent) => void } {
  return {
    onPointerDown: (event: ReactPointerEvent): void => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-no-drag]')) return
      base.onPointerDown(event)
    },
  }
}

/*
`swallowNextClick` lives beside the engine, which is where a consequence of
the engine's own choice not to capture the pointer belongs, and the tab strip
needs it too. Import it from `lib/use-sortable-list.js`.
*/
