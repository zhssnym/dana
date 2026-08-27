/*
Where a task opens, remembered.

`docs/design/prototype-v2/src/lib/task-surface-preference.ts`, read at
`b316785`. Its own header states the decision and it survives the port whole:
Scope A of Imran's flexible-workspace ruling of 2026-08-18 (DES-138), "the
customisation people actually use is not 'let me position a window', it is
'open things the way I opened the last one'". 9.3 says the same in the
contract's words: "Where a task opens (dialog, panel, or tab) is a client-side
preference; a row offers the choice and remembers it."

**A one-off choice is not a preference**, and that rule crosses unchanged.
Picking a mode from the row's "Open in…" strip opens the task that way *and*
remembers it, because that is what a person means by choosing; switching modes
from inside an open surface also remembers, being the same decision made
later. What is deliberately not remembered is `tab`: a tab is an action rather
than a place, and a person who opens one tab has not asked for every task to
become one. So the remembered union is two values where `TaskOpenMode` is
three.

**The store is the browser's, and that is 9.3's own word rather than the
prototype's convenience.** The section says *client-side* preference, so
`localStorage` is what the sentence describes and the file crosses with its
store intact. The one seam is the spelling: 4.19 and 9.3 write the middle mode
as `panel` and `TaskSurfaceMode` writes it as `right`, so anything this module
persists uses the section's word and the mapping lives here, in the one place
that touches both. Nothing lifted is edited for it.

**And this is where it stopped being a straight lift, measured rather than
reasoned.** 4.19 carries a `task_open` column, 9.7 names a control that writes
it, and S17b built that control; ledger entry L-038 records the state that
left: the column is "written by 9.7's Appearance control since S17b and read
by nothing". This row is the first thing that could read it, and reading it is
what a first attempt did.

**It turns fifty browser cases red, and none of them measures a defect.** The
column's default is `'panel'` (`0003_v2_expand.sql:210`), chosen at S12 when
nothing consumed it, so every account opens its tasks in the side panel the
moment anything honours the column. The panel is an `<aside>`, which is
`complementary`; the acceptance harness addresses the surface as
`getByRole('dialog')` and says why in its own comment, "this addresses the
dialog shape, which is what every case in this leg opens". Measured on the
whole leg at S23: 186 of 228, with every one of the forty-two reds resolving
to that one sentence.

**So the account's column is left exactly as S17b left it, and the collision
is routed rather than settled here**, at RFC 0005 change control item 47 and
section 13. Three answers exist and two of them are the owner's:

- 4.19's default becomes `dialog` and the column becomes the record, which is
  the end state this file would prefer and which needs a frozen section 4
  amendment plus a data update. Dana has taken that road twice already, for
  row density and for the clock, both of which began in the browser and were
  deliberately moved onto the account.
- 9.7's control is an account-level *initial* value that this store adopts
  once, which keeps the column meaningful without making it the record.
- The criteria move to expect a panel, which contradicts the harness's own
  written reading and costs about fifty cases.

Until one is ruled, what ships is what 9.3 says without any amendment. **The
cost of that is named rather than hidden**: 9.7's Appearance control goes on
writing a column nothing reads, which is the dead control DES-144 removes
everywhere else, and the choice does not follow a person between devices.
Both are the state this row inherited rather than one it created.
*/

import { useSyncExternalStore } from 'react'

/**
 * Where a task opens, in the prototype's spelling, which is what every lifted
 * surface switches on.
 *
 * Kept in step with `TaskOpenMode` by the type-check at its call sites; the
 * union is restated here so this module depends on no component.
 */
export type TaskSurfacePreference = 'dialog' | 'right'

/** 9.3's and 4.19's spelling, which is what the store keeps. */
type StoredMode = 'dialog' | 'panel'

const KEY = 'dana.taskSurface'

/** 9.3's default, and what this answers before anyone has chosen. */
const DEFAULT: TaskSurfacePreference = 'dialog'

function fromStored(mode: string | null): TaskSurfacePreference {
  return mode === 'panel' ? 'right' : DEFAULT
}

function toStored(mode: TaskSurfacePreference): StoredMode {
  return mode === 'right' ? 'panel' : 'dialog'
}

function read(): TaskSurfacePreference {
  try {
    return fromStored(localStorage.getItem(KEY))
  } catch {
    /* Private modes and sandboxed frames throw rather than return null. A
       display preference is not worth failing a render over. */
    return DEFAULT
  }
}

let current: TaskSurfacePreference = read()
const listeners = new Set<() => void>()

export function setTaskSurfacePreference(next: TaskSurfacePreference): void {
  if (next === current) return
  current = next
  try {
    localStorage.setItem(KEY, toStored(next))
  } catch {
    /* Remembered for this session only, which is the honest fallback. */
  }
  listeners.forEach((notify) => {
    notify()
  })
}

/**
 * The stored answer without subscribing, for the handlers that open a task and
 * only need to know where it goes.
 */
export function taskSurfacePreference(): TaskSurfacePreference {
  return current
}

export function useTaskSurfacePreference(): TaskSurfacePreference {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => {
        listeners.delete(notify)
      }
    },
    () => current,
    () => DEFAULT,
  )
}
