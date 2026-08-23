/*
A page's narrowing, kept for as long as you are here.

The open question was whether a filter should survive leaving the page. It did
not: the shell navigates by full page load and the filter was component state,
so a chip set on Today was gone by Scheduled and gone again on the way back.

**It should not cross to another page, and it should survive returning to this
one**, and the two halves have one reason between them.

*Not across pages*, because a filter is a narrowing of the page you are on. A
narrowing that followed you would mean arriving somewhere with a constraint you
did not set there — and the first thing you would notice is missing work, not
the reason for it. A narrowing worth keeping across pages is not a filter at
all; it is a view, it has a name, and DES-156 already built Save as view for
exactly that. Ad hoc is transient, named is kept: that is the whole
distinction, and blurring it would leave two half-answers instead of two clear
ones.

*But kept on the way back*, because leaving Today to check Scheduled and
returning is one act of looking around, not a decision to stop filtering. The
test that separates the two is **visibility**: the active filter is drawn as
removable chips in the window bar (DES-153), so a person returning to a
narrowed page can see that it is narrowed and undo it in one press. State you
can see is safe to keep; state you cannot is how a page comes to lie about
what it holds.

Session rather than local storage, and that is the third half of the same
rule: a filter is working state, not a preference. Closing the tab ends the
session of looking, exactly as it ends the task tabs the page bar holds.
*/

import type { TaskFilters } from "@/components/task-filters"

const PREFIX = "dana.filters."

function isClean() {
  return (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("handoff") === "clean"
  )
}

export function readPageFilters(
  key: string,
  fallback: TaskFilters,
): TaskFilters {
  if (typeof window === "undefined" || isClean()) return fallback
  try {
    const stored = window.sessionStorage.getItem(PREFIX + key)
    if (!stored) return fallback
    const value = JSON.parse(stored) as Partial<TaskFilters>
    /* Merged onto the fallback rather than trusted whole: a stored shape from
       before an axis existed would otherwise arrive missing it, and every
       reader would have to defend itself. */
    return { ...fallback, ...value }
  } catch {
    return fallback
  }
}

export function writePageFilters(key: string, filters: TaskFilters) {
  if (typeof window === "undefined" || isClean()) return
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(filters))
  } catch {
    /* A full or blocked session store costs the person nothing here: the
       filter still works, it just will not be there when they come back. */
  }
}
