// The Discussion sidebar. It draws the same list and thread as the full-screen
// page; which thread, filter and presentation are open is workspace-tab state.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useLocation, useMatch, useNavigate } from 'react-router'

import { useDiscussTask } from '../../api/consultation.js'
import { useConnections, useFolder, useMe, useTask } from '../../api/queries.js'
import { viewerFacts } from '../../lib/folder-authority.js'
import { Maximize2, MessagesSquare, X } from '../../lib/icons.js'
import type { PersonResolver } from '../../lib/thread.js'
import { paths } from '../../routes.js'
import { commitActiveTabRoute } from '../../shell/tabs.js'
import {
  closeChatDock,
  DOCK_DEFAULT_WIDTH,
  dockWidthBounds,
  openChatDock,
  setChatDockFilter,
  setChatDockWidth,
  setDiscussionPresentation,
  useChatDock,
  useChatDockWidth,
} from '../../state/chat-dock.js'
import type { ChatDockState } from '../../state/chat-dock.js'
import type { ConsultationViewer } from '../consultation/authority.js'
import { DiscussionList } from '../consultation/DiscussionList.js'
import { DiscussionView } from '../consultation/DiscussionView.js'
import { rememberDiscussionReturnTo } from '../consultation/presentation.js'
import { RosterTints } from '../default-avatar.js'
import { InlineError, SkeletonList } from '../state-patterns.js'
import { Button } from '../ui/button.js'

export function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = (): void => { setWidth(window.innerWidth) }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize) }
  }, [])
  return width
}

export function useDockWidth(): number {
  const chosen = useChatDockWidth()
  const { min, max } = dockWidthBounds(useWindowWidth())
  return Math.min(max, Math.max(min, chosen))
}

export function ChatDock(): React.JSX.Element | null {
  const dock = useChatDock()
  if (dock === null) return null
  return (
    <>
      <Follow dock={dock} />
      <Dock
        key={`${dock.workspaceTabId}:${dock.folderId}`}
        folderId={dock.folderId}
        discussionId={dock.discussionId}
        filter={dock.filter}
      />
    </>
  )
}

function useRouteTask(): string | null {
  return useMatch('/app/tasks/:id')?.params.id ?? null
}

// Renders nothing; keeps the open sidebar on what the person is looking at.
function Follow({ dock }: { readonly dock: ChatDockState }): null {
  const pageId = useMatch('/app/folders/:id')?.params.id ?? null
  const taskId = useRouteTask()
  const page = useFolder(pageId ?? '', pageId !== null).data
  const docked = useFolder(dock.folderId).data
  const task = useTask(taskId).data
  // The task last followed: its thread opens once, not on every render.
  const followed = useRef<string | null>(null)

  useEffect(() => {
    if (page === undefined || page.id !== pageId) return
    // On the full-screen Discussion page, switch presentation but keep the tab's thread
    // and filter for the return trip.
    if (page.kind === 'discussion') {
      setDiscussionPresentation('full')
      return
    }
    if (docked === undefined || page.is_default || page.project_id === docked.project_id) return
    openChatDock({ folderId: page.project_id })
  }, [page, pageId, docked])

  useEffect(() => {
    if (taskId === null) followed.current = null
    if (taskId === null || task === undefined || task.id !== taskId || followed.current === taskId) return
    followed.current = taskId
    if (task.folder.is_default) return
    openChatDock({ folderId: task.folder.id, discussionId: task.linked_discussions[0]?.id ?? null })
  }, [taskId, task])

  return null
}

