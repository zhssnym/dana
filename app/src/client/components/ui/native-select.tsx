/*
The one styled native `<select>` this client draws.

The suite drives every dropdown of record with `selectOption` (its harness
says so), which only a real `<select>` answers, so the folder page's filter
and the sharing panel's roster picker cannot become the popover-based Select
primitive without taking the tests' instrument away. What they can do is stop
looking like two different controls: this wrapper is the primitive trigger's
own recipe (height, border, radius, focus ring, chevron) painted onto the
native element, `appearance-none` so the platform's chrome does not paint a
second chevron beside ours.

The chevron is `aria-hidden` and `pointer-events-none`: the select underneath
is the control, full stop.
*/
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
        className="h-[var(--control-height)] w-full min-w-0 cursor-pointer appearance-none rounded-md border border-[var(--color-graphite-200)] bg-white py-1 pr-8 pl-3 text-sm text-foreground transition-colors outline-none hover:bg-[var(--color-graphite-25)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </span>
  )
}

export { NativeSelect }
