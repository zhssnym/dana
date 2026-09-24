/*
Consultation's one either/or control: the Discussion list's state filter and
the Resolve dialog's "how to record it" both draw it. The selected option is a
plain sheet on a muted track, with no shadow under it.
*/
import { cn } from '../ui/utils.js'

export function Choice<T extends string>({
  label,
  value,
  options,
  onSelect,
  className,
}: {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onSelect: (next: T) => void
  className?: string
}): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('flex gap-0.5 rounded-md bg-muted p-0.5', className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onSelect(option.value)}
          className={cn(
            'h-6 flex-1 rounded-sm px-2.5 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === option.value
              ? 'bg-background text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
