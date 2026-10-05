/*
 * Assigned: every open task the viewer can read, grouped by person, "You" first and "Unassigned" last. "From"
 * names the creator, since Dana records no assigner.
 */
import { UserRoundCheck } from '../lib/icons.js'

import { useFocusView, useMultiMemberFolderIds } from '../api/queries.js'
import { groupRows } from '../views/grouping.js'
import { PLACES } from '../views/place-pages.js'
import { PlaceGroup, PlaceHead, usePlace } from '../views/usePlace.js'
import { useRowActions } from '../parts/useRowActions.js'
import { useNoStoredLabel } from '../shell/focus-lists.js'
import { PageBody } from '../components/page/PageStates.js'
import { ASSIGNMENTS_EMPTY } from './empty-states.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'
import { useRowKeys } from '../components/row-keys.js'

const SPINE = PLACES.assignments
const ASK = { when: 'any', group: 'none' } as const

export function AssignmentsPage(): React.JSX.Element {
  const view = useFocusView(ASK)
  const actions = useRowActions()
  const confirm = useConfirm()
  const basis = useRowBasis()
  /* One Tab stop for the page's rows (`row-keys.ts`). */
  const keys = useRowKeys<HTMLDivElement>()
  const multiMemberFolderIds = useMultiMemberFolderIds()

  const data = view.data
  const rows = (data?.groups ?? []).flatMap((group) => group.rows)
  const place = usePlace(SPINE, rows)
  useNoStoredLabel(place)
  /* The creator is worth naming only once somebody else can be one. */
  const context = { ...basis, multiMemberFolderIds, showCreator: multiMemberFolderIds.size > 0 }

  const groups = groupRows(rows, 'person', place.today, place.viewerId)

  return (
    <div ref={keys} className="space-y-6">
      <PlaceHead place={place} controls={null} />
      {/* Rows bleed their padding into the gutter so checkbox, heading and title share one left edge. */}
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
      </div>
      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
