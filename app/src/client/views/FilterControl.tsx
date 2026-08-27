/*
9.1's filter, drawn: one control on every place-page, named "Filter" by that
section's names table, holding every axis DES-156 rebuilt.

**The panel commits and closes, except where an axis takes several values.**
Choosing a due range, a grouping or a sort is one answer to one question, so
it is written and the panel closes, the way a select does; the chips in the
window bar then say what happened, which is DES-156's whole readout argument.
The assignee axis is the exception and it is the exception for the reason it
exists: "more than one value per axis, Sara *and* Hassan", so its checkboxes
leave the panel open until a person is done with them. The switches close for
the same reason a range does, each being one press that settles one variable.

**Nothing here fetches.** 6 Q1's closing line, "it changes no query", is true
of every axis and not only of importance, because section 6 offers no
parameter for any of them; AC-167 measures it by counting requests.

**"Save as view" is here rather than beside the page's title** because 9.1
puts it here in terms, "the save-view control inside it", and because what it
saves is exactly the state this panel holds (DES-153: a view is a name over a
filter). It writes ids, never names, which is what makes a saved view survive
a rename (AC-209).
*/
import { useState } from 'react'

import { Button } from '../components/ui/button.js'
import { Checkbox } from '../components/ui/checkbox.js'
import { Input } from '../components/ui/input.js'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover.js'
import { Switch } from '../components/ui/switch.js'
import { cn } from '../components/ui/utils.js'
import { Bookmark, Filter as FilterIcon, X } from '../lib/icons.js'
import {
  ABANDONED_HIDDEN,
  CREATED_BY,
  IMPORTANT_ONLY,
  REPEATING_ONLY,
  UNASSIGNED,
  filterChips,
} from './filter.js'
import type { DueAxis, GroupBy, PageFilter, SortBy } from './filter.js'

/** 9.1's names table. A fixed string, and the only name this control has. */
const FILTER = 'Filter'
/** 9.1's names table again: the save-view control inside the filter. */
const SAVE_AS_VIEW = 'Save as view'

export interface FilterPerson {
  readonly id: string
  readonly name: string
}

const DUE_OPTIONS: readonly { value: DueAxis; label: string }[] = [
  { value: 'any', label: 'Any due date' },
  { value: 'with', label: 'With a due date' },
  { value: 'without', label: 'No due date' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'week', label: 'Due this week' },
  { value: 'month', label: 'Due this month' },
  { value: 'custom', label: 'A range of days' },
]

const GROUP_OPTIONS: readonly { value: GroupBy; label: string }[] = [
  { value: 'none', label: 'Nothing' },
  { value: 'folder', label: 'Folder' },
  { value: 'person', label: 'Person' },
  { value: 'date', label: 'Date' },
]

const SORT_OPTIONS: readonly { value: SortBy; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'due', label: 'Due date' },
  { value: 'title', label: 'Title' },
  { value: 'created', label: 'Created' },
]

/**
 * One axis that takes a single value, as a listbox.
 *
 * A listbox rather than a row of buttons because that is what the shape is: a
 * set of alternatives with exactly one chosen, which `aria-selected` says and
 * a pressed state does not.
 */
