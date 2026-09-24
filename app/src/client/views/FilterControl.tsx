/*
The one "View" menu a list carries: Layout, Group by, Sort and Show completed,
each offered only where the page can honour it. It narrows nothing. There is no
on-screen switcher: the layout is chosen here too.
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
  onChange,
}: {
  /** The page's layouts; a page with one has no Layout item. */
  readonly layouts?: readonly ViewMode[]
  readonly layout?: ViewMode
  readonly onLayout?: (next: ViewMode) => void
  readonly groups: readonly GroupChoice[]
  /** Whether the page has completed tasks to show. */
  readonly completed: boolean
  readonly filter: PageFilter
  readonly onChange: (next: PageFilter) => void
}): React.JSX.Element {
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
