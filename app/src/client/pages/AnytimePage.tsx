/*
9.5's Anytime, at /app/anytime: "an unpinned view of undated open work (Q2's
rows, ungrouped)."

**Ungrouped is the one word this page turns on, and it is the difference from
the page it replaces.** v1's Tasks drew Q2 as an Inbox block over folder-headed
groups, which is how the response arrives and how 6 Q5 still says All must draw
it. 9.5 says this page draws the same rows in one list, and both sentences are
normative about different surfaces: Q5 fixes All's second half, 9.5 fixes this
page. So All keeps the grouping and Anytime does not, and a person who wants
Anytime in folders asks the filter for it, which is DES-156's whole point.

The rows are still Q2's order and are still not re-sorted: the default folder's
rows come first ungrouped and each folder's group follows, so walking the
response in the order it arrived and concatenating is exactly the sequence
section 6 fixed.

**One quick-add, at the list foot, undated into Desk**, which is 9.3's first
entry row and the page's own spine: a task made here has no date, which is what
Anytime is.
*/
import { CalendarX } from '../lib/icons.js'

import { useTasksView } from '../api/queries.js'
import { QuickAdd } from '../components/quick-add.js'
import { groupRows } from '../views/grouping.js'
import { PLACES } from '../views/place-pages.js'
import { TaskBoard } from '../views/TaskBoard.js'
import { PlaceChrome, PlaceHead, usePlace } from '../views/usePlace.js'
import { useRowActions } from '../parts/useRowActions.js'
import { PageSection } from '../components/page/PageSection.js'
import { PageBody } from '../components/page/PageStates.js'
import { TASKS_EMPTY } from './empty-states.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'
import { groupHeadingMedia } from '../views/group-mark.js'

const SPINE = PLACES.anytime

export function AnytimePage(): React.JSX.Element {
  const view = useTasksView()
  const actions = useRowActions()
  const confirm = useConfirm()
  const basis = useRowBasis()

  const rows = [
    ...(view.data?.inbox ?? []),
    ...(view.data?.groups ?? []).flatMap((group) => group.rows),
  ]
  const place = usePlace(SPINE, rows)
  const context = { ...basis }

  const narrowed = place.narrow(rows)
  const columns = groupRows(narrowed, place.groupBy, place.today, place.viewerId)

  return (
    <div className="space-y-7">
      <PlaceChrome place={place} />
      <PlaceHead place={place} />

      <div>
        <PageBody
          query={view}
          isEmpty={rows.length === 0}
          emptyCopy={TASKS_EMPTY}
          emptyIcon={CalendarX}
          truncated={view.data?.truncated ?? false}
        >
          {place.mode === 'board' ? (
            <TaskBoard
              place={place}
              columns={columns}
              context={context}
              actions={actions}
            />
          ) : place.groupBy !== 'none' ? (
            <div className="space-y-6">
              {columns.map((column) => (
                <PageSection
                  key={column.key}
                  name={column.name}
                  heading={column.name}
                  headingMedia={groupHeadingMedia(column.mark, basis.folders)}
                  count={column.rows.length}
                >
                  <TaskRows
                    tasks={column.rows}
                    context={context}
                    actions={actions}
                    onAsk={confirm.ask}
                  />
                </PageSection>
              ))}
            </div>
          ) : (
            <TaskRows
              tasks={narrowed}
              context={context}
              actions={actions}
              onAsk={confirm.ask}
            />
          )}
        </PageBody>
        {/* Outside the page's data states, deliberately: 10.6 renders the
            shell offline and a capture point rendered only once rows arrived
            would be missing exactly when a person reaches for it. */}
        {place.mode === 'board' ? null : (
          <QuickAdd
            folderName="Desk"
            onAdd={(title) => {
              place.capture(title)
            }}
            onOpenFullForm={(title) => {
              place.openFull(undefined, title)
            }}
          />
        )}
      </div>

      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
