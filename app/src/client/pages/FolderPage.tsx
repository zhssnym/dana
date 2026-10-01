/*
9.6's page, in step 7's shape: a project's header (mark and name with
"Share" and one "…" at the right), its row of tabs, and the tab's body. Every
tab is a page of its own (`/app/folders/<id>`), and the header on each of
them is the project root's: the project is its root row, and renaming,
sharing or deleting it acts on the project. A sub-page (no `tab_position`)
draws its own header and no tab row.

The body is drawn by the page's kind: Work is the canvas drawn as the thread
(M4), where a finished Task stays in place, checked and muted; Freeform groups
finished Tasks by Section. A Doc is the
same canvas with flat headings and no thread; a Discussion is the project's
threads; a new project nobody has picked a kind for is the picker. Linear,
Board and the issue page are gone; an old `?issue=<id>` address lands on
`/app/tasks/<id>`, the one task page, and an old `?facet=<id>` address on
that tab's own page (0061 kept each facet's id).

What is deliberate rather than transcription:

**The identity is the folder's, written through 4.3's shared columns.** The mark
opens the icon-and-colour picker and PATCHes icon and color; the cover uploads
through 7.15 (kind 'cover') and PATCHes cover_file_id; the description PATCHes
description; the name renders as a heading for everybody and becomes an inline
field on a click, the title being rename's one home on this page.

**All of these are Can edit's.** Can view is read only, and a folder's identity
is shared Folder work, which Can edit may change. AC-011, AC-012 and AC-193
carry it, and `lib/folder-authority.ts` answers it here from the same table the
routes resolve against (issue #228).

A reader below that bar is offered no control a 403 would answer, and still has
a heading, a band and a paragraph to read; the heading is always drawn (AC-226).
4.4's per-member color column is written by no surface here.

**Tasks sit under their sections.** `server/views/cards.ts` projects
`section_block_id` on the folder read, each section carries its own rows and its own quick-add, and the loose
list holds exactly the tasks under no section.

**One Task filter, no view strip, no board.** Filtering hides non-matching Task
placements only. The thread remains the same document: authored blocks,
ordering, progress and the canonical Next Task do not change.

**Delete asks nothing and the undo bar answers** (9.6: "with the undo bar and no
confirmation: two ways back is why the question left"). The inverse is 7.13's
restore, registered the way every page registers one. Leave keeps its sentence
verbatim and its confirm (AC-183), and walks through DELETE /my-membership.

**An owner with other members is offered Transfer ownership rather than Leave,
and that is the server's rule.** There is no automatic succession: the owner's
leave is 409 until they have handed custody to a member who *currently holds
Full control*, and the picker offers exactly those. A sole owner is offered
Delete, and Desk neither.

**The overflow menu sits at the header's right, beside Share**, named "More
actions", offering exactly the acts this viewer's Access permits: History, Copy link, Duplicate, Save as workflow to
everyone; **Delete folder at Full control, Leave
folder to any member who is not the owner and is not the last Full control, and
Transfer ownership to the owner alone**, all through `lib/folder-authority.ts`.
Duplicate is the server's; Save as workflow is a client-side export, structure
and titles only.

**A stale block write is handled visibly**: the 409 carries 5.1's copy, which
the mutation cache already raises as the toast, and the page refetches its
blocks at the same moment so the winning write replaces the loser on screen.

**A project's conversation has one home: its Discussion tab.** A thread's
address (`?discussion=`, or a notification's `?conversation=open`) on any
page of the project moves there; a project with no Discussion tab (and the
Desk) draws the thread on the page it was reached on.

**The "…" is the project's list** (`lib/object-acts.ts`) on a project and its
tabs, and the page's on a sub-page: History, Copy link, Duplicate, Export
project (a project only), then Leave or Delete by role. Rename's home is the
title.
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
/* The empty-state icon goes to `PageBody`, whose `StateIcon` is typed on the
   raw lucide component. */
import { Folder as FolderIcon, UsersRound } from '../lib/icons.js'

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
/* Aliased: `shell/app-sidebar.ts` exports a `FolderAction` too, and it is
   a different thing — the five menu acts a Library row reaches by link,
   against #228's closed vocabulary of every Folder action there is. */
