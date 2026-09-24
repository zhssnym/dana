/*
A step's subtasks inside the open step in progress: the first eight, done ones
ticked, each with a box to tick; "n more" opens the task. They are added from
the step's own input ("/ Subtask"). Read from the task only when it has any,
so a page of plain steps costs no extra requests.
*/
import { useState } from 'react'
import { useTask } from '../../api/queries.js'
import { useUpdateStep } from '../../api/mutations.js'
import { CheckMark } from '../../components/ui/checkbox.js'
import { cn } from '../../components/ui/utils.js'
import type { TaskCard } from '../../../shared/tasks.js'

const SHOWN = 8
const MOTION = 'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] motion-reduce:transition-none'

export function Subtasks(props: { readonly task: TaskCard; readonly onOpen: () => void }): React.JSX.Element | null {
  const { task } = props
  const detail = useTask(task.steps_total > 0 ? task.id : null)
  const update = useUpdateStep()
  /* A box ticked here shows its new state before the next read. */
  const [ticked, setTicked] = useState<ReadonlyMap<string, boolean>>(new Map())

  const steps = detail.data?.steps ?? []
  const shown = steps.slice(0, SHOWN)
  const more = steps.length - shown.length

  const toggle = (id: string, done: boolean): void => {
    setTicked((map) => new Map(map).set(id, done))
    update.mutate({ stepId: id, body: { done } })
  }

  if (task.steps_total === 0) return null
  return (
    <div className="flex flex-col pb-1">
      {shown.map((step) => {
        const done = ticked.get(step.id) ?? step.done
        return (
          <label key={step.id} className="flex h-7 cursor-pointer items-center gap-2 rounded-sm px-1.5 text-sm">
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
          className={cn('ml-7 h-6 self-start rounded-sm text-xs text-muted-foreground hover:text-foreground', MOTION)}
        >
          {more} more
        </button>
      )}
    </div>
  )
}
