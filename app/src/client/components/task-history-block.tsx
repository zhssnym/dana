/*
9.3's history read, which the prototype has and hides.

The section's card paragraph ends: "the footer renders the task's own events
from 4.13, created, completed, and the rest, actor and viewer-local time,
'Deleted user' fallback unchanged." The prototype's footer carries
`WindowActivity`, which is the same facts behind a popover: a line reading
"Created 5 Aug" that opens onto who did what. That is right for a window bar,
where the control is one of several and the bar is chrome; 9.3 asks for a
block on the card, and AC-178 reads the creator's name and the date off the
surface with nothing pressed.

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

**The instant carries its year, and that is a decision rather than a
default.** `formatDueDate` is the design's format and takes today as its
second argument so that a date in this year drops the year; a creation is
history and may be years old, so it is called with an empty today, which is
that function's own way of saying "not this year". AC-178 reads the day and
the year for exactly that reason. The wall clock beside it is 24-hour to
minute precision, the corpus convention and 4.11's, formatted with a fixed
locale because this machine's own tooling answers in French and section 9's
copy is English.
*/

import { formatDueDate } from '../parts/presenters.js'
import { lineFor, useHistory } from '../lib/history.js'

/** One instant as this block writes it: the design's date, then the clock. */
function when(at: number): string {
  const date = new Date(at)
  const civil = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const clock = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
  return `${formatDueDate(civil, '')} at ${clock}`
}

export function TaskHistoryBlock({
  taskId,
}: {
  /** Absent on a card with no task behind it yet, which draws nothing. */
  readonly taskId?: string
}): React.JSX.Element | null {
  const events = useHistory('task', taskId ?? '')
  if (events.length === 0) return null

  return (
    <div className="flex flex-col gap-0.5 px-2 pt-1.5">
      {events.map((event) => (
        <p
          key={event.id}
          className="text-[12px] leading-4 text-[var(--color-graphite-500)]"
        >
          {`${lineFor(event)} by ${event.actor} · ${when(event.at)}`}
        </p>
      ))}
    </div>
  )
}
