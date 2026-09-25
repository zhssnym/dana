/*
The one "View" menu a list carries: Layout, Group by, Sort, Label and Show
completed, each offered only where the page can honour it. Label is the one
narrowing (#208), offered only when the rows wear some, and while it holds the
page shows it beside this menu with a way back. There is no on-screen
switcher: the layout is chosen here too.
*/
import { Button } from '../components/ui/button.js'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js'
import { LabelDot } from '../components/label-chip.js'
import { X } from '../lib/icons.js'
import type { PageFilter, SortBy } from './filter.js'
import type { GroupChoice } from './place-pages.js'
import type { ViewMode } from './view-mode.js'
import { VIEW_LABELS } from './ViewSwitch.js'

const SORTS: readonly { readonly value: SortBy; readonly label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'due', label: 'Due date' },
  { value: 'title', label: 'Title' },
  { value: 'created', label: 'Created' },
]

function Choice<T extends string>({
  label,
  value,
  choices,
  onChange,
}: {
  readonly label: string
  readonly value: T
  readonly choices: readonly { readonly value: T; readonly label: string }[]
  readonly onChange: (next: T) => void
}): React.JSX.Element {
  const current = choices.find((choice) => choice.value === value) ?? choices[0]
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="text-sm">
        {label}
        <span className="ml-auto text-muted-foreground">{current?.label}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-36">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next: unknown) => {
            const picked = choices.find((choice) => choice.value === next)
            if (picked !== undefined) onChange(picked.value)
          }}
        >
          {choices.map((choice) => (
            <DropdownMenuRadioItem key={choice.value} value={choice.value} className="text-sm" closeOnClick>
              {choice.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

export function ViewMenu({
  layouts = [],
  layout,
  onLayout,
  groups,
  completed,
  filter,
  labels = [],
  onChange,
  ownOrder,
  layoutOnly = false,
}: {
  /** The page's layouts; a page with one has no Layout item. */
  readonly layouts?: readonly ViewMode[]
  readonly layout?: ViewMode
  readonly onLayout?: (next: ViewMode) => void
  readonly groups: readonly GroupChoice[]
  /** Whether the page has completed tasks to show. */
  readonly completed: boolean
  readonly filter: PageFilter
  /** The Labels the page's rows wear; none, no Label item. */
  readonly labels?: readonly LabelOption[]
  readonly onChange: (next: PageFilter) => void
  /** What "Manual" is called where rows have no hand order to keep. */
  readonly ownOrder?: string
  /** A layout that honours nothing else (the calendar): Layout alone. */
  readonly layoutOnly?: boolean
}): React.JSX.Element {
  const sorts =
    ownOrder === undefined
      ? SORTS
      : SORTS.map((sort) => (sort.value === 'manual' ? { ...sort, label: ownOrder } : sort))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="text-sm text-muted-foreground" />}
      >
        View
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {layouts.length > 1 && layout !== undefined && onLayout !== undefined ? (
          <Choice
            label="Layout"
            value={layout}
            choices={layouts.map((value) => ({ value, label: VIEW_LABELS[value] }))}
            onChange={onLayout}
          />
        ) : null}
        {layoutOnly ? null : (
          <>
        {groups.length > 1 ? (
          <Choice
            label="Group by"
            value={filter.groupBy}
            choices={groups}
            onChange={(groupBy) => {
              onChange({ ...filter, groupBy })
            }}
          />
        ) : null}
        <Choice
          label="Sort"
          value={filter.sort}
          choices={sorts}
          onChange={(sort) => {
            onChange({ ...filter, sort })
          }}
        />
        <LabelChoice filter={filter} labels={labels} onChange={onChange} />
        {completed ? (
          <DropdownMenuCheckboxItem
            className="text-sm"
            checked={filter.showCompleted}
            onCheckedChange={(checked) => {
              onChange({ ...filter, showCompleted: checked })
            }}
          >
            Show completed
          </DropdownMenuCheckboxItem>
        ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export interface LabelOption {
  readonly id: string
  readonly name: string
  readonly color: string
}

/** "Label": All, or one of the Labels the rows wear. */
export function LabelChoice({
  filter,
  labels,
  onChange,
}: {
  readonly filter: PageFilter
  readonly labels: readonly LabelOption[]
  readonly onChange: (next: PageFilter) => void
}): React.JSX.Element | null {
  if (labels.length === 0 && filter.label === null) return null
  const current = labels.find((label) => label.id === filter.label)
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="text-sm">
        Label
        <span className="ml-auto max-w-24 truncate text-muted-foreground">
          {filter.label === null ? 'All' : (current?.name ?? 'Other')}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-80 min-w-40 overflow-y-auto">
        <DropdownMenuRadioGroup
          value={filter.label ?? ''}
          onValueChange={(next: unknown) => {
            onChange({ ...filter, label: typeof next === 'string' && next !== '' ? next : null })
          }}
        >
          <DropdownMenuRadioItem value="" className="text-sm" closeOnClick>
            All
          </DropdownMenuRadioItem>
          {labels.map((label) => (
            <DropdownMenuRadioItem key={label.id} value={label.id} className="text-sm" closeOnClick>
              <LabelDot color={label.color} />
              <span className="truncate">{label.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

/**
 * The narrowing said on screen: the Label's name, and pressing it shows every
 * task again. Absent when nothing narrows.
 */
export function LabelFilterClear({
  filter,
  labels,
  onChange,
}: {
  readonly filter: PageFilter
  readonly labels: readonly LabelOption[]
  readonly onChange: (next: PageFilter) => void
}): React.JSX.Element | null {
  if (filter.label === null) return null
  const current = labels.find((label) => label.id === filter.label)
  return (
    <Button
      variant="ghost"
      className="max-w-48 text-sm text-foreground"
      aria-label={`Show all labels, not only ${current?.name ?? 'this label'}`}
      title={current?.name}
      onClick={() => {
        onChange({ ...filter, label: null })
      }}
    >
      {current === undefined ? null : <LabelDot color={current.color} />}
      {/* On a phone the dot says which, so the page's name keeps its line. */}
      <span className={current === undefined ? 'truncate' : 'truncate max-md:hidden'}>
        {current?.name ?? 'One label'}
      </span>
      <X className="size-3.5 text-muted-foreground" aria-hidden="true" />
    </Button>
  )
}
