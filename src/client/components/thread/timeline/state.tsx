// A task's three states: To do, Done, Dropped (stored as `abandoned`). A task is always a
// square, as in the task list. A dropped task is never drawn with the done check.
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
          <rect x="1" y="1" width="14" height="14" rx="3" fill="currentColor" />
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
          <rect x="1.75" y="1.75" width="12.5" height="12.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          {state === 'dropped' ? (
            <path d="M3.8 12.2 12.2 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          ) : null}
        </>
      )}
    </svg>
  )
}
