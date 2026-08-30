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
page, which is what an application header is; every `header` this shell
renders sits inside `main` and is a page's own rather than the application's,
so it is content and not chrome. That placement is a requirement of this file.

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
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
/* The icon module of DES-125, since S8: every icon Dana uses is an export
   of one file and nothing imports `lucide-react` directly. */
import { adoptClock } from '../lib/time-format.js'
import type { LucideIcon } from '../lib/icons.js'
import {
  Ban,
  CalendarDays,
  CalendarX,
  CheckCircle2,
  Folder as FolderIcon,
  LampDesk,
  Layers3,
  PanelLeft,
  RefreshCw,
  Search,
  Settings,
  Star,
  SunMedium,
  Trash2,
  UserRoundCheck,
  UsersRound,
} from '../lib/icons.js'

import { ApiError } from '../api/http.js'
import {
  useCreateFolder,
  useImportWorkflow,
  usePatchBundle,
  useUpdateMyMembership,
} from '../api/mutations.js'
import { importWorkflowBody } from '../../shared/workflows.js'
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
import { TaskSurfaceHost } from '../components/task-surface-host.js'
/* The folder table published for the lifted pickers' bare `folderLibrary()`.
   Mounted once, here, because this component is what every /app path renders
   and a publisher with several writers is one whose value depends on unmount
   order. `lib/folder-library.ts` carries the reasoning. */
import { FolderLibraryMemory } from '../lib/folder-library.js'
import { useHistory } from '../lib/history.js'
import { TaskWriter, useApiTaskPatch } from '../lib/task-writer.js'
import { Button } from '../components/ui/button.js'
import { SidebarInset, SidebarProvider, useSidebar } from '../components/ui/sidebar.js'
import { DanaMark } from '../components/dana-mark.js'
import { NotificationsBell } from '../components/notifications-bell.js'
import { InviteGate } from '../pages/InviteGate.js'
import { folderMark } from '../parts/presenters.js'
import { useUpdateAffordance } from '../pwa/useUpdateAffordance.js'
import { navPages, paths } from '../routes.js'
import { placeAt, surfaceDefaults } from '../views/place-pages.js'
import { effectiveMode, useViewMode } from '../views/view-mode.js'
import type { ViewMode } from '../views/view-mode.js'
import { ToastRegion } from '../state/ToastRegion.js'
import { showToast } from '../state/toasts.js'
import { AppSidebar } from './app-sidebar.js'
import { FloatingAddButton } from './FloatingAddButton.js'
import { useFolderGroupActions } from './folder-groups.js'
import { OfflineBanner } from './OfflineBanner.js'
import { UndoBar } from '../components/undo-bar.js'
import { useAppearance } from './appearance.js'
import { signOut } from './session.js'
import { mirroredTheme } from '../lib/theme.js'
import { onOpenNewFolder, openSearch } from './overlays.js'
import { useModalOpen, useRightEdge } from '../components/right-edge.js'
import { TabStrip } from './TabStrip.js'
import { WindowActivity, WindowBar, WindowBarActions } from '../components/window-bar.js'
import { retarget } from './tabs.js'
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

/** And for the shelves the Library and the strip's menu both read (S17b). */
const NO_SHELVES: readonly Shelf[] = []

/* What 9.1's Import says when the file is not a workflow at all. Section 9
   names no string for this, so it is this file's, written in the register the
   other client-side refusals use: what happened, and nothing about JSON. */
const WORKFLOW_UNREADABLE = "That file isn't a workflow Dana can read."

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
  /* polish: places F10. The Trash tab was a blank with an "x". */
  if (pathname === paths.trash) {
    return { title: 'Trash', icon: pageIcons[paths.trash], iconColor: undefined }
  }
  if (pathname.startsWith(FOLDER_PREFIX)) {
    const id = pathname.slice(FOLDER_PREFIX.length)
    const folder = folders?.find((candidate) => candidate.id === id)
    /* The folder's own mark since S17a. A tab drew a literal folder in a
       personal colour until then, which is 9.1's "every tab is the same tab,
       one anatomy (mark, title, close control)" with the wrong mark: a tab is
       a face for the thing it opens, so it wears the thing's face. One
       resolver, `parts/presenters.ts`, answers here and in the Library. */
    const mark = folderMark(folder)
    return { title: folder?.name ?? '', icon: mark.icon, iconColor: mark.color }
  }
  /* A shelf tab wears the shelf's name and its own mark (9.1: every tab is
     the same tab), from the shelves read the Library shares since S17b. */
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

