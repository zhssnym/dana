/*
9.1's route table as a router, in React Router's library mode and nothing else.

11.15 records that importing loader, action or framework-mode APIs is a
defect, and this file is where that would happen if it happened anywhere. So
the routing is `BrowserRouter`, `Routes` and `Route`: components, no data
APIs, nothing that could grow a loader by accident. Data belongs to the query
layer, and the query layer is `api/`.

The chrome wraps every /app path and nothing else. `/` is the landing page of
9.2, which is public, carries no chrome, and is the one route 9.1 says does
not fall back to the cached shell.
*/
import { BrowserRouter, Route, Routes } from 'react-router'

import { AllPage } from './pages/AllPage.js'
import { DonePage } from './pages/DonePage.js'
import { FolderPage } from './pages/FolderPage.js'
import { ImportantPage } from './pages/ImportantPage.js'
import { LandingPage } from './pages/LandingPage.js'
import { MyDayPage } from './pages/MyDayPage.js'
import { NotFoundPage } from './pages/NotFoundPage.js'
import { PeoplePage } from './pages/PeoplePage.js'
import { PlannedPage } from './pages/PlannedPage.js'
import { SettingsPage } from './pages/SettingsPage.js'
import { TasksPage } from './pages/TasksPage.js'
import { AppLayout } from './shell/AppLayout.js'

export function Router(): React.JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<AppLayout />}>
          {/* My Day is the index of /app rather than /app/my-day, because 10.6
              fixes start_url there and a separate path would leave the
              installed app opening on a redirect. */}
          <Route index element={<MyDayPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="planned" element={<PlannedPage />} />
          <Route path="important" element={<ImportantPage />} />
          <Route path="all" element={<AllPage />} />
          <Route path="done" element={<DonePage />} />
          <Route path="folders/:id" element={<FolderPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="people" element={<PeoplePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
