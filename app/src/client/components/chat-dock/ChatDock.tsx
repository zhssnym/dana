/*
PROTOTYPE (experimental/chat-side-panel): the chat dock.

One panel fixed at the window's right edge holding a project's chat and its
people. It stays open while the person works: a task opens its conversation
here, beside the task. Which project, section and thread are open is
`state/chat-dock.ts`, never the URL, so nothing here navigates.

The chat is the Discussion tab's own list and thread (`consultation/`), with
the open thread read from the dock's store. The viewer's facts and the
people directory are derived the way `FolderPage` derives them for its
`ConsultationPanel`: the roster is the project's (a tab's header folder),
and names fall back to connections, then "Someone".

The dock follows the page: on another project's page it becomes that
project's, and on a task it opens that task's conversation (once per visit,
so going back to the list is not undone). "Widen" is for reading a long
thread: the dock then covers the page beside it rather than squeezing it.
*/
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMatch, useNavigate } from 'react-router'

import { FOLDER_ACCESS_LABELS } from '../../../shared/folder-access.js'
import type { GetFolderResponse } from '../../../shared/folders.js'
import { useDiscussTask } from '../../api/consultation.js'
import { useConnections, useFolder, useMe, useTask } from '../../api/queries.js'
import { viewerFacts } from '../../lib/folder-authority.js'
import { UsersRound, X } from '../../lib/icons.js'
import type { PersonResolver } from '../../lib/thread.js'
import { initialsOf } from '../../parts/presenters.js'
import { paths } from '../../routes.js'
import {
  closeChatDock,
  manageTeam,
  openChatDock,
  toggleChatDockWide,
  useChatDock,
  useChatDockWide,
} from '../../state/chat-dock.js'
import type { ChatDockState } from '../../state/chat-dock.js'
import type { ConsultationViewer } from '../consultation/authority.js'
import { DiscussionList } from '../consultation/DiscussionList.js'
import { DiscussionView } from '../consultation/DiscussionView.js'
import { RosterTints } from '../default-avatar.js'
import { PersonFace } from '../person-face.js'
import { InlineError, SkeletonList } from '../state-patterns.js'
import { Button } from '../ui/button.js'
import { Tabs } from '../ui/tabs.js'
import { cn } from '../ui/utils.js'

type Section = 'chat' | 'people'

export function ChatDock(): React.JSX.Element | null {
  const dock = useChatDock()
  if (dock === null) return null
  return (
    <>
      <Follow dock={dock} />
      <Dock key={dock.folderId} folderId={dock.folderId} section={dock.section} discussionId={dock.discussionId} />
    </>
  )
}

/** The task on screen, when the page is a task's. */
function useRouteTask(): string | null {
  return useMatch('/app/tasks/:id')?.params.id ?? null
}

/* Renders nothing; keeps the open dock on what the person is looking at. */
function Follow({ dock }: { readonly dock: ChatDockState }): null {
  const pageId = useMatch('/app/folders/:id')?.params.id ?? null
  const taskId = useRouteTask()
  const page = useFolder(pageId ?? '', pageId !== null).data
  const docked = useFolder(dock.folderId).data
  const task = useTask(taskId).data
  /* The task last followed: its thread opens once, not on every render. */
  const followed = useRef<string | null>(null)

  useEffect(() => {
    if (page === undefined || docked === undefined || page.is_default) return
    if (page.project_id === docked.project_id) return
    openChatDock({ folderId: page.project_id, section: dock.section })
  }, [page, docked, dock.section])

  useEffect(() => {
    if (taskId === null) followed.current = null
    if (taskId === null || task === undefined || task.id !== taskId || followed.current === taskId) return
    followed.current = taskId
    if (task.folder.is_default) return
    openChatDock({ folderId: task.folder.id, section: 'chat', discussionId: task.linked_discussions[0]?.id ?? null })
  }, [taskId, task])

  return null
}

