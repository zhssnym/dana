/*
One compact Task filter. The state and predicates live in `filter.ts`; this
file only draws them, so Work, Freeform, Board and Calendar can share the same
definition without sharing a page component.
*/
import { Button } from '../components/ui/button.js'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js'
import { LabelDot } from '../components/label-chip.js'
import { Filter, X } from '../lib/icons.js'
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

const SCHEDULE: readonly { readonly value: ScheduleFilter; readonly label: string }[] = [
  { value: 'any', label: 'Any date' },
  { value: 'with', label: 'Has a date' },
  { value: 'without', label: 'No date' },
  { value: 'today', label: 'Today' },
  { value: 'overdue', label: 'Overdue' },
]

function toggle<T extends string>(values: readonly T[], value: T): readonly T[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value]
}

function chosen(count: number, neutral: string): string {
  return count === 0 ? neutral : count === 1 ? '1 selected' : `${String(count)} selected`
}

export function TaskFilterControl({
  filter,
  onChange,
  people,
  labels,
}: {
  readonly filter: TaskFilter
  readonly onChange: (next: TaskFilter) => void
  readonly people: readonly TaskFilterPerson[]
  readonly labels: readonly TaskFilterLabel[]
}): React.JSX.Element {
  const active = taskFilterChips(filter, () => '', () => '').length
  const currentLabel = labels.find((label) => label.id === filter.label)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={taskFilterActive(filter) ? 'bg-accent text-foreground' : 'text-muted-foreground'}
            aria-label="Filter"
          />
        }
      >
        <Filter aria-hidden="true" />
        <span>Filter</span>
        {active > 0 ? <span aria-hidden="true" className="tabular-nums text-muted-foreground">{active}</span> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Tasks</DropdownMenuLabel>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              Status
              <span className="ml-auto text-xs text-muted-foreground">{chosen(filter.statuses.length, 'Any')}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-40">
              {STATUS.map((choice) => (
                <DropdownMenuCheckboxItem
                  key={choice.value}
                  checked={filter.statuses.includes(choice.value)}
                  onCheckedChange={() => onChange({ ...filter, statuses: toggle(filter.statuses, choice.value) })}
                >
                  {choice.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              Date
              <span className="ml-auto text-xs text-muted-foreground">
                {SCHEDULE.find((choice) => choice.value === filter.schedule)?.label}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-40">
              <DropdownMenuRadioGroup
                value={filter.schedule}
                onValueChange={(value) => {
                  const schedule = SCHEDULE.find((choice) => choice.value === value)?.value
                  if (schedule !== undefined) onChange({ ...filter, schedule })
                }}
              >
                {SCHEDULE.map((choice) => (
                  <DropdownMenuRadioItem key={choice.value} value={choice.value} closeOnClick>
                    {choice.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              Assigned to
              <span className="ml-auto text-xs text-muted-foreground">{chosen(filter.assignees.length, 'Anyone')}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 min-w-48 overflow-y-auto">
              {people.map((person) => (
                <DropdownMenuCheckboxItem
                  key={person.id}
                  checked={filter.assignees.includes(person.id)}
                  onCheckedChange={() => onChange({ ...filter, assignees: toggle(filter.assignees, person.id) })}
                >
                  <span className="truncate">{person.name}</span>
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuCheckboxItem
                checked={filter.assignees.includes(UNASSIGNED)}
                onCheckedChange={() => onChange({ ...filter, assignees: toggle(filter.assignees, UNASSIGNED) })}
              >
                Unassigned
              </DropdownMenuCheckboxItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {labels.length > 0 || filter.label !== null ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                Label
                <span className="ml-auto max-w-24 truncate text-xs text-muted-foreground">
                  {filter.label === null ? 'Any' : (currentLabel?.name ?? 'One label')}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 min-w-44 overflow-y-auto">
                <DropdownMenuRadioGroup
                  value={filter.label ?? ''}
                  onValueChange={(value) => onChange({ ...filter, label: typeof value === 'string' && value !== '' ? value : null })}
                >
                  <DropdownMenuRadioItem value="" closeOnClick>Any label</DropdownMenuRadioItem>
                  {labels.map((label) => (
                    <DropdownMenuRadioItem key={label.id} value={label.id} closeOnClick>
                      <LabelDot color={label.color} />
                      <span className="truncate">{label.name}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={filter.important}
          onCheckedChange={(important) => onChange({ ...filter, important })}
        >
          Important
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={filter.repeating}
          onCheckedChange={(repeating) => onChange({ ...filter, repeating })}
        >
          Repeating
        </DropdownMenuCheckboxItem>
        {taskFilterActive(filter) ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onChange(NO_TASK_FILTER)}>
              <X aria-hidden="true" />
              Clear all
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TaskFilterChips({
  filter,
  onChange,
  people,
  labels,
}: {
  readonly filter: TaskFilter
  readonly onChange: (next: TaskFilter) => void
  readonly people: readonly TaskFilterPerson[]
  readonly labels: readonly TaskFilterLabel[]
}): React.JSX.Element | null {
  const personName = (id: string): string =>
    id === UNASSIGNED ? 'Unassigned' : (people.find((person) => person.id === id)?.name ?? 'Someone')
  const labelName = (id: string): string => labels.find((label) => label.id === id)?.name ?? 'One label'
  const chips = taskFilterChips(filter, personName, labelName)
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
      {chips.map((chip) => (
        <Button
          key={chip.key}
          variant="outline"
          size="sm"
          className="max-w-56 rounded-full font-normal"
          aria-label={`Remove ${chip.label} filter`}
          title={chip.label}
          onClick={() => onChange(chip.cleared)}
        >
          <span className="truncate">{chip.label}</span>
          <X aria-hidden="true" />
        </Button>
      ))}
      {chips.length > 1 ? (
        <Button variant="ghost" size="sm" className="font-normal text-muted-foreground" onClick={() => onChange(NO_TASK_FILTER)}>
          Clear all
        </Button>
      ) : null}
    </div>
  )
}
