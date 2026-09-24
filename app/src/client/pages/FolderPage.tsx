/*
9.6's folder page: cover, mark, name, description, the loose open tasks with a
quick-add, the page's blocks, the Completed section at the foot, and the
conversation in one of its two homes.

What is deliberate rather than transcription:

**The identity is the folder's, written through 4.3's shared columns.** The mark
opens the icon-and-colour picker and PATCHes icon and color; the cover uploads
through 7.15 (kind 'cover') and PATCHes cover_file_id; the description PATCHes
description; the name renders as a heading for everybody and becomes an inline
field on a click or on the menu's Rename.

**All of these are Can edit's.** Can view is read only, and a folder's identity
is shared Folder work, which Can edit may change. AC-011, AC-012 and AC-193
carry it, and `lib/folder-authority.ts` answers it here from the same table the
routes resolve against (issue #228).

A reader below that bar is offered no control a 403 would answer, and still has
a heading, a band and a paragraph to read; the heading is always drawn (AC-226).
4.4's per-member color column is written by no surface here.

**Tasks sit under their sections.** `server/views/cards.ts` projects
`section_block_id` on the folder read, `BlocksEditor`'s `sectionExtras` hook is
passed, each section carries its own rows and its own quick-add, and the loose
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

**The overflow menu lives in the window bar** (9.1: the bar's right end holds
"the object's overflow menu"), named "More actions", offering exactly the acts
this viewer's Access permits: History, Copy link, Duplicate, Save as workflow to
everyone; **Rename at Can edit and above, Delete folder at Full control, Leave
folder to any member who is not the owner and is not the last Full control, and
Transfer ownership to the owner alone**, all through `lib/folder-authority.ts`.
Duplicate is the server's; Save as workflow is a client-side export, structure
and titles only.

**A stale block write is handled visibly**: the 409 carries 5.1's copy, which
the mutation cache already raises as the toast, and the page refetches its
blocks at the same moment so the winning write replaces the loser on screen.

**The conversation has two homes, switched from the surface itself** (9.6): a
closed section at the page's foot, or the side panel, the choice a client-side
preference. The thread fetches only while its surface is open and polls politely
while it stays open.
*/
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router'

import {
  useCreateTask,
  useCreateFacet,
  useFolderPageAction,
  useDeleteFacet,
  useDeleteFolder,
  useLeaveFolder,
  useDeleteComment,
  useDuplicateFolder,
  useUpdateMyMembership,
  usePatchComment,
  usePatchFacet,
  usePostComment,
  usePutFacetOrder,
  usePutMyFacetOrder,
  useRenameFolder,
  useRestoreFolder,
  useSetCommentLike,
  useShareFacet,
  useTransferOwnership,
} from '../api/mutations.js'
import {
  mergeCompletedDays,
  useConnections,
  useFolder,
  useFolders,
  useFolderCompletedTasks,
  useFolderOpenTasks,
  useFolderFacets,
  useFolderPage,
  useFacetPage,
  useShelves,
  useThread,
} from '../api/queries.js'
import { getPlain, uploadFile } from '../api/http.js'
import { queryKeys } from '../api/keys.js'
import { showToast } from '../state/toasts.js'
const FolderCanvas = lazy(() => import('../components/page/canvas/FolderCanvas.js'))
/* The head is the shared page-head composition.
   `components/page/IdentityHead.tsx` stays in the tree for the shelf page;
   nothing here reads it. */
import { AddCoverAction, PageCover } from '../components/page-cover.js'
import { PageDescription, PageMark, usePageHasCover } from '../components/page-head.js'
import { IconPicker } from '../components/page/IconPicker.js'
import { markIcon } from '../components/page/icon-manifest.js'
import { FOLDER_PREFIX } from '../lib/page-identity.js'
import { IDENTITY_COLOR_FALLBACK } from '../parts/identity-colors.js'
import { InlineInput } from '../components/ui/inline-field.js'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover.js'
/* The one thread component, used wherever a conversation happens. */
import { CommentsThread } from '../components/comments.js'
import { HistorySheet } from '../components/history-sheet.js'
import { ObjectMenu } from '../components/object-menu.js'
import { PersonFace } from '../components/person-face.js'

import { AvatarGroup } from '../components/ui/avatar.js'
import { Button } from '../components/ui/button.js'
import { MORE_ACTIONS } from '../components/ui/copy.js'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.js'
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '../components/ui/dropdown-menu.js'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet.js'
/* The empty-state icon goes to `PageBody`, whose `StateIcon` is typed on the
   raw lucide component; everything drawn here comes from the icon module. */
import { Folder as FolderIcon } from 'lucide-react'

import {
  MessageSquare,
  PanelRight,
  Repeat2,
  Share2,
  UserRoundCheck,
} from '../lib/icons.js'
import { formatDayHeading } from '../parts/format-dates.js'
import { folderGroupLabels, initialsOf } from '../parts/presenters.js'
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
import { applyThreadChange, commentFileKind, useConceptThread } from '../lib/thread.js'
import { paths } from '../routes.js'
import { FOLDER_ACTION_PARAM } from '../shell/app-sidebar.js'
import { openTaskForm } from '../shell/overlays.js'
import { useReserveRightEdge } from '../components/right-edge.js'
import { pushUndo, undoLabel } from '../shell/undo.js'
import { WindowBarActions } from '../components/window-bar.js'
import { FolderFacetNavigator } from '../components/folder-facets.js'
import type { CreateFacetInput, FacetCapabilities } from '../components/folder-facets.js'
import { CollapsibleSection, PageSection } from '../components/page/PageSection.js'
import { groupRows, LOOSE } from '../views/grouping.js'
import { PLACES } from '../views/place-pages.js'
import { TaskBoard } from '../views/TaskBoard.js'
import { PlaceControls, PlaceFilterChips, usePlace } from '../views/usePlace.js'
import { isNarrowed } from '../views/filter.js'
import { MorePages, PageBody } from '../components/page/PageStates.js'
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
import type { Facet } from '../../shared/facets.js'
import { getPageResponse } from '../../shared/pages.js'
import type { PageView } from '../../shared/pages.js'
import { workPageOf } from '../components/page/canvas/adapters.js'

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
What each right-edge panel reserves, in pixels.

