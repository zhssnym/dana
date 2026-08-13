/*
9.3's read-only history block, added to that section at the RFC 0002 change
control on 2026-08-13 from the designer's prototype and asserted by AC-178.

The section's own sentence: "The history block renders the task's creation and,
when it has one, its completion: who and when, from the created_by, created_at,
completed_by and completed_at of frozen 7.2's TaskDetail... It is read-only and
offers no action. An author or completer whose account has been deleted renders
'Deleted user', which is 4.1's own note and 8.10's, and this is the first
surface in Dana that reads either column."

Three things decide how this file is written.

**"Read-only and offers no action" is discharged by holding no control at all.**
Not a disabled one, not a link to the person: AC-178 reads every button, link
and checkbox inside the block and requires none, and the two ways a port loses
this are rendering either name as a link and rendering the completion line as
the completion control, which is a different control that AC-179 asserts.

**The two people are bare ids and the contract offers no way to expand them.**
Frozen 7.0 spells the assignee's person shape out and leaves `created_by` and
`completed_by` plain, so the name comes from what this client can already read:
the viewer (7.1), the task's own folder members (7.4) and the roster (7.3). An
id none of the three carries renders "Deleted user", which is exactly right for
the case the section names, because 8.10 step 4 removes the deleted account's
memberships and 7.3 excludes it from the roster, so a scrubbed author is
unresolvable by construction rather than by a flag this client had to be told.
The residual is recorded rather than hidden: a person who left the folder *and*
removed the connection is also unresolvable, and would read as deleted. Widening
7.2 to carry the two person shapes would close it and section 7 is frozen, so
the alternative is not this session's to take.

**The instant is rendered through `parts/presenters.ts` and nothing else.** 9.1
says "the format of a date is the design's and this section has never spelled
one", and `formatDueDate` is the design's format as R4 derived it from his
screens. It is called with an empty `today`, which is that function's own way of
saying "not this year": a creation is history and may be years old, and a block
that dropped the year would render two Augusts twelve months apart identically.
AC-178 asserts the day and the year for that reason. The wall clock beside it is
24-hour to minute precision, the corpus convention and 4.11's precision, and is
formatted with a fixed locale for the reason the presenters' month table gives:
this machine's own tooling answers in French, and section 9's copy is English.
*/
import { History } from 'lucide-react'

import { formatDueDate, personDisplay } from '../../parts/presenters.js'
import { CREATED, COMPLETED, TASK_HISTORY } from './copy.js'

/** Every person this client can name, keyed by 4.1's id. */
export type PeopleIndex = ReadonlyMap<string, string | null>

/**
 * One 7.0 instant as this block writes it: the design's date, then the wall
 * clock, in the viewer's own zone.
 *
 * The zone is the browser's, which is the zone `api/tz.ts` reports on every
 * view request, so a creation stamp reads against the same day boundary every
 * other date on the page was computed against.
 */
export function historyMoment(instant: string): string {
  const at = new Date(instant)
  if (Number.isNaN(at.getTime())) return instant
  // en-CA formats a civil date as 4.11's YYYY-MM-DD, which is the shape
  // `formatDueDate` takes; en-GB formats a time as 24-hour HH:MM. Both are
  // fixed rather than the viewer's, so neither can answer in this machine's
  // French or in a 12-hour clock.
  const civil = at.toLocaleDateString('en-CA')
  const clock = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${formatDueDate(civil, '')} at ${clock}`
}

/** 4.1's rendering of an id no readable surface carries a name for. */
function nameOf(id: string | null, people: PeopleIndex): string {
  if (id === null) return personDisplay({ display_name: null }).name
  return personDisplay({ display_name: people.get(id) ?? null }).name
}

export function TaskHistory({
  createdAt,
  createdBy,
  completedAt,
  completedBy,
  people,
}: {
  readonly createdAt: string
  readonly createdBy: string
  readonly completedAt: string | null
  readonly completedBy: string | null
  readonly people: PeopleIndex
}): React.JSX.Element {
  return (
    <div
      className="shrink-0 border-t border-border bg-[var(--color-graphite-25)] px-6 py-3"
      aria-label={TASK_HISTORY}
    >
      <div className="flex items-start gap-2 text-xs leading-5 text-[var(--color-graphite-600)]">
        <History
          className="mt-0.5 size-4 shrink-0 text-[var(--color-graphite-400)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <div>
          <p>
            <span className="font-medium text-[var(--color-graphite-700)]">{CREATED}</span>{' '}
            {historyMoment(createdAt)} by {nameOf(createdBy, people)}
          </p>
          {completedAt === null ? null : (
            <p>
              <span className="font-medium text-[var(--color-graphite-700)]">
                {COMPLETED}
              </span>{' '}
              {historyMoment(completedAt)} by {nameOf(completedBy, people)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
