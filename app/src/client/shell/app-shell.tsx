/*
The designer's `src/components/app-shell.tsx`, ported at P8R session R5 onto
our router, our reads and our overlays. It is the global chrome of 9.1 and the
only place any of it exists.

Everything here is global because section 9 says it is: the sidebar ("the
application's only chrome"), the offline banner ("global, persistent while
offline"), the toast region, the floating add button ("on every page except
Done"), and 10.6's update affordance. A page renders inside the outlet and
adds none of them.

**There is no top bar, and that is the owner's ruling of 2026-08-13
transcribed into 9.1 rather than a port taking a liberty.** Until that date
this section opened with a bar carrying the app name, the global search
control and the avatar menu; the designer's prototype has no bar at all and
puts the first two in the sidebar header and the third in its footer. The
ruling was on the merits, 9.1 changed, and `shell/TopBar.tsx` is retired with
it. AC-174 asserts the removal as the absence of a banner landmark on every
page, which is what an application header is; `page-bar.tsx`'s `header` sits
inside `main` and is a page's own rather than the application's, so it is
content and not chrome. That placement is a requirement of this file and
`components/README.md` filed it as a request against this session.

**The floor his root carries is absent, and this is the third instance of
it.** Section 13 item 32 forbids a viewport floor; two lived in his
stylesheets and were stripped at R2, and the third was this component's root
element. It is not here. Item 32 is decided by grepping the built stylesheet
rather than the source, because Tailwind's source detection scans prose too
and a document that spelled the utility would emit it; so this comment
describes it and does not write it.

**The three chrome reads are made here rather than in the pages.** `/me`,
`/me/settings` and `/folders` back the sidebar and the account menu on every
page, so a page that fetched them would fetch them again on the next page for
the same answer. `main.tsx` starts all three before this component mounts.
The shell renders before any of them answers, and it has to: 10.6's
navigation fallback opens every /app path from the cached shell with no
network at all, and AC-091 and AC-160 read the sidebar's page links there.

**Document order carries two contracts.** The search overlay is first, ahead
of the sidebar, because the suite addresses its field as the document's first
textbox and other surfaces carry text inputs of their own; being
fixed-position, its place in the tree costs nothing. The task form is last,
because it opens over whatever page is beneath it and a control inside it has
to be the document's last of its name.

**The two view preferences of 9.1 are `preferences.ts` and localStorage.**
That file carries the argument. What is here is the one consequence a reader
of this file needs: the vendored `SidebarProvider` writes the collapsed state
into a cookie for a server-rendered host we do not have, and this component
clears it, because a second readable cookie in this browser is a second
answer to a question 11.6's double-submit expects one answer to.
*/
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
/* The icon module of DES-125, since S8: every icon Dana uses is an export
   of one file and nothing imports `lucide-react` directly. */
import type { LucideIcon } from '../lib/icons.js'
import {
  Ban,
  CalendarDays,
  CalendarX,
  CheckCircle2,
  Folder as FolderIcon,
  LampDesk,
  Layers3,
  Settings,
  Star,
  SunMedium,
  Trash2,
  UserRoundCheck,
  UsersRound,
} from '../lib/icons.js'

import { mutateApi } from '../api/http.js'
import { useCreateFolder, usePatchBundle } from '../api/mutations.js'
import {
  useBundle,
  useFolders,
  useMe,
  usePendingInvites,
  useSavedViews,
  useShelves,
} from '../api/queries.js'
import { todayInBrowserZone } from '../api/tz.js'
import { NewFolderDialog } from '../components/index.js'
import { SearchOverlay } from '../components/search/index.js'
import { TaskFormOverlay } from '../components/task-form/index.js'
import { SidebarInset, SidebarProvider } from '../components/ui/sidebar.js'
import { InviteGate } from '../pages/InviteGate.js'
import { DEFAULT_FOLDER_COLOR } from '../parts/presenters.js'
import { useUpdateAffordance } from '../pwa/useUpdateAffordance.js'
import { navPages, paths } from '../routes.js'
import { placeAt, surfaceDefaults } from '../views/place-pages.js'
import { effectiveMode, useViewMode } from '../views/view-mode.js'
import type { ViewMode } from '../views/view-mode.js'
import { ToastRegion } from '../state/ToastRegion.js'
import { AppSidebar } from './app-sidebar.js'
import { FloatingAddButton } from './FloatingAddButton.js'
import { useFolderGroupActions } from './folder-groups.js'
import { OfflineBanner } from './OfflineBanner.js'
import { undoLast, undoShortcutApplies } from './undo.js'
import { UndoBar } from './UndoBar.js'
import { openSearch } from './overlays.js'
import { TabStrip } from './TabStrip.js'
import { WindowBar } from './WindowBar.js'
import { retarget, useTabs } from './tabs.js'
import {
  clampSidebarWidth,
  clearSidebarWidth,
  readSidebarCollapsed,
  readSidebarWidth,
  writeSidebarCollapsed,
  writeSidebarWidth,
} from './preferences.js'
import type { TaskFormDefaults } from './overlays.js'
import type { Folder } from '../../shared/folders.js'
import type { Shelf } from '../../shared/shelves.js'
import type { SavedView } from '../../shared/bundle.js'

