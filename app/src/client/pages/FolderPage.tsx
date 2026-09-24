/*
9.6's folder page, in round 2's page shape: a header (mark and name with
"Share" and one "…" at the right; the progress fact under it when there is
finite work, and no description line -- Purpose holds that), a row of plain
text tabs in intro-to-conclusion order (Purpose · Work · Results · Discussion,
then custom tabs), and the tab's body. The page opens on Work (`main`), whose
body is the canvas, where a finished Task stays in place, checked and muted.
The "…" menu's "View ›" draws the page's tasks as List (the canvas), Linear
(the same order as a thread of steps) or Board (Not started · In progress ·
Done), and shows or hides completed Tasks.

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

**This page is a place-page** (`views/place-pages.ts`). 9.6 asks for the filter
in terms, "the filter of 9.1 narrows the page without touching its arrangement",
and the view strip and the board come with it because `usePlace` and
`PlaceChrome` are where every other page gets all three. One filter per page:
AC-176's "a filter offers all open tasks, only those with a due date and only
those without" is exactly 9.1's due-presence axis.

**The board never groups by folder**: a folder page has pinned the folder, so
grouping by it gives one column, which is a list wearing a different control.

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
right-click draw, with this page's own "View ›" above them (through `extra`),
less Rename, whose home here is the title.
*/
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router'

