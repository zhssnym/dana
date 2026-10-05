/*
 * The sample workspace hooks shared by the strip and the Settings row. "Keep it" is a per-device dismissal.
 * Removal (Settings only, after a confirm) also dismisses the starter offer; undo is POST /sample, which is
 * idempotent.
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
