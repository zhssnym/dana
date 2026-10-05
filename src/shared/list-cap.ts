/*
10.3's list cap in a module that imports nothing. It is separate from views.ts
to break an import cycle (views -> tasks -> labels), which fails with a
ReferenceError naming neither. views.ts re-exports both names.
*/

/* Per response, not per array: the first 1000 rows across sections in 7.10's order. */
export const LIST_ROW_CAP = 1000

export interface CappedSections<T> {
  sections: T[][]
  truncated: boolean
}

/**
 * Fills sections in the given order, each taking what is left of the cap.
 * `truncated` is true exactly when a row was dropped; exactly 1000 is complete.
 */
export function takeCapped<T>(
  sections: readonly (readonly T[])[],
): CappedSections<T> {
  const kept: T[][] = []
  let room = LIST_ROW_CAP
  let truncated = false
  for (const section of sections) {
    const take = Math.min(section.length, room)
    kept.push(section.slice(0, take))
    if (take < section.length) truncated = true
    room -= take
  }
  return { sections: kept, truncated }
}