import {
  useCreateTask,
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
import { DropdownMenuCheckboxItem } from '../components/ui/dropdown-menu.js'
/* The empty-state icon goes to `PageBody`, whose `StateIcon` is typed on the
   raw lucide component. */
import { Folder as FolderIcon } from 'lucide-react'
import { CheckCircle2 } from '../lib/icons.js'
import { cn } from '../components/ui/utils.js'

import type { RowContext } from '../parts/presenters.js'
import { useRowActions } from '../parts/useRowActions.js'
import { folderLink } from '../lib/nav-links.js'
import {
  eligibleSuccessors,
  folderGates,
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
import { groupRows, LOOSE } from '../views/grouping.js'
import { PLACES } from '../views/place-pages.js'
import { BoardView } from '../views/BoardView.js'
import { LinearView } from '../views/LinearView.js'
import { PlaceFilterChips, usePlace } from '../views/usePlace.js'
import type { ViewMode } from '../views/view-mode.js'
import { isNarrowed } from '../views/filter.js'
import { PageBody } from '../components/page/PageStates.js'
import { FOLDER_EMPTY } from './empty-states.js'
import { FolderSharingPanel } from './FolderSharingPanel.js'
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
import { ReferencedFrom } from '../components/links/referenced-from.js'

/**
 * What the list says when the folder holds open tasks and the filter has
 * removed all of them.
 *
 * One sentence where the interim select had three, and that is the filter's
 * own doing rather than a simplification: a select of three options could name
 * which of the three had emptied the list, and 9.1's filter is nine axes that
 * combine, so the honest sentence says the narrowing did it and lets the chips
 * in the window bar say which narrowing. The empty *folder* is a different
 * state and keeps its own copy through `PageBody`.
 */
const FILTER_NARROWED_EMPTY = 'No open tasks match this filter.'

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
/**
 * The owner's hand-on-or-delete question: pass it on to another member, or
 * delete it for them too. Both consequences are stated because they differ in
 * the half a person cannot see: handing it on passes ownership and writes no
 * Trash row; deleting reaches every member's Trash for thirty days.
 *
 * Ownership passes only by an explicit transfer, so the person is told who it
 * can pass to, because the answer is sometimes nobody and that changes what
 * they should do next.
 */
function ownerDeleteQuestion(name: string, others: number, successors: number): string {
  const who = others === 1 ? '1 other person' : `${others} other people`
  const handOn =
    successors === 0
      ? 'Nobody in it has Full control yet, so there is nobody to hand it to until you give somebody that access'
      : successors === 1
        ? 'You can hand it to the member who has Full control, and it leaves your sidebar'
        : `You can hand it to one of the ${String(successors)} members who have Full control, and it leaves your sidebar`
  return (
    `${name} is shared with ${who}. ${handOn}, or delete it for everyone, and ` +
    'it waits in Trash for 30 days.'
  )
}

function leaveFolderConfirm(name: string): string {
  return (
    `Leave ${name}? You lose access to it, and anything in it assigned to ` +
    'you becomes unassigned.'
  )
}

/** The View menu's "Show completed", on by default. */
const SHOW_COMPLETED_KEY = 'dana.folder.show-completed'
function readShowCompleted(): boolean {
  try {
    return globalThis.localStorage.getItem(SHOW_COMPLETED_KEY) !== '0'
  } catch {
    return true
  }
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
  const create = useCreateTask()
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
  /* An owner deleting a shared folder is asked one question first. */
  const [deleteAsk, setDeleteAsk] = useState(false)
  // 9.6's inline rename: the title is a heading until this is true.
  const [renaming, setRenaming] = useState(false)
  const [coverOpen, setCoverOpen] = useState(false)
  /* The View menu's "Show completed", remembered on this device for every
     folder. A new key, so no existing preference moves. */
  const [showCompleted, setShowCompleted] = useState(readShowCompleted)
  const changeShowCompleted = (next: boolean): void => {
    setShowCompleted(next)
    try {
      globalThis.localStorage.setItem(SHOW_COMPLETED_KEY, next ? '1' : '0')
    } catch {
      /* A preference that cannot persist is still this session's. */
    }
  }

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
  draws from the document, and everything else on the page draws from this: the
  Task view the filter switches to, the board's columns, the ladder's keyboard
  order. Q7's arrays would answer a narrowing question such as *With a due date*
  with a date-sorted list, Q3 ordering `scheduled` by due date; the filtered
  view orders by the composed sequence (#234).

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

  /*
  The folder page is a place-page (9.6).

  What that buys is one filter, one view strip and one board, the same three
  every other page draws, rather than three more written here. Two things are
  this page's own and arrive as options, each because it needs the folder's id:
  the filter is remembered per folder, since 9.1 keeps a filter "on return to
  that page, never carried to another" and two folders are two pages; and the
  capture writes this folder, which is 9.3's sixth entry-point row.
  */
  const place = usePlace(PLACES.folder, openRows, {
    filterKey: `folder:${id}`,
    showCompleted,
    capture: (title, column) => {
      create.mutate({
        title,
        folder_id: id,
        ...(column?.due_date === undefined ? {} : { due_date: column.due_date }),
        ...(column?.assignee_id === undefined ? {} : { assignee_id: column.assignee_id }),
      })
    },
  })
  /* Always read: the canvas draws each finished Task in place from these
     cards (and hides them with a class when "Show completed" is off), and the
     board's Done column is the same pages. One request for the first 50,
     where a by-id read per finished placement is what #312 removed. */
  const completed = useFolderCompletedTasks(id, folderOk)
  /* The canvas waits for them, so no finished placement is read by id while
     the list is still on its way. */
  const completedReady = completed.data !== undefined || completed.isError
  const visible = place.narrow(openRows)
  /*
  **The board's columns are the page's sections**, seeded from the blocks rather
  than discovered from the rows, and in the page's own order.

  Seeding is what makes them the page's arrangement rather than a summary of it:
  a section nobody has filed anything under is still a column, with its own
  capture, exactly as it is a heading with its own quick-add in the list. The
  loose column comes first, which is where the list draws the same rows.

  The other axes seed nothing and are unchanged, so the filter changing the
  grouping is one value moving and no second board.
  */
  const sectionColumns = useMemo(
    () =>
      place.groupBy === 'section'
        ? [
            /* "No section" on a page with no sections reads as something
               missing; the one column is the tasks. */
            {
              key: LOOSE,
              name: (page.data?.blocks ?? []).some((block) => block.kind === 'section')
                ? 'No section'
                : 'Tasks',
              mark: null,
              capture: { section_block_id: null },
              rows: [],
            },
            ...(page.data?.blocks ?? [])
              .filter((block) => block.kind === 'section')
              .map((block) => ({
                key: block.id,
                name: block.text ?? '',
                mark: null,
                capture: { section_block_id: block.id },
                rows: [],
              })),
          ]
        : [],
    [place.groupBy, page.data?.blocks],
  )
  const boardColumns = groupRows(
    visible,
    place.groupBy,
    place.today,
    place.viewerId,
    sectionColumns,
  )
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

  const isOwner = detail?.is_owner ?? false
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

  const selectFacet = useCallback((facet: Facet): void => {
    setSearch((current) => {
      const next = new URLSearchParams(current)
      if (facet.kind === 'main') next.delete('facet')
      else next.set('facet', facet.id)
      next.delete('discussion')
      next.delete('outcome')
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
  /* Everybody else in the folder, which is a different question and the one
     the owner's delete dialog asks: somebody to hand it to is not the same as
     somebody who is in it. */
  const others = otherMembers(members, basis.viewerId)
  /* Issue #205: finite progress counts one-off Tasks only, so a recurring
     Task's endless occurrences never grow the denominator. The header says
     only "N of M done"; `counts` is the fallback for an older server. */
  const progress = detail?.progress
  const completionDone = progress?.done ?? detail?.counts.completed ?? 0
  const completionTotal =
    progress?.total ??
    (detail?.counts.completed ?? 0) + (detail?.counts.pending ?? 0)
  /* No per-Section "done/total": Sections never fold, and a count beside
     every heading repeated what the page's own progress and the rows say
     (round 4, Freeform view). */

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
       confirmation. The inverse is 7.13's restore. */
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
      `Share ${facet.name} with everyone in ${detail?.name ?? 'this folder'}? Its current writing will become visible according to Folder access.`,
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
  The one question asked of an owner whose folder has other members: hand it on,
  or delete it for them too.

  The first option is a transfer, because the server answers an owner's leave
  409 "Transfer ownership before leaving": the folder stays alive for the people
  in it and leaves this person's sidebar. AC-283.

  The second option is `doDelete` above, 7.13's soft delete for every member
  with the undo bar. An owner alone in the folder is asked nothing, 9.6's
  confirm-free delete standing, because there is nobody to hand it to.

  **A Full-control member who is not the owner is not asked either** (AC-015):
  the question is about custody, and custody is not theirs to pass on. They get
  9.6's plain delete and the undo bar, exactly as a sole owner does.
  */
  function askDelete(): void {
    if (isOwner && others.length > 0) setDeleteAsk(true)
    else doDelete()
  }

  /** The way out of the delete question that is not deletion: name a
   * successor. Closes one dialog and opens the other rather than acting, so
   * the person still chooses who. */
  function handOn(): void {
    setDeleteAsk(false)
    setTransferOpen(true)
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
      if (gates?.trash === true) askDelete()
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

  const progressFact =
    completionTotal > 0 ? `${String(completionDone)} of ${String(completionTotal)} done` : null
  /* Work and a section's tab are lists; "Show completed" belongs to them. */
  const listFacet = activeFacet?.kind === 'main' || activeFacet?.kind === 'work'
  const viewMenu = listFacet ? (
    <FolderViewMenu
      showCompleted={showCompleted}
      onShowCompleted={changeShowCompleted}
    />
  ) : undefined

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
          }}
        >
          Share
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
        extra={viewMenu}
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
          delete: gates?.trash === true ? askDelete : undefined,
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
        {/* The filter's chips stay in the window bar's lead, so a narrowing
            remembered for this folder can always be seen and cleared. */}
        <PlaceFilterChips place={place} />

        <div className="space-y-4">
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
              progress={progressFact}
              actions={headerActions}
              coverKey={coverKey}
            />
          </PageSection>

          {facets.data ? (
            <FolderTabs
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
              Could not load this folder’s tabs. Reload to try again.
            </p>
          ) : null}
        </div>

        {activeFacet?.kind === 'main' ? (
          <div className="mt-2 space-y-2">
            <div className="flex justify-end">
              <ViewSwitch mode={place.mode} onMode={place.setMode} />
            </div>
            <PageSection name="All open tasks">
              <PageBody
                query={open}
                /* No view here draws the generic empty state: Linear and Board
                   each end with their own add row, which an empty page needs. */
                isEmpty={false}
                emptyCopy={FOLDER_EMPTY}
                emptyIcon={FolderIcon}
                truncated={open.data?.truncated ?? false}
              >
                {place.mode === 'board' ? (
                  /* A page's Board is by status, Not started · In progress ·
                     Done, and a drop changes it (round 2). */
                  <BoardView
                    folderId={id}
                    tasks={visible}
                    completed={completedRows}
                    showCompleted={showCompleted}
                    today={place.today}
                    context={context}
                    actions={actions}
                  />
                ) : place.mode === 'linear' ? (
                  page.data ? (
                    <LinearView
                      folderId={id}
                      page={page.data}
                      tasks={visible}
                      completed={completedRows}
                      showCompleted={showCompleted}
                      today={place.today}
                      context={context}
                      actions={actions}
                    />
                  ) : null
                ) : visible.length === 0 && openRows.length > 0 ? (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">
                    {FILTER_NARROWED_EMPTY}
                  </p>
                ) : isNarrowed(place.filter) || place.filter.sort !== 'manual' || place.groupBy !== 'none' ? (
                  <div className="space-y-3">
                    {boardColumns.map((group) => <div key={group.key}>
                      {place.groupBy !== 'none' ? <h2 className="mb-2 text-sm font-medium">{group.name}</h2> : null}
                      <TaskRows tasks={group.rows} context={context} actions={actions} onAsk={confirm.ask} arrangement={{ arrangeable: false }} />
                    </div>)}
                  </div>
                ) : (
                  <Suspense fallback={null}>
                  {page.data && completedReady ? <FolderCanvas
                    key={id}
                    page={page.data}
                    tasks={openRows}
                    completed={completedRows}
                    showCompleted={showCompleted}
                    folderId={id}
                    context={context}
                    actions={actions}
                    onAsk={confirm.ask}
                    arrangeable={
                      !isNarrowed(place.filter) &&
                      place.filter.sort === 'manual' &&
                      place.groupBy === 'none'
                    }
                  /> : page.isError ? <p role="alert" className="text-sm text-muted-foreground">Could not load writing. Reload to try again.</p> : null}
                  </Suspense>
                )}
              </PageBody>
            </PageSection>
            {/* #214: the documents that link to this Folder. Absent while none do. */}
            <ReferencedFrom kind="folder" id={id} className="mt-2" />
          </div>
        ) : activeFacet ? (
          <FacetContent
            facet={activeFacet}
            folderId={id}
            folderPage={page.data}
            tasks={openRows}
            completed={completedRows}
            completedReady={completedReady}
            showCompleted={showCompleted}
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
      this person just came from shows.

      **An empty list is a sentence and not an empty box.** A folder can be full
      of people and have nobody eligible, and that person's next step — give
      somebody Full control in Share, then come back — is not something an empty
      picker communicates. The wording follows the server's own refusal copy,
      "This folder would be left with nobody in Full control".
       */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Transfer ownership</DialogTitle>
            <DialogDescription>
              {successors.length === 0
                ? `Nobody else in ${detail?.name ?? 'this folder'} has Full control, so there is nobody to hand it to yet. Give a member Full control in Share, then transfer it to them.`
                : `Choose who owns ${detail?.name ?? 'this folder'} next. Only members who have Full control can take it on, and you stay a member.`}
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
            <div className="space-y-1 px-1 pb-2">
              {successors.map((member) => (
                <Button
                  key={member.user.id}
                  variant="ghost"
                  className="h-[var(--control-height)] w-full justify-start px-3 text-sm"
                  onClick={() => {
                    transfer.mutate(
                      { id, to: member.user.id },
                      {
                        onSuccess: () => {
                          setTransferOpen(false)
                        },
                      },
                    )
                  }}
                >
                  {member.user.display_name ?? 'Someone'}
                </Button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* The owner's question: see `askDelete`. */}
      <Dialog open={deleteAsk} onOpenChange={setDeleteAsk}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Delete {detail?.name}?</DialogTitle>
            <DialogDescription>
              {ownerDeleteQuestion(
                detail?.name ?? '',
                others.length,
                successors.length,
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Cancel</Button>} />
            {/* Handing it on opens the picker rather than acting, because
                somebody has to be named: an owner's plain leave is answered
                409. */}
            <Button variant="outline" onClick={handOn}>
              Hand it to a member…
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteAsk(false)
                doDelete()
              }}
            >
              Delete for everyone
            </Button>
          </DialogFooter>
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
  showCompleted,
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
  readonly showCompleted: boolean
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
              <FolderCanvas key={`${folderId}:${facet.id}`} page={document.data} tasks={[]} folderId={folderId} facetId={facet.id} presentationHeadings context={context} actions={actions} onAsk={onAsk} arrangeable={sharedPageEditable} />
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
            <FolderCanvas key={`${folderId}:${facet.id}`} page={folderPage!} tasks={focusedTasks} completed={completed} showCompleted={showCompleted} folderId={folderId} workRootId={facet.h1_block_id ?? undefined} context={context} actions={actions} onAsk={onAsk} arrangeable />
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

/**
 * The page's "…" keeps only "Show completed"; the view itself is chosen on
 * the page, by `ViewSwitch` (round 4).
 */
function FolderViewMenu({
  showCompleted,
  onShowCompleted,
}: {
  readonly showCompleted: boolean
  readonly onShowCompleted: (next: boolean) => void
}): React.JSX.Element {
  return (
    <>
      <DropdownMenuCheckboxItem
        checked={showCompleted}
        onCheckedChange={(checked) => {
          onShowCompleted(checked)
        }}
      >
        <CheckCircle2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
        Show completed
      </DropdownMenuCheckboxItem>
    </>
  )
}

/* Labels only: the stored values ('list' is Freeform) never change. */
const VIEW_CHOICES: readonly { readonly value: ViewMode; readonly label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'board', label: 'Board' },
  { value: 'list', label: 'Freeform' },
]

/**
 * Linear · Board · Freeform, on the page above the tasks: one click, always
 * visible, the current one in the foreground. Arrow keys move between them.
 */
function ViewSwitch({
  mode,
  onMode,
}: {
  readonly mode: ViewMode
  readonly onMode: (next: ViewMode) => void
}): React.JSX.Element {
  return (
    <div role="radiogroup" aria-label="View" className="flex items-center gap-0.5">
      {VIEW_CHOICES.map((choice, index) => {
        const current = choice.value === mode
        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={current}
            tabIndex={current ? 0 : -1}
            onClick={() => {
              onMode(choice.value)
            }}
            onKeyDown={(event) => {
              const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
              if (step === 0) return
              event.preventDefault()
              const next = VIEW_CHOICES[(index + step + VIEW_CHOICES.length) % VIEW_CHOICES.length]
              if (next === undefined) return
              onMode(next.value)
              const group = event.currentTarget.parentElement
              requestAnimationFrame(() => {
                group?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
              })
            }}
            className={cn(
              'h-[var(--control-height)] rounded-sm px-2 text-xs transition-colors',
              current ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {choice.label}
          </button>
        )
      })}
    </div>
  )
}
