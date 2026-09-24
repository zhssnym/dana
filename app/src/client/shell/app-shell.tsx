/*
The global chrome of 9.1, on our router, our reads and our overlays, and the
only place any of it exists.

Everything here is global because section 9 says it is: the sidebar ("the
application's only chrome"), the offline banner ("global, persistent while
offline"), the toast region, and 10.6's update
affordance. A page renders inside the outlet and adds none of them.

**There is no top bar.** Search and notifications sit at the top of the
sidebar and the account menu at its foot. AC-174 states this as the
absence of a banner landmark on every page, which is what an application header
is; every `header` this shell renders sits inside `main` and is a page's own
rather than the application's, so it is content and not chrome. That placement
is a requirement of this file.

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
import { Outlet, useLocation, useNavigate } from 'react-router'
import { adoptClock } from '../lib/time-format.js'
import { PanelLeft, RefreshCw, Search } from '../lib/icons.js'

import { ApiError } from '../api/http.js'
import {
  useCreateFolder,
  usePatchBundle,
  useUpdateMyMembership,
} from '../api/mutations.js'
import {
  useBundle,
  useFolders,
  useMe,
  usePendingInvites,
  useShelves,
  useTask,
  useDiscussion,
} from '../api/queries.js'
import { NewFolderDialog } from '../components/index.js'
import { SearchOverlay } from '../components/search/index.js'
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
import { navPages, paths } from '../routes.js'
import { ToastRegion } from '../state/ToastRegion.js'
import { AppSidebar } from './app-sidebar.js'
import { useFolderGroupActions } from './folder-groups.js'
import { OfflineBanner } from './OfflineBanner.js'
import { UndoBar } from '../components/undo-bar.js'
import { useAppearance } from './appearance.js'
import { mirroredTheme } from '../lib/theme.js'
import { onOpenNewFolder, openSearch } from './overlays.js'
import { useModalOpen, useRightEdge } from '../components/right-edge.js'
import { WindowBar, WindowBarActions, WindowBarLead } from '../components/window-bar.js'
import { BreadcrumbTrail, HistoryArrows } from '../components/breadcrumb-trail.js'
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
The phone bar: below 768px the sidebar is a drawer, and this bar holds the one
thing that opens it and the one search entry (the drawer leaves Search out, so
a phone shows it once). A `div` inside `main`, never a `header`, so there is
no banner landmark; it renders nothing on a laptop.
*/
function PhoneBar({ onOpenSearch }: { readonly onOpenSearch: () => void }): React.JSX.Element | null {
  const { isMobile, setOpenMobile } = useSidebar()
  if (!isMobile) return null
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-background px-1">
      <Button
        variant="ghost"
        className="size-10 text-muted-foreground"
        aria-label="Menu"
        onClick={() => {
          setOpenMobile(true)
        }}
      >
        <PanelLeft className="!size-5" strokeWidth={1.75} aria-hidden="true" />
      </Button>
      <span className="min-w-0 flex-1" />
      <Button
        variant="ghost"
        className="size-10 text-muted-foreground"
        aria-label="Search"
        onClick={onOpenSearch}
      >
        <Search className="!size-5" strokeWidth={1.75} aria-hidden="true" />
      </Button>
    </div>
  )
}

/* The one control that brings a hidden sidebar back, on a laptop only. */
function ShowSidebar(): React.JSX.Element | null {
  const { isMobile, state } = useSidebar()
  if (isMobile || state === 'expanded') return null
  return (
    <SidebarTrigger className="ml-2 size-7 shrink-0 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:!size-4" />
  )
}

const TASK_PREFIX = '/app/tasks/'
const SHELF_PREFIX = '/app/shelves/'