/** The prefix 9.1's routes table gives a folder page. */
const FOLDER_PREFIX = '/app/folders/'
const SHELF_PREFIX = '/app/shelves/'
const TASK_PREFIX = '/app/tasks/'

/**
 * The folder list before it has arrived, held once so its identity is stable.
 *
 * `folders.data ?? []` would be a new array on every render, and the folder
 * group dialogs below memoise on it: a fresh array each render would clear a
 * half-typed group name the next time any chrome query settled.
 */
const NO_FOLDERS: readonly Folder[] = []

/** The same stable-identity trick for the saved views the page block ends on. */
const NO_SAVED_VIEWS: readonly SavedView[] = []

/** Every view there is, so the shell reads the store rather than a page. */
const ALL_VIEWS: readonly ViewMode[] = ['list', 'board', 'calendar']

/**
 * Where the floating button appears, and what it makes there.
 *
 * **The rule inverted at RFC 0005 and this is the inversion.** v1 put the
 * button on every page except Done. 9.1 now puts it only on "the pages with
 * no capture affordance of their own, Today, Important, and Assignments",
 * and never on Done or Abandoned. Every other page has a quick-add row where
 * its own list begins, so a second control floating over it is two ways to do
 * one thing, forty pixels apart.
 *
 * **And it is absent in board view, which S10 added and DES-182 argued.** "In
 * board view every column captures and the floating button is absent": the
 * button is the capture point that leaves wherever a capture row already
 * exists, and a column says where the task lands better than any row. The
 * mode is read from the same store the strip writes, so the shell and the
 * page cannot disagree about which view is showing.
 *
 * **Trash is not in the list and 9.11 is why**: "No capture anywhere on the
 * page." A deleted-things page that offers to make a new thing is offering
 * an act its own subject cannot receive.
 *
 * The defaults are 9.3's entry table, and they are `place-pages.ts`'s rather
 * than this file's, because DES-182's fault was three surfaces each deciding
 * them: the button, the quick-add and the board column now read one table.
 */
function floatingDefaults(pathname: string, mode: ViewMode): TaskFormDefaults | null {
  const spine = placeAt(pathname)
  if (spine === null || spine.capture !== 'floating') return null
  if (effectiveMode(mode, spine.views) === 'board') return null
  const defaults = surfaceDefaults(spine.key, todayInBrowserZone())
  return { due_date: defaults.due_date, important: defaults.important }
}

/* `isTyping` left with the search shortcut it guarded (see `overlays.ts`);
   the undo shortcut below has its own guard in `undo.ts`. */

/** The glyph the page strip shows, which is the designer's and not 9.1's. */
const pageIcons: Record<string, LucideIcon> = {
  [paths.desk]: LampDesk,
  [paths.today]: SunMedium,
  [paths.scheduled]: CalendarDays,
  [paths.assignments]: UserRoundCheck,
  [paths.abandoned]: Ban,
  [paths.anytime]: CalendarX,
  [paths.trash]: Trash2,
  [paths.important]: Star,
  [paths.all]: Layers3,
  [paths.done]: CheckCircle2,
  [paths.settings]: Settings,
  [paths.people]: UsersRound,
}

/**
 * What the designer's page strip carries for the route that is open.
 *
 * The strip is his static current-page indicator and his `notes.md` is
 * explicit that it is not a tab system: nothing in it is clickable and
 * nothing navigates. A folder's name and colour come from the same `/folders`
 * read the sidebar uses, so an unopened folder or a failed read simply shows
 * nothing rather than a flickering identifier.
 */
