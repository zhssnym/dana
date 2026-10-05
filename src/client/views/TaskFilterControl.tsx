/* One compact Task filter. State and predicates live in `filter.ts`; one picker is open at a time. */
import { useState } from 'react'

import { Button } from '../components/ui/button.js'
import { Calendar } from '../components/ui/calendar.js'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '../components/ui/popover.js'
import { cn } from '../components/ui/utils.js'
import { LabelChip } from '../components/label-chip.js'
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
import { WorkViewControl, useCurrentWorkView } from './work-view.js'
import type { TaskStatus } from '../../shared/tasks.js'

export interface TaskFilterPerson {
  readonly id: string
  readonly name: string
}

export interface TaskFilterLabel {
  readonly id: string
  readonly name: string
  readonly color: string
  readonly archived?: boolean
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
    <div className="flex min-h-7 items-center gap-1 px-1">
      {onBack === undefined ? null : (
        <Button type="button" variant="ghost" size="icon-xs" className="sm:hidden" aria-label="Back to filters" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
        </Button>
      )}
      {onBack === undefined
        ? <PopoverTitle className="min-w-0 flex-1 truncate px-1 text-xs font-normal text-muted-foreground">{title}</PopoverTitle>
        : <span className="min-w-0 flex-1 truncate px-1 text-xs text-muted-foreground">{title}</span>}
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
  active,
}: {
  readonly icon: LucideIcon
  readonly label: string
  readonly value: string
  readonly onClick: () => void
  readonly active: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-expanded={active}
      className={cn('flex min-h-7 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-foreground outline-none transition-colors duration-[var(--duration-fast)] hover:bg-accent focus-visible:bg-accent', active && 'bg-accent')}
      onClick={onClick}
      onPointerEnter={(event) => {
        /* A stacked phone panel would move the row before the pointer's click lands. */
        if (event.pointerType !== 'touch' && globalThis.matchMedia('(min-width: 640px)').matches) onClick()
      }}
      onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) onClick() }}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="ml-auto max-w-24 truncate text-xs text-muted-foreground">{value}</span>
      <ChevronRight className="size-4 shrink-0 text-quiet-foreground" strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}

function ToggleRow({
  icon: Icon,
  label,
  pressed,
  onClick,
  onHover,
}: {
  readonly icon: LucideIcon
  readonly label: string
  readonly pressed: boolean
  readonly onClick: () => void
  readonly onHover: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className="flex min-h-7 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-foreground outline-none transition-colors duration-[var(--duration-fast)] hover:bg-accent focus-visible:bg-accent"
      onClick={onClick}
      onPointerEnter={(event) => { if (event.pointerType !== 'touch') onHover() }}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Check className={pressed ? 'ml-auto size-4 opacity-100' : 'ml-auto size-4 opacity-0'} strokeWidth={2.5} aria-hidden="true" />
    </button>
  )
}

