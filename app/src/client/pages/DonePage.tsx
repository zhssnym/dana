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

Q6 is keyset-paginated and 9.5 renders it as infinite scroll. This renders the
first page. The cursor arm is provisional and recorded in
`src/client/README.md`; the shape it needs is `useInfiniteQuery` over
`next_cursor`, handed back byte for byte as 7.10 requires.
*/
import { useEffect, useState } from 'react'

import { useDoneView, useMe, useTask } from '../api/queries.js'
import { useTransitionTask } from '../api/mutations.js'
import { ConfirmDialog } from '../components/ui/index.js'
import { PageSection } from '../states/PageSection.js'
import { PageBody } from '../states/PageStates.js'
import { DONE_EMPTY } from './empty-states.js'

/**
 * 9.5's confirm before an un-complete that takes the G-SERIES successor
 * branch. Copy is normative; the parenthesis is the part the person cannot
 * see, because 5.1 deletes the successor with any edits already made to it.
 */
const UNCOMPLETE_SERIES_CONFIRM =
  'This removes the next scheduled occurrence (including any edits to it). Continue?'

export function DonePage(): React.JSX.Element {
  const view = useDoneView()
  const me = useMe()
  const transition = useTransitionTask()
  void me

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
      <h1>Done</h1>
      <PageBody
        query={view}
        isEmpty={(view.data?.days.length ?? 0) === 0}
        emptyCopy={DONE_EMPTY}
      >
        {(view.data?.days ?? []).map((day) => (
          <PageSection key={day.date} name={day.date} heading={day.date}>
            <ul>
              {day.rows.map((task) => (
                <li key={task.id}>
                  <span>{task.title}</span>
                  <span>{task.folder.name}</span>
                  {task.due_date === null ? null : <span>{task.due_date}</span>}
                  <button
                    type="button"
                    onClick={() => {
                      setProbe(task.id)
                    }}
                  >
                    Mark as not done
                  </button>
                </li>
              ))}
            </ul>
          </PageSection>
        ))}
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
