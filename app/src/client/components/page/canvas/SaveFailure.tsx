import { Button } from '../../ui/button.js'

/** The words a failed save says, and the only thing any writer says about saving. */
export const NOT_SAVED = 'Not saved'

/**
 * The one save line every writer (folder, shelf, task) draws under its writing.
 *
 * Success says nothing and a save in flight says nothing; only a failure is
 * shown, quietly: "Not saved — Retry", where Retry re-sends the failed request.
 * A failure nothing can re-send (a conflict, a receipt the page moved past)
 * offers "Load latest" instead, which keeps the draft and offers it back. A
 * writer's own sentence (an edit it could not prepare, a reload that failed)
 * takes the place of "Not saved" in the same line.
 *
 * The live region is always mounted, so a failure appearing in it is announced.
 */
export function SaveFailure({ message, onRetry, onLoadLatest }: {
  /** Absent: nothing failed, and the line is empty. */
  readonly message: string | null
  readonly onRetry?: (() => void) | undefined
  readonly onLoadLatest?: (() => void) | undefined
}): React.JSX.Element {
  const action = onRetry ? { label: 'Retry', run: onRetry } : onLoadLatest ? { label: 'Load latest', run: onLoadLatest } : null
  return <p role="status" aria-live="polite" className="min-h-6 text-xs text-muted-foreground">
    {message === null ? null : <>
      {message}
      {action === null ? null : <>
        {message === NOT_SAVED ? ' — ' : ' '}
        <Button variant="link" size="xs" className="text-xs font-normal text-foreground" onClick={action.run}>{action.label}</Button>
      </>}
    </>}
  </p>
}
