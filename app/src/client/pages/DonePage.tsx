/*
9.5's Done page: day-grouped rows per Q6, each with "Mark as not done", and no
add affordance anywhere on this page.

That last clause is a criterion of its own (AC-096) and it is a rule about
absence, which is the kind an implementation breaks by being consistent
elsewhere: the floating add button of 9.1 is on every other page and the
quick-add is on three of them. The button is suppressed by the layout, which is
where "every page except Done" belongs; this file simply has no quick-add.

9.1's region table names Done's regions by the day each one groups, and adds
that where a region's name comes from data rather than from the section, a test
addresses it by the text the page rendered. The format of a date is the
design's and section 9 has never spelled one, so the heading is the designer's
own form for this screen, "Today", "Yesterday", then "August 6, 2026", from
`parts/format-dates.ts`; the region's name is that rendered text, exactly as
the rule says.

**The row is `components/task-row.tsx`, as of the S11 reunion, and the
affordance 9.5 names is that row's completion checkbox.** This page used to
draw its own, on the ground that Q6 gives it a different set of elements; the
difference turned out to be two things, a due badge 9.5's v2 bullet drops and
a completion control that runs the probe below, and both are now passed as
data. 11.15 named the duplicate as a hazard in as many words, "production
carries two task rows, DoneRow in DonePage.tsx duplicates task-row.tsx line
for line", and RFC 0004 makes one task-row implementation total S11's
acceptance. What that buys is not tidiness: every fix the row has taken since
P8R, the star named by its content, the tooltip that is also a title, the box
that shows what was asked for until the answer differs, existed on one of the
two copies and had to be noticed to reach the other.

That control was a named button until 2026-08-13, on the reading that a checkbox
cannot confirm before it acts and that hiding a dialog inside the one control
every other page uses unconditionally is worse than a named button. The reading
is closed from both directions and neither of them is this file. 9.1's names
table gives the string to a task row's completion checkbox in its complete
state, 9.4 lists that checkbox among a row's elements, 9.3 as RFC 0002 rewrites
it has the completion control confirm on exactly the G-SERIES branch, and AC-179
asserts it doing so, so confirming is a property of the transition rather than of
a role. And the designer's own Done screen, measured in the running prototype on
2026-08-13, hands its rows to his `TaskRow` at `status="completed"` and branches
to the confirm from `onToggleComplete`: it renders `checkbox "Mark as not done"`
with `aria-checked` true, no second control beside it, and the box stays checked
while the dialog is open. The checkbox is what the specification and the artifact
were both already carrying; the button was this file's own.

**A completed row opens its form**, which 9.4 gained at the P8R change control
on 2026-08-13: a row opens that task's form on every page that draws one and
whatever the task's status. That is how 9.3's history block and its completion
control are reached, and AC-178 and AC-179 reach them here.

Q6's pagination is 9.5's infinite scroll, and it arrives here rather than in
the page: `useDoneView` is an infinite query, the cursor is handed back byte
for byte (7.10), and `mergeCompletedDays` puts a day split across two pages
back into one region, because two regions cannot carry one name.
*/
import { useEffect, useState } from 'react'
import { CircleCheck } from 'lucide-react'

