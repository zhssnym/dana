/*
 * A project page (spec 9.6): header, tab row and the tab's body, drawn by the page's kind. A tab's header is
 * the project root's; a sub-page draws its own header and no tab row. Gates come from
 * `lib/folder-authority.ts`, the same table the routes use.
 */
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, useLocation, useNavigate, useNavigationType, useParams, useSearchParams } from 'react-router'

import {
  useCreateTab,
  useDeleteFolder,
  useLeaveFolder,
  useDuplicateFolder,
  useMoveFolder,
  useRenameFolder,
  useRestoreFolder,
  useTransferOwnership,
} from '../api/mutations.js'
import { useArchiveFolder, useRestoreArchivedFolder } from '../api/archive.js'
import {
  mergeCompletedDays,
  useAllPages,
  useConnections,
  useFolder,
  useFolderCompletedTasks,
  useFolderOpenTasks,
  useFolderPage,
} from '../api/queries.js'
import { getPlain, getView } from '../api/http.js'
import { queryKeys } from '../api/keys.js'
import { showToast } from '../state/toasts.js'
const FolderCanvas = lazy(() => import('../components/page/canvas/FolderCanvas.js'))
const WorkCalendar = lazy(() => import('../views/WorkCalendar.js'))
import { PageCover } from '../components/page-cover.js'
import { usePageHasCover } from '../components/page-head.js'
import { FolderCoverDialog, FolderHeader } from '../components/folder-head.js'
import { markIcon } from '../components/page/icon-manifest.js'
import { FOLDER_PREFIX } from '../lib/page-identity.js'
import { IDENTITY_COLOR_FALLBACK } from '../parts/identity-colors.js'
import { ConsultationPanel } from '../components/consultation/ConsultationPanel.js'
import { HistorySheet } from '../components/history-sheet.js'
import { ObjectMenu } from '../components/object-menu.js'
import { Button } from '../components/ui/button.js'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.js'
/* `PageBody`'s `StateIcon` is typed on the raw lucide component. */
import { Folder as FolderIcon, MessagesSquare, UsersRound } from '../lib/icons.js'

import type { RowContext } from '../parts/presenters.js'
import { useRowActions } from '../parts/useRowActions.js'
import { folderLink } from '../lib/nav-links.js'
import {
  eligibleSuccessors,
  folderGates,
  mayDraw,
  otherMembers,
  viewerFacts,
} from '../lib/folder-authority.js'
import { mayPerform, ruleFor } from '../../shared/folder-actions.js'
/* Aliased: `shell/app-sidebar.tsx` exports a different `FolderAction`. */
import type { FolderAction as FolderActionName } from '../../shared/folder-actions.js'
import { paths } from '../routes.js'
import { FOLDER_ACTION_PARAM, folderActionPath } from '../shell/app-sidebar.js'
import { copyLink } from '../lib/object-acts.js'
import { closeChatDock, openChatDock, useChatDock } from '../state/chat-dock.js'
import { useTeamPanelState } from '../state/collaboration.js'
import { useDiscussions } from '../api/consultation.js'
import { isUnread } from '../components/consultation/DiscussionList.js'
import { pushUndo, undoLabel } from '../shell/undo.js'
import { AddTabMenu, FolderTabs } from '../components/folder-tabs.js'
import { ProjectPicker } from '../components/project-picker.js'
import { PageSection } from '../components/page/PageSection.js'
import { PageBody } from '../components/page/PageStates.js'
import { FOLDER_EMPTY } from './empty-states.js'
import { FolderSharingPanel, MEMBER_PARAM } from './FolderSharingPanel.js'
import { PersonFace } from '../components/person-face.js'
import { cn } from '../components/ui/utils.js'
import { ConfirmDialog, useConfirm, useRowBasis } from './task-rows.js'
import { TaskFilterChips, TaskFilterControl } from '../views/TaskFilterControl.js'
import { taskFilterActive } from '../views/filter.js'
import { useLabels } from '../api/labels.js'
import { useTaskFilter } from '../views/filter-store.js'
import { useCurrentWorkView } from '../views/work-view.js'
import { BoardGroupControl, WorkBoard } from '../views/WorkBoard.js'
import type { WorkGroup } from '../views/WorkBoard.js'
import { getLabelsResponse } from '../../shared/labels.js'
import type { LabelDefinition } from '../../shared/labels.js'
import { getTaskResponse } from '../../shared/tasks.js'
import type { TaskDetail } from '../../shared/tasks.js'
import { folderToWorkflowFile } from '../../shared/workflows.js'
import type { WorkflowDependencyEdge } from '../../shared/workflows.js'
import { getFolderDependenciesResponse } from '../../shared/task-dependencies.js'
import { getPageResponse } from '../../shared/pages.js'
import type { PageView } from '../../shared/pages.js'
import { getFolderTasksOpenResponse } from '../../shared/views.js'
import { projectTabs, purposeTab, resultsTab } from '../../shared/folders.js'
import type { Folder, GetFoldersResponse, PageKind } from '../../shared/folders.js'

