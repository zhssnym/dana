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

**The name is carried by content, not by `aria-label`, and that is a
measurement rather than a preference.** Added by the Complex Interaction
session at P8, changing how the name is attached and not what the name is:
this control still announces "Important" or "Mark as important" and is still
found by `getByRole('button', { name })`, which is how AC-055 and AC-099 ask
for it. What changed is that an `aria-label` is a *label* to the acceptance
suite's `formField` helper, which addresses 9.3's ten form fields by
accessible name across roles because those fields are ten different roles.
9.3's own "inline toggle for important" is one of them, so a page carrying any
starred row and an open task form had two elements answering to "Important",
and AC-093 asserts that toggle on five pages the seed puts a starred row on.
Naming by content leaves the accessible name identical and takes this button
out of that collision; the glyph stays `aria-hidden`, so a glyph swap is still
never a rename.
*/
import { Star } from 'lucide-react'

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
  const name = task.important ? STAR_ON : STAR_OFF
  return (
    <button
      type="button"
      className={
        task.important ? 'icon-control icon-control-active' : 'icon-control'
      }
      aria-pressed={task.important}
      title={starTooltip(task, mode)}
      onClick={() => onToggle?.(task)}
    >
      {/*
      The design's own star, at the foundation's stroke. It replaces the ★ and
      ☆ characters this control drew until P8D: a text glyph has no stroke
      width, its shape and weight coming from whichever font the platform
      resolves for that codepoint, so it could not be made to match the rest of
      the interface by any amount of CSS. The filled state is `fill:
      currentcolor` from `icon-control-active`, which is the design's cue and
      not a second glyph, so nothing here depends on two characters existing.

      Still `aria-hidden`, so this swap changed no accessible name: the control
      announces "Important" or "Mark as important" from the span below exactly
      as it did before.
      */}
      <Star aria-hidden="true" />
      {/* The accessible name, as content. `sr-only` keeps the control icon-only
          to the eye while the name is still the button's own text. */}
      <span className="sr-only">{name}</span>
    </button>
  )
}
