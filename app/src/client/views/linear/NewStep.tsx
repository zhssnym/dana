/*
The foot of a milestone in the queue: type a task, Enter adds it (not started)
and keeps the caret here for the next one, Esc clears.
*/
import { useState } from 'react'
import { Plus } from '../../lib/icons.js'
import { cn } from '../../components/ui/utils.js'

export function NewStep(props: {
  readonly onCreate: (title: string) => void
  readonly children?: React.ReactNode
}): React.JSX.Element {
  const [draft, setDraft] = useState('')
  return (
    <li role="listitem" className="group/new relative flex h-8 items-center gap-2 pr-2">
      {props.children}
      <span aria-hidden className="relative flex size-6 shrink-0 items-center justify-center">
        <span
          className={cn(
            'flex size-4 items-center justify-center rounded-full border border-dashed border-quiet-foreground/60 bg-background text-quiet-foreground',
            'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] motion-reduce:transition-none',
            'group-focus-within/new:border-solid group-focus-within/new:border-primary group-focus-within/new:text-primary',
          )}
        >
          <Plus className="size-2.5" strokeWidth={2.5} />
        </span>
      </span>
      <input
        type="text"
        value={draft}
        aria-label="New task"
        placeholder="New task"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            const title = draft.trim()
            if (title === '') return
            props.onCreate(title)
            setDraft('')
          } else if (event.key === 'Escape') {
            event.preventDefault()
            setDraft('')
            event.currentTarget.blur()
          }
        }}
        className="h-7 min-w-0 flex-1 rounded-sm bg-transparent px-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
    </li>
  )
}