/*
What the shell puts in the window bar, as opposed to what a page puts there.

9.1 orders the bar's right end in one sentence: "the view strip, the filter
control, the Activity line, and the object's overflow menu". The first two are
a place page's own and portal in at the default order, the last is the folder
and shelf pages' at order 2, and these two sit between them at order 1. The
lifted bar's `order` prop exists for exactly this, portals landing in mount
order otherwise, which is not an arrangement anybody chose.

**The Activity line reads the path rather than taking a subject**, because the
bar belongs to the window and the window's subject is wherever it is pointed.
Only a folder and a task have events worth a line; a place page is a view over
other people's things and has no history of its own, which is why the line is
absent there rather than empty.

10.6's update affordance is the one thing on the retired v1 page strip that was
not the page's title, and it stays here rather than moving into the lifted
component: that component is the prototype's, and the prototype has no service
worker to offer an update from.
*/
function shellSubjectOf(pathname: string): { kind: 'folder' | 'task'; id: string } | null {
  const folder = /^\/app\/folders\/([0-9a-f-]{36})$/.exec(pathname)
  if (folder?.[1] !== undefined) return { kind: 'folder', id: folder[1] }
  const task = /^\/app\/tasks\/([0-9a-f-]{36})$/.exec(pathname)
  if (task?.[1] !== undefined) return { kind: 'task', id: task[1] }
  return null
}

/** 10.6's update copy, transcribed. AC-100 addresses it by this name. */
const UPDATE_AVAILABLE = 'Update available, reload'

/*
polish: sidebar F1, tabstrip F1, search F2 (the blocker in six reports).

Below 768px the vendored sidebar is a drawer and nothing opened it: the only
toggle lived inside the drawer. This bar stands above the tab strip on a
phone only, carrying the one thing that opens the drawer, the mark as the way
home, and the two everywhere-controls the sidebar header holds on a laptop,
Search and the bell. It is a `div` inside `main` rather than a `header`
outside it, which keeps AC-174's "no banner landmark" true; and it returns
nothing at all on a laptop rather than hiding, so a desktop page carries one
"Search" control and one bell, as every criterion that counts them expects.
The drawer closes on navigation from `app-sidebar.tsx`, on the backdrop and
on Escape from the sheet itself.
*/
function PhoneBar({ onOpenSearch }: { readonly onOpenSearch: () => void }): React.JSX.Element | null {
  const { isMobile, setOpenMobile } = useSidebar()
  if (!isMobile) return null
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-[var(--color-graphite-100)] bg-[var(--color-graphite-50)] px-1">
      <Button
        variant="ghost"
        className="size-10 text-[var(--color-graphite-700)]"
        aria-label="Menu"
        onClick={() => {
          setOpenMobile(true)
        }}
      >
        <PanelLeft className="!size-5" strokeWidth={1.75} aria-hidden="true" />
      </Button>
      <Link
        to={paths.desk}
        className="flex min-w-0 items-center gap-2 rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <DanaMark className="size-6" />
        <span className="truncate text-base font-semibold text-[var(--color-graphite-900)]">Dana</span>
      </Link>
      <span className="min-w-0 flex-1" />
      <Button
        variant="ghost"
        className="size-10 text-[var(--color-graphite-700)]"
        aria-label="Search"
        onClick={onOpenSearch}
      >
        <Search className="!size-5" strokeWidth={1.75} aria-hidden="true" />
      </Button>
      <NotificationsBell side="bottom" />
    </div>
  )
}

