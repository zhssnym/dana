/*
 * Upcoming: dated work from tomorrow on, under date headings. "New task" dates its task tomorrow so it stays
 * here.
 */
import { Button } from '../components/ui/button.js'
import { CalendarDays, List } from '../lib/icons.js'

import { useFocusView, useMultiMemberFolderIds } from '../api/queries.js'
import { PlannedCalendar } from '../components/calendar/index.js'
import { ladderRungs } from '../views/ladder.js'
import { PLACES } from '../views/place-pages.js'
import { PlaceGroup, PlaceHead, usePlace } from '../views/usePlace.js'
import { useRowActions } from '../parts/useRowActions.js'
import { PageBody } from '../components/page/PageStates.js'
import { useNoStoredLabel } from '../shell/focus-lists.js'
import { PLANNED_EMPTY } from './empty-states.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'
import { useRowKeys } from '../components/row-keys.js'

const SPINE = PLACES.scheduled
const ASK = { when: 'upcoming', group: 'none' } as const

export function ScheduledPage(): React.JSX.Element {
  const view = useFocusView(ASK)
  const actions = useRowActions()
  const confirm = useConfirm()
  const basis = useRowBasis()
  /* One Tab stop for the page's rows (`row-keys.ts`). */
  const keys = useRowKeys<HTMLDivElement>()
  const multiMemberFolderIds = useMultiMemberFolderIds()

  const rows = (view.data?.groups ?? []).flatMap((group) => group.rows)
  const place = usePlace(SPINE, rows)
  useNoStoredLabel(place)
  const context = { ...basis, multiMemberFolderIds }
  /* Someone else's started work stays here under Today's word, "Started". */
  const groups = ladderRungs(rows, place.today).map((group) =>
    group.key === 'started' ? { ...group, name: 'Started' } : group,
  )
  const calendar = place.mode === 'calendar'

  const toggle = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        place.setMode(calendar ? 'list' : 'calendar')
      }}
    >
      {calendar ? <List aria-hidden="true" /> : <CalendarDays aria-hidden="true" />}
      {calendar ? 'Show as list' : 'Show as calendar'}
    </Button>
  )

  return (
    <div ref={keys} className="space-y-6">
      <PlaceHead place={place} controls={toggle} />

      {calendar ? (
        /* The month grid shows every dated task, past days included; the list starts tomorrow. */
        <PlannedCalendar
          onCreate={(title, date) => {
            place.capture(title, { due_date: date })
          }}
        />
      ) : (
        /* Rows bleed their padding into the gutter so checkbox, heading and title share one left edge. */
        <div className="-mx-1.5">
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
                    /* Under a date heading a row keeps only its time. */
                    given={{ day: group.date !== null }}
                    context={context}
                    actions={actions}
                    onAsk={confirm.ask}
                  />
                </PlaceGroup>
              ))}
            </div>
          </PageBody>
        </div>
      )}

      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
