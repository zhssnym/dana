/*
The sample workspace's client half: one hook the strip and the Settings row
both call, so the undo and the sentence about kept folders are written once.
The strip only keeps the sample; removing it is Settings' alone (M4).

**"Keep it" is a dismissal local to the device**, in `localStorage`, on the
same reasoning `StarterOffer.tsx` records for its own: the account keeps
the sample either way, and the strip is furniture whose absence changes
nothing on the server. The Settings row is the way back to the act from a
device that dismissed it.

**Removal asks first, and the undo bar is its second net.** Settings puts
`SAMPLE_COPY.confirm` before `remove` (M4). The server leaves a
sample page someone else holds, moves one the person wrote in to Trash with
their writing, and names both back, so what the undo (POST /sample,
idempotent: a bar pressed twice lands on one workspace) writes afresh sits
beside nothing of the old sample in view. Removing the sample
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
  strip: 'This is a sample',
  keep: 'Keep it',
  confirm: 'Remove the sample workspace?',
  confirmDetail:
    'Its pages and tasks go. A sample page you wrote in moves to Trash with your writing, and one shared with someone else stays.',
  confirmLabel: 'Remove sample',
  undone: 'Sample workspace removed',
  kept: (names: readonly string[]) =>
    `${names.join(', ')} ${names.length === 1 ? 'stays because it is' : 'stay because they are'} shared.`,
  trashed: (names: readonly string[]) =>
    `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} in Trash, with what you wrote there.`,
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
      onSuccess: ({ kept: shared, trashed }) => {
        pushUndo(SAMPLE_COPY.undone, restore)
        if (shared.length > 0) showToast(SAMPLE_COPY.kept(shared))
        if (trashed.length > 0) showToast(SAMPLE_COPY.trashed(trashed))
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
