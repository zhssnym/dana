import { Button } from '../../ui/button.js'

export const NOT_SAVED = 'Not saved'

/**
 * The one save line every writer draws. Only a failure shows: "Not saved — Retry", or
 * "Load latest" when nothing can re-send it. The live region stays mounted so it announces.
 */
export function SaveFailure({ message, onRetry, onLoadLatest }: {
  /** Null: nothing failed, and the line is empty. */
  readonly message: string | null
  readonly onRetry?: (() => void) | undefined
  readonly onLoadLatest?: (() => void) | undefined
}): React.JSX.Element {
  const action = onRetry ? { label: 'Retry', run: onRetry } : onLoadLatest ? { label: 'Load latest', run: onLoadLatest } : null
  return <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
    {message === null ? null : <>
      {message}
      {action === null ? null : <>
        {message === NOT_SAVED ? ' — ' : ' '}
        <Button variant="link" size="xs" className="text-xs font-normal text-foreground" onClick={action.run}>{action.label}</Button>
      </>}
    </>}
  </p>
}

/** The shared recovery line for unsaved writing from an earlier session. */
export function RecoveryNotice({ onDownload, onRestore, onDiscard }: {
  readonly onDownload: () => void
  readonly onRestore?: (() => void) | undefined
  readonly onDiscard: () => void
}): React.JSX.Element {
  return <div role="status" className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
    Unsaved writing from before is kept.
    <Button variant="ghost" size="sm" onClick={onDownload}>Download writing</Button>
    {onRestore === undefined ? null : <Button variant="ghost" size="sm" onClick={onRestore}>Restore</Button>}
    <Button variant="ghost" size="sm" onClick={onDiscard}>Discard</Button>
  </div>
}
