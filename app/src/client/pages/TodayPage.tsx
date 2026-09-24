/*
Today, at /app/today: 6 Q1's open list, carried-over work first, then the
"New task" row. Finished-today rows (Q1R) show as a plain "Done" group when
Show completed is on. A grouping from the View menu replaces the groups.

The "Today" group only holds what is due today (or undated). A row that is
here although its date is later says why by its group: "Started" when its
Schedule has begun (#217), "Added to Today" when the person pulled it in. A
row under "Today" reading "Tomorrow" was the confusion this split removes.
*/
import type { TaskCard } from '../../shared/tasks.js'
import { CalendarCheck2 } from '../lib/icons.js'

import { useMyDayView } from '../api/queries.js'
import { NEW_TASK_ROW_PHONE, QuickAdd } from '../components/quick-add.js'
import { SampleStrip } from '../onboarding/SampleStrip.js'
import { StarterOffer, useMayBeFresh } from '../onboarding/StarterOffer.js'
import { activationDateOf } from '../parts/schedule.js'
import { groupRows } from '../views/grouping.js'
import { PLACES } from '../views/place-pages.js'
import { PlaceGroup, PlaceHead, usePlace } from '../views/usePlace.js'
import { useRowActions } from '../parts/useRowActions.js'
import { PageBody } from '../components/page/PageStates.js'
import { MY_DAY_EMPTY } from './empty-states.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'

const SPINE = PLACES.today

export function TodayPage(): React.JSX.Element {
  const view = useMyDayView()
  const actions = useRowActions()
  const confirm = useConfirm()
  const basis = useRowBasis()
  /* 9.13's first-run offer sits under Today's list, where /app lands a new person. */
  const mayBeFresh = useMayBeFresh()

  const carried = view.data?.carried ?? []
  const today = view.data?.today ?? []
  const recap = view.data?.recap ?? []
  const open = [...carried, ...today]

  const place = usePlace(SPINE, open)
  const context = { ...basis, showPullMarker: true }
  const showDone = place.filter.showCompleted && recap.length > 0

  const rows = (tasks: readonly TaskCard[]): React.JSX.Element => (
    <TaskRows tasks={place.narrow(tasks)} context={context} actions={actions} onAsk={confirm.ask} />
  )

  const total = open.length + recap.length

  /* Why each of today's rows is here. Only a row dated later needs a reason. */
  const dueToday: TaskCard[] = []
  const started: TaskCard[] = []
  const added: TaskCard[] = []
  for (const task of today) {
    if (task.due_date === null || task.due_date <= place.today) dueToday.push(task)
    else if (startedFor(task, place.viewerId, place.today)) started.push(task)
    else added.push(task)
  }
  const reasons = (started.length === 0 ? 0 : 1) + (added.length === 0 ? 0 : 1)

  return (
    <div className="space-y-6">
      <SampleStrip />
      <PlaceHead
        place={place}
        {...(total === 0 ? {} : { fact: `${String(recap.length)} of ${String(total)} done` })}
      />

      <div>
        <PageBody
          query={view}
          isEmpty={open.length === 0 && !showDone}
          emptyCopy={MY_DAY_EMPTY}
          emptyIcon={CalendarCheck2}
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
                {carried.length === 0 ? null : (
                  <PlaceGroup name="Carried over" heading="Carried over">
                    {rows(carried)}
                  </PlaceGroup>
                )}
                {dueToday.length === 0 ? null : (
                  <PlaceGroup
                    name="Today"
                    {...(carried.length === 0 && reasons === 0 ? {} : { heading: 'Today' })}
                  >
                    {rows(dueToday)}
                  </PlaceGroup>
                )}
                {started.length === 0 ? null : (
                  <PlaceGroup name="Started" heading="Started">
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
        <QuickAdd
          className={NEW_TASK_ROW_PHONE}
          onAdd={(title) => {
            place.capture(title)
          }}
        />
      </div>

      {view.status !== 'success' || !showDone ? null : (
        <PlaceGroup name="Done" heading="Done">
          {rows(recap)}
        </PlaceGroup>
      )}
      {mayBeFresh ? <StarterOffer /> : null}

      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}

/** On Today by its own Schedule: assigned to the viewer and begun (#217). */
function startedFor(task: TaskCard, viewerId: string | null, today: string): boolean {
  const activation = activationDateOf(task)
  return viewerId !== null && task.assignee?.id === viewerId && activation !== null && activation <= today
}