function Dock({
  folderId,
  section,
  discussionId,
}: {
  readonly folderId: string
  readonly section: Section
  readonly discussionId: string | null
}): React.JSX.Element {
  /* The page the dock was opened from; a tab's people and name are its
     project's, as on the page's own header. */
  const here = useFolder(folderId)
  const onTab = here.data !== undefined && here.data.tab_position !== null
  const headId = onTab ? here.data.project_id : folderId
  const head = useFolder(headId, here.data !== undefined)
  const project = head.data
  const viewerId = useMe().data?.user.id ?? null
  const connections = useConnections()

  const members = useMemo(() => project?.members ?? [], [project?.members])
  const facts = viewerFacts(project, members, viewerId)
  const viewer: ConsultationViewer | null = facts === null || viewerId === null ? null : { viewerId, facts }

  const people = useMemo(() => {
    const known = new Map<string, { name: string; image?: string }>()
    for (const { user } of [...members, ...(connections.data ?? [])]) {
      if (user.display_name === null || known.has(user.id)) continue
      known.set(user.id, { name: user.display_name, ...(user.avatar_url === null ? {} : { image: user.avatar_url }) })
    }
    return known
  }, [members, connections.data])
  const personOf: PersonResolver = useCallback((authorId) => people.get(authorId) ?? { name: 'Someone' }, [people])

  const failed = here.isError ? here : head.isError ? head : null
  const wide = useChatDockWide()
  const navigate = useNavigate()
  const onProjectPage = useMatch('/app/folders/:id') !== null
  /* The full people panel is the project page's; from anywhere else, go there
     first and it opens on arrival. */
  const manage = (): void => {
    if (!onProjectPage) void navigate(paths.folder(headId))
    manageTeam()
  }
  return (
    <aside
      data-chat-dock=""
      aria-label="Project chat"
      /* Under the sheets, menus and dialogs (z-50), so a thread's own menu
         and the full people panel open over it. */
      className={cn(
        'fixed top-0 right-0 bottom-0 z-40 flex max-w-full flex-col border-l border-border bg-background',
        wide ? 'w-3xl' : 'w-[var(--sharing-panel-width)]',
      )}
    >
      <header className="shrink-0 px-4 pt-2">
        <div className="flex h-9 items-center gap-1">
          <p className="min-w-0 flex-1 truncate text-sm font-title text-foreground" title={project?.name}>
            {project?.name ?? ''}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={wide}
            className="shrink-0 font-normal text-muted-foreground max-md:hidden"
            onClick={toggleChatDockWide}
          >
            {wide ? 'Narrow' : 'Widen'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close chat"
            className="-mr-2 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={closeChatDock}
          >
            <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </div>
        {/* The project's own tab row, so the dock reads as part of it. Back
            to Chat keeps the thread that was open. */}
        <Tabs
          label="Show"
          value={section}
          items={[
            { value: 'chat', label: 'Chat' },
            { value: 'people', label: 'People' },
          ]}
          onValueChange={(to) => { openChatDock({ folderId, section: to, discussionId }) }}
        />
      </header>

      <RosterTints ids={members.map((member) => member.user.id)}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-4 pt-4">
          {failed !== null ? (
            <InlineError onRetry={() => void failed.refetch()} />
          ) : project === undefined ? (
            <SkeletonList />
          ) : section === 'people' ? (
            <People project={project} viewerId={viewerId} onManage={manage} />
          ) : (
            <Chat folderId={folderId} discussionId={discussionId} viewer={viewer} personOf={personOf} />
          )}
        </div>
      </RosterTints>
    </aside>
  )
}

/* `ConsultationPanel`, with the open thread in the dock's store. */
function Chat({
  folderId,
  discussionId,
  viewer,
  personOf,
}: {
  readonly folderId: string
  readonly discussionId: string | null
  readonly viewer: ConsultationViewer | null
  readonly personOf: PersonResolver
}): React.JSX.Element {
  const [started, setStarted] = useState<string | null>(null)
  /* The thread last left, whose row takes focus when the list returns. */
  const [left, setLeft] = useState<string | null>(null)
  const open = (id: string | null): void => { openChatDock({ folderId, section: 'chat', discussionId: id }) }
  /* On a task with no conversation yet, the list offers to start one. */
  const taskId = useRouteTask()
  const task = useTask(taskId).data
  const discuss = useDiscussTask()
  const unspoken = task !== undefined && !task.folder.is_default && task.linked_discussions.length === 0

  if (discussionId === null) {
    return (
      <div className="pb-4">
        {unspoken ? (
          <div className="mb-4 flex items-center justify-between gap-4 border-b border-border pb-4">
            <p className="min-w-0 text-sm text-muted-foreground">No conversation about this task yet.</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              disabled={discuss.isPending}
              onClick={() => {
                discuss.mutate(task.id, {
                  onSuccess: ({ discussion }) => {
                    setStarted(discussion.id)
                    open(discussion.id)
                  },
                })
              }}
            >
              Start one
            </Button>
          </div>
        ) : null}
        <DiscussionList
          docked
          folderId={folderId}
          viewer={viewer}
          personOf={personOf}
          returnTo={left}
          onOpen={open}
          onStarted={(id) => {
            setStarted(id)
            open(id)
          }}
        />
      </div>
    )
  }
  return (
    <DiscussionView
      key={discussionId}
      docked
      discussionId={discussionId}
      folderId={folderId}
      viewer={viewer}
      personOf={personOf}
      justStarted={started === discussionId}
      onBack={() => {
        setLeft(discussionId)
        open(null)
      }}
    />
  )
}

/* Who is on the project, read-only; changing it is the full people panel. */
function People({ project, viewerId, onManage }: {
  readonly project: GetFolderResponse
  readonly viewerId: string | null
  readonly onManage: () => void
}): React.JSX.Element {
  const members = [...project.members].sort((a, b) => Number(b.is_owner) - Number(a.is_owner))
  return (
    <div className="pb-4">
      <p className="pb-2 text-xs text-muted-foreground">
        {members.length === 1 ? 'Only you, so far' : `${String(members.length)} people on this project`}
      </p>
      <ul role="list" className="flex flex-col gap-[var(--space-row)]">
        {members.map((member) => {
          const name = member.user.display_name ?? 'Someone'
          return (
            <li key={member.user.id} className="flex min-h-[var(--row-height)] items-center gap-[var(--space-inline)] py-1">
              <PersonFace id={member.user.id} name={name} initials={initialsOf(name)} image={member.user.avatar_url} />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {name}
                {member.user.id === viewerId ? <span className="text-muted-foreground"> (you)</span> : null}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {member.is_owner ? 'Owner' : FOLDER_ACCESS_LABELS[member.access]}
              </span>
            </li>
          )
        })}
      </ul>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-[var(--space-group)] -ml-1.5 text-muted-foreground"
        onClick={onManage}
      >
        <UsersRound className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {members.length <= 1 ? 'Add teammates' : 'Manage team'}
      </Button>
    </div>
  )
}
