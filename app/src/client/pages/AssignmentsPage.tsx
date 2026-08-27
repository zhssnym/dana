/*
9.5's Assignments, at /app/assignments: "who is carrying what — every open
task the viewer can read, grouped by person, the viewer's own group first,
'Unassigned' last."

**It is not a query, and section 6 says so in terms.** Its preamble, as RFC
0005 appends it: "Assignments is not a query of its own: it is a client-side
composition over the open tasks the viewer can already read, grouped by
assignee with the unassigned last, which is why it appears in section 9 and
not here." So the read is Q5, whose predicate is exactly "every open task the
viewer can read", and the grouping is this page's.

**Grouped by person even when nobody asked**, because that is its spine rather
than a grouping the filter set: DES-153's table gives Assignments "the
assignee" as its axis and "grouped by person, viewer first" as its default.
Asking the filter for another axis replaces it, which is DES-156's rule
applied to a page whose arrangement happens to be a grouping already.

**The floating button is here** because 9.1 lists this page among the three
with no capture affordance of their own, and what it captures is 9.3's row:
assigned to the viewer. Nothing in the body writes the assignee, and it does
not need to: 7.6 defaults `assignee_id` to the caller, and Desk is
single-member so the forcing lands on them either way.

**"From" names the creator and Dana records no assigner**, which 9.5 states
and which this page does not draw yet. The field it needed exists now:
`created_by` rides TaskCard from RFC 0005 unit 12a and carries the person
stub a label needs, so the half is buildable without a request per row.
Drawing it is the parity audit's Assignments row rather than this comment's.
*/
import { UserRoundCheck } from '../lib/icons.js'

import { useAllView, useMultiMemberFolderIds } from '../api/queries.js'
import { groupRows } from '../views/grouping.js'
import { PLACES } from '../views/place-pages.js'
import { TaskBoard } from '../views/TaskBoard.js'
import { PlaceChrome, PlaceHead, usePlace } from '../views/usePlace.js'
import { useRowActions } from '../parts/useRowActions.js'
import { PageSection } from '../states/PageSection.js'
import { PageBody } from '../states/PageStates.js'
import { ASSIGNMENTS_EMPTY } from './empty-states.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'
import { groupHeadingMedia } from '../views/group-mark.js'

const SPINE = PLACES.assignments

export function AssignmentsPage(): React.JSX.Element {
  const view = useAllView()
  const actions = useRowActions()
  const confirm = useConfirm()
  const basis = useRowBasis()
  const multiMemberFolderIds = useMultiMemberFolderIds()

  const data = view.data
  const rows = [
    ...(data?.planned ?? []),
    ...(data?.tasks_inbox ?? []),
    ...(data?.tasks_groups ?? []).flatMap((group) => group.rows),
  ]
  const place = usePlace(SPINE, rows)
  const context = { ...basis, multiMemberFolderIds }

  const axis = place.filter.groupBy === 'none' ? 'person' : place.filter.groupBy
  const groups = groupRows(place.narrow(rows), axis, place.today, place.viewerId)

  return (
    <div className="space-y-7">
      <PlaceChrome place={place} />
      <PlaceHead place={place} />
      <PageBody
        query={view}
        isEmpty={rows.length === 0}
        emptyCopy={ASSIGNMENTS_EMPTY}
        emptyIcon={UserRoundCheck}
        truncated={data?.truncated ?? false}
      >
        {place.mode === 'board' ? (
          <TaskBoard
            place={place}
            columns={groups}
            context={context}
            actions={actions}
          />
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <PageSection
                key={group.key}
                name={group.name}
                heading={group.name}
                headingMedia={groupHeadingMedia(group.mark, basis.folders)}
                count={group.rows.length}
              >
                <TaskRows
                  tasks={group.rows}
                  context={context}
                  actions={actions}
                  onAsk={confirm.ask}
                />
              </PageSection>
            ))}
          </div>
        )}
      </PageBody>
      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
