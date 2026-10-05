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

/*
The rows out of the body `GET /labels` answered.

**`truncated` is not read, and that is a fact about this path rather than an
oversight.** 10.3 caps a Folder's definitions at 250
(`FOLDER_LABEL_DEFINITION_CAP`) and the list cap at 1000, so a single folder's
vocabulary cannot reach it. A second scope on this query, or a cap raised past
1000, would make that false and would want the flag read.
*/
function labelRowsOf(
  answered: { rows: readonly LabelDefinition[] },
): readonly LabelDefinition[] {
  return answered.rows
}

/*
The workflow file: the folder's sections and paragraphs, and per task its
notes, star, repeat, reminder and step titles beside the title.

**The rows are read before the file is written.** This page lists 7.10
TaskCards, which carry `steps_done` and `steps_total` and neither the notes
nor the step titles, so writing from the cards alone could only ever write `{
title }`. `shared/workflows.ts` is where the two halves of the format sit
together. The details are read through the same query key the row cache uses,
so an already-open task costs no request.
*/
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
  /* The file is the header's page (the project root, on a tab): its work
     and writing, read here when another tab is on screen. Purpose is the
     project's Purpose tab, and only a project root has one. */
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
  /*
  The folder's own Label vocabulary, read beside the details (#227 area 4).

  **It is read rather than gathered from the tasks**, because the file
  carries the folder's *reusable* taxonomy: a category nothing currently
  wears is exactly the thing a template exists to set up, and a vocabulary
  scraped off the rows would lose it. `state` is left at the schema's default
  of active, which is the other half of the same rule — an archived Label may
  not be newly applied, so a file carrying one would ask the importer for a
  row the live endpoints refuse.

  A folder with no Folder Labels answers an empty vocabulary and the file
  that is written is byte-for-byte the one this page wrote before #227.
  */
  let tasks: TaskDetail[]
  let labels: readonly LabelDefinition[]
  let dependencies: WorkflowDependencyEdge[]
  let purposePage: PageView | undefined
  try {
    /* #207: the Folder's internal dependencies, read once beside the
       details, so the file keeps the ordering between the work it carries.
       One request for the Folder rather than one per Task; the writer
       keeps only edges whose two ends it writes. Read fresh rather than
       through the cache, because no dependency write invalidates a
       folder-level key and a stale graph would write a wrong file. */
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
  /* A download that starts silently reads as nothing happening; the toast
     says what was saved and where it went.

     **And what did not go with it (#185).** A workflow file carries writing
     and work and no bytes: a picture, a file, a sound, a video or a link to
     another folder is a row of this account, and the file records the gap
     rather than carrying it. The person who pressed Save is the only one who
     can decide whether that matters, so the count the writer answered is said
     here rather than left in the JSON for them to notice.

     The sentence names folder links as well as pictures and files: a
     `folder_ref` block is in the same count, because it names a `folders` row
     of this account exactly as an image names a `files` row. AC-823 drives
     both. */
  const missing =
    saved.omitted === 0
      ? ''
      : ` ${String(saved.omitted)} ${saved.omitted === 1 ? 'picture, file or page link is' : 'pictures, files and page links are'} not included.`
  /* And the finished work.

     The line above this function filters the page's Tasks to the pending
     ones: 7.16 carries no state and a template of finished work is not a
     template. A person who has just ticked off half a project and saved it as
     a template is owed the sentence rather than the discovery. The count is
     the writer's own `withheldTasks` rather than `[...scheduled,
     ...unscheduled].length - pending.length`, so it cannot disagree with what
     the file actually holds; 7.16 says why these are a count and not
     `omitted` placeholders. */
  const finished =
    saved.withheldTasks === 0
      ? ''
      : ` ${String(saved.withheldTasks)} completed ${saved.withheldTasks === 1 ? 'task is' : 'tasks are'} not included.`
  // What a template is, said where it is made rather than found on import.
  showToast(
    `Exported "${detail?.name ?? 'Page'}" as a template: its writing, Purpose and open tasks, without dates, people, Results or the discussion.${missing}${finished}`,
  )
}