import type { FolderAction as FolderActionName } from '../../shared/folder-actions.js'
import { paths } from '../routes.js'
import { FOLDER_ACTION_PARAM, folderActionPath } from '../shell/app-sidebar.js'
import { copyLink } from '../lib/object-acts.js'
import { useReserveRightEdge } from '../components/right-edge.js'
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
import { labelsWorn, taskFilterActive } from '../views/filter.js'
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

/*
The width the sharing panel reserves at the right edge, restated from its
`w-[var(--sharing-panel-width)]` (440px in `tokens.css`) because padding the
shell computes has to be a number JavaScript holds. Named so a reader looking
for the duplicate finds it named as one.
*/
const SHARING_PANEL_WIDTH = 440

/**
 * 9.6's leave confirm, verbatim and one sentence (AC-183 turns on both).
 */
function leaveFolderConfirm(name: string): string {
  return (
    `Leave ${name}? You lose access to it, and anything in it assigned to ` +
    'you becomes unassigned.'
  )
}

/*
Retired storage keys (M4), never to be read, renamed or reused:
`dana.folder.show-completed` was this page's "Show completed", gone with the
control; `dana.folder-view` and `dana.linear.*` are retired in
`views/view-mode.ts`. A stored value simply stops mattering.
*/

/*
Where the thread was when a task was opened from it, so Back lands there.

The shell's one scroll region (`[data-shell-scroll]`) outlives the route, so the
browser restores nothing; this page does. Held in memory for the session, per
page, and only read on a Back (a POP) onto the very history entry the task was
opened from, never on a fresh visit or on a Back into a later visit of the page.
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
  /* Kept on the way out: at unmount the address is already the next one, so a
     task page's path names the task that was opened. A layout effect, because
     its cleanup runs before the thread leaves the DOM; a passive one would read
     a scroll position already clamped to the next page's height. */
  useLayoutEffect(() => {
    const scroller = document.querySelector<HTMLElement>('[data-shell-scroll]')
    return () => {
      /* Only a task opened from the thread is a trip Back returns from; a
         remount on this same page must not overwrite the kept place. */
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
    /* Keyed to the history entry: coming back by the sidebar and later
       pressing Back into that newer visit must not replay an old position. */
    if (saved === undefined || saved.entry !== key || scroller === null) return
    /* The canvas measures and lays out after its data arrives, so the height
       the position needs may come late: try until the opened task is drawn and
       the position fits, or about two seconds have gone. */
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
      /* Marked done only here: an effect cancelled mid-wait (a re-run, or
         React's development double mount) tries again. */
      restoredFor.current = key
      /* Used once: a later Back into this page, after leaving it some other
         way, keeps wherever the reader had scrolled to since. */
      threadScroll.delete(folderId)
      scroller.scrollTop = saved.top
      task?.scrollIntoView({ block: 'nearest' })
    }
    handle = requestAnimationFrame(settle)
    return () => cancelAnimationFrame(handle)
  }, [folderId, ready, key, navigationType])
}

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

/**
 * The folder page of 9.6.
 *
 * `folderId` overrides the route parameter and exists for exactly one
 * caller: Desk renders this page at /app, where 10.6 fixes the installed
 * app's start_url and so the folder's identity cannot be in the path.
 */
export function FolderPage({
  folderId,
}: {
  readonly folderId?: string
} = {}): React.JSX.Element {
  const [search] = useSearchParams()
  /* An old Linear issue address (`?issue=<task id>`) is the one task page now.
     Answered before any of the page's reads start, and only for a real id. */
  const issueId = search.get('issue') ?? ''
  if (issueId !== '') return <Navigate to={paths.task(encodeURIComponent(issueId))} replace />
  /* An old tab address (`?facet=<id>`, before step 7) is that tab's page now:
     0061 gave each tab its facet's id. */
  const facetId = search.get('facet') ?? ''
  if (facetId !== '') return <FacetAddress facetId={facetId} />
  return <FolderPageBody folderId={folderId} />
}

