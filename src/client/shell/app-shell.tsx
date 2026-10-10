/*
 * The global chrome (spec 9.1): sidebar, top bar, toasts, offline banner and update affordance. Pages add none.
 * The top bar is a `div` inside `main`, never a `header` (AC-174). Never write a minimum viewport width
 * utility, even in a comment: Tailwind scans prose. Search overlay first and task form last in document order
 * (tests rely on it).
 */
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Outlet, useLocation } from 'react-router'
import { adoptClock } from '../lib/time-format.js'
import { PanelLeft, RefreshCw, Search } from '../lib/icons.js'

import { ApiError } from '../api/http.js'
import {
  usePatchBundle,
} from '../api/mutations.js'
import {
  useBundle,
  useAllPages,
  useFolders,
  useFolder,
  useMe,
  usePendingInvites,
  useShelves,
  useTask,
  useDiscussion,
} from '../api/queries.js'
import { SearchOverlay } from '../components/search-overlay.js'
import { ShortcutsSheet } from '../components/help-sheet.js'
import { HeardAboutDialog } from '../components/feedback/HeardAboutDialog.js'
import { TaskSurfaceHost } from '../components/task-surface-host.js'
/* Publishes the folder table for the lifted pickers' `folderLibrary()`; mounted once here. */
import { FolderLibraryMemory } from '../lib/folder-library.js'
import { TaskWriter, useApiTaskPatch } from '../tasks/task-writer.js'
import { Button } from '../components/ui/button.js'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '../components/ui/sidebar.js'
import { InviteGate } from '../pages/InviteGate.js'
import { useUpdateAffordance } from '../pwa/useUpdateAffordance.js'
import { paths } from '../routes.js'
import { browserTimezone } from '../api/tz.js'
import { setViewerTimezone } from '../lib/viewer.js'
import { ToastRegion } from '../state/ToastRegion.js'
import { AppSidebar, FOOT_BUTTON } from './app-sidebar.js'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip.js'
import { useFolderGroupActions } from './folder-groups.js'
import { OfflineBanner } from './OfflineBanner.js'
import { UndoBar } from '../components/undo-bar.js'
import { useAppearance } from './appearance.js'
import { mirroredTheme } from '../lib/theme.js'
import { openSearch } from './overlays.js'
import { useRightEdge } from '../components/right-edge.js'
import { ChatDock, useDockWidth, useWindowWidth } from '../components/chat-dock/ChatDock.js'
import { DirectMessageCenter } from '../components/direct-message/DirectMessageCenter.js'
import { DOCK_PAGE_MIN, DOCK_SIDEBAR_ROOM, useChatDock } from '../state/chat-dock.js'
import { WindowBar, WindowBarActions, WindowBarLead } from '../components/window-bar.js'
import { BreadcrumbTrail } from '../components/breadcrumb-trail.js'
import {
  clampSidebarWidth,
  clearSidebarWidth,
  readSidebarCollapsed,
  readSidebarWidth,
  writeSidebarCollapsed,
  writeSidebarWidth,
} from './preferences.js'
import type { Folder } from '../../shared/folders.js'
import type { Shelf } from '../../shared/shelves.js'
import { DEFAULT_FOCUS_LISTS } from '../../shared/bundle.js'
import type { FocusListKey } from './focus-lists.js'

const FOLDER_PREFIX = '/app/folders/'

/**
 * A stable empty list: `folders.data ?? []` would be new every render and reset the group dialogs' half-typed
 * names.
 */
const NO_FOLDERS: readonly Folder[] = []

const NO_SHELVES: readonly Shelf[] = []

/** Spec 10.6's update copy. AC-100 addresses it by this name. */
const UPDATE_AVAILABLE = 'Update available, reload'

/*
 * The one top bar: window bar on a laptop; between Menu and Search below 768px. An open thread takes a phone's
 * whole bar (DiscussionView portals its controls in).
 */