function WindowBarChrome({
  pathname,
  showUpdate,
  onUpdate,
}: {
  readonly pathname: string
  readonly showUpdate: boolean
  readonly onUpdate?: () => void
}): React.JSX.Element | null {
  const subject = shellSubjectOf(pathname)
  /* Hooks before the branch, and the disabled read is `useHistory`'s own
     contract: a subject that is not a uuid is a thing with no history rather
     than a wrong question, so nothing is sent. */
  const events = useHistory(subject?.kind ?? 'task', subject?.id ?? '', subject !== null)
  if (subject === null && !showUpdate) return null
  return (
    <WindowBarActions order={1}>
      {subject === null ? null : <WindowActivity events={events} />}
      {showUpdate ? (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-[var(--color-graphite-700)]"
          /* 10.6's non-forcing update: the waiting worker is applied on a
             click and never without one. */
          onClick={onUpdate ?? (() => globalThis.location.reload())}
        >
          <RefreshCw className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          {UPDATE_AVAILABLE}
        </Button>
      ) : null}
    </WindowBarActions>
  )
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
  /*
  The shelves read (7.16), which the Library draws, the strip's New tab menu
  offers, and a shelf tab's face resolves through.

  **It was gated and is not, and the gate was the audit addendum's finding.**
  This waited on a `shelvesWanted` that was true only when a shelf route or
  tab was already open, on the reasoning that "only a shelf tab needs shelf
  names, so the read waits until one is open rather than costing every page a
  request at mount". That was sound while the Library drew
  `folder_members.label` strings and nothing else wanted shelves. 9.1 has
  always wanted them, "the Library holds the viewer's shelves and folders as
  one ordered list", and the sidebar is on every page: so the condition the
  gate tested is now true everywhere, and a gate that is always true is a gate
  that lies. The comment below the `AppSidebar` call used to say the Library
  "will share" this read, in a future tense it held for three packages, and
  the measured consequence was that a shelf created through 7.16 renders its
  own page and vanishes from the Library on reload.

  The cost is one request per session rather than per page: the query layer
  caches it under its own key and 8.3's refetch policy governs it exactly as
  it governs `/folders`, which this shell has always read unconditionally two
  lines above.
  */
  const shelves = useShelves()
  const invites = usePendingInvites()
  /* 9.1 ends the page block with the viewer's pinned saved views, so the
     chrome reads them here beside the pin list rather than in a page. */
  const savedViews = useSavedViews()
  const createFolder = useCreateFolder()
  /* 4.4 makes a folder's shelf placement a membership fact, so filing a new
     folder onto a shelf is a second write after the create. */
  const relabelFolder = useUpdateMyMembership()
  const update = useUpdateAffordance()
  /* What an open right-edge panel has reserved (DES-154, DES-186). Zero when
     nothing is open, which is almost always. */
  const rightEdge = useRightEdge()
  /* Whether a modal task surface is open over the page. Seam, S23; see the
     wrapper below. */
  const modalOpen = useModalOpen()
  /*
  9.7's Appearance, applied to the document (RFC 0005 change control item 30).
  4.19's own defaults stand in while the bundle read is in flight, so the first
  paint is the light comfortable one a fresh account has rather than an
  unstyled one that corrects itself a moment later.
  */
  useAppearance(
    /* The mirror stands in while the bundle is in flight (item 43): applying
       4.19's default here repainted the frame the inline script had already
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
  /* The remembered view, unresolved: every mode is passed as offered so this
     reads the store rather than a page's answer to it, and floatingDefaults
     resolves it against the page it is actually on. */
  const [remembered] = useViewMode(ALL_VIEWS)
  const groups = useFolderGroupActions(
    folders.data ?? NO_FOLDERS,
    shelves.data ?? NO_SHELVES,
    (label) => {
      setNewFolderIn(label)
      setNewFolderOpen(true)
    },
  )

  /*
  9.1's "Import (a workflow file)", the footer's third act, wired here because
  the mutation belongs to the shell and the control belongs to the sidebar.

  **The parse is the client's and every cap is the server's.** 10.3 bounds a
  workflow file's folders, blocks and tasks and the request body itself, and
  7.16 refuses what breaks any of them; nothing here re-implements one of
  those, which would be a rule the server also enforces written twice. What is
  refused locally is a file that is not a workflow at all: not JSON, or JSON
  that is not 7.16's shape, because either is something this page can say
  plainly and a 400 or a 422 naming a key is not.

  **The shape is the widened 7.16 file S22a landed** (RFC 0005 change control
  item 44's B3, and this row's item 44 clause): `importWorkflowBody` is the
  shared schema, so a file carrying notes, a star, a repeat, a reminder and
  steps passes here as it passes on the server, and the mutation carries the
  zone such a file needs. Zod strips what the schema does not name, which is
  AC-201's rule and not a scrubbing pass of this file's own.
  */
  const importWorkflow = useImportWorkflow()
  const importFile = (file: File): void => {
    void file.text().then(
      (text) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(text)
        } catch {
          showToast(WORKFLOW_UNREADABLE)
          return
        }
        const file = importWorkflowBody.safeParse(parsed)
        if (!file.success) {
          showToast(WORKFLOW_UNREADABLE)
          return
        }
        /* polish: settings F3. A folder whose name the Library already has
           arrives as "Name (imported)" rather than as a second "Desk"; and
           the import says what it made and opens it. */
        const taken = new Set((folders.data ?? []).map((folder) => folder.name))
        const body = {
          ...file.data,
          folders: file.data.folders.map((folder) =>
            taken.has(folder.name) ? { ...folder, name: `${folder.name} (imported)`.slice(0, 100) } : folder,
          ),
        }
        importWorkflow.mutate(body, {
          onSuccess: (made) => {
            const tasks = body.folders.reduce((sum, folder) => sum + (folder.tasks?.length ?? 0), 0)
            const first = made.folders[0]
            showToast(
              made.folders.length === 1 && first !== undefined
                ? `Imported "${first.name}" with ${String(tasks)} task${tasks === 1 ? '' : 's'}`
                : `Imported ${String(made.folders.length)} folders with ${String(tasks)} task${tasks === 1 ? '' : 's'}`,
            )
            if (first !== undefined) void navigate(paths.folder(first.id))
          },
        })
      },
      () => {
        showToast(WORKFLOW_UNREADABLE)
      },
    )
  }

  // 9.1's two view preferences, read once at the first render so the sidebar
  // paints at the width the viewer left it at rather than jumping to it.
  const [railOpen, setRailOpen] = useState(() => !readSidebarCollapsed())
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(readSidebarWidth)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  /*
  Which shelf a new folder is being made on, if any.

  Null for 9.1's footer act, which is made from no shelf at all, and a label
  for the prototype's "Add folder to {shelf}" on a shelf heading. One dialog
  either way: the label is what the folder is filed under once it exists,
  which is two writes because 4.4 makes the placement a membership fact rather
  than a column on the folder.
  */
  const [newFolderIn, setNewFolderIn] = useState<string | null>(null)
  /* A page asking for the dialog (S27): 9.10's shelf page, whose "New
     folder..." files what it makes on the shelf. */
  useEffect(
    () =>
      onOpenNewFolder((label) => {
        setNewFolderIn(label)
        setNewFolderOpen(true)
      }),
    [],
  )

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

  /*
  9.1's Ctrl+Z used to be listened for here and is the lifted bar's own since
  S24. The prototype's reason is the right one and is quoted in that file: the
  bar and the keystroke are one feature, the bar being the discoverable half,
  and a shell that owns one while a component owns the other is how one of them
  ends up wired and the other forgotten.
  */

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
  F-8 (RFC 0005 change control item 18, ed33d2f): an unauthenticated read at
  any /app route sends the person to / rather than rendering the shell over a
  wall of refusals. The branch is the refusal alone, an ApiError carrying
  10.1's 401: a /me that is slow, offline, or failed any other way keeps the
  shell, because 10.6 opens every /app path from the cached worker with no
  network at all, and a redirect firing on anything but a refusal would
  bounce every real session on a bad connection. A full document load rather
  than a client navigation, for signOut's reason below: whatever the caches
  hold belongs to nobody the browser can still name.
  */
  const signedOut = me.error instanceof ApiError && me.error.status === 401
  useEffect(() => {
    if (signedOut) window.location.replace(paths.landing)
  }, [signedOut])

  const defaults = floatingDefaults(location.pathname, remembered)
  /* The one write path out of a card. See the provider at this component's
     root. Seam, S23. */
  const taskPatch = useApiTaskPatch()
  const activeFolderId = location.pathname.startsWith(FOLDER_PREFIX)
    ? location.pathname.slice(FOLDER_PREFIX.length)
    : null


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
    **Seam, S23: the one write path out of a card, provided once.**

    `lib/task-writer.tsx` is that path and its header carries Imran's reason
    for it: "dialog, sidebar, inline, and maybe more are just views of the same
    task row, so the data inside them should be the same and updated
    simultaneously." Every lifted card reaches for it through `useTaskWriter`,
    and a card that finds nothing there keeps its edits and sends none, which
    is what a row expanded on a page did until this line: the chevron opened a
    real card whose every edit went nowhere.

    Here rather than in a page, because 9.3's inline card is drawn wherever a
    row is and this component is what every /app path renders. The prototype
    puts it in its shell for the same reason and says so: "it is not a value
    read in fifty places, it is one function owned by the one component that
    already wraps every screen."

    The surface host provides its own inside this one, and deliberately: a
    capture's edits ride a draft until the task exists, which is a different
    function for the window in which there is nothing to write to.
    */
    <TaskWriter patch={taskPatch}>
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
      {/*
      **Seam, S23: a modal task surface takes the page out of the document.**

      9.1's roles table makes that surface "a dialog when opened as one", and
      `components/right-edge.tsx`'s `HoldsTheDocument` carries the whole of
      the reasoning and the measurement. What lands here is the other half:
      `aria-hidden` takes this subtree out of the accessible tree, which is
      what modal means, and `inert` takes it out of the pointer and the tab
      order, which is what stops a click reaching a control nobody can see.
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
            /* 9.1's Library, both halves. This is the line that did not exist,
               and the audit addendum's own sentence for it: "the cause is one
               line that does not exist, app-shell.tsx never passes a shelves
               prop to AppSidebar". */
            shelves={shelves.data}
            sidebarOrder={sidebarOrder ?? []}
            onSidebarOrderChange={(ids) => {
              setSidebarOrder(ids)
              patchBundle.mutate({ sidebar_order: [...ids] })
            }}
            groups={groups.actions}
            displayName={me.data?.user.display_name ?? null}
            avatarUrl={me.data?.user.avatar_url ?? null}
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
            onNewFolder={() => {
              setNewFolderIn(null)
              setNewFolderOpen(true)
            }}
            /* 9.1's second act of making. A shelf is made by naming it, 4.18
               giving it a stable id the name can then move over, so the dialog
               the group flow already owns is the one surface for it: this
               hands the same dialog the shelf half rather than opening a
               second one that would write the same two things. */
            onNewShelf={() => { groups.actions.onNewShelf() }}
            onImportWorkflow={importFile}
            onSignOut={signOut}
          />
          {/*
          `SidebarInset` is the `main` landmark, which is what keeps the page
          strip below it a page's header rather than the application's banner
          (AC-174).

          **The right edge is a margin on this element** (DES-154, DES-186,
          S17b). A panel on the right publishes its width to
          `components/right-edge.tsx` and this reads it back as plain pixels,
          which is one store since S24 and was two before it: the task
          surface published into the lifted module while this read the shell's
          own copy, so a task opened in the panel covered the page. So the
          page narrows rather than being covered and the number that lays it
          out is one a person can print.

          **A margin and not padding, which the first attempt used.** Padding
          moves the content in and leaves the box where it was, so the `main`
          landmark still measured the full window with a panel open: the page
          looked narrower and was not, which is the difference between a
          layout and an indent. A margin takes the room off the element
          itself, which is what "the page gets narrower" means and what
          AC-260 reads. The transition is on the margin alone, because a
          panel that appears instantly beside a page that jumps reads as two
          events rather than one.
          */}
          <SidebarInset
            className="min-w-0 overflow-hidden bg-card transition-[margin] duration-[var(--duration-slow)] ease-[var(--ease-enter)]"
            style={{ marginRight: `${String(rightEdge)}px` }}
          >
            {/*
            The tab strip of 9.1, above the window bar and inside `main`.

            Inside rather than above the inset for AC-174's reason: a
            `header` outside `main` is the banner landmark that criterion
            asserts the absence of, and the strip is chrome belonging to the
            window rather than to the application.
            */}
            <PhoneBar onOpenSearch={openSearch} />
            <TabStrip
              face={(path) => currentPage(path, folders.data, shelves.data)}
              folders={folders.data ?? NO_FOLDERS}
              shelves={shelves.data ?? NO_SHELVES}
              onNavigate={(path) => {
                void navigate(path)
              }}
            />
            {/*
            The window bar of 9.1 and DES-139, replacing the v1 page strip.

            The strip it replaces repeated the page's title, which 9.1 now
            forbids in as many words because the tab above says it.

            **This is the lifted bar since S24, and the client had two.** S23
            brought `components/window-bar.tsx` across because the task surface
            needs three of its exports, and its own header says "the shell that
            renders it is S24's". Until this line changed, nothing rendered it:
            the surface's `WindowBarLead` and `WindowBarActions` portalled into
            slots no component mounted, so a task opened as a tab drew its
            folder, its section and its controls into a bar that was not there.
            The shell's own copy is retired with the store behind it.
            */}
            <WindowBar />
            <WindowBarChrome
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
              <div className="mx-auto w-full max-w-[var(--shell-content-max)] px-4 py-4 md:px-10 md:py-6">
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
                     widening the create to carry a label would be a frozen
                     section 7 change for a client convenience. polish:
                     sidebar F8, then the folder opens, ready for tasks. */
                  onSuccess: (made) => {
                    if (label !== null) relabelFolder.mutate({ id: made.id, body: { label } })
                    void navigate(paths.folder(made.id))
                  },
                },
              )
            }}
          />
          {groups.dialogs}
        </SidebarProvider>
      </div>
      {/* 9.1's undo bar: one for the whole window, bottom-left, outside the
          sidebar provider so it is not clipped by the shell's own layout and
          so there is exactly one of it however many pages mount. */}
      <UndoBar />
      {/* Up by the capture button's height where one is drawn, and on the
          corner where none is (9.1: the floating button appears only on Today,
          Important and Assignments). A notice landing on the control people
          press most is the fault the undo bar's own placement avoids, and this
          is the same rule for the other corner. */}
      <ToastRegion clearsCapture={defaults !== null} />
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
