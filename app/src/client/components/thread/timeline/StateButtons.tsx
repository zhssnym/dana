/*
The task page's one finishing act (M4), beside "Post" under the timeline:
"Mark done ▾", whose menu holds Drop, or "Reopen" once the task is done or
dropped. With words in the composer it reads "Post and mark done" and posts
first, so the post sits before the event in the timeline.

Only the buttons the person's access lets them press are drawn: marking done
and reopening a done task need task.status.complete; dropping and reopening
a dropped one need task.status.abandon.
*/
import { useEffect, useRef } from 'react'

import { ChevronDown } from '../../../lib/icons.js'
import { Button } from '../../ui/button.js'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../ui/dropdown-menu.js'
import { StateMark } from './state.js'
import type { TaskState } from './state.js'

export interface StateMay {
  readonly complete: boolean
  readonly abandon: boolean
}

export function StateButtons(props: {
  readonly state: TaskState
  readonly may: StateMay
  readonly withPost: boolean
  readonly busy: boolean
  readonly onFinish: (how: 'done' | 'dropped') => void
  readonly onReopen: () => void
}): React.JSX.Element | null {
  const { state, withPost, may } = props
  /* Finishing swaps "Mark done" for "Reopen" (and back), so the pressed
     button unmounts; once the state has moved, focus goes to its successor. */
  const pressed = useRef(false)
  useEffect(() => {
    if (!pressed.current) return
    pressed.current = false
    document.querySelector<HTMLElement>('[data-task-state-button]')?.focus()
  }, [state])
  const finish = (how: 'done' | 'dropped'): void => {
    pressed.current = true
    props.onFinish(how)
  }
  const reopen = (): void => {
    pressed.current = true
    props.onReopen()
  }

  if (state !== 'open') {
    if (!(state === 'done' ? may.complete : may.abandon)) return null
    return (
      <Button variant="outline" disabled={props.busy} data-task-state-button onClick={reopen}>
        {withPost ? 'Post and reopen' : 'Reopen'}
      </Button>
    )
  }
  if (!may.complete) return null
  const done = (
    <Button
      variant="outline"
      disabled={props.busy}
      className={may.abandon ? 'rounded-r-none' : undefined}
      data-task-state-button
      onClick={() => finish('done')}
    >
      {withPost ? 'Post and mark done' : 'Mark done'}
    </Button>
  )
  if (!may.abandon) return done
  return (
    <div className="flex">
      {done}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              disabled={props.busy}
              aria-label="Other ways to finish"
              className="-ml-px rounded-l-none"
            />
          }
        >
          <ChevronDown className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => finish('done')}>
            <StateMark state="done" className="size-3.5" />
            Mark done
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => finish('dropped')}>
            <StateMark state="dropped" className="size-3.5" />
            Drop
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
