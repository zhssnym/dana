/*
The view strip of 9.1: "one control per place-page offering the views the page
can honestly draw".

**Which views a page offers is `place-pages.ts`'s table and never this
control's guess**, so a page that cannot draw a calendar has no calendar
option rather than a disabled one. DES-144 is the rule: "a menu of dead items
is the least premium thing an interface owns", and a disabled calendar
promises a thing that is never coming to that page.

**Choosing board on an ungrouped page sets a grouping**, which DES-182 states
outright: "the board draws the page's grouping, so it needs one, and choosing
Board on an ungrouped page therefore *sets* one, the two controls being one
setting seen twice". The default is the page's own axis, people on Assignments
and the folder everywhere else.

**Plain buttons carrying their names as text, not a radiogroup.** The
prototype's strip is a radiogroup of icon buttons and this is the one place
this port departs from it, deliberately and for an addressing reason rather
than a visual one: 9.1's roles table fixes roles for eight things and the view
strip is not among them, so a criterion reaches these "by their role in the
ordinary sense", and the ordinary role of a control that changes the view is a
button. AC-093 already addresses the calendar that way, by the name
"Calendar", exactly. `aria-pressed` carries which one is current, and the tone
is the second cue rather than the only one.
*/
import { Button } from '../components/ui/button.js'
import { cn } from '../components/ui/utils.js'
import { CalendarDays, LayoutGrid, List } from '../lib/icons.js'
import type { LucideIcon } from '../lib/icons.js'
import type { ViewMode } from './view-mode.js'

const FACES: Record<ViewMode, { label: string; icon: LucideIcon }> = {
  list: { label: 'List', icon: List },
  board: { label: 'Board', icon: LayoutGrid },
  calendar: { label: 'Calendar', icon: CalendarDays },
}

export function ViewStrip({
  offered,
  mode,
  onSelect,
}: {
  readonly offered: readonly ViewMode[]
  readonly mode: ViewMode
  readonly onSelect: (next: ViewMode) => void
}): React.JSX.Element {
  return (
    <div role="group" aria-label="View" className="flex shrink-0 items-center gap-0.5">
      {offered.map((option) => {
        const face = FACES[option]
        const Icon = face.icon
        const current = option === mode
        return (
          <Button
            key={option}
            variant="ghost"
            size="sm"
            aria-pressed={current}
            className={cn(
              'h-7 gap-1.5 px-2 text-[13px] text-[var(--color-graphite-600)]',
              current && 'bg-[var(--color-graphite-100)] text-[var(--color-graphite-900)]',
            )}
            onClick={() => {
              onSelect(option)
            }}
          >
            <Icon className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            {face.label}
          </Button>
        )
      })}
    </div>
  )
}
