/* A real <select> (tests drive it with selectOption), painted as a quiet control. */
import { ChevronDownIcon } from '../../lib/icons.js'

import { cn } from './utils.js'

function NativeSelect({
  className,
  children,
  ...props
}: React.ComponentProps<'select'>): React.JSX.Element {
  return (
    <span className={cn('relative inline-flex', className)}>
      <select
        data-slot="native-select"
        className="h-8 w-full min-w-0 cursor-pointer appearance-none rounded-sm bg-transparent py-1 pr-7 pl-2 text-sm text-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground"
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </span>
  )
}

export { NativeSelect }
