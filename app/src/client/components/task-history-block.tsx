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

**Where it sits moved at the round of 2026-08-30 and what it renders did
not.** It stood between the Comments disclosure and the footer, which reads
as a history section filed under the conversation; 9.3 says "the footer
renders the task's creation and its completion", so it is drawn inside the
footer band now and `CardFooter` carries the rest of the reasoning.

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
    /* Inside the footer band since the round of 2026-08-30, so the padding is
       the footer's own `px-3` rather than the content column's `px-2`; see
       `CardFooter`. The bottom is the footer row's `py-2`, so there is none
       here. */
    <div className="flex flex-col gap-0.5 px-3 pt-2">
      {shown.map((event) => (
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