function TopBar({ onOpenSearch }: { readonly onOpenSearch: () => void }): React.JSX.Element {
  const { isMobile, setOpenMobile } = useSidebar()
  const threadOpen = useThreadOpen()
  if (!isMobile) {
    return (
      <div className="shrink-0">
        <WindowBar />
      </div>
    )
  }
  if (threadOpen) {
    return (
      <div className="shrink-0 border-b border-border bg-background">
        <WindowBar phone />
      </div>
    )
  }
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-background px-1">
      <Button
        variant="ghost"
        className="size-10 shrink-0 text-muted-foreground"
        aria-label="Menu"
        onClick={() => {
          setOpenMobile(true)
        }}
      >
        <PanelLeft className="!size-5" strokeWidth={1.75} aria-hidden="true" />
      </Button>
      <div className="min-w-0 flex-1">
        <WindowBar />
      </div>
      <Button
        variant="ghost"
        className="size-10 shrink-0 text-muted-foreground"
        aria-label="Search"
        onClick={onOpenSearch}
      >
        <Search className="!size-5" strokeWidth={1.75} aria-hidden="true" />
      </Button>
    </div>
  )
}

const TASK_PREFIX = '/app/tasks/'

/** Whether a Discussion thread is open (r4: `?discussion=<id>` on a page). */
function useThreadOpen(): boolean {
  const { pathname, search } = useLocation()
  return pathname.startsWith(FOLDER_PREFIX) && new URLSearchParams(search).has('discussion')
}

/* The window bar's left end: a page's trail, a task's page trail and title, or a place's name. */
function TopTrail(): React.JSX.Element {
  const { pathname, search } = useLocation()
  const searchParams = new URLSearchParams(search)
  const teamFull = searchParams.get('team') === 'full'
  const memberId = searchParams.get('member')
  /* An open thread is `?discussion=<id>` on its page; the trail names it. */
  const discussionId = pathname.startsWith(FOLDER_PREFIX) ? searchParams.get('discussion') : null
  const discussion = useDiscussion(discussionId ?? '', discussionId !== null)
  const taskId = pathname.startsWith(TASK_PREFIX) ? pathname.slice(TASK_PREFIX.length) : null
  const task = useTask(taskId)

  /* A tab draws its project's trail; its own crumb would repeat the tab row. */
  const pageId = pathname.startsWith(FOLDER_PREFIX) ? pathname.slice(FOLDER_PREFIX.length) : null
  const allPages = useAllPages(pageId !== null)
  const tab = allPages.data?.find((page) => page.id === pageId)
  const trailId =
    tab !== undefined && tab.tab_position !== null && (discussionId === null || teamFull) ? tab.project_id : pageId
  const team = useFolder(trailId ?? '', teamFull && trailId !== null)

  let trail: React.JSX.Element | null = null
  if (pageId !== null && trailId !== null) {
    const list = new URLSearchParams(search)
    list.delete('discussion')
    list.delete('outcome')
    const listTo = list.size === 0 ? pathname : `${pathname}?${list.toString()}`
    const teamList = new URLSearchParams(search)
    teamList.delete('member')
    const teamTo = `${pathname}?${teamList.toString()}`
    const teamName = team.data?.name ?? 'Project'
    const memberName = team.data?.members.find((member) => member.user.id === memberId)?.user.display_name ?? 'Teammate'
    trail = (
      <BreadcrumbTrail
        folderId={trailId}
        {...(teamFull ? { extra: [
          { name: `${teamName}'s Team`, ...(memberId === null ? {} : { to: teamTo }) },
          ...(memberId === null ? [] : [{ name: memberName }]),
        ] } : discussionId !== null ? { current: discussion.data?.title ?? '', folderTo: listTo } : {})}
      />
    )
  } else if (taskId !== null) {
    trail = task.data === undefined ? null : (
      <BreadcrumbTrail folderId={task.data.folder.id} current={task.data.title} />
    )
  }
  /* With the sidebar hidden on a laptop, its show control sits bottom-left, where the sidebar opens from. */
  const { isMobile, state } = useSidebar()
  return (
    <>
      {/* A phone's open thread draws its own back and title there instead. */}
      <WindowBarLead>{isMobile && discussionId !== null ? null : trail}</WindowBarLead>
      {isMobile || state === 'expanded' ? null : (
        <Tooltip>
          <TooltipTrigger
            render={
              <SidebarTrigger className={`${FOOT_BUTTON} fixed bottom-2 left-2 z-10`} />
            }
          />
          <TooltipContent side="top">Expand sidebar</TooltipContent>
        </Tooltip>
      )}
    </>
  )
}

