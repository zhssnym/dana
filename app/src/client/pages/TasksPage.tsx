/*
9.5's Tasks page: the ungrouped Inbox block, then folder-headed groups, each
with an inline quick-add adding into that folder, undated.

The designer's `src/screens/tasks-screen.tsx`, ported at P8R session R6 onto
our view hooks. His composition and his class strings; the rows and the
quick-add are the components R3 relabelled, and the centring wrapper his screen
carries is the shell's here and is not repeated.

Two things here are rulings rather than readings.

The Inbox block is a named region with no visible heading, which does not
contradict 9.5 calling it ungrouped: a region's name is announced and
addressed, not rendered, so the block still reads as a plain list on top with
no label above it. Naming it is what separates its rows and its quick-add from
the folder groups beneath, and it is what lets a test tell two identically
named quick-adds apart.

And the Inbox block carries a quick-add like every folder group on the page,
closed at the same change control: 9.1 places the control at the bottom of
Tasks groups and 9.5 calls the Inbox block ungrouped, which had left the one
folder every account has as the only one that could not be quick-added into,
on the page whose whole purpose is capture without a date.

**The Inbox quick-add sits outside the page's data states, and that is
deliberate.** 10.6 renders the shell offline and AC-091 attempts its write
through this control with no network at all, so a control rendered only once
rows arrived would be missing exactly when the criterion reaches for it. Every
account has an Inbox (INV-2), so the block is structure rather than data; the
folder groups below are data and are absent until they arrive. His screen hides
the block when it holds no rows, which is the one place this port departs from
him, and it departs for a numbered reason.

The rendering is exported because 9.5's All page renders its Tasks section by
this page's own rules, carrying these same regions inside it.
*/
import { Folder as FolderIcon, ListTodo } from 'lucide-react'

import type { GetTasksViewResponse } from '../../shared/views.js'
import { useTasksView } from '../api/queries.js'
import { useCreateTask } from '../api/mutations.js'
import { QuickAdd } from '../components/quick-add.js'
import { folderDisplay } from '../parts/presenters.js'
import { useRowActions } from '../parts/useRowActions.js'
import { openTaskForm } from '../shell/overlays.js'
import type { RowActions } from '../parts/useRowActions.js'
import type { RowContext } from '../parts/presenters.js'
import { PageSection } from '../states/PageSection.js'
import { PageBody } from '../states/PageStates.js'
import type { PageQueryState } from '../states/PageStates.js'
import { TASKS_EMPTY } from './empty-states.js'
import { PageHeading } from './page-heading.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'

/**
 * The glyph his folder group headings carry, tinted with that folder's own
 * colour, which is data on the wire rather than a design value (11.4).
 */
function FolderGlyph({ color }: { readonly color: string }): React.JSX.Element {
  return (
    <FolderIcon
      className="size-4 shrink-0"
      style={{ color }}
      strokeWidth={1.75}
      aria-hidden="true"
    />
  )
}

export function TasksGroups({
  query,
  view,
  context,
  actions,
  onAsk,
  emptyCopy = TASKS_EMPTY,
  truncated = false,
}: {
  readonly query: PageQueryState
  readonly view: GetTasksViewResponse | undefined
  readonly context: RowContext
  readonly actions: RowActions
  readonly onAsk: (message: string, run: () => void) => void
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
  const create = useCreateTask()
  const inboxFolderId = view?.inbox[0]?.folder.id
  /*
  Undated and into this group's folder: 9.5's own words for the control, and
  the entry-point defaults of 9.3 for the bare Tasks page. The folder is
  omitted rather than guessed before the Inbox id is known, because 7.6
  defaults folder_id to V's Inbox anyway.
  */
  const inboxDefaults = inboxFolderId === undefined ? {} : { folder_id: inboxFolderId }

  return (
    <div className="space-y-7">
      <PageSection name="Inbox">
        <PageBody
          query={query}
          isEmpty={
            emptyCopy !== null &&
            (view?.inbox.length ?? 0) === 0 &&
            (view?.groups.length ?? 0) === 0
          }
          emptyCopy={emptyCopy ?? ''}
          emptyIcon={ListTodo}
          truncated={truncated}
        >
          <TaskRows tasks={view?.inbox ?? []} context={context} actions={actions} onAsk={onAsk} />
        </PageBody>
        <QuickAdd
          folderName="Inbox"
          onAdd={(title) => {
            create.mutate({ title, ...inboxDefaults })
          }}
          onOpenFullForm={() => {
            openTaskForm(inboxDefaults)
          }}
        />
      </PageSection>
      {(view?.groups ?? []).map((group) => (
        <PageSection
          key={group.folder.id}
          name={group.folder.name}
          heading={group.folder.name}
          headingMedia={
            <FolderGlyph color={folderDisplay(group.folder, context.folders).color} />
          }
        >
          <TaskRows tasks={group.rows} context={context} actions={actions} onAsk={onAsk} />
          <QuickAdd
            folderName={group.folder.name}
            onAdd={(title) => {
              create.mutate({ title, folder_id: group.folder.id })
            }}
            onOpenFullForm={() => {
              openTaskForm({ folder_id: group.folder.id })
            }}
          />
        </PageSection>
      ))}
    </div>
  )
}

export function TasksPage(): React.JSX.Element {
  const view = useTasksView()
  const actions = useRowActions()
  const confirm = useConfirm()
  const basis = useRowBasis()
  // Q2 gives a Tasks row no folder label, the group heading above it being the
  // folder, and the Inbox block's rows are all in Inbox.
  const context: RowContext = { ...basis, showFolder: false }

  return (
    <div className="space-y-7">
      <PageHeading icon={ListTodo} title="Tasks" subtitle="Undated tasks" />
      <TasksGroups
        query={view}
        view={view.data}
        context={context}
        actions={actions}
        onAsk={confirm.ask}
        truncated={view.data?.truncated ?? false}
      />
      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
