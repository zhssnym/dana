/*
The global chrome of 9.1, and the only place any of it exists.

Everything here is global because section 9 says it is: the top bar, the
sidebar, the offline banner ("global, persistent while offline"), the toast
region, the floating add button ("on every page except Done"), and 10.6's
update affordance. A page renders inside the outlet and adds none of them.

The three chrome reads are made here rather than in the pages, which is the
one place this client deliberately fetches above the page: /me, /me/settings
and /folders back the sidebar and the avatar menu on every page, so a page
that fetched them would fetch them again on the next page for the same
answer. They are one entry each in the query cache, so this costs one request
per surface for the life of the document.

The shell renders before any of the three answers, and it has to: 10.6's
navigation fallback opens every /app path from the cached shell with no
network at all, and AC-091 reads the sidebar's page links there. Nothing in
the chrome waits on data.

**The layout, added by P8D session 2, and it is the thing P8 never built.**
Until now this file rendered a bare `div` with a bare `main` inside it, which
is the direct reason the product shipped with its sidebar as a full-width
block above the page. The shape below is the designer's: a sidebar of fixed
width beside a content column, the whole of it pinned to the viewport, and
exactly one region that scrolls.

That last part is the design's own scrolling rule and the reason the nesting
looks the way it does. `app-shell` is the viewport-height box; `shell-main` is
the column beside the sidebar; `shell-scroll` inside it is the only element
that overflows, so the top bar, the page strip, the banners and the floating
action stay where they are while the page moves under them. Put the overflow
anywhere else and either the whole document scrolls, taking the chrome with
it, or the chrome scrolls away inside its own column.

Every class here is from `components/README.md`'s vocabulary, which role 08
landed in `styles/tokens.css` at session 1. This file writes no colour, no
dimension and no duration, which is 11.4's rule; the two bare Tailwind
utilities it does write, `relative` and `flex-col`, place things rather than
paint them, which is the idiom the component set already uses.

**Document order carries two contracts, so the tree below is not free to be
rearranged for looks.** The search overlay is first, ahead of the sidebar and
the top bar both, because the suite addresses its field as the document's
first textbox and the sidebar's "New folder" disclosure carries a text input
of its own; being fixed-position, it costs nothing to put it there and it can
no longer lose that race. And the sidebar precedes the content column, which
is the reading order navigation should have anyway and which AC-155 depends
on, addressing the sidebar as the first navigation landmark on the page.
*/
import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'

import { mutateApi } from '../api/http.js'
import { useFolders, useMe, useSettings } from '../api/queries.js'
import { todayInBrowserZone } from '../api/tz.js'
import { SearchOverlay } from '../components/search/index.js'
import { TaskFormOverlay } from '../components/task-form/index.js'
import { UpdatePrompt } from '../pwa/UpdatePrompt.js'
import { paths, sidebarPages } from '../routes.js'
import { ToastRegion } from '../state/ToastRegion.js'
import { FloatingAddButton } from './FloatingAddButton.js'
import { OfflineBanner } from './OfflineBanner.js'
import { openSearch } from './overlays.js'
import { Sidebar } from './Sidebar.js'
import { TopBar } from './TopBar.js'
import type { TaskFormDefaults } from './overlays.js'
import type { Folder } from '../../shared/folders.js'

/**
 * The entry-point defaults of 9.3, keyed by the page the button sits on.
 *
 * The folder page's cell was the one the table left blank, and the P8 change
 * control closed it on 2026-08-11: the floating button sits on the page rather
 * than in a section, so it opens with the due date empty, which is what having
 * no section context means everywhere else in the table. The two quick-add
 * rows carry the section contexts, and those live on the folder page itself.
 */
function floatingDefaults(pathname: string): TaskFormDefaults | null {
  if (pathname === paths.done) return null // 9.1: every page except Done.
  if (pathname === paths.myDay) return { due_date: todayInBrowserZone(), important: false }
  if (pathname === paths.planned) {
    return { due_date: todayInBrowserZone(), important: false }
  }
  if (pathname === paths.important) return { due_date: null, important: true }
  if (pathname.startsWith('/app/folders/')) {
    const id = pathname.slice('/app/folders/'.length)
    return { due_date: null, important: false, folder_id: id }
  }
  // Tasks, All, and the bare button: empty date, important off, Inbox, which
  // the server supplies by defaulting folder_id to V's Inbox (7.6).
  return { due_date: null, important: false }
}

