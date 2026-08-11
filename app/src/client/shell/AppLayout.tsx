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
*/
import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'

import { mutateApi } from '../api/http.js'
import { useFolders, useMe, useSettings } from '../api/queries.js'
import { todayInBrowserZone } from '../api/tz.js'
import { UpdatePrompt } from '../pwa/UpdatePrompt.js'
import { paths } from '../routes.js'
import { ToastRegion } from '../state/ToastRegion.js'
import { FloatingAddButton } from './FloatingAddButton.js'
import { OfflineBanner } from './OfflineBanner.js'
import { openSearch } from './overlays.js'
import { Sidebar } from './Sidebar.js'
import { TopBar } from './TopBar.js'
import type { TaskFormDefaults } from './overlays.js'

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

  return (
    <div>
      <TopBar
        displayName={me.data?.user.display_name ?? null}
        onSignOut={() => {
          void mutateApi(null, { method: 'POST', path: '/auth/logout' }).finally(() => {
            // A full document load rather than a client navigation: the query
            // cache holds the previous person's rows, and 10.1 destroys their
            // session, so nothing in it is theirs to keep.
            window.location.assign(paths.landing)
          })
        }}
      />
      <OfflineBanner />
      <UpdatePrompt />
      <Sidebar settings={settings.data} folders={folders.data} />
      <main>
        <Outlet />
      </main>
      {defaults === null ? null : <FloatingAddButton defaults={defaults} />}
      <ToastRegion />
    </div>
  )
}
