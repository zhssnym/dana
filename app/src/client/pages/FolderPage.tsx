/*
9.6's folder page, the v2 shape, reworked at S12 from the designer's
`folder-page-v2.tsx` onto the P8R port that stood here. The page is a page
in the full sense now: cover, mark, name, description, the loose open tasks
with a quick-add, the page's blocks, the Completed section at the foot, and
the conversation in one of its two homes.

What is deliberate rather than transcription:

**The identity is the folder's, written through 4.3's shared columns.** The
mark opens the icon-and-colour picker and PATCHes icon and color; the cover
uploads through 7.15 (kind 'cover') and PATCHes cover_file_id; the
description PATCHes description; the name renders as a heading for everybody
and becomes an inline field on a click or on the menu's Rename.

**All five are Can edit's, and until 2026-09-20 this page had them split.**
The paragraph here read "any member writes all four" with "the name alone is
the owner's", which was DES-225's split and 9.6's role matrix. **Accepted
#209 R8A contradicts both halves**: Can view is "read only", Can edit may
"plan/change all shared Folder work", and a folder's identity is shared
Folder work. So a Can-view member could repaint a folder they may only read,
and a Full-control member who did not own it could not rename one they
administer. Hassan's ruling of 2026-09-20,
https://github.com/zhssnym/dana/issues/228#issuecomment-5750892771; AC-011,
AC-012 and AC-193 carry it, and `lib/folder-authority.ts` answers it here
from the same table the routes resolve against.

A reader below that bar is offered no control a 403 would answer, and still
has a heading, a band and a paragraph to read. The heading half is a
correction AC-226 caught: an always-on field left the imported starter's page
with no heading at all. The "Label and color" dialog is retired with its
section sentence; 4.4's per-member color column is written by no v2 surface.

**Tasks sit under their sections since S17b, and the paragraph this replaces
argued for the shape the code no longer has.** It said tasks render loose
because Q7's rows are frozen 7.0 TaskCards carrying no `section_block_id`,
that rendering placement would need a widening, and that the widening had
been escalated with a recommendation. All three sentences were true when
they were written and the last of them is why they are not now: the
widening is RFC 0005 unit 12a, it landed at S18, and `server/views/cards.ts`
selects and projects the column on the folder read. So placement is drawn,
`BlocksEditor`'s `sectionExtras` hook is passed at last, each section
carries its own rows and its own quick-add, and the loose list holds
exactly the tasks under no section. A header that argues for a shape the
code has moved past is worse than no header.

**This page is a place-page now** (`views/place-pages.ts`), which is the
audit's "the board view entirely: no view strip, no window-bar filter,
DES-132's two-column board" closed in one move rather than three. 9.6 asks
for the filter in terms, "the filter of 9.1 narrows the page without
touching its arrangement", and the strip and the board come with it because
`usePlace` and `PlaceChrome` are where every other page gets all three.

**The interim select is retired, and S10's own note is what scheduled it.**
That note read: "the v2 filter it will hand over to is the window bar's,
which is S10's package. The select survives here as the same interim S9's
pages used, and S10 retires it with AC-176's own Replace unit when the
window-bar filter lands." The filter has landed here rather than there, so
the retirement is here too. AC-176's sentence needed no Replace unit after
all: it promises "a filter offers all open tasks, only those with a due date
and only those without", which is exactly 9.1's due-presence axis, so only
the three labels the criterion addresses moved. Two filters on one page,
forty pixels apart, is the fault this row exists to remove and would have
been the fault this page shipped.

**The board's axis is the date rather than the folder**, which every place
page in `PLACES` uses, and DES-177 is the reason: a folder page has pinned
the folder, so grouping by it gives one column, "which is a list wearing a
different control".

**Delete asks nothing and the undo bar answers** (9.6: "with the undo bar
and no confirmation: two ways back is why the question left"). The inverse
is 7.13's restore, registered the way every page registers one. Leave keeps
its sentence verbatim and its confirm (AC-183), and walks through DELETE
/my-membership, the door change control item 5 cut.

**An owner with other members is offered Transfer ownership rather than
Leave, and that is now the server's rule and not only this page's.**
Governing #209 R6 section 2 ended automatic succession: the owner's leave is
409 until they have handed custody to a member who *currently holds Full
control*, and the picker offers exactly those. A sole owner is offered
Delete, and Desk neither.

**The overflow menu lives in the window bar** (9.1: the bar's right end
holds "the object's overflow menu"), named "More actions", offering exactly
the acts this viewer's Access permits: History, Copy link, Duplicate, Save as
workflow to everyone; **Rename at Can edit and above, Delete folder at Full
control, Leave folder to any member who is not the owner and is not the last
Full control, and Transfer ownership to the owner alone**. Those four were
`is_owner` until 2026-09-20 and are `lib/folder-authority.ts` now, for the
reason in the identity paragraph above. Duplicate is the server's (DES-198);
Save as workflow is the client-side export DES-206 keeps client-side,
structure and titles only.

**A stale block write is handled visibly**: the 409 carries 5.1's copy,
which the mutation cache already raises as the toast, and the page refetches
its blocks at the same moment so the winning write replaces the loser on
screen (RFC 0004's S12 acceptance, both halves).

**The conversation has two homes, switched from the surface itself** (9.6):
a closed section at the page's foot, or the side panel, the choice a
client-side preference. The thread fetches only while its surface is open
and polls politely while it stays open, which is the whole of D3.
*/
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router'

