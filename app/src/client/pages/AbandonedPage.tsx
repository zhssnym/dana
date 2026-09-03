/*
9.5's Abandoned, at /app/abandoned: "an unpinned view of the one status with
no other home; faded, struck, chip and 'Restore' per the row's rules; no
capture, because a task made pending would be filtered off the page it was
made on."

**It is a narrowing rather than a query.** Q5's predicate is the two open
statuses, so every abandoned row the viewer can read is already in that
response; this page keeps the ones whose status is abandoned. Nothing on the
wire changes and nothing needed to: section 6 has no Q for a status that
already rides along with one.

**No capture anywhere, and the reason is the spine.** DES-182: "a task made
there arrives pending, and the page holds only what has been given up", which
is AC-096's argument for Done applied to the one other page it fits. `capture:
'none'` in `place-pages.ts` is what makes the floating button absent, and this
page draws no quick-add.

The faded, struck treatment and the "Restore" control are the row's, which is
S11's; this page passes the rows and asks for nothing of its own.
*/
import { Ban } from '../lib/icons.js'

import { useAllView, useMultiMemberFolderIds } from '../api/queries.js'
import { groupRows } from '../views/grouping.js'
import { PLACES } from '../views/place-pages.js'
import { TaskBoard } from '../views/TaskBoard.js'
import { PlaceChrome, PlaceHead, usePlace } from '../views/usePlace.js'
import { useRowActions } from '../parts/useRowActions.js'
import { PageSection } from '../components/page/PageSection.js'
import { PageBody } from '../components/page/PageStates.js'
import { ABANDONED_EMPTY } from './empty-states.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'
import { groupHeadingMedia } from '../views/group-mark.js'

const SPINE = PLACES.abandoned

export function AbandonedPage(): React.JSX.Element {
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
  ].filter((task) => task.status === 'abandoned')

  const place = usePlace(SPINE, rows)
  const context = { ...basis, multiMemberFolderIds }
  const narrowed = place.narrow(rows)
  const columns = groupRows(narrowed, place.groupBy, place.today, place.viewerId)

  return (
    <div className="space-y-7">
      <PlaceChrome place={place} />
      <PlaceHead place={place} />
      <PageBody
        query={view}
        isEmpty={rows.length === 0}
        emptyCopy={ABANDONED_EMPTY}
        emptyIcon={Ban}
        truncated={data?.truncated ?? false}
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
          <TaskRows tasks={narrowed} context={context} actions={actions} onAsk={confirm.ask} />
        )}
      </PageBody>
      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
