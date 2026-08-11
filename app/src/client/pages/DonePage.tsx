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
import { useDoneView, useMe } from '../api/queries.js'
import { useTransitionTask } from '../api/mutations.js'
import { PageSection } from '../states/PageSection.js'
import { PageBody } from '../states/PageStates.js'
import { DONE_EMPTY } from './empty-states.js'

export function DonePage(): React.JSX.Element {
  const view = useDoneView()
  const me = useMe()
  const transition = useTransitionTask()
  void me

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
                      // The G-SERIES confirm of 9.5 belongs to the Complex
                      // Interaction engineer's confirmation surface; recorded
                      // as owed in src/client/README.md.
                      transition.mutate({ id: task.id, event: 'uncomplete' })
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
    </div>
  )
}
