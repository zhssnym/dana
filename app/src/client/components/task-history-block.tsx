/*
9.3's history read.

The section's card paragraph ends: "the footer renders the task's own events
from 4.13, created, completed, and the rest, actor and viewer-local time,
'Deleted user' fallback unchanged." `WindowActivity` puts the same facts
behind a popover, which is right for a window bar, where the bar is chrome;
9.3 asks for a block on the card, and AC-178 reads the creator's name and the
date off the surface with nothing pressed.

**It is drawn inside the footer band**, since 9.3 says "the footer renders
the task's creation and its completion"; `CardFooter` carries the rest of the
reasoning.

**Read-only means no control at all**, which AC-178 is explicit about and
which is the whole of why this is paragraphs rather than a list of actions:
"what would go wrong is a client rendering the two names as links to a person,
or the completion line as the completion control, which is a different control
this package also adds." So there is nothing here to press.

**The events are 7.12's and the names are `lib/history.ts`'s.** That module
resolves an actor against the rosters this client can read and answers
"Deleted user" where none of them carries the id, which is 4.1's own note and
is unresolvable by construction, 8.10 removing the memberships and 7.3
excluding the account. So the fallback this criterion asserts is the seam
module's rather than this component's, and it is asserted through a real
deletion rather than a fixture.

**The instant is the one formatter's.** `lib/dates.ts` writes the day
("Today", "Yesterday", "24 Sep", "24 Sep 2025" in another year, so an old
creation still carries its year) and the wall clock follows the viewer's own
12/24-hour setting, to the minute.
*/

import { formatClockTime, formatDay, type TimeFormat } from '../lib/dates.js'
import { lineFor, useHistory } from '../lib/history.js'
import { useTimeFormat } from '../lib/time-format.js'
import { isoDay } from '../tasks/task-model.js'

/** One instant as this block writes it: the day, then the viewer's clock. */
function when(at: number, clock: TimeFormat, now = Date.now()): string {
  const date = new Date(at)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${formatDay(isoDay(date), isoDay(new Date(now)))} at ${formatClockTime(`${hh}:${mm}`, clock)}`
}

export function TaskHistoryBlock({
  taskId,
}: {
  /** Absent on a card with no task behind it yet, which draws nothing. */
  readonly taskId?: string
}): React.JSX.Element | null {
  const events = useHistory('task', taskId ?? '')
  const clock = useTimeFormat()
  /*
  polish: taskcard F4. This block drew every event, one line each, and a
  task with twenty step edits ended in a wall of "Edited added a step by …"
  lines with the same list again behind the footer's Activity control. What
  9.3 asks the card itself to render is the task's provenance, "created,
  completed, and the rest, actor and viewer-local time": the creation and,
  where there is one, the latest completion, two lines at most. The whole
  history stays one press away in the footer's popover, in the grammar
  `lib/history.ts`'s `storyFor` gives it.
  */
  const created = events.find((event) => event.verb === 'created')
  const completed = events.find((event) => event.verb === 'completed')
  const shown = [created, completed].filter(
    (event): event is NonNullable<typeof event> => event !== undefined,
  )
  if (shown.length === 0) return null

  return (
    /* Inside the footer band, so the padding is
       the footer's own `px-3` rather than the content column's `px-2`; see
       `CardFooter`. The bottom is the footer row's `py-2`, so there is none
       here. */
    <div className="flex flex-col gap-0.5 px-1">
      {shown.map((event) => (
        <p
          key={event.id}
          className="text-xs text-muted-foreground"
        >
          {`${lineFor(event)} by ${event.actor} · ${when(event.at, clock)}`}
        </p>
      ))}
    </div>
  )
}
