/*
 * The route table (spec 9.1) in React Router library mode: no loaders, actions or data APIs (11.15). Retired
 * paths redirect with `replace`, so the back button does not bounce off them.
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { useFolders } from './api/queries.js'
import { AssignmentsPage } from './pages/AssignmentsPage.js'
import { DiscussionLinkPage, OutcomeLinkPage } from './pages/ConsultationLinkPage.js'
import { FacetEntryPage } from './pages/FacetEntryPage.js'
import { ResultLinkPage } from './pages/ResultLinkPage.js'
import { FolderPage } from './pages/FolderPage.js'
import { LandingPage } from './pages/LandingPage.js'
import { LegalPage } from './pages/LegalPage.js'
import { NotFoundPage } from './pages/NotFoundPage.js'
import { ScheduledPage } from './pages/ScheduledPage.js'
import { FocusListPage } from './pages/FocusListPage.js'
import { SettingsPage } from './pages/SettingsPage.js'
import { StatsPage } from './pages/StatsPage.js'
import { ArchivedWorkPage } from './pages/ArchivedWorkPage.js'
import { ShelfPage } from './pages/ShelfPage.js'
import { TaskPage } from './pages/TaskPage.js'
import { TodayPage } from './pages/TodayPage.js'
import { TrashPage } from './pages/TrashPage.js'
import { paths, retiredPaths } from './routes.js'
import { AppShell } from './shell/app-shell.js'

/** Desk is the default folder: wait for the folder list, then go to that folder, or to Today if the read fails. */
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
          {/* A facet link resolves into its owning folder without changing hide state. */}
          <Route path="facets/:id" element={<FacetEntryPage />} />
          <Route path="shelves/:id" element={<ShelfPage />} />
          {/* Matched before the retired bare "/app/tasks" redirect below. */}
          <Route path="tasks/:id" element={<TaskPage />} />
          {/* Each Dana Link resolves its folder, then replaces itself with the Consultation URL state. */}
          <Route path="discussions/:id" element={<DiscussionLinkPage />} />
          <Route path="outcomes/:id" element={<OutcomeLinkPage />} />
          {/* A native Result opens its folder's Results tab at the block. */}
          <Route path="results/:id" element={<ResultLinkPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/archived-work" element={<ArchivedWorkPage />} />
          <Route path="stats" element={<StatsPage />} />
          {/* The old People address lands in Settings. */}
          <Route path="people" element={<Navigate to={`${paths.settings}#people`} replace />} />
          {retiredPaths.map(({ from, to }) => (
            <Route
              key={from}
              // The table's paths are absolute and this Route is nested, so strip "/app/".
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
