/*
The sample workspace's client half: one
hook the strip and the Settings row both call, so the confirmation, the
undo and the sentence about kept folders are written once.

**"Keep it" is a dismissal local to the device**, in `localStorage`, on the
same reasoning `StarterOffer.tsx` records for its own: the account keeps
the sample either way, and the strip is furniture whose absence changes
nothing on the server. The Settings row is the way back to the act from a
device that dismissed it.

**Removal is one press, and the undo bar is its safety net**: no confirm
before it, because the act is reversible. The undo is POST /sample, which is
idempotent, so a bar pressed twice lands on one workspace. Removing the sample
also answers the starter offer: a person who just said no to example content
is not offered more of it (`StarterOffer.tsx`).
*/
import { useState } from 'react'

import { useRemoveSample, useRestoreSample } from '../api/mutations.js'
import { useSample } from '../api/queries.js'
import { pushUndo } from '../shell/undo.js'
import { showToast } from '../state/toasts.js'
import { dismissStarters } from './StarterOffer.js'

export const SAMPLE_COPY = {
  strip: 'Sample workspace',
  stripRemove: 'Remove',
  remove: 'Remove sample data',
  keep: 'Keep it',
  undone: 'Sample workspace removed',
  restore: 'Restore sample data',
  keptOne: (name: string) => `${name} was left in place because it is shared.`,
  keptMany: (names: readonly string[]) =>
    `${names.join(', ')} were left in place because they are shared.`,
} as const

const KEPT_KEY = 'dana.sample.kept'

function readKept(): boolean {
  try {
    return window.localStorage.getItem(KEPT_KEY) === '1'
  } catch {
    return false
  }
}

function writeKept(value: boolean): void {
  try {
    if (value) window.localStorage.setItem(KEPT_KEY, '1')
    else window.localStorage.removeItem(KEPT_KEY)
  } catch {
    /* The dismissal is lost, the page is not. */
  }
}

export interface SampleActs {
  /** Undefined until the read answers. */
  readonly present: boolean | undefined
  readonly counts: { tasks: number; folders: number } | undefined
  readonly busy: boolean
  /** The strip has been dismissed on this device. */
  readonly kept: boolean
  readonly keep: () => void
  readonly remove: () => void
  readonly restore: () => void
}

export function useSampleActs(): SampleActs {
  const status = useSample()
  const removeSample = useRemoveSample()
  const restoreSample = useRestoreSample()
  const [kept, setKept] = useState(readKept)

  const restore = (): void => {
    restoreSample.mutate()
  }

  const remove = (): void => {
    dismissStarters()
    removeSample.mutate(undefined, {
      onSuccess: (keptFolders) => {
        pushUndo(SAMPLE_COPY.undone, restore)
        if (keptFolders.length === 1) showToast(SAMPLE_COPY.keptOne(keptFolders[0] ?? ''))
        else if (keptFolders.length > 1) showToast(SAMPLE_COPY.keptMany(keptFolders))
      },
    })
  }

  return {
    present: status.data?.present,
    counts: status.data === undefined ? undefined : status.data.counts,
    busy: removeSample.isPending || restoreSample.isPending,
    kept,
    keep: () => {
      writeKept(true)
      setKept(true)
    },
    remove,
    restore,
  }
}
