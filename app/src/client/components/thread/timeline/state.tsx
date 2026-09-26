/*
A task's three states, as every task surface names and draws them (M4):
To do, Done, Dropped. The stored value for Dropped stays `abandoned`; only
the word and the mark changed.

The mark: an empty ring (to do), a ticked disc (done), a ring struck through
(dropped). A dropped task is never drawn with the done check.
*/
import type { TaskCard } from '../../../../shared/tasks.js'
import { cn } from '../../ui/utils.js'

export type TaskState = 'open' | 'done' | 'dropped'

export function taskState(task: Pick<TaskCard, 'status'>): TaskState {
  return task.status === 'completed' ? 'done' : task.status === 'abandoned' ? 'dropped' : 'open'
}

export const STATE_WORD: Record<TaskState, string> = {
  open: 'To do',
  done: 'Done',
  dropped: 'Dropped',
}

export function StateMark(props: { readonly state: TaskState; readonly className?: string }): React.JSX.Element {
  const { state } = props
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      data-state={state}
      className={cn('size-4 shrink-0', state === 'done' ? 'text-(--color-success-600)' : 'text-muted-foreground', props.className)}
    >
      {state === 'done' ? (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M5 8.2 7.1 10.3 11 6"
            fill="none"
            stroke="var(--background)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          {state === 'dropped' ? (
            <path d="M3.8 12.2 12.2 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          ) : null}
        </>
      )}
    </svg>
  )
}
