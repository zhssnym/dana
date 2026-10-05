// A Work root with no `kind` yet: an editor applies the `usual` tab setup once, which
// makes Purpose, Work, Results and Discussion. A reader sees one transitional line.
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
  /** Kept while FolderPage still passes it. */
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
