/*
Whether a task row is one line or two. DES-113, and ledger entry L-076.

Lifted from `docs/design/prototype-v2/src/lib/row-density.ts` at S21, read on
`v2-build` at `db6f837`. **This is the half L-076 gives S21: "S21 writes it,
S23 gives the row its two shapes."** Nothing in this client asks the question
yet, because the row that answers it differently is `task-row.tsx` and that
file arrives at S23. This module exists now so that when it does, it crosses
verbatim: `components/task-row.tsx:103` imports `useRowDensity` and switches
on `density === "one"`, and a lifted file that has to rewrite that import is a
lifted file that has left the strategy.

**Two lines is the default**, and DES-113 records why at length: the failure
modes are not symmetric. Seeing fewer tasks at once is visible and
self-correcting, you scroll, you notice, you come and change this. A truncated
title is invisible, because you do not know what you did not read. The default
is the mode whose downside announces itself.

**The rule that keeps two rows affordable**, from DES-113 and repeated here
because this file is where somebody will be standing when they break it: *the
two densities may differ in height and in where the details sit, and in
nothing else.* The moment one grows a behaviour the other lacks, the tax stops
being layout and becomes logic.

**The seam, and it is the whole of this file's difference from the original.**
The prototype keeps the preference in `localStorage` under `dana.rowDensity`,
and says so in its own header: "Lane 1: it lives in the browser and does not
follow a person between devices. Syncing it is Lane 2 and waits on an RFC."
Dana took Lane 2 before this file arrived. `row_density` is a `user_settings`
column of 4.19, 9.7 names the control, AC-261 asserts that the choice survives
a reload because it was written through the API rather than held in the page,
and `shell/appearance.ts` puts the answer on the document as `data-density`.
So this module reads the document rather than storage, and there is no setter:
**writing the preference is the Settings page's mutation and must stay the one
path**, because a second writer is how the column and the attribute drift.

Reading the document rather than the query cache is deliberate and is the
prototype's own argument one level over. A row density is read by the row, by
every screen that draws a list of rows, and by a settings control; threading a
bundle through all of that is a provider around the application for one enum.
The attribute is already there, already correct, and already what the
stylesheet answers, so it is the honest single source and it needs nobody to
remember anything.

**The two vocabularies are not merged, and neither is renamed.** 9.7 says
comfortable and compact, which is how close a list stands; DES-113 says two
and one, which is how many lines a row has. They are the same preference
described from the list's side and from the row's side, and both names are
load-bearing where they sit: the section's reaches the column, the API and the
Settings copy, the prototype's reaches the row's markup. The mapping lives
here, in one line, rather than either name being pushed into the other's half.
*/

import { useSyncExternalStore } from 'react'

export type RowDensity = 'two' | 'one'

/** What `shell/appearance.ts` writes, and 9.7's own two words. */
const ATTRIBUTE = 'data-density'
const COMPACT = 'compact'

function read(): RowDensity {
  /* Absent before the shell's first effect runs, and on the server. Two lines
     either way: the default is the column's default, so the first paint is
     the shape the account actually has rather than one that corrects itself. */
  if (typeof document === 'undefined') return 'two'
  return document.documentElement.getAttribute(ATTRIBUTE) === COMPACT ? 'one' : 'two'
}

/*
Cached because `useSyncExternalStore` compares snapshots by identity and calls
`getSnapshot` on every render: reading the attribute each time is cheap, but
returning a fresh value is not the contract, and a store that recomputes
without a change notification is how that hook loops.
*/
let current: RowDensity = read()

const listeners = new Set<() => void>()

function refresh(): void {
  const next = read()
  if (next === current) return
  current = next
  listeners.forEach((notify) => {
    notify()
  })
}

export function useRowDensity(): RowDensity {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      /* Watching the one attribute on the one element, which is the whole of
         what `shell/appearance.ts` changes. A `MutationObserver` rather than a
         custom event because the writer is a plain `setAttribute` and should
         stay one: an event would be a second thing that file has to remember
         to do, and forgetting it would leave the rows disagreeing with the
         stylesheet with nothing saying so. */
      const observer = new MutationObserver(refresh)
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: [ATTRIBUTE],
      })
      /* And once on subscribe, because the shell's effect may have written the
         attribute between this module loading and this component mounting. */
      refresh()
      return () => {
        observer.disconnect()
        listeners.delete(notify)
      }
    },
    () => current,
    () => 'two' as const,
  )
}