function currentPage(
  pathname: string,
  folders: readonly Folder[] | undefined,
  shelves: readonly Shelf[] | undefined,
): { title: string; icon: LucideIcon | undefined; iconColor: string | undefined } {
  const page = navPages.find((candidate) => pathname === candidate.path)
  if (page !== undefined) {
    return { title: page.name, icon: pageIcons[page.path], iconColor: undefined }
  }
  if (pathname === paths.settings) {
    return { title: 'Settings', icon: pageIcons[paths.settings], iconColor: undefined }
  }
  if (pathname === paths.people) {
    return { title: 'People', icon: pageIcons[paths.people], iconColor: undefined }
  }
  if (pathname.startsWith(FOLDER_PREFIX)) {
    const id = pathname.slice(FOLDER_PREFIX.length)
    const folder = folders?.find((candidate) => candidate.id === id)
    return {
      title: folder?.name ?? '',
      icon: FolderIcon,
      iconColor: folder?.my_color ?? DEFAULT_FOLDER_COLOR,
    }
  }
  /* A shelf tab wears the shelf's name (9.1: every tab is the same tab),
     from the shelves read the sidebar's Library will share. */
  if (pathname.startsWith(SHELF_PREFIX)) {
    const id = pathname.slice(SHELF_PREFIX.length)
    const shelf = shelves?.find((candidate) => candidate.id === id)
    return { title: shelf?.name ?? '', icon: FolderIcon, iconColor: undefined }
  }
  /* A task tab: the title would need the task read, which only the page
     holds; "Task" keeps the tab honest without a second fetch path. */
  if (pathname.startsWith(TASK_PREFIX)) {
    return { title: 'Task', icon: undefined, iconColor: undefined }
  }
  return { title: '', icon: undefined, iconColor: undefined }
}

