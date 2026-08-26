/*
9.5's Important, at /app/important: "single list per Q4; un-star removes
immediately; the star's two names are 9.1's."

9.1 puts the inline quick-add where a page has a natural landing place, and
this page is a single list of rows that live elsewhere, so the floating button
is its capture point instead: it is one of the three that section names, and
what it makes is starred and undated, which is 9.3's Important row and this
page's own spine.

**The star points outward here and nowhere else.** Q4 gives this page the
outward tooltip, "Also in Planned, due ..." and "Also in Tasks, in Work", and
`presenters.ts` composes it; the star's accessible name stays "Important",
which is what AC-055 and AC-099 address it by. The mode is a page-level fact
passed down, because a component that read the route would behave differently
depending on where it was mounted.

**"On this one page the star rests unfilled"** is 9.5's v2 sentence and it is
the row's to keep, not this page's: a filled star on every row of the starred
page distinguishes nothing. It travels with S11's row work, and this page
passes nothing new for it.
*/
import { Star } from '../lib/icons.js'

import { useImportantView } from '../api/queries.js'
import { groupRows } from '../views/grouping.js'
import { PLACES } from '../views/place-pages.js'
import { TaskBoard } from '../views/TaskBoard.js'
import { PlaceChrome, usePlace } from '../views/usePlace.js'
import { useRowActions } from '../parts/useRowActions.js'
import { PageSection } from '../states/PageSection.js'
import { PageBody } from '../states/PageStates.js'
import { IMPORTANT_EMPTY } from './empty-states.js'
import { PageHeading } from './page-heading.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'
import { groupHeadingMedia } from '../views/group-mark.js'

const SPINE = PLACES.important

export function ImportantPage(): React.JSX.Element {
  const view = useImportantView()
  const actions = useRowActions()
  const confirm = useConfirm()
  const basis = useRowBasis()

  const rows = view.data?.rows ?? []
  const place = usePlace(SPINE, rows)
  const context = { ...basis, starTooltip: actions.starTooltipMode }
  const narrowed = place.narrow(rows)
  const columns = groupRows(narrowed, place.groupBy, place.today, place.viewerId)

  return (
    <div className="space-y-7">
      <PlaceChrome place={place} />
      <PageHeading icon={SPINE.icon} title={SPINE.name} subtitle={SPINE.question} />
      <PageBody
        query={view}
        isEmpty={rows.length === 0}
        emptyCopy={IMPORTANT_EMPTY}
        emptyIcon={Star}
        truncated={view.data?.truncated ?? false}
      >
        {place.mode === 'board' ? (
          <TaskBoard
            place={place}
            columns={columns}
            context={context}
            actions={actions}
            onAsk={confirm.ask}
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
