/*
10.3's one list cap and its one allocation, in a module that imports nothing.

**This is here rather than in `views.ts` because of an import cycle, and that
is the whole reason the file exists.** `views.ts` imports `tasks.ts`, which
imports `labels.ts` for the Task projection; so a Label module reaching back
into `views.ts` for the number closes a three-module loop, and the loop is not
harmless — `tasks.ts` evaluates `taskLabels` at module scope, so whichever of
the three is imported first can find that binding still in its temporal dead
zone and die with a ReferenceError that names neither the cap nor the cycle.
Issue #226 met it when `GET /labels` took the cap.

The alternative was a second constant holding 1000, which is the thing 10.3
exists to prevent: a cap stated twice is a cap that can one day disagree with
itself. `views.ts` re-exports both names, so every existing call site reads
unchanged and this file is the only definition.
*/

/*
10.3's row, "List responses capped at 1000 rows with truncated flag", and
section 6's preamble as ruled on 2026-08-07: per response, not per array, with
the kept rows the first 1000 in the order 7.10 enumerates that response's own
sections.
*/
export const LIST_ROW_CAP = 1000

/** What a capped response is built from: the sections that survived, in the
 * order they were given, and the one flag 7.10 gives the body to report them
 * with. */
export interface CappedSections<T> {
  sections: T[][]
  truncated: boolean
}

/**
 * The ruled allocation: sections given in the order 7.10 enumerates them, each
 * taking what is left of the cap, and truncated true exactly when a row was
 * dropped.
 *
 * One function because four responses need it. Tasks is inbox then groups,
 * All is planned then tasks_inbox then tasks_groups, the folder page is
 * scheduled then unscheduled, and `GET /labels` is one section; an
 * implementation filling a later section first answers the same total with a
 * different page, which is the difference section 6's byte-identical guarantee
 * turns on once a cap can bite.
 *
 * truncated reports dropped rows and nothing else. A response holding exactly
 * the cap with nothing behind it is complete, and says so.
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