import {
  useCreateTask,
  useDeleteFolder,
  useLeaveFolder,
  useDeleteComment,
  useDuplicateFolder,
  useUpdateMyMembership,
  usePatchComment,
  usePostComment,
  useRenameFolder,
  useRestoreFolder,
  useSetCommentLike,
  useTransferOwnership,
} from '../api/mutations.js'
import {
  mergeCompletedDays,
  useConnections,
  useFolder,
  useFolders,
  useFolderCompletedTasks,
  useFolderOpenTasks,
  useFolderPage,
  useShelves,
  useThread,
} from '../api/queries.js'
import { getPlain, uploadFile } from '../api/http.js'
import { queryKeys } from '../api/keys.js'
import { showToast } from '../state/toasts.js'
const FolderCanvas = lazy(() => import('../components/page/canvas/FolderCanvas.js'))
/* S26: the head is the prototype's own composition rather than this page's
   second one. `components/page/IdentityHead.tsx` stays in the tree for the
   shelf page, which is S27's; nothing here reads it any more. */
import { AddCoverAction, PageCover } from '../components/page-cover.js'
import { PageDescription, PageMark, usePageHasCover } from '../components/page-head.js'
import { IconPicker } from '../components/page/IconPicker.js'
import { markIcon } from '../components/page/icon-manifest.js'
import { FOLDER_PREFIX } from '../lib/page-identity.js'
import { IDENTITY_COLOR_FALLBACK } from '../parts/identity-colors.js'
import { InlineInput } from '../components/ui/inline-field.js'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover.js'
/* S26: the prototype's own thread, one component wherever a conversation
   happens (ledger L-201). `components/page/ConversationThread.tsx` was this
   page's own second one and retires with this line. */
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
import { ruleFor } from '../../shared/folder-actions.js'
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
import { CollapsibleSection, PageSection } from '../components/page/PageSection.js'
import { groupRows, LOOSE } from '../views/grouping.js'
import { PLACES } from '../views/place-pages.js'
import { TaskBoard } from '../views/TaskBoard.js'
import { PlaceChrome, usePlace } from '../views/usePlace.js'
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
What each right-edge panel reserves, in pixels (DES-154, DES-186).

**These are the widths each panel is already drawn at, restated rather than
introduced**, which is what keeps 11.4's single-tokens-file rule intact: the
conversation sheet is `w-[380px]` in this file and the sharing panel is
`w-[var(--sharing-panel-width)]`, 440px in `tokens.css`. A layout value has to
reach JavaScript to be padding the shell can compute, and the alternative,
reading the panel's own box after it renders, is a measurement that has to
happen after the paint it is supposed to decide.

The sharing panel's number is the one that can drift, its width being a token
another session may retune. It is named here so a reader looking for the
duplicate finds it named as one.
*/
const CONVERSATION_PANEL_WIDTH = 380
const SHARING_PANEL_WIDTH = 440

/**
 * 9.6's leave confirm, verbatim and one sentence (AC-183 turns on both).
 */