/** Whether a keystroke landed somewhere a person is typing. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || target.isContentEditable
}

/**
 * The name of the page currently open, for the strip under the top bar.
 *
 * The strip is the designer's static current-page indicator and `notes.md` is
 * explicit that it is not a tab system: nothing here is clickable and nothing
 * navigates. It is rendered in a `span` and deliberately never a heading,
 * because a heading here would be the first one on every page and AC-172
 * asserts that an invite row precedes the first heading on My Day.
 *
 * A folder's name comes from the same `/folders` read the sidebar uses, so an
 * unopened folder or a failed read simply shows nothing rather than a
 * flickering identifier.
 */
function currentPageName(
  pathname: string,
  folders: readonly Folder[] | undefined,
): string | null {
  const page = sidebarPages.find((candidate) =>
    candidate.path === paths.myDay ? pathname === paths.myDay : pathname === candidate.path,
  )
  if (page !== undefined) return page.name
  if (pathname === paths.settings) return 'Settings'
  if (pathname === paths.people) return 'People'
  if (pathname.startsWith('/app/folders/')) {
    const id = pathname.slice('/app/folders/'.length)
    return folders?.find((folder) => folder.id === id)?.name ?? null
  }
  return null
}

export function AppLayout(): React.JSX.Element {
  const location = useLocation()
  const me = useMe()
  const settings = useSettings()
  const folders = useFolders()

  // 9.1's shortcut for the search control. On the document rather than on the
  // button, because a shortcut that only fires while its control has focus is
  // not one. "/" is ignored while the person is typing, or every quick-add row
  // on the page would swallow its own slashes.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const ctrlK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'
      const slash = event.key === '/' && !isTyping(event.target)
      if (!ctrlK && !slash) return
      event.preventDefault()
      openSearch()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const defaults = floatingDefaults(location.pathname)
  const pageName = currentPageName(location.pathname, folders.data)

  return (
    <>
      {/* 9.9's overlay, ahead of everything for the reason in this file's
          header: it is fixed-position chrome, so its place in the tree costs
          nothing, and being first makes its field the document's first
          textbox on every page whatever else is open. Added by the Complex
          Interaction session, which owns the overlay itself. */}
      <SearchOverlay />
      <div className="app-shell">
        <Sidebar settings={settings.data} folders={folders.data} />
        {/* `relative` positions the floating action against this column
            rather than the viewport, so it clears the sidebar instead of
            sitting over it. */}
        <div className="shell-main relative">
          <TopBar
            displayName={me.data?.user.display_name ?? null}
            onSignOut={() => {
              void mutateApi(null, { method: 'POST', path: '/auth/logout' }).finally(() => {
                // A full document load rather than a client navigation: the
                // query cache holds the previous person's rows, and 10.1
                // destroys their session, so nothing in it is theirs to keep.
                window.location.assign(paths.landing)
              })
            }}
          />
          {pageName === null ? null : (
            <div className="shell-pagebar">
              <div className="shell-pagebar-tab">{pageName}</div>
            </div>
          )}
          <OfflineBanner />
          <UpdatePrompt />
          {/* The one region that scrolls, and still the `main` landmark it
              was. `shell-content` inside it is the measure every page is laid
              out in, which belongs to the layout rather than to each page:
              thirteen pages each choosing their own width is thirteen chances
              to disagree. */}
          <main className="shell-scroll">
            <div className="shell-content">
              <Outlet />
            </div>
          </main>
          {defaults === null ? null : <FloatingAddButton defaults={defaults} />}
        </div>
      </div>
      <ToastRegion />
      {/* 9.3's form, mounted once and last. Once, because it opens over
          whatever page is beneath it and a per-page copy would be two of them
          on the All page; last, because it is opened from a row anywhere in
          the page and its own controls have to come after that page's, so
          "the form's overflow menu" is the last one on the document rather
          than a row's. Added by the Complex Interaction session, which owns
          both overlay directories. */}
      <TaskFormOverlay />
    </>
  )
}
