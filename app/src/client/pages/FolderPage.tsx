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
description PATCHes description. Any member writes all four, the event log
says who (9.6's matrix, AC-193's client half). The name alone is the
owner's: it renders as a heading for everybody and becomes an inline field
for the owner on a click or on the menu's Rename, so a member is offered no
control a 403 would answer (DES-225) and every reader still has a heading to
land on. That last half is a correction AC-226 caught: an always-on field
left the imported starter's page with no heading at all. The "Label and
color" dialog is retired with its section sentence; 4.4's per-member color
column is written by no v2 surface.

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
/my-membership, the door change control item 5 cut. An owner with other
members is offered ownership transfer instead (5.3, 8.9), a sole owner
Delete, and Desk neither.

**The overflow menu lives in the window bar** (9.1: the bar's right end
holds "the object's overflow menu"), named "More actions", offering exactly
the viewer's role's acts: History, Copy link, Duplicate, Save as workflow
to everyone; Rename, Delete folder and Transfer ownership to the owner;
Leave folder to a member. Duplicate is the server's (DES-198); Save as
workflow is the client-side export DES-206 keeps client-side, structure and
titles only.

**A stale block write is handled visibly**: the 409 carries 5.1's copy,
which the mutation cache already raises as the toast, and the page refetches
its blocks at the same moment so the winning write replaces the loser on
screen (RFC 0004's S12 acceptance, both halves).

**The conversation has two homes, switched from the surface itself** (9.6):
a closed section at the page's foot, or the side panel, the choice a
client-side preference. The thread fetches only while its surface is open
and polls politely while it stays open, which is the whole of D3.
*/
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router'

import {
  useCreateTask,
  useOrderTask,
  useDeleteFolder,
  useLeaveFolder,
  useDeleteComment,
  useDuplicateFolder,
  useUpdateMyMembership,
  usePatchComment,
  usePostComment,
  usePutFolderPage,
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
import { BlocksEditor } from '../components/page/BlocksEditor.js'
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
import { QuickAdd } from '../components/quick-add.js'

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
import { applyThreadChange, commentFileKind, useConceptThread } from '../lib/thread.js'
import { paths } from '../routes.js'
import { FOLDER_ACTION_PARAM } from '../shell/app-sidebar.js'
import { openTaskForm } from '../shell/overlays.js'
import { useReserveRightEdge } from '../components/right-edge.js'
import { pushUndo, undoLabel } from '../shell/undo.js'
import { WindowBarActions } from '../components/window-bar.js'
import { CollapsibleSection, PageSection } from '../components/page/PageSection.js'
import { isNarrowed } from '../views/filter.js'
import { groupRows, LOOSE } from '../views/grouping.js'
import { PLACES } from '../views/place-pages.js'
import { TaskBoard } from '../views/TaskBoard.js'
import { PlaceChrome, usePlace } from '../views/usePlace.js'
import { MorePages, PageBody } from '../components/page/PageStates.js'
import { FOLDER_EMPTY } from './empty-states.js'
import { FolderSharingPanel } from './FolderSharingPanel.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'
import type { PageBlock, PageBlockWrite } from '../../shared/pages.js'
import { getTaskResponse } from '../../shared/tasks.js'
import type { TaskCard, TaskDetail } from '../../shared/tasks.js'
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
 * The owner's leave-or-delete question, RFC 0005 change control item 38's
 * rules in the order he gave them: leave it to the other members, or delete
 * it for them too. Both consequences are stated because they differ in the
 * half a person cannot see: leaving passes ownership and writes no Trash
 * row; deleting reaches every member's Trash for thirty days.
 */
function ownerDeleteQuestion(name: string, others: number): string {
  const who = others === 1 ? '1 other person' : `${others} other people`
  return (
    `${name} is shared with ${who}. You can leave it to them, and it passes to ` +
    'the longest-standing member and leaves your sidebar, or delete it for ' +
    'everyone, and it waits in Trash for 30 days.'
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
  const putPage = usePutFolderPage()
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
  /* polish: folderpage F5. A section's delete was a bare "x" with no question
     and no way back; it asks now, and says where the tasks go. */
  const [sectionAsk, setSectionAsk] = useState<{ block: PageBlock; remove: () => void } | null>(null)
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
  Q7's order, kept rather than made: Scheduled first with Q3's order, then
  Unscheduled with Q2's, concatenated and never re-sorted (AC-176).
  */
  const openRows = useMemo(() => [...scheduled, ...unscheduled], [scheduled, unscheduled])

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
  /*
  polish: taskrow F4. A task made from a quick-add lands at the foot of the
  list it was typed into, in typing order. Q7 puts an unplaced task first,
  which reads as the newest on top and five typed in a row coming out
  backwards; placing it after the list's last undated open row, through
  7.6's order endpoint, is the same act a drag to the bottom performs. Only
  where the list is arrangeable: a filtered or grouped list carries no hand
  order to join (item 44's B4), and a dated task never does.
  */
  const order = useOrderTask()
  function placeLast(madeId: string, peers: readonly TaskCard[]): void {
    if (!arrangement.arrangeable) return
    const last = [...peers]
      .reverse()
      .find((peer) => peer.due_date === null && peer.status === 'pending' && peer.id !== madeId)
    if (last === undefined) return
    order.mutate({ id: madeId, body: { after_id: last.id, before_id: null } })
  }
  /* Read while the foot is open, and while the board is up, whose Done
     column is drawn from the same pages (item 58, G). */
  const completed = useFolderCompletedTasks(id, completedOpen || place.mode === 'board')
  const visible = place.narrow(openRows)
  /*
  Item 44's B4, at S23a: "in a folder, native or user's, with no filter or
  sort applied, a task may be arranged by hand", and with either applied the
  drag springs back. Grouping is read with them: a grouped list is drawn as
  the groups the filter chose, and a hand order under a heading the filter
  put there would be an order over a list the person did not arrange. The
  completed lists below pass nothing, a finished task carrying no hand order
  (7.6's own 409).
  */
  const arrangement = {
    arrangeable:
      !isNarrowed(place.filter) && place.filter.sort === 'manual' && place.groupBy === 'none',
  }
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

  /*
  9.6's "tasks assigned to sections", buildable since S18 and drawn here.

  **The paragraph this replaces argued for the shape the code no longer has.**
  It said tasks render loose because Q7's rows are frozen 7.0 TaskCards
  carrying no `section_block_id`, and that rendering placement would need a
  widening that had been escalated. That widening is RFC 0005 unit 12a, it
  landed at S18, and `server/views/cards.ts` selects and projects the column on
  the folder read. A header that argues for a shape the code has moved past is
  worse than no header, so the argument is gone and this is what stands in its
  place.

  **Placement is a partition and never a copy.** A task appears exactly once:
  under the section it names, or in the loose list, and never in both. The
  loose list keeps 9.6's own name for it, so a task with no section is where it
  always was, and a section block nobody has assigned anything to draws its
  capture and no rows.

  **The narrowing runs before the partition**, which is 9.6's "the filter of
  9.1 narrows the page without touching its arrangement" read literally: the
  filter decides which tasks are on the page and the sections decide where each
  of them sits, so a narrowed-away task leaves its section rather than moving
  to the loose list.
  */
  const bySection = useMemo(() => {
    const map = new Map<string, TaskCard[]>()
    for (const task of visible) {
      const at = task.section_block_id
      if (at === null) continue
      const bucket = map.get(at)
      if (bucket === undefined) map.set(at, [task])
      else bucket.push(task)
    }
    return map
  }, [visible])
  const sectionIds = useMemo(
    () =>
      new Set(
        (page.data?.blocks ?? [])
          .filter((block) => block.kind === 'section')
          .map((block) => block.id),
      ),
    [page.data?.blocks],
  )
  /* A task naming a section this page no longer has falls back to the loose
     list rather than disappearing. 4.17 deletes a block without touching the
     tasks that named it, so this is an ordinary state and not a repair. */
  const loose = visible.filter(
    (task) => task.section_block_id === null || !sectionIds.has(task.section_block_id),
  )

  /** A section's own rows and its own capture, by block id (9.6). */
  const sectionExtras = (blockId: string): React.JSX.Element => (
    <>
      <TaskRows
        tasks={bySection.get(blockId) ?? []}
        context={context}
        actions={actions}
        onAsk={confirm.ask}
        arrangement={arrangement}
      />
      {/* 9.6: "a capture per section". 9.3's entry table gives it this
          folder and this section, the section being what the surface it
          stands in adds to the page's own defaults. */}
      <QuickAdd
        folderName={detail?.name ?? 'this folder'}
        onAdd={(title) => {
          create.mutate(
            { title, folder_id: id, section_block_id: blockId },
            { onSuccess: (made) => placeLast(made.id, bySection.get(blockId) ?? []) },
          )
        }}
        onOpenFullForm={(title) => {
          openTaskForm({ folder_id: id, title })
        }}
      />
    </>
  )
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
  /* 8.9's default successor: the longest-standing other member. */
  const successors = members
    .filter((member) => member.user.id !== basis.viewerId)
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
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

  function putBlocks(body: PageBlockWrite[]): void {
    putPage.mutate(
      { id, body: { blocks: body } },
      /* The 409 is already 5.1's toast; the refetch replaces the loser on
         screen, which is the other half of "handled visibly". */
      { onError: () => void page.refetch() },
    )
  }

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
  leave it to them, or delete it for them too. The first is 5.3's owner-leave
  at `DELETE /folders/:id/my-membership`, ownership passing under 8.9 to the
  longest-standing member with nobody asked to name one; the second is
  `doDelete` above, 7.13's soft delete for every member with the undo bar.
  An owner alone in the folder is asked nothing, 9.6's confirm-free delete
  standing, because there is nobody to leave it to. A non-owner never
  reaches here: their exit is `askLeave`, which tells them they lose access.
  */
  function askDelete(): void {
    if (successors.length > 0) setDeleteAsk(true)
    else doDelete()
  }

  function leaveToMembers(): void {
    setDeleteAsk(false)
    leave.mutate(id, { onSuccess: () => navigate(paths.desk) })
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
    let tasks: TaskDetail[]
    try {
      tasks = await Promise.all(
        pending.map((task) =>
          cache.fetchQuery({
            queryKey: queryKeys.task(task.id),
            queryFn: () => getPlain(getTaskResponse, `/tasks/${task.id}`),
          }),
        ),
      )
    } catch {
      showToast('Could not read this folder’s tasks, so nothing was saved.')
      return
    }
    const file = JSON.stringify(
      folderToWorkflowFile(folderName, tasks, page.data?.blocks ?? []),
      null,
      2,
    )
    const blob = new Blob([file], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${detail?.name ?? 'folder'}.dana-workflow.json`
    anchor.click()
    URL.revokeObjectURL(url)
    /* polish: tabstrip F7. A download that starts silently reads as nothing
       happening; the toast says what was saved and where it went. */
    showToast(`"${detail?.name ?? 'Folder'}" saved as a workflow file. Import it from the sidebar.`)
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
    if (action === 'rename' && isOwner) setRenaming(true)
    else if (action === 'history') setHistoryOpen(true)
    else if (action === 'workflow') void saveAsWorkflow()
    else if (action === 'leave' && !isOwner) askLeave()
    else if (action === 'delete' && isOwner && !isDefault) askDelete()
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
  const conversation = useConceptThread(
    thread.data?.comments,
    basis.viewerId,
    personOf,
    isOwner,
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
            extra={
              isOwner && successors.length > 0 && !isDefault ? (
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
              rename: isOwner
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
                    value={detail?.my_label ?? '__none'}
                    onValueChange={(value) => {
                      const previous = detail?.my_label ?? null
                      const next = value === '__none' ? null : value
                      if (next === previous) return
                      membership.mutate(
                        { id, body: { label: next } },
                        {
                          /* polish: shelves F6. A shelf move has a way back
                             now, the undo bar, like every other move. */
                          onSuccess: () => {
                            pushUndo(
                              next === null
                                ? `Took "${detail?.name ?? ''}" off ${previous ?? 'its shelf'}`
                                : `Moved "${detail?.name ?? ''}" to ${next}`,
                              () => {
                                membership.mutate({ id, body: { label: previous } })
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
              leave: isOwner ? undefined : askLeave,
              delete: isOwner && !isDefault ? askDelete : undefined,
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
              <PageCover storageName={coverKey} />
            </div>
          ) : null}
          {/* One column since the faces and Share moved to the window bar:
              the split this header used to make had a right-hand column in
              it, and `page-head.tsx` draws the same head without one. */}
          <header className={`group/head ${hasCover ? '' : 'pt-2'}`}>
            <div className="min-w-0">
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

              <div className="mt-1">
                <AddCoverAction storageName={coverKey} />
              </div>

              {/* The count rides the title's own line rather than stacking a
                  third block under it, which is 9.4's "the fact 'N of M done'"
                  and DES-149's "the fact rides the title's line; prose sits
                  under it". */}
              {/* polish: pagehead F6. On a phone the counter wraps under the
                  name rather than cutting it to "Apart...". */}
              <div className="mt-1.5 flex items-baseline gap-3 max-md:flex-col max-md:items-start max-md:gap-1">
                {isOwner && renaming ? (
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
                     AC-226 asks the imported starter's page for, and a member
                     is offered no textbox at all (AC-217). */
                  <h1
                    onClick={isOwner ? () => { setRenaming(true) } : undefined}
                    className={`min-w-0 max-w-full truncate text-2xl leading-8 font-semibold text-foreground max-md:whitespace-normal${
                      isOwner ? ' cursor-text' : ''
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

              {/* 9.6's editable description, any member's (the matrix: "the
                  page: blocks, cover, icon, colour, description, yes for both
                  roles; the event log says who"). It reads and writes 4.3's
                  column through `lib/page-identity.ts`'s folder half, which is
                  why the lifted field needs nothing of its own here. */}
              <PageDescription
                storageName={coverKey}
                label="Folder description"
                offer={pristine}
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
                isEmpty={bothEmpty && !(place.mode === 'board' && completedDays.length > 0)}
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
                ) : loose.length === 0 && visible.length === 0 ? (
                  <p className="h-[var(--control-height)] px-2 text-sm leading-[var(--control-height)] text-[var(--color-graphite-500)]">
                    {FILTER_NARROWED_EMPTY}
                  </p>
                ) : (
                  /* 9.6: "the loose open tasks", which since S18 means the ones
                     under no section. The rest are drawn under the section
                     block they name, below. */
                  <TaskRows
                    tasks={loose}
                    context={context}
                    actions={actions}
                    onAsk={confirm.ask}
                    arrangement={arrangement}
                  />
                )}
              </PageBody>
              {/* 9.6: the quick-add at the loose list's foot; 9.3's sixth
                  entry-point row states its value: this folder, no due date.
                  Absent in board view, where every column captures with its own
                  value and a row above them would capture with none (9.1). */}
              {place.mode === 'board' ? null : (
                <QuickAdd
                  folderName={detail?.name ?? 'this folder'}
                  onAdd={(title) => {
                    create.mutate(
                      { title, folder_id: id },
                      { onSuccess: (made) => placeLast(made.id, loose) },
                    )
                  }}
                  onOpenFullForm={(title) => {
                    openTaskForm({ folder_id: id, title })
                  }}
                />
              )}
            </PageSection>

            {/* The page's blocks (4.17): sections, paragraphs, images, with
                the insert affordance between them. */}
            <PageBody query={page} isEmpty={false} emptyCopy="">
              <BlocksEditor
                blocks={page.data?.blocks ?? []}
                onPut={putBlocks}
                sectionExtras={sectionExtras}
                onDeleteSection={(block, remove) => {
                  setSectionAsk({ block, remove })
                }}
                /* S26: an image block is inserted empty and fills itself, three
                   ways (L-197). The hidden input this replaces uploaded before
                   the block existed, so choosing was the only gesture that
                   could land anywhere. */
                folderId={id}
              />
            </PageBody>
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

      {/* polish: folderpage F5: the section's question, with its consequence. */}
      <Dialog open={sectionAsk !== null} onOpenChange={(next) => { if (!next) setSectionAsk(null) }}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete section “{sectionAsk?.block.text ?? ''}”?</DialogTitle>
            <DialogDescription>
              {(() => {
                const count = sectionAsk === null ? 0 : (bySection.get(sectionAsk.block.id) ?? []).length
                return count === 0
                  ? 'The heading goes; nothing else changes.'
                  : `The heading goes. ${count === 1 ? 'Its task stays' : `Its ${count} tasks stay`} in the folder and ${count === 1 ? 'moves' : 'move'} to the loose list above the sections.`
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Keep it</Button>} />
            <Button
              variant="destructive"
              onClick={() => {
                sectionAsk?.remove()
                setSectionAsk(null)
              }}
            >
              Delete section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 9.6: an owner with other members leaves only by transferring
          first; the default successor is the longest-standing member. */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Transfer ownership</DialogTitle>
            <DialogDescription>
              Choose who owns {detail?.name} next. You stay a member.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 px-1 pb-2">
            {successors.map((member, index) => (
              <Button
                key={member.user.id}
                variant={index === 0 ? 'outline' : 'ghost'}
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
                {index === 0 ? ' (longest-standing)' : ''}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Item 38's question, S28b: see `askDelete`. */}
      <Dialog open={deleteAsk} onOpenChange={setDeleteAsk}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Delete {detail?.name}?</DialogTitle>
            <DialogDescription>
              {ownerDeleteQuestion(detail?.name ?? '', successors.length)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Cancel</Button>} />
            <Button variant="outline" onClick={leaveToMembers}>
              Leave it to the members
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
