/*
The one "View" menu a list carries: Layout, Group by, Sort and Show completed,
each offered only where the page can honour it. It narrows nothing.
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
import type { PageFilter, SortBy } from './filter.js'
import type { GroupChoice } from './place-pages.js'
import type { ViewMode } from './view-mode.js'

const LAYOUTS: Record<ViewMode, string> = {
  list: 'List',
  linear: 'Linear',
  board: 'Board',
  calendar: 'Calendar',
}

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
  views,
  groups,
  completed,
  filter,
  onChange,
  mode,
  onModeChange,
}: {
  readonly views: readonly ViewMode[]
  readonly groups: readonly GroupChoice[]
  /** Whether the page has completed tasks to show. */
  readonly completed: boolean
  readonly filter: PageFilter
  readonly onChange: (next: PageFilter) => void
  readonly mode: ViewMode
  readonly onModeChange: (next: ViewMode) => void
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="text-sm text-muted-foreground" />}
      >
        View
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {views.length > 1 ? (
          <Choice
            label="Layout"
            value={mode}
            choices={views.map((view) => ({ value: view, label: LAYOUTS[view] }))}
            onChange={onModeChange}
          />
        ) : null}
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
          choices={SORTS}
          onChange={(sort) => {
            onChange({ ...filter, sort })
          }}
        />
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
