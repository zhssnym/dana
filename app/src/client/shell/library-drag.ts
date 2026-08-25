/*
The three things the Library's drag needs that the engine deliberately does
not know about: which container a point is inside, how a sidebar row becomes a
grip, and what to do about the click a release leaves behind.

`lib/use-sortable-list.ts` sorts one list and asks two questions about
anything else, `onOver` while the pointer moves and `onDropAt` on release
(DES-171). Answering them is the surface's job, because only the surface knows
what else is on it. This file is the Library's answers, kept out of
`app-sidebar.tsx` so that the sidebar reads as a sidebar.
*/

import { useCallback, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

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

export interface Point {
  readonly x: number
  readonly y: number
}

export interface LibraryZones {
  /** A ref callback registering one container's element under its key. */
  readonly registerZone: (key: string) => (element: HTMLElement | null) => void
  /**
   * Which container a point is inside, `self` excluded, or null for none.
   *
   * Groups are tested before the directory, the directory containing all of
   * them: the innermost container a point is inside is the one it is in.
   */
  readonly containerAt: (point: Point, self: string | null) => string | null
}

/**
 * The registry of drop containers, hit-tested by rectangle.
 *
 * Rectangles rather than `document.elementFromPoint`, and the reason is the
 * gesture itself: the carried row follows the pointer, so it is the element
 * under the pointer for the whole drag and the document would answer with it
 * every time.
 */
export function useLibraryZones(): LibraryZones {
  const zones = useRef(new Map<string, HTMLElement>())

  const registerZone = useCallback(
    (key: string) =>
      (element: HTMLElement | null): void => {
        if (element === null) zones.current.delete(key)
        else zones.current.set(key, element)
      },
    [],
  )

  const containerAt = useCallback((point: Point, self: string | null): string | null => {
    let directory: string | null = null
    let group: string | null = null
    let inSelf = false
    for (const [key, element] of zones.current) {
      const rect = element.getBoundingClientRect()
      const inside =
        point.x >= rect.left &&
        point.x <= rect.right &&
        point.y >= rect.top &&
        point.y <= rect.bottom
      if (!inside) continue
      if (key === self) inSelf = true
      else if (key === DIRECTORY) directory = key
      else group = key
    }

    /*
    Still inside the container that is asking is not an answer, it is the
    absence of one: the proposal is an ordinary slot in this list.

    This is the whole reason the pass runs to the end rather than returning
    the first hit. The directory contains every group, so a pointer inside a
    group is also inside the directory, and answering "the directory" there
    would read as "out of this group" and take a folder out of its own group
    every time somebody reordered inside one.
    */
    if (inSelf) return null
    return group ?? directory
  }, [])

  return { registerZone, containerAt }
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
`swallowNextClick` used to live here and now lives beside the engine, which is
where a consequence of the engine's own choice not to capture the pointer
belongs. The tab strip needed it too when it came onto the engine at S11, and
two surfaces reaching for one function is how it would otherwise have been
written twice. Import it from `lib/use-sortable-list.js`.
*/
