/*
Today, at /app/today: 6 Q1's open list, carried-over work first, then the
"New task" row. Finished-today rows (Q1R) show as a plain "Done" group when
Show completed is on. A grouping from the View menu replaces the groups.

The "Today" group only holds what is due today (or undated) and not yet
started. Every started task (a start date today or earlier) is under "In
progress", the one name the Board and Linear give it, whether or not it has a
due date. A row here although its date is later and not started says why:
"Added to Today" when the person pulled it in.
*/
import type { TaskCard } from '../../shared/tasks.js'

import { useMyDayView } from '../api/queries.js'
import { NEW_TASK_ROW_PHONE, QuickAdd } from '../components/quick-add.js'
import { SampleStrip } from '../onboarding/SampleStrip.js'
import { StarterOffer, useMayBeFresh } from '../onboarding/StarterOffer.js'
import { stageOf } from '../views/linear/stage.js'
import { groupRows } from '../views/grouping.js'
import { wearsLabel } from '../views/filter.js'
import { PLACES } from '../views/place-pages.js'
import { PlaceGroup, PlaceHead, usePlace } from '../views/usePlace.js'
import { useRowActions } from '../parts/useRowActions.js'
import { PageBody } from '../components/page/PageStates.js'
import { MY_DAY_EMPTY } from './empty-states.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'
import { useRowKeys } from '../components/row-keys.js'

const SPINE = PLACES.today

export function TodayPage(): React.JSX.Element {
  const view = useMyDayView()
  const actions = useRowActions()
  const confirm = useConfirm()
  const basis = useRowBasis()
  /* One Tab stop for the page's rows; arrows, Enter and Space (`row-keys.ts`). */
  const keys = useRowKeys<HTMLDivElement>()
  /* 9.13's first-run offer takes the place of Today's empty state. */
  const mayBeFresh = useMayBeFresh()

  const carried = view.data?.carried ?? []
  const today = view.data?.today ?? []
  const recap = view.data?.recap ?? []
  const open = [...carried, ...today]

  const place = usePlace(SPINE, open)
  const context = { ...basis, showPullMarker: true }
  const showDone = place.filter.showCompleted && recap.length > 0

  /* `day`: under the "Today" heading a row keeps only its time, as on Upcoming. */
  const rows = (tasks: readonly TaskCard[], day = false): React.JSX.Element => (
    <TaskRows
      tasks={place.narrow(tasks)}
      context={context}
      actions={actions}
      onAsk={confirm.ask}
      {...(day ? { given: { day: true } } : {})}
    />
  )

  const total = open.length + recap.length
  /* #208: a Label narrowing empties a heading's rows; the heading goes too. */
  const carriedShown = carried.filter((task) => wearsLabel(task, place.filter.label))

  /* Why each of today's rows is here. Only a row dated later needs a reason. */
  const dueToday: TaskCard[] = []
  const started: TaskCard[] = []
  const added: TaskCard[] = []
  for (const task of today) {
    if (!wearsLabel(task, place.filter.label)) continue
    if (stageOf(task, place.today) === 'present') started.push(task)
    else if (task.due_date === null || task.due_date <= place.today) dueToday.push(task)
    else added.push(task)
  }
  const reasons = (started.length === 0 ? 0 : 1) + (added.length === 0 ? 0 : 1)

  const pageBody = (
    <PageBody
      query={view}
      isEmpty={open.length === 0 && !showDone}
      emptyCopy={MY_DAY_EMPTY}
      truncated={view.data?.truncated ?? false}
    >
      <div className="space-y-6">
        {place.groupBy !== 'none' ? (
          groupRows(place.narrow(open), place.groupBy, place.today, place.viewerId).map(
            (column) => (
              <PlaceGroup key={column.key} name={column.name} heading={column.name}>
                {rows(column.rows)}
              </PlaceGroup>
            ),
          )
        ) : (
          <>
            {/* AC-097 reads "Carried over". With nothing carried, the day is
                one list and needs no heading. */}
            {carriedShown.length === 0 ? null : (
              <PlaceGroup name="Carried over" heading="Carried over">
                {rows(carried)}
              </PlaceGroup>
            )}
            {dueToday.length === 0 ? null : (
              <PlaceGroup
                name="Today"
                {...(carriedShown.length === 0 && reasons === 0 ? {} : { heading: 'Today' })}
              >
                {rows(dueToday, true)}
              </PlaceGroup>
            )}
            {started.length === 0 ? null : (
              <PlaceGroup name="In progress" heading="In progress">
                {rows(started)}
              </PlaceGroup>
            )}
            {added.length === 0 ? null : (
              <PlaceGroup name="Added to Today" heading="Added to Today">
                {rows(added)}
              </PlaceGroup>
            )}
          </>
        )}
      </div>
    </PageBody>
  )

  const quickAdd = (
    <QuickAdd
      className={NEW_TASK_ROW_PHONE}
      onAdd={(title) => {
        place.capture(title)
      }}
    />
  )

  const list = (
    <div>
      {pageBody}
      {quickAdd}
    </div>
  )

  return (
    <div ref={keys} className="space-y-6">
      <SampleStrip />
      <PlaceHead
        place={place}
        bare={total === 0}
      />

      {/* Rows bleed their padding into the gutter: a checkbox, a heading and
          the title share one left edge. */}
      <div className="-mx-1.5 space-y-6">
        {/* A fresh account's own first act comes before the offer of an
            example; otherwise "New task" closes the list. */}
        {mayBeFresh ? (
          <StarterOffer lead={quickAdd} fallback={list} />
        ) : (
          list
        )}

        {view.status !== 'success' || !showDone ? null : (
          <PlaceGroup name="Done" heading="Done">
            {rows(recap)}
          </PlaceGroup>
        )}
      </div>

      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}

