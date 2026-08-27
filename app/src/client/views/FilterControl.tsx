/*
9.1's filter, drawn: one control on every place-page, named "Filter" by that
section's names table, holding every axis DES-156 rebuilt.

**The markup is `prototype-v2`'s `components/task-filters.tsx` and the model
is this client's**, which is RFC 0005 change control item 48(i)'s distinction
applied to the one file of RFC 0004's S25 row where it actually bites. That
file is 1,139 lines and only its last four hundred are a panel: the rest is a
filter model over name-keyed fixture people, a `localStorage` store for saved
views its own comment says "may not be ported as though it worked", and a set
of predicates this client already has in `views/filter.ts` over ids. So the
controls, their classes, their arrangement and their words cross; the state
they read does not. Measured before it was decided, by item 48(j)'s method:
the panel's own class strings were 18 of 41 present before this file changed.

**The panel is a page of axes rather than a page of every value.** Each axis
is one row saying what it is set to, opening onto its values, which is the
prototype's `Axis` and the reason the panel fits in 292 pixels with seven axes
in it. The switches and the two footer acts sit flat beneath them.

**Nothing here fetches.** 6 Q1's closing line, "it changes no query", is true
of every axis and not only of importance, because section 6 offers no
parameter for any of them; AC-167 measures it by counting requests.

**"Save as view" is here rather than beside the page's title** because 9.1
puts it here in terms, "the save-view control inside it", and because what it
saves is exactly the state this panel holds (DES-153: a view is a name over a
filter). It writes ids, never names, which is what makes a saved view survive
a rename (AC-209).

**The seams, each named because a later reader will otherwise take the
prototype's version for the contract. Four are the ones this file was written
with; three more were found by driving the leg rather than by reading it,
which is item 47(e)'s lesson arriving here too, and each of those is beside
the code it governs rather than in this list: the three axis labels a
criterion addresses, the panel committing and closing, and the Due axis
resting open.**

1. **The trigger is named "Filter" and says nothing about a count.** The
   prototype writes an aria-label of "Filters" with the active count in it;
   9.1's names table fixes "Filter" for this control, and AC-167, AC-176,
   AC-221, AC-228 and AC-259 all address it as `{ name: 'Filter', exact:
   true }`. The section wins (11.13), which is the ruling F1 and F2 took. The
   count badge beside the glyph is the prototype's and stays, being
   presentation rather than a name. A chip's own name drops the word "filter"
   for the same reason and keeps everything else the prototype gives it.
2. **A value row is an `option` in a `listbox`, not a `menuitemradio`.** The
   prototype's `FilterChoice` carries `role="menuitemradio"`; the criteria
   above reach a value as `getByRole('option')` or `getByRole('menuitem')`,
   and ARIA makes `menuitemradio` neither of those, so a verbatim lift turns
   green cases red for a role 9.1 does not fix either way. The visible
   control, its classes and its tick are the prototype's; the role is the one
   the section's own addressing paragraph makes reachable.
3. **Saved views are 4.19's rows and not a browser store.** The prototype
   keeps them in `localStorage` and says in terms that no part of that may be
   ported as though it worked; this client has `POST /views` and the pin list
   of 9.7 behind it. So the list, its delete control and the naming form are
   the prototype's markup over the real thing.
4. **People are ids and the label is theirs.** The prototype matches people by
   first name because its fixtures have no ids; `usePlace` hands this the ids
   its rows actually name, and `UNASSIGNED` is the assignee axis's own value
   for nobody rather than a person.
*/
import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { isoDay, parseIsoDate } from '../lib/task-model.js'

