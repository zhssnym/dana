/*
Which container a point is inside, for whichever surface is asking.

`use-sortable-list.ts` sorts one list and asks two questions about anything
else, `onOver` while the pointer moves and `onDropAt` on release (DES-171).
Answering them is the surface's job, because only the surface knows what else
is on it, and this is the part of that answer no surface should write twice.

It began beside the Library and moved here when the board became the second
surface to need it, which is the reasoning `swallowNextClick` took one slice
earlier: a consequence of this engine's own design belongs beside the engine.
`shell/library-drag.ts` re-exports it under the name the sidebar already used,
so nothing over there moved.

**The hit test is `document.elementFromPoint` plus DOM containment, never
rectangle arithmetic**, and the reason is a bug the rectangles version shipped
and the AC-227 probe of 2026-08-25 caught: the carried element follows the
pointer by a transform, a transformed child expands its ancestor's bounding
rect, and the carried element is a DOM child of the container it is leaving.
So the container's measured rect followed the element out of it, the pointer
never read as outside, and the way out never opened. The document's own hit
test is immune, because a container's painted box is its laid-out one; what it
needs in exchange is that the carried element stop catching the point, which
is the `pointer-events: none` every carried surface now wears.

**One key may be declared the outer one**, for a surface whose containers sit
inside a container of their own. The Library is that surface: its directory
holds every group, so a pointer inside a group is also inside the directory,
and answering "the directory" there would take a folder out of its own group
every time somebody reordered inside one. A surface with no such enclosure,
which a board is, declares none and every zone is read the same way.
*/

import { useCallback, useRef } from 'react'

export interface Point {
  readonly x: number
  readonly y: number
}

export interface DropZones {
  /** A ref callback registering one container's element under its key. */
  readonly registerZone: (key: string) => (element: HTMLElement | null) => void
  /**
   * Which container a point is inside, `self` excluded, or null for none.
   *
   * The innermost container a point is inside is the one it is in, so an
   * ordinary zone beats the outer one where both contain the point.
   */
  readonly containerAt: (point: Point, self: string | null) => string | null
}

export function useDropZones(outerKey?: string): DropZones {
  const zones = useRef(new Map<string, HTMLElement>())

  const registerZone = useCallback(
    (key: string) =>
      (element: HTMLElement | null): void => {
        if (element === null) zones.current.delete(key)
        else zones.current.set(key, element)
      },
    [],
  )

  const containerAt = useCallback(
    (point: Point, self: string | null): string | null => {
      const under = document.elementFromPoint(point.x, point.y)
      if (under === null) return null

      /*
      Still inside the container that is asking is not an answer, it is the
      absence of one: the proposal is an ordinary slot in this list. Checked
      before the others for the enclosure reason in this file's header.
      */
      let inner: string | null = null
      let outer: string | null = null
      for (const [key, element] of zones.current) {
        if (!element.contains(under)) continue
        if (key === self) return null
        if (key === outerKey) outer = key
        else inner = key
      }
      return inner ?? outer
    },
    [outerKey],
  )

  return { registerZone, containerAt }
}
