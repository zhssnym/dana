// The folder page's acts: delete, archive, leave, and its tab row's changes.
import type { NavigateFunction } from 'react-router'
import type { QueryClient } from '@tanstack/react-query'

import { queryKeys } from '../../api/keys.js'
import { paths } from '../../routes.js'
import { pushUndo, undoLabel } from '../../shell/undo.js'
import type { useConfirm } from '../task-rows.js'
import { saveAsWorkflow as writeWorkflow } from './save-as-workflow.js'
import type { FolderMutations } from './use-folder-mutations.js'
import type { PageView } from '../../../shared/pages.js'
import type { TaskCard } from '../../../shared/tasks.js'
import type { Folder, GetFolderResponse, GetFoldersResponse, PageKind } from '../../../shared/folders.js'

/**
 * 9.6's leave confirm, verbatim and one sentence (AC-183 turns on both).
 */
function leaveFolderConfirm(name: string): string {
  return (
    `Leave ${name}? You lose access to it, and anything in it assigned to ` +
    'you becomes unassigned.'
  )
}

export interface FolderActs {
  readonly doDelete: () => void
  readonly doArchive: () => void
  readonly addTab: (tabKind: PageKind) => void
  readonly renameTab: (tab: Folder, name: string) => void
  readonly removeTab: (tab: Folder) => void
  readonly reorderTabs: (dragged: Folder, ordered: readonly Folder[]) => void
  readonly askLeave: () => void
  readonly saveAsWorkflow: () => Promise<void>
}

export function folderActs({
  id,
  headId,
  detail,
  herePage,
  tabs,
  projectName,
  scheduled,
  unscheduled,
  pageData,
  cache,
  navigate,
  setLeftId,
  selectTab,
  confirm,
  mutations,
}: {
  readonly id: string
  readonly headId: string
  readonly detail: GetFolderResponse | undefined
  readonly herePage: GetFolderResponse | undefined
  readonly tabs: readonly Folder[]
  readonly projectName: string | undefined
  readonly scheduled: readonly TaskCard[]
  readonly unscheduled: readonly TaskCard[]
  readonly pageData: PageView | undefined
  readonly cache: QueryClient
  readonly navigate: NavigateFunction
  readonly setLeftId: (id: string) => void
  readonly selectTab: (tab: Folder) => void
  readonly confirm: ReturnType<typeof useConfirm>
  readonly mutations: FolderMutations
}): FolderActs {
  const { remove, restore, archive, restoreArchived, patch, leave, createTab, moveTab } = mutations
  function doDelete(): void {
    /* 9.6: to Trash for every member at once, the undo bar, no
       confirmation, an owner with other members included (Hassan: delete
       never asks; M2 retired AC-283's question). Handing the page on first
       stays in the "…" as Transfer ownership. The inverse is 7.13's restore. */
    const name = detail?.name ?? ''
    setLeftId(id)
    /* Leave first: the delete's invalidation would otherwise refetch every
       read of this page against a folder that now answers 404. The promise
       outlives this page, which a mutate() callback would not; a failure is
       the mutation cache's toast. */
    // Lands on the page it sat in, as in Notion; a top-level page on Today.
    const parent = detail?.parent_folder_id
    navigate(parent ? paths.folder(parent) : paths.today)
    remove.mutateAsync(headId).then(
      () => {
        pushUndo(undoLabel('Deleted', name), () => {
          restore.mutate(headId)
        })
      },
      () => {},
    )
  }

  function doArchive(): void {
    const parent = detail?.parent_folder_id
    setLeftId(id)
    navigate(parent ? paths.folder(parent) : paths.today)
    archive.mutateAsync(headId).then(
      () => pushUndo('Work archived', () => { restoreArchived.mutate(headId) }),
      () => {},
    )
  }

  /* The tab row's "+": a tab of that kind after the last, then go to it. */
  function addTab(tabKind: PageKind): void {
    const had = new Set(tabs.map((tab) => tab.id))
    createTab.mutate({ folderId: id, kind: tabKind }, {
      onSuccess: (answer) => {
        const made = answer.find((tab) => !had.has(tab.id))
        if (made !== undefined) selectTab(made)
      },
    })
  }

  function renameTab(tab: Folder, name: string): void {
    patch.mutate({ id: tab.id, body: { name } })
  }

  /* Like every delete: to Trash at once, with Undo. Leaving the tab on
     screen goes to the project first, so nothing reads it after it is gone. */
  function removeTab(tab: Folder): void {
    if (tab.id === id) {
      setLeftId(id)
      void navigate(paths.folder(tab.project_id), { replace: true })
    }
    remove.mutateAsync(tab.id).then(
      () => {
        pushUndo(undoLabel('Deleted', tab.name), () => {
          restore.mutate(tab.id)
        })
      },
      () => {},
    )
  }

  function reorderTabs(dragged: Folder, ordered: readonly Folder[]): void {
    /* The row takes its new order at once: each tab of the project keyed in
       the dropped order. The refetch after the move replaces it. */
    const key = queryKeys.allPages()
    const previous = cache.getQueryData<GetFoldersResponse>(key)
    if (previous !== undefined) {
      const rank = new Map(ordered.map((tab, index) => [tab.id, `b${String(index).padStart(3, '0')}`]))
      cache.setQueryData<GetFoldersResponse>(
        key,
        previous.map((page) => {
          const position = rank.get(page.id)
          return position === undefined ? page : { ...page, tab_position: position }
        }),
      )
    }
    const at = ordered.findIndex((tab) => tab.id === dragged.id)
    moveTab.mutate(
      { id: dragged.id, body: { parent_folder_id: null, after_id: at > 0 ? ordered[at - 1]!.id : null } },
      {
        onError: () => {
          if (previous !== undefined) cache.setQueryData(key, previous)
        },
      },
    )
  }

  function askLeave(): void {
    confirm.ask(leaveFolderConfirm(projectName ?? detail?.name ?? ''), () => {
      leave.mutate(headId, { onSuccess: () => navigate(paths.today) })
    })
  }

  function saveAsWorkflow(): Promise<void> {
    return writeWorkflow({ detail, headId, id, herePage, tabs, scheduled, unscheduled, pageData, cache })
  }

  return { doDelete, doArchive, addTab, renameTab, removeTab, reorderTabs, askLeave, saveAsWorkflow }
}