/* Where an old `?facet=` address goes: the tab's own page when the viewer has
   one by that id, otherwise this page without the parameter (Work had no
   address of its own, and a Work facet over a heading became no page). */
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
  /* Set as this page is trashed: its reads stop, so the delete's
     invalidation refetches none of them against a 404 while the page is
     still mounted, the navigation away not yet committed. */
  /* The page being left (deleted): nothing of it stays mounted. Keyed by id,
     because a delete lands on the parent page, which this same component
     draws without remounting. */
  const [leftId, setLeftId] = useState<string | null>(null)
  const leaving = leftId === id
  /* The page on screen: a tab, a sub-page or a project root. */
  const here = useFolder(id, !leaving)
  const herePage = here.data
  const kind = herePage?.kind ?? null
  /* A tab's header is its project's (the root row); a sub-page's is its own. */
  const onTab = herePage !== undefined && herePage.tab_position !== null
  const headId = onTab ? herePage.project_id : id
  /* The header names the project on its root and on its tabs. */
  const atProject = herePage !== undefined && herePage.project_id === headId
  const folder = useFolder(headId, !leaving && herePage !== undefined)
  /* Everything else waits for the page itself: a link the viewer may not
     open is one quiet 404, not one per read. */
  const folderOk = here.status === 'success' && !leaving
  const writes = folderOk && (kind === 'work' || kind === 'doc')
  const open = useFolderOpenTasks(id, writes)
  /* An unpicked root is read too: the picker offers Discussion only on an
     empty one, since a Discussion page cannot show writing. */
  const page = useFolderPage(id, writes || (folderOk && kind === null))
  const allPages = useAllPages(folderOk)
  const tabs = useMemo(
    () => (herePage === undefined ? [] : projectTabs(allPages.data ?? [], herePage.project_id)),
    [allPages.data, herePage],
  )
  /* Step 8: people belong to the project. On a sub-page, Share and Leave
     name the project they act on; on a tab the header already is it. */
  const projectName =
    herePage === undefined || herePage.project_id === headId
      ? undefined
      : allPages.data?.find((page) => page.id === herePage.project_id)?.name
  /* "Save as workflow" reads each row's 7.6 detail before it writes the
     file, through the cache the row already stores one in. */
  const cache = useQueryClient()
  const basis = useRowBasis()
  const [taskFilter, setTaskFilter] = useTaskFilter(id)
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
  const [sharing, setSharing] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  /* The member picked in the transfer dialog; nothing moves until its button. */
  const [transferTo, setTransferTo] = useState<string | null>(null)
  /* An owner deleting a shared folder is asked one question first. */
  // 9.6's inline rename: the title is a heading until this is true.
  const [renaming, setRenaming] = useState(false)
  const [coverOpen, setCoverOpen] = useState(false)

  const connections = useConnections()
  /*
  The sharing panel takes room rather than covering: it publishes its width
  while open and the shell pads the page body by it (`components/right-edge`).
  */
  useReserveRightEdge(SHARING_PANEL_WIDTH, sharing)

  const detail = folder.data
  const scheduled = open.data?.scheduled ?? []
  const unscheduled = open.data?.unscheduled ?? []
  /*
  The folder's own composed sequence, which is `GET /page`'s `items` and not
  Q7's two arrays.

  4.17's durable mixed order is the one the page stores (AC-176). The canvas
  draws from the document, and these rows are what it looks tasks up in. Q7's
  arrays would order `scheduled` by due date; this orders by the composed
  sequence (#234).

  A row the page has not composed yet keeps Q7's order behind the composed ones,
  which is what a task created a moment ago looks like until the page read
  catches up. `items` carries every undeleted task of the folder, so that window
  is the only time the fallback is reached.
  */
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

  /* Always read finished Tasks for Thread and Freeform. The first page
     replaces per-placement reads (#312); Freeform follows the cursor. */
  const completed = useFolderCompletedTasks(id, writes)
  useEffect(() => {
    // Freeform needs every placed finished Task to fill its Section disclosures.
    if (kind === 'work' && workView === 'freeform' && completed.hasNextPage && !completed.isFetchingNextPage) void completed.fetchNextPage()
  }, [kind, workView, completed.hasNextPage, completed.isFetchingNextPage, completed.fetchNextPage])
  /* The canvas waits for them, so no finished placement is read by id while
     the list is still on its way. */
  const completedReady = completed.data !== undefined || completed.isError
  const completedDays = mergeCompletedDays(completed.data?.pages)
  /* The finished Tasks the canvas draws in place, checked and muted. */
  const completedRows = useMemo(() => completedDays.flatMap((day) => day.rows), [completedDays])
  const filterRows = useMemo(() => [...openRows, ...completedRows], [openRows, completedRows])
  const context: RowContext = {
    ...basis,
    showFolder: false,
    starTooltip: actions.starTooltipMode,
  }

  /*
  The folder's own storage name for the lifted head, which is
  `lib/page-identity.ts`'s folder half: a place page's cover is 4.20's, per
  viewer, and a folder's is 4.3's `cover_file_id`, shared by every member.
  */
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
  const filterLabels = useMemo(() => labelsWorn(filterRows), [filterRows])
  const filteringTasks = kind === 'work' && taskFilterActive(taskFilter)
  /*
  **What this page may offer, from the server's own table** (issue #228).

  Every gate reads Access rather than ownership: a Full-control member who is
  not the owner may rename, and an owner whose Access has been lowered may not
  delete. `lib/folder-authority.ts` answers each from
  `shared/folder-actions.ts`, the same table the routes resolve against, so no
  bar is written twice; its own header carries the argument and its test the
  preset-by-preset table.

  The facts need the roster, which this page already reads, because the viewer's
  preset is their membership row and is never inferred from custody (an owner
  may lower their own Access). `gates` is null until both have arrived, so
  nothing draws on a guess.
  */
  const facts = viewerFacts(detail, members, basis.viewerId)
  const gates = facts === null ? null : folderGates(facts)
  /* The Desk draws its tab row only when migration 0061 gave it Doc tabs
     (writing its Purpose, Results or Notes facets held); nothing adds one. */
  const shownTabs = onTab && (!isDefault || tabs.length > 1) ? tabs : []
  const discussionTab = tabs.find((tab) => tab.kind === 'discussion')
  /* A thread's address: `?discussion=` (ConsultationLinkPage, Discuss, an
     old link) or a notification's `?conversation=open` about the page's own
     thread, never on Desk. On a project with a Discussion tab it moves there;
     otherwise (the Desk, a project without one) the thread is drawn here. */
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
  const threadOpen = threadHere && search.get('discussion') !== null
  useThreadScroll(id, kind === 'work' && page.data !== undefined && completedReady)

  /* A tab is a page of its own: choosing one goes there, in place, so Back
     leaves the project rather than stepping through its tabs. */
  const selectTab = useCallback((tab: Folder): void => {
    void navigate(paths.folder(tab.id), { replace: true })
  }, [navigate])

  /* Drops one parameter in place: a stale ?member= would reopen that member
     later without being asked. */
  const dropParam = useCallback((name: string): void => {
    setSearch((current) => {
      if (!current.has(name)) return current
      const next = new URLSearchParams(current)
      next.delete(name)
      return next
    }, { replace: true })
  }, [setSearch])

  /* May edit the project's pages: its tabs, and a Doc's writing. Asked of
     the header's folder, the project root on a tab. */
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
  /* Ownership passes only to a member who *currently* holds Full control, and
     there is no default successor; offering anyone else would be offering a
     choice the server answers 422. */
  const successors = eligibleSuccessors(members, basis.viewerId)
  /* Who the transfer goes to: the pick while they still qualify, or the only
     candidate when nothing has been picked yet. A pick that lost Full control
     on a refetch leaves nothing selected; it never falls onto someone else. */
  const heir =
    transferTo === null
      ? successors.length === 1
        ? successors[0]
        : undefined
      : successors.find((member) => member.user.id === transferTo)
  /* Everybody else in the folder, which is a different question and the one
     the owner's delete dialog asks: somebody to hand it to is not the same as
     somebody who is in it. */
  const others = otherMembers(members, basis.viewerId)
  /* No page or per-Section "N of M done": nobody measures tasks by count
     (round 7). A task's own subtask count stays on its row. */

  /**
   * Who a comment's author is, off the members already read; a face the roster
   * cannot resolve says "Someone" rather than leaking an id.
   *
   * The picture rides with the name. 7.14 carries an author's id alone, so this
   * directory is the only route an avatar has onto the thread, and both reads
   * behind it — 7.4's members and 7.3's connections — carry `avatar_url`.
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
  async function saveAsWorkflow(): Promise<void> {
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

  /*
  An act the Library asked for, run once the folder has arrived.

  Five of a folder's acts need a surface only this page has: an inline field, a
  history sheet, a serialiser, a confirmation and the undo bar. Rebuilding those
  in the sidebar would be two implementations of each, so the Library row
  navigates here carrying `?folder-action=`.

  **It waits for the read and then runs once.** Leave, Delete and Save as
  workflow all name the folder, so running before `detail` arrives would confirm
  about "" and export a file called folder.dana-workflow.json. The query is
  dropped from the address as the act starts, with `replace`, so a reload or a
  Back does not run it a second time: an act is a thing that happened, not a
  property of the page.
  */
  const ranAction = useRef(false)
  useEffect(() => {
    const action = search.get(FOLDER_ACTION_PARAM)
    /* The page is not remounted between folders, so the guard re-arms once
       the address has dropped the act: the next act (a second page added
       from the Library, say) still runs. */
    if (action === null) {
      ranAction.current = false
      return
    }
    if (ranAction.current) return
    if (detail === undefined) return
    /* And for the viewer's own membership row, for the same reason: three of
       the five acts below are gated on the preset it carries, and a gate
       evaluated before the roster arrives would swallow the act rather than
       delay it — `ranAction` is set on the line after this one. */
    if (gates === null) return
    ranAction.current = true
    /*
    **This reads React Router's lagging copy of the location, twice, and is
    left doing so.** Issue #48's inventory named it: the functional form of
    `setSearchParams` is called with `new URLSearchParams(searchParams)`, the
    memoised value, not the address bar, so a run inside the lag window
    `views/usePlace.tsx`'s `liveSearch` describes writes back every parameter
    the address has since dropped — `?view=` among them. The guard above reads
    the same lagging `search`.

    It is left rather than fixed, which is a decision and not an omission.
    Both readings would have to move together, and moving the guard changes
    *when* an act runs rather than only what the address ends up saying: this
    effect has no dependency array, so it is evaluated on every render, and
    the arrival it is waiting for is `detail`. On top of that, `setSearch`
    resolves against the router's pathname, which lags for the same reason the
    search does, so a correct fix navigates with `window.location.pathname`
    the way `PlaceChrome`'s `changeFilter` does rather than swapping one
    argument. The review of issue #49 could not build a realistic sequence
    that reaches the window at all: `?folder-action=` is a deep link from the
    Library that deletes itself on arrival and is never generated by anything
    on this page. So it is inventory, and the shape of the fix is written here
    for whoever finds a sequence that does reach it.
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
    The same three gates the menu above draws with, because this is the same act
    reached by link from the Library (issue #228).

    **A refused arrival says why rather than doing nothing.** The sidebar's
    folder row gates on the same table this page does, so the two menus agree —
    **and the refusal still has to exist**, because the address is a URL. A link
    pasted from elsewhere, a tab restored from yesterday, or a list the person's
    Access changed underneath all reach this handler carrying an act they may
    not perform. Silence there is the worst of the three possible behaviours:
    the field simply never opens.

    The sentence is `ruleFor(...).why`, which is the **same string the route
    would have answered with**, `mayPerform`'s reason being what `sendError(res,
    403, 'forbidden', ...)` carries; so the person is told the same thing
    whether the client caught it or the server did, and there is no second
    wording to keep in step.
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
    /* Leave is the exception and asks anyway. The two rules that refuse it
       are state rather than preset — the owner's transfer-first rule and the
       continuity invariant — so `ruleFor('member.leave').why` would answer
       that leaving needs only Can view, which is true and is not why this one
       was refused. The route's 409 carries the sentence that is ("Transfer
       ownership before leaving", "This folder would be left with nobody in
       Full control"), and the mutation cache already raises it; copying those
       two strings here would be the second copy this whole change removes. */
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

  /*
  Who a comment's author is, for the lifted thread, and stable so the mapping
  memoises. A face the roster cannot resolve says "Someone" rather than leaking
  an id, which is the rule the history sheet and the bell both keep.
  */
  const personOf = useCallback(
    (authorId: string) => authorPeople.get(authorId) ?? { name: 'Someone' },
    [authorPeople],
  )

  const headerActions = (
    <>
      {/* With one tab the row is not drawn (a note still reads as a page),
          so its "+" waits here. */}
      {shownTabs.length === 1 && tabsEditable && kind !== null && kind !== 'work' ? (
        <AddTabMenu tabs={shownTabs} onAdd={addTab} />
      ) : null}
      {/* This is the project's people surface, not external sharing. The label
          invites the solo creator to add teammates, then settles to Team once
          another member exists. */}
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
      {/*
      The page's one "…" (`lib/object-acts.ts`): the project's list on a
      project or its tab, the page's on a sub-page. No Rename (the title
      renames in place) and no Add a page inside or Import (u2: the `/`
      menu's Page and the Library's Import project are their one way).
       */}
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
            /* Duplicated server-side; the copy is the duplicator's own private
               folder, and the page goes to it: arriving there is the feedback. */
            duplicate.mutate(headId, {
              onSuccess: (made) => {
                navigate(paths.folder(made.id))
              },
            })
          },
          /* The project as a Dana file; its one home now (it left Share). */
          export: atProject && !isDefault ? () => void saveAsWorkflow() : undefined,
          archive: gates?.trash === true ? doArchive : undefined,
          /* Any member's, refused to the owner until they transfer and to the
             last Full-control member; `folderGates` reads both off the roster. */
          leave: gates?.leave === true ? askLeave : undefined,
          /* Full control's, which custody does not confer (AC-015). */
          delete: gates?.trash === true ? doDelete : undefined,
        }}
      />
    </>
  )

  /* Trashed: nothing of the page stays mounted to read it again while the
     navigation away commits. */
  if (leaving) return <div />

  return (
    <div className="space-y-6">
      {/* The page read, so a page the viewer cannot see renders 10.2's
          answer here: nonexistent, never forbidden. */}
      <PageBody query={here} isEmpty={false} emptyCopy="">
        {/* An open thread is its own page (r9): the breadcrumb names it and
            its head is the thread's, so the page's head and tabs step aside. */}
        <div className={threadOpen ? 'hidden' : 'space-y-4'}>
          {hasCover && !isDefault ? (
            <div className="-mt-4 md:-mt-6">
              {/* A viewer below Can edit reads the band and is offered nothing
                  on it (AC-011, AC-193). */}
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
              /* Covers are for projects; the Desk is not one (M4). */
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
                    canCreate={facts !== null && mayDraw(facts, 'task.create')}
                  /> : page.data && completedReady && kind === 'work' && workView === 'board' ? <WorkBoard
                    page={page.data}
                    tasks={openRows}
                    completed={completedRows}
                    folderId={id}
                    filter={taskFilter}
                    context={context}
                    actions={actions}
                    canCreate={facts !== null && mayDraw(facts, 'task.create')}
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
          /* Transfer is Share's (M4); Export is the project's "…" (u2). */
          /* Offered whenever the folder is shared and the viewer owns it,
             rather than only when somebody is eligible: the dialog says what
             to do when nobody is. */
          onTransfer={
            gates?.transferOwnership === true && others.length > 0
              ? () => {
                  /* After Share has closed and handed focus back to its
                     button, so the dialog keeps focus (Escape closes it). */
                  setSharing(false)
                  window.setTimeout(() => {
                    setTransferOpen(true)
                  }, 0)
                }
              : undefined
          }
        />
      ) : null}


      {/*
      9.6's History, as a sheet that groups by day and puts the actor on every
      line: a record you are reading to settle a question should not make you
      look upwards. Both readers of an event draw it through `lib/history.ts`'s
      `lineFor`, so the window bar's Activity sentence and this one are one
      string rather than two formatters that will one day disagree.
       */}
      <HistorySheet
        kind="folder"
        subject={headId}
        name={detail?.name ?? ''}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        scope="folder"
      />

      {/*
      9.6: an owner with other members leaves only by transferring first.

      **The list is every member who currently holds Full control, and the
      dialog says so.** Joining first is not evidence that anybody intended you
      to hold custody, and the server answers a target below Full control `422
      to: must be a member of this folder who currently has Full control`.

      **There is no default and nothing is sorted**, because no rule would order
      them: the roster's own order is used, which is the order the Share panel
      this person just came from shows. A single candidate is picked
      already, since there is nothing to choose between.

      **An empty list is a sentence and not an empty box.** A folder can be full
      of people and have nobody eligible, and that person's next step — give
      somebody Full control in Share, then come back — is not something an empty
      picker communicates. The wording follows the server's own refusal copy,
      "This folder would be left with nobody in Full control".
       */}
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
              {/* Picking a name only selects it: handing the page over is
                  the footer's one button, which says so. */}
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
