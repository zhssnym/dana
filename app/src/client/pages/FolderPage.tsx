/*
9.6's folder page, in round 2's page shape: a header (mark and name with
"Share" and one "…" at the right; no progress count under it (round 7). When there is
finite work, and no description line -- Purpose holds that), a row of plain
text tabs in intro-to-conclusion order (Purpose · Work · Results · Discussion,
then custom tabs), and the tab's body. The page opens on Work (`main`), whose
body is the canvas drawn as the thread (M4), where a finished Task stays in
place, checked and muted. It is Work's one rendering: there is no view switch
and no "Show completed". Linear, Board and the issue page are gone; an old
`?issue=<id>` address lands on `/app/tasks/<id>`, the one task page.

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

**No filter, no view strip, no board** (M4). The thread is a document and never
hides a block, so nothing on this page narrows it.

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

**The folder's conversation has one home: the Consultation tab**, as its
General discussion. The foot section and the side panel it could move to are
gone; a notification arriving with `?conversation=open` lands on Consultation.

**The "…" is the folder menu, the one list** (`lib/object-acts.ts`): History,
Rename, Move to…, Move to collection, Cover…, Tabs…, Copy link, Duplicate, Save as workflow,
then Transfer/Leave/Delete by role, exactly what the Library row's "…" and its
right-click draw, less Rename, whose home here is the title.
*/
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, useLocation, useNavigate, useNavigationType, useParams, useSearchParams } from 'react-router'