function ChoiceRow({
  label,
  active,
  onClick,
  before,
  content,
}: {
  readonly label: string
  readonly active: boolean
  readonly onClick: () => void
  readonly before?: React.ReactNode
  readonly content?: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className="flex min-h-7 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-foreground outline-none transition-colors duration-[var(--duration-fast)] hover:bg-accent focus-visible:bg-accent"
      onClick={onClick}
    >
      {before === undefined ? null : (
        <span className="flex size-4 shrink-0 items-center justify-center">{before}</span>
      )}
      {content === undefined
        ? <span className="min-w-0 flex-1 truncate">{label}</span>
        : <span className="flex min-w-0 flex-1">{content}</span>}
      <Check className={active ? 'ml-auto size-4 opacity-100' : 'ml-auto size-4 opacity-0'} strokeWidth={2.5} aria-hidden="true" />
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
  const [workView, setWorkView] = useCurrentWorkView()
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
    <div className="flex items-center gap-0.5">
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
        <PopoverContent align="end" className="relative w-[18rem] max-sm:max-h-[var(--available-height)] max-sm:overflow-y-auto p-1">
          <FilterHeader
            title="Filter tasks"
            {...(taskFilterActive(filter) ? { onClear: () => onChange(NO_TASK_FILTER) } : {})}
          />
          <div role="group" aria-label="Task filters">
            <FilterRow icon={ListChecks} label="Status" value={statusValue} active={panel === 'status'} onClick={() => setPanel('status')} />
            <FilterRow icon={CalendarDays} label="Date" value={dayLabel(filter, today)} active={panel === 'date'} onClick={() => setPanel('date')} />
            <FilterRow icon={UserRound} label="Assigned" value={assigneeValue} active={panel === 'assignee'} onClick={() => setPanel('assignee')} />
            {labels.length > 0 || filter.label !== null ? (
              <FilterRow icon={Tag} label="Label" value={currentLabel} active={panel === 'label'} onClick={() => setPanel('label')} />
            ) : null}
            <div aria-hidden="true" className="-mx-1 my-1 h-px bg-border" />
            <ToggleRow icon={Star} label="Important" pressed={filter.important} onHover={() => setPanel('root')} onClick={() => onChange({ ...filter, important: !filter.important })} />
            <ToggleRow icon={Repeat2} label="Repeating" pressed={filter.repeating} onHover={() => setPanel('root')} onClick={() => onChange({ ...filter, repeating: !filter.repeating })} />
          </div>
          {panel === 'root' ? null : <div className="w-[18rem] rounded-lg border border-border bg-popover p-1 max-sm:mt-1 sm:absolute sm:right-full sm:top-0 sm:max-h-[var(--available-height)] sm:overflow-y-auto">

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
              <div role="group" aria-label="Date range">
                <ChoiceRow label="Any date" active={filter.schedule === 'any'} onClick={() => changeSchedule('any')} />
                <ChoiceRow label="Has date" active={filter.schedule === 'with'} onClick={() => changeSchedule('with')} />
                <ChoiceRow label="No date" active={filter.schedule === 'without'} onClick={() => changeSchedule('without')} />
                <ChoiceRow label="Overdue" active={filter.schedule === 'overdue'} onClick={() => changeSchedule('overdue')} />
              </div>
              <div aria-hidden="true" className="-mx-1 my-1 h-px bg-border" />
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
                <ChoiceRow
                  label="Any label"
                  active={filter.label === null}
                  onClick={() => onChange({ ...filter, label: null })}
                />
                {labels.filter((label) => !label.archived).map((label) => (
                  <ChoiceRow
                    key={label.id}
                    label={label.name}
                    content={<LabelChip label={label} className="max-w-[12rem]" />}
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
          </div>}
        </PopoverContent>
      </Popover>
      <WorkViewControl view={workView} onChange={setWorkView} />
    </div>
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
      {chips.map((chip) => {
        const activeLabel = chip.key === 'label' && filter.label !== null
          ? labels.find((label) => label.id === filter.label)
          : undefined
        return <Button
          key={chip.key}
          variant="ghost"
          size="xs"
          className={cn(
            'max-w-56 font-normal text-muted-foreground hover:text-foreground',
            activeLabel === undefined ? 'rounded-sm bg-accent' : 'h-6 rounded-full px-0.5 pr-1',
          )}
          aria-label={`Remove ${chip.label} filter`}
          title={chip.label}
          onClick={() => onChange(chip.cleared)}
        >
          {activeLabel === undefined
            ? <span className="truncate">{chip.label}</span>
            : <LabelChip label={activeLabel} className="max-w-[10rem]" />}
          <X aria-hidden="true" />
        </Button>
      })}
      {chips.length > 1 ? (
        <Button variant="ghost" size="xs" className="font-normal text-muted-foreground" onClick={() => onChange(NO_TASK_FILTER)}>
          Clear all
        </Button>
      ) : null}
    </div>
  )
}
