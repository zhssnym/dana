/*
One compact Task filter. The state and predicates live in `filter.ts`; this
file draws one focused picker at a time so Work never turns into a settings
tree. Freeform, Board and Calendar can reuse the same definition later.
*/
import { useState } from 'react'

import { Button } from '../components/ui/button.js'
import { Calendar } from '../components/ui/calendar.js'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '../components/ui/popover.js'
import { LabelDot } from '../components/label-chip.js'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Filter,
  ListChecks,
  Repeat2,
  Star,
  Tag,
  UserRound,
  X,
} from '../lib/icons.js'
import type { LucideIcon } from '../lib/icons.js'
import { formatDay } from '../lib/dates.js'
import { isoDay, parseIsoDate } from '../tasks/task-model.js'
import {
  NO_TASK_FILTER,
  taskFilterActive,
  taskFilterChips,
  UNASSIGNED,
} from './filter.js'
import type { ScheduleFilter, TaskFilter } from './filter.js'
import type { TaskStatus } from '../../shared/tasks.js'

export interface TaskFilterPerson {
  readonly id: string
  readonly name: string
}

export interface TaskFilterLabel {
  readonly id: string
  readonly name: string
  readonly color: string
}

const STATUS: readonly { readonly value: TaskStatus; readonly label: string }[] = [
  { value: 'pending', label: 'Open' },
  { value: 'completed', label: 'Completed' },
  { value: 'abandoned', label: 'Dropped' },
]

type Panel = 'root' | 'status' | 'date' | 'assignee' | 'label'

function toggle<T extends string>(values: readonly T[], value: T): readonly T[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value]
}

function selected(count: number, neutral: string): string {
  return count === 0 ? neutral : count === 1 ? '1 selected' : `${String(count)} selected`
}

function FilterHeader({
  title,
  onBack,
  onClear,
}: {
  readonly title: string
  readonly onBack?: () => void
  readonly onClear?: () => void
}): React.JSX.Element {
  return (
    <div className="flex h-8 items-center gap-1 px-1.5">
      {onBack === undefined ? null : (
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Back to filters" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
        </Button>
      )}
      <PopoverTitle className="min-w-0 flex-1 truncate text-sm font-medium">{title}</PopoverTitle>
      {onClear === undefined ? null : (
        <Button type="button" variant="ghost" size="xs" className="font-normal text-muted-foreground" onClick={onClear}>
          Clear
        </Button>
      )}
    </div>
  )
}