/**
 * The owner's hand-on-or-delete question, RFC 0005 change control item 38's
 * rules in the order he gave them: leave it to the other members, or delete
 * it for them too. Both consequences are stated because they differ in the
 * half a person cannot see: handing it on passes ownership and writes no
 * Trash row; deleting reaches every member's Trash for thirty days.
 *
 * **Rewritten 2026-09-20 under governing #209 R6 section 2**, which replaced
 * automatic succession with an explicit transfer: the sentence promised the
 * folder would pass "to the longest-standing member", which is the rule that
 * was removed, and the button under it wrote a request that now answers 409.
 * The person is told who it can pass to instead, because under R6 the answer
 * is sometimes nobody and that changes what they should do next.
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
The rows out of the body `GET /labels` answered (#227 area 4).

**`truncated` is not read, and that is a fact about this path rather than an
oversight.** 10.3 caps a Folder's definitions at 250
(`FOLDER_LABEL_DEFINITION_CAP`) and the list cap at 1000, so a single folder's
vocabulary cannot reach it. A second scope on this query, or a cap raised past
1000, would make that false and would want the flag read.

**This read two shapes until the rebase of 2026-09-20 and now reads one.** The
branch forked from #226 mid-flight, when `getLabelsResponse` was still a bare
array; #226 then wrapped it as `{ rows, truncated }` for its own 10.3 row-cap
fix and landed on `main` as #259. Reading both let this branch compile where it
stood and be correct once rebased, and the array arm was dead the moment it was
— so it went, which is what the comment that stood here asked its rebaser to
do.
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
  /* polish: folderpage F1. The move submenu offered the bare membership
     labels and nothing else, so an account whose shelves were made through
     7.16 saw "No group" alone; the shelves are the list, as in the sidebar. */
  const shelves = useShelves()
  const open = useFolderOpenTasks(id)
  const page = useFolderPage(id)
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
  const duplicate = useDuplicateFolder()
  const membership = useUpdateMyMembership()
  /* Every label in use, which is what the move submenu offers, deduplicated
     and in the order the library holds them. 9.1 makes a group "the label of
     7.4's my-membership and nothing else", so this is the whole of a group. */
  /* polish: tabstrip F6 and folderpage F1, the same blocker from two seats:
     the shelves the viewer has made are offered too, not only the labels
     already in use, a shelf with nothing on it yet being exactly the one a
     person wanted to move to. `folderGroupLabels` is the union the sidebar
     already draws from, so both surfaces answer from one list rather than
     from two hand-written ones. */
  const groupLabels = folderGroupLabels(library.data ?? [], shelves.data ?? [])
  const postComment = usePostComment()
  const patchComment = usePatchComment()
  const deleteComment = useDeleteComment()
  const setLike = useSetCommentLike()
  const [completedOpen, setCompletedOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  /* RFC 0005 change control item 38: an owner deleting a shared folder is
     asked one question first. S28b. */
  const [deleteAsk, setDeleteAsk] = useState(false)
  // 9.6's inline rename: the title is a heading until this is true.
  const [renaming, setRenaming] = useState(false)
  /* Controlled, and the prototype's own reason: "Label and colour" in the
     overflow has to open the same picker the mark opens, and an uncontrolled
     popover can only be opened by pressing it. */
  const [markOpen, setMarkOpen] = useState(false)
  const [conversationHome, setConversationHome] =
    useState<ConversationHome>(readConversationHome)
  /* polish: search F3 (shell edit, minimal). A notification lands here with
     `?conversation=open`, so the thread the person was told about is open on
     arrival rather than folded below the fold; `search` is the page's own
     `useSearchParams`, read above. Both homes honour it. */
  const arrivingAtThread = search.get('conversation') === 'open'
  const [footThreadOpen, setFootThreadOpen] = useState(arrivingAtThread)
  const [panelOpen, setPanelOpen] = useState(arrivingAtThread)

  const connections = useConnections()
  const threadOpen =
    conversationHome === 'foot' ? footThreadOpen : panelOpen

  /*
  9.6's two right-edge panels take room rather than covering (DES-154,
  DES-186). Each publishes its own width while it is open and the shell pads
  the page body by whatever is reserved; `components/right-edge.tsx` carries one
  number for both, because they share one edge and two open at once would
  overlap each other long before the page noticed.

  History is deliberately not among them. It is a sheet you open, read and
  close, with nothing on the page underneath that you are reading it against,
  which is the case DES-186 says a dialog answers better; the conversation and
  the sharing panel are the two you work beside.
  */
  const conversationPanelOpen = conversationHome === 'panel' && panelOpen
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

  **The comment this replaces was false, and it cited AC-176 for the opposite
  of what AC-176 says.** It read "Q7's order, kept rather than made: Scheduled
  first with Q3's order, then Unscheduled with Q2's, concatenated and never
  re-sorted (AC-176)", and that was true until #184 made the page compose-first.
  Since then 4.17's durable mixed order is the one the page stores, AC-176's own
  header says so in terms — "the folder page now projects those task payloads
  through `GET /page.items` ... The rows below are deliberately created out of
  Q7 order so a client that falls back to the response arrays instead of the
  composed item references fails here" — and this line was that fallback.

  It did not show while the page was unfiltered, because the canvas draws from
  the document and never from this array. Everything else on the page draws
  from it: the Task view the filter switches to, the board's columns, the
  ladder's keyboard order. So choosing *With a due date* answered a narrowing
  question with a date-sorted list — Q3 orders `scheduled` by due date — and
  the folder's arrangement survived exactly as long as nobody interrogated it.
  Live from 2026-09-17 to 2026-09-20; #234 cause 2 is the ruling that the
  filtered view orders by the composed sequence, 9.6 and AC-176 both unmoved.

  A row the page has not composed yet keeps Q7's order behind the composed
  ones, which is what a task created a moment ago looks like until the page
  read catches up. `items` carries every undeleted task of the folder, so that
  window is the only time the fallback is reached.
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
  The folder page is a place-page since S17b (9.6, and the parity audit's
  folder-page row).

  What that buys is one filter, one view strip and one board, the same three
  every other page draws, rather than three more written here. Three things
  are this page's own and arrive as options, each because it needs the
  folder's id: the filter is remembered per folder, since 9.1 keeps a filter
  "on return to that page, never carried to another" and two folders are two
  pages; and both capture points write this folder, which is 9.3's sixth
  entry-point row.
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
  /* Read while the foot is open, and while the board is up, whose Done
     column is drawn from the same pages (item 58, G). */
  const completed = useFolderCompletedTasks(id, completedOpen || place.mode === 'board')
  const visible = place.narrow(openRows)
  /*
  **The board's columns are the page's sections** (item 44's B2, ledger
  L-044), seeded from the blocks rather than discovered from the rows, and in
  the page's own order.

  Seeding is what makes them the page's arrangement rather than a summary of
  it: a section nobody has filed anything under is still a column, with its own
  capture, exactly as it is a heading with its own quick-add in the list. The
  loose column comes first, which is where the list draws the same rows.

  The other axes seed nothing and are unchanged, so the filter changing the
  grouping is one value moving and no second board.
  */
  const sectionColumns = useMemo(
    () =>
      place.groupBy === 'section'
        ? [
            /* polish: folderpage F7. "No section" on a page with no sections
               reads as something missing; the one column is the tasks. */
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
  The board's Done column (ledger L-045, item 58 G), the prototype's
  `folder-page-v2.tsx`: "No section and Done are the two columns that are not
  sections: one is a place, one is a status, and both take drops." Drawn only
  on the sections axis, as there, and never as a capture: a quick-add under
  Done would make a finished task, which is not a thing.
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
  **What this page may offer, from the server's own table** (issue #228;
  accepted #209 R8A; Hassan's ruling of 2026-09-20,
  https://github.com/zhssnym/dana/issues/228#issuecomment-5750892771).

  Every gate below used to read `isOwner`, which was right while ownership was
  the authority and is wrong now that Access is: a Full-control member who is
  not the owner was offered no Rename, and an owner whose Access had been
  lowered was still offered Delete. `lib/folder-authority.ts` answers each
  from `shared/folder-actions.ts`, the same table the routes resolve against,
  so no bar is written twice; its own header carries the argument and its test
  the preset-by-preset table.

  The facts need the roster, which this page already reads, because the
  viewer's preset is their membership row and is never inferred from custody
  (R5 lets an owner lower their own Access). `gates` is null until both have
  arrived, so nothing draws on a guess.
  */
  const facts = viewerFacts(detail, members, basis.viewerId)
  const gates = facts === null ? null : folderGates(facts)
  /* Governing R6 section 2: ownership passes only to a member who *currently*
     holds Full control, and there is no default successor. The list this
     replaced sorted every other member by `joined_at` and labelled the first
     "(longest-standing)", which was 8.9's automatic succession rule — the
     precise rule R6 section 2 removed — and offered a set of choices the
     server now answers 422. */
  const successors = eligibleSuccessors(members, basis.viewerId)
  /* Everybody else in the folder, which is a different question and the one
     the owner's delete dialog asks: somebody to hand it to is not the same as
     somebody who is in it. */
  const others = otherMembers(members, basis.viewerId)
  const completionTotal =
    (detail?.counts.completed ?? 0) + (detail?.counts.pending ?? 0)
  /* The prototype's rule for offering the description at rest: a folder
     nobody has dressed, where a hidden affordance is one nobody discovers. */
  const pristine =
    detail !== undefined &&
    detail.icon === null &&
    detail.cover_file_id === null &&
    detail.description === null

  /** Who a comment's author is, off the members already read; a face the
   * roster cannot resolve says "Someone" rather than leaking an id.
   *
   * polish round-2: the picture rides with the name. 7.14 carries an author's
   * id alone, so this directory is the only route an avatar has onto the
   * thread, and both reads behind it — 7.4's members and 7.3's connections —
   * have carried `avatar_url` since 4.1. */
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

  function askLeave(): void {
    confirm.ask(leaveFolderConfirm(detail?.name ?? ''), () => {
      leave.mutate(id, { onSuccess: () => navigate(paths.desk) })
    })
  }

  /*
  Item 38's one question, asked of an owner whose folder has other members:
  hand it on, or delete it for them too.

  **Its first option used to be "Leave it to the members", and that act no
  longer exists.** It wrote `DELETE /folders/:id/my-membership`, and ownership
  passed under 8.9 to the longest-standing member with nobody asked to name
  one; governing #209 R6 section 2 removed exactly that, so the same request
  now answers 409 "Transfer ownership before leaving". Offering it would be
  offering a button whose only outcome is an error toast. The question keeps
  its shape and its purpose — an owner is asked once before a shared folder
  goes to Trash — and its first option is now the transfer the server
  requires, which is the same intent stated under the new rule: the folder
  stays alive for the people in it and leaves this person's sidebar.
  AC-283 moved with it, in this commit.

  The second option is `doDelete` above, 7.13's soft delete for every member
  with the undo bar. An owner alone in the folder is asked nothing, 9.6's
  confirm-free delete standing, because there is nobody to hand it to.

  **A Full-control member who is not the owner is not asked either**, and that
  is new because the act is new to them (AC-015): the question is about
  custody, and custody is not theirs to pass on. They get 9.6's plain delete
  and the undo bar, exactly as a sole owner does.
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
  DES-206's file, as RFC 0005 change control item 44's B3 widened it: the
  folder's sections and paragraphs, and per task its notes, star, repeat,
  reminder and step titles beside the title.

  **The rows are read before the file is written, and that is the fix rather
  than an optimisation missed.** This page lists 7.10 TaskCards, which carry
  `steps_done` and `steps_total` and neither the notes nor the step titles,
  so the object literal that stood here could only ever write `{ title }`.
  The file therefore never held a note or a step title, and importing one
  produced a folder that looked as though the import had dropped them; it
  had not, and `shared/workflows.ts` is where the two halves of the format
  now sit together. The details are read through the same query key the row
  cache uses, so an already-open task costs no request.
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
    try {
      const [details, vocabulary] = await Promise.all([
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
      ])
      tasks = details
      labels = labelRowsOf(vocabulary)
    } catch {
      showToast('Could not read this folder’s tasks, so nothing was saved.')
      return
    }
    const saved = folderToWorkflowFile(
      folderName,
      tasks,
      page.data?.blocks ?? [],
      page.data,
      labels,
    )
    const file = JSON.stringify(saved.file, null, 2)
    const blob = new Blob([file], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${detail?.name ?? 'folder'}.dana-workflow.json`
    anchor.click()
    URL.revokeObjectURL(url)
    /* polish: tabstrip F7. A download that starts silently reads as nothing
       happening; the toast says what was saved and where it went.

       **And what did not go with it (#185).** A workflow file carries writing
       and work and no bytes: a picture, a file, a sound, a video or a link to
       another folder is a row of this account, and the file records the gap
       rather than carrying it. The person who pressed Save is the only one who
       can decide whether that matters, so the count the writer answered is said
       here rather than left in the JSON for them to notice. */
    const missing =
      saved.omitted === 0
        ? ''
        : ` ${String(saved.omitted)} ${saved.omitted === 1 ? 'image or file is' : 'images and files are'} not included.`
    showToast(
      `"${detail?.name ?? 'Folder'}" saved as a workflow file. Import it from the sidebar.${missing}`,
    )
  }

  /*
  An act the Library asked for, run once the folder has arrived.

  DES-201 puts every act on the object's contract, and five of a folder's need
  a surface only this page has: an inline field, a history sheet, a
  serialiser, a confirmation and the undo bar. Rebuilding those in the sidebar
  would be two implementations of each and would be exactly the divergence the
  contract exists to end, so the Library row navigates here carrying
  `?folder-action=`, which is the designer's own idiom for an instrument
  reached by link ("the URL that did it survives as ?folder-action=appearance,
  like every other instrument this plan reaches by link").

  **It waits for the read and then runs once.** Leave, Delete and Save as
  workflow all name the folder, so running before `detail` arrives would
  confirm about "" and export a file called folder.dana-workflow.json. The
  query is dropped from the address as the act starts, with `replace`, so a
  reload or a Back does not run it a second time: an act is a thing that
  happened, not a property of the page.
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
    The same three gates the menu above draws with, because this is the same
    act reached by link from the Library (issue #228).

    **A refused arrival says why rather than doing nothing.** This link is
    generated by the sidebar's folder row, which gates on the same table this
    page does since `my_access` joined the 7.4 Folder object (Hassan's Ruling 4
    of 2026-09-20), so the two menus now agree — **and the refusal still has to
    exist**, because the address is a URL. A link pasted from elsewhere, a tab
    restored from yesterday, or a list the person's Access changed underneath
    all reach this handler carrying an act they may not perform. Silence there
    is the worst of the three possible behaviours: the field simply never
    opens.
    The sentence is `ruleFor(...).why`, which is the **same string the route
    would have answered with**, `mayPerform`'s reason being what
    `sendError(res, 403, 'forbidden', ...)` carries; so the person is told the
    same thing whether the client caught it or the server did, and there is no
    second wording to keep in step.
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
       "leaving is any member's", which is true and is not why this one was
       refused. The route's 409 carries the sentence that is ("Transfer
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
  /* What this folder's conversation may offer. It was one boolean, `isOwner`,
     until 2026-09-20 (issue #268), and every part of that was wrong: the
     route resolves moderation as `comment.moderate` (Full control's, which
     custody does not confer) and the author's own edit and delete as
     `comment.mutate.own` (Can comment or better, which authorship does not
     confer). Same table, same call as every other gate on this page (AC-790).

     Memoised because it is the identity `useConceptThread` keys its own
     memo on; `gates` is rebuilt every render, so an inline object would
     remap the whole thread each time. Null gates means the roster has not
     landed, and the honest answer then is to offer nothing rather than to
     guess — the same direction every other gate on this page takes. */
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
  S26's seam, and the whole of the write path in this file: the lifted thread
  announces a change as the array it wants to exist, and `lib/thread.ts` turns
  that into 7.14's routes. Its header carries the argument for the shape.

  The upload is here rather than in the seam because a comment's file is
  7.15's, scoped to this folder like every other file in it, and this page is
  the one thing that knows which folder that is.
  */
  const threadSurface = (
    <div>
      <div className="flex justify-end pb-1">{conversationSwitch}</div>
      <CommentsThread
        comments={conversation}
        /* The composer's own half of `comment.create`; Reply's half rides
           each comment. Disabled rather than hidden, and its sentence says
           what standing commenting needs (owner's ruling of 2026-09-20 on
           issue #268; AC-790). */
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
            arrangement", and DES-150's arrangement of it: the chips at the
            bar's left end, the view strip and the filter at its right. Drawn
            by the same component every place page uses, which is what makes
            this one filter rather than a ninth. */}
        <PlaceChrome place={place} />
        {/* Order 2, which is 9.1's own sentence for the bar's right end:
            "the view strip, the filter control, the Activity line, and the
            object's overflow menu". The first two are `PlaceChrome`'s at the
            default order and the third is the shell's at 1. */}
        <WindowBarActions order={2}>
          {/* The conversation's opener when its home is the panel; the foot
              section is its own opener otherwise. */}
          {conversationHome === 'panel' ? (
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

          The prototype's folder page draws both here and always has
          (`folder-page-v2.tsx`, the block it calls `strip`: the activity
          line, then the avatar group, then the share control, then the
          overflow menu), and this client kept them beside the title, which
          is the composition DES-139 replaced. They are the window's controls
          and not the page's content: a header that carries them scrolls its
          own chrome away, and it puts two tiers of control forty pixels
          apart. An icon rather than a filled block, because the bar is
          chrome and chrome is quiet; the panel it opens is unchanged.
          */}
          {isDefault || members.length < 2 ? null : (
            /* 9.6's member stack. One face is not a stack: a folder nobody
               shares draws its owner's own picture at nobody, which is the
               same noise the Share control is withheld for. */
            <AvatarGroup>
              {members.map((member) => (
                /* polish: settings F7, pagehead F9: the uploaded picture,
                   and the name on hover. */
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
          9.1: the bar's right end holds the object's overflow menu, and since
          S17a it is the object's contract rather than this page's list.

          It was seven hand-written items here and five in the Library, so
          where a person stood decided what they could do to the same folder,
          which is DES-201's own worked example. `lib/object-acts.ts` owns the
          words, the glyphs and the order now; what stays the page's own is
          "Transfer ownership", 9.6's act for an owner with somewhere to hand
          the folder to and one no other surface can offer.
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
            /* **Offered whenever the folder is shared and the viewer owns
               it, rather than only when somebody is eligible.** It used to be
               withheld unless the successor list had somebody in it; under
               governing R6 section 2 that list can be empty for a folder full
               of people, and an owner who must transfer before they can leave
               would then be offered no route at all and no reason. The dialog
               says what to do instead, which is a sentence the menu cannot
               carry. */
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
              /* The personal label, which the Library row has offered since
                 P8R and this page never did. It is arrangement rather than
                 identity (9.6's matrix: "personal, always"), so it is the
                 same write from either surface. */
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
                          /* polish: shelves F6. A shelf move has a way back
                             now, the undo bar, like every other move. */
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
                    {/* polish: shelves F1. One word for the thing: the way
                        off a shelf is not a "group". */}
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
                /* DES-198 server-side; the copy is the duplicator's own
                   private folder, and the page goes to it. */
                duplicate.mutate(id, {
                  onSuccess: (made) => {
                    /* 9.6: "the bar says which happened" (ledger L-055, RFC
                       0005 change control item 58, E): the prototype's two
                       sentences, read off 7.16's `shifted_days`. */
                    /* polish: folderpage F9. DES-198's rule, said where it
                       applies: a duplicate is the structure, so every task
                       arrives open. */
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
              /* Leaving is any member's (governing R6), and refused to the
                 owner until they transfer and to the last Full-control member
                 by the continuity invariant. Both of those are state rather
                 than preset, and `folderGates` reads them off the roster this
                 page already has. */
              leave: gates?.leave === true ? askLeave : undefined,
              /* **Hassan's ruling of 2026-09-20, not R8A**, which settles it
                 neither way: moving a folder to Trash is Full control's, and
                 custody does not confer it, so an owner whose Access dropped
                 below Full control is no longer offered it (AC-015). It read
                 `isOwner && !isDefault`. */
              delete: gates?.trash === true ? askDelete : undefined,
            }}
          />
        </WindowBarActions>

        <PageSection name="Folder header">
          {/*
          **S26: the head is the prototype's own composition, not this page's
          second one.**

          `components/page/IdentityHead.tsx` was a port of the same drawing
          written at S12, and once S25 lifted `page-cover`, `page-head` and
          `folder-cover` for the place pages, the folder page next door was the
          one page still wearing a copy: a 44px rounded tile where `PageMark`
          has the scrim and the 32-to-40 growth, a "Remove cover" chip where
          the band has the joined Change and Reposition group, an upload where
          the picker has tiers, and its own description field beside
          `PageDescription`. That is DES-154's fault exactly, a treatment
          settled once and left in each screen's keeping, and it is what
          ledger L-185 and L-186 name.

          **The name is 9.1's and not the prototype's** (item 44's A2 read one
          level down): the prototype writes "Change folder icon and color" and
          AC-243 and AC-247 both address this control as "Icon and colour for
          {name}". Section 9 fixes no name here, so the criterion is the only
          artefact with an opinion and it keeps it.

          **The picker is this client's `IconPicker` rather than the
          prototype's `folder-icon-picker.tsx`, and that is a decision rather
          than an omission.** 4.3's `icon` is a stored key checked against
          `^[a-z0-9-]{1,40}$`, and `components/page/icon-manifest.ts` is the one
          place this client maps a stored key to a glyph, read by the sidebar,
          the folder marks and the search results as well as by this popover.
          Lifting the prototype's picker would put a second glyph alphabet
          beside it, which is the duplicate implementation protocol section 3
          names in the same breath as the boundary. The measure at this row's
          close records the three class strings that costs.
          */}
          {/* polish: pagehead F5. The band sat in the page's column with a
              gap under it while every place page draws it full-bleed with the
              mark riding up over it (`page-head.tsx`); the folder page now
              draws the same geometry, the same wrapper undoing the shell's
              inset, the same top padding when there is no band. */}
          {/* The horizontal half of that inset moved into `page-cover.tsx` on
              2026-08-30: `-mx-10` reached the shell's padding and never its
              `--shell-content-max` cap, so the band stopped at the reading
              width with the ground showing either side. The top inset stays
              here, and follows the shell's own two measures. */}
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
                  third block under it, which is 9.4's "the fact 'N of M done'"
                  and DES-149's "the fact rides the title's line; prose sits
                  under it". */}
              {/* polish: pagehead F6. On a phone the counter wraps under the
                  name rather than cutting it to "Apart...". */}
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
                     who may not rename is offered no textbox at all (AC-217,
                     rewritten 2026-09-20: the bar is Can edit rather than
                     ownership). */
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
                {completionTotal > 0 ? (
                  <span className="shrink-0 text-xs leading-4 text-muted-foreground tabular-nums">
                    {detail?.counts.completed ?? 0} of {completionTotal} done
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

        <div className="mt-7 space-y-7">
          {/*
          polish round 2, folderpage: the open list and the page's blocks are
          one body, not two regions with a hole between them.

          The prototype stacks them at 8px and says why: "the insertion lines
          carry the separation between blocks now, so the stack's own gap is
          small, two 24px gaps in a row read as a hole". This column's 28px
          put 28px plus the strip's own height between the quick-add and the
          first insertion line, which is what made the line read as belonging
          to nothing above it. The 28px stays where it is the separation
          between the body and Done.
          */}
          <div className="space-y-2">
            <PageSection name="All open tasks">
              <PageBody
                query={open}
                /* A board whose Done column holds finished work is not an
                   empty page (item 58 G): the last open task completed by a
                   drop must not take the board with it. */
                isEmpty={place.mode === 'board' && bothEmpty && completedDays.length === 0}
                emptyCopy={FOLDER_EMPTY}
                emptyIcon={FolderIcon}
                truncated={open.data?.truncated ?? false}
              >
                {place.mode === 'board' ? (
                  /* DES-132's board, on the folder page at last. It is the
                     shared `views/TaskBoard.tsx` and not a second one, which is
                     what makes S17b's two-columns-per-row change reach here and
                     every place page together (AC-259). */
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
              rendered on the folder's own completed count. polish: pagehead
              F8, folderpage F7: not while the board is up, whose Done column
              is the same rows. And "Done", not "Completed": places F11, one
              word for the finished pile everywhere. */}
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
          {conversationHome === 'foot' ? (
            <CollapsibleSection
              name="Conversation"
              defaultOpen={false}
              onOpenChange={setFootThreadOpen}
            >
              {threadSurface}
            </CollapsibleSection>
          ) : null}
        </div>
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
      The conversation's panel home, which takes room from the page rather
      than covering it since S17b (DES-154, DES-186).

      It publishes its width to `components/right-edge.tsx` and the shell pads the
      page body by it, which is the whole mechanism. What Imran reported on
      2026-08-23 was this panel exactly: "the page is not adjusting when chat
      is appear as a right sidebar." The sheet is still a sheet, so the escape
      key, the focus trap and the close control are the primitive's; what
      changed is that the page underneath it is narrower and readable rather
      than hidden, which is the one thing a side-by-side view exists for.
      */}
      <Sheet
        open={conversationPanelOpen}
        onOpenChange={setPanelOpen}
        /*
        Non-modal, and this is DES-186's argument reaching the markup rather
        than a preference. A modal sheet makes the document beneath it inert
        and hides it behind a backdrop, which is precisely "a panel sitting
        over the page hides the row the task came from": reserving room on the
        right would then be decoration, since the page it uncovered could be
        neither read nor touched. So the backdrop goes and the page stays
        live. What is kept is everything else the primitive gives a sheet, the
        escape key, the focus handling and the close control.
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
      9.6's History, and since S26 the prototype's own sheet rather than this
      page's flat list (ledger L-199, L-200).

      What the list could not do is the whole of why the entry exists: it drew
      one line per event with a relative time under it, where the sheet groups
      by day and puts the actor on every line, "a record you are reading to
      settle a question should not make you look upwards". And both readers of
      an event now draw it through `lib/history.ts`'s `lineFor`, so the window
      bar's Activity sentence and this one are one string rather than two
      formatters that will one day disagree.
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
      dialog says so.** It was every other member, sorted by `joined_at`, with
      the first labelled "(longest-standing)" — 8.9's automatic successor
      dressed as a recommendation. Governing #209 R6 section 2 removed that
      rule outright (joining first is not evidence that anybody intended you
      to hold custody), and the server enforces the replacement: a target
      below Full control is answered `422 to: must be a member of this folder
      who currently has Full control`. So every entry the old picker put after
      the first was, by then, a button whose only outcome was an error, and
      the one it recommended was recommended on the very rule that had gone.

      **There is no default and nothing is sorted**, because R6 leaves no
      rule that would order them: the roster's own order is used, which is the
      order the Share panel this person just came from shows.

      **An empty list is a sentence and not an empty box.** A folder can be
      full of people and have nobody eligible, and that person's next step —
      give somebody Full control in Share, then come back — is not something
      an empty picker communicates. The wording follows the server's own
      refusal copy, "This folder would be left with nobody in Full control".
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

      {/* Item 38's question, S28b: see `askDelete`. */}
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
            {/* "Leave it to the members" stood here and wrote the leave that
                R6 section 2 now answers 409. Handing it on is the same
                intent under the rule that replaced it, and it opens the
                picker rather than acting, because under R6 somebody has to
                be named. */}
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
