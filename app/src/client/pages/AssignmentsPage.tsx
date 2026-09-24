/*
Assigned, at /app/assignments: every open task the viewer can read, grouped by
person with "You" first and "Unassigned" last. Not a query of its own (section
6's preamble): a client-side grouping over Q5. The "New task" row assigns to
the viewer, which 7.6 does by default. "From" on a row names the creator,
since Dana records no assigner. "Show completed" brings abandoned rows back in
place and adds a "Done" group of finished work.
*/
import { UserRoundCheck } from '../lib/icons.js'

import { useAllView, useMultiMemberFolderIds } from '../api/queries.js'
import { NEW_TASK_ROW_PHONE, QuickAdd } from '../components/quick-add.js'
import { groupRows } from '../views/grouping.js'
import { PLACES } from '../views/place-pages.js'
import { TaskBoard } from '../views/TaskBoard.js'
import { DoneGroup } from '../views/DoneGroup.js'
import { PlaceGroup, PlaceHead, usePlace } from '../views/usePlace.js'
import { useRowActions } from '../parts/useRowActions.js'
import { PageBody } from '../components/page/PageStates.js'
import { ASSIGNMENTS_EMPTY } from './empty-states.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'
import { useRowKeys } from '../components/row-keys.js'

const SPINE = PLACES.assignments

export function AssignmentsPage(): React.JSX.Element {
  const view = useAllView()
  const actions = useRowActions()
  const confirm = useConfirm()
  const basis = useRowBasis()
  /* One Tab stop for the page's rows; arrows, Enter and Space (`row-keys.ts`). */
  const keys = useRowKeys<HTMLDivElement>()
  const multiMemberFolderIds = useMultiMemberFolderIds()

  const data = view.data
  const rows = [
    ...(data?.planned ?? []),
    ...(data?.tasks_inbox ?? []),
    ...(data?.tasks_groups ?? []).flatMap((group) => group.rows),
  ]
  const place = usePlace(SPINE, rows)
  /* The creator is worth naming only once somebody else can be one. */
  const context = { ...basis, multiMemberFolderIds, showCreator: multiMemberFolderIds.size > 0 }

  const axis = place.groupBy === 'none' ? 'person' : place.groupBy
  const groups = groupRows(place.narrow(rows), axis, place.today, place.viewerId)

  return (
    <div ref={keys} className="space-y-6">
      <PlaceHead place={place} bare={rows.length === 0 && !place.filter.showCompleted} />
      {place.mode === 'board' ? (
        <PageBody
          query={view}
          isEmpty={rows.length === 0}
          emptyCopy={ASSIGNMENTS_EMPTY}
          emptyIcon={UserRoundCheck}
          truncated={data?.truncated ?? false}
        >
          <TaskBoard place={place} columns={groups} context={context} actions={actions} />
        </PageBody>
      ) : (
        /* Rows bleed their padding into the gutter: a checkbox, a heading
           and the title share one left edge. */
        <div className="-mx-1.5">
          <PageBody
            query={view}
            isEmpty={rows.length === 0}
            emptyCopy={ASSIGNMENTS_EMPTY}
            emptyIcon={UserRoundCheck}
            truncated={data?.truncated ?? false}
          >
            <div className="space-y-6">
              {groups.map((group) => (
                <PlaceGroup key={group.key} name={group.name} heading={group.name}>
                  <TaskRows
                    tasks={group.rows}
                    context={context}
                    actions={actions}
                    onAsk={confirm.ask}
                  />
                </PlaceGroup>
              ))}
            </div>
          </PageBody>
          <QuickAdd
            className={NEW_TASK_ROW_PHONE}
            onAdd={(title) => {
              place.capture(title)
            }}
          />
          {place.filter.showCompleted ? (
            <div className="mt-6">
              <DoneGroup place={place} context={context} actions={actions} onAsk={confirm.ask} />
            </div>
          ) : null}
        </div>
      )}
      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
