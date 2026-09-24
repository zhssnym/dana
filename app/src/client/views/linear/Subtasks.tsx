/*
A step in progress, worked on in place: its open subtasks (the first three;
the rest are one click away on the task) with a box to tick each, and a line
to add one. Subtasks are read from the task only when it has any, so a page of
plain steps costs no extra requests.
*/
import { useState } from 'react'
import { useTask } from '../../api/queries.js'
import { useAddStep, useUpdateStep } from '../../api/mutations.js'
import { CheckMark } from '../../components/ui/checkbox.js'
import { cn } from '../../components/ui/utils.js'
import type { TaskCard } from '../../../shared/tasks.js'

const SHOWN = 3
const MOTION = 'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] motion-reduce:transition-none'

export function Subtasks(props: {
  readonly task: TaskCard
  readonly onOpen: () => void
  /** A step with no subtasks shows the add line only once asked for. */
  readonly adding: boolean
  readonly onStopAdding: () => void
}): React.JSX.Element | null {
  const { task } = props
  const detail = useTask(task.steps_total > 0 ? task.id : null)
  const update = useUpdateStep()
  const add = useAddStep()
  const [draft, setDraft] = useState('')
  /* A box ticked here stays in view until the next read, so a slip can be undone. */
  const [ticked, setTicked] = useState<ReadonlyMap<string, boolean>>(new Map())

  const steps = (detail.data?.steps ?? []).filter((step) => !step.done || ticked.has(step.id))
  const shown = steps.slice(0, SHOWN)
  const more = steps.length - shown.length

  const toggle = (id: string, done: boolean): void => {
    setTicked((map) => new Map(map).set(id, done))
    update.mutate({ stepId: id, body: { done } })
  }

  if (task.steps_total === 0 && !props.adding) return null
  return (
    <div className="flex flex-col pb-1 pl-8">
      {shown.map((step) => {
        const done = ticked.get(step.id) ?? step.done
        return (
          <label key={step.id} className="flex h-7 cursor-pointer items-center gap-2 rounded-sm pr-1.5 text-sm">
            <input
              type="checkbox"
              checked={done}
              onChange={(event) => toggle(step.id, event.target.checked)}
              className="peer sr-only"
            />
            {/* The input is hidden; the box wears the one focus style for it. */}
            <CheckMark
              checked={done}
              className="peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-(--focus-ring)"
            />
            <span className={cn('min-w-0 truncate', done ? 'text-muted-foreground line-through' : 'text-foreground')}>
              {step.title}
            </span>
          </label>
        )
      })}
      {more > 0 && (
        <button
          type="button"
          onClick={props.onOpen}
          className={cn('ml-6 h-6 self-start rounded-sm text-xs text-muted-foreground hover:text-foreground', MOTION)}
        >
          {more} more
        </button>
      )}
      <input
        type="text"
        value={draft}
        aria-label={`Add a subtask to ${task.title}`}
        placeholder="Add subtask"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            const title = draft.trim()
            if (title === '') return
            add.mutate({ taskId: task.id, title })
            setDraft('')
          } else if (event.key === 'Escape') {
            event.preventDefault()
            setDraft('')
            event.currentTarget.blur()
          }
        }}
        autoFocus={props.adding}
        onBlur={() => {
          if (draft.trim() === '') props.onStopAdding()
        }}
        className={cn(
          'h-7 min-w-0 rounded-sm bg-transparent pl-6 text-sm text-foreground outline-none placeholder:text-quiet-foreground',
        )}
      />
    </div>
  )
}