**These are the widths each panel is already drawn at, restated rather than
introduced**, which is what keeps 11.4's single-tokens-file rule intact: the
conversation sheet is `w-[380px]` in this file and the sharing panel is
`w-[var(--sharing-panel-width)]`, 440px in `tokens.css`. A layout value has to
reach JavaScript to be padding the shell can compute, and the alternative,
reading the panel's own box after it renders, is a measurement that has to
happen after the paint it is supposed to decide.

The sharing panel's number is the one that can drift, its width being a token
that may be retuned. It is named here so a reader looking for the duplicate
finds it named as one.
*/
const CONVERSATION_PANEL_WIDTH = 380
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

/** Where the conversation lives for this viewer, a client preference. */
const CONVERSATION_HOME_KEY = 'dana.conversation.home'
type ConversationHome = 'foot' | 'panel'
function readConversationHome(): ConversationHome {
  try {
    return globalThis.localStorage.getItem(CONVERSATION_HOME_KEY) === 'panel'
      ? 'panel'
      : 'foot'
  } catch {
    return 'foot'
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
  const [search, setSearch] = useSearchParams()
  const folder = useFolder(id)
  /* The Library's own list, for the two things this page reads off it: the
     labels the move submenu offers, and nothing else. 8.3 answers it from the
     same cache entry the sidebar filled, so it costs no request. */
  const library = useFolders()
  /* The move submenu offers the viewer's shelves, as in the sidebar, not only
     the bare membership labels. */
  const shelves = useShelves()
  const open = useFolderOpenTasks(id)
  const page = useFolderPage(id)
  const facets = useFolderFacets(id)
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
  const pageAction = useFolderPageAction()
  const patchFacet = usePatchFacet()
  const deleteFacet = useDeleteFacet()
  const putFacetOrder = usePutFacetOrder()
  const putMyFacetOrder = usePutMyFacetOrder()
  const shareFacet = useShareFacet()
  const duplicate = useDuplicateFolder()
  const membership = useUpdateMyMembership()
  /* Every label in use, which is what the move submenu offers, deduplicated
     and in the order the library holds them. 9.1 makes a group "the label of
     7.4's my-membership and nothing else", so this is the whole of a group. */
  /* The shelves the viewer has made are offered too, not only the labels
     already in use, a shelf with nothing on it yet being exactly the one a
     person wants to move to. `folderGroupLabels` is the union the sidebar
     already draws from, so both surfaces answer from one list rather than from
     two hand-written ones. */
  const groupLabels = folderGroupLabels(library.data ?? [], shelves.data ?? [])
  const postComment = usePostComment()
  const patchComment = usePatchComment()
  const deleteComment = useDeleteComment()
  const setLike = useSetCommentLike()
  const [completedOpen, setCompletedOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  /* An owner deleting a shared folder is asked one question first. */
  const [deleteAsk, setDeleteAsk] = useState(false)
  // 9.6's inline rename: the title is a heading until this is true.
  const [renaming, setRenaming] = useState(false)
  /* Controlled, because "Label and colour" in the overflow has to open the same
     picker the mark opens, and an uncontrolled popover can only be opened by
     pressing it. */
  const [markOpen, setMarkOpen] = useState(false)
  const [conversationHome, setConversationHome] =
    useState<ConversationHome>(readConversationHome)
  /* A notification lands here with `?conversation=open`, so the thread the
     person was told about is open on arrival rather than folded below the fold;
     `search` is the page's own `useSearchParams`, read above. Both homes honour
     it. */
  const arrivingAtThread = search.get('conversation') === 'open'
  const [footThreadOpen, setFootThreadOpen] = useState(arrivingAtThread)
  const [panelOpen, setPanelOpen] = useState(arrivingAtThread)

  const connections = useConnections()
  /* Desk, the account's default folder, has no page-level conversation
     (issue #195): its Tasks carry their own threads, and a thread on the
     person's own landing page is nobody's conversation. Every home of the
     folder thread below is gated on this; comments already there stay in the
     data and in exports. */
  const deskHasNoThread = folder.data?.is_default === true
  const threadOpen =
    !deskHasNoThread &&
    (conversationHome === 'foot' ? footThreadOpen : panelOpen)

  /*
  9.6's two right-edge panels take room rather than covering. Each publishes its
  own width while it is open and the shell pads the page body by whatever is
  reserved; `components/right-edge.tsx` carries one number for both, because
  they share one edge and two open at once would overlap each other long before
  the page noticed.

  History is deliberately not among them. It is a sheet you open, read and
  close, with nothing on the page underneath that you are reading it against,
  which a dialog answers better; the conversation and the sharing panel are the
  two you work beside.
  */
  const conversationPanelOpen =
    !deskHasNoThread && conversationHome === 'panel' && panelOpen
  useReserveRightEdge(CONVERSATION_PANEL_WIDTH, conversationPanelOpen)
  useReserveRightEdge(SHARING_PANEL_WIDTH, sharing)
  const thread = useThread(id, null, threadOpen)

  const detail = folder.data
  const scheduled = open.data?.scheduled ?? []
  const unscheduled = open.data?.unscheduled ?? []
  const bothEmpty = scheduled.length === 0 && unscheduled.length === 0
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
  every other page draws, rather than three more written here. Three things are
  this page's own and arrive as options, each because it needs the folder's id:
  the filter is remembered per folder, since 9.1 keeps a filter "on return to
  that page, never carried to another" and two folders are two pages; and both
  capture points write this folder, which is 9.3's sixth entry-point row.
  */
  const place = usePlace(PLACES.folder, openRows, {
    filterKey: `folder:${id}`,
    capture: (title, column) => {
      create.mutate({
        title,
        folder_id: id,
        ...(column?.due_date === undefined ? {} : { due_date: column.due_date }),
        ...(column?.assignee_id === undefined ? {} : { assignee_id: column.assignee_id }),
      })
    },
    openFull: (column, title) => {
      openTaskForm({
        folder_id: id,
        ...(column?.due_date === undefined ? {} : { due_date: column.due_date }),
        ...(title === undefined || title === '' ? {} : { title }),
      })
    },
  })
  /* Read while the foot is open, and while the board is up, whose Done column
     is drawn from the same pages. */
  const completed = useFolderCompletedTasks(id, completedOpen || place.mode === 'board')
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
  /*
  The board's Done column. No section and Done are the two columns that are not
  sections: one is a place, one is a status, and both take drops. Drawn only on
  the sections axis, and never as a capture: a quick-add under Done would make a
  finished task, which is not a thing.
  */
  const boardWithDone =
    place.groupBy === 'section'
      ? [
          ...boardColumns,
          {
            key: '__done',
            name: 'Done',
            mark: null,
            capture: null,
            rows: completedDays.flatMap((day) => day.rows),
            done: true,
          },
        ]
      : boardColumns

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
  const hasCover = usePageHasCover(coverKey)

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
  const activeFacet = facetRows.find(
    (facet) => facet.id === requestedFacetId && (!facet.hidden || facet.kind === 'purpose'),
  ) ?? mainFacet

  const selectFacet = useCallback((facet: Facet): void => {
    setSearch((current) => {
      const next = new URLSearchParams(current)
      if (facet.kind === 'main') next.delete('facet')
      else next.set('facet', facet.id)
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
     Task's endless occurrences never grow the denominator; they are named
     apart as "N recurring". `counts` is the fallback for an older server. */
  const progress = detail?.progress
  const completionDone = progress?.done ?? detail?.counts.completed ?? 0
  const completionTotal =
    progress?.total ??
    (detail?.counts.completed ?? 0) + (detail?.counts.pending ?? 0)
  const recurringActive = progress?.recurring_active ?? 0
  /* Each Section's own "done/total" rides its heading on the canvas. The
     canvas is BlockNote's document, whose headings are not ours to render,
     so the chip is a pseudo-element keyed by the block id: never editable,
     never saved, and no edit to the canvas itself. Ids are zod-checked uuids
     and the text is digits, so nothing in the rule is user-authored. */
  const sectionChips = (detail?.section_progress ?? [])
    .filter((entry) => entry.total > 0 || entry.recurring_active > 0)
    .map((entry) => {
      const parts = [
        entry.total > 0 ? `${entry.done}/${entry.total}` : '',
        entry.recurring_active > 0 ? `↻ ${entry.recurring_active}` : '',
      ].filter((part) => part !== '')
      return `.dana-writing-canvas .bn-block[data-id="${entry.section_block_id}"] > .bn-block-content[data-content-type='heading']::after{content:"${parts.join(' · ')}"}`
    })
  const sectionChipStyle =
    sectionChips.length === 0
      ? ''
      : `.dana-writing-canvas .bn-block-content[data-content-type='heading']::after{margin-inline-start:calc(var(--spacing) * 2);align-self:center;flex-shrink:0;font-size:var(--text-xs);line-height:var(--text-xs--line-height);font-weight:var(--font-weight-normal);color:var(--muted-foreground);font-variant-numeric:tabular-nums;user-select:none;pointer-events:none} ${sectionChips.join(' ')}`
  /* The description is offered at rest on a folder nobody has dressed, where a
     hidden affordance is one nobody discovers. */
  const pristine =
    detail !== undefined &&
    detail.icon === null &&
    detail.cover_file_id === null &&
    detail.description === null

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
    remove.mutate(id, {
      onSuccess: () => {
        pushUndo(undoLabel('Deleted', name), () => {
          restore.mutate(id)
        })
        navigate(paths.desk)
      },
    })
  }

  function createFolderFacet(input: CreateFacetInput): void {
    createFacet.mutate({
      folderId: id,
      body: input.kind === 'work'
        ? { kind: 'work', h1_block_id: input.h1BlockId, after_facet_id: activeFacet?.id }
        : { kind: input.kind, display_name: input.name, after_facet_id: activeFacet?.id },
    }, { onSuccess: selectFacet })
  }

  function createWorkSection(name: string): void {
    const existing = new Set(page.data?.blocks.map((block) => block.id) ?? [])
    pageAction.mutate({
      id,
      body: {
        action: 'insert_block',
        block_kind: 'section',
        text: name,
        section_block_id: null,
        after: page.data?.items.at(-1) ?? null,
        before: null,
      },
    }, {
      onSuccess: (next) => {
        cache.setQueryData(queryKeys.folderPage(id), next)
        const section = next.blocks.find((block) =>
          block.kind === 'section' && block.section_block_id === null && !existing.has(block.id))
        if (section === undefined) return
        createFacet.mutate({
          folderId: id,
          body: { kind: 'work', h1_block_id: section.id, after_facet_id: activeFacet?.id },
        }, { onSuccess: selectFacet })
      },
    })
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

  function removeFolderFacet(facet: Facet): void {
    confirm.ask(
      `Delete ${facet.name}? It will wait in Trash for 30 days.`,
      () => deleteFacet.mutate({ folderId: id, facetId: facet.id }, {
        onSuccess: () => {
          if (mainFacet) selectFacet(mainFacet)
        },
      }),
    )
  }

  function exposeFolderFacet(facet: Facet): void {
    confirm.ask(
      `Share ${facet.name} with everyone in ${detail?.name ?? 'this folder'}? Its current writing will become visible according to Folder access.`,
      () => shareFacet.mutate({ folderId: id, facetId: facet.id }),
    )
  }

  function reorderFolderFacets(dragged: Facet, orderedVisible: readonly Facet[]): void {
    if (dragged.private) {
      const index = orderedVisible.findIndex((facet) => facet.id === dragged.id)
      const anchor = index > 0 ? orderedVisible[index - 1] : null
      putMyFacetOrder.mutate({
        folderId: id,
        body: { placements: [{ facet_id: dragged.id, after_facet_id: anchor?.id ?? null }] },
      })
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
    })
  }

  function askLeave(): void {
    confirm.ask(leaveFolderConfirm(detail?.name ?? ''), () => {
      leave.mutate(id, { onSuccess: () => navigate(paths.desk) })
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
      showToast('Could not read this folder’s reusable content, so nothing was saved.')
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
    anchor.download = `${detail?.name ?? 'folder'}.dana-workflow.json`
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
        : ` ${String(saved.omitted)} ${saved.omitted === 1 ? 'picture, file or folder link is' : 'pictures, files and folder links are'} not included.`
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
    showToast(
      `"${detail?.name ?? 'Folder'}" saved as a workflow file. Import it from the sidebar.${missing}${finished}`,
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
    if (ranAction.current) return
    const action = search.get(FOLDER_ACTION_PARAM)
    if (action === null) return
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

  const conversationSwitch = (
    <button
      type="button"
      onClick={() => {
        const next: ConversationHome =
          conversationHome === 'foot' ? 'panel' : 'foot'
        setConversationHome(next)
        try {
          globalThis.localStorage.setItem(CONVERSATION_HOME_KEY, next)
        } catch {
          /* A preference that cannot persist is still this session's. */
        }
        if (next === 'panel') {
          setPanelOpen(true)
          setFootThreadOpen(false)
        } else {
          setPanelOpen(false)
        }
      }}
      className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[12px] leading-4 text-[var(--color-graphite-500)] transition-colors outline-none hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)]"
    >
      <PanelRight className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
      {conversationHome === 'foot' ? 'Move to side panel' : 'Move to page'}
    </button>
  )

  /*
  Who a comment's author is, for the lifted thread, and stable so the mapping
  memoises. A face the roster cannot resolve says "Someone" rather than leaking
  an id, which is the rule the history sheet and the bell both keep.
  */
  const personOf = useCallback(
    (authorId: string) => authorPeople.get(authorId) ?? { name: 'Someone' },
    [authorPeople],
  )
  /* What this folder's conversation may offer (issue #268). The route resolves
     moderation as `comment.moderate` (Full control's, which custody does not
     confer) and the author's own edit and delete as `comment.mutate.own` (Can
     comment or better, which authorship does not confer). Same table, same call
     as every other gate on this page (AC-790).

     Memoised because it is the identity `useConceptThread` keys its own memo
     on; `gates` is rebuilt every render, so an inline object would remap the
     whole thread each time. Null gates means the roster has not landed, and the
     honest answer then is to offer nothing rather than to guess — the same
     direction every other gate on this page takes. */
  const mayConverse = useMemo(
    () => ({
      moderate: gates?.moderate === true,
      mutateOwnComment: gates?.mutateOwnComment === true,
      likeComment: gates?.likeComment === true,
      createComment: gates?.createComment === true,
    }),
    [
      gates?.moderate,
      gates?.mutateOwnComment,
      gates?.likeComment,
      gates?.createComment,
    ],
  )
  const conversation = useConceptThread(
    thread.data?.comments,
    basis.viewerId,
    personOf,
    mayConverse,
  )

  /*
  The whole of the write path in this file: the thread announces a change as the
  array it wants to exist, and `lib/thread.ts` turns that into 7.14's routes.
  Its header carries the argument for the shape.

  The upload is here rather than in `lib/thread.ts` because a comment's file is
  7.15's, scoped to this folder like every other file in it, and this page is
  the one thing that knows which folder that is.
  */
  const threadSurface = (
    <div>
      <div className="flex justify-end pb-1">{conversationSwitch}</div>
      <CommentsThread
        comments={conversation}
        /* The composer's own half of `comment.create`; Reply's half rides each
           comment. Disabled rather than hidden, and its sentence says what
           standing commenting needs (issue #268; AC-790). */
        canComment={mayConverse.createComment}
        emptyWord={conversationHome === 'panel' ? 'message' : 'comment'}
        layout={conversationHome === 'panel' ? 'pinned' : 'block'}
        onChange={(next) => {
          applyThreadChange(conversation, next, {
            post: (body) => {
              postComment.mutate({ folderId: id, body })
            },
            edit: (commentId, body) => {
              patchComment.mutate({ id: commentId, body: { body } })
            },
            remove: (commentId) => {
              deleteComment.mutate(commentId)
            },
            like: (commentId, liked) => {
              setLike.mutate({ id: commentId, liked })
            },
            upload: (file) =>
              uploadFile(commentFileKind(file), id, file).then((stored) => stored.id),
          })
        }}
      />
    </div>
  )

  return (
    <div className="space-y-7">
      {/* The header is the folder read, so a folder the viewer cannot see
          renders 10.2's answer here: nonexistent, never forbidden. */}
      <PageBody query={folder} isEmpty={false} emptyCopy="">
        {/* 9.6's "the filter of 9.1 narrows the page without touching its
            arrangement": the chips at the bar's left end, the view strip and
            the filter at its right. Drawn by the same component every place
            page uses, which is what makes this one filter rather than a ninth. */}
        <PlaceFilterChips place={place} />
        {/* Order 2, which is 9.1's own sentence for the bar's right end:
            "the view strip, the filter control, the Activity line, and the
            object's overflow menu". The first two are `PlaceChrome`'s at the
            default order and the third is the shell's at 1. */}
        <WindowBarActions order={2}>
          {/* The conversation's opener when its home is the panel; the foot
              section is its own opener otherwise. */}
          {conversationHome === 'panel' && !isDefault ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Conversation"
              className="size-7 rounded-md text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)]"
              onClick={() => {
                setPanelOpen(true)
              }}
            >
              <MessageSquare className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </Button>
          ) : null}
          {/*
          The member faces and Share, in the bar rather than in the head.

          They are the window's controls and not the page's content: a header
          that carries them scrolls its own chrome away, and it puts two tiers
          of control forty pixels apart. An icon rather than a filled block,
          because the bar is chrome and chrome is quiet.
           */}
          {isDefault || members.length < 2 ? null : (
            /* 9.6's member stack. One face is not a stack: a folder nobody
               shares draws its owner's own picture at nobody, which is the
               same noise the Share control is withheld for. */
            <AvatarGroup>
              {members.map((member) => (
                /* The uploaded picture, and the name on hover. */
                <span key={member.user.id} title={member.user.display_name ?? 'Someone'}>
                  <PersonFace
                    name={member.user.display_name ?? 'Someone'}
                    initials={initialsOf(member.user.display_name ?? 'Someone')}
                    image={member.user.avatar_url}
                  />
                </span>
              ))}
            </AvatarGroup>
          )}
          {/* 9.6's Share control. Withheld on a default folder, which
              INV-2 makes single-member and 5.3 refuses an add on. The name
              is the word it always answered to; AC-162 and AC-183 reach the
              sharing panel through it. */}
          {isDefault ? null : (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Share"
              aria-expanded={sharing}
              className="size-7 rounded-md text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)]"
              onClick={() => {
                setSharing(!sharing)
              }}
            >
              <Share2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </Button>
          )}
          {/*
          9.1: the bar's right end holds the object's overflow menu, and it is
          the object's contract rather than this page's list, so where a person
          stands does not decide what they can do to the same folder.
          `lib/object-acts.ts` owns the words, the glyphs and the order; what
          stays the page's own is "Transfer ownership", 9.6's act for an owner
          with somewhere to hand the folder to and one no other surface can
          offer.
           */}
          <ObjectMenu
            kind="folder"
            name={detail?.name ?? ''}
            align="end"
            trigger={
              <Button
                variant="ghost"
                size="icon"
                aria-label={MORE_ACTIONS}
                className="size-7 rounded-md text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)]"
              />
            }
            /* **Offered whenever the folder is shared and the viewer owns it,
               rather than only when somebody is eligible.** The eligible list
               can be empty for a folder full of people, and an owner who must
               transfer before they can leave would then be offered no route at
               all and no reason. The dialog says what to do instead, which is a
               sentence the menu cannot carry. */
            extra={
              gates?.transferOwnership === true && others.length > 0 ? (
                <DropdownMenuItem
                  onClick={() => {
                    setTransferOpen(true)
                  }}
                >
                  <UserRoundCheck className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  Transfer ownership
                </DropdownMenuItem>
              ) : undefined
            }
            handlers={{
              history: () => {
                setHistoryOpen(true)
              },
              /* Accepted R8A: a folder's name is ordinary shared Folder work,
                 which Can edit and above change and nobody below does
                 (AC-011, AC-012, AC-193). It read `isOwner`. */
              rename:
                gates?.identity === true
                  ? () => {
                      setRenaming(true)
                    }
                  : undefined,
              /* The personal label, as the Library row offers it. It is
                 arrangement rather than identity (9.6's matrix: "personal,
                 always"), so it is the same write from either surface. */
              move: {
                choose: (
                  <DropdownMenuRadioGroup
                    value={detail?.my_shelf ?? '__none'}
                    onValueChange={(value) => {
                      const previous = detail?.my_shelf ?? null
                      const next = value === '__none' ? null : value
                      if (next === previous) return
                      membership.mutate(
                        { id, body: { shelf: next } },
                        {
                          /* A shelf move has a way back, the undo bar, like
                             every other move. */
                          onSuccess: () => {
                            pushUndo(
                              next === null
                                ? `Took "${detail?.name ?? ''}" off ${previous ?? 'its shelf'}`
                                : `Moved "${detail?.name ?? ''}" to ${next}`,
                              () => {
                                membership.mutate({ id, body: { shelf: previous } })
                              },
                            )
                          },
                        },
                      )
                    }}
                  >
                    {groupLabels.map((label) => (
                      <DropdownMenuRadioItem key={label} value={label} closeOnClick>
                        {label}
                      </DropdownMenuRadioItem>
                    ))}
                    {groupLabels.length > 0 ? <DropdownMenuSeparator /> : null}
                    {/* One word for the thing: the way off a shelf is not a
                        "group". */}
                    <DropdownMenuRadioItem value="__none" closeOnClick>
                      Not on a shelf
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                ),
              },
              'copy-link': () => {
                /* One answer to "where does this object live", from
                   `lib/nav-links.ts`. It was spelled inline here, on the
                   sidebar's folder row and on the shelf page, which is three
                   copies of one address. */
                void navigator.clipboard.writeText(folderLink(id))
                showToast('Link copied')
              },
              duplicate: () => {
                /* Duplicated server-side; the copy is the duplicator's own
                   private folder, and the page goes to it. */
                duplicate.mutate(id, {
                  onSuccess: (made) => {
                    /* 9.6: "the bar says which happened": two sentences, read
                       off 7.16's `shifted_days`. */
                    /* Said where it applies: a duplicate is the structure, so
                       every task arrives open. */
                    showToast(
                      made.shifted_days > 0
                        ? `"${made.name}" made from "${detail?.name ?? ''}" with every task open, dates moved to start today`
                        : `"${made.name}" made from "${detail?.name ?? ''}" with every task open`,
                    )
                    navigate(paths.folder(made.id))
                  },
                })
              },
              workflow: () => {
                void saveAsWorkflow()
              },
              /* Leaving is any member's, and refused to the owner until they
                 transfer and to the last Full-control member by the continuity
                 invariant. Both of those are state rather than preset, and
                 `folderGates` reads them off the roster this page already has. */
              leave: gates?.leave === true ? askLeave : undefined,
              /* Moving a folder to Trash is Full control's, and custody does
                 not confer it, so an owner whose Access dropped below Full
                 control is not offered it (AC-015). */
              delete: gates?.trash === true ? askDelete : undefined,
            }}
          />
        </WindowBarActions>

        <div className="space-y-3">
        <PageSection name="Folder header">
          {/*
          **The head is the shared page-head composition** (`page-cover`,
          `page-head`, `folder-cover`), so a treatment settled once is not left
          in each screen's keeping.

          **The name is "Icon and colour for {name}"**, which AC-243 and AC-247
          both address. Section 9 fixes no name here.

          **The picker is this client's `IconPicker`.** 4.3's `icon` is a stored
          key checked against `^[a-z0-9-]{1,40}$`, and
          `components/page/icon-manifest.ts` is the one place this client maps a
          stored key to a glyph, read by the sidebar, the folder marks and the
          search results as well as by this popover. A second picker would put a
          second glyph alphabet beside it.
           */}
          {/* The band is drawn full-bleed with the mark riding up over it, the
              same geometry as every place page (`page-head.tsx`): the same
              wrapper undoing the shell's inset, the same top padding when there
              is no band. */}
          {/* The horizontal half of that inset lives in `page-cover.tsx`:
              `-mx-10` reached the shell's padding and never its
              `--shell-content-max` cap. The top inset stays here, and follows
              the shell's own two measures. */}
          {hasCover ? (
            <div className="-mt-4 md:-mt-6">
              {/* The cover is one of the 4.3 identity fields accepted R8A
                  makes Can edit's (AC-011, AC-193), so a viewer below that
                  bar reads the band and is offered nothing on it. */}
              <PageCover storageName={coverKey} readOnly={gates?.identity !== true} />
            </div>
          ) : null}
          {/* One column since the faces and Share moved to the window bar:
              the split this header used to make had a right-hand column in
              it, and `page-head.tsx` draws the same head without one. */}
          <header className={`group/head ${hasCover ? '' : 'pt-2'}`}>
            <div className="min-w-0">
              {/*
              The icon and the colour, two more of the five identity fields.
              **Drawn as a plain mark rather than as a disabled trigger** for
              a viewer below Can edit: `PageMark`'s `interactive` is what
              gives it the hover and the pointer, and a control that looks
              pressable and answers 403 is the thing AC-011 is about.
              */}
              {gates?.identity === true ? (
                <Popover open={markOpen} onOpenChange={setMarkOpen}>
                  <PopoverTrigger
                    render={
                      <PageMark
                        icon={markIcon(detail?.icon ?? null)}
                        hasCover={hasCover}
                        color={detail?.color ?? IDENTITY_COLOR_FALLBACK}
                        interactive
                        aria-label={`Icon and colour for ${detail?.name ?? ''}`}
                      />
                    }
                  />
                  <PopoverContent align="start" className="w-auto p-0">
                    <IconPicker
                      icon={detail?.icon ?? null}
                      color={detail?.color ?? null}
                      onPick={(next) => {
                        patch.mutate({ id, body: next })
                      }}
                    />
                  </PopoverContent>
                </Popover>
              ) : (
                <PageMark
                  icon={markIcon(detail?.icon ?? null)}
                  hasCover={hasCover}
                  color={detail?.color ?? IDENTITY_COLOR_FALLBACK}
                />
              )}

              <div className="mt-1">
                <AddCoverAction
                  storageName={coverKey}
                  readOnly={gates?.identity !== true}
                />
              </div>

              {/* The count rides the title's own line rather than stacking a
                  third block under it, which is 9.4's "the fact 'N of M done'":
                  the fact rides the title's line; prose sits under it. */}
              {/* On a phone the counter wraps under the name rather than
                  cutting it to "Apart...". */}
              <div className="mt-1.5 flex items-baseline gap-3 max-md:flex-col max-md:items-start max-md:gap-1">
                {gates?.identity === true && renaming ? (
                  <InlineInput
                    key={detail?.name ?? ''}
                    defaultValue={detail?.name ?? ''}
                    aria-label="Folder name"
                    maxLength={100}
                    autoFocus
                    onBlur={(event) => {
                      const next = event.target.value.trim()
                      setRenaming(false)
                      if (next !== '' && next !== detail?.name) {
                        patch.mutate({ id, body: { name: next } })
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                      if (event.key === 'Escape') {
                        event.currentTarget.value = detail?.name ?? ''
                        event.currentTarget.blur()
                      }
                    }}
                    className="min-w-0 text-2xl leading-8 font-semibold text-foreground"
                  />
                ) : (
                  /* A heading, always: it is what a reader lands on and what
                     AC-226 asks the imported starter's page for, and a viewer
                     who may not rename is offered no textbox at all (AC-217:
                     the bar is Can edit rather than ownership). */
                  <h1
                    onClick={
                      gates?.identity === true
                        ? () => {
                            setRenaming(true)
                          }
                        : undefined
                    }
                    className={`min-w-0 max-w-full truncate text-2xl leading-8 font-semibold text-foreground max-md:whitespace-normal${
                      gates?.identity === true ? ' cursor-text' : ''
                    }`}
                  >
                    {detail?.name ?? ''}
                  </h1>
                )}
                {completionTotal > 0 || recurringActive > 0 ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-xs leading-4 text-muted-foreground tabular-nums">
                    {completionTotal > 0 ? (
                      <span>
                        {completionDone} of {completionTotal} done
                      </span>
                    ) : null}
                    {completionTotal > 0 && recurringActive > 0 ? (
                      <span aria-hidden="true">·</span>
                    ) : null}
                    {recurringActive > 0 ? (
                      <span
                        className="inline-flex items-center gap-0.5"
                        title="Recurring Tasks are not counted in the total"
                      >
                        <Repeat2 className="size-3" strokeWidth={1.75} aria-hidden="true" />
                        {recurringActive} recurring
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </div>

              {/* 9.6's editable description. **It was "any member's", on
                  9.6's role matrix ("the page: blocks, cover, icon, colour,
                  description, yes for both roles; the event log says who"),
                  and accepted #209 R8A overturns that half of the matrix**:
                  Can view is read only, and a folder's description is shared
                  Folder work. AC-011 refuses it below Can edit on the wire,
                  so the field is a paragraph there rather than a textarea
                  that loses what was typed into it. It reads and writes 4.3's
                  column through `lib/page-identity.ts`'s folder half, which is
                  why the lifted field needs nothing of its own here. */}
              <PageDescription
                storageName={coverKey}
                label="Folder description"
                offer={pristine}
                readOnly={gates?.identity !== true}
              />
            </div>
          </header>
        </PageSection>

        {facets.data ? (
          <FolderFacetNavigator
            facets={isDefault
              ? facetRows.filter((facet) => facet.kind !== 'consultation')
              : facetRows}
            activeId={activeFacet?.id ?? ''}
            capabilities={facetCapabilities}
            page={page.data}
            onSelect={selectFacet}
            onCreate={createFolderFacet}
            onCreateWorkSection={createWorkSection}
            onReorder={reorderFolderFacets}
            onRename={renameFolderFacet}
            onHide={hideFolderFacet}
            onDelete={removeFolderFacet}
            onShare={exposeFolderFacet}
            controls={activeFacet?.kind === 'main' || activeFacet?.kind === 'work'
              ? <PlaceControls place={place} />
              : undefined}
          />
        ) : (
          <p role={facets.isError ? 'alert' : 'status'} className="text-sm text-muted-foreground">
            {facets.isError ? 'Could not load facets. Reload to try again.' : 'Loading facets…'}
          </p>
        )}
        </div>

        {activeFacet?.kind === 'main' ? <div className="mt-7 space-y-7">
          {/*
          The open list and the page's blocks are one body, not two regions with
          a hole between them.

          They stack at 8px because the insertion lines carry the separation
          between blocks, so the stack's own gap is small; two 24px gaps in a
          row read as a hole. A larger gap here would put the first insertion
          line visibly apart from anything above it. The 28px stays where it is
          the separation between the body and Done.
           */}
          <div className="space-y-2">
            <PageSection name="All open tasks">
              <PageBody
                query={open}
                /* A board whose Done column holds finished work is not an empty
                   page: the last open task completed by a drop must not take
                   the board with it. */
                isEmpty={place.mode === 'board' && bothEmpty && completedDays.length === 0}
                emptyCopy={FOLDER_EMPTY}
                emptyIcon={FolderIcon}
                truncated={open.data?.truncated ?? false}
              >
                {place.mode === 'board' ? (
                  /* The board is the shared `views/TaskBoard.tsx` and not a
                     second one, so a change to it reaches here and every place
                     page together (AC-259). */
                  <TaskBoard
                    place={place}
                    columns={boardWithDone}
                    context={context}
                    actions={actions}
                  />
                ) : visible.length === 0 && openRows.length > 0 ? (
                  <p className="h-[var(--control-height)] px-2 text-sm leading-[var(--control-height)] text-[var(--color-graphite-500)]">
                    {FILTER_NARROWED_EMPTY}
                  </p>
                ) : isNarrowed(place.filter) || place.filter.sort !== 'manual' || place.groupBy !== 'none' ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">This is a Task view. Return to the unfiltered manual list to edit writing and group placement.</p>
                    {boardColumns.map((group) => <div key={group.key}>
                      {place.groupBy !== 'none' ? <h2 className="mb-2 text-sm font-semibold">{group.name}</h2> : null}
                      <TaskRows tasks={group.rows} context={context} actions={actions} onAsk={confirm.ask} arrangement={{ arrangeable: false }} />
                    </div>)}
                  </div>
                ) : (
                  <Suspense fallback={<p role="status">Loading writing…</p>}>
                  {sectionChipStyle === '' ? null : <style>{sectionChipStyle}</style>}
                  {page.data ? <FolderCanvas
                    key={id}
                    page={page.data}
                    tasks={openRows}
                    folderId={id}
                    context={context}
                    actions={actions}
                    onAsk={confirm.ask}
                    arrangeable={
                      !isNarrowed(place.filter) &&
                      place.filter.sort === 'manual' &&
                      place.groupBy === 'none'
                    }
                  /> : <p role={page.isError ? 'alert' : 'status'}>{page.isError ? 'Could not load writing. Reload to try again.' : 'Loading writing…'}</p>}
                  </Suspense>
                )}
              </PageBody>
            </PageSection>

          </div>

          {/* Q7 hides the third section while it is empty; the control is
              rendered on the folder's own completed count. Not while the board
              is up, whose Done column is the same rows. And "Done", not
              "Completed": one word for the finished pile everywhere. */}
          {(detail?.counts.completed ?? 0) === 0 || place.mode === 'board' ? null : (
            <CollapsibleSection
              name="Done"
              count={detail?.counts.completed ?? 0}
              defaultOpen={false}
              onOpenChange={setCompletedOpen}
            >
              {completedDays.map((day) => (
                <PageSection
                  key={day.date}
                  name={formatDayHeading(day.date, basis.today)}
                  heading={formatDayHeading(day.date, basis.today)}
                  tone="day"
                >
                  <TaskRows
                    tasks={day.rows}
                    context={context}
                    actions={actions}
                    onAsk={confirm.ask}
                  />
                </PageSection>
              ))}
              <MorePages query={completed} />
            </CollapsibleSection>
          )}

          {/* The conversation's foot home: a closed section at the page's
              foot (9.6). Its other home is the side panel below. */}
          {conversationHome === 'foot' && !isDefault ? (
            <CollapsibleSection
              name="Conversation"
              defaultOpen={false}
              onOpenChange={setFootThreadOpen}
            >
              {threadSurface}
            </CollapsibleSection>
          ) : null}
        </div> : activeFacet ? (
          <FacetContent
            facet={activeFacet}
            folderId={id}
            folderPage={page.data}
            tasks={openRows}
            context={context}
            actions={actions}
            onAsk={confirm.ask}
            consultation={threadSurface}
            sharedPageEditable={sharedPageEditable}
            onOpenMain={() => { if (mainFacet) selectFacet(mainFacet) }}
          />
        ) : null}
      </PageBody>

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
      The conversation's panel home, which takes room from the page rather than
      covering it.

      It publishes its width to `components/right-edge.tsx` and the shell pads
      the page body by it, which is the whole mechanism. The sheet is still a
      sheet, so the escape key, the focus trap and the close control are the
      primitive's; the page underneath it is narrower and readable rather than
      hidden, which is the one thing a side-by-side view exists for.
       */}
      <Sheet
        open={conversationPanelOpen}
        onOpenChange={setPanelOpen}
        /*
        Non-modal. A modal sheet makes the document beneath it inert and hides
        it behind a backdrop, so a panel sitting over the page would hide the
        row the task came from, and reserving room on the right would be
        decoration, since the page it uncovered could be neither read nor
        touched. So the backdrop goes and the page stays live. What is kept is
        everything else the primitive gives a sheet, the escape key, the focus
        handling and the close control.
        */
        modal={false}
      >
        <SheetContent side="right" className="w-[380px]" overlayClassName="hidden">
          <SheetHeader>
            <SheetTitle>Conversation</SheetTitle>
            <SheetDescription>{detail?.name}</SheetDescription>
          </SheetHeader>
          <PageSection name="Conversation">
            <div className="overflow-y-auto px-4 pb-4">{threadSurface}</div>
          </PageSection>
        </SheetContent>
      </Sheet>

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
  readonly context: RowContext
  readonly actions: ReturnType<typeof useRowActions>
  readonly onAsk: (message: string, action: () => void) => void
  readonly consultation: React.ReactNode
  readonly sharedPageEditable: boolean
  readonly onOpenMain: () => void
}): React.JSX.Element {
  const blank = facet.kind === 'shared_blank' || facet.kind === 'private_blank'
  const document = useFacetPage(folderId, facet.id, blank || facet.kind === 'purpose')

  if (facet.kind === 'consultation') {
    return <div className="mt-7"><PageSection name="Consultation">{consultation}</PageSection></div>
  }
  if (facet.kind === 'purpose') {
    return (
      <div className="mt-7">
        {document.data ? (
          <>
            {document.data.items.length === 0 ? (
              <p className="mb-3 px-2 text-xs leading-5 text-muted-foreground">
                Describe why this work exists, what it aims to achieve, or what should guide it.
              </p>
            ) : null}
            <Suspense fallback={<p role="status">Loading writing…</p>}>
              <FolderCanvas key={`${folderId}:${facet.id}`} page={document.data} tasks={[]} folderId={folderId} facetId={facet.id} presentationHeadings context={context} actions={actions} onAsk={onAsk} arrangeable={sharedPageEditable} />
            </Suspense>
          </>
        ) : <p role={document.isError ? 'alert' : 'status'}>{document.isError ? 'Could not load Purpose. Reload to try again.' : 'Loading writing…'}</p>}
      </div>
    )
  }
  if (facet.kind === 'results') {
    return (
      <div className="mx-auto mt-10 flex min-h-64 max-w-[440px] flex-col items-center justify-center px-6 text-center">
        <h2 className="text-sm font-semibold text-[var(--color-graphite-800)]">{facet.name}</h2>
        <p className="mt-1.5 max-w-[40ch] text-xs leading-5 text-muted-foreground">
          Bring outcomes, signals, and evidence of progress into one view.
        </p>
        <span className="mt-3 text-[11px] text-[var(--color-graphite-400)]">Guided workspace coming soon</span>
      </div>
    )
  }
  if (facet.kind === 'work') {
    const focused = folderPage && facet.h1_block_id ? workPageOf(folderPage, facet.h1_block_id) : null
    const ids = new Set(focused?.items.map((item) => item.id) ?? [])
    const focusedTasks = tasks.filter((task) => ids.has(task.id))
    return (
      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-graphite-100)] pb-2.5 text-xs text-muted-foreground">
          <span>This is the live section from Main. Changes here update the same Tasks and writing.</span>
          <Button variant="ghost" size="sm" onClick={onOpenMain}>Open in Main</Button>
        </div>
        {focused ? (
          <Suspense fallback={<p role="status">Loading section…</p>}>
            <FolderCanvas key={`${folderId}:${facet.id}`} page={folderPage!} tasks={focusedTasks} folderId={folderId} workRootId={facet.h1_block_id ?? undefined} context={context} actions={actions} onAsk={onAsk} arrangeable />
          </Suspense>
        ) : <p role="status">Loading section…</p>}
      </div>
    )
  }
  return (
    <div className="mt-7">
      {document.data ? (
        <Suspense fallback={<p role="status">Loading writing…</p>}>
          <FolderCanvas key={`${folderId}:${facet.id}`} page={document.data} tasks={[]} folderId={folderId} facetId={facet.id} context={context} actions={actions} onAsk={onAsk} arrangeable />
        </Suspense>
      ) : <p role={document.isError ? 'alert' : 'status'}>{document.isError ? 'Could not load this facet. Reload to try again.' : 'Loading writing…'}</p>}
    </div>
  )
}
