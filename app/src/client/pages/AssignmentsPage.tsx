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
and which this page draws since S25. The field it needed arrived with RFC 0005
unit 12a: `created_by` rides TaskCard and carries the person stub a label
needs, so the half costs no request per row. It is a chip of the row's detail
strip, `context.showCreator` here and the seam at the foot of `rowChips` in
`components/task-row.tsx`, and it closes ledger L-224 and L-254. Its other
half, the created-by filter axis, is `views/filter.ts`'s and closes L-177 and
L-255 in the same pass.

**The scope control is this page's spine, promoted onto the window bar**
(L-046 and L-098, S25). The prototype's `lib/nav-model.ts` states the rule it
was built from, "names never change; scope controls do": a sidebar entry is
the navigation anchor, and the value it is showing lives in a control on the
bar. Assignments is the one page in this client whose default arrangement
spans a categorical axis, so it is the one page with a scope, and the
prototype's own screen draws exactly this strip.

Three things about it are decisions rather than transcription. **It narrows
which groups are drawn and never which rows are fetched**, which is the rule
the filter follows and section 6's reason for it. **It is page state and not a
preference**: the prototype holds it in `useState`, 4.19 has no key for it,
and a scope whose default is everyone should come back to everyone. And **the
viewer's option says "You"** where the prototype says "Assigned to me":
`grouping.ts` names that group "You" and AC-245 addresses it by that word, so
a strip calling it something else would be the page giving one thing two names
forty pixels apart, which is the fault 9.4 states about the important switch.
*/
import { useState } from 'react'

import { UserRound, UserRoundCheck, UsersRound } from '../lib/icons.js'

import { ViewStrip } from '../components/view-strip.js'
import { WindowBarActions } from '../components/window-bar.js'

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

/** The scope's resting value: the whole household's load, DES-152's default. */
const EVERYONE = '__everyone'
/** The strip's accessible name, which is the question the control answers. */
const WHOSE_ASSIGNMENTS = 'Whose assignments'

export function AssignmentsPage(): React.JSX.Element {
  const view = useAllView()
  const actions = useRowActions()
  const confirm = useConfirm()
  const basis = useRowBasis()
  const multiMemberFolderIds = useMultiMemberFolderIds()
  const [scope, setScope] = useState<string>(EVERYONE)

  const data = view.data
  const rows = [
    ...(data?.planned ?? []),
    ...(data?.tasks_inbox ?? []),
    ...(data?.tasks_groups ?? []).flatMap((group) => group.rows),
  ]
  const place = usePlace(SPINE, rows)
  const context = { ...basis, multiMemberFolderIds, showCreator: true }

  const axis = place.filter.groupBy === 'none' ? 'person' : place.filter.groupBy
  const grouped = groupRows(place.narrow(rows), axis, place.today, place.viewerId)
  /* The scope narrows the groups the page draws and nothing else: the rows
     were already fetched and already grouped, and a scope that refetched
     would be a second filter with a different name. */
  const groups = scope === EVERYONE ? grouped : grouped.filter((group) => group.key === scope)

  return (
    <div className="space-y-7">
      {/*
      Left of the shared block, which is `order` on `WindowBarActions` and the
      folder page's own arrangement: the spine, then the filter, then the
      quiet things. `PlaceChrome` renders at the default order below.
      */}
      <WindowBarActions order={-1}>
        <ViewStrip
          ariaLabel={WHOSE_ASSIGNMENTS}
          value={scope}
          options={[
            { key: EVERYONE, label: 'Everyone', icon: UsersRound },
            ...grouped.map((group) => ({
              key: group.key,
              label: group.name,
              icon: UserRound,
            })),
          ]}
          onSelect={setScope}
          collapse
        />
      </WindowBarActions>
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
