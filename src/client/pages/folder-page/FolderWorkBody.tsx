// A Work or Doc tab's body: the filter chips, then the calendar, board or canvas.
import { lazy, Suspense } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { NavigateFunction } from 'react-router'

const FolderCanvas = lazy(() => import('../../components/page/canvas/FolderCanvas.js'))
const WorkCalendar = lazy(() => import('../../views/WorkCalendar.js'))
import { PageSection } from '../../components/page/PageSection.js'
import { PageBody } from '../../components/page/PageStates.js'
/* `PageBody`'s `StateIcon` is typed on the raw lucide component. */
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
  facetId,
  facetPage,
  universal = false,
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
  readonly facetId: string | null
  readonly universal?: boolean
  readonly facetPage: UseQueryResult<GetPageResponse>
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
  const activePage = facetId === null ? page : facetPage
  const scoped = facetId !== null
  const taskIds = new Set(
    (activePage.data?.items ?? []).filter((item) => item.kind === 'task').map((item) => item.id),
  )
  const shownOpen = scoped ? openRows.filter((task) => taskIds.has(task.id)) : openRows
  const shownCompleted = scoped ? completedRows.filter((task) => taskIds.has(task.id)) : completedRows
  const hasTasks = universal || kind === 'work' || scoped
  return (
    <div className="space-y-2">
      <PageSection name={universal || scoped ? 'Facet' : kind === 'doc' ? 'Doc' : 'Work'}>
        {hasTasks && taskFilterActive(taskFilter) ? (
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
          /* The thread ends in its own add line, so the generic empty state never draws. */
          isEmpty={false}
          emptyCopy={FOLDER_EMPTY}
          emptyIcon={FolderIcon}
          truncated={open.data?.truncated ?? false}
        >
          <Suspense fallback={null}>
            {activePage.data && completedReady && hasTasks && workView === 'calendar' ? <WorkCalendar
              folderId={id}
              tasks={[...shownOpen, ...shownCompleted]}
              filter={taskFilter}
              context={context}
              canCreate={facts !== null && mayDraw(facts, 'task.create') && canCreateInFilter}
            /> : activePage.data && completedReady && hasTasks && workView === 'board' ? <WorkBoard
              page={activePage.data}
              tasks={shownOpen}
              completed={shownCompleted}
              folderId={id}
              filter={taskFilter}
              context={context}
              actions={actions}
              canCreate={facts !== null && mayDraw(facts, 'task.create') && canCreateInFilter}
              canEdit={sharedPageEditable}
              group={boardGroup}
            /> : activePage.data && completedReady ? <FolderCanvas
              key={`${id}:${facetId ?? 'legacy'}`}
              {...(facetId === null ? {} : { facetId })}
              page={activePage.data}
              tasks={shownOpen}
              completed={shownCompleted}
              {...(filteringTasks ? { taskFilter } : {})}
              folderId={id}
              context={context}
              actions={actions}
              onAsk={onAsk}
              /* A Doc is never filtered, so only the edit right decides. */
              arrangeable={scoped || kind === 'doc' ? sharedPageEditable : !filteringTasks}
              resultsWritable={sharedPageEditable}
              {...(sharedPageEditable ? { onCreatePage: (made: string) => { void navigate(folderActionPath(made, 'rename')) } } : {})}
              {...(kind === 'doc' && !scoped
                ? {
                    presentationHeadings: true,
                    results: resultsTab(tabs)?.id === id,
                  }
                : {})}
            /> : activePage.isError ? <p role="alert" className="text-sm text-muted-foreground">Could not load writing. Reload to try again.</p> : null}
          </Suspense>
        </PageBody>
      </PageSection>
    </div>
  )
}