/** Spec 9.6's leave confirm, one sentence (AC-183). */
function leaveFolderConfirm(name: string): string {
  return (
    `Leave ${name}? You lose access to it, and anything in it assigned to ` +
    'you becomes unassigned.'
  )
}

/* Retired storage keys, never to be reused: `dana.folder.show-completed` (see also `views/view-mode.ts`). */

/*
 * Where the thread was when a task was opened from it, so Back lands there. The shell's scroll region outlives
 * the route, so the browser restores nothing. Read only on a POP to that entry.
 */
const threadScroll = new Map<
  string,
  { readonly top: number; readonly taskId: string; readonly entry: string }
>()
const TASK_PATH = '/app/tasks/'

function useThreadScroll(folderId: string, ready: boolean): void {
  const navigationType = useNavigationType()
  const { key } = useLocation()
  const restoredFor = useRef<string | null>(null)
  /*
   * A layout effect: its cleanup runs before the thread leaves the DOM; a passive one would read a clamped
   * scroll. At unmount the address is already the next one.
   */
  useLayoutEffect(() => {
    const scroller = document.querySelector<HTMLElement>('[data-shell-scroll]')
    return () => {
      /* Only a task opened from the thread counts; a remount on this page must not overwrite the kept place. */
      const next = window.location.pathname
      if (scroller === null || !next.startsWith(TASK_PATH)) return
      threadScroll.set(folderId, {
        top: scroller.scrollTop,
        taskId: decodeURIComponent(next.slice(TASK_PATH.length)),
        entry: key,
      })
    }
  }, [folderId, key])
  useEffect(() => {
    if (!ready || navigationType !== 'POP' || restoredFor.current === key) return
    const saved = threadScroll.get(folderId)
    const scroller = document.querySelector<HTMLElement>('[data-shell-scroll]')
    /* Keyed to the history entry, so Back into a newer visit does not replay an old position. */
    if (saved === undefined || saved.entry !== key || scroller === null) return
    /* The canvas lays out after its data arrives: retry until the position fits, for about two seconds. */
    let frames = 0
    let handle = 0
    const settle = (): void => {
      frames += 1
      const task = document.querySelector(`[data-canvas-task-id="${CSS.escape(saved.taskId)}"]`)
      const fits = scroller.scrollHeight - scroller.clientHeight >= saved.top
      if ((!fits || task === null) && frames < 120) {
        handle = requestAnimationFrame(settle)
        return
      }
      /* Marked done only here, so an effect cancelled mid-wait tries again. */
      restoredFor.current = key
      /* Used once: a later Back keeps wherever the reader scrolled since. */
      threadScroll.delete(folderId)
      scroller.scrollTop = saved.top
      task?.scrollIntoView({ block: 'nearest' })
    }
    handle = requestAnimationFrame(settle)
    return () => cancelAnimationFrame(handle)
  }, [folderId, ready, key, navigationType])
}

/* `truncated` is not read: the 250 definition cap per folder is below the 1000 list cap. */
function labelRowsOf(
  answered: { rows: readonly LabelDefinition[] },
): readonly LabelDefinition[] {
  return answered.rows
}

