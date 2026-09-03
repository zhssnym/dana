/*
9.5's Important, at /app/important: "single list per Q4; un-star removes
immediately; the star's two names are 9.1's."

**This file is wiring and the markup is `screens/important-screen.tsx`**,
which is RFC 0005 change control item 45's proof screen, produced here after
item 47(l) measured that it still owed the head. Item 45's deeper finding is
why the split reads the way it does: "the prototype's screens are
presentational and its wiring is in its shell", which is the same architecture
this client has. So the screen takes rows and callbacks and touches nothing
else, and this supplies both. The screen's own header names its seven seams.

**The board and a grouping are this file's branch rather than the screen's**,
because the screen is the prototype's list arrangement and a board is a
different view of the same rows (DES-177: a view is a shape, not a question).
The two branches draw one head between them, the screen's own on the list side
and `PlaceHead` on the other, which is the same `PageHead` either way and
therefore the same cover band.

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

**"On this one page the star rests unfilled"** is 9.5's v2 sentence, and the
lifted screen is where it comes from now: it passes `given={{ important: true
}}` on every row, which is the row's own rule for a fact its page has already
stated.

**The completed foot is `components/page/CompletedFoot.tsx`'s and not the screen's**,
which is the screen's sixth seam and the one place this page does not take the
prototype's arrangement. The lifted `CompletedSection` takes a list of rows and
renders nothing when it is empty; Q6 is keyset-paginated and this client reads
it only while the section is open, so handing the screen a list would mean
fetching every page of everything the viewer has ever finished in order to
draw a collapsed heading. The section it draws is the same one, in the same
grammar, with the read the client already had.
*/
import { Star } from '../lib/icons.js'

import { useImportantView } from '../api/queries.js'
import { groupRows } from '../views/grouping.js'
import { PLACES } from '../views/place-pages.js'
import { TaskBoard } from '../views/TaskBoard.js'
import { PlaceChrome, PlaceHead, usePlace } from '../views/usePlace.js'
import { taskRowDisplay } from '../parts/presenters.js'
import { useRowActions } from '../parts/useRowActions.js'
import { PageSection } from '../components/page/PageSection.js'
import { CompletedFoot } from '../components/page/CompletedFoot.js'
import { PageBody, TruncationNotice } from '../components/page/PageStates.js'
import { ImportantScreen } from '../screens/important-screen.js'
import { ABANDON_CONFIRM, DELETE_TASK_CONFIRM } from '../components/ui/copy.js'
import { IMPORTANT_EMPTY } from './empty-states.js'
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
  const arranged = place.mode === 'board' || place.groupBy !== 'none'

  /* The card behind an id, which is all a presentational screen can honestly
     report and all every act below needs. */
  const rowOf = (id: string): (typeof rows)[number] | undefined =>
    rows.find((task) => task.id === id)

  return (
    <div className="space-y-7">
      <PlaceChrome place={place} />
      {arranged ? (
        <>
          <PlaceHead place={place} />
          <PageBody
            query={view}
            isEmpty={rows.length === 0}
            emptyCopy={IMPORTANT_EMPTY}
            emptyIcon={Star}
            truncated={view.data?.truncated ?? false}
          >
            {place.mode === 'board' ? (
              <TaskBoard place={place} columns={columns} context={context} actions={actions} />
            ) : (
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
            )}
          </PageBody>
        </>
      ) : (
        /*
        **The screen owns its own states, which `PageBody` cannot do for it.**

        Every other place page renders its head outside `PageBody` and its body
        inside, because that component answers pending, error and empty by
        rendering *instead of* its children. The head is inside the screen
        here, so wrapping the screen would take the head off the page in all
        three of those states, which is a page with nothing on it and no name.

        The prototype's own screen already draws the three, from
        `components/state-patterns.tsx`, which is the same shared vocabulary
        `PageBody` wraps and the reason nothing is given up by letting it. What
        the screen has no idea about is section 6's cap, so the notice sits
        above it, and 9.1's retry, which is the screen's seventh seam.
        */
        <>
          {view.data?.truncated === true ? <TruncationNotice /> : null}
          <ImportantScreen
            previewState={
              view.status === 'pending' ? 'loading' : view.status === 'error' ? 'error' : null
            }
            onRetry={() => {
              void view.refetch()
            }}
            tasks={narrowed.map((task) => {
              const display = taskRowDisplay(task, context)
              return {
                ...display,
                id: task.id,
                /* Required by the screen's own prop type, and always supplied
                   here: the mode above is `outward`, which is the one branch
                   of `importantTooltipFor` that returns a string. */
                importantTooltip: display.importantTooltip ?? '',
              }
            })}
            onOpenTask={(id) => {
              const task = rowOf(id)
              if (task !== undefined) actions.onOpenTask(task)
            }}
            onToggleComplete={(id) => {
              const task = rowOf(id)
              if (task !== undefined) actions.onToggleComplete(task)
            }}
            onToggleImportant={(id) => {
              const task = rowOf(id)
              if (task !== undefined) actions.onToggleImportant(task)
            }}
            onRestore={(id) => {
              const task = rowOf(id)
              if (task !== undefined) actions.onRestore(task)
            }}
            onAbandon={(id) => {
              const task = rowOf(id)
              if (task === undefined) return
              confirm.ask(ABANDON_CONFIRM, () => {
                actions.onAbandon(task)
              })
            }}
            onDelete={(id) => {
              const task = rowOf(id)
              if (task === undefined) return
              confirm.ask(DELETE_TASK_CONFIRM, () => {
                actions.onDelete(task)
              })
            }}
          />
        </>
      )}

      {/* The owner's ruling of 2026-08-22: every page that lists tasks ends
          the same way. The predicate is Q4's, this page's own spine, so the
          foot is this page's work finished rather than every finished thing.
          Outside both branches, because it is the page's close and not the
          list's, and because it reads Q6 rather than Q4's own query. */}
      <CompletedFoot
        keep={(task) => task.important}
        context={context}
        actions={actions}
        onAsk={confirm.ask}
      />
      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
