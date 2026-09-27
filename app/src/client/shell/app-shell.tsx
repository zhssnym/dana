/*
The global chrome of 9.1, on our router, our reads and our overlays, and the
only place any of it exists.

Everything here is global because section 9 says it is: the sidebar ("the
application's only chrome"), the offline banner ("global, persistent while
offline"), the toast region, and 10.6's update
affordance. A page renders inside the outlet and adds none of them.

**The top bar is a `div` inside `main`, never a `header`** (AC-174: no banner
landmark). It holds the trail and the page's controls; on a phone the same bar
also holds Menu and Search. Back/Forward now live with the workspace tabs.

**There is no viewport floor on the root element.** A minimum viewport width is
forbidden anywhere in the client, and it is checked by grepping the built
stylesheet rather than the source, because Tailwind's source detection scans
prose too and a document that spelled the utility would emit it; so this comment
describes it and does not write it.

**The chrome reads are made here rather than in the pages.** `/me`, `/folders`
and 4.19's bundle at `/settings` back the sidebar and the account menu on every
page, so a page that fetched them would fetch them again on the next page for
the same answer. `main.tsx` starts `/me` and `/folders` before this component
mounts; the bundle is read at the `useBundle` call below, whose own comment says
why it is the bundle rather than 7.2's settings.
The shell renders before any of them answers, and it has to: 10.6's navigation
fallback opens every /app path from the cached shell with no network at all, and
AC-091 and AC-160 read the sidebar's page links there.

**Document order carries two contracts.** The search overlay is first, ahead of
the sidebar, because the suite addresses its field as the document's first
textbox and other surfaces carry text inputs of their own; being fixed-position,
its place in the tree costs nothing. The task form is last, because it opens
over whatever page is beneath it and a control inside it has to be the
document's last of its name.

**The two view preferences of 9.1 are `preferences.ts` and localStorage.** That
file carries the argument. What is here is the one consequence a reader of this
file needs: the vendored `SidebarProvider` writes the collapsed state into a
cookie for a server-rendered host we do not have, and this component clears it,
because a second readable cookie in this browser is a second answer to a
question 11.6's double-submit expects one answer to.
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
  useMe,
  usePendingInvites,
  useShelves,
  useTask,
  useDiscussion,
} from '../api/queries.js'
import { SearchOverlay } from '../components/search-overlay.js'
import { ShortcutsSheet } from '../components/help-sheet.js'
import { TaskSurfaceHost } from '../components/task-surface-host.js'
/* The folder table published for the lifted pickers' bare `folderLibrary()`,
   mounted once here because this component is what every /app path renders. */
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
import { useModalOpen, useRightEdge } from '../components/right-edge.js'
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

/** The prefix 9.1's routes table gives a folder page. */
const FOLDER_PREFIX = '/app/folders/'

/**
 * The folder list before it has arrived, held once so its identity is stable.
 *
 * `folders.data ?? []` would be a new array on every render, and the folder
 * group dialogs below memoise on it: a fresh array each render would clear a
 * half-typed group name the next time any chrome query settled.
 */
const NO_FOLDERS: readonly Folder[] = []

/** And for the shelves the Library reads. */
const NO_SHELVES: readonly Shelf[] = []


/** 10.6's update copy, transcribed. AC-100 addresses it by this name. */
const UPDATE_AVAILABLE = 'Update available, reload'