import { mergeCompletedDays, useDoneView, useTask } from '../api/queries.js'
import { useTransitionTask } from '../api/mutations.js'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js'
import { formatDayHeading } from '../parts/format-dates.js'
import type { RowContext } from '../parts/presenters.js'
import { useRowActions } from '../parts/useRowActions.js'
import type { RowActions } from '../parts/useRowActions.js'
import { MorePages, PageBody } from '../components/page/PageStates.js'
import { PageSection } from '../components/page/PageSection.js'
import { DONE_EMPTY } from './empty-states.js'
import { PLACES } from '../views/place-pages.js'
import { TaskBoard } from '../views/TaskBoard.js'
import { PlaceChrome, PlaceHead, usePlace } from '../views/usePlace.js'
import { ConfirmDialog as RowConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'

const SPINE = PLACES.done

/**
 * 9.5's confirm before an un-complete that takes the G-SERIES successor
 * branch. Copy is normative; the parenthesis is the part the person cannot
 * see, because 5.1 deletes the successor with any edits already made to it.
 */
const UNCOMPLETE_SERIES_CONFIRM =
  'This removes the next scheduled occurrence (including any edits to it). Continue?'

export function DonePage(): React.JSX.Element {
  const view = useDoneView()
  const actions = useRowActions()
  const transition = useTransitionTask()
  const basis = useRowBasis()
  const confirm = useConfirm()
  const fetched = mergeCompletedDays(view.data?.pages)

  /*
  The shared filter of 9.1, on this page as on every other place-page: one
  control with the same meaning everywhere. What it narrows here is the day
  groups, group by group, so a day whose rows are all filtered out drops away
  rather than leaving a heading over nothing.

  Grouping and board are not offered on this page; `place-pages.ts` records
  why, and the reason it recorded, the DoneRow duplication, is gone as of the
  reunion below, so what stands there now is a question for that file rather
  than a fact about this one.
  */
  const place = usePlace(
    SPINE,
    fetched.flatMap((day) => day.rows),
  )
  const days = fetched
    .map((day) => ({ date: day.date, rows: place.narrow(day.rows) }))
    .filter((day) => day.rows.length > 0)

  /*
  Which un-completes confirm, and why the row cannot answer it.

  9.5 puts the confirm on the G-SERIES successor branch alone, and 5.1 defines
  that branch as a pending sibling sharing this row's series_id. Nothing on
  the wire reports it: 7.0's TaskCard carries neither series_id nor the rule,
  so a Done row cannot tell a repeat's completed occurrence from an ordinary
  completed task, and a client that confirmed on every row would warn about a
  next occurrence that does not exist.

  So the row is read before the transition, and the branch is derived from two
  fields of TaskDetail rather than from the sibling itself. 8.5 moves the rule
  onto the successor it generates, and 5.1's own exhausted-series clause says
  the last row of a finished series keeps its rule. A completed row therefore
  has a successor exactly when it carries a series_id and no rule, which is
  the condition below.

  Recorded as a reading and escalated in `src/client/README.md`: the response
  the transition endpoints already answer carries deleted_successor_id, so the
  server knows this before it acts and the client is inferring it beforehand.
  */
  const [probe, setProbe] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const detail = useTask(probe)

  useEffect(() => {
    if (probe === null) return
    const row = detail.data
    if (row === undefined || row.id !== probe) return
    setProbe(null)
    if (row.series_id !== null && row.recurrence_rule === null) {
      setConfirming(probe)
      return
    }
    transition.mutate({ id: probe, event: 'uncomplete' })
    // Deliberately keyed on the probe and its answer alone. The mutation hook
    // is a new object on every render, so listing it would re-run this on
    // every render and fire the transition again; the guard above is what
    // makes it run once, by clearing the probe before it acts.
  }, [probe, detail.data, transition])

  /*
  This page's two departures from the row every other page draws, passed as
  data rather than as a second row (11.15: "production carries two task rows";
  the v2 port reunifies them).

  9.5's v2 Done bullet drops the due badge, "the spent due-date echo under
  headings that already group by completion", which is a context flag; and the
  completion control has to run the probe below rather than the transition
  directly, which is a callback. Everything else about a Done row was already
  what `task-row.tsx` draws for a completed task, and the copy that made the
  duplicate look necessary, "Mark as not done", is the name that row already
  gives its box when the task is complete.
  */
  const context: RowContext = { ...basis, showDue: false }
  const rowActions: RowActions = {
    ...actions,
    onToggleComplete: (task) => {
      setProbe(task.id)
    },
  }

  return (
    <div className="space-y-7">
      <PlaceChrome place={place} />
      <PlaceHead place={place} />
      <PageBody
        query={view}
        isEmpty={days.length === 0}
        emptyCopy={DONE_EMPTY}
        emptyIcon={CircleCheck}
      >
        <div className="space-y-7">
          {place.mode === 'board' ? (
            /* Item 58 (F), ledger L-049: the shared board, a column per
               completion day, every card finished. The days are the list's
               own groups, so the two views draw one arrangement. */
            <TaskBoard
              place={place}
              columns={days.map((day) => ({
                key: day.date,
                name: formatDayHeading(day.date, basis.today),
                mark: null,
                capture: null,
                rows: day.rows,
                done: true,
              }))}
              context={context}
              actions={rowActions}
            />
          ) : (
            days.map((day) => (
              <PageSection
                key={day.date}
                name={formatDayHeading(day.date, basis.today)}
                heading={formatDayHeading(day.date, basis.today)}
                tone="day"
              >
                <TaskRows
                  tasks={day.rows}
                  context={context}
                  actions={rowActions}
                  onAsk={confirm.ask}
                />
              </PageSection>
            ))
          )}
          {/* Outside every region, because it belongs to the list rather than
              to the day at the bottom of it: the next page usually opens a new
              day and sometimes extends the last one. */}
          <MorePages query={view} />
        </div>
      </PageBody>

      <RowConfirmDialog pending={confirm.pending} onClose={confirm.close} />

      {confirming === null ? null : (
        <ConfirmDialog
          message={UNCOMPLETE_SERIES_CONFIRM}
          onContinue={() => {
            const id = confirming
            setConfirming(null)
            transition.mutate({ id, event: 'uncomplete' })
          }}
          onCancel={() => {
            setConfirming(null)
          }}
        />
      )}
    </div>
  )
}