export function AppShell(): React.JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const me = useMe()
  /*
  The bundle of 4.19 rather than frozen 7.2's settings, since S9.

  The three v1 page flags still exist and still decide the same entries: with
  no pins written, the server derives the pin list from them (RFC 0005's
  change control item 6), so a v1 account's show_done arrives as Done pinned
  and nothing about 7.2 moved. What changed is that the sidebar now reads one
  record of that fact instead of two, which is what the fold was for.
  */
  const bundle = useBundle()
  const folders = useFolders()
  // The shelves read (7.16), which a shelf tab's face resolves through.
  const { tabs } = useTabs()
  /* Only a shelf tab needs shelf names, so the read waits until one is open
     rather than costing every page a request at mount. */
  const shelvesWanted =
    location.pathname.startsWith(SHELF_PREFIX) ||
    tabs.some((tab) => tab.path.startsWith(SHELF_PREFIX))
  const shelves = useShelves(shelvesWanted)
  const invites = usePendingInvites()
  /* 9.1 ends the page block with the viewer's pinned saved views, so the
     chrome reads them here beside the pin list rather than in a page. */
  const savedViews = useSavedViews()
  const createFolder = useCreateFolder()
  const update = useUpdateAffordance()
  /* The remembered view, unresolved: every mode is passed as offered so this
     reads the store rather than a page's answer to it, and floatingDefaults
     resolves it against the page it is actually on. */
  const [remembered] = useViewMode(ALL_VIEWS)
  const groups = useFolderGroupActions(folders.data ?? NO_FOLDERS)

  // 9.1's two view preferences, read once at the first render so the sidebar
  // paints at the width the viewer left it at rather than jumping to it.
  const [railOpen, setRailOpen] = useState(() => !readSidebarCollapsed())
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(readSidebarWidth)
  const [newFolderOpen, setNewFolderOpen] = useState(false)

  /*
  The viewer's arrangement of the Library (DES-171, built at S11).

  Held here as well as in the bundle, and the reason is what a drag is: the
  column has to be in its new order on the frame the row is released, and a
  write that had to land and be refetched first would show the row springing
  back to where it came from and then moving. So this state is the sidebar's
  answer and the write is the record of it. Seeded from the bundle the first
  time that read settles and never again, a later refetch being this session's
  own writes coming back.

  Null until the bundle arrives, which is what tells the seeding effect it has
  not run yet: an empty array is a real value here, meaning a viewer who has
  dragged nothing, and DES-171 makes that the ordinary case rather than an
  absence.
  */
  const patchBundle = usePatchBundle()
  const [sidebarOrder, setSidebarOrder] = useState<readonly string[] | null>(null)
  const storedOrder = bundle.data?.sidebar_order
  useEffect(() => {
    if (storedOrder !== undefined) setSidebarOrder((held) => held ?? storedOrder)
  }, [storedOrder])

  /* 9.1's search shortcut moved to `overlays.ts` and is installed from
     `main.tsx` at module scope, so the window listens from the moment the
     bundle runs rather than from whenever this tree finishes mounting; the
     reason and the latch that goes with it are written there. */

  /*
  9.1's undo shortcut, Ctrl+Z or Cmd+Z, and no redo.

  On the document for the same reason the search shortcut is: undo has to
  reach the act from wherever the person ended up, which is usually not the
  bar. It is refused while somebody is typing, and that refusal is the most
  important line in this block: a text input's own undo is older, better
  understood, and scoped to the words in front of them, so stealing Ctrl+Z
  from a half-written task title to un-delete something three screens away
  would be the most alarming thing this feature could do.
  */
  /*
  Ordinary navigation retargets the active tab, as an address bar does
  (9.1). One effect on the router's own location covers every way this
  client can move: a sidebar link, a folder row, a redirect, the back
  button and a programmatic navigate all land here, so no link in the
  application has to know that tabs exist. `retarget` is a no-op when the
  path already matches, which is what stops it looping with the navigations
  the strip itself asks for.
  */
  useEffect(() => {
    retarget(location.pathname)
  }, [location.pathname])

  useEffect(() => {
    function onUndo(event: KeyboardEvent): void {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return
      if (!undoShortcutApplies(event.target)) return
      event.preventDefault()
      undoLast()
    }
    document.addEventListener('keydown', onUndo)
    return () => {
      document.removeEventListener('keydown', onUndo)
    }
  }, [])

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

  const defaults = floatingDefaults(location.pathname, remembered)
  const activeFolderId = location.pathname.startsWith(FOLDER_PREFIX)
    ? location.pathname.slice(FOLDER_PREFIX.length)
    : null

  function signOut(): void {
    void mutateApi(null, { method: 'POST', path: '/auth/logout' }).finally(() => {
      // A full document load rather than a client navigation: the query cache
      // holds the previous person's rows, and 10.1 destroys their session, so
      // nothing in it is theirs to keep.
      window.location.assign(paths.landing)
    })
  }

  /*
  9.8's invite gate, in place of the application at every /app path while Q12
  is non-empty.

  This component is where it goes because this component is what /app renders,
  so "every /app path" and "in place of the application" are one condition and
  one return rather than a rule each page has to remember. AC-172 walks five
  paths, including a folder page and Settings, and asserts on each of them that
  the sidebar is not on the page.

  **The condition is a non-empty answer and never a pending read.** A gate that
  waited for `/invites/pending` before rendering anything would be a client
  that shows nothing until the network answers, and 10.6 opens every /app path
  from the cached shell with no network at all; AC-091 and AC-160 read the
  sidebar's page links there. So a read in flight, a read that failed and an
  empty answer all render the application, which is also the only one of the
  four that a person with no invite can ever observe. The cost is that an
  account holding an invite sees the shell for as long as that read takes, and
  `main.tsx` starts it before this component mounts for exactly that reason.

  The returned tree carries no chrome except the two global states; see
  `pages/InviteGate.tsx` for why those two and not the rest.
  */
  if ((invites.data?.length ?? 0) > 0) {
    return (
      <>
        <OfflineBanner />
        <InviteGate invites={invites.data ?? []} />
        <ToastRegion />
      </>
    )
  }

  return (
    <>
      {/*
      9.9's overlay, ahead of everything for the reason in this file's header.
      It belongs to the Complex Interaction engineer; the shell decides where
      it is mounted, and until R7 and R8 replace both overlays it also has to
      decide what they are mounted above.

      **The stacking wrapper is interim scaffolding and is dated by design.**
      Both P8 overlays draw themselves with `dialog-scrim` and `dialog-panel`,
      two names from the class vocabulary that left with the old token file at
      R2, so neither is positioned any more. That was invisible while the
      chrome was unpositioned too, and it stops being invisible here: this
      sidebar is `fixed`, so it paints over anything unpositioned beneath it
      and takes the pointer events with it. Measured: the task form's "More
      options" expander sat under the account menu and could not be clicked,
      which is AC-092 and AC-093 failing on the chrome rather than on the
      form. `z-50` on a positioned wrapper restores the paint order those
      criteria were passing under, changes nothing else about either overlay,
      and comes out the day each arrives as a base-ui portal of its own.
      */}
      <div className="relative z-50">
        <SearchOverlay />
      </div>
      <div className="flex h-svh flex-col overflow-hidden bg-background">
        <SidebarProvider
          className="h-svh min-h-0"
          open={railOpen}
          onOpenChange={(open) => {
            setRailOpen(open)
            writeSidebarCollapsed(!open)
          }}
          style={
            {
              // The design's own width lives in `tokens.css` (11.4) and is
              // only displaced once this viewer has chosen one of their own,
              // which is data rather than a design value.
              '--sidebar-width':
                sidebarWidth === null ? 'var(--shell-sidebar-width)' : `${sidebarWidth}px`,
              // His rail is the sidebar's item height plus the header's
              // padding on each side. Expressed against the token rather
              // than as a number; a rail-width token of its own is requested
              // of the Component and Design System role.
              '--sidebar-width-icon': 'calc(var(--shell-sidebar-item-height) + 1rem)',
              '--sidebar': 'var(--color-graphite-50)',
              '--sidebar-accent': 'var(--color-graphite-100)',
            } as CSSProperties
          }
        >
          <AppSidebar
            pinnedViews={bundle.data?.pinned_views}
            folders={folders.data}
            sidebarOrder={sidebarOrder ?? []}
            onSidebarOrderChange={(ids) => {
              setSidebarOrder(ids)
              patchBundle.mutate({ sidebar_order: [...ids] })
            }}
            groups={groups.actions}
            displayName={me.data?.user.display_name ?? null}
            activeFolderId={activeFolderId}
            currentPath={location.pathname}
            currentSearch={location.search}
            savedViews={savedViews.data ?? NO_SAVED_VIEWS}
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
            onOpenSettings={() => {
              void navigate(paths.settings)
            }}
            onNewFolder={() => setNewFolderOpen(true)}
            onSignOut={signOut}
          />
          {/* `SidebarInset` is the `main` landmark, which is what keeps the
              page strip below it a page's header rather than the
              application's banner (AC-174). */}
          <SidebarInset className="min-w-0 overflow-hidden bg-card">
            {/*
            The tab strip of 9.1, above the window bar and inside `main`.

            Inside rather than above the inset for AC-174's reason: a
            `header` outside `main` is the banner landmark that criterion
            asserts the absence of, and the strip is chrome belonging to the
            window rather than to the application.
            */}
            <TabStrip
              face={(path) => currentPage(path, folders.data, shelves.data)}
              folders={folders.data ?? NO_FOLDERS}
              onNavigate={(path) => {
                void navigate(path)
              }}
            />
            {/*
            The window bar of 9.1 and DES-139, replacing the v1 page strip.

            The strip it replaces repeated the page's title, which 9.1 now
            forbids in as many words because the tab above says it. The one
            thing on it that was not the title, 10.6's update affordance,
            came across with the bar.
            */}
            <WindowBar
              pathname={location.pathname}
              showUpdate={update.showUpdate}
              onUpdate={update.applyUpdate}
            />
            <OfflineBanner />
            {/* The one region that scrolls. Put the overflow anywhere else
                and either the document scrolls, taking the chrome with it, or
                the chrome scrolls away inside its own column. */}
            <div data-shell-scroll className="min-h-0 flex-1 overflow-y-auto">
              {/* The measure is the layout's and never a page's: thirteen
                  pages each choosing their own width is thirteen chances to
                  disagree. His screens each carry this wrapper because they
                  have no shell to put it in. */}
              <div className="mx-auto w-full max-w-[var(--shell-content-max)] px-10 py-6">
                <Outlet />
              </div>
            </div>
            {defaults === null ? null : <FloatingAddButton defaults={defaults} />}
          </SidebarInset>
          {/* 9.1's "New folder" action, and beside it the three surfaces its
              folder groups open: the create dialog, the rename dialog and the
              delete confirm. They are mounted here rather than inside the rows
              that open them, because a dialog inside a row is unmounted by the
              refetch its own write causes. */}
          <NewFolderDialog
            open={newFolderOpen}
            onOpenChange={setNewFolderOpen}
            onCreate={(name) => {
              createFolder.mutate({ name })
            }}
          />
          {groups.dialogs}
        </SidebarProvider>
      </div>
      {/* 9.1's undo bar: one for the whole window, bottom-left, outside the
          sidebar provider so it is not clipped by the shell's own layout and
          so there is exactly one of it however many pages mount. */}
      <UndoBar />
      <ToastRegion />
      {/* 9.3's form, mounted once and last, for the reason in this file's
          header, and inside the same interim stacking wrapper the search
          overlay carries above. The Complex Interaction engineer owns both. */}
      <div className="relative z-50">
        <TaskFormOverlay />
      </div>
    </>
  )
}
