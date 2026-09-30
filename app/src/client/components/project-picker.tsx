/*
A new Work should not ask somebody to choose Dana's architecture before they
have started using it (#400).

The root can still arrive here with `kind` null because step 7 keeps creation
and tab setup as two existing server acts, and older/unpicked Work may still
exist. This component is therefore only the transition out of that state: an
editor applies the existing `usual` tab transaction exactly once, which makes
Purpose, Work, Results and Discussion. Nothing new is stored client-side and
there is no second initialization model.

A reader cannot perform that write, so an unpicked Work they reach keeps one
quiet transitional line rather than exposing a choice they cannot make.
*/
import { useEffect, useRef } from 'react'

import type { PageKind } from '../../shared/folders.js'

type Pick = PageKind | 'usual'

export function ProjectPicker({
  editable,
  pending,
  onPick,
}: {
  readonly editable: boolean
  readonly pending: boolean
  /** Kept in the interface while FolderPage supplies the legacy picker fact. */
  readonly discussion: boolean
  readonly onPick: (kind: Pick) => void
}): React.JSX.Element | null {
  const started = useRef(false)

  useEffect(() => {
    if (!editable || pending || started.current) return
    started.current = true
    onPick('usual')
  }, [editable, onPick, pending])

  if (!editable) {
    return (
      <p className="mt-6 text-center text-sm text-muted-foreground">
        This work is still being set up.
      </p>
    )
  }

  return null
}
