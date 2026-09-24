/*
The one view switcher (round 5): a segmented row of words, always visible, one
click, the current one in the foreground, arrow keys move between them. A page
shows it for Linear · Board · Freeform; Upcoming for List · Calendar; Assigned
for List · Board. Today has one layout and no switcher.

One name per view, here and nowhere else. "List" is a place page's plain list
and "Freeform" is a page's writing canvas: two different things, two names.
*/
import { cn } from '../components/ui/utils.js'
import type { FolderView, ViewMode } from './view-mode.js'

export type ViewName = ViewMode | FolderView

export const VIEW_LABELS: Record<ViewName, string> = {
  list: 'List',
  linear: 'Linear',
  board: 'Board',
  calendar: 'Calendar',
  freeform: 'Freeform',
}

export function ViewSwitch<T extends ViewName>({
  choices,
  value,
  onChange,
}: {
  readonly choices: readonly T[]
  readonly value: T
  readonly onChange: (next: T) => void
}): React.JSX.Element {
  return (
    <div role="radiogroup" aria-label="View" className="flex items-center gap-0.5">
      {choices.map((choice, index) => {
        const current = choice === value
        return (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={current}
            tabIndex={current ? 0 : -1}
            onClick={() => {
              onChange(choice)
            }}
            onKeyDown={(event) => {
              const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
              if (step === 0) return
              event.preventDefault()
              const next = choices[(index + step + choices.length) % choices.length]
              if (next === undefined) return
              onChange(next)
              const group = event.currentTarget.parentElement
              requestAnimationFrame(() => {
                group?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
              })
            }}
            className={cn(
              'h-[var(--control-height)] rounded-sm px-2 text-xs transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
              current ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {VIEW_LABELS[choice]}
          </button>
        )
      })}
    </div>
  )
}
