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
owner's: an inline field for them, a heading for a member, and no control a
403 would answer (DES-225). The "Label and color" dialog is retired with
its section sentence; 4.4's per-member color column is written by no v2
surface.

**Tasks render loose, and the reason is recorded rather than hidden.** 9.6
assigns tasks to sections, but Q7's rows are frozen 7.0 TaskCards and carry
no section_block_id; only the single-task read does. Rendering placement
would need an additive field on the folder read, which is a frozen-shape
widening and a human decision (protocol section 1), escalated at this
session with a recommendation. Until it is ruled, every open task renders
in the one loose list, which is factually correct today because no shipped
surface writes an assignment; the per-section capture waits with it, and
AC-093's file records that arm as owed.

**The open list keeps its v1 region, filter and order.** AC-176 still
asserts "All open tasks", the three filter options and Q7's order, and its
text was not among the twenty reworked; the v2 filter it will hand over to
is the window bar's, which is S10's package. The select survives here as
the same interim S9's pages used, and S10 retires it with AC-176's own
Replace unit when the window-bar filter lands.

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
import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import {
  useCreateTask,
  useDeleteFolder,
  useLeaveFolder,
  useDeleteComment,
  useDuplicateFolder,
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
import { QuickAdd } from '../components/quick-add.js'
import { NativeSelect } from '../components/ui/native-select.js'
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
} from '../components/ui/avatar.js'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
  LogOut,
  MessageSquare,
  MoreHorizontal,
  PanelRight,
  Pencil,
  Share2,
  Trash2,
} from '../lib/icons.js'
import { formatAgo, formatDayHeading } from '../parts/format-dates.js'
import { initialsOf } from '../parts/presenters.js'
import type { RowContext } from '../parts/presenters.js'
import { useRowActions } from '../parts/useRowActions.js'
import { paths } from '../routes.js'
import { openTaskForm } from '../shell/overlays.js'
import { pushUndo, undoLabel } from '../shell/undo.js'
import { WindowBarActions } from '../shell/WindowBar.js'
import { CollapsibleSection, PageSection } from '../states/PageSection.js'
import { MorePages, PageBody } from '../states/PageStates.js'
import { FOLDER_EMPTY } from './empty-states.js'
import { FolderSharingPanel } from './FolderSharingPanel.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'
import type { PageBlockWrite } from '../../shared/pages.js'

/**
 * 9.1's names table for this page's interim filter: the control, then its
 * three options in the order that table writes them. See the header note on
 * AC-176 and the S10 handover.
 */
const FILTER_OPEN_TASKS = 'Filter open tasks'
type OpenFilter = 'all' | 'scheduled' | 'unscheduled'
const FILTER_OPTIONS: readonly { value: OpenFilter; label: string }[] = [
  { value: 'all', label: 'All open tasks' },
  { value: 'scheduled', label: 'With a due date' },
  { value: 'unscheduled', label: 'Without a due date' },
]