/*
The window bar's left end: the history arrows, then where this route sits.
A page is its trail; a task is its page's trail and its title; a collection
and the fixed places are their names. Nothing is drawn for a route with no
name of its own (a redirect on its way somewhere).
*/
function TopTrail(): React.JSX.Element {
  const { pathname, search } = useLocation()
  /* r4 discuss: an open thread is `?discussion=<id>` on its page; the trail
     names it, and the page's crumb leads back to the thread list. */
  const discussionId = pathname.startsWith(FOLDER_PREFIX) ? new URLSearchParams(search).get('discussion') : null
  const discussion = useDiscussion(discussionId ?? '', discussionId !== null)
  const taskId = pathname.startsWith(TASK_PREFIX) ? pathname.slice(TASK_PREFIX.length) : null
  const task = useTask(taskId)
  const shelfId = pathname.startsWith(SHELF_PREFIX) ? pathname.slice(SHELF_PREFIX.length) : null
  const shelves = useShelves(shelfId !== null)

  let trail: React.JSX.Element | null = null
  if (pathname.startsWith(FOLDER_PREFIX)) {
    const list = new URLSearchParams(search)
    list.delete('discussion')
    list.delete('outcome')
    if (!list.has('facet')) list.set('conversation', 'open')
    trail = (
      <BreadcrumbTrail
        folderId={pathname.slice(FOLDER_PREFIX.length)}
        {...(discussionId === null
          ? {}
          : { current: discussion.data?.title ?? '', folderTo: `${pathname}?${list.toString()}` })}
      />
    )
  } else if (taskId !== null) {
    trail = task.data === undefined ? null : (
      <BreadcrumbTrail folderId={task.data.folder.id} current={task.data.title} />
    )
  } else {
    const place =
      shelfId !== null
        ? shelves.data?.find((shelf) => shelf.id === shelfId)?.name
        : pathname.startsWith(paths.settings)
          ? 'Settings'
          : pathname === paths.trash
            ? 'Trash'
            : navPages.find((page) => page.path === pathname)?.name
    trail = place === undefined ? null : <BreadcrumbTrail folderId={null} current={place} />
  }
  return (
    <WindowBarLead>
      <HistoryArrows />
      {trail}
    </WindowBarLead>
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

export function AppShell(): React.JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const me = useMe()
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
  const createFolder = useCreateFolder()
  /* 4.4 makes a folder's shelf placement a membership fact, so filing a new
     folder onto a shelf is a second write after the create. */
  const relabelFolder = useUpdateMyMembership()
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
  const groups = useFolderGroupActions(
    folders.data ?? NO_FOLDERS,
    shelves.data ?? NO_SHELVES,
    (label) => {
      setNewFolderIn(label)
      setNewFolderOpen(true)
    },
  )

  // 9.1's two view preferences, read once at the first render so the sidebar
  // paints at the width the viewer left it at rather than jumping to it.
  const [railOpen, setRailOpen] = useState(() => !readSidebarCollapsed())
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(readSidebarWidth)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  /*
  Which shelf a new folder is being made on, if any.

  Null for 9.1's footer act, which is made from no shelf at all, and a label for
  "Add folder to {shelf}" on a shelf heading. One dialog either way: the label
  is what the folder is filed under once it exists, which is two writes because
  4.4 makes the placement a membership fact rather than a column on the folder.
  */
  const [newFolderIn, setNewFolderIn] = useState<string | null>(null)
  /* A page asking for the dialog: 9.10's shelf page, whose "New folder..."
     files what it makes on the shelf. */
  useEffect(
    () =>
      onOpenNewFolder((label) => {
        setNewFolderIn(label)
        setNewFolderOpen(true)
      }),
    [],
  )

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
  const activeFolderId = location.pathname.startsWith(FOLDER_PREFIX)
    ? location.pathname.slice(FOLDER_PREFIX.length)
    : null


  /*
  9.8's invite gate, in place of the application at every /app path while Q12 is
  non-empty.

  This component is where it goes because this component is what /app renders,
  so "every /app path" and "in place of the application" are one condition and
  one return rather than a rule each page has to remember.

  **The condition is a non-empty answer and never a pending read.** A gate that
  waited for `/invites/pending` before rendering anything would be a client that
  shows nothing until the network answers, and 10.6 opens every /app path from
  the cached shell with no network at all; AC-091 and AC-160 read the sidebar's
  page links there. So a read in flight, a read that failed and an empty answer
  all render the application, which is also the only one of the four that a
  person with no invite can ever observe. The cost is that an account holding an
  invite sees the shell for as long as that read takes, and `main.tsx` starts it
  before this component mounts for exactly that reason.

  The returned tree carries no chrome except the two global states; see
  `pages/InviteGate.tsx` for why those two and not the rest.
  */
  // F-8's other half: while the document load above is in flight, the shell
  // must not mount its pages, whose reads would each earn the same 401.
  if (signedOut) {
    return <></>
  }

  if ((invites.data?.length ?? 0) > 0) {
    return (
      <>
        <OfflineBanner />
        <InviteGate invites={invites.data ?? []} />
        {/* No capture button on the gate, so the toast keeps the corner. */}
        <ToastRegion clearsCapture={false} />
      </>
    )
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
            <PhoneBar onOpenSearch={openSearch} />
            {/* `components/window-bar.tsx`: pages and the task surface portal
                their controls into its two ends. */}
            <div className="flex shrink-0 items-center">
              <ShowSidebar />
              <div className="min-w-0 flex-1">
                <WindowBar />
              </div>
            </div>
            <TopTrail />
            <UpdateChrome showUpdate={update.showUpdate} onUpdate={update.applyUpdate} />
            <OfflineBanner />
            {/* The one region that scrolls. */}
            <div data-shell-scroll className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[var(--shell-content-max)] px-4 py-4 md:px-10 md:py-6">
                <Outlet />
              </div>
            </div>
          </SidebarInset>
          {/* 9.1's "New folder" action, and beside it the three surfaces its
              folder groups open: the create dialog, the rename dialog and the
              delete confirm. They are mounted here rather than inside the rows
              that open them, because a dialog inside a row is unmounted by the
              refetch its own write causes. */}
          <NewFolderDialog
            open={newFolderOpen}
            groupLabel={newFolderIn ?? undefined}
            onOpenChange={(next) => {
              setNewFolderOpen(next)
              /* The label belongs to one opening of the dialog and not to the
                 control that opened it, so the next New folder from the footer
                 does not inherit the last shelf somebody added to. */
              if (!next) setNewFolderIn(null)
            }}
            onCreate={(name) => {
              const label = newFolderIn
              createFolder.mutate(
                { name },
                {
                  /* Filed after it exists rather than in the same call: 7.4
                     creates a folder and 7.4's my-membership places it, and
                     widening the create to carry a label would be an API change
                     for a client convenience. Then the folder opens, ready for
                     tasks. */
                  onSuccess: (made) => {
                    if (label !== null) {
                      relabelFolder.mutate({ id: made.id, body: { shelf: label } })
                    }
                    void navigate(paths.folder(made.id))
                  },
                },
              )
            }}
          />
          {groups.dialogs}
        </SidebarProvider>
      </div>
      {/* The undo bar: one for the whole window, bottom-centre, outside the
          sidebar provider so it is not clipped by the shell's own layout and
          so there is exactly one of it however many pages mount. */}
      <UndoBar />
      <ToastRegion clearsCapture={false} />
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