import { Calendar } from '../components/ui/calendar.js'
import { Input } from '../components/ui/input.js'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover.js'
import { Switch } from '../components/ui/switch.js'
import { cn } from '../components/ui/utils.js'
import {
  ArrowDownUp,
  Ban,
  Bookmark,
  CalendarDays,
  Check,
  ChevronRight,
  Filter as FilterIcon,
  Group,
  Repeat2,
  Star,
  UserPlus,
  UserRound,
  X,
} from '../lib/icons.js'
import type { LucideIcon } from '../lib/icons.js'
import {
  ABANDONED_HIDDEN,
  CREATED_BY,
  IMPORTANT_ONLY,
  REPEATING_ONLY,
  UNASSIGNED,
  filterChips,
  isNarrowed,
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

/** A saved view as the panel lists it. `views/usePlace.tsx` supplies them. */
export interface SavedViewEntry {
  readonly id: string
  readonly name: string
}

/*
What the panel says a half-built range means, which is the prototype's own
reading: an open range is "from this day onward" rather than nothing, and
`views/filter.ts` already honours it that way.
*/
function rangeSentence(from: string | null, to: string | null): string {
  if (from !== null && to !== null) return from === to ? from : `${from} to ${to}`
  if (from !== null) return `From ${from}`
  if (to !== null) return `Until ${to}`
  return 'Pick the first day, then the last.'
}

const CHIP_ICON: Record<string, LucideIcon> = {
  due: CalendarDays,
  assignees: UserRound,
  creators: UserPlus,
  important: Star,
  repeating: Repeat2,
  abandoned: Ban,
}

const T_FAST = 'duration-[var(--duration-fast)] ease-[var(--ease-standard)]'
const FOCUS =
  'outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1'

/* The window bar's control tier: 28px in a 36px strip. Chrome is thin. */
const stripButtonClass = (active: boolean): string =>
  cn(
    'relative flex size-7 items-center justify-center rounded-md transition-[background-color,color] disabled:pointer-events-none disabled:opacity-35',
    T_FAST,
    FOCUS,
    active
      ? 'bg-[var(--color-graphite-100)] text-[var(--color-graphite-800)]'
      : 'text-[var(--color-graphite-500)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)]',
  )

/*
The axis labels, and three of them are the client's words rather than the
prototype's, each because a criterion addresses the string and this row owns
no rework of one.

Item 48(e)'s lesson is what found them, and it found them by being followed:
when a lift changes a *string*, grep the string across `app/tests/` and trust
that over any pile sorted by surface. AC-176 addresses two of the due axis's
values exactly, and AC-228 and AC-259 both address the group-by value as the
one word "Date", where the prototype writes "Any", "Has a due date" and "Due
date". Section 9 fixes none of the three, so no section settles it and the
criterion is the only artefact with an opinion. Taking the prototype's three
words would turn four green cases red in a package the triage gave no rework
to, which is what item 47(j) declined to do for the same reason.

**Offered to persona 11 and to S29**, which is the row that collects exactly
this class. Every other label below is the prototype's, the two range presets
nothing addresses included.
*/
const DUE_LABEL: Record<DueAxis, string> = {
  any: 'Any due date',
  with: 'With a due date',
  without: 'No due date',
  overdue: 'Overdue',
  today: 'Today',
  week: 'The next 7 days',
  month: 'The rest of this month',
  custom: 'Custom range',
}

const GROUP_LABEL: Record<GroupBy, string> = {
  none: 'Nothing',
  folder: 'Folder',
  person: 'Person',
  /* The client's word, and the note above says why. */
  date: 'Date',
}

const SORT_LABEL: Record<SortBy, string> = {
  manual: 'Manual',
  due: 'Due date',
  title: 'Title',
  created: 'Created',
}

function SectionLabel({
  icon: Icon,
  children,
}: {
  readonly icon: LucideIcon
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <p className="flex items-center gap-1.5 px-1 pt-2 pb-1 text-[12px] leading-4 font-medium text-[var(--color-graphite-500)]">
      <Icon className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
      {children}
    </p>
  )
}

function SectionIcon({ icon: Icon }: { readonly icon: LucideIcon }): React.JSX.Element {
  return (
    <Icon
      className="size-3.5 shrink-0 text-[var(--color-graphite-500)]"
      strokeWidth={1.75}
      aria-hidden="true"
    />
  )
}

const rowClass = (selected: boolean): string =>
  cn(
    'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] leading-5 transition-colors',
    T_FAST,
    FOCUS,
    selected
      ? 'bg-[var(--color-graphite-100)] text-[var(--color-graphite-900)]'
      : 'text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-50)]',
  )

/* One of many, the axis takes exactly one value. Seam 2 is the role. */
function FilterChoice({
  label,
  selected,
  onSelect,
  leading,
}: {
  readonly label: string
  readonly selected: boolean
  readonly onSelect: () => void
  readonly leading?: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={rowClass(selected)}
    >
      {leading}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected ? (
        <Check
          className="size-3.5 shrink-0 text-[var(--color-graphite-700)]"
          strokeWidth={2.5}
          aria-hidden="true"
        />
      ) : null}
    </button>
  )
}