/*
The one top bar. On a laptop: the show-sidebar control when the sidebar is
hidden, then the window bar (trail and page controls). Below 768px the
same window bar sits between Menu and Search, so a phone has one bar.
*/
function TopBar({ onOpenSearch }: { readonly onOpenSearch: () => void }): React.JSX.Element {
  const { isMobile, setOpenMobile } = useSidebar()
  if (!isMobile) {
    return (
      <div className="shrink-0">
        <WindowBar />
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

/*
The window bar's left end: where this route sits. A page is its trail; a task
is its page's trail and its title; a collection and the fixed places are their
names. Nothing is drawn for a route with no name of its own (a redirect on its
way somewhere). Back/Forward are grouped with the workspace tabs above.
*/
function TopTrail(): React.JSX.Element {
  const { pathname, search } = useLocation()
  /* r4 discuss: an open thread is `?discussion=<id>` on its page; the trail
     names it, and the page's crumb leads back to the thread list. */
  const discussionId = pathname.startsWith(FOLDER_PREFIX) ? new URLSearchParams(search).get('discussion') : null
  const discussion = useDiscussion(discussionId ?? '', discussionId !== null)
  /* A task is its own route (`?issue=` on a page redirects there, M4). */
  const taskId = pathname.startsWith(TASK_PREFIX) ? pathname.slice(TASK_PREFIX.length) : null
  const task = useTask(taskId)

  /* A tab's own crumb repeats the tab row, so a tab draws its project's
     trail; an open thread still names the tab it lives in. */
  const pageId = pathname.startsWith(FOLDER_PREFIX) ? pathname.slice(FOLDER_PREFIX.length) : null
  const allPages = useAllPages(pageId !== null)
  const tab = allPages.data?.find((page) => page.id === pageId)
  const trailId =
    tab !== undefined && tab.tab_position !== null && discussionId === null ? tab.project_id : pageId

  let trail: React.JSX.Element | null = null
  if (pageId !== null && trailId !== null) {
    const list = new URLSearchParams(search)
    list.delete('discussion')
    list.delete('outcome')
    const listTo = list.size === 0 ? pathname : `${pathname}?${list.toString()}`
    trail = (
      <BreadcrumbTrail
        folderId={trailId}
        {...(discussionId !== null ? { current: discussion.data?.title ?? '', folderTo: listTo } : {})}
      />
    )
  } else if (taskId !== null) {
    trail = task.data === undefined ? null : (
      <BreadcrumbTrail folderId={task.data.folder.id} current={task.data.title} />
    )
  }
  /* A top-level place (Today, Settings, Trash, a collection) has no crumb:
     its title already says where you are, and saying it twice is noise. */
  /* With the sidebar hidden on a laptop, the control that brings it back sits
     exactly where the footer's collapse was, so the toggle never moves. */
  const { isMobile, state } = useSidebar()
  return (
    <>
      <WindowBarLead>{trail}</WindowBarLead>
      {isMobile || state === 'expanded' ? null : (
        <Tooltip>
          <TooltipTrigger
            render={
              <SidebarTrigger className={`${FOOT_BUTTON} fixed bottom-2 left-[calc(var(--sidebar-width)_-_var(--spacing)*2_-_var(--control-height)_-_1px)] z-10`} />
            }
          />
          <TooltipContent side="top">Expand sidebar</TooltipContent>
        </Tooltip>
      )}
    </>
  )
}

/* 10.6's non-forcing update: the waiting worker is applied on a click and
   never without one. */
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

/* Once per device: an account still on the column's default zone (UTC) takes
   the browser's, so Settings and reminders start from where the person is.
   A zone the person chose is never overwritten: only UTC is the default, and
   the flag keeps a deliberate UTC from being undone twice. */
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
WCAG 2.4.2: a tab (and a screen reader arriving on a page) is named after the
page's own name, the element marked `data-page-title` (the head's `h1`, or the
rename field while it is open, which carries the name as the attribute's
value). Canvas headings are `h1`s too, so "the first h1" is not the page's
name. Watched rather than set per page, so a rename or a slow read renames the
tab too.
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

/* The page's name as drawn: a thread view keeps the folder head mounted but
   hidden, and a hidden element takes no focus and names nothing on screen. */
function shownTitle(region: HTMLElement): HTMLElement | null {
  for (const marked of region.querySelectorAll<HTMLElement>('[data-page-title]')) {
    if (marked.getClientRects().length > 0) return marked
  }
  return null
}

/*
The skip link moves focus to the page's name (or the scroll region on a page
without one), made focusable only for that trip: a region left focusable took
every click on blank space, and the Esc handlers that read "focus on nothing"
as `document.body` (a Discussion thread's, the canvas's) stopped firing.
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
  /*
  The bundle of 4.19 rather than 7.2's settings.

  The three page flags still exist and still decide the same entries: with no
  pins written, the server derives the pin list from them, so an account's
  show_done arrives as Done pinned. The sidebar reads one record of that fact
  instead of two.
  */
  const bundle = useBundle()
  const folders = useFolders()
  /* The shelves read (7.16): the Library draws them on every page. */
  const shelves = useShelves()
  const invites = usePendingInvites()
  const update = useUpdateAffordance()
  /* What an open right-edge panel has reserved. Zero when nothing is open,
     which is almost always. */
  const rightEdge = useRightEdge()
  /* Whether a modal task surface is open over the page. See the wrapper below. */
  const modalOpen = useModalOpen()
  /*
  9.7's Appearance, applied to the document. 4.19's own defaults stand in while
  the bundle read is in flight, so the first paint is the light comfortable one
  a fresh account has rather than an unstyled one that corrects itself a moment
  later.
  */
  useAppearance(
    /* The mirror stands in while the bundle is in flight: applying 4.19's
       default here would repaint the frame the inline script had already
       painted, which is the flash in the other direction. */
    bundle.data?.theme ?? mirroredTheme(),
    bundle.data?.row_density ?? 'comfortable',
    bundle.data !== undefined,
  )
  /*
  And the clock, which is read at its call sites rather than off the document:
  `lib/time-format.ts` is the one place a time becomes words, so the account's
  value is written into that store when the bundle settles and every surface
  that draws a time follows without being threaded anything.
  */
  const clockPreference = bundle.data?.clock
  useEffect(() => {
    if (clockPreference !== undefined) adoptClock(clockPreference)
  }, [clockPreference])
  const groups = useFolderGroupActions(folders.data ?? NO_FOLDERS, shelves.data ?? NO_SHELVES)

  // 9.1's two view preferences, read once at the first render so the sidebar
  // paints at the width the viewer left it at rather than jumping to it.
  const [railOpen, setRailOpen] = useState(() => !readSidebarCollapsed())
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(readSidebarWidth)

  /*
  The viewer's arrangement of the Library.

  Held here as well as in the bundle, and the reason is what a drag is: the
  column has to be in its new order on the frame the row is released, and a
  write that had to land and be refetched first would show the row springing
  back to where it came from and then moving. So this state is the sidebar's
  answer and the write is the record of it. Seeded from the bundle the first
  time that read settles and never again, a later refetch being this session's
  own writes coming back.

  Null until the bundle arrives, which is what tells the seeding effect it has
  not run yet: an empty array is a real value here, meaning a viewer who has
  dragged nothing, which is the ordinary case rather than an absence.
  */
  const patchBundle = usePatchBundle()
  const [sidebarOrder, setSidebarOrder] = useState<readonly string[] | null>(null)
  const storedOrder = bundle.data?.sidebar_order
  useEffect(() => {
    if (storedOrder !== undefined) setSidebarOrder((held) => held ?? storedOrder)
  }, [storedOrder])
  /* The Focus lists (round 8), held the same way: the sidebar's answer now,
     the write its record. */
  const [focusLists, setFocusLists] = useState<readonly FocusListKey[] | null>(null)
  const storedFocus = bundle.data?.focus_lists
  useEffect(() => {
    if (storedFocus !== undefined) setFocusLists((held) => held ?? storedFocus)
  }, [storedFocus])

  /*
  The one line that fights the distribution, and the reason is in
  `preferences.ts`. shadcn's `SidebarProvider` mirrors the collapsed state
  into a `sidebar_state` cookie because it is built for a host that reads it
  before painting; nothing on our server reads it, it would ride every
  request to the section 7 API, and 11.6 leaves exactly one readable cookie in
  this browser. The write happens inside the primitive's own state setter, so
  it is undone here after the commit rather than prevented.
  */
  useEffect(() => {
    document.cookie = 'sidebar_state=; path=/; max-age=0'
  }, [railOpen])

  /*
  An unauthenticated read at any /app route sends the person to / rather than
  rendering the shell over a wall of refusals. The branch is the refusal alone,
  an ApiError carrying 10.1's 401: a /me that is slow, offline, or failed any
  other way keeps the shell, because 10.6 opens every /app path from the cached
  worker with no network at all, and a redirect firing on anything but a refusal
  would bounce every real session on a bad connection. A full document load
  rather than a client navigation, for signOut's reason below: whatever the
  caches hold belongs to nobody the browser can still name.
  */
  const signedOut = me.error instanceof ApiError && me.error.status === 401
  useEffect(() => {
    if (signedOut) window.location.replace(paths.landing)
  }, [signedOut])

  /* The one write path out of a card. See the provider at this component's
     root. */
  const taskPatch = useApiTaskPatch()
  const pathFolderId = location.pathname.startsWith(FOLDER_PREFIX)
    ? location.pathname.slice(FOLDER_PREFIX.length)
    : null
  /* A tab is no Library row (step 7): its project's row is the one lit. */
  const allPages = useAllPages(pathFolderId !== null)
  const onTab = allPages.data?.find((page) => page.id === pathFolderId)
  const activeFolderId =
    onTab !== undefined && onTab.tab_position !== null ? onTab.project_id : pathFolderId


  // F-8's other half: while the document load above is in flight, the shell
  // must not mount its pages, whose reads would each earn the same 401.
  if (signedOut) {
    return <></>
  }

  return (
    /*
    **The one write path out of a card, provided once.**

    `tasks/task-writer.tsx` is that path: dialog, sidebar and inline row are
    views of the same task, so the data inside them must be the same and updated
    together. Every card reaches for it through `useTaskWriter`, and a card that
    finds nothing there keeps its edits and sends none.

    Here rather than in a page, because 9.3's inline card is drawn wherever a
    row is and this component is what every /app path renders: it is not a value
    read in fifty places, it is one function owned by the one component that
    already wraps every screen.

    The surface host provides its own inside this one, and deliberately: a
    capture's edits ride a draft until the task exists, which is a different
    function for the window in which there is nothing to write to.
    */
    <TaskWriter patch={taskPatch}>
    <>
      {/*
      9.9's overlay, ahead of everything for the reason in this file's header.
      The shell decides where it is mounted and what it is mounted above.

      **The stacking wrapper is interim scaffolding.** Both overlays draw
      themselves with `dialog-scrim` and `dialog-panel`, two class names that no
      longer exist, so neither is positioned. This sidebar is `fixed`, so it
      paints over anything unpositioned beneath it and takes the pointer events
      with it: the task form's "More options" expander would sit under the
      account menu and could not be clicked. `z-50` on a positioned wrapper
      restores the paint order, changes nothing else about either overlay, and
      comes out the day each arrives as a base-ui portal of its own.
       */}
      <div className="relative z-50">
        <SearchOverlay />
        <ShortcutsSheet />
      </div>
      {/*
      **A modal task surface takes the page out of the document.**

      9.1's roles table makes that surface "a dialog when opened as one", and
      `components/right-edge.tsx`'s `HoldsTheDocument` carries the whole of the
      reasoning. What lands here is the other half: `aria-hidden` takes this
      subtree out of the accessible tree, which is what modal means, and `inert`
      takes it out of the pointer and the tab order, which is what stops a click
      reaching a control nobody can see.
       */}
      <div
        {...(modalOpen ? { "aria-hidden": true, inert: true } : {})}
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
              // The design's width lives in `tokens.css` and is displaced only
              // once this viewer has dragged one of their own.
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
          {/*
          `SidebarInset` is the `main` landmark. A right-edge panel publishes its
          width to `components/right-edge.tsx` and this takes it off as a margin,
          so the page narrows rather than being covered.
           */}
          <SidebarInset
            className="relative min-w-0 overflow-hidden bg-background transition-[margin] duration-150 ease-out"
            style={{ marginRight: `${String(rightEdge)}px` }}
          >
            {/* `components/window-bar.tsx`: pages and the task surface portal
                their controls into its two ends. */}
            <TopBar onOpenSearch={openSearch} />
            <TopTrail />
            <UpdateChrome showUpdate={update.showUpdate} onUpdate={update.applyUpdate} />
            {/* The one region that scrolls. */}
            <div
              ref={setContent}
              id="dana-content"
              data-shell-scroll
              className="min-h-0 flex-1 overflow-y-auto"
            >
              <div className="mx-auto w-full max-w-[var(--shell-content-max)] px-4 py-4 md:px-10 md:py-6">
                {/* 9.8: pending invites sit above every /app page; a read in
                    flight, a failed read and an empty answer all draw nothing. */}
                {(invites.data?.length ?? 0) > 0 ? (
                  <InviteGate invites={invites.data ?? []} />
                ) : null}
                <Outlet />
              </div>
            </div>
          </SidebarInset>
          {groups.dialogs}
        </SidebarProvider>
      </div>
      {/* The one notice column: toasts, the offline notice and the undo bar,
          bottom-centre. */}
      <ToastRegion clearsCapture={false}>
        <OfflineBanner />
        <UndoBar />
      </ToastRegion>
      {/* 9.3's form, mounted once and last, for the reason in this file's
          header, and inside the same interim stacking wrapper the search
          overlay carries above. The Complex Interaction engineer owns both. */}
      <FolderLibraryMemory />
      <div className="relative z-50">
        <TaskSurfaceHost />
      </div>
    </>
    </TaskWriter>
  )
}
