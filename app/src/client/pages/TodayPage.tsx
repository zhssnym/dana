/*
9.4's Today, at /app/today.

The page S10 redraws, and the v1 My Day it replaces is in git rather than
beside it. What survives unchanged is the query, which never moved: 6 Q1 keeps
its logic and its criteria references and gained only a heading, "Today, open
list (v1: My Day)".

**The head is DES-149's, and Today is one of only two places with a fact.**
"A progress figure, which only Today and a folder have, is the quiet figure
beside the name"; 9.4 names it, "the fact 'N of M done'". It is Q1R's recap
against everything the day holds, which is the one completion a query can
honestly report: what was finished today out of what was on today.

**The important-only switch is gone from this page and that is the point.**
9.4: "the important-only narrowing is the window bar filter's important
switch; the page's header carries no control of its own for it, because two
controls for one variable forty pixels apart is how the two disagree."
DES-150 records the same move and Imran's ruling that 9.4 was to be edited
rather than the design bent back to it. `?state=important` seeds the filter,
which `usePlace` does for every page.

**Grouping replaces this page's arrangement rather than nesting inside it**
(DES-156). Today's three headings are normative to the letter, so they are
what the page draws when nobody has asked for a grouping; ask for one and the
page arranges itself that way instead, and returning Group by to Nothing gives
the page back untouched, because nothing about it was ever edited.

**The recap is outside the grouping and stays collapsed.** Q1R is a separate
query result with its own rule, "the section is hidden entirely while empty",
which AC-158 reads as an absence rather than a heading saying zero.
*/
import { CalendarCheck2 } from '../lib/icons.js'

import { useMyDayView } from '../api/queries.js'
import { QuickAdd } from '../components/quick-add.js'
import { SampleStrip } from '../onboarding/SampleStrip.js'
import { groupRows } from '../views/grouping.js'
import { PLACES } from '../views/place-pages.js'
import { PlaceChrome, PlaceHead, usePlace } from '../views/usePlace.js'
import { TaskBoard } from '../views/TaskBoard.js'
import { useRowActions } from '../parts/useRowActions.js'
import { CollapsibleSection, PageSection } from '../states/PageSection.js'
import { PageBody } from '../states/PageStates.js'
import { MY_DAY_EMPTY } from './empty-states.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'
import { groupHeadingMedia } from '../views/group-mark.js'

const SPINE = PLACES.today

export function TodayPage(): React.JSX.Element {
  const view = useMyDayView()
  const actions = useRowActions()
  const confirm = useConfirm()
  const basis = useRowBasis()

  const carried = view.data?.carried ?? []
  const today = view.data?.today ?? []
  const recap = view.data?.recap ?? []
  const open = [...carried, ...today]

  const place = usePlace(SPINE, open)
  const context = { ...basis, showPullMarker: true }

  const narrowedCarried = place.narrow(carried)
  const narrowedToday = place.narrow(today)
  const narrowedOpen = place.narrow(open)
  const columns = groupRows(narrowedOpen, place.groupBy, place.today, place.viewerId)

  const done = recap.length
  const total = open.length + recap.length

  return (
    <div className="space-y-7">
      <PlaceChrome place={place} />
      <SampleStrip />
      <PlaceHead
        place={place}
        {...(total === 0 ? {} : { fact: `${String(done)} of ${String(total)} done` })}
      />

      <PageBody
        query={view}
        // Emptiness is the fetched groups rather than the narrowed ones: the
        // filter is a view over rows that exist, and Q1's empty copy is about
        // a day with nothing on it.
        isEmpty={open.length === 0}
        emptyCopy={MY_DAY_EMPTY}
        emptyIcon={CalendarCheck2}
        // Section 6's cap counts across a response's arrays rather than per
        // array (ruled 2026-08-07), which is why one flag serves three
        // sections and the notice sits above all of them.
        truncated={view.data?.truncated ?? false}
      >
        <div className="space-y-6">
          {place.mode === 'board' ? (
            <TaskBoard
              place={place}
              columns={columns}
              context={context}
              actions={actions}
            />
          ) : place.groupBy !== 'none' ? (
            columns.map((column) => (
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
            ))
          ) : (
            <>
              {/* An empty group is absent rather than a heading over nothing,
                  which is what keeps a day holding only carried work from
                  opening on a bare "Today". 9.4 fixes the two groups and their
                  headings; it does not ask for a heading over an empty list,
                  and AC-097 reads "Carried over" on a page that has one. */}
              {narrowedCarried.length === 0 ? null : (
                <PageSection
                  name="Carried over"
                  heading="Carried over"
                  count={narrowedCarried.length}
                >
                  <TaskRows
                    tasks={narrowedCarried}
                    context={context}
                    actions={actions}
                    onAsk={confirm.ask}
                  />
                </PageSection>
              )}
              {narrowedToday.length === 0 ? null : (
                <PageSection name="Today" heading="Today" count={narrowedToday.length}>
                  <TaskRows
                    tasks={narrowedToday}
                    context={context}
                    actions={actions}
                    onAsk={confirm.ask}
                  />
                </PageSection>
              )}
            </>
          )}

          {/* polish: taskrow F12. The same inline "Add a task" every other
              list page has, at the list's foot, capturing with Today's own
              entry defaults (due today, pulled in). 9.1's floating "Add task"
              stays beside it, that section naming Today among the pages that
              carry it and seven criteria addressing it there. */}
          {place.mode === 'board' ? null : (
            <QuickAdd
              folderName="Today"
              onAdd={(title) => {
                place.capture(title)
              }}
              onOpenFullForm={(title) => {
                place.openFull(undefined, title)
              }}
            />
          )}

          {/* Q1R: the section is hidden entirely while empty, so it is absent
              rather than rendered with a zero. AC-158 reads that absence. */}
          {recap.length === 0 ? null : (
            <CollapsibleSection name={`Done today (${String(recap.length)})`} defaultOpen={false}>
              <TaskRows
                tasks={place.narrow(recap)}
                context={context}
                actions={actions}
                onAsk={confirm.ask}
              />
            </CollapsibleSection>
          )}
        </div>
      </PageBody>

      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
