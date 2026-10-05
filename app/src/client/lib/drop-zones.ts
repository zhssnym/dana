// Which registered container a point is inside, for drag surfaces. Uses
// `elementFromPoint`, not rectangles: a transformed carried child stretches its
// container's rect. Carried elements need `pointer-events: none`.

import { useCallback, useRef } from 'react'

export interface Point {
  readonly x: number
  readonly y: number
}

export interface DropZones {
  /** A ref callback registering one container's element under its key. */
  readonly registerZone: (key: string) => (element: HTMLElement | null) => void
  /** The element a key names, for a surface that measures inside it. */
  readonly zoneElement: (key: string) => HTMLElement | null
  /**
   * Which container a point is inside, `self` excluded, or null. An inner zone beats
   * the outer one.
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

      // Still inside the asking container means no cross-container answer.
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

  const zoneElement = useCallback(
    (key: string): HTMLElement | null => zones.current.get(key) ?? null,
    [],
  )

  return { registerZone, containerAt, zoneElement }
}
