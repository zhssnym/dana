/*
Where a task opens, remembered.

`docs/design/prototype-v2/src/lib/task-surface-preference.ts`, read at
`b316785`, over this client's settings bundle. Its own header states the
decision and it survives the port whole: Scope A of Imran's flexible-workspace
ruling of 2026-08-18 (DES-138), "the customisation people actually use is not
'let me position a window', it is 'open things the way I opened the last one'".
9.3 says the same in the contract's words: "Where a task opens (dialog, panel,
or tab) is a client-side preference; a row offers the choice and remembers it."

**A one-off choice is not a preference**, and that rule crosses unchanged.
Picking a mode from the row's "Open in…" strip opens the task that way *and*
remembers it, because that is what a person means by choosing; switching modes
from inside an open surface also remembers, being the same decision made
later. What is deliberately not remembered is `tab`: a tab is an action rather
than a place, and a person who opens one tab has not asked for every task to
become one. So the remembered union is two values where `TaskOpenMode` is
three.

**The first seam is the store.** The prototype keeps the answer in
`localStorage` under `dana.taskSurface` and calls syncing it "Lane 2 ... the
three should go to Hassan together". Dana took Lane 2 before this file
arrived: `task_open` is a `user_settings` column of 4.19, 9.7 names the
control, and `GET` and `PATCH /settings` have carried it since S7. So the
record is the account's and the write is the same `PATCH` the Settings page
sends.

**And that is where this file departs from `lib/row-density.ts`, which is the
nearest thing to it and refuses a setter.** That module says "writing the
preference is the Settings page's mutation and must stay the one path, because
a second writer is how the column and the attribute drift". The reasoning does
not carry here, and 9.3's own sentence is why: a row *offers the choice and
remembers it*, so the row is a writer by specification. What keeps this from
drifting instead is that there is one record and no mirror to fall out of step
with it. Row density has a document attribute beside the column, which is the
thing a second writer could desynchronise; this has only the column.

**The second seam is one word.** 9.3 and 4.19 spell the middle mode `panel`;
the prototype's `TaskSurfaceMode` spells it `right`, and every lifted surface
switches on that spelling. Neither wins over the other, because one is a wire
value and one is a component's union. The mapping is here, in the one module
that touches both, so no lifted file is edited for it and no stored value is
the prototype's word.

**The third seam is that the two synchronous entry points are bound rather
than owned.** `components/task-row.tsx` and `components/task-surface.tsx` call
`setTaskSurfacePreference(mode)` from inside a click handler, which is not a
place a hook can be called, and the prototype could answer that from a module
variable because its store was one. Here the read is a query and the write is
a mutation, both owned by the query client, so `TaskSurfaceMemory` below is
mounted once by the shell and publishes the answer and the writer into this
module. Before it mounts, the read is 9.3's default and the write is a no-op
rather than a throw: a preference not remembered is worth less than a render,
which is the same trade the prototype's own `catch` makes for a sandboxed
`localStorage`. The published value is a cache of the account's and never a
second record: nothing reads it but the two synchronous call sites, and every
subscribed reader goes to `useTaskSurfacePreference` and therefore to the
bundle.
*/

import { useEffect } from 'react'

import { useBundle } from '../api/queries.js'
import { usePatchBundle } from '../api/mutations.js'
import type { SettingsBundle } from '../../shared/bundle.js'

/**
 * Where a task opens, in the prototype's spelling, which is what every lifted
 * surface switches on.
 *
 * Kept in step with `TaskOpenMode` by the type-check at its call sites; the
 * union is restated here so this module depends on no component.
 */
export type TaskSurfacePreference = 'dialog' | 'right'

/** 9.3's and 4.19's spelling, which is what the wire carries. */
type StoredMode = SettingsBundle['task_open']

/** 9.3's default, and what this answers before the bundle arrives. */
const DEFAULT: TaskSurfacePreference = 'dialog'

function fromStored(mode: StoredMode | undefined): TaskSurfacePreference {
  /* `tab` is storable, 4.19's enum carrying it because 9.7's control offers
     all three, and it is not a surface preference: a person whose account
     says `tab` still opens tasks in the dialog until they choose otherwise,
     because a tab is an action and the strip does not remember one. */
  return mode === 'panel' ? 'right' : DEFAULT
}

function toStored(mode: TaskSurfacePreference): StoredMode {
  return mode === 'right' ? 'panel' : 'dialog'
}

let published: TaskSurfacePreference = DEFAULT
let write: ((next: TaskSurfacePreference) => void) | null = null

/**
 * The stored answer without subscribing, for the handlers that open a task and
 * only need to know where it goes.
 */
export function taskSurfacePreference(): TaskSurfacePreference {
  return published
}

/** The same answer, subscribed, for the surfaces that redraw when it moves. */
export function useTaskSurfacePreference(): TaskSurfacePreference {
  return fromStored(useBundle().data?.task_open)
}

/** Remember a mode. A no-op until `TaskSurfaceMemory` is mounted. */
export function setTaskSurfacePreference(next: TaskSurfacePreference): void {
  write?.(next)
}

/**
 * The bridge, mounted once by the shell.
 *
 * It renders nothing and exists so the two module functions above have
 * something behind them. Both effects run after every settled read, which is
 * what keeps the published value the account's rather than the last one this
 * browser wrote.
 */
export function TaskSurfaceMemory(): null {
  const bundle = useBundle()
  const patch = usePatchBundle()
  const current = fromStored(bundle.data?.task_open)
  const send = patch.mutate

  useEffect(() => {
    published = current
  }, [current])

  useEffect(() => {
    write = (next) => {
      if (published === next) return
      /* Published before the response so the next task opened in the same
         gesture goes where the person just asked, rather than where the
         account still says. 8.3's refetch is what makes it true. */
      published = next
      send({ task_open: toStored(next) })
    }
    return () => {
      write = null
    }
  }, [send])

  return null
}
