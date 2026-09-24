/*
9.1's route table as a router, in React Router's library mode and nothing else.

11.15 records that importing loader, action or framework-mode APIs is a
defect, and this file is where that would happen if it happened anywhere. So
the routing is `BrowserRouter`, `Routes` and `Route`: components, no data
APIs, nothing that could grow a loader by accident. Data belongs to the query
layer, and the query layer is `api/`.

`/app` lands on Today. Retired paths redirect with `replace`, so the old
address does not sit in the history behind the new one and the back button
does not bounce off it. A page's list, board and calendar are `?mode=`, not
routes.
*/
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { useFolders } from './api/queries.js'
import { AssignmentsPage } from './pages/AssignmentsPage.js'
import { DiscussionLinkPage, OutcomeLinkPage } from './pages/ConsultationLinkPage.js'
import { FacetEntryPage } from './pages/FacetEntryPage.js'
import { FolderPage } from './pages/FolderPage.js'
import { LandingPage } from './pages/LandingPage.js'
import { LegalPage } from './pages/LegalPage.js'
import { NotFoundPage } from './pages/NotFoundPage.js'
import { ScheduledPage } from './pages/ScheduledPage.js'
import { FocusListPage } from './pages/FocusListPage.js'
import { SettingsPage } from './pages/SettingsPage.js'
import { ShelfPage } from './pages/ShelfPage.js'
import { TaskPage } from './pages/TaskPage.js'
import { TodayPage } from './pages/TodayPage.js'
import { TrashPage } from './pages/TrashPage.js'
import { paths, retiredPaths } from './routes.js'
import { AppShell } from './shell/app-shell.js'

/**
 * `/app/desk`: Desk is the default folder, so its address is that folder's.
 * The id is data (the folder carrying `is_default`, which INV-2 keeps), so this
 * waits for the folder list the shell is already reading, and falls back to
 * Today if the read fails rather than stranding the person on a blank page.
 */
function DeskRedirect(): React.JSX.Element | null {
  const folders = useFolders()
  if (folders.isPending) return null
  const desk = folders.data?.find((folder) => folder.is_default)
  return <Navigate to={desk === undefined ? paths.today : paths.folder(desk.id)} replace />
}

export function Router(): React.JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={paths.landing} element={<LandingPage />} />
        {/* Outside the /app layout on purpose: see routes.ts. */}
        <Route path={paths.privacy} element={<LegalPage page="privacy" />} />
        <Route path={paths.terms} element={<LegalPage page="terms" />} />
        <Route path={paths.home} element={<AppShell />}>
          <Route index element={<Navigate to={paths.today} replace />} />
          <Route path="today" element={<TodayPage />} />
          <Route path="scheduled" element={<ScheduledPage />} />
          <Route path="assignments" element={<AssignmentsPage />} />
          <Route path="lists/:list" element={<FocusListPage />} />
          <Route path="desk" element={<DeskRedirect />} />
          <Route path="trash" element={<TrashPage />} />
          <Route path="folders/:id" element={<FolderPage />} />
          {/* A stable Purpose Dana Link enters through its facet identity,
              then resolves into the owning Folder without changing hide state. */}
          <Route path="facets/:id" element={<FacetEntryPage />} />
          <Route path="shelves/:id" element={<ShelfPage />} />
          {/* Matched before the retired bare "/app/tasks" redirect below. */}
          <Route path="tasks/:id" element={<TaskPage />} />
          {/* #320's Dana Link addresses: each resolves its Folder and
              replaces itself with the Consultation facet's URL state. */}
          <Route path="discussions/:id" element={<DiscussionLinkPage />} />
          <Route path="outcomes/:id" element={<OutcomeLinkPage />} />
          <Route path="settings" element={<SettingsPage />} />
          {/* People lives in Settings now; the old address still lands there. */}
          <Route path="people" element={<Navigate to={`${paths.settings}#people`} replace />} />
          {retiredPaths.map(({ from, to }) => (
            <Route
              key={from}
              // The table's paths are absolute and this Route is nested, so
              // the child path is what follows "/app/".
              path={from.slice('/app/'.length)}
              element={<Navigate to={to} replace />}
            />
          ))}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
