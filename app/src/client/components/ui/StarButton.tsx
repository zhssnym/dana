/*
The star, whose two behaviours are the whole of AC-099.

**Its name is its own state, and its tooltip is not always its name.** 9.5,
closed at the P8 change control on 2026-08-11: off Important the star is
"Important" when filled and "Mark as important" when not, and that name is
also its tooltip. On Important the tooltip points outward instead, because
Q4 gives the reason with the rule: every row on that page is important by
definition, so a star saying "important" there would tell the reader what the
page they are on already told them. What it says instead is where the task
lives, "Also in Planned, due 2026-07-28" for a dated row and "Also in Tasks,
in Work" for an undated one, which is the same split Q4 sorts the page by.

So the accessible name and the tooltip come apart on exactly one page, and
they must: the name has to keep saying what pressing the control does, since
AC-055's un-star asks for it by name, while the tooltip says the thing Q4
wants said. The two are separate attributes for that reason and not by
accident.

**A button with `aria-pressed`, deliberately not a switch.** 9.4's
important-only filter is the switch on My Day, and a row full of switches
named "Important" would collide with it. That is the shell session's ruling
and it stays.

The date after "due" is rendered as the card carries it. Nothing in the
specification spells a date format, which AC-099's own file says outright, and
this is the one place this file would otherwise invent one; the format is the
design's and arrives with 11.13's screens.
*/
import { IconButton } from './Button.js'
import { STAR_OFF, STAR_ON } from './copy.js'
import type { TaskCard } from '../../../shared/tasks.js'

/**
 * Which way this page's stars point. Decided by the page layer rather than
 * here, because it is a property of the page and not of the row: Q4 gives
 * the outward tooltip to Important alone.
 */
export type StarTooltipMode = 'inward' | 'outward'

export function starTooltip(task: TaskCard, mode: StarTooltipMode): string {
  if (mode === 'inward') return task.important ? STAR_ON : STAR_OFF
  return task.due_date === null
    ? `Also in Tasks, in ${task.folder.name}`
    : `Also in Planned, due ${task.due_date}`
}

export function StarButton({
  task,
  mode,
  onToggle,
}: {
  readonly task: TaskCard
  readonly mode: StarTooltipMode
  readonly onToggle?: (task: TaskCard) => void
}): React.JSX.Element {
  return (
    <IconButton
      label={task.important ? STAR_ON : STAR_OFF}
      title={starTooltip(task, mode)}
      glyph={task.important ? '★' : '☆'}
      pressed={task.important}
      onClick={() => onToggle?.(task)}
    />
  )
}
