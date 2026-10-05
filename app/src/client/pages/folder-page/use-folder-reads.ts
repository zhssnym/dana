import { useMemo } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'

import {
  useAllPages,
  useFolder,
  useFolderOpenTasks,
  useFolderPage,
} from '../../api/queries.js'
import type { GetFolderTasksOpenResponse } from '../../../shared/views.js'
import type { GetPageResponse } from '../../../shared/pages.js'
import { projectTabs } from '../../../shared/folders.js'
import type { Folder, GetFolderResponse, GetFoldersResponse, PageKind } from '../../../shared/folders.js'

export interface FolderReads {
  readonly here: UseQueryResult<GetFolderResponse>
  readonly herePage: GetFolderResponse | undefined
  readonly kind: PageKind | null
  readonly onTab: boolean
  readonly headId: string
  readonly atProject: boolean
  readonly folder: UseQueryResult<GetFolderResponse>
  readonly folderOk: boolean
  readonly writes: boolean
  readonly open: UseQueryResult<GetFolderTasksOpenResponse>
  readonly page: UseQueryResult<GetPageResponse>
  readonly allPages: UseQueryResult<GetFoldersResponse>
  readonly tabs: Folder[]
  readonly projectName: string | undefined
}

export function useFolderReads(id: string, leaving: boolean): FolderReads {
  const here = useFolder(id, !leaving)
  const herePage = here.data
  const kind = herePage?.kind ?? null
  /* A tab's header is its project's (the root row); a sub-page's is its own. */
  const onTab = herePage !== undefined && herePage.tab_position !== null
  const headId = onTab ? herePage.project_id : id
  const atProject = herePage !== undefined && herePage.project_id === headId
  const folder = useFolder(headId, !leaving && herePage !== undefined)
  /* Everything else waits for the page, so a forbidden link is one 404, not one per read. */
  const folderOk = here.status === 'success' && !leaving
  const writes = folderOk && (kind === 'work' || kind === 'doc')
  const open = useFolderOpenTasks(id, writes)
  /* An unpicked root is read too: the picker offers Discussion only when it is empty. */
  const page = useFolderPage(id, writes || (folderOk && kind === null))
  const allPages = useAllPages(folderOk)
  const tabs = useMemo(
    () => (herePage === undefined ? [] : projectTabs(allPages.data ?? [], herePage.project_id)),
    [allPages.data, herePage],
  )
  /* On a sub-page, Share and Leave name the project they act on. */
  const projectName =
    herePage === undefined || herePage.project_id === headId
      ? undefined
      : allPages.data?.find((page) => page.id === herePage.project_id)?.name
  return { here, herePage, kind, onTab, headId, atProject, folder, folderOk, writes, open, page, allPages, tabs, projectName }
}
