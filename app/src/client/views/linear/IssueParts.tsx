/*
The small pieces the issue list and the issue page share: the state mark, the
state pill, a label chip and a comment count. Drawn in ink, not colour: the
open mark carries the accent, a closed one is muted, and not planned is struck.
*/
import { cn } from '../../components/ui/utils.js'
import { STATE_WORD } from './issues.js'
import type { IssueState } from './issues.js'

/** GitHub's state mark: a ringed dot (open), a ticked disc (completed), a struck ring (not planned). */
export function StateMark(props: { readonly state: IssueState; readonly className?: string }): React.JSX.Element {
  const { state } = props
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={cn(
        'size-4 shrink-0',
        state === 'open' ? 'text-primary' : 'text-muted-foreground',
        props.className,
      )}
    >
      {state === 'completed' ? (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M5 8.2 7.1 10.3 11 6" fill="none" stroke="var(--background)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          {state === 'open' ? (
            <circle cx="8" cy="8" r="1.75" fill="currentColor" />
          ) : (
            <path d="M3.8 12.2 12.2 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          )}
        </>
      )}
    </svg>
  )
}

/** The pill beside an issue's title: its mark and "Open", "Closed" or "Not planned". */
export function StatePill(props: { readonly state: IssueState }): React.JSX.Element {
  return (
    <span
      data-state={props.state}
      className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-border px-2 text-xs font-section text-foreground"
    >
      <StateMark state={props.state} className="size-3.5" />
      {STATE_WORD[props.state]}
    </span>
  )
}

/** A label: its colour as a dot (the one colour a label owns), its name in ink. */
export function LabelChip(props: { readonly name: string; readonly color: string }): React.JSX.Element {
  return (
    <span className="inline-flex h-5 max-w-40 shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 text-xs text-foreground">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: props.color }} />
      <span className="min-w-0 truncate">{props.name}</span>
    </span>
  )
}

/** A speech mark and the number of comments; nothing at zero. */
export function CommentCount(props: { readonly count: number | undefined }): React.JSX.Element | null {
  const count = props.count ?? 0
  if (count === 0) return null
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground"
      aria-label={`${String(count)} comment${count === 1 ? '' : 's'}`}
      title={`${String(count)} comment${count === 1 ? '' : 's'}`}
    >
      <svg viewBox="0 0 16 16" aria-hidden className="size-3.5">
        <path
          d="M2.75 3.25h10.5v7.5H8l-3 2.5v-2.5H2.75z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
      {count}
    </span>
  )
}
