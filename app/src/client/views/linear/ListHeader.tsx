/*
The issue table's header row (m3 list, after GitHub's): select-all, the state
switch To do · Done · All with counts, then Section, Assignee, Label and
Sort menus (the density switch sits in Sort's menu) and New task. With rows selected the same row
becomes the bulk bar in place: "n selected", Mark as, Label, Assignee,
Section, Delete.

The Label menu is the page's one Label filter (the page head does not offer it
in Linear), so choosing one here narrows Board too.
*/
import { CheckMark } from '../../components/ui/checkbox.js'
import { Button } from '../../components/ui/button.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu.js'
import { cn } from '../../components/ui/utils.js'
import { ArrowDownUp, Check, ChevronDown, Minus, X } from '../../lib/icons.js'
import { StateMark } from './IssueParts.js'
import { SORT_WORD } from './list.js'
import type { AssigneeFilter, Density, ListFilters, ListSort, ListState, MilestoneFilter, RowState } from './list.js'

export type HeaderMenu = 'milestone' | 'assignee' | 'label' | null

const TRIGGER =
  'inline-flex h-7 max-w-40 shrink-0 items-center gap-1 rounded-sm px-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground data-[set]:text-foreground'

const STATES: { value: ListState; word: string }[] = [
  { value: 'open', word: 'To do' },
  { value: 'closed', word: 'Done' },
  { value: 'all', word: 'All' },
]

export interface Choice {
  readonly id: string
  readonly name: string
}

export interface LabelChoiceRow extends Choice {
  readonly color: string
  /** How many of the selected issues wear it. */
  readonly worn: number
}

/** The select box: ticked, empty or mixed (a dash), drawn as every Dana box is. */
export function SelectBox(props: {
  readonly checked: boolean | 'mixed'
  readonly label: string
  readonly onToggle: (event: React.MouseEvent) => void
  readonly className?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={(event) => {
        event.stopPropagation()
        props.onToggle(event)
      }}
      className={cn('relative flex size-6 shrink-0 items-center justify-center rounded-sm', props.className)}
    >
      <CheckMark checked={props.checked === true} className={props.checked === 'mixed' ? 'border-primary bg-primary' : undefined} />
      {props.checked === 'mixed' && (
        <Minus aria-hidden className="absolute size-3 text-primary-foreground" strokeWidth={3} />
      )}
    </button>
  )
}

