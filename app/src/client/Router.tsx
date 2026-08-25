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

**The v2 table landed at S9** (RFC 0005's replacement of 9.1). Three things
about it are worth reading before changing a line.

**Desk is the index of /app**, where My Day used to be, because 10.6 fixes the
installed app's start_url there. It renders the account's default folder,
which is what 9.1 means by "/app renders Desk, the account's default folder".
The folder's id is not in the path, so the page finds it from the folder list
rather than from the URL, and that is the one page in this table whose
identity is data rather than an address.

**The two retired paths redirect rather than 404**, which 9.1 states in terms
and gives its reason: bookmarks exist. `Navigate` with `replace` so the old
address does not sit in the history behind the new one, which would make the
back button bounce off it.

**Three pages here are interim and say so.** Today, Scheduled and Anytime
render the v1 pages whose queries are exactly theirs, because section 6's
queries did not move: Q1 is Today, Q3 is Scheduled, Q2 is Anytime. The v2
drawings for all three are S10's, and this table is what S10 rewires; the
pages are named in the JSX beside each so that nobody reads the presence of a
route as the presence of its screen.
*/
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { AllPage } from './pages/AllPage.js'
import { DeskPage } from './pages/DeskPage.js'
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
import { TrashPage } from './pages/TrashPage.js'
import { paths, retiredPaths } from './routes.js'
import { AppShell } from './shell/app-shell.js'

export function Router(): React.JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={paths.landing} element={<LandingPage />} />
        <Route path="/app" element={<AppShell />}>
          {/* Desk, the default folder and the installed app's start_url. */}
          <Route index element={<DeskPage />} />
          {/* Today: section 6's Q1, the page S10 redraws. */}
          <Route path="today" element={<MyDayPage />} />
          {/* Scheduled: Q3, list mode; the calendar mode is `?mode=`. */}
          <Route path="scheduled" element={<PlannedPage />} />
          {/* Anytime: Q2, the undated open tasks. */}
          <Route path="anytime" element={<TasksPage />} />
          <Route path="important" element={<ImportantPage />} />
          <Route path="all" element={<AllPage />} />
          <Route path="done" element={<DonePage />} />
          <Route path="trash" element={<TrashPage />} />
          <Route path="folders/:id" element={<FolderPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="people" element={<PeoplePage />} />
          {retiredPaths.map(({ from, to }) => (
            <Route
              key={from}
              // The table's paths are absolute and this Route is nested, so
              // the child path is what follows "/app/"; "/app/tasks" is
              // "tasks". Written from the table rather than spelled twice.
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