const FILTER_EMPTY: Record<OpenFilter, string> = {
  all: 'No open tasks.',
  scheduled: 'No tasks with a due date.',
  unscheduled: 'No tasks without a due date.',
}

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
  const folder = useFolder(id)
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
  const putPage = usePutFolderPage()
  const postComment = usePostComment()
  const patchComment = usePatchComment()
  const deleteComment = useDeleteComment()
  const setLike = useSetCommentLike()
  const [completedOpen, setCompletedOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [filter, setFilter] = useState<OpenFilter>('all')
  const [conversationHome, setConversationHome] =
    useState<ConversationHome>(readConversationHome)
  const [footThreadOpen, setFootThreadOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const completed = useFolderCompletedTasks(id, completedOpen)
  const connections = useConnections()
  const events = useSubjectEvents(historyOpen ? `folder:${id}` : null)
  const threadOpen =
    conversationHome === 'foot' ? footThreadOpen : panelOpen
  const thread = useThread(id, null, threadOpen)
  const nameHost = useRef<HTMLDivElement | null>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const imageAt = useRef<number>(0)

  const detail = folder.data
  const scheduled = open.data?.scheduled ?? []
  const unscheduled = open.data?.unscheduled ?? []
  const bothEmpty = scheduled.length === 0 && unscheduled.length === 0
  /*
  Q7's order, kept rather than made: Scheduled first with Q3's order, then
  Unscheduled with Q2's; the filter chooses between the two arrays and
  changes neither (AC-176).
  */
  const visible =
    filter === 'scheduled'
      ? scheduled
      : filter === 'unscheduled'
        ? unscheduled
        : [...scheduled, ...unscheduled]
  const completedDays = mergeCompletedDays(completed.data?.pages)
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
    <div className="space-y-7" ref={nameHost}>
      {/* The header is the folder read, so a folder the viewer cannot see
          renders 10.2's answer here: nonexistent, never forbidden. */}
      <PageBody query={folder} isEmpty={false} emptyCopy="">
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
          {/* 9.1: the bar's right end holds the object's overflow menu. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={MORE_ACTIONS}
                  className="size-7 rounded-md text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)]"
                />
              }
            >
              <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onClick={() => {
                  setHistoryOpen(true)
                }}
              >
                History
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `${globalThis.location.origin}${paths.folder(id)}`,
                  )
                }}
              >
                Copy link
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  /* DES-198 server-side; the copy is the duplicator's own
                     private folder, and the page goes to it. */
                  duplicate.mutate(id, {
                    onSuccess: (made) => {
                      navigate(paths.folder(made.id))
                    },
                  })
                }}
              >
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={saveAsWorkflow}>
                Save as workflow
              </DropdownMenuItem>
              {isOwner ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      nameHost.current
                        ?.querySelector<HTMLInputElement>(
                          'input[aria-label="Folder name"]',
                        )
                        ?.focus()
                    }}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                    Rename folder
                  </DropdownMenuItem>
                  {successors.length > 0 && !isDefault ? (
                    <DropdownMenuItem
                      onClick={() => {
                        setTransferOpen(true)
                      }}
                    >
                      Transfer ownership
                    </DropdownMenuItem>
                  ) : null}
                  {isDefault ? null : (
                    <DropdownMenuItem variant="destructive" onClick={doDelete}>
                      <Trash2 className="size-4" aria-hidden="true" />
                      Delete folder
                    </DropdownMenuItem>
                  )}
                </>
              ) : (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={askLeave}>
                    <LogOut className="size-4" aria-hidden="true" />
                    Leave folder
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
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
              {/* The interim filter; see the header note (AC-176, S10). */}
              <NativeSelect
                aria-label={FILTER_OPEN_TASKS}
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value as OpenFilter)
                }}
              >
                {FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>

              {/* 9.6's member avatar stack. */}
              <AvatarGroup>
                {members.map((member) => (
                  <Avatar key={member.user.id} size="sm">
                    <AvatarFallback>
                      {initialsOf(member.user.display_name ?? 'Someone')}
                    </AvatarFallback>
                  </Avatar>
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
              {visible.length === 0 ? (
                <p className="h-[var(--control-height)] px-2 text-sm leading-[var(--control-height)] text-[var(--color-graphite-500)]">
                  {FILTER_EMPTY[filter]}
                </p>
              ) : (
                <TaskRows
                  tasks={visible}
                  context={context}
                  actions={actions}
                  onAsk={confirm.ask}
                />
              )}
            </PageBody>
            {/* 9.6: the quick-add at the loose list's foot; 9.3's sixth
                entry-point row states its value: this folder, no due date. */}
            <QuickAdd
              folderName={detail?.name ?? 'this folder'}
              onAdd={(title) => {
                create.mutate({ title, folder_id: id })
              }}
              onOpenFullForm={() => {
                openTaskForm({ folder_id: id })
              }}
            />
          </PageSection>

          {/* The page's blocks (4.17): sections, paragraphs, images, with
              the insert affordance between them. */}
          <PageBody query={page} isEmpty={false} emptyCopy="">
            <BlocksEditor
              blocks={page.data?.blocks ?? []}
              onPut={putBlocks}
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

      {/* The conversation's panel home. */}
      <Sheet open={conversationHome === 'panel' && panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent side="right" className="w-[380px]">
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
