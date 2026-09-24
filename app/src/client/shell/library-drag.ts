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
import type { DropZones, Point } from '../lib/drop-zones.js'
import { zoneAt } from './page-tree.js'
import type { DropZone } from './page-tree.js'

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

/**
 * `grip` for a sub-page's row. The row sits inside its parent's item, which is
 * a grip of its own, so the press stops here: one press carries one page.
 */
export function nestedGrip(base: {
  onPointerDown: (event: ReactPointerEvent) => void
}): { onPointerDown: (event: ReactPointerEvent) => void } {
  const inner = grip(base)
  return {
    onPointerDown: (event: ReactPointerEvent): void => {
      event.stopPropagation()
      inner.onPointerDown(event)
    },
  }
}

/**
 * The page row under a point, and which part of it: its top quarter, its
 * middle, or its bottom quarter (`page-tree.ts`'s `zoneAt`).
 *
 * The page tree's half of the hit test. A row is marked `data-page-row` by
 * `FolderRow`; the carried row has `pointer-events: none`, so it and the
 * subtree it carries are never what the point is over.
 */
export function pageRowAt(point: Point): { readonly id: string; readonly zone: DropZone } | null {
  const row = document
    .elementFromPoint(point.x, point.y)
    ?.closest<HTMLElement>('[data-page-row]')
  const id = row?.dataset.pageRow
  if (row === null || row === undefined || id === undefined || id === '') return null
  const box = row.getBoundingClientRect()
  return { id, zone: zoneAt(box.top, box.bottom, point.y) }
}

/*
`swallowNextClick` lives beside the engine, which is where a consequence of
the engine's own choice not to capture the pointer belongs.
Import it from `lib/use-sortable-list.js`.
*/
