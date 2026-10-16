// "Save as workflow": the project as a Dana file, downloaded.
import type { QueryClient } from '@tanstack/react-query'

import { getPlain, getView } from '../../api/http.js'
import { queryKeys } from '../../api/keys.js'
import { showToast } from '../../state/toasts.js'
import { getLabelsResponse } from '../../../shared/labels.js'
import type { LabelDefinition } from '../../../shared/labels.js'
import { getTaskResponse } from '../../../shared/tasks.js'
import type { TaskCard, TaskDetail } from '../../../shared/tasks.js'
import { folderToWorkflowFile } from '../../../shared/workflows.js'
import type { WorkflowDependencyEdge } from '../../../shared/workflows.js'
import { getFolderDependenciesResponse } from '../../../shared/task-dependencies.js'
import { getPageResponse } from '../../../shared/pages.js'
import type { PageView } from '../../../shared/pages.js'
import { getFolderTasksOpenResponse } from '../../../shared/views.js'
import { purposeTab } from '../../../shared/folders.js'
import type { Folder, GetFolderResponse } from '../../../shared/folders.js'

/* `truncated` is safe to ignore: a folder holds at most 250 labels and the list
   cap is 1000. Read it if either cap or this query's scope changes. */
function labelRowsOf(
  answered: { rows: readonly LabelDefinition[] },
): readonly LabelDefinition[] {
  return answered.rows
}

/* Cards lack notes and step titles, so each task's detail is read first,
   through the row cache's key so an open task costs no request. */
export async function saveAsWorkflow({
  detail,
  headId,
  id,
  herePage,
  tabs,
  scheduled,
  unscheduled,
  pageData,
  cache,
}: {
  readonly detail: GetFolderResponse | undefined
  readonly headId: string
  readonly id: string
  readonly herePage: GetFolderResponse | undefined
  readonly tabs: readonly Folder[]
  readonly scheduled: readonly TaskCard[]
  readonly unscheduled: readonly TaskCard[]
  readonly pageData: PageView | undefined
  readonly cache: QueryClient
}): Promise<void> {
  const folderName = detail?.name ?? 'Folder'
  /* The file is the header's page (the project root, on a tab), read here
     when another tab is on screen. Only a project root has a Purpose tab. */
  const workId = headId
  const purpose = herePage !== undefined && herePage.project_id === workId ? purposeTab(tabs) : undefined
  let workCards: typeof scheduled
  let workPage: PageView | undefined
  try {
    if (workId === id) {
      workCards = [...scheduled, ...unscheduled]
      workPage = pageData
    } else {
      const [cards, document] = await Promise.all([
        cache.fetchQuery({
          queryKey: queryKeys.folderTasks(workId, 'open'),
          queryFn: () => getView(getFolderTasksOpenResponse, `/folders/${workId}/tasks`, { section: 'open' }),
        }),
        cache.fetchQuery({
          queryKey: queryKeys.folderPage(workId),
          queryFn: () => getPlain(getPageResponse, `/folders/${workId}/page`),
        }),
      ])
      workCards = [...cards.scheduled, ...cards.unscheduled]
      workPage = document
    }
  } catch {
    showToast('Could not read this page, so nothing was exported.')
    return
  }
  const pending = workCards.filter(
    (task) => task.status === 'pending',
  )
  /* Labels are read, not gathered from tasks, so unused ones still ship.
     `state` stays active: an import may not apply an archived label. */
  let tasks: TaskDetail[]
  let labels: readonly LabelDefinition[]
  let dependencies: WorkflowDependencyEdge[]
  let purposePage: PageView | undefined
  try {
    /* Dependencies are read fresh, not cached: no dependency write invalidates
       a folder-level key, and a stale graph would write a wrong file. */
    const [details, vocabulary, waits, purposeDocument] = await Promise.all([
      Promise.all(
        pending.map((task) =>
          cache.fetchQuery({
            queryKey: queryKeys.task(task.id),
            queryFn: () => getPlain(getTaskResponse, `/tasks/${task.id}`),
          }),
        ),
      ),
      cache.fetchQuery({
        queryKey: queryKeys.folderLabels(workId),
        queryFn: () =>
          getPlain(
            getLabelsResponse,
            `/labels?scope=folder&folder_id=${encodeURIComponent(workId)}`,
          ),
      }),
      getPlain(
        getFolderDependenciesResponse,
        `/folders/${encodeURIComponent(workId)}/dependencies`,
      ),
      purpose === undefined
        ? Promise.resolve(undefined)
        : cache.fetchQuery({
            queryKey: queryKeys.folderPage(purpose.id),
            queryFn: () => getPlain(getPageResponse, `/folders/${purpose.id}/page`),
          }),
    ])
    tasks = details
    labels = labelRowsOf(vocabulary)
    dependencies = waits.dependencies
    purposePage = purposeDocument
  } catch {
    showToast('Could not read this page, so nothing was exported.')
    return
  }
  const saved = folderToWorkflowFile(
    folderName,
    tasks,
    workPage?.blocks ?? [],
    workPage,
    labels,
    purpose === undefined || purposePage === undefined
      ? undefined
      : { display_name: purpose.name, page: purposePage },
    dependencies,
  )
  const file = JSON.stringify(saved.file, null, 2)
  const blob = new Blob([file], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${detail?.name ?? 'page'}.dana.json`
  anchor.click()
  URL.revokeObjectURL(url)
  /* The file carries no bytes or folder links, so the toast counts what was left out. */
  const missing =
    saved.omitted === 0
      ? ''
      : ` ${String(saved.omitted)} ${saved.omitted === 1 ? 'media item, page link or synced block is' : 'media items, page links and synced blocks are'} not included.`
  /* Uses the writer's own count, so it cannot disagree with the file. */
  const finished =
    saved.withheldTasks === 0
      ? ''
      : ` ${String(saved.withheldTasks)} completed ${saved.withheldTasks === 1 ? 'task is' : 'tasks are'} not included.`
  showToast(
    `Exported "${detail?.name ?? 'Page'}" as a template: its writing, Purpose and open tasks, without dates, people, Results or the discussion.${missing}${finished}`,
  )
}