/*
Any of many, the axis takes a set.

It is a different control from `FilterChoice` on purpose, and the difference
is a box rather than a tick: a checkbox says "and others may also be on", a
tick at the end of a row says "this is the one". Drawing both as a tick is how
a person learns by pressing that the panel does not mean what it drew.
*/
function FilterToggle({
  label,
  checked,
  onToggle,
}: {
  readonly label: string
  readonly checked: boolean
  readonly onToggle: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="option"
      aria-selected={checked}
      onClick={onToggle}
      className={rowClass(checked)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
          T_FAST,
          checked
            ? 'border-[var(--color-graphite-900)] bg-[var(--color-graphite-900)] text-white'
            : 'border-[var(--color-graphite-300)] bg-card',
        )}
      >
        {checked ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

function SwitchRow({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  readonly icon: LucideIcon
  readonly label: string
  readonly checked: boolean
  readonly onChange: (next: boolean) => void
}): React.JSX.Element {
  return (
    <label
      className={cn(
        'flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] leading-5 text-[var(--color-graphite-700)] transition-colors hover:bg-[var(--color-graphite-50)]',
        T_FAST,
      )}
    >
      <Icon
        className="size-3.5 shrink-0 text-[var(--color-graphite-500)]"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">{label}</span>
      {/* The name is on the control rather than on the wrapping label, because
          9.1's addressing paragraph makes a control reachable by its name and
          a label wrapping a switch names the row, not the switch. */}
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

/* An axis whose values live behind one row, so the panel is a page of axes
   rather than a page of every value every axis has. */
function Axis({
  icon,
  label,
  value,
  defaultOpen = false,
  children,
}: {
  readonly icon: LucideIcon
  readonly label: string
  readonly value: string
  /*
  **Seam, S25.** The prototype opens every axis closed, and the Due axis opens
  open here. Two reasons, and the second is the one that decides it: Due is
  the one axis every place page and the folder page share as their first
  question, so a panel that opens on nothing makes the commonest narrowing two
  presses; and 9.6 states that question in terms as what the folder page's
  filter offers, "all open tasks, those with a due date, and those without",
  which AC-176 reads by opening the filter and pressing the option. Every
  other axis rests closed, which is what keeps the panel a page of axes.
  */
  readonly defaultOpen?: boolean
  readonly children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((wasOpen) => !wasOpen)
        }}
        className={rowClass(false)}
      >
        <SectionIcon icon={icon} />
        <span className="shrink-0 text-[var(--color-graphite-700)]">{label}</span>
        <span className="min-w-0 flex-1 truncate text-right text-[var(--color-graphite-500)]">
          {value}
        </span>
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 text-[var(--color-graphite-400)] transition-transform',
            T_FAST,
            open && 'rotate-90',
          )}
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div role="listbox" aria-label={label} className="pt-0.5 pb-1 pl-2">
          {children}
        </div>
      ) : null}
    </div>
  )
}

