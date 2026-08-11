/*
9.5's Done page: day-grouped rows per Q6, each with "Mark as not done", and no
add affordance anywhere on this page.

That last clause is a criterion of its own (AC-096) and it is a rule about
absence, which is the kind an implementation breaks by being consistent
elsewhere: the floating add button of 9.1 is on every other page and the
quick-add row is on three of them. The button is suppressed by the layout,
which is where "every page except Done" belongs; this file simply has no
quick-add row.

9.1's region table names Done's regions by the day each one groups, and adds
that where a region's name comes from data rather than from the section, a
test addresses it by the text the page rendered. The format of a date is the
design's and section 9 has never spelled one, so the region's name here is the
date exactly as the row carries it.

**The rows are this file's own rather than the component set's, and that is
the one thing here worth reading twice.** Every other page hands its rows to
`TaskList`, whose control for a completed row is the complete checkbox. 9.5
gives this page a differently named control, "Mark as not done", because it
does something the checkbox cannot: on the G-SERIES successor branch it
confirms first, and the confirm is about a row nobody can see. A checkbox that
sometimes opens a dialog would be that behaviour hidden inside the one control
every other page uses unconditionally. So the row is composed here from the
same library pieces, and the affordance 9.5 names is a named control.

Q6's pagination is 9.5's infinite scroll, and it arrives here rather than in
the page: `useDoneView` is an infinite query, the cursor is handed back byte
for byte (7.10), and `mergeCompletedDays` puts a day split across two pages
back into one region, because two regions cannot carry one name.
*/
import { useEffect, useState } from 'react'

import { mergeCompletedDays, useDoneView, useTask } from '../api/queries.js'
import { useTransitionTask } from '../api/mutations.js'
import { useRowActions } from '../parts/useRowActions.js'
import { Chip, ConfirmDialog, StarButton } from '../components/ui/index.js'
import { PageSection } from '../states/PageSection.js'
import { MorePages, PageBody } from '../states/PageStates.js'
import { DONE_EMPTY } from './empty-states.js'

/**
 * 9.5's confirm before an un-complete that takes the G-SERIES successor
 * branch. Copy is normative; the parenthesis is the part the person cannot
 * see, because 5.1 deletes the successor with any edits already made to it.
 */
const UNCOMPLETE_SERIES_CONFIRM =
  'This removes the next scheduled occurrence (including any edits to it). Continue?'

/** 9.5's own name for the un-complete affordance Q6 lists on every row. */
const MARK_AS_NOT_DONE = 'Mark as not done'

export function DonePage(): React.JSX.Element {
  const view = useDoneView()
  const actions = useRowActions()
  const transition = useTransitionTask()
  const days = mergeCompletedDays(view.data?.pages)

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
  A field saying whether the branch applies would let this stop inferring.
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

  return (
    <div>
      <h1 className="text-title">Done</h1>
      <PageBody query={view} isEmpty={days.length === 0} emptyCopy={DONE_EMPTY}>
        {days.map((day) => (
          <PageSection key={day.date} name={day.date} heading={day.date}>
            <ul role="list">
              {day.rows.map((task) => (
                <li key={task.id} className="task-row">
                  {/* Q6's row adornments: folder name, the due date it had,
                      the star when important, and the un-complete affordance.
                      The star is the library's, so its two names and its
                      pressed state are the same here as on every other page. */}
                  <span className="task-title task-title-completed">{task.title}</span>
                  <span className="meta">{task.folder.name}</span>
                  {task.due_date === null ? null : <Chip>{task.due_date}</Chip>}
                  <StarButton
                    task={task}
                    mode="inward"
                    onToggle={actions.onToggleImportant}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setProbe(task.id)
                    }}
                  >
                    {MARK_AS_NOT_DONE}
                  </button>
                </li>
              ))}
            </ul>
          </PageSection>
        ))}
        {/* Outside every region, because it belongs to the list rather than to
            the day at the bottom of it: the next page usually opens a new day
            and sometimes extends the last one. */}
        <MorePages query={view} />
      </PageBody>

      {confirming === null ? null : (
        <ConfirmDialog
          message={UNCOMPLETE_SERIES_CONFIRM}
          onContinue={() => {
            const id = confirming
            setConfirming(null)
            transition.mutate({ id, event: 'uncomplete' })
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  )
}
