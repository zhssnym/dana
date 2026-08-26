/*
9.5's Scheduled, at /app/scheduled: everything with a date.

The page replaces v1's Planned, and 6 Q3 is unchanged behind it: "Scheduled,
list mode (v1: Planned)" is the whole of what RFC 0005 did to the query.

**The list is Q3's order under a ladder of headings**, which is the one thing
this page gained. `views/ladder.ts` decides the rungs and states their
reasoning; what belongs here is why they are headings and not controls: "a row
says 'Due tomorrow' about one task and a heading says 'Tomorrow' about a
bucket, one date vocabulary at two altitudes" (9.5). Each rung is a named
region, "one per ladder rung named as its heading reads" (9.1's regions rule),
which is what lets a criterion say which part of the ladder it means.

**The calendar is the one this page always had and is not ported again.**
Q3C's grid, its "+N more", its zooms and its ghosts are the Complex
Interaction engineer's and live in `components/calendar/`. What changed is who
switches to it: the mode toggle this page drew beside its own title is gone,
and the view strip in the window bar is the one control (DES-150), because a
bespoke switcher on one page is the fork DES-154 exists to prevent. 9.5's "mode
and zoom persist client-side" is still true and is now one preference across
every page rather than this page's own key.

**The quick-add sits at the list foot and dates its task today**, which is
9.1's placement and 9.3's entry row, and which is also the only thing that
keeps a task made here on the page it was made on: Q3 admits dated rows only,
so an undated capture would be watched to vanish (DES-182).
*/
import { CalendarDays } from '../lib/icons.js'

import { usePlannedView, useMultiMemberFolderIds } from '../api/queries.js'
import { PlannedCalendar } from '../components/calendar/index.js'
import { QuickAdd } from '../components/quick-add.js'
import { groupRows } from '../views/grouping.js'
import { ladderRungs } from '../views/ladder.js'
import { PLACES } from '../views/place-pages.js'
import { TaskBoard } from '../views/TaskBoard.js'
import { PlaceChrome, usePlace } from '../views/usePlace.js'
import { useRowActions } from '../parts/useRowActions.js'
import { PageSection } from '../states/PageSection.js'
import { CompletedFoot } from '../states/CompletedFoot.js'
import { PageBody } from '../states/PageStates.js'
import { PLANNED_EMPTY } from './empty-states.js'
import { PageHeading } from './page-heading.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'
import { groupHeadingMedia } from '../views/group-mark.js'

const SPINE = PLACES.scheduled

export function ScheduledPage(): React.JSX.Element {
  const view = usePlannedView()
  const actions = useRowActions()
  const confirm = useConfirm()
  const basis = useRowBasis()
  const multiMemberFolderIds = useMultiMemberFolderIds()

  const rows = view.data?.rows ?? []
  const place = usePlace(SPINE, rows)
  const context = { ...basis, multiMemberFolderIds }

  const narrowed = place.narrow(rows)
  const rungs = ladderRungs(narrowed, place.today)
  const columns = groupRows(narrowed, place.groupBy, place.today, place.viewerId)

  return (
    <div className="space-y-7">
      <PlaceChrome place={place} />
      <PageHeading icon={SPINE.icon} title={SPINE.name} subtitle={SPINE.question} />

      {place.mode === 'calendar' ? (
        /* Everything about the calendar, its range request included, is inside
           that component; this page decides only which of the three views 9.1
           gives it is showing. */
        <PlannedCalendar />
      ) : (
        <div>
          <PageBody
            query={view}
            isEmpty={rows.length === 0}
            emptyCopy={PLANNED_EMPTY}
            emptyIcon={CalendarDays}
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
              /* A grouping replaces the ladder rather than nesting inside it
                 (DES-156): a folder inside a Tuesday is not what was asked
                 for, and returning Group by to Nothing gives the ladder back. */
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
              <div className="space-y-6">
                {rungs.map((rung) => (
                  <PageSection key={rung.key} name={rung.name} heading={rung.name}>
                    <TaskRows
                      tasks={rung.rows}
                      context={context}
                      actions={actions}
                      onAsk={confirm.ask}
                    />
                  </PageSection>
                ))}
              </div>
            )}
          </PageBody>
          {/* 9.1 puts the quick-add at a list's foot, and 9.3's table gives
              this entry point today's date. Outside `PageBody` so the page's
              one capture point is there while a read is in flight or has
              failed, which is the rule the folder page's own row follows. */}
          {place.mode === 'board' ? null : (
            <QuickAdd
              folderName="Desk"
              onAdd={(title) => {
                place.capture(title)
              }}
              onOpenFullForm={() => {
                place.openFull()
              }}
            />
          )}

          {/* The owner's ruling of 2026-08-22, and `prototype-v2`'s
              planned-screen answering the objection to it in its own words:
              "Spec Q3 keeps completed rows out of the *list*, and this is a
              section under it rather than rows in it, so the ordering rule is
              untouched." The predicate is Q3's spine, having a date, so a
              finished undated task belongs to another page's foot. */}
          <CompletedFoot
            keep={(task) => task.due_date !== null}
            context={context}
            actions={actions}
            onAsk={confirm.ask}
          />
        </div>
      )}

      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