export function FilterControl({
  filter,
  onChange,
  people,
  onSaveView,
  savedViews = [],
  onDeleteView,
}: {
  readonly filter: PageFilter
  readonly onChange: (next: PageFilter) => void
  /** The people this page's rows name, plus the viewer. "Unassigned" is added. */
  readonly people: readonly FilterPerson[]
  /** Null where saving is not offered, which is nowhere today. */
  readonly onSaveView: ((name: string) => void) | null
  /** 4.19's saved views made on this page, listed at the panel's head. */
  readonly savedViews?: readonly SavedViewEntry[]
  readonly onDeleteView?: (id: string) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [, setSearch] = useSearchParams()
  const [viewName, setViewName] = useState('')

  const narrowed = isNarrowed(filter)
  const arranged = filter.groupBy !== 'none' || filter.sort !== 'manual'
  const count =
    Number(filter.due !== 'any') +
    Number(filter.assignees.length > 0) +
    Number(filter.creators.length > 0) +
    Number(filter.repeating) +
    Number(filter.important) +
    Number(!filter.showAbandoned)

  /*
  **Seam, S25: the panel commits and closes, which the prototype's does not.**

  DES-156's rule, as this client has carried it since the axis model was
  written: choosing a due range, a grouping or a sort is one answer to one
  question, so it is written and the panel closes the way a select does, and
  the chips in the window bar then say what happened. The two set-valued axes
  are the exception, and they are the exception for the reason they exist,
  "more than one value per axis, Sara and Hassan", so their checkboxes leave
  the panel open until a person is done with them. A switch closes for the
  same reason a range does, being one press that settles one variable.

  It is a seam rather than a preference because AC-167 reaches the important
  switch by pressing "Filter" before each toggle, and its own comment says it
  does so because section 9 fixes nothing about whether the surface stays
  open. A panel that stayed open would answer that second press by closing.
  */
  function commit(next: PageFilter): void {
    onChange(next)
    setOpen(false)
  }

  function toggleIn(axis: 'assignees' | 'creators', id: string): void {
    const chosen = filter[axis].includes(id)
      ? filter[axis].filter((entry) => entry !== id)
      : [...filter[axis], id]
    // The two set-valued axes leave the panel open (DES-156).
    onChange({ ...filter, [axis]: chosen })
  }

  const chosenLabel = (ids: readonly string[]): string =>
    ids.length === 0 ? 'Anyone' : `${String(ids.length)} chosen`

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSaving(false)
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            /* Seam 1: 9.1's name, and no count inside it. */
            aria-label={FILTER}
            className={cn(stripButtonClass(narrowed || arranged), count > 0 && 'w-auto gap-1.5 px-2.5')}
          >
            <FilterIcon
              className="size-3.5 data-[size=sm]:size-3.5"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            {count > 0 ? (
              <span
                aria-hidden="true"
                className="text-[12px] leading-4 font-medium tabular-nums"
              >
                {count}
              </span>
            ) : null}
          </button>
        }
      />
      <PopoverContent align="end" className="max-h-[min(560px,70vh)] w-[292px] overflow-y-auto p-2">
        {savedViews.length > 0 ? (
          <>
            <SectionLabel icon={Bookmark}>Saved views</SectionLabel>
            {savedViews.map((view) => (
              <div key={view.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    /* Opening a saved view is a navigation rather than a
                       filter edit: `usePlace` reads `?view=` and seeds the
                       page's filter from 4.19's stored definition, so the
                       address bar and the panel cannot disagree about which
                       view is open. */
                    setOpen(false)
                    setSearch({ view: view.id })
                  }}
                  className={cn(rowClass(false), 'min-w-0 flex-1')}
                >
                  <span className="min-w-0 flex-1 truncate">{view.name}</span>
                </button>
                {onDeleteView === undefined ? null : (
                  <button
                    type="button"
                    aria-label={`Delete view: ${view.name}`}
                    onClick={() => {
                      onDeleteView(view.id)
                    }}
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--color-graphite-400)] transition-colors hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-700)]',
                      T_FAST,
                      FOCUS,
                    )}
                  >
                    <X
                      className="size-3.5 data-[size=sm]:size-3.5"
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                  </button>
                )}
              </div>
            ))}
            <div className="mx-1 my-2 h-px bg-[var(--color-graphite-100)]" aria-hidden="true" />
          </>
        ) : null}

        <Axis icon={CalendarDays} label="Due" value={DUE_LABEL[filter.due]} defaultOpen>
          {(['any', 'with', 'without'] as const).map((value) => (
            <FilterChoice
              key={value}
              label={DUE_LABEL[value]}
              selected={filter.due === value}
              onSelect={() => {
                commit({ ...filter, due: value, from: null, to: null })
              }}
            />
          ))}
          <FilterChoice
            label={DUE_LABEL.overdue}
            leading={
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-[var(--color-danger-600)]"
              />
            }
            selected={filter.due === 'overdue'}
            onSelect={() => {
              commit({ ...filter, due: 'overdue', from: null, to: null })
            }}
          />
          <div className="mx-1 my-1.5 h-px bg-[var(--color-graphite-100)]" aria-hidden="true" />
          {(['today', 'week', 'month'] as const).map((value) => (
            <FilterChoice
              key={value}
              label={DUE_LABEL[value]}
              selected={filter.due === value}
              onSelect={() => {
                commit({ ...filter, due: value, from: null, to: null })
              }}
            />
          ))}
          <FilterChoice
            label={DUE_LABEL.custom}
            selected={filter.due === 'custom'}
            onSelect={() => {
              onChange({ ...filter, due: filter.due === 'custom' ? 'any' : 'custom' })
            }}
          />
          {filter.due === 'custom' ? (
            /*
            **Ledger L-216 closes properly here, and it read closed before.**

            That entry is "one calendar, shared by the due picker, the reminder
            picker and the filter's custom range", and this client had it for
            two of the three: `components/ui/calendar.tsx` answers the pickers
            of `components/task-pickers.tsx` and drew nothing here, where a
            pair of native `type="date"` inputs stood instead. Two date fields
            and a month grid are two ways to answer one question in one
            product, which is the fault DES-154 exists to name, and no
            criterion addressed either, so nothing would have found it.

            The gesture is the prototype's own: the first press opens a range
            and the second closes it. An open range is a real state rather than
            a half-finished one, "from with no to" meaning on or after that
            day, which `views/filter.ts` already honours; and closing it sorts
            the two days, because the 20th back to the 14th is a range somebody
            meant rather than a mistake to refuse.
            */
            <div className="px-1 pt-1.5">
              <p className="pb-1.5 text-[12px] leading-4 text-[var(--color-graphite-500)]">
                {filter.from === null && filter.to === null
                  ? 'Pick the first day, then the last.'
                  : rangeSentence(filter.from, filter.to)}
              </p>
              <Calendar
                selected={null}
                range={{
                  from: filter.from === null ? null : parseIsoDate(filter.from),
                  to: filter.to === null ? null : parseIsoDate(filter.to),
                }}
                onSelect={(date) => {
                  const key = isoDay(date)
                  const opening = filter.from !== null && filter.to === null
                  if (!opening) {
                    onChange({ ...filter, from: key, to: null })
                    return
                  }
                  const first = filter.from ?? key
                  const [from, to] = first <= key ? [first, key] : [key, first]
                  onChange({ ...filter, from, to })
                }}
                className="w-full"
              />
            </div>
          ) : null}
        </Axis>

        <Axis icon={UserRound} label="Assigned to" value={chosenLabel(filter.assignees)}>
          {people.map((person) => (
            <FilterToggle
              key={person.id}
              label={person.name}
              checked={filter.assignees.includes(person.id)}
              onToggle={() => {
                toggleIn('assignees', person.id)
              }}
            />
          ))}
          <FilterToggle
            label="Unassigned"
            checked={filter.assignees.includes(UNASSIGNED)}
            onToggle={() => {
              toggleIn('assignees', UNASSIGNED)
            }}
          />
        </Axis>

        {/*
        9.1's created-by axis, landed at S25 and closing ledger L-177 and
        L-255. Beside the assignee axis rather than instead of it, which is the
        prototype's own arrangement and its stated reason: Dana records a
        creator and never an assigner, so "who made this" and "who is carrying
        it" are two questions, and Assignments answers only the second.

        No "Unassigned" counterpart, and that is not an omission: 4.5 makes
        `created_by` NOT NULL, so there is no task nobody made.
        */}
        <Axis icon={UserPlus} label={CREATED_BY} value={chosenLabel(filter.creators)}>
          {people.map((person) => (
            <FilterToggle
              key={person.id}
              label={person.name}
              checked={filter.creators.includes(person.id)}
              onToggle={() => {
                toggleIn('creators', person.id)
              }}
            />
          ))}
        </Axis>

        <div className="mx-1 my-1.5 h-px bg-[var(--color-graphite-100)]" aria-hidden="true" />
        <SwitchRow
          icon={Star}
          label={IMPORTANT_ONLY}
          checked={filter.important}
          onChange={(important) => {
            commit({ ...filter, important })
          }}
        />
        <SwitchRow
          icon={Repeat2}
          label={REPEATING_ONLY}
          checked={filter.repeating}
          onChange={(repeating) => {
            commit({ ...filter, repeating })
          }}
        />
        <SwitchRow
          icon={Ban}
          label={ABANDONED_HIDDEN}
          checked={!filter.showAbandoned}
          onChange={(hidden) => {
            commit({ ...filter, showAbandoned: !hidden })
          }}
        />

        <div className="mx-1 my-1.5 h-px bg-[var(--color-graphite-100)]" aria-hidden="true" />
        <Axis icon={Group} label="Group by" value={GROUP_LABEL[filter.groupBy]}>
          {(Object.keys(GROUP_LABEL) as GroupBy[]).map((key) => (
            <FilterChoice
              key={key}
              label={GROUP_LABEL[key]}
              selected={filter.groupBy === key}
              onSelect={() => {
                commit({ ...filter, groupBy: key })
              }}
            />
          ))}
        </Axis>
        <Axis icon={ArrowDownUp} label="Sort by" value={SORT_LABEL[filter.sort]}>
          {(Object.keys(SORT_LABEL) as SortBy[]).map((key) => (
            <FilterChoice
              key={key}
              label={SORT_LABEL[key]}
              selected={filter.sort === key}
              onSelect={() => {
                commit({ ...filter, sort: key })
              }}
            />
          ))}
        </Axis>

        <div className="mx-1 my-1.5 h-px bg-[var(--color-graphite-100)]" aria-hidden="true" />
        {onSaveView === null ? null : saving ? (
          <form
            className="flex items-center gap-1 px-1 pb-1"
            onSubmit={(event) => {
              event.preventDefault()
              const name = viewName.trim()
              if (name === '') return
              onSaveView(name)
              setViewName('')
              setSaving(false)
              setOpen(false)
            }}
          >
            <Input
              autoFocus
              value={viewName}
              maxLength={40}
              onChange={(event) => {
                setViewName(event.target.value)
              }}
              placeholder="Name this view"
              aria-label="Name this view"
              className={cn(
                'h-8 min-w-0 flex-1 rounded-md border border-[var(--color-graphite-200)] bg-card px-2 text-[13px] leading-5 text-[var(--color-graphite-800)] outline-none transition-colors',
                T_FAST,
                'placeholder:text-[var(--color-graphite-400)] focus:border-[var(--color-dana-accent-600)] focus:ring-1 focus:ring-[var(--color-dana-accent-600)]',
              )}
            />
            <button
              type="submit"
              className={cn(
                'h-8 shrink-0 rounded-md bg-[var(--color-graphite-900)] px-2.5 text-[12px] leading-4 font-medium text-white transition-colors hover:bg-[var(--color-graphite-800)]',
                T_FAST,
                FOCUS,
              )}
            >
              Save
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setSaving(true)
            }}
            disabled={!narrowed && !arranged}
            className={cn(
              rowClass(false),
              'disabled:pointer-events-none disabled:text-[var(--color-graphite-300)]',
            )}
          >
            <SectionIcon icon={Bookmark} />
            <span className="min-w-0 flex-1">{SAVE_AS_VIEW}</span>
          </button>
        )}
        {narrowed || arranged ? (
          <button
            type="button"
            onClick={() => {
              onChange({
                ...filter,
                due: 'any',
                from: null,
                to: null,
                assignees: [],
                creators: [],
                important: false,
                repeating: false,
                showAbandoned: true,
                groupBy: 'none',
                sort: 'manual',
              })
            }}
            className={cn(rowClass(false), 'text-[var(--color-graphite-500)]')}
          >
            <SectionIcon icon={X} />
            <span className="min-w-0 flex-1">Clear all</span>
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/**
 * The filter's readout, in the window bar's left end (9.1, DES-153).
 *
 * One chip per axis rather than per value, and never a count alone, which
 * 9.1 says in terms. The markup is the prototype's; the model is
 * `views/filter.ts`'s, which is where each chip's own reset lives.
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
    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          /* **Seam, S25**, and the naming seam again. The prototype names this
             "Remove filter: {label}", and AC-176 addresses the filter control
             itself as `getByRole('button', { name: /filter/i })`, which a chip
             carrying the word "filter" makes ambiguous; 9.1 names the chip
             nowhere, so nothing is given up by saying the same thing without
             that word. */
          aria-label={`Remove ${chip.label}`}
          onClick={() => {
            onChange(chip.cleared)
          }}
          className={cn(
            'group/chip flex h-6 max-w-56 shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-graphite-100)] pr-1.5 pl-2 text-[12px] leading-4 text-[var(--color-graphite-700)] transition-colors',
            T_FAST,
            FOCUS,
            'hover:bg-[var(--color-graphite-200)]',
          )}
        >
          {(() => {
            /* Each axis carries its own glyph, which is the prototype's
               arrangement: a chip is read at a glance and the word after the
               glyph is what narrows it. The map is here rather than in
               `filter.ts` because that module is pure and holds no
               components, the same rule `grouping.ts` keeps. */
            const Glyph = CHIP_ICON[chip.key] ?? CalendarDays
            return (
              <Glyph
                className="size-3 shrink-0 text-[var(--color-graphite-500)]"
                strokeWidth={2}
                aria-hidden="true"
              />
            )
          })()}
          <span className="min-w-0 truncate">{chip.label}</span>
          <X
            className="size-3 shrink-0 text-[var(--color-graphite-400)] transition-colors group-hover/chip:text-[var(--color-graphite-700)]"
            strokeWidth={2.5}
            aria-hidden="true"
          />
        </button>
      ))}
      {chips.length > 1 ? (
        <button
          type="button"
          onClick={() => {
            onChange({
              ...filter,
              due: 'any',
              from: null,
              to: null,
              assignees: [],
              creators: [],
              important: false,
              repeating: false,
              showAbandoned: true,
            })
          }}
          className={cn(
            'flex h-6 shrink-0 items-center rounded-full px-2 text-[12px] leading-4 text-[var(--color-graphite-500)] transition-colors hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-700)]',
            T_FAST,
            FOCUS,
          )}
        >
          Clear all
        </button>
      ) : null}
    </div>
  )
}