function AxisListbox<T extends string>({
  label,
  value,
  options,
  onSelect,
}: {
  readonly label: string
  readonly value: T
  readonly options: readonly { value: T; label: string }[]
  readonly onSelect: (next: T) => void
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <p className="px-1 text-[11px] font-semibold tracking-wide text-[var(--color-graphite-500)] uppercase">
        {label}
      </p>
      <div role="listbox" aria-label={label} className="flex flex-wrap gap-1">
        {options.map((option) => (
          <div
            key={option.value}
            role="option"
            tabIndex={0}
            aria-selected={option.value === value}
            className={cn(
              'cursor-pointer rounded-md px-2 py-1 text-[13px] text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-100)] focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none',
              option.value === value &&
                'bg-[var(--color-graphite-800)] text-white hover:bg-[var(--color-graphite-800)]',
            )}
            onClick={() => {
              onSelect(option.value)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              onSelect(option.value)
            }}
          >
            {option.label}
          </div>
        ))}
      </div>
    </div>
  )
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  readonly label: string
  readonly checked: boolean
  readonly onChange: (next: boolean) => void
}): React.JSX.Element {
  return (
    <div className="flex h-8 items-center justify-between gap-3 px-1">
      <span className="text-[13px] text-[var(--color-graphite-700)]">{label}</span>
      {/* The name is on the control rather than on a wrapping label, because
          9.1's addressing paragraph makes a control reachable by its name and
          a label wrapping a switch names the row, not the switch. */}
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

export function FilterControl({
  filter,
  onChange,
  people,
  onSaveView,
}: {
  readonly filter: PageFilter
  readonly onChange: (next: PageFilter) => void
  /** The people this page's rows name, plus the viewer. "Unassigned" is added. */
  readonly people: readonly FilterPerson[]
  /** Null where saving is not offered, which is nowhere today. */
  readonly onSaveView: ((name: string) => void) | null
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [naming, setNaming] = useState(false)
  const [viewName, setViewName] = useState('')

  function commit(next: PageFilter): void {
    onChange(next)
    setOpen(false)
  }

  function toggleAssignee(id: string): void {
    const chosen = filter.assignees.includes(id)
      ? filter.assignees.filter((entry) => entry !== id)
      : [...filter.assignees, id]
    // Stays open: this is the axis that takes several values (DES-156).
    onChange({ ...filter, assignees: chosen })
  }

  function toggleCreator(id: string): void {
    const chosen = filter.creators.includes(id)
      ? filter.creators.filter((entry) => entry !== id)
      : [...filter.creators, id]
    // Multi-value too, so it stays open for the same reason.
    onChange({ ...filter, creators: chosen })
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setNaming(false)
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1.5 px-2 text-[13px] text-[var(--color-graphite-600)]"
          >
            <FilterIcon className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            {FILTER}
          </Button>
        }
      />
      <PopoverContent className="w-80 space-y-3" align="end">
        <AxisListbox
          label="Due"
          value={filter.due}
          options={DUE_OPTIONS}
          onSelect={(due) => {
            /* The custom range needs two more answers, so choosing it opens
               the pair rather than closing the panel on a range with no ends. */
            if (due === 'custom') {
              onChange({ ...filter, due })
              return
            }
            commit({ ...filter, due, from: null, to: null })
          }}
        />
        {filter.due === 'custom' ? (
          <div className="flex items-center gap-2 px-1">
            <Input
              type="date"
              aria-label="From"
              value={filter.from ?? ''}
              onChange={(event) => {
                onChange({ ...filter, from: event.target.value || null })
              }}
            />
            <span className="text-[13px] text-[var(--color-graphite-500)]">to</span>
            <Input
              type="date"
              aria-label="To"
              value={filter.to ?? ''}
              onChange={(event) => {
                onChange({ ...filter, to: event.target.value || null })
              }}
            />
          </div>
        ) : null}

        <div className="space-y-1">
          <p className="px-1 text-[11px] font-semibold tracking-wide text-[var(--color-graphite-500)] uppercase">
            Assignee
          </p>
          <div className="max-h-40 space-y-0.5 overflow-y-auto">
            {[...people, { id: UNASSIGNED, name: 'Unassigned' }].map((person) => (
              <label
                key={person.id}
                className="flex h-7 cursor-pointer items-center gap-2 rounded-md px-1 text-[13px] text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-50)]"
              >
                <Checkbox
                  checked={filter.assignees.includes(person.id)}
                  onCheckedChange={() => {
                    toggleAssignee(person.id)
                  }}
                />
                {person.name}
              </label>
            ))}
          </div>
        </div>

        {/*
        9.1's created-by axis, landed at S25 and closing ledger L-177 and
        L-255.

        **Beside the assignee axis rather than instead of it**, which is
        `task-filters.tsx`'s own arrangement and its stated reason: Dana
        records a creator and never an assigner, so "who made this" and "who
        is carrying it" are two questions, and Assignments answers only the
        second. Multi-value and therefore leaving the panel open, the same
        exception DES-156 makes for the assignee list and for the same reason.

        No "Unassigned" counterpart, and that is not an omission: 4.5 makes
        `created_by` NOT NULL, so there is no task nobody made.
        */}
        <div className="space-y-1">
          <p className="px-1 text-[11px] font-semibold tracking-wide text-[var(--color-graphite-500)] uppercase">
            {CREATED_BY}
          </p>
          <div className="max-h-40 space-y-0.5 overflow-y-auto">
            {people.map((person) => (
              <label
                key={person.id}
                className="flex h-7 cursor-pointer items-center gap-2 rounded-md px-1 text-[13px] text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-50)]"
              >
                <Checkbox
                  checked={filter.creators.includes(person.id)}
                  onCheckedChange={() => {
                    toggleCreator(person.id)
                  }}
                />
                {person.name}
              </label>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-1">
          <SwitchRow
            label={IMPORTANT_ONLY}
            checked={filter.important}
            onChange={(important) => {
              commit({ ...filter, important })
            }}
          />
          <SwitchRow
            label={REPEATING_ONLY}
            checked={filter.repeating}
            onChange={(repeating) => {
              commit({ ...filter, repeating })
            }}
          />
          <SwitchRow
            label={ABANDONED_HIDDEN}
            checked={!filter.showAbandoned}
            onChange={(hidden) => {
              commit({ ...filter, showAbandoned: !hidden })
            }}
          />
        </div>

        <div className="space-y-3 border-t border-border pt-2">
          <AxisListbox
            label="Group by"
            value={filter.groupBy}
            options={GROUP_OPTIONS}
            onSelect={(groupBy) => {
              commit({ ...filter, groupBy })
            }}
          />
          <AxisListbox
            label="Sort by"
            value={filter.sort}
            options={SORT_OPTIONS}
            onSelect={(sort) => {
              commit({ ...filter, sort })
            }}
          />
        </div>

        {onSaveView === null ? null : (
          <div className="border-t border-border pt-2">
            {naming ? (
              <div className="flex items-center gap-2">
                <Input
                  autoFocus
                  aria-label="View name"
                  maxLength={40}
                  value={viewName}
                  onChange={(event) => {
                    setViewName(event.target.value)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    const trimmed = viewName.trim()
                    if (trimmed === '') return
                    onSaveView(trimmed)
                    setViewName('')
                    setNaming(false)
                    setOpen(false)
                  }}
                />
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full justify-start gap-2 px-1 text-[13px] text-[var(--color-graphite-600)]"
                onClick={() => {
                  setNaming(true)
                }}
              >
                <Bookmark className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                {SAVE_AS_VIEW}
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * 9.1's left end: "active state renders as removable chips in the window bar,
 * never as a count alone".
 *
 * A chip is a button that takes its own axis off, and its accessible name is
 * what it says. None of those names is one 9.1's table has already spent:
 * "Important only" rather than "Important", which belongs to a row's star.
 */
export function FilterChips({
  filter,
  onChange,
  people,
}: {
  readonly filter: PageFilter
  readonly onChange: (next: PageFilter) => void
  readonly people: readonly FilterPerson[]
}): React.JSX.Element | null {
  const named = (id: string): string =>
    id === UNASSIGNED
      ? 'Unassigned'
      : (people.find((person) => person.id === id)?.name ?? 'Someone')
  const chips = filterChips(filter, named)
  if (chips.length === 0) return null
  return (
    <>
      {chips.map((chip) => (
        <Button
          key={chip.key}
          variant="ghost"
          size="sm"
          className="h-6 shrink-0 gap-1 rounded-full bg-[var(--color-graphite-100)] px-2 text-[12px] text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-200)]"
          onClick={() => {
            onChange(chip.cleared)
          }}
        >
          {chip.label}
          <X className="size-3" strokeWidth={2} aria-hidden="true" />
        </Button>
      ))}
    </>
  )
}
