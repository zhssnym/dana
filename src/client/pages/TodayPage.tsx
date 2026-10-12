/* Today: carried-over work first, then today's groups, then "New task". The server picks each row's group. */
import type { TaskCard } from '../../shared/tasks.js'

import { useFocusView } from '../api/queries.js'
import { NEW_TASK_ROW_PHONE, QuickAdd } from '../components/quick-add.js'
import { StarterOffer, useMayBeFresh } from '../onboarding/StarterOffer.js'
import { PLACES } from '../views/place-pages.js'
import { PlaceGroup, PlaceHead, usePlace } from '../views/usePlace.js'
import { useRowActions } from '../parts/useRowActions.js'
import { PageBody } from '../components/page/PageStates.js'
import { useNoStoredLabel } from '../shell/focus-lists.js'
import { MY_DAY_EMPTY } from './empty-states.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'
import { useRowKeys } from '../components/row-keys.js'

const SPINE = PLACES.today
const ASK = { when: 'on_today', group: 'today' } as const

export function TodayPage(): React.JSX.Element {
  const view = useFocusView(ASK)
  const actions = useRowActions()
  const confirm = useConfirm()
  const basis = useRowBasis()
  /* One Tab stop for the page's rows (`row-keys.ts`). */
  const keys = useRowKeys<HTMLDivElement>()
  /* Spec 9.13's first-run offer replaces Today's empty state. */
  const mayBeFresh = useMayBeFresh()

  const groups = view.data?.groups ?? []
  const open = groups.flatMap((group) => group.rows)
  const group = (key: string): readonly TaskCard[] =>
    groups.find((held) => held.key === key)?.rows ?? []

  const place = usePlace(SPINE, open)
  useNoStoredLabel(place)
  const context = { ...basis, showPullMarker: true }

  /* `day`: under the "Today" heading a row keeps only its time. */
  const rows = (tasks: readonly TaskCard[], day = false): React.JSX.Element => (
    <TaskRows
      tasks={tasks}
      context={context}
      actions={actions}
      onAsk={confirm.ask}
      {...(day ? { given: { day: true } } : {})}
    />
  )

  /* Overdue work is "Carried over", started or not. Started work not yet late is "Started" (AC-1010). */
  const carriedShown = group('carried')
  const dueToday = group('today')
  const started = group('started')
  const added = group('added')
  const reasons = (started.length === 0 ? 0 : 1) + (added.length === 0 ? 0 : 1)

  const pageBody = (
    <PageBody
      query={view}
      isEmpty={open.length === 0}
      emptyCopy={MY_DAY_EMPTY}
      truncated={view.data?.truncated ?? false}
    >
      <div className="space-y-6">
        {/* AC-097 reads "Carried over". With nothing carried, the day needs no heading. */}
        {carriedShown.length === 0 ? null : (
          <PlaceGroup name="Carried over" heading="Carried over">
            {rows(carriedShown)}
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
          <PlaceGroup name="Started" heading="Started">
            {rows(started)}
          </PlaceGroup>
        )}
        {added.length === 0 ? null : (
          <PlaceGroup name="Added to Today" heading="Added to Today">
            {rows(added)}
          </PlaceGroup>
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
      <PlaceHead place={place} controls={null} />

      {/* Rows bleed their padding into the gutter so checkbox, heading and title share one left edge. */}
      <div className="-mx-1.5 space-y-6">
        {/* A fresh account's own first act comes before the offer of an example. */}
        {mayBeFresh ? (
          <StarterOffer body={pageBody} quickAdd={quickAdd} />
        ) : (
          list
        )}
      </div>

      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}

