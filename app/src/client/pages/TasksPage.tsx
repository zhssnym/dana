/*
9.5's Tasks page: the ungrouped Inbox block, then folder-headed groups, each
with an inline quick-add adding into that folder, undated.

Two things here are rulings rather than readings.

The Inbox block is a named region with no visible heading, which does not
contradict 9.5 calling it ungrouped: a region's name is announced and
addressed, not rendered, so the block still reads as a plain list on top with
no label above it. Naming it is what separates its rows and its quick-add row
from the folder groups beneath, and it is what lets a test tell two identically
named quick-add inputs apart.

And the Inbox block carries a quick-add row like every folder group on the
page, closed at the same change control: 9.1 places the row at the bottom of
Tasks groups and 9.5 calls the Inbox block ungrouped, which had left the one
folder every account has as the only one that could not be quick-added into,
on the page whose whole purpose is capture without a date.

**The Inbox quick-add row sits outside the page's data states, and that is
deliberate.** 10.6 renders the shell offline and AC-091 attempts its write
through this row with no network at all, so a row rendered only once rows
arrived would be missing exactly when the criterion reaches for it. Every
account has an Inbox (INV-2), so the block is structure rather than data; the
folder groups below are data and are absent until they arrive.

The rendering is exported because 9.5's All page renders its Tasks section by
this page's own rules, carrying these same regions inside it.
*/
import type { GetTasksViewResponse } from '../../shared/views.js'
import { useMe, useTasksView } from '../api/queries.js'
import { QuickAddRow, TaskList } from '../components/ui/index.js'
import { useRowActions } from '../parts/useRowActions.js'
import type { RowActions } from '../parts/useRowActions.js'
import { PageSection } from '../states/PageSection.js'
import { PageBody } from '../states/PageStates.js'
import type { PageQueryState } from '../states/PageStates.js'
import { TASKS_EMPTY } from './empty-states.js'

export function TasksGroups({
  query,
  view,
  viewerId,
  actions,
  emptyCopy = TASKS_EMPTY,
  truncated = false,
}: {
  readonly query: PageQueryState
  readonly view: GetTasksViewResponse | undefined
  readonly viewerId: string | null
  readonly actions: RowActions
  /**
   * False on the All page, whose own `PageBody` already carries the flag: the
   * cap is per response and All's response has one, so a notice here as well
   * would be the same fact stated twice on one page.
   */
  readonly truncated?: boolean
  /**
   * Null on the All page. 9.5 renders All's Tasks section by this page's own
   * rules, but Q5 gives All its own empty copy, and a section that also
   * carried Q2's would answer one question twice.
   */
  readonly emptyCopy?: string | null
}): React.JSX.Element {
  const inboxFolderId = view?.inbox[0]?.folder.id
  return (
    <>
      <PageSection name="Inbox">
        <PageBody
          query={query}
          isEmpty={
            emptyCopy !== null &&
            (view?.inbox.length ?? 0) === 0 &&
            (view?.groups.length ?? 0) === 0
          }
          emptyCopy={emptyCopy ?? ''}
          truncated={truncated}
        >
          <TaskList tasks={view?.inbox ?? []} viewerId={viewerId} {...actions} />
        </PageBody>
        {/* Undated and into this group's folder: 9.5's own words for the row,
            and the entry-point defaults of 9.3 for the bare Tasks page. The
            folder is omitted rather than guessed before the Inbox id is known,
            because 7.6 defaults folder_id to V's Inbox anyway. */}
        <QuickAddRow
          defaults={inboxFolderId === undefined ? {} : { folder_id: inboxFolderId }}
        />
      </PageSection>
      {(view?.groups ?? []).map((group) => (
        <PageSection
          key={group.folder.id}
          name={group.folder.name}
          heading={group.folder.name}
        >
          <TaskList tasks={group.rows} viewerId={viewerId} {...actions} />
          <QuickAddRow defaults={{ folder_id: group.folder.id }} />
        </PageSection>
      ))}
    </>
  )
}

export function TasksPage(): React.JSX.Element {
  const view = useTasksView()
  const me = useMe()
  const actions = useRowActions()

  return (
    <div>
      <h1 className="text-title">Tasks</h1>
      <TasksGroups
        query={view}
        view={view.data}
        viewerId={me.data?.user.id ?? null}
        actions={actions}
        truncated={view.data?.truncated ?? false}
      />
    </div>
  )
}
