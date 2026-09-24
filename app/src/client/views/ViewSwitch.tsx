/*
The view names, and the page's view switcher. Upcoming (List · Calendar) and
Assigned (List · Board) choose their layout in the View menu
(`FilterControl.tsx`), not on screen; Today has one layout.

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
