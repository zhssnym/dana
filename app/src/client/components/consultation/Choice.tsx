/*
Consultation's one either/or control: the Discussion list's state filter and
the Resolve dialog's "how to record it" both draw it. The selected option is a
plain sheet on the graphite track, with no shadow under it.
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
      className={cn('flex gap-0.5 rounded-md bg-[var(--color-graphite-100)] p-0.5', className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onSelect(option.value)}
          className={cn(
            'h-6 flex-1 rounded-sm px-2.5 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)]',
            value === option.value
              ? 'bg-[var(--color-graphite-0)] text-[var(--color-graphite-900)]'
              : 'text-[var(--color-graphite-500)] hover:text-[var(--color-graphite-800)]',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
