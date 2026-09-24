/*
Upcoming, at /app/scheduled: everything with a date (6 Q3), under a ladder of
date headings, then the "New task" row, which dates its task today so it stays
on this page. The View menu switches to the calendar, groups by folder instead
of date, and shows finished dated work as a plain "Done" group at the end.
*/
import { CalendarDays } from '../lib/icons.js'

import { usePlannedView, useMultiMemberFolderIds } from '../api/queries.js'
import { PlannedCalendar } from '../components/calendar/index.js'
import { NEW_TASK_ROW_PHONE, QuickAdd } from '../components/quick-add.js'
import { groupRows } from '../views/grouping.js'
import { ladderRungs } from '../views/ladder.js'
import { PLACES } from '../views/place-pages.js'
import { DoneGroup } from '../views/DoneGroup.js'
import { PlaceGroup, PlaceHead, usePlace } from '../views/usePlace.js'
import { isScheduled } from '../parts/schedule.js'
import { useRowActions } from '../parts/useRowActions.js'
import { PageBody } from '../components/page/PageStates.js'
import { PLANNED_EMPTY } from './empty-states.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'
import { useRowKeys } from '../components/row-keys.js'

const SPINE = PLACES.scheduled

export function ScheduledPage(): React.JSX.Element {
  const view = usePlannedView()
  const actions = useRowActions()
  const confirm = useConfirm()
  const basis = useRowBasis()
  /* One Tab stop for the page's rows; arrows, Enter and Space (`row-keys.ts`). */
  const keys = useRowKeys<HTMLDivElement>()
  const multiMemberFolderIds = useMultiMemberFolderIds()

  const rows = view.data?.rows ?? []
  const place = usePlace(SPINE, rows)
  const context = { ...basis, multiMemberFolderIds }

  const narrowed = place.narrow(rows)
  const groups =
    place.groupBy === 'none'
      ? ladderRungs(narrowed, place.today)
      : groupRows(narrowed, place.groupBy, place.today, place.viewerId)

  return (
    <div ref={keys} className="space-y-6">
      <PlaceHead place={place} bare={rows.length === 0 && !place.filter.showCompleted} />

      {place.mode === 'calendar' ? (
        <PlannedCalendar
          onCreate={(title, date) => {
            place.capture(title, { due_date: date })
          }}
        />
      ) : (
        /* Rows bleed their padding into the gutter: a checkbox, a heading
           and the title share one left edge. */
        <div className="-mx-1.5 space-y-6">
          <div>
            <PageBody
              query={view}
              isEmpty={rows.length === 0}
              emptyCopy={PLANNED_EMPTY}
              emptyIcon={CalendarDays}
              truncated={view.data?.truncated ?? false}
            >
              <div className="space-y-6">
                {groups.map((group) => (
                  <PlaceGroup key={group.key} name={group.name} heading={group.name}>
                    <TaskRows
                      tasks={group.rows}
                      /* What the date heading says, a row does not repeat: under
                         "Tomorrow" a row keeps only its time. Overdue dates stay red. */
                      {...(place.groupBy === 'none'
                        ? { given: { day: 'date' in group && group.date !== null } }
                        : {})}
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
          </div>
          {place.filter.showCompleted ? (
            <DoneGroup place={place} context={context} actions={actions} onAsk={confirm.ask} keep={isScheduled} />
          ) : null}
        </div>
      )}

      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