function Dock({
  folderId,
  discussionId,
  filter,
}: {
  readonly folderId: string
  readonly discussionId: string | null
  readonly filter: 'open' | 'resolved'
}): React.JSX.Element {
  // A tab's people and name are its project's.
  const here = useFolder(folderId)
  const onTab = here.data !== undefined && here.data.tab_position !== null
  const headId = onTab ? here.data.project_id : folderId
  const head = useFolder(headId, here.data !== undefined)
  const project = head.data
  const viewerId = useMe().data?.user.id ?? null
  const connections = useConnections()
  const navigate = useNavigate()
  const location = useLocation()
  const width = useDockWidth()
  const windowWidth = useWindowWidth()
  const box = useRef<HTMLElement | null>(null)

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

  useEffect(() => { box.current?.focus({ preventScroll: true }) }, [])

  // Commit the destination to the workspace tab before going full screen, or a
  // source-route effect mistakes the handoff for Back and collapses it.
  const fullScreen = (): void => {
    const query = discussionId === null ? 'conversation=open' : `discussion=${discussionId}`
    const source = `${location.pathname}${location.search}${location.hash}`
    const target = `${paths.folder(headId)}?${query}`
    rememberDiscussionReturnTo(headId, source)
    commitActiveTabRoute(target)
    setDiscussionPresentation('full')
    void navigate(target)
  }

  const failed = here.isError ? here : head.isError ? head : null

  return (
    <aside
      ref={box}
      data-chat-dock=""
      aria-label="Discussion"
      tabIndex={-1}
      style={{ width: `${String(width)}px` }}
      // Below sheets, menus and dialogs (z-50), so a thread's own menu opens over it.
      className="fixed top-0 right-0 bottom-0 z-40 flex max-w-full flex-col border-l border-border bg-popover bg-clip-padding text-popover-foreground shadow-md outline-none transition-none animate-in fade-in-0 slide-in-from-right-2 duration-150 ease-out motion-reduce:animate-none"
      onKeyDown={(event) => {
        // An open thread takes Escape back to the list first.
        if (event.key === 'Escape' && !event.defaultPrevented && discussionId === null) {
          event.preventDefault()
          closeChatDock()
        }
      }}
    >
      <ResizeEdge width={width} {...dockWidthBounds(windowWidth)} label="Resize discussion" />
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-foreground" aria-hidden="true">
          <MessagesSquare className="size-4" strokeWidth={1.75} />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <h2 className="shrink-0 text-sm font-title text-foreground">Discussion</h2>
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={project?.name}>
            {project?.name ?? ''}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Open full screen"
          title="Open full screen"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={fullScreen}
        >
          <Maximize2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close discussion"
          title="Close"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={closeChatDock}
        >
          <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </header>

      <RosterTints ids={members.map((member) => member.user.id)}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-3 pt-3">
          {failed !== null ? (
            <InlineError onRetry={() => void failed.refetch()} />
          ) : project === undefined ? (
            <SkeletonList />
          ) : (
            <Chat
              folderId={folderId}
              discussionId={discussionId}
              filter={filter}
              viewer={viewer}
              personOf={personOf}
              collaborative={members.length > 1}
            />
          )}
        </div>
      </RosterTints>
    </aside>
  )
}

// Drag, arrow keys, or double-click to reset. The Team panel uses it too.
export function ResizeEdge({ width, min, max, label }: {
  readonly width: number
  readonly min: number
  readonly max: number
  readonly label: string
}): React.JSX.Element {
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const clamp = (next: number): number => Math.min(max, Math.max(min, next))

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus()
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const current = drag.current
    if (current === null || current.pointerId !== event.pointerId) return
    // The edge is on the left, so dragging left widens.
    setChatDockWidth(clamp(current.startWidth + current.startX - event.clientX))
  }
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 48 : 16
    const next =
      event.key === 'ArrowLeft' ? width + step
        : event.key === 'ArrowRight' ? width - step
          : event.key === 'Home' ? max
            : event.key === 'End' ? min
              : null
    if (next === null) return
    event.preventDefault()
    setChatDockWidth(clamp(next))
  }

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      aria-valuetext={`${String(width)} pixels`}
      tabIndex={0}
      title={label}
      className="absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize touch-none outline-none md:block after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent hover:after:bg-border focus-visible:after:bg-ring"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={() => { setChatDockWidth(clamp(DOCK_DEFAULT_WIDTH)) }}
      onKeyDown={onKeyDown}
    />
  )
}

function Chat({
  folderId,
  discussionId,
  filter,
  viewer,
  personOf,
  collaborative,
}: {
  readonly folderId: string
  readonly discussionId: string | null
  readonly filter: 'open' | 'resolved'
  readonly viewer: ConsultationViewer | null
  readonly personOf: PersonResolver
  readonly collaborative: boolean
}): React.JSX.Element {
  const [started, setStarted] = useState<string | null>(null)
  // The thread last left, whose row takes focus when the list returns.
  const [left, setLeft] = useState<string | null>(null)
  const open = (id: string | null): void => { openChatDock({ folderId, discussionId: id }) }
  // A task may start a thread only while the project is collaborative.
  const taskId = useRouteTask()
  const task = useTask(taskId).data
  const discuss = useDiscussTask()
  const unspoken =
    collaborative &&
    task !== undefined &&
    !task.folder.is_default &&
    task.linked_discussions.length === 0

  if (discussionId === null) {
    return (
      <div className="pb-4">
        {unspoken ? (
          <div className="mb-4 flex items-center justify-between gap-4 border-b border-border pb-4">
            <p className="min-w-0 text-sm text-muted-foreground">No discussion about this task yet.</p>
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
          filter={filter}
          onFilterChange={setChatDockFilter}
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