/** `folderId` overrides the route param, for Desk at /app (the installed app's start_url). */
export function FolderPage({
  folderId,
}: {
  readonly folderId?: string
} = {}): React.JSX.Element {
  const [search] = useSearchParams()
  /* An old Linear `?issue=<task id>` address goes to the task page, before any read starts. */
  const issueId = search.get('issue') ?? ''
  if (issueId !== '') return <Navigate to={paths.task(encodeURIComponent(issueId))} replace />
  /* An old `?facet=<id>` address goes to that tab's page (0061 gave each tab its facet's id). */
  const facetId = search.get('facet') ?? ''
  if (facetId !== '') return <FacetAddress facetId={facetId} />
  return <FolderPageBody folderId={folderId} />
}

function FacetAddress({ facetId }: { readonly facetId: string }): React.JSX.Element | null {
  const pages = useAllPages()
  const { pathname } = useLocation()
  const [search] = useSearchParams()
  if (pages.data === undefined && !pages.isError) return null
  const rest = new URLSearchParams(search)
  rest.delete('facet')
  const query = rest.size === 0 ? '' : `?${rest.toString()}`
  const found = pages.data?.some((page) => page.id === facetId) === true
  return <Navigate replace to={`${found ? paths.folder(facetId) : pathname}${query}`} />
}

