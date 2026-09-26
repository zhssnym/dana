/*
The small pieces the Linear list and its task page share: the status mark, the
state pill, a label chip and a post count. Drawn in ink, as the Board's are:
in progress and done carry the accent, not started and abandoned are muted.
*/
import { cn } from '../../components/ui/utils.js'
import { STATE_WORD } from './issues.js'
import type { IssueState } from './issues.js'

/** Dana's status mark, as the task page and the Board draw it (`StatusMark`
    in `components/task-card.tsx`): a dashed ring (not started), a half-filled
    ring (in progress), a ticked disc (done), a struck ring (abandoned). */
export function StateMark(props: { readonly state: IssueState | 'in-progress'; readonly className?: string }): React.JSX.Element {
  const { state } = props
  const live = state === 'completed' || state === 'in-progress'
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={cn(
        'size-4 shrink-0',
        live ? 'text-primary' : 'text-muted-foreground',
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
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={state === 'open' ? '2.4 1.8' : undefined} />
          {state === 'open' ? null : state === 'in-progress' ? (
            <path d="M8 4.25a3.75 3.75 0 0 1 0 7.5z" fill="currentColor" />
          ) : (
            <path d="M3.8 12.2 12.2 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          )}
        </>
      )}
    </svg>
  )
}

/** The pill beside a task's title: its mark and "To do", "Done" or "Abandoned". */
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
      aria-label={`${String(count)} post${count === 1 ? '' : 's'}`}
      title={`${String(count)} post${count === 1 ? '' : 's'}`}
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
