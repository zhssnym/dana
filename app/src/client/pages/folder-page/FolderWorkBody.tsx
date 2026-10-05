// A Work or Doc tab's body: the filter chips, then the calendar, board or canvas.
import { lazy, Suspense } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { NavigateFunction } from 'react-router'

const FolderCanvas = lazy(() => import('../../components/page/canvas/FolderCanvas.js'))
const WorkCalendar = lazy(() => import('../../views/WorkCalendar.js'))
import { PageSection } from '../../components/page/PageSection.js'
import { PageBody } from '../../components/page/PageStates.js'
/* The empty-state icon goes to `PageBody`, whose `StateIcon` is typed on the
   raw lucide component. */
import { Folder as FolderIcon } from '../../lib/icons.js'
import { mayDraw } from '../../lib/folder-authority.js'
import type { FolderViewerFacts } from '../../lib/folder-authority.js'
import type { RowContext } from '../../parts/presenters.js'
import type { RowActions } from '../../parts/useRowActions.js'
import { folderActionPath } from '../../shell/app-sidebar.js'
import { FOLDER_EMPTY } from '../empty-states.js'
import type { useConfirm } from '../task-rows.js'
import { TaskFilterChips } from '../../views/TaskFilterControl.js'
import type { TaskFilterLabel, TaskFilterPerson } from '../../views/TaskFilterControl.js'
import { taskFilterActive } from '../../views/filter.js'
import type { TaskFilter } from '../../views/filter.js'
import type { WorkView } from '../../views/work-view.js'
import { WorkBoard } from '../../views/WorkBoard.js'
import type { WorkGroup } from '../../views/WorkBoard.js'
import type { GetPageResponse } from '../../../shared/pages.js'
import type { TaskCard } from '../../../shared/tasks.js'
import type { GetFolderTasksOpenResponse } from '../../../shared/views.js'
import { resultsTab } from '../../../shared/folders.js'
import type { Folder, PageKind } from '../../../shared/folders.js'

export function FolderWorkBody({
  id,
  kind,
  tabs,
  open,
  page,
  completedReady,
  openRows,
  completedRows,
  workView,
  boardGroup,
  taskFilter,
  setTaskFilter,
  filterPeople,
  filterLabels,
  filteringTasks,
  context,
  actions,
  facts,
  canCreateInFilter,
  sharedPageEditable,
  onAsk,
  navigate,
}: {
  readonly id: string
  readonly kind: PageKind | null
  readonly tabs: readonly Folder[]
  readonly open: UseQueryResult<GetFolderTasksOpenResponse>
  readonly page: UseQueryResult<GetPageResponse>
  readonly completedReady: boolean
  readonly openRows: readonly TaskCard[]
  readonly completedRows: readonly TaskCard[]
  readonly workView: WorkView
  readonly boardGroup: WorkGroup
  readonly taskFilter: TaskFilter
  readonly setTaskFilter: (next: TaskFilter) => void
  readonly filterPeople: readonly TaskFilterPerson[]
  readonly filterLabels: readonly TaskFilterLabel[]
  readonly filteringTasks: boolean
  readonly context: RowContext
  readonly actions: RowActions
  readonly facts: FolderViewerFacts | null
  readonly canCreateInFilter: boolean
  readonly sharedPageEditable: boolean
  readonly onAsk: ReturnType<typeof useConfirm>['ask']
  readonly navigate: NavigateFunction
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      <PageSection name={kind === 'doc' ? 'Doc' : 'Work'}>
        {kind === 'work' && taskFilterActive(taskFilter) ? (
          <div className="-mt-2 mb-2">
            <TaskFilterChips
              filter={taskFilter}
              onChange={setTaskFilter}
              people={filterPeople}
              labels={filterLabels}
              today={context.today}
            />
          </div>
        ) : null}
        <PageBody
          query={open}
          /* The thread ends in its own add line, which an empty page
             needs, so the generic empty state is never drawn. */
          isEmpty={false}
          emptyCopy={FOLDER_EMPTY}
          emptyIcon={FolderIcon}
          truncated={open.data?.truncated ?? false}
        >
          <Suspense fallback={null}>
            {page.data && completedReady && kind === 'work' && workView === 'calendar' ? <WorkCalendar
              folderId={id}
              tasks={[...openRows, ...completedRows]}
              filter={taskFilter}
              context={context}
              canCreate={facts !== null && mayDraw(facts, 'task.create') && canCreateInFilter}
            /> : page.data && completedReady && kind === 'work' && workView === 'board' ? <WorkBoard
              page={page.data}
              tasks={openRows}
              completed={completedRows}
              folderId={id}
              filter={taskFilter}
              context={context}
              actions={actions}
              canCreate={facts !== null && mayDraw(facts, 'task.create') && canCreateInFilter}
              canEdit={sharedPageEditable}
              group={boardGroup}
            /> : page.data && completedReady ? <FolderCanvas
              key={id}
              page={page.data}
              tasks={openRows}
              completed={completedRows}
              {...(filteringTasks ? { taskFilter } : {})}
              folderId={id}
              context={context}
              actions={actions}
              onAsk={onAsk}
              /* A Doc passes the reader's edit right: a reader who
                 cannot write there has nothing filtered to hear about. */
              arrangeable={kind === 'doc' ? sharedPageEditable : !filteringTasks}
              resultsWritable={sharedPageEditable}
              {...(kind === 'doc'
                ? {
                    presentationHeadings: true,
                    results: resultsTab(tabs)?.id === id,
                    ...(sharedPageEditable ? { onCreatePage: (made: string) => { void navigate(folderActionPath(made, 'rename')) } } : {}),
                  }
                : {})}
            /> : page.isError ? <p role="alert" className="text-sm text-muted-foreground">Could not load writing. Reload to try again.</p> : null}
          </Suspense>
        </PageBody>
      </PageSection>
    </div>
  )
}