function FolderPageBody({
  folderId,
}: {
  readonly folderId?: string
}): React.JSX.Element {
  const { id: routeId = '' } = useParams<{ id: string }>()
  const id = folderId ?? routeId
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  /*
   * The page being left (deleted). Keyed by id, because a delete lands on the parent page, which this component
   * draws without remounting. Its reads stop so nothing refetches a 404.
   */
  const [leftId, setLeftId] = useState<string | null>(null)
  const leaving = leftId === id
  const here = useFolder(id, !leaving)
  const herePage = here.data
  const kind = herePage?.kind ?? null
  /* A tab's header is its project's (the root row); a sub-page's is its own. */
  const onTab = herePage !== undefined && herePage.tab_position !== null
  const headId = onTab ? herePage.project_id : id
  const atProject = herePage !== undefined && herePage.project_id === headId
  const folder = useFolder(headId, !leaving && herePage !== undefined)
  /* Everything else waits for the page itself, so a forbidden link is one 404, not one per read. */
  const folderOk = here.status === 'success' && !leaving
  const writes = folderOk && (kind === 'work' || kind === 'doc')
  const open = useFolderOpenTasks(id, writes)
  /* An unpicked root is read too: the picker offers Discussion only on an empty page. */
  const page = useFolderPage(id, writes || (folderOk && kind === null))
  const allPages = useAllPages(folderOk)
  const tabs = useMemo(
    () => (herePage === undefined ? [] : projectTabs(allPages.data ?? [], herePage.project_id)),
    [allPages.data, herePage],
  )
  /* People belong to the project, so on a sub-page Share and Leave name the project. */
  const projectName =
    herePage === undefined || herePage.project_id === headId
      ? undefined
      : allPages.data?.find((page) => page.id === herePage.project_id)?.name
  /* "Save as workflow" reads each row's detail through the cache. */
  const cache = useQueryClient()
  const basis = useRowBasis()
  const [taskFilter, setTaskFilter] = useTaskFilter(id)
  const labelDefinitions = useLabels(id, 'all', folderOk && kind === 'work')
  const [workView] = useCurrentWorkView()
  const [boardGroup, setBoardGroup] = useState<WorkGroup>('section')
  const actions = useRowActions()
  const confirm = useConfirm()
  const remove = useDeleteFolder()
  const restore = useRestoreFolder()
  const archive = useArchiveFolder()
  const restoreArchived = useRestoreArchivedFolder()
  const patch = useRenameFolder()
  const leave = useLeaveFolder()
  const transfer = useTransferOwnership()
  const createTab = useCreateTab()
  const moveTab = useMoveFolder()
  const duplicate = useDuplicateFolder()
  const [sharing, setSharing] = useTeamPanelState(headId)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  /* The member picked in the transfer dialog; nothing moves until its button. */
  const [transferTo, setTransferTo] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [coverOpen, setCoverOpen] = useState(false)

  const connections = useConnections()
  /* The Discussion sidebar shares the right edge with the sharing panel, so opening one closes the other. */
  const dock = useChatDock()
  const dockOpen = dock !== null
  const threads = useDiscussions(headId, 'all', '')
  const threadRows = threads.data?.pages.flatMap((batch) => batch.discussions) ?? []
  const unreadThreads = threadRows.some((discussion) => discussion.state === 'open' && isUnread(discussion, basis.viewerId))
  useEffect(() => {
    if (sharing) closeChatDock()
  }, [sharing])

  const detail = folder.data
  const scheduled = open.data?.scheduled ?? []
  const unscheduled = open.data?.unscheduled ?? []
  /* The page's composed order (GET /page `items`), not Q7's arrays. Rows not yet composed follow in Q7's order. */
  const openRows = useMemo(() => {
    const rows = [...scheduled, ...unscheduled]
    const items = page.data?.items
    if (items === undefined) return rows
    const rank = new Map<string, number>()
    for (const item of items) if (item.kind === 'task') rank.set(item.id, rank.size)
    return rows
      .map((row, index) => ({ row, index, placed: rank.get(row.id) ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => a.placed - b.placed || a.index - b.index)
      .map((entry) => entry.row)
  }, [scheduled, unscheduled, page.data?.items])

  /* Thread and Freeform always read finished tasks; Freeform follows the cursor. */
  const completed = useFolderCompletedTasks(id, writes)
  useEffect(() => {
    // Freeform needs every placed finished Task to fill its Section disclosures.
    if (kind === 'work' && workView === 'freeform' && completed.hasNextPage && !completed.isFetchingNextPage) void completed.fetchNextPage()
  }, [kind, workView, completed.hasNextPage, completed.isFetchingNextPage, completed.fetchNextPage])
  /* The canvas waits for them, so no finished placement is read by id meanwhile. */
  const completedReady = completed.data !== undefined || completed.isError
  const completedDays = mergeCompletedDays(completed.data?.pages)
  const completedRows = useMemo(() => completedDays.flatMap((day) => day.rows), [completedDays])
  const filterRows = useMemo(() => [...openRows, ...completedRows], [openRows, completedRows])
  const context: RowContext = {
    ...basis,
    showFolder: false,
    starTooltip: actions.starTooltipMode,
  }

  /* A folder's cover is shared by every member (`cover_file_id`); a place page's is per viewer. */
  const coverKey = `${FOLDER_PREFIX}${headId}`
  /* Off once trashed: the cover read is a folder read too. */
  const hasCover = usePageHasCover(leaving ? '' : coverKey)

  const isDefault = detail?.is_default ?? false
  const members = detail?.members ?? []
  const filterPeople = useMemo(() => {
    const people = new Map<string, string>()
    for (const member of members) {
      people.set(member.user.id, member.user.display_name ?? 'Deleted user')
    }
    for (const task of filterRows) {
      if (task.assignee !== null && !people.has(task.assignee.id)) {
        people.set(task.assignee.id, task.assignee.display_name ?? 'Deleted user')
      }
    }
    return [...people].map(([personId, name]) => ({ id: personId, name }))
  }, [members, filterRows])
  const filterLabels = labelDefinitions.data?.rows.map((label) => ({
    id: label.id, name: label.name, color: label.color, archived: label.archived,
  })) ?? []
  const filteringTasks = kind === 'work' && taskFilterActive(taskFilter)
  /*
   * Every gate reads Access, not ownership. `gates` is null until the folder and roster arrive, because the
   * viewer's preset is their membership row.
   */
  const facts = viewerFacts(detail, members, basis.viewerId)
  const gates = facts === null ? null : folderGates(facts)
  const filteredLabel = labelDefinitions.data?.rows.find((label) => label.id === taskFilter.label)
  const canCreateInFilter = taskFilter.label === null ||
    (filteredLabel?.archived === false && (filteredLabel.scope === 'personal' || gates?.applyLabel === true))
  /* The Desk's row is drawn even with Work alone, so "+" can add a Doc back (spec 9.14). */
  const shownTabs = onTab ? tabs : []
  const discussionTab = tabs.find((tab) => tab.kind === 'discussion')
  /*
   * A thread address (`?discussion=` or `?conversation=open`) moves to the project's Discussion tab if it has
   * one; otherwise the thread is drawn here. Never on Desk.
   */
  const threadAsked =
    search.get('discussion') !== null || (search.get('conversation') === 'open' && !isDefault)
  const moveThreadTo =
    threadAsked && kind !== 'discussion' && discussionTab !== undefined && discussionTab.id !== id
      ? discussionTab.id
      : null
  useEffect(() => {
    if (moveThreadTo === null) return
    const next = new URLSearchParams(search)
    next.delete('conversation')
    const query = next.size === 0 ? '' : `?${next.toString()}`
    void navigate(`${paths.folder(moveThreadTo)}${query}`, { replace: true })
  }, [moveThreadTo, search, navigate])
  const threadHere = kind === 'discussion' || (threadAsked && moveThreadTo === null)
  useThreadScroll(id, kind === 'work' && page.data !== undefined && completedReady)

  /* A tab is its own page; choose it in place so Back leaves the project instead of stepping through tabs. */
  const selectTab = useCallback((tab: Folder): void => {
    void navigate(paths.folder(tab.id), { replace: true })
  }, [navigate])

  /* Drops one parameter in place: a stale ?member= would reopen that member later. */
  const dropParam = useCallback((name: string): void => {
    setSearch((current) => {
      if (!current.has(name)) return current
      const next = new URLSearchParams(current)
      next.delete(name)
      return next
    }, { replace: true })
  }, [setSearch])

  /* May edit the project's pages; asked of the header's folder (the project root on a tab). */
  const sharedPageEditable =
    facts !== null &&
    basis.viewerId !== null &&
    detail !== undefined &&
    mayPerform({
      folderId: headId,
      actorId: basis.viewerId,
      access: facts.access,
      isOwner: facts.isOwner,
      isDefault: facts.isDefault,
      name: detail.name,
    }, 'folder.page.edit').allowed
  const tabsEditable = sharedPageEditable && !isDefault
  /* Ownership passes only to a member who currently holds Full control; the server refuses anyone else (422). */
  const successors = eligibleSuccessors(members, basis.viewerId)
  /* The pick while it still qualifies, or the only candidate. A pick that lost Full control selects nothing. */
  const heir =
    transferTo === null
      ? successors.length === 1
        ? successors[0]
        : undefined
      : successors.find((member) => member.user.id === transferTo)
  /* Everybody else in the folder, which is not the same as who may inherit it. */
  const others = otherMembers(members, basis.viewerId)

  /**
   * A comment author off the members already read; an unknown face is "Someone", never an id. 7.14 sends only
   * the author id, so this is the only route an avatar has onto the thread.
   */
  const authorPeople = useMemo(() => {
    const people = new Map<string, { name: string; image?: string }>()
    for (const member of members) {
      const name = member.user.display_name
      if (name === null) continue
      const image = member.user.avatar_url
      people.set(member.user.id, { name, ...(image === null ? {} : { image }) })
    }
    for (const connection of connections.data ?? []) {
      const name = connection.user.display_name
      if (name === null || people.has(connection.user.id)) continue
      const image = connection.user.avatar_url
      people.set(connection.user.id, { name, ...(image === null ? {} : { image }) })
    }
    return people
  }, [members, connections.data])

  function doDelete(): void {
    /* Delete never asks: to Trash for every member at once, with the undo bar. */
    const name = detail?.name ?? ''
    setLeftId(id)
    /*
     * Navigate first: the delete's invalidation would refetch this page's reads against a 404. `mutateAsync`
     * outlives this page, which a mutate() callback would not.
     */
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

  /* To Trash with Undo. Leaving the tab first stops anything from reading it once gone. */
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
    /* Apply the dropped order at once; the refetch after the move replaces it. */
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

  /*
   * Reads each task's detail first: cards lack notes and step titles. The same query key, so open tasks cost
   * nothing.
   */
  async function saveAsWorkflow(): Promise<void> {
    const folderName = detail?.name ?? 'Folder'
    /* The file is the header's page (the project root, on a tab). Only a project root has a Purpose tab. */
    const workId = headId
    const purpose = herePage !== undefined && herePage.project_id === workId ? purposeTab(tabs) : undefined
    let workCards: typeof scheduled
    let workPage: PageView | undefined
    try {
      if (workId === id) {
        workCards = [...scheduled, ...unscheduled]
        workPage = page.data
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
     * Read the folder's label vocabulary rather than scraping tasks: a template keeps labels nothing wears yet.
     * Active labels only; the importer would refuse archived ones.
     */
    let tasks: TaskDetail[]
    let labels: readonly LabelDefinition[]
    let dependencies: WorkflowDependencyEdge[]
    let purposePage: PageView | undefined
    try {
      /* Read fresh, not from the cache: no dependency write invalidates a folder-level key. */
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
    /* Say what was saved, and what the file could not carry: pictures, files and folder links (AC-823). */
    const missing =
      saved.omitted === 0
        ? ''
        : ` ${String(saved.omitted)} ${saved.omitted === 1 ? 'picture, file or page link is' : 'pictures, files and page links are'} not included.`
    /*
     * The file keeps only pending tasks, so say how many finished ones were left out (the writer's
     * `withheldTasks`).
     */
    const finished =
      saved.withheldTasks === 0
        ? ''
        : ` ${String(saved.withheldTasks)} completed ${saved.withheldTasks === 1 ? 'task is' : 'tasks are'} not included.`
    showToast(
      `Exported "${detail?.name ?? 'Page'}" as a template: its writing, Purpose and open tasks, without dates, people, Results or the discussion.${missing}${finished}`,
    )
  }

  /*
   * An act the Library asked for with `?folder-action=`: it needs this page's dialogs and undo bar. Runs once,
   * after `detail` arrives, and drops the query with `replace` so reload or Back does not repeat it.
   */
  const ranAction = useRef(false)
  useEffect(() => {
    const action = search.get(FOLDER_ACTION_PARAM)
    /* The page is not remounted between folders, so re-arm once the address has dropped the act. */
    if (action === null) {
      ranAction.current = false
      return
    }
    if (ranAction.current) return
    if (detail === undefined) return
    /* Wait for the roster too: three acts are gated on the viewer's preset. */
    if (gates === null) return
    ranAction.current = true
    /*
     * Known: this reads React Router's lagging search, so a run in that window can restore dropped params. No
     * real sequence reaches it; a fix must also use `window.location.pathname`, as `PlaceChrome.changeFilter`
     * does.
     */
    setSearch(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete(FOLDER_ACTION_PARAM)
        return next
      },
      { replace: true },
    )
    /*
     * A refused link says why, with the route's own sentence (`ruleFor(...).why`): the URL may be stale or
     * pasted.
     */
    const refuse = (act: FolderActionName): void => {
      showToast(ruleFor(act).why)
    }
    if (action === 'rename') {
      if (gates?.identity === true) setRenaming(true)
      else refuse('folder.profile.edit')
    } else if (action === 'cover') {
      if (gates?.identity === true) setCoverOpen(true)
      else refuse('folder.profile.edit')
    } else if (action === 'history') setHistoryOpen(true)
    /* Leave asks anyway: its refusals are state rules whose 409 sentence the mutation cache already shows. */
    else if (action === 'leave') askLeave()
    else if (action === 'archive') {
      if (gates?.trash === true) doArchive()
      else refuse('folder.trash')
    }
    else if (action === 'delete') {
      if (gates?.trash === true) doDelete()
      else refuse('folder.trash')
    }
  })

  /* A comment author for the thread, stable so the mapping memoises. Unknown faces are "Someone". */
  const personOf = useCallback(
    (authorId: string) => authorPeople.get(authorId) ?? { name: 'Someone' },
    [authorPeople],
  )

  const headerActions = (
    <>
      {/* With one tab the row is not drawn, so its "+" sits here. */}
      {shownTabs.length === 1 && tabsEditable && kind !== null && kind !== 'work' ? (
        <AddTabMenu tabs={shownTabs} onAdd={addTab} />
      ) : null}
      {/* Shown once the project has a teammate, and kept while any thread exists. */}
      {isDefault || kind === 'discussion' || (members.length <= 1 && threadRows.length === 0) ? null : (
        <Button
          variant="ghost"
          aria-pressed={dockOpen}
          className={cn('text-muted-foreground', dockOpen && 'bg-hover text-foreground')}
          onClick={() => {
            if (dockOpen) {
              closeChatDock()
              return
            }
            setSharing(false)
            openChatDock({ folderId: headId })
          }}
        >
          <MessagesSquare className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Discussion
          {unreadThreads && !dockOpen ? (
            <span className="size-1.5 rounded-full bg-primary">
              <span className="sr-only">New messages</span>
            </span>
          ) : null}
        </Button>
      )}
      {isDefault ? null : (
        <Button
          variant="ghost"
          aria-expanded={sharing}
          className="text-muted-foreground"
          onClick={() => {
            setSharing(!sharing)
            dropParam(MEMBER_PARAM)
          }}
        >
          <UsersRound className="size-4" strokeWidth={1.75} aria-hidden="true" />
          {members.length <= 1 ? 'Add teammates' : 'Team'}
        </Button>
      )}
      {/* The page's one "…" (`lib/object-acts.ts`). No Rename: the title renames in place. */}
      <ObjectMenu
        kind={atProject ? 'project' : 'folder'}
        name={detail?.name ?? ''}
        align="end"
        handlers={{
          history: () => {
            setHistoryOpen(true)
          },
          'copy-link': () => {
            copyLink(folderLink(id))
          },
          duplicate: () => {
            /* The copy is the duplicator's own private folder; going there is the feedback. */
            duplicate.mutate(headId, {
              onSuccess: (made) => {
                navigate(paths.folder(made.id))
              },
            })
          },
          export: atProject && !isDefault ? () => void saveAsWorkflow() : undefined,
          archive: gates?.trash === true ? doArchive : undefined,
          /* Refused to the owner until they transfer, and to the last Full-control member. */
          leave: gates?.leave === true ? askLeave : undefined,
          /* Full control's, which custody does not confer (AC-015). */
          delete: gates?.trash === true ? doDelete : undefined,
        }}
      />
    </>
  )

  /* Trashed: nothing stays mounted to read the page again while navigation commits. */
  if (leaving) return <div />

  return (
    <div className="space-y-6">
      {/* A page the viewer cannot see renders as nonexistent, never forbidden (spec 10.2). */}
      <PageBody query={here} isEmpty={false} emptyCopy="">
        {/* A focused Discussion has its own head; the identity and tabs step aside. */}
        <div className={threadHere ? 'hidden' : 'space-y-4'}>
          {hasCover && !isDefault ? (
            <div className="-mt-4 md:-mt-6">
              {/* Below Can edit, the band is read-only (AC-011, AC-193). */}
              <PageCover storageName={coverKey} readOnly={gates?.identity !== true} />
            </div>
          ) : null}
          <PageSection name="Page header">
            <FolderHeader
              name={detail?.name ?? ''}
              icon={markIcon(detail?.icon ?? null)}
              color={detail?.color ?? IDENTITY_COLOR_FALLBACK}
              iconKey={detail?.icon ?? null}
              colorKey={detail?.color ?? null}
              editable={gates?.identity === true}
              renaming={renaming}
              onRenamingChange={setRenaming}
              onRename={(name) => {
                patch.mutate({ id: headId, body: { name } })
              }}
              onPickIdentity={(next) => {
                patch.mutate({ id: headId, body: next })
              }}
              onRemoveIcon={() => {
                patch.mutate({ id: headId, body: { icon: null } })
              }}
              actions={headerActions}
              /* Covers are for projects; the Desk is not one. */
              coverKey={isDefault ? undefined : coverKey}
            />
          </PageSection>

          {allPages.isError && onTab ? (
            <p role="alert" className="text-sm text-muted-foreground">
              Could not load this page’s tabs. Reload to try again.
            </p>
          ) : (
            <FolderTabs
              tabs={shownTabs}
              activeId={id}
              onSelect={selectTab}
              editable={tabsEditable}
              onReorder={reorderTabs}
              onAdd={addTab}
              onRename={renameTab}
              onDelete={removeTab}
              tools={kind === 'work' ? (
                <div className="flex items-center gap-1">
                  <TaskFilterControl
                    filter={taskFilter}
                    onChange={setTaskFilter}
                    people={filterPeople}
                    labels={filterLabels}
                    today={context.today}
                  />
                  {workView === 'board' ? <BoardGroupControl group={boardGroup} onChange={setBoardGroup} /> : null}
                </div>
              ) : undefined}
            />
          )}
        </div>

        {herePage === undefined ? null : kind === null ? (
          <ProjectPicker
            editable={tabsEditable}
            pending={createTab.isPending}
            discussion={page.data !== undefined && page.data.blocks.length === 0 && page.data.items.length === 0}
            onPick={(pick) => {
              createTab.mutate({ folderId: id, kind: pick })
            }}
          />
        ) : threadHere ? (
          <ConsultationPanel
            folderId={id}
            viewer={facts === null || basis.viewerId === null ? null : { viewerId: basis.viewerId, facts }}
            personOf={personOf}
          />
        ) : (
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
                /* The thread ends in its own add line, so the generic empty state is never drawn. */
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
                    onAsk={confirm.ask}
                    /*
                     * A Doc passes the reader's edit right: a reader who cannot write has nothing filtered to
                     * hear about.
                     */
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
        )}
      </PageBody>

      <FolderCoverDialog storageName={coverKey} open={coverOpen} onOpenChange={setCoverOpen} />

      {sharing && detail !== undefined ? (
        <FolderSharingPanel
          folder={detail}
          projectName={projectName}
          connections={connections.data}
          viewer={facts}
          viewerId={basis.viewerId}
          onClose={() => {
            setSharing(false)
          }}
          /*
           * Offered whenever the folder is shared and the viewer owns it: the dialog explains when nobody is
           * eligible.
           */
          onTransfer={
            gates?.transferOwnership === true && others.length > 0
              ? () => {
                  /* After Share has closed and handed focus back, so the dialog keeps focus. */
                  setSharing(false)
                  window.setTimeout(() => {
                    setTransferOpen(true)
                  }, 0)
                }
              : undefined
          }
        />
      ) : null}


      {/* History sheet: grouped by day, actor on every line, same `lineFor` text as the window bar. */}
      <HistorySheet
        kind="folder"
        subject={headId}
        name={detail?.name ?? ''}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        scope="folder"
      />

      {/* Lists every member who holds Full control, in roster order, with no default unless there is one candidate.
         An empty list says what to do next. */}
      <Dialog
        open={transferOpen}
        onOpenChange={(next) => {
          setTransferOpen(next)
          if (!next) setTransferTo(null)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Transfer ownership</DialogTitle>
            <DialogDescription>
              {successors.length === 0
                ? `Nobody else in ${projectName ?? detail?.name ?? 'this page'} has Full control, so there is nobody to hand it to yet. Give a member Full control in Share, then transfer it to them.`
                : `Choose who owns ${projectName ?? detail?.name ?? 'this page'} next. Only members who have Full control can take it on, and you stay a member. Only the new owner can hand it back.`}
            </DialogDescription>
          </DialogHeader>
          {successors.length === 0 ? (
            <DialogFooter>
              <DialogClose render={<Button variant="ghost">Close</Button>} />
              <Button
                variant="outline"
                onClick={() => {
                  setTransferOpen(false)
                  setSharing(true)
                }}
              >
                Open Share
              </Button>
            </DialogFooter>
          ) : (
            <>
              {/* Picking a name only selects it; the footer button hands the page over. */}
              <div role="group" aria-label="New owner" className="flex flex-col gap-[var(--space-row)]">
                {successors.map((member) => {
                  const name = member.user.display_name ?? 'Someone'
                  const picked = heir?.user.id === member.user.id
                  return (
                    <button
                      key={member.user.id}
                      type="button"
                      aria-pressed={picked}
                      data-focus={picked ? 'self' : undefined}
                      className={cn(
                        'flex min-h-[var(--row-height)] w-full items-center gap-[var(--space-inline)] rounded-md px-2 text-left text-sm text-foreground',
                        picked ? 'bg-selected' : 'hover:bg-accent',
                      )}
                      onClick={() => {
                        setTransferTo(member.user.id)
                      }}
                    >
                      <PersonFace id={member.user.id} name={name} image={member.user.avatar_url} />
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                    </button>
                  )
                })}
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="ghost">Cancel</Button>} />
                <Button
                  variant="commit"
                  disabled={heir === undefined || transfer.isPending}
                  onClick={() => {
                    if (heir === undefined) return
                    transfer.mutate(
                      { id: headId, to: heir.user.id },
                      {
                        onSuccess: () => {
                          setTransferOpen(false)
                          setTransferTo(null)
                          showToast(
                            `${heir.user.display_name ?? 'Someone'} now owns ${detail?.name ?? 'this page'}`,
                          )
                        },
                      },
                    )
                  }}
                >
                  Transfer ownership
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