function Menu(props: {
  readonly name: string
  readonly value: string | null
  readonly open: boolean
  readonly onOpen: (open: boolean) => void
  readonly children: React.ReactNode
  readonly align?: 'start' | 'end'
}): React.JSX.Element {
  return (
    <DropdownMenu open={props.open} onOpenChange={props.onOpen}>
      <DropdownMenuTrigger className={TRIGGER} data-set={props.value === null ? undefined : ''} aria-label={props.name}>
        <span className="min-w-0 truncate">{props.value ?? props.name}</span>
        <ChevronDown aria-hidden className="size-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={props.align ?? 'end'} className="w-auto min-w-52">
        {props.children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A bulk action's menu: the same quiet trigger, opened by its own key or a click. */
function BulkMenu(props: {
  readonly name: string
  readonly open?: boolean
  readonly onOpen?: (open: boolean) => void
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <DropdownMenu {...(props.open === undefined ? {} : { open: props.open, onOpenChange: props.onOpen })}>
      <DropdownMenuTrigger className={TRIGGER}>
        {props.name}
        <ChevronDown aria-hidden className="size-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-52">
        {props.children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ListHeader(props: {
  readonly state: ListState
  readonly counts: Record<ListState, number>
  readonly onState: (state: ListState) => void
  readonly filters: ListFilters
  readonly onFilters: (filters: ListFilters) => void
  readonly sort: ListSort
  readonly onSort: (sort: ListSort) => void
  readonly density: Density
  readonly onDensity: (density: Density) => void
  readonly milestones: readonly Choice[]
  readonly people: readonly Choice[]
  readonly viewerId: string | null
  readonly labels: readonly LabelChoiceRow[]
  /* The page's Label filter: its chosen label, and how to change it. */
  readonly labelFilter: string | null
  readonly onLabelFilter: (labelId: string | null) => void
  readonly shown: number
  readonly selected: number
  readonly onSelectAll: () => void
  readonly onClear: () => void
  readonly onMark: (state: RowState) => void
  readonly onLabel: (label: LabelChoiceRow) => void
  readonly onAssign: (personId: string | null) => void
  readonly onMilestone: (sectionId: string | null) => void
  readonly onDelete: () => void
  readonly onNew: () => void
  readonly menu: HeaderMenu
  readonly onMenu: (menu: HeaderMenu) => void
}): React.JSX.Element {
  const { filters, selected, milestones, people } = props
  const menuProps = (name: Exclude<HeaderMenu, null>) => ({
    open: props.menu === name,
    onOpen: (open: boolean) => props.onMenu(open ? name : null),
  })
  const all = props.shown > 0 && selected >= props.shown
  const box = (
    <SelectBox
      checked={all ? true : selected > 0 ? 'mixed' : false}
      label={selected > 0 ? 'Clear the selection' : 'Select every task shown'}
      onToggle={() => (selected > 0 ? props.onClear() : props.onSelectAll())}
    />
  )

  if (selected > 0) {
    return (
      <div role="toolbar" aria-label="Selected issues" className="flex min-h-10 flex-wrap items-center gap-x-1 gap-y-1 bg-muted/40 px-2 py-1">
        {box}
        <span className="mr-2 text-sm font-section text-foreground tabular-nums">{selected} selected</span>
        <BulkMenu name="Mark as">
          {MARKS.map(({ state, word }) => (
            <DropdownMenuItem key={state} onClick={() => props.onMark(state)}>
              <StateMark state={state} />
              {word}
            </DropdownMenuItem>
          ))}
        </BulkMenu>
        <BulkMenu name="Label" {...menuProps('label')}>
          {props.labels.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No labels on this page yet</p>
          ) : (
            props.labels.map((label) => (
              <DropdownMenuItem
                key={label.id}
                closeOnClick={false}
                onClick={() => props.onLabel(label)}
                aria-checked={label.worn === 0 ? false : label.worn >= selected ? true : 'mixed'}
                role="menuitemcheckbox"
              >
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
                <span className="min-w-0 flex-1 truncate">{label.name}</span>
                <span aria-hidden className="flex size-4 items-center justify-center">
                  {label.worn >= selected ? <Check className="size-4" /> : label.worn > 0 ? <Minus className="size-4" /> : null}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </BulkMenu>
        <BulkMenu name="Assignee" {...menuProps('assignee')}>
          <DropdownMenuItem onClick={() => props.onAssign(null)}>Unassigned</DropdownMenuItem>
          {people.length > 0 && <DropdownMenuSeparator />}
          {people.map((p) => (
            <DropdownMenuItem key={p.id} onClick={() => props.onAssign(p.id)}>
              <span className="min-w-0 truncate">{p.id === props.viewerId ? `${p.name} (me)` : p.name}</span>
            </DropdownMenuItem>
          ))}
        </BulkMenu>
        <BulkMenu name="Section" {...menuProps('milestone')}>
          <DropdownMenuItem onClick={() => props.onMilestone(null)}>No section</DropdownMenuItem>
          {milestones.length > 0 && <DropdownMenuSeparator />}
          {milestones.map((m) => (
            <DropdownMenuItem key={m.id} onClick={() => props.onMilestone(m.id)}>
              <span className="min-w-0 truncate">{m.name}</span>
            </DropdownMenuItem>
          ))}
        </BulkMenu>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={props.onDelete}>
            Delete
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Clear the selection" className="text-muted-foreground" onClick={props.onClear}>
            <X aria-hidden />
          </Button>
        </div>
      </div>
    )
  }

  const milestoneWord = (m: MilestoneFilter): string | null =>
    m.kind === 'any' ? null : m.kind === 'none' ? 'No section' : (milestones.find((s) => s.id === m.id)?.name ?? null)
  const assigneeWord = (a: AssigneeFilter): string | null =>
    a.kind === 'any' ? null : a.kind === 'none' ? 'Unassigned' : a.id === props.viewerId ? 'Me' : (people.find((p) => p.id === a.id)?.name ?? null)
  const labelWord =
    props.labelFilter === null ? null : (props.labels.find((l) => l.id === props.labelFilter)?.name ?? 'One label')
  const milestoneValue = filters.milestone.kind === 'section' ? filters.milestone.id : filters.milestone.kind
  const assigneeValue = filters.assignee.kind === 'person' ? filters.assignee.id : filters.assignee.kind

  return (
    <div role="toolbar" aria-label="Tasks" className="flex min-h-10 flex-wrap items-center gap-x-1 gap-y-1 bg-muted/40 px-2 py-1">
      {box}
      <div className="mr-auto flex items-center gap-0.5">
        {STATES.map(({ value, word }) => {
          const on = props.state === value
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => props.onState(value)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-sm px-1.5 text-sm transition-colors hover:text-foreground',
                on ? 'font-section text-foreground' : 'text-muted-foreground',
              )}
            >
              {word}
              <span className="rounded-full bg-muted px-1.5 text-xs leading-5 tabular-nums text-muted-foreground">
                {props.counts[value]}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-0.5 max-sm:w-full">
        <Menu name="Section" value={milestoneWord(filters.milestone)} {...menuProps('milestone')}>
          <DropdownMenuRadioGroup
            value={milestoneValue}
            onValueChange={(value: string) =>
              props.onFilters({
                ...filters,
                milestone: value === 'any' || value === 'none' ? { kind: value } : { kind: 'section', id: value },
              })
            }
          >
            <DropdownMenuRadioItem closeOnClick value="any">Any section</DropdownMenuRadioItem>
            <DropdownMenuRadioItem closeOnClick value="none">No section</DropdownMenuRadioItem>
            {milestones.length > 0 && <DropdownMenuSeparator />}
            {milestones.map((m) => (
              <DropdownMenuRadioItem closeOnClick key={m.id} value={m.id}>
                <span className="min-w-0 truncate">{m.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </Menu>
        <Menu name="Assignee" value={assigneeWord(filters.assignee)} {...menuProps('assignee')}>
          <DropdownMenuRadioGroup
            value={assigneeValue}
            onValueChange={(value: string) =>
              props.onFilters({
                ...filters,
                assignee: value === 'any' || value === 'none' ? { kind: value } : { kind: 'person', id: value },
              })
            }
          >
            <DropdownMenuRadioItem closeOnClick value="any">Anyone</DropdownMenuRadioItem>
            <DropdownMenuRadioItem closeOnClick value="none">Unassigned</DropdownMenuRadioItem>
            {people.length > 0 && <DropdownMenuSeparator />}
            {people.map((p) => (
              <DropdownMenuRadioItem closeOnClick key={p.id} value={p.id}>
                <span className="min-w-0 truncate">{p.id === props.viewerId ? `${p.name} (me)` : p.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </Menu>
        {(props.labels.length > 0 || props.labelFilter !== null) && (
        <Menu name="Label" value={labelWord} {...menuProps('label')}>
          <DropdownMenuRadioGroup
            value={props.labelFilter ?? ''}
            onValueChange={(value: string) => props.onLabelFilter(value === '' ? null : value)}
          >
            <DropdownMenuRadioItem closeOnClick value="">Any label</DropdownMenuRadioItem>
            {props.labels.length > 0 && <DropdownMenuSeparator />}
            {props.labels.map((l) => (
              <DropdownMenuRadioItem closeOnClick key={l.id} value={l.id}>
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
                <span className="min-w-0 truncate">{l.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </Menu>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger className={TRIGGER} aria-label={`Sort: ${SORT_WORD[props.sort]}`}>
            <ArrowDownUp aria-hidden className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate @max-3xl/list:sr-only">{SORT_WORD[props.sort]}</span>
            <ChevronDown aria-hidden className="size-3.5 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-52">
            <DropdownMenuRadioGroup value={props.sort} onValueChange={(value: ListSort) => props.onSort(value)}>
              {(Object.keys(SORT_WORD) as ListSort[]).map((sort) => (
                <DropdownMenuRadioItem closeOnClick key={sort} value={sort}>
                  {SORT_WORD[sort]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {/* Density lives with the order, so the header stays one line. */}
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={props.density} onValueChange={(value: Density) => props.onDensity(value)}>
              <DropdownMenuRadioItem closeOnClick value="compact">Compact</DropdownMenuRadioItem>
              <DropdownMenuRadioItem closeOnClick value="comfortable">Comfortable</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" className="ml-1 max-sm:ml-auto" onClick={props.onNew}>
          New task
        </Button>
      </div>
    </div>
  )
}

const MARKS: { state: RowState; word: string }[] = [
  { state: 'open', word: 'Not started' },
  { state: 'in-progress', word: 'In progress' },
  { state: 'completed', word: 'Done' },
  { state: 'not-planned', word: 'Abandoned' },
]
