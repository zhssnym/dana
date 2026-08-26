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
import { useEffect, useMemo, useRef, useState } from 'react'
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
  useSubjectEvents,
  useThread,
} from '../api/queries.js'
import { uploadFile } from '../api/http.js'
import { BlocksEditor } from '../components/page/BlocksEditor.js'
import { ConversationThread } from '../components/page/ConversationThread.js'
import { IdentityHead } from '../components/page/IdentityHead.js'
import { ObjectMenu } from '../components/object-menu.js'
import { PersonFace } from '../components/person-face.js'
import { QuickAdd } from '../components/quick-add.js'

import { AvatarGroup } from '../components/ui/avatar.js'
import { Button } from '../components/ui/button.js'
import { MORE_ACTIONS } from '../components/ui/copy.js'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { formatAgo, formatDayHeading } from '../parts/format-dates.js'
import { initialsOf } from '../parts/presenters.js'
import type { RowContext } from '../parts/presenters.js'
import { useRowActions } from '../parts/useRowActions.js'
import { folderLink } from '../lib/nav-links.js'
import { paths } from '../routes.js'
import { FOLDER_ACTION_PARAM } from '../shell/app-sidebar.js'
import { openTaskForm } from '../shell/overlays.js'
import { useReserveRightEdge } from '../shell/right-edge.js'
import { pushUndo, undoLabel } from '../shell/undo.js'
import { WindowBarActions } from '../shell/WindowBar.js'
import { CollapsibleSection, PageSection } from '../states/PageSection.js'
import { groupRows } from '../views/grouping.js'
import { PLACES } from '../views/place-pages.js'
import { TaskBoard } from '../views/TaskBoard.js'
import { PlaceChrome, usePlace } from '../views/usePlace.js'
import { MorePages, PageBody } from '../states/PageStates.js'
import { FOLDER_EMPTY } from './empty-states.js'
import { FolderSharingPanel } from './FolderSharingPanel.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'
import type { PageBlockWrite } from '../../shared/pages.js'
import type { TaskCard } from '../../shared/tasks.js'

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
  const open = useFolderOpenTasks(id)
  const page = useFolderPage(id)
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
  const groupLabels = [
    ...new Set(
      (library.data ?? [])
        .map((entry) => entry.my_label)
        .filter((label): label is string => label !== null && label !== ''),
    ),
  ]
  const putPage = usePutFolderPage()
  const postComment = usePostComment()
  const patchComment = usePatchComment()
  const deleteComment = useDeleteComment()
  const setLike = useSetCommentLike()
  const [completedOpen, setCompletedOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  // 9.6's inline rename: the title is a heading until this is true.
  const [renaming, setRenaming] = useState(false)
  const [conversationHome, setConversationHome] =
    useState<ConversationHome>(readConversationHome)
  const [footThreadOpen, setFootThreadOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const completed = useFolderCompletedTasks(id, completedOpen)
  const connections = useConnections()
  const events = useSubjectEvents(historyOpen ? `folder:${id}` : null)
  const threadOpen =
    conversationHome === 'foot' ? footThreadOpen : panelOpen

  /*
  9.6's two right-edge panels take room rather than covering (DES-154,
  DES-186). Each publishes its own width while it is open and the shell pads
  the page body by whatever is reserved; `shell/right-edge.ts` carries one
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

  const imageInput = useRef<HTMLInputElement>(null)
  const imageAt = useRef<number>(0)

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
    openFull: (column) => {
      openTaskForm({
        folder_id: id,
        ...(column?.due_date === undefined ? {} : { due_date: column.due_date }),
      })
    },
  })
  const visible = place.narrow(openRows)
  const boardColumns = groupRows(visible, place.groupBy, place.today, place.viewerId)
  const completedDays = mergeCompletedDays(completed.data?.pages)

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
      />
      {/* 9.6: "a capture per section". 9.3's entry table gives it this
          folder and this section, the section being what the surface it
          stands in adds to the page's own defaults. */}
      <QuickAdd
        folderName={detail?.name ?? 'this folder'}
        onAdd={(title) => {
          create.mutate({ title, folder_id: id, section_block_id: blockId })
        }}
        onOpenFullForm={() => {
          openTaskForm({ folder_id: id })
        }}
      />
    </>
  )
  const context: RowContext = {
    ...basis,
    showFolder: false,
    starTooltip: actions.starTooltipMode,
  }

  const isOwner = detail?.is_owner ?? false
  const isDefault = detail?.is_default ?? false
  const members = detail?.members ?? []

  /** Who a comment's author is, off the members already read; a face the
   * roster cannot resolve says "Someone" rather than leaking an id. */
  const authorNames = useMemo(() => {
    const names = new Map<string, string>()
    for (const member of members) {
      const name = member.user.display_name
      if (name !== null) names.set(member.user.id, name)
    }
    for (const connection of connections.data ?? []) {
      const name = connection.user.display_name
      if (name !== null && !names.has(connection.user.id)) {
        names.set(connection.user.id, name)
      }
    }
    return names
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

  /** DES-206: structure and titles only, the import's own keep-set. */
  function saveAsWorkflow(): void {
    const sections = (page.data?.blocks ?? [])
      .filter((block) => block.kind === 'section' || block.kind === 'paragraph')
      .map((block) => ({ kind: block.kind, text: block.text ?? '' }))
      .filter((block) => block.text !== '')
    const file = JSON.stringify(
      {
        dana: 'workflow',
        version: 1,
        name: detail?.name ?? '',
        folders: [
          {
            name: detail?.name ?? 'Folder',
            tasks: [...scheduled, ...unscheduled]
              .filter((task) => task.status === 'pending')
              .map((task) => ({ title: task.title })),
            ...(sections.length > 0 ? { blocks: sections } : {}),
          },
        ],
      },
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
    else if (action === 'workflow') saveAsWorkflow()
    else if (action === 'leave' && !isOwner) askLeave()
    else if (action === 'delete' && isOwner && !isDefault) doDelete()
  })

  /* 8.9's default successor: the longest-standing other member. */
  const successors = members
    .filter((member) => member.user.id !== basis.viewerId)
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at))

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

  const threadSurface = (
    <div>
      <div className="flex justify-end pb-1">{conversationSwitch}</div>
      <ConversationThread
        comments={thread.data?.comments ?? []}
        viewerId={basis.viewerId}
        isOwner={isOwner}
        authorName={(authorId) => authorNames.get(authorId) ?? 'Someone'}
        actions={{
          onPost: (body, parentId) => {
            postComment.mutate({
              folderId: id,
              body: {
                body,
                ...(parentId === null ? {} : { parent_id: parentId }),
              },
            })
          },
          onEdit: (commentId, body) => {
            patchComment.mutate({ id: commentId, body: { body } })
          },
          onDelete: (commentId) => {
            deleteComment.mutate(commentId)
          },
          onLike: (commentId, liked) => {
            setLike.mutate({ id: commentId, liked })
          },
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
        <WindowBarActions>
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
                      membership.mutate({
                        id,
                        body: { label: value === '__none' ? null : value },
                      })
                    }}
                  >
                    {groupLabels.map((label) => (
                      <DropdownMenuRadioItem key={label} value={label} closeOnClick>
                        {label}
                      </DropdownMenuRadioItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioItem value="__none" closeOnClick>
                      No group
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
              },
              duplicate: () => {
                /* DES-198 server-side; the copy is the duplicator's own
                   private folder, and the page goes to it. */
                duplicate.mutate(id, {
                  onSuccess: (made) => {
                    navigate(paths.folder(made.id))
                  },
                })
              },
              workflow: saveAsWorkflow,
              leave: isOwner ? undefined : askLeave,
              delete: isOwner && !isDefault ? doDelete : undefined,
            }}
          />
        </WindowBarActions>

        <PageSection name="Folder header">
          <header className="flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <IdentityHead
                kind="folder"
                identity={{
                  name: detail?.name ?? '',
                  icon: detail?.icon ?? null,
                  color: detail?.color ?? null,
                  coverFileId: detail?.cover_file_id ?? null,
                  description: detail?.description ?? null,
                }}
                canRename={isOwner}
                canCover
                renaming={renaming}
                onStartRename={() => {
                  setRenaming(true)
                }}
                onEndRename={() => {
                  setRenaming(false)
                }}
                onIdentity={(next) => {
                  patch.mutate({ id, body: next })
                }}
                onRename={(next) => {
                  patch.mutate({ id, body: { name: next } })
                }}
                onDescription={(next) => {
                  patch.mutate({ id, body: { description: next } })
                }}
                onCover={(file) => {
                  if (file === null) {
                    patch.mutate({ id, body: { cover_file_id: null } })
                    return
                  }
                  void uploadFile('cover', id, file).then((stored) => {
                    patch.mutate({ id, body: { cover_file_id: stored.id } })
                  })
                }}
              />
              {/* 9.6's completion ratio, which 8.11 computes for us. */}
              <p className="mt-1 text-xs text-muted-foreground">
                {detail?.counts.completed ?? 0} /{' '}
                {(detail?.counts.completed ?? 0) + (detail?.counts.pending ?? 0)}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {/* 9.6's member avatar stack. */}
              <AvatarGroup>
                {members.map((member) => (
                  <PersonFace
                    key={member.user.id}
                    name={member.user.display_name ?? 'Someone'}
                    initials={initialsOf(member.user.display_name ?? 'Someone')}
                  />
                ))}
              </AvatarGroup>

              {/* 9.6's Share button. Withheld on a default folder, which
                  INV-2 makes single-member and 5.3 refuses an add on. */}
              {isDefault ? null : (
                <Button
                  variant="outline"
                  className="h-[var(--control-height)] px-3 text-sm"
                  aria-expanded={sharing}
                  onClick={() => {
                    setSharing(!sharing)
                  }}
                >
                  <Share2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  Share
                </Button>
              )}
            </div>
          </header>
        </PageSection>

        <div className="mt-7 space-y-7">
          <PageSection name="All open tasks">
            <PageBody
              query={open}
              isEmpty={bothEmpty}
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
                  columns={boardColumns}
                  context={context}
                  actions={actions}
                  onAsk={confirm.ask}
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
                  create.mutate({ title, folder_id: id })
                }}
                onOpenFullForm={() => {
                  openTaskForm({ folder_id: id })
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
              onInsertImage={(index) => {
                imageAt.current = index
                imageInput.current?.click()
              }}
            />
          </PageBody>
          <input
            ref={imageInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file === undefined) return
              void uploadFile('image', id, file).then((stored) => {
                const body = (page.data?.blocks ?? []).map((block, index) => ({
                  id: block.id,
                  kind: block.kind,
                  position: index,
                  text: block.text,
                  file_id: block.file_id,
                  ref_folder_id: block.ref_folder_id,
                  updated_at: block.updated_at,
                }))
                body.splice(Math.min(imageAt.current, body.length), 0, {
                  kind: 'image',
                  position: imageAt.current,
                  file_id: stored.id,
                } as (typeof body)[number])
                putBlocks(
                  body.map((entry, position) => ({ ...entry, position })),
                )
              })
            }}
          />

          {/* Q7 hides the third section while it is empty; the control is
              rendered on the folder's own completed count. */}
          {(detail?.counts.completed ?? 0) === 0 ? null : (
            <CollapsibleSection
              name="Completed"
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

      It publishes its width to `shell/right-edge.ts` and the shell pads the
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

      {/* 9.6's History, the object's recent events. */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="right" className="w-[380px]">
          <SheetHeader>
            <SheetTitle>History</SheetTitle>
            <SheetDescription>What happened in {detail?.name}.</SheetDescription>
          </SheetHeader>
          <div className="space-y-2 overflow-y-auto px-4 pb-4">
            {(events.data?.events ?? []).map((event) => (
              <p
                key={event.id}
                className="text-[13px] leading-5 text-[var(--color-graphite-700)]"
              >
                <span className="font-medium">
                  {authorNames.get(event.actor_id) ?? 'Someone'}
                </span>{' '}
                {event.verb} {event.subject_name}
                {event.detail === null ? '' : `, ${event.detail}`}
                <span className="block text-[11px] leading-4 text-[var(--color-graphite-400)]">
                  {formatAgo(event.created_at, Date.now())}
                </span>
              </p>
            ))}
            {(events.data?.events.length ?? 0) === 0 ? (
              <p className="text-[13px] leading-5 text-[var(--color-graphite-500)]">
                Nothing yet.
              </p>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

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

      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
