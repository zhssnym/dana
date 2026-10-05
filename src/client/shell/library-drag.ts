/*
 * The Library's answers to the drag engine's `onOver` and `onDropAt`: which container a point is in, and how a
 * sidebar row becomes a grip.
 */

import type { PointerEvent as ReactPointerEvent } from 'react'

import { useDropZones } from '../lib/drop-zones.js'
import type { DropZones, Point } from '../lib/drop-zones.js'
import { zoneAt } from './page-tree.js'
import type { DropZone } from './page-tree.js'

export type { Point, DropZones as LibraryZones } from '../lib/drop-zones.js'

/**
 * The column itself as a drop target: inside the column but in no group means ungrouped. Null means outside
 * anything this surface registered.
 */
export const DIRECTORY = 'library:directory'

/* The registry is `lib/drop-zones.ts`; re-exported under the sidebar's name. `DIRECTORY` is the outer zone. */
export function useLibraryZones(): DropZones {
  return useDropZones(DIRECTORY)
}

/**
 * The whole row is the grip, because the row is a link and `surfaceProps` refuses drags from links. Anything
 * marked `data-no-drag` keeps its press.
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

/** The page row under a point and its zone. The carried row has `pointer-events: none`, so it is never hit. */
export function pageRowAt(point: Point): { readonly id: string; readonly zone: DropZone } | null {
  const row = document
    .elementFromPoint(point.x, point.y)
    ?.closest<HTMLElement>('[data-page-row]')
  const id = row?.dataset.pageRow
  if (row === null || row === undefined || id === undefined || id === '') return null
  const box = row.getBoundingClientRect()
  return { id, zone: zoneAt(box.top, box.bottom, point.y) }
}

