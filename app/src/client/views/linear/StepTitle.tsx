/*
A step's title you can type in, the way a Notion table's title cell is: click
to place the caret, Enter or leaving saves, Esc puts the old title back. An
empty title is not a title, so it reverts rather than saving nothing.
*/
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../components/ui/utils.js'

export function StepTitle(props: {
  readonly title: string
  readonly className?: string
  readonly onRename: (title: string) => void
}): React.JSX.Element {
  const { title, className, onRename } = props
  const [draft, setDraft] = useState(title)
  const editing = useRef(false)
  /* A rename from elsewhere (the panel, another member) lands here unless the
     person is typing in this very field. */
  useEffect(() => {
    if (!editing.current) setDraft(title)
  }, [title])

  const commit = (): void => {
    editing.current = false
    const next = draft.trim()
    if (next === '' || next === title) {
      setDraft(title)
      return
    }
    setDraft(next)
    onRename(next)
  }

  return (
    <input
      type="text"
      value={draft}
      aria-label="Step title"
      spellCheck={false}
      onFocus={() => {
        editing.current = true
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          editing.current = false
          setDraft(title)
          /* Blur after the revert has rendered, so leaving does not save the
             text Esc just discarded. */
          const field = event.currentTarget
          requestAnimationFrame(() => field.blur())
        }
      }}
      className={cn(
        'h-7 min-w-0 flex-1 truncate rounded-sm bg-transparent px-1.5 text-sm outline-none',
        'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] motion-reduce:transition-none',
        'focus:bg-background focus:ring-1 focus:ring-ring/40',
        className,
      )}
    />
  )
}