/* The waiting worker is applied on a click, never without one. */
function UpdateChrome({
  showUpdate,
  onUpdate,
}: {
  readonly showUpdate: boolean
  readonly onUpdate?: () => void
}): React.JSX.Element | null {
  if (!showUpdate) return null
  return (
    <WindowBarActions order={1}>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 text-muted-foreground"
        onClick={onUpdate ?? (() => globalThis.location.reload())}
      >
        <RefreshCw className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
        {UPDATE_AVAILABLE}
      </Button>
    </WindowBarActions>
  )
}

/*
 * Once per device: an account still on the default UTC zone takes the browser's. A chosen zone is never
 * overwritten; the flag stops a deliberate UTC being undone twice.
 */
const TIMEZONE_DEFAULTED_KEY = 'dana.timezone.defaulted'

function useDefaultTimezone(stored: string | undefined): void {
  useEffect(() => {
    if (stored !== 'UTC') return
    const zone = browserTimezone()
    if (zone === 'UTC') return
    try {
      if (window.localStorage.getItem(TIMEZONE_DEFAULTED_KEY) === '1') return
      window.localStorage.setItem(TIMEZONE_DEFAULTED_KEY, '1')
    } catch {
      return
    }
    setViewerTimezone(zone)
  }, [stored])
}

/*
 * WCAG 2.4.2: the document title follows the element marked `data-page-title`, not the first h1 (canvas
 * headings are h1s too). Watched, so a rename or slow read updates it.
 */
