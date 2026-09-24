/*
The one view switcher (round 5): the app's `Segmented` control, always visible,
one click, arrow keys move between views. A page shows it for Linear · Board ·
Freeform; Upcoming for List · Calendar; Assigned for List · Board. Today has
one layout and no switcher.

One name per view, here and nowhere else. "List" is a place page's plain list
and "Freeform" is a page's writing canvas: two different things, two names.
*/
import { Segmented } from '../components/ui/segmented.js'
import type { FolderView, ViewMode } from './view-mode.js'

export type ViewName = ViewMode | FolderView

export const VIEW_LABELS: Record<ViewName, string> = {
  list: 'List',
  linear: 'Linear',
  board: 'Board',
  calendar: 'Calendar',
  freeform: 'Freeform',
}

export function ViewSwitch<T extends ViewName>({
  choices,
  value,
  onChange,
}: {
  readonly choices: readonly T[]
  readonly value: T
  readonly onChange: (next: T) => void
}): React.JSX.Element {
  return (
    <Segmented
      label="View"
      value={value}
      options={choices.map((choice) => ({ value: choice, label: VIEW_LABELS[choice] }))}
      onValueChange={onChange}
    />
  )
}