import {
  useCreateFacet,
  useDeleteFacet,
  useRestoreFacet,
  useDeleteFolder,
  useLeaveFolder,
  useDuplicateFolder,
  usePatchFacet,
  usePutFacetOrder,
  usePutMyFacetOrder,
  useRenameFolder,
  useRestoreFolder,
  useShareFacet,
  useTransferOwnership,
} from '../api/mutations.js'
import {
  mergeCompletedDays,
  useConnections,
  useFolder,
  useFolderCompletedTasks,
  useFolderOpenTasks,
  useFolderFacets,
  useFolderPage,
  useFacetPage,
} from '../api/queries.js'
import { getPlain } from '../api/http.js'
import { queryKeys } from '../api/keys.js'
import { showToast } from '../state/toasts.js'
const FolderCanvas = lazy(() => import('../components/page/canvas/FolderCanvas.js'))
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
import { Folder as FolderIcon } from '../lib/icons.js'

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
import { FOLDER_ACTION_PARAM } from '../shell/app-sidebar.js'
import { useReserveRightEdge } from '../components/right-edge.js'
import { pushUndo, undoLabel } from '../shell/undo.js'
import { usePageImport } from '../shell/workflow-import.js'
import { FolderTabs } from '../components/folder-facets.js'
import type { CreateFacetInput, FacetCapabilities } from '../components/folder-facets.js'
import { PageSection } from '../components/page/PageSection.js'
import { PageBody } from '../components/page/PageStates.js'
import { FOLDER_EMPTY } from './empty-states.js'
import { FolderSharingPanel, MEMBER_PARAM } from './FolderSharingPanel.js'
import { PersonFace } from '../components/person-face.js'
import { cn } from '../components/ui/utils.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'
import { getLabelsResponse } from '../../shared/labels.js'
import type { LabelDefinition } from '../../shared/labels.js'
import { getTaskResponse } from '../../shared/tasks.js'
import type { TaskDetail } from '../../shared/tasks.js'
import { folderToWorkflowFile } from '../../shared/workflows.js'
import type { WorkflowDependencyEdge } from '../../shared/workflows.js'
import { getFolderDependenciesResponse } from '../../shared/task-dependencies.js'
import type { Facet, GetFacetsResponse } from '../../shared/facets.js'
import { getPageResponse } from '../../shared/pages.js'
import type { PageView } from '../../shared/pages.js'
import { workPageOf } from '../components/page/canvas/adapters.js'

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
page, and only read on a Back (a POP), never on a fresh visit.
*/
const threadScroll = new Map<string, { readonly top: number; readonly taskId: string }>()
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
      })
    }
  }, [folderId])
  useEffect(() => {
    if (!ready || navigationType !== 'POP' || restoredFor.current === key) return
    const saved = threadScroll.get(folderId)
    const scroller = document.querySelector<HTMLElement>('[data-shell-scroll]')
    if (saved === undefined || scroller === null) return
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
  return <FolderPageBody folderId={folderId} />
}

function FolderPageBody({
  folderId,
}: {
  readonly folderId?: string
}): React.JSX.Element {
  const { id: routeId = '' } = useParams<{ id: string }>()
  const id = folderId ?? routeId
  const navigate = useNavigate()
  const importFile = usePageImport()
  const [search, setSearch] = useSearchParams()
  /* Set as this page is trashed: its reads stop, so the delete's
     invalidation refetches none of them against a 404 while the page is
     still mounted, the navigation away not yet committed. */
  /* The page being left (deleted): nothing of it stays mounted. Keyed by id,
     because a delete lands on the parent page, which this same component
     draws without remounting. */
  const [leftId, setLeftId] = useState<string | null>(null)
  const leaving = leftId === id
  const folder = useFolder(id, !leaving)
  /* Everything else waits for the folder itself: a link the viewer may not
     open is one quiet 404, not one per read. */
  const folderOk = folder.status === 'success' && !leaving
  const open = useFolderOpenTasks(id, folderOk)
  const page = useFolderPage(id, folderOk)
  const facets = useFolderFacets(id, folderOk)
  /* "Save as workflow" reads each row's 7.6 detail before it writes the
     file, through the cache the row already stores one in. */
  const cache = useQueryClient()
  const basis = useRowBasis()
  const actions = useRowActions()
  const confirm = useConfirm()
  const remove = useDeleteFolder()
  const restore = useRestoreFolder()
  const patch = useRenameFolder()
  const leave = useLeaveFolder()
  const transfer = useTransferOwnership()
  const createFacet = useCreateFacet()
  const patchFacet = usePatchFacet()
  const deleteFacet = useDeleteFacet()
  const restoreFacet = useRestoreFacet()
  const putFacetOrder = usePutFacetOrder()
  const putMyFacetOrder = usePutMyFacetOrder()
  const shareFacet = useShareFacet()
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

  /* Always read: the thread draws each finished Task in place from these
     cards. One request for the first 50, where a by-id read per finished
     placement is what #312 removed. */
  const completed = useFolderCompletedTasks(id, folderOk)
  /* The canvas waits for them, so no finished placement is read by id while
     the list is still on its way. */
  const completedReady = completed.data !== undefined || completed.isError
  const completedDays = mergeCompletedDays(completed.data?.pages)
  /* The finished Tasks the canvas draws in place, checked and muted. */
  const completedRows = useMemo(() => completedDays.flatMap((day) => day.rows), [completedDays])
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
  const coverKey = `${FOLDER_PREFIX}${id}`
  /* Off once trashed: the cover read is a folder read too. */
  const hasCover = usePageHasCover(leaving ? '' : coverKey)

  const isDefault = detail?.is_default ?? false
  const members = detail?.members ?? []
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
  /* Desk's Consultation facet is its page-level conversation, which Desk does
     not have (issue #195). It stays in the data, counted as hidden so the
     shared reorder below still names every row, and is left off the strip. */
  const facetRows = (facets.data?.facets ?? []).map((facet) =>
    isDefault && facet.kind === 'consultation' ? { ...facet, hidden: true } : facet,
  )
  const requestedFacetId = search.get('facet')
  const mainFacet = facetRows.find((facet) => facet.kind === 'main')
  const purposeFacet = facetRows.find((facet) => facet.kind === 'purpose')
  /* A Discussion address (`?discussion=`, from ConsultationLinkPage) opens the
     Consultation facet even when it is hidden or not named: a link to a
     Discussion must land on it. Never on Desk, which has no Consultation. */
  /* `?conversation=open` is the address a notification about the folder's
     thread carries; that thread is the General discussion, so it lands here
     too. */
  const linkedDiscussion =
    (search.get('discussion') !== null || search.get('conversation') === 'open') && !isDefault
  const linkedConsultation = (facet: Facet): boolean => linkedDiscussion && facet.kind === 'consultation'
  const activeFacet = facetRows.find(
    (facet) => facet.id === requestedFacetId && (!facet.hidden || facet.kind === 'purpose' || facet.kind === 'results' || linkedConsultation(facet)),
  ) ?? facetRows.find(linkedConsultation) ?? mainFacet

  const threadOpen = activeFacet?.kind === 'consultation' && search.get('discussion') !== null
  useThreadScroll(id, activeFacet?.kind === 'main' && page.data !== undefined && completedReady)

  const selectFacet = useCallback((facet: Facet): void => {
    setSearch((current) => {
      const next = new URLSearchParams(current)
      if (facet.kind === 'main') next.delete('facet')
      else next.set('facet', facet.id)
      next.delete('discussion')
      next.delete('outcome')
      next.delete('result')
      return next
    }, { replace: true })
  }, [setSearch])

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

  const sharedPageEditable =
    facts !== null &&
    basis.viewerId !== null &&
    detail !== undefined &&
    mayPerform({
      folderId: id,
      actorId: basis.viewerId,
      access: facts.access,
      isOwner: facts.isOwner,
      isDefault: facts.isDefault,
      name: detail.name,
    }, 'folder.page.edit').allowed

  const facetCapabilities = useCallback((facet: Facet | null): FacetCapabilities => {
    if (facts === null || basis.viewerId === null || detail === undefined) {
      return { createShared: false, createPrivate: false, reorderShared: false, reorderPrivate: false, rename: false, hide: false, delete: false, share: false }
    }
    const actor = {
      folderId: id,
      actorId: basis.viewerId,
      access: facts.access,
      isOwner: facts.isOwner,
      isDefault: facts.isDefault,
      name: detail.name,
    }
    const target = { facetOwnerId: facet?.owner_id ?? null }
    const allowed = (action: Parameters<typeof mayPerform>[1]): boolean =>
      mayPerform(actor, action, target).allowed
    return {
      createShared: mayPerform(actor, 'facet.create', { facetOwnerId: null }).allowed,
      createPrivate: mayPerform(actor, 'facet.create', { facetOwnerId: basis.viewerId }).allowed,
      reorderShared: allowed('facet.reorder'),
      reorderPrivate: facet?.private === true && allowed('facet.reorder'),
      rename: facet !== null && allowed('facet.rename'),
      hide: facet !== null && allowed('facet.hide'),
      delete: facet !== null && allowed('facet.delete'),
      share: facet?.private === true && facet.owner_id === basis.viewerId && allowed('facet.convert_to_shared'),
    }
  }, [basis.viewerId, detail, facts, id])
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
    remove.mutateAsync(id).then(
      () => {
        pushUndo(undoLabel('Deleted', name), () => {
          restore.mutate(id)
        })
      },
      () => {},
    )
  }

  function createFolderFacet(input: CreateFacetInput): void {
    createFacet.mutate({
      folderId: id,
      body: input.kind === 'work'
        ? { kind: 'work', h1_block_id: input.h1BlockId, after_facet_id: activeFacet?.id }
        : { kind: input.kind, display_name: input.name, after_facet_id: activeFacet?.id },
    }, { onSuccess: selectFacet })
  }

  function renameFolderFacet(facet: Facet, name: string | null): void {
    patchFacet.mutate({
      folderId: id,
      facetId: facet.id,
      body: { display_name: name, updated_at: facet.updated_at },
    })
  }

  function hideFolderFacet(facet: Facet, hidden: boolean): void {
    patchFacet.mutate({
      folderId: id,
      facetId: facet.id,
      body: { hidden, updated_at: facet.updated_at },
    }, {
      onSuccess: () => {
        if (hidden && activeFacet?.id === facet.id && mainFacet) selectFacet(mainFacet)
      },
    })
  }

  /* Like every delete: to Trash at once, with Undo. */
  function removeFolderFacet(facet: Facet): void {
    deleteFacet.mutate({ folderId: id, facetId: facet.id }, {
      onSuccess: () => {
        if (mainFacet) selectFacet(mainFacet)
        pushUndo(undoLabel('Deleted', facet.name), () => {
          restoreFacet.mutate(facet.id, { onSuccess: () => { void cache.invalidateQueries({ queryKey: queryKeys.folderFacets(id) }) } })
        })
      },
    })
  }

  function exposeFolderFacet(facet: Facet): void {
    confirm.ask(
      `Share ${facet.name} with everyone in ${detail?.name ?? 'this page'}? Its current writing becomes visible to them.`,
      () => shareFacet.mutate({ folderId: id, facetId: facet.id }),
    )
  }

  function reorderFolderFacets(dragged: Facet, orderedVisible: readonly Facet[]): void {
    /* The row takes its new order at once: the visible tabs in the dropped
       order, hidden ones after, each keyed so the row reads it as the stored
       order (never the untouched default). The answer replaces it. */
    const key = queryKeys.folderFacets(id)
    const previous = cache.getQueryData<GetFacetsResponse>(key)
    if (previous !== undefined) {
      const shown = new Set(orderedVisible.map((facet) => facet.id))
      const byId = new Map(previous.facets.map((facet) => [facet.id, facet]))
      const next = [
        ...orderedVisible.map((facet) => byId.get(facet.id) ?? facet),
        ...previous.facets.filter((facet) => !shown.has(facet.id)),
      ].map((facet, index) => ({ ...facet, position: `b${String(index).padStart(3, '0')}` }))
      cache.setQueryData<GetFacetsResponse>(key, { facets: next })
    }
    const settle = {
      onSuccess: (answer: GetFacetsResponse) => cache.setQueryData(key, answer),
      onError: () => {
        if (previous !== undefined) cache.setQueryData(key, previous)
      },
    }
    if (dragged.private) {
      const index = orderedVisible.findIndex((facet) => facet.id === dragged.id)
      const anchor = index > 0 ? orderedVisible[index - 1] : null
      putMyFacetOrder.mutate({
        folderId: id,
        body: { placements: [{ facet_id: dragged.id, after_facet_id: anchor?.id ?? null }] },
      }, settle)
      return
    }
    const visibleShared = orderedVisible.filter((facet) => !facet.private).map((facet) => facet.id)
    let visibleIndex = 0
    const sharedOrder = facetRows.filter((facet) => !facet.private).map((facet) => {
      if (facet.hidden) return facet.id
      const next = visibleShared[visibleIndex]
      visibleIndex += 1
      return next ?? facet.id
    })
    putFacetOrder.mutate({
      folderId: id,
      body: { order: sharedOrder },
    }, settle)
  }

  function askLeave(): void {
    confirm.ask(leaveFolderConfirm(detail?.name ?? ''), () => {
      leave.mutate(id, { onSuccess: () => navigate(paths.today) })
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
    const pending = [...scheduled, ...unscheduled].filter(
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
          queryKey: queryKeys.folderLabels(id),
          queryFn: () =>
            getPlain(
              getLabelsResponse,
              `/labels?scope=folder&folder_id=${encodeURIComponent(id)}`,
            ),
        }),
        getPlain(
          getFolderDependenciesResponse,
          `/folders/${encodeURIComponent(id)}/dependencies`,
        ),
        purposeFacet === undefined
          ? Promise.resolve(undefined)
          : cache.fetchQuery({
              queryKey: queryKeys.facetPage(id, purposeFacet.id),
              queryFn: () => getPlain(getPageResponse, `/folders/${id}/facets/${purposeFacet.id}/page`),
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
      page.data?.blocks ?? [],
      page.data,
      labels,
      purposeFacet === undefined || purposePage === undefined
        ? undefined
        : { display_name: purposeFacet.display_name, page: purposePage },
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
    } else if (action === 'transfer') {
      if (gates?.transferOwnership === true) setTransferOpen(true)
    } else if (action === 'history') setHistoryOpen(true)
    else if (action === 'workflow') void saveAsWorkflow()
    /* Leave is the exception and asks anyway. The two rules that refuse it
       are state rather than preset — the owner's transfer-first rule and the
       continuity invariant — so `ruleFor('member.leave').why` would answer
       that leaving needs only Can view, which is true and is not why this one
       was refused. The route's 409 carries the sentence that is ("Transfer
       ownership before leaving", "This folder would be left with nobody in
       Full control"), and the mutation cache already raises it; copying those
       two strings here would be the second copy this whole change removes. */
    else if (action === 'leave') askLeave()
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
      {/* 9.6's Share control, a word rather than a glyph. Withheld on a
          default folder, which INV-2 makes single-member and 5.3 refuses an
          add on. AC-162 and AC-183 reach the sharing panel through it. */}
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
          {/* The word matches the panel's title: a member who can add
              nobody opens a list of members, not a share. */}
          {facts !== null && !mayDraw(facts, 'member.add') && !mayDraw(facts, 'invite.create')
            ? 'Members'
            : 'Share'}
        </Button>
      )}
      {/*
      The folder's one "…", the same list the Library row's "…" and its
      right-click draw (`lib/object-acts.ts`), with this page's own plumbing
      for each act.
       */}
      <ObjectMenu
        kind="folder"
        name={detail?.name ?? ''}
        align="end"
        handlers={{
          history: () => {
            setHistoryOpen(true)
          },
          'copy-link': () => {
            void navigator.clipboard.writeText(folderLink(id))
          },
          duplicate: () => {
            /* Duplicated server-side; the copy is the duplicator's own private
               folder, and the page goes to it: arriving there is the feedback. */
            duplicate.mutate(id, {
              onSuccess: (made) => {
                navigate(paths.folder(made.id))
              },
            })
          },
          /* Import lands under this page, so it needs edit rights here and
             never runs on the Desk, which takes no sub-pages. */
          import:
            gates?.identity === true && !isDefault
              ? () => {
                  importFile(id)
                }
              : undefined,
          workflow: () => {
            void saveAsWorkflow()
          },
          /* Offered whenever the folder is shared and the viewer owns it,
             rather than only when somebody is eligible: the dialog says what
             to do when nobody is. */
          transfer:
            gates?.transferOwnership === true && others.length > 0
              ? () => setTransferOpen(true)
              : undefined,
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
      {/* The header is the folder read, so a folder the viewer cannot see
          renders 10.2's answer here: nonexistent, never forbidden. */}
      <PageBody query={folder} isEmpty={false} emptyCopy="">
        {/* An open thread is its own page (r9): the breadcrumb names it and
            its head is the thread's, so the page's head and tabs step aside. */}
        <div className={threadOpen ? 'hidden' : 'space-y-4'}>
          {hasCover ? (
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
                patch.mutate({ id, body: { name } })
              }}
              onPickIdentity={(next) => {
                patch.mutate({ id, body: next })
              }}
              onRemoveIcon={() => {
                patch.mutate({ id, body: { icon: null } })
              }}
              actions={headerActions}
              coverKey={coverKey}
            />
          </PageSection>

          {facets.data ? (
            <FolderTabs
              folderId={id}
              facets={isDefault ? facetRows.filter((facet) => facet.kind !== 'consultation') : facetRows}
              activeId={activeFacet?.id ?? ''}
              onSelect={selectFacet}
              canMove={(facet) => {
                const caps = facetCapabilities(facet)
                return facet.private ? caps.reorderPrivate : caps.reorderShared
              }}
              onReorder={reorderFolderFacets}
              capabilities={facetCapabilities}
              onAdd={(name) => createFolderFacet({ kind: 'shared_blank', name })}
              onRename={renameFolderFacet}
              onHide={hideFolderFacet}
              onDelete={removeFolderFacet}
              onShare={exposeFolderFacet}
            />
          ) : facets.isError ? (
            <p role="alert" className="text-sm text-muted-foreground">
              Could not load this page’s tabs. Reload to try again.
            </p>
          ) : null}
        </div>

        {activeFacet?.kind === 'main' ? (
          <div className="space-y-2">
            <PageSection name="Work">
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
                  {page.data && completedReady ? <FolderCanvas
                    key={id}
                    page={page.data}
                    tasks={openRows}
                    completed={completedRows}
                    folderId={id}
                    context={context}
                    actions={actions}
                    onAsk={confirm.ask}
                    arrangeable
                  /> : page.isError ? <p role="alert" className="text-sm text-muted-foreground">Could not load writing. Reload to try again.</p> : null}
                </Suspense>
              </PageBody>
            </PageSection>
          </div>
        ) : activeFacet ? (
          <FacetContent
            facet={activeFacet}
            folderId={id}
            folderPage={page.data}
            tasks={openRows}
            completed={completedRows}
            completedReady={completedReady}
            context={context}
            actions={actions}
            onAsk={confirm.ask}
            consultation={
              <ConsultationPanel
                folderId={id}
                viewer={facts === null || basis.viewerId === null ? null : { viewerId: basis.viewerId, facts }}
                personOf={personOf}
              />
            }
            sharedPageEditable={sharedPageEditable}
            onOpenMain={() => { if (mainFacet) selectFacet(mainFacet) }}
          />
        ) : null}
      </PageBody>

      <FolderCoverDialog storageName={coverKey} open={coverOpen} onOpenChange={setCoverOpen} />

      {sharing && detail !== undefined ? (
        <FolderSharingPanel
          folder={detail}
          connections={connections.data}
          viewer={facts}
          viewerId={basis.viewerId}
          onClose={() => {
            setSharing(false)
          }}
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
        subject={id}
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
                ? `Nobody else in ${detail?.name ?? 'this page'} has Full control, so there is nobody to hand it to yet. Give a member Full control in Share, then transfer it to them.`
                : `Choose who owns ${detail?.name ?? 'this page'} next. Only members who have Full control can take it on, and you stay a member. Only the new owner can hand it back.`}
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
                      { id, to: heir.user.id },
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

function FacetContent({
  facet,
  folderId,
  folderPage,
  tasks,
  completed,
  completedReady,
  context,
  actions,
  onAsk,
  consultation,
  sharedPageEditable,
  onOpenMain,
}: {
  readonly facet: Facet
  readonly folderId: string
  readonly folderPage: PageView | undefined
  readonly tasks: readonly Parameters<typeof TaskRows>[0]['tasks'][number][]
  readonly completed: readonly Parameters<typeof TaskRows>[0]['tasks'][number][]
  readonly completedReady: boolean
  readonly context: RowContext
  readonly actions: ReturnType<typeof useRowActions>
  readonly onAsk: (message: string, action: () => void) => void
  readonly consultation: React.ReactNode
  readonly sharedPageEditable: boolean
  readonly onOpenMain: () => void
}): React.JSX.Element {
  const blank = facet.kind === 'shared_blank' || facet.kind === 'private_blank'
  const document = useFacetPage(folderId, facet.id, blank || facet.kind === 'purpose' || facet.kind === 'results')

  if (facet.kind === 'consultation') {
    return <>{consultation}</>
  }
  if (facet.kind === 'purpose' || facet.kind === 'results') {
    const purpose = facet.kind === 'purpose'
    return (
      <div className="mt-2">
        {document.data ? (
          <>
            <Suspense fallback={<p role="status" className="sr-only">Loading writing…</p>}>
              <FolderCanvas key={`${folderId}:${facet.id}`} page={document.data} tasks={[]} folderId={folderId} facetId={facet.id} presentationHeadings results={!purpose} context={context} actions={actions} onAsk={onAsk} arrangeable={sharedPageEditable} />
            </Suspense>
          </>
        ) : <p role={document.isError ? 'alert' : 'status'} className={document.isError ? undefined : 'sr-only'}>{document.isError ? `Could not load ${purpose ? 'Purpose' : 'Results'}. Reload to try again.` : 'Loading writing…'}</p>}
      </div>
    )
  }
  if (facet.kind === 'work') {
    const focused = folderPage && facet.h1_block_id ? workPageOf(folderPage, facet.h1_block_id) : null
    const ids = new Set(focused?.items.map((item) => item.id) ?? [])
    const focusedTasks = tasks.filter((task) => ids.has(task.id))
    return (
      <div className="mt-2 space-y-3">
        <p className="text-xs text-muted-foreground">
          The same section as on Work.{' '}
          <button type="button" onClick={onOpenMain} className="underline-offset-2 hover:text-foreground hover:underline">
            Open Work
          </button>
        </p>
        {focused && completedReady ? (
          <Suspense fallback={<p role="status" className="sr-only">Loading section…</p>}>
            <FolderCanvas key={`${folderId}:${facet.id}`} page={folderPage!} tasks={focusedTasks} completed={completed} folderId={folderId} workRootId={facet.h1_block_id ?? undefined} context={context} actions={actions} onAsk={onAsk} arrangeable />
          </Suspense>
        ) : <p role="status" className="sr-only">Loading section…</p>}
      </div>
    )
  }
  return (
    <div className="mt-2">
      {document.data ? (
        <Suspense fallback={<p role="status" className="sr-only">Loading writing…</p>}>
          <FolderCanvas key={`${folderId}:${facet.id}`} page={document.data} tasks={[]} folderId={folderId} facetId={facet.id} context={context} actions={actions} onAsk={onAsk} arrangeable />
        </Suspense>
      ) : <p role={document.isError ? 'alert' : 'status'} className={document.isError ? undefined : 'sr-only'}>{document.isError ? 'Could not load this facet. Reload to try again.' : 'Loading writing…'}</p>}
    </div>
  )
}