function usePageTitle(region: HTMLElement | null): void {
  useEffect(() => {
    if (region === null) return undefined
    const name = (): void => {
      const marked = shownTitle(region)
      const heading = (marked?.getAttribute('data-page-title') || marked?.textContent || '').trim()
      const next = heading ? `${heading} – Dana` : 'Dana'
      if (document.title !== next) document.title = next
    }
    name()
    const watch = new MutationObserver(name)
    watch.observe(region, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-page-title'] })
    return () => {
      watch.disconnect()
      document.title = 'Dana'
    }
  }, [region])
}

/* A thread view keeps the folder head mounted but hidden; a hidden element names nothing. */
function shownTitle(region: HTMLElement): HTMLElement | null {
  for (const marked of region.querySelectorAll<HTMLElement>('[data-page-title]')) {
    if (marked.getClientRects().length > 0) return marked
  }
  return null
}

/*
 * Make the target focusable only for the trip: a focusable region took clicks on blank space and broke Esc
 * handlers that check for focus on `document.body`.
 */
function skipTo(region: HTMLElement | null): void {
  const title = region === null ? null : shownTitle(region)
  const target = title instanceof HTMLHeadingElement ? title : region
  if (target === null || target === undefined) return
  target.setAttribute('tabindex', '-1')
  target.addEventListener('blur', () => { target.removeAttribute('tabindex') }, { once: true })
  target.focus()
}

export function AppShell(): React.JSX.Element {
  const location = useLocation()
  const [content, setContent] = useState<HTMLDivElement | null>(null)
  usePageTitle(content)
  const me = useMe()
  useDefaultTimezone(me.data?.user.timezone)
  /* The bundle, not the old settings: with no pins written the server derives them from the page flags. */
  const bundle = useBundle()
  const folders = useFolders()
  const shelves = useShelves()
  const invites = usePendingInvites()
  const update = useUpdateAffordance()
  /* What an open right-edge panel reserves; usually zero. */
  const panelEdge = useRightEdge()
  /* The Discussion sidebar takes room beside the work where the window has it, and overlays the page where not. */
  const dockOpen = useChatDock() !== null
  const dockWidth = useDockWidth()
  const windowWidth = useWindowWidth()
  const roomy = windowWidth - dockWidth >= DOCK_PAGE_MIN + DOCK_SIDEBAR_ROOM
  const rightEdge = panelEdge + (dockOpen && roomy ? dockWidth : 0)
  /* Use the 4.19 defaults while the bundle loads, so the first paint is styled. */
  useAppearance(
    /*
     * The mirror stands in while the bundle loads: applying the default would repaint the frame the inline
     * script already painted.
     */
    bundle.data?.theme ?? mirroredTheme(),
    bundle.data?.row_density ?? 'comfortable',
    bundle.data !== undefined,
  )
  /* The clock is written into `lib/time-format.ts`'s store, which every surface that draws a time reads. */
  const clockPreference = bundle.data?.clock
  useEffect(() => {
    if (clockPreference !== undefined) adoptClock(clockPreference)
  }, [clockPreference])
  const groups = useFolderGroupActions(folders.data ?? NO_FOLDERS, shelves.data ?? NO_SHELVES)

  // Read once at the first render so the sidebar paints at the saved width without jumping.
  const [railOpen, setRailOpen] = useState(() => !readSidebarCollapsed())
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(readSidebarWidth)

  /*
   * Held here as well as in the bundle so a drop shows the new order on release, not after a refetch. Seeded
   * once from the bundle. Null means not seeded yet; an empty array is a real value.
   */
  const patchBundle = usePatchBundle()
  const [sidebarOrder, setSidebarOrder] = useState<readonly string[] | null>(null)
  const storedOrder = bundle.data?.sidebar_order
  useEffect(() => {
    if (storedOrder !== undefined) setSidebarOrder((held) => held ?? storedOrder)
  }, [storedOrder])
  /* The Focus lists, held the same way. */
  const [focusLists, setFocusLists] = useState<readonly FocusListKey[] | null>(null)
  const storedFocus = bundle.data?.focus_lists
  useEffect(() => {
    if (storedFocus !== undefined) setFocusLists((held) => held ?? storedFocus)
  }, [storedFocus])

  /*
   * Only a 401 from /me sends the person to `/`: offline or slow keeps the shell, which must work with no
   * network. A full document load, so no cached data survives.
   */
  const signedOut = me.error instanceof ApiError && me.error.status === 401
  useEffect(() => {
    if (signedOut) window.location.replace(paths.landing)
  }, [signedOut])

  /* The one write path out of a card; see the provider below. */
  const taskPatch = useApiTaskPatch()
  const pathFolderId = location.pathname.startsWith(FOLDER_PREFIX)
    ? location.pathname.slice(FOLDER_PREFIX.length)
    : null
  /* A tab is not a Library row: its project's row is the one lit. */
  const allPages = useAllPages(pathFolderId !== null)
  const onTab = allPages.data?.find((page) => page.id === pathFolderId)
  const activeFolderId =
    onTab !== undefined && onTab.tab_position !== null ? onTab.project_id : pathFolderId

  // While that load is in flight, mount no pages: their reads would each earn the same 401.
  if (signedOut) {
    return <></>
  }

  return (
    /*
     * Dialog, sidebar and inline row are views of one task, so every card writes through this one provider. A
     * card that finds none keeps its edits and sends none. The surface host provides its own for drafts.
     */
    <DirectMessageCenter><TaskWriter patch={taskPatch}>
    <>
      {/* Search overlay first in the document (see header). `z-50` on a positioned wrapper keeps the overlays above
         the fixed sidebar, whose stale classes leave them unpositioned. */}
      <div className="relative z-50">
        <SearchOverlay />
        <ShortcutsSheet />
        <HeardAboutDialog />
      </div>
      <div
        className="flex h-svh flex-col overflow-hidden bg-background"
      >
        {/* The first Tab on every page: past the sidebar to the page itself. */}
        <a
          href="#dana-content"
          onClick={(event) => {
            event.preventDefault()
            skipTo(content)
          }}
          className="fixed top-2 left-2 z-50 rounded-md bg-background px-2 py-1 text-sm text-foreground not-focus:sr-only"
        >
          Skip to content
        </a>
        <SidebarProvider
          className="h-svh min-h-0"
          open={railOpen}
          onOpenChange={(open) => {
            setRailOpen(open)
            writeSidebarCollapsed(!open)
          }}
          style={
            {
              // The default width lives in `tokens.css`; this applies only after the viewer drags.
              '--sidebar-width':
                sidebarWidth === null ? 'var(--shell-sidebar-width)' : `${sidebarWidth}px`,
            } as CSSProperties
          }
        >
          <AppSidebar
            folders={folders.data}
            shelves={shelves.data}
            sidebarOrder={sidebarOrder ?? []}
            onSidebarOrderChange={(ids) => {
              setSidebarOrder(ids)
              patchBundle.mutate({ sidebar_order: [...ids] })
            }}
            focusLists={focusLists ?? (bundle.isSuccess ? [] : DEFAULT_FOCUS_LISTS)}
            onFocusListsChange={(next) => {
              setFocusLists(next)
              patchBundle.mutate({ focus_lists: [...next] })
            }}
            groups={groups.actions}
            activeFolderId={activeFolderId}
            currentPath={location.pathname}
            currentSearch={location.search}
            sidebarWidth={sidebarWidth}
            onSidebarWidthChange={(width) => setSidebarWidth(clampSidebarWidth(width))}
            onSidebarWidthCommit={(width) => {
              const clamped = clampSidebarWidth(width)
              setSidebarWidth(clamped)
              writeSidebarWidth(clamped)
            }}
            onSidebarWidthReset={() => {
              setSidebarWidth(null)
              clearSidebarWidth()
            }}
            onOpenSearch={openSearch}
          />
          {/* `SidebarInset` is the `main` landmark. The right-edge reservation starts below the tab strip,
             so expose it as a variable for the page bar and scroll region. */}
          <SidebarInset
            className="relative min-w-0 overflow-hidden bg-background"
            style={{ '--collaboration-right-edge': `${String(rightEdge)}px` } as CSSProperties}
          >
            {/* `components/window-bar.tsx`: pages and the task surface portal their controls into its ends. */}
            <TopBar onOpenSearch={openSearch} />
            <TopTrail />
            <UpdateChrome showUpdate={update.showUpdate} onUpdate={update.applyUpdate} />
            {/* The one region that scrolls. */}
            <div
              ref={setContent}
              id="dana-content"
              data-shell-scroll
              style={{ marginRight: 'var(--collaboration-right-edge, 0px)' }}
              className="min-h-0 flex-1 overflow-y-auto transition-[margin] duration-150 ease-out"
            >
              {/* The width a cover bleeds to (`100cqw`): the scroll region's width includes its scrollbar. */}
              <div className="@container">
              {/* An open thread reads across the full width, as a chat does. */}
              <div className="mx-auto w-full max-w-[var(--shell-content-max)] px-4 py-4 md:px-10 md:py-6">
                {/* Pending invites sit above every /app page; loading, failure and empty all draw nothing. */}
                {(invites.data?.length ?? 0) > 0 ? (
                  <InviteGate invites={invites.data ?? []} />
                ) : null}
                <Outlet />
              </div>
              </div>
            </div>
          </SidebarInset>
          {groups.dialogs}
        </SidebarProvider>
      </div>
      {/* Mounted once, so it survives navigation, and outside the inert wrapper. */}
      <ChatDock />
      {/* The one notice column: toasts, the offline notice and the undo bar. */}
      <ToastRegion clearsCapture={false}>
        <OfflineBanner />
        <UndoBar />
      </ToastRegion>
      {/* The task form, mounted last (see header) inside the same stacking wrapper as search. */}
      <FolderLibraryMemory />
      <div className="relative z-50">
        <TaskSurfaceHost />
      </div>
    </>
    </TaskWriter></DirectMessageCenter>
  )
}