function FilterRow({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  readonly icon: LucideIcon
  readonly label: string
  readonly value: string
  readonly onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm text-foreground transition-colors duration-[var(--duration-fast)] hover:bg-accent"
      onClick={onClick}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="max-w-28 truncate text-xs text-muted-foreground">{value}</span>
      <ChevronRight className="size-3.5 shrink-0 text-quiet-foreground" strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}

function ToggleRow({
  icon: Icon,
  label,
  pressed,
  onClick,
}: {
  readonly icon: LucideIcon
  readonly label: string
  readonly pressed: boolean
  readonly onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className="flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm text-foreground transition-colors duration-[var(--duration-fast)] hover:bg-accent"
      onClick={onClick}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      <span className="flex-1">{label}</span>
      <Check className={pressed ? 'size-3.5 opacity-100' : 'size-3.5 opacity-0'} strokeWidth={2.5} aria-hidden="true" />
    </button>
  )
}

function ChoiceRow({
  label,
  active,
  onClick,
  before,
}: {
  readonly label: string
  readonly active: boolean
  readonly onClick: () => void
  readonly before?: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-foreground transition-colors duration-[var(--duration-fast)] hover:bg-accent"
      onClick={onClick}
    >
      {before}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Check className={active ? 'size-3.5 opacity-100' : 'size-3.5 opacity-0'} strokeWidth={2.5} aria-hidden="true" />
    </button>
  )
}

function dayLabel(filter: TaskFilter, today: string): string {
  if (filter.schedule === 'any') return 'Any'
  if (filter.schedule === 'with') return 'Has date'
  if (filter.schedule === 'without') return 'No date'
  if (filter.schedule === 'overdue') return 'Overdue'
  if (filter.schedule === 'today') return 'Today'
  if (filter.date === null) return 'Any'
  return formatDay(filter.date, today)
}

export function TaskFilterControl({
  filter,
  onChange,
  people,
  labels,
  today,
}: {
  readonly filter: TaskFilter
  readonly onChange: (next: TaskFilter) => void
  readonly people: readonly TaskFilterPerson[]
  readonly labels: readonly TaskFilterLabel[]
  readonly today: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<Panel>('root')
  const personName = (id: string): string =>
    id === UNASSIGNED ? 'Unassigned' : (people.find((person) => person.id === id)?.name ?? 'Someone')
  const labelName = (id: string): string => labels.find((label) => label.id === id)?.name ?? 'One label'
  const currentLabel = filter.label === null ? 'Any' : labelName(filter.label)
  const statusValue = filter.statuses.length === 1
    ? (STATUS.find((choice) => choice.value === filter.statuses[0])?.label ?? '1 selected')
    : selected(filter.statuses.length, 'Any')
  const assigneeValue = filter.assignees.length === 1
    ? personName(filter.assignees[0] ?? UNASSIGNED)
    : selected(filter.assignees.length, 'Anyone')
  const changeSchedule = (schedule: ScheduleFilter, date: string | null = null): void => {
    onChange({ ...filter, schedule, date })
    setPanel('root')
  }
  const back = (): void => setPanel('root')

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setPanel('root')
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className={taskFilterActive(filter) ? 'bg-accent text-foreground' : 'text-muted-foreground'}
            aria-label="Filter tasks"
            title="Filter tasks"
          />
        }
      >
        <Filter aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[18rem] p-1.5">
        {panel === 'root' ? (
          <>
            <FilterHeader
              title="Filter tasks"
              {...(taskFilterActive(filter) ? { onClear: () => onChange(NO_TASK_FILTER) } : {})}
            />
            <div role="group" aria-label="Task filters">
              <FilterRow icon={ListChecks} label="Status" value={statusValue} onClick={() => setPanel('status')} />
              <FilterRow icon={CalendarDays} label="Date" value={dayLabel(filter, today)} onClick={() => setPanel('date')} />
              <FilterRow icon={UserRound} label="Assigned" value={assigneeValue} onClick={() => setPanel('assignee')} />
              {labels.length > 0 || filter.label !== null ? (
                <FilterRow icon={Tag} label="Label" value={currentLabel} onClick={() => setPanel('label')} />
              ) : null}
              <div aria-hidden="true" className="my-1 h-px bg-border" />
              <ToggleRow icon={Star} label="Important" pressed={filter.important} onClick={() => onChange({ ...filter, important: !filter.important })} />
              <ToggleRow icon={Repeat2} label="Repeating" pressed={filter.repeating} onClick={() => onChange({ ...filter, repeating: !filter.repeating })} />
            </div>
          </>
        ) : null}

        {panel === 'status' ? (
          <>
            <FilterHeader title="Status" onBack={back} />
            <div role="group" aria-label="Status">
              <ChoiceRow label="Any status" active={filter.statuses.length === 0} onClick={() => onChange({ ...filter, statuses: [] })} />
              {STATUS.map((choice) => (
                <ChoiceRow
                  key={choice.value}
                  label={choice.label}
                  active={filter.statuses.includes(choice.value)}
                  onClick={() => onChange({ ...filter, statuses: toggle(filter.statuses, choice.value) })}
                />
              ))}
            </div>
          </>
        ) : null}

        {panel === 'date' ? (
          <>
            <FilterHeader title="Date" onBack={back} />
            <div role="group" aria-label="Date range" className="grid grid-cols-2 gap-0.5">
              <ChoiceRow label="Any date" active={filter.schedule === 'any'} onClick={() => changeSchedule('any')} />
              <ChoiceRow label="Has date" active={filter.schedule === 'with'} onClick={() => changeSchedule('with')} />
              <ChoiceRow label="No date" active={filter.schedule === 'without'} onClick={() => changeSchedule('without')} />
              <ChoiceRow label="Overdue" active={filter.schedule === 'overdue'} onClick={() => changeSchedule('overdue')} />
            </div>
            <div aria-hidden="true" className="my-1 h-px bg-border" />
            <Calendar
              className="mx-auto"
              selected={filter.schedule === 'date' && filter.date !== null ? parseIsoDate(filter.date) : null}
              today={parseIsoDate(today)}
              onSelect={(date) => changeSchedule('date', isoDay(date))}
            />
          </>
        ) : null}

        {panel === 'assignee' ? (
          <>
            <FilterHeader title="Assigned" onBack={back} />
            <div role="group" aria-label="Assigned" className="max-h-72 overflow-y-auto">
              <ChoiceRow label="Anyone" active={filter.assignees.length === 0} onClick={() => onChange({ ...filter, assignees: [] })} />
              {people.map((person) => (
                <ChoiceRow
                  key={person.id}
                  label={person.name}
                  active={filter.assignees.includes(person.id)}
                  onClick={() => onChange({ ...filter, assignees: toggle(filter.assignees, person.id) })}
                />
              ))}
              <ChoiceRow
                label="Unassigned"
                active={filter.assignees.includes(UNASSIGNED)}
                onClick={() => onChange({ ...filter, assignees: toggle(filter.assignees, UNASSIGNED) })}
              />
            </div>
          </>
        ) : null}

        {panel === 'label' ? (
          <>
            <FilterHeader title="Label" onBack={back} />
            <div role="group" aria-label="Label" className="max-h-72 overflow-y-auto">
              <ChoiceRow label="Any label" active={filter.label === null} onClick={() => onChange({ ...filter, label: null })} />
              {labels.map((label) => (
                <ChoiceRow
                  key={label.id}
                  label={label.name}
                  before={<LabelDot color={label.color} />}
                  active={filter.label === label.id}
                  onClick={() => {
                    onChange({ ...filter, label: label.id })
                    setPanel('root')
                  }}
                />
              ))}
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export function TaskFilterChips({
  filter,
  onChange,
  people,
  labels,
  today,
}: {
  readonly filter: TaskFilter
  readonly onChange: (next: TaskFilter) => void
  readonly people: readonly TaskFilterPerson[]
  readonly labels: readonly TaskFilterLabel[]
  readonly today: string
}): React.JSX.Element | null {
  const personName = (id: string): string =>
    id === UNASSIGNED ? 'Unassigned' : (people.find((person) => person.id === id)?.name ?? 'Someone')
  const labelName = (id: string): string => labels.find((label) => label.id === id)?.name ?? 'One label'
  const chips = taskFilterChips(filter, personName, labelName, today)
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1" aria-label="Active filters">
      {chips.map((chip) => (
        <Button
          key={chip.key}
          variant="ghost"
          size="xs"
          className="max-w-56 rounded-sm bg-accent font-normal text-muted-foreground hover:text-foreground"
          aria-label={`Remove ${chip.label} filter`}
          title={chip.label}
          onClick={() => onChange(chip.cleared)}
        >
          <span className="truncate">{chip.label}</span>
          <X aria-hidden="true" />
        </Button>
      ))}
      {chips.length > 1 ? (
        <Button variant="ghost" size="xs" className="font-normal text-muted-foreground" onClick={() => onChange(NO_TASK_FILTER)}>
          Clear all
        </Button>
      ) : null}
    </div>
  )
}